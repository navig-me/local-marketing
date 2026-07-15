import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { banner, heading, spinner, success, info, summaryBox, chalk } from "./ui.js";
import { FriendlyError } from "./util.js";

// ~/.agents/skills is the shared, cross-agent location defined by the open
// Agent Skills standard (agentskills.io, published Dec 2025) — Codex CLI,
// Gemini CLI, Cursor, GitHub Copilot, Rovo Dev, and 30+ other tools all read
// from it, so one install here covers all of them automatically. Claude
// Code still looks specifically at ~/.claude/skills by default, so it gets
// its own copy (plus native slash commands, which nothing else standardizes).
const UNIVERSAL_SKILLS_DIR = () => path.join(os.homedir(), ".agents", "skills", "local-marketing");

const AGENT_TARGETS = {
  claude_code: {
    label: "Claude Code",
    installDir: () => path.join(os.homedir(), ".claude", "skills", "local-marketing"),
  },
  codex_cli: {
    label: "Codex CLI",
    installDir: UNIVERSAL_SKILLS_DIR,
  },
  universal: {
    label: "Other (Gemini CLI, Cursor, GitHub Copilot, etc.) — installs to the shared ~/.agents/skills location",
    installDir: UNIVERSAL_SKILLS_DIR,
  },
};

export async function installFlow({ pkgRoot, skillRoot }) {
  banner();
  heading("Which AI agent are you using?");
  const keys = Object.keys(AGENT_TARGETS);
  keys.forEach((k, i) => console.log(chalk.dim(`  ${i + 1}. `) + AGENT_TARGETS[k].label));

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(chalk.bold(`\nChoose one or more (for example, 1,2) `) + chalk.dim(`[1]: `))).trim();
  rl.close();

  const selectedKeys = parseSelections(answer, keys);
  const selectedTargets = selectedKeys.map((key) => ({ key, ...AGENT_TARGETS[key] }));

  const installedDirs = new Set();
  for (const target of selectedTargets) {
    const dest = target.installDir();
    if (installedDirs.has(dest)) continue;
    const s = spinner("Copying the skill onto your machine...").start();
    fs.mkdirSync(dest, { recursive: true });
    copyDir(skillRoot, dest, { skip: ["commands"] });
    s.succeed("Installed the skill.");
    installedDirs.add(dest);
  }

  const nextSteps = [];
  const commandsSrc = path.join(skillRoot, "commands");

  if (selectedKeys.includes("claude_code")) {
    const cmdSpinner = spinner("Adding /local-marketing:* slash commands...").start();
    const commandsDest = path.join(os.homedir(), ".claude", "commands", "local-marketing");
    fs.mkdirSync(commandsDest, { recursive: true });
    copyDir(commandsSrc, commandsDest);
    cmdSpinner.succeed("Slash commands installed.");
    nextSteps.push(
      "Claude Code will pick up the skill automatically on relevant requests.",
      `Or use explicit commands: ${chalk.cyan("/local-marketing:init")}, ${chalk.cyan(":review")}, ${chalk.cyan(":send")}, etc.`
    );
  }

  if (selectedKeys.includes("codex_cli")) {
    const cmdSpinner = spinner("Adding /local-marketing-* custom prompts...").start();
    const promptsDest = path.join(os.homedir(), ".codex", "prompts");
    fs.mkdirSync(promptsDest, { recursive: true });
    for (const file of fs.readdirSync(commandsSrc)) {
      const destName = `local-marketing-${file}`;
      fs.copyFileSync(path.join(commandsSrc, file), path.join(promptsDest, destName));
    }
    cmdSpinner.succeed("Custom prompts installed.");
    nextSteps.push(
      "Codex CLI will also pick up the skill automatically on relevant requests (via ~/.agents/skills).",
      `Or use explicit commands: ${chalk.cyan("/local-marketing-init")}, ${chalk.cyan("/local-marketing-review")}, ${chalk.cyan("/local-marketing-send")}, etc.`
    );
  }

  if (selectedKeys.includes("universal")) {
    nextSteps.push(
      "Installed to the shared ~/.agents/skills location — picked up automatically by Gemini CLI, Cursor, GitHub Copilot, and other tools that support the open Agent Skills standard.",
      "No slash commands for this target yet — the skill activates automatically when relevant, or ask your agent to run it directly."
    );
  }

  summaryBox(chalk.bold("Ready to go 🎉"), [
    `Installed to: ${[...installedDirs].join(", ")}`,
    "",
    ...nextSteps,
    "",
    chalk.bold("Next: set up your project"),
    chalk.cyan(`  npx @navig-me/local-marketing init`),
    "",
    chalk.dim("To update later:"),
    chalk.cyan(`  npx @navig-me/local-marketing@latest install`),
  ]);
}

function parseSelections(answer, keys) {
  if (answer === "") return [keys[0]];

  const selections = answer.split(",").map((selection) => selection.trim());
  const indexes = selections.map((selection) => Number(selection));
  const invalid = selections.some((selection, index) => !/^\d+$/.test(selection) || indexes[index] < 1 || indexes[index] > keys.length);

  if (invalid) {
    throw new FriendlyError(
      "I couldn't understand that selection.",
      `Enter one or more numbers from 1 to ${keys.length}, separated by commas - for example, 1,2.`
    );
  }

  return [...new Set(indexes.map((index) => keys[index - 1]))];
}

function copyDir(src, dest, { skip = [] } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

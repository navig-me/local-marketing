import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { banner, heading, spinner, success, info, summaryBox, chalk } from "./ui.js";

const AGENT_TARGETS = {
  claude_code: {
    label: "Claude Code",
    installDir: () => path.join(os.homedir(), ".claude", "skills", "local-marketing"),
  },
  generic: {
    label: "Generic (any CLI agent that reads markdown + runs bash) — Codex CLI, Gemini CLI, etc.",
    installDir: () => path.join(os.homedir(), ".agent-skills", "local-marketing"),
  },
};

export async function installFlow({ pkgRoot, skillRoot }) {
  banner();
  heading("Which AI agent are you using?");
  const keys = Object.keys(AGENT_TARGETS);
  keys.forEach((k, i) => console.log(chalk.dim(`  ${i + 1}. `) + AGENT_TARGETS[k].label));

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(chalk.bold(`\nChoose 1-${keys.length} `) + chalk.dim(`[1]: `))).trim();
  rl.close();

  const idx = answer === "" ? 0 : parseInt(answer, 10) - 1;
  const key = keys[idx] ?? keys[0];
  const target = AGENT_TARGETS[key];
  const dest = target.installDir();

  const s = spinner("Copying the skill onto your machine...").start();
  fs.mkdirSync(dest, { recursive: true });
  copyDir(skillRoot, dest);
  s.succeed("Installed.");

  const nextSteps =
    key === "claude_code"
      ? ["Claude Code will pick this up automatically — nothing else to configure."]
      : ["Point your agent at this folder's SKILL.md as its instructions entrypoint."];

  summaryBox(chalk.bold("Ready to go 🎉"), [
    `Installed to: ${dest}`,
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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

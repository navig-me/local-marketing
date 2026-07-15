import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log("local-marketing installer\n");
  console.log("Which agent should this be installed for?");
  const keys = Object.keys(AGENT_TARGETS);
  keys.forEach((k, i) => console.log(`  ${i + 1}. ${AGENT_TARGETS[k].label}`));
  const answer = (await rl.question(`Choose 1-${keys.length} [1]: `)).trim();
  rl.close();

  const idx = answer === "" ? 0 : parseInt(answer, 10) - 1;
  const key = keys[idx] ?? keys[0];
  const target = AGENT_TARGETS[key];
  const dest = target.installDir();

  fs.mkdirSync(dest, { recursive: true });
  copyDir(skillRoot, dest);

  console.log(`\nInstalled local-marketing (agent-agnostic core, fully functional for any target) to:`);
  console.log(`  ${dest}`);
  if (key === "claude_code") {
    console.log("\nClaude Code will pick this up automatically as a skill named 'local-marketing'.");
  } else {
    console.log("\nPoint your agent at this folder's SKILL.md as its instructions entrypoint.");
  }
  console.log("\nNext: run `npx local-marketing init` inside the project you want to market.");
  console.log("To update later, re-run `npx local-marketing@latest install`.");
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

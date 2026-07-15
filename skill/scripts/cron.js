import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chalk, success, info } from "./ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(__dirname, "..", "..", "bin", "local-marketing.js");

// Marker comments so re-running init for the same project replaces its
// block instead of duplicating entries, and never touches other projects'
// or the user's unrelated crontab lines.
const START_MARKER = (slug) => `# >>> local-marketing:${slug} >>>`;
const END_MARKER = (slug) => `# <<< local-marketing:${slug} <<<`;

export async function installCron({ dataDir, slug, interactive }) {
  const block = buildCronBlock({ dataDir, slug });

  console.log(chalk.dim("\n  Here's what it will do, and when:\n"));
  console.log(chalk.dim(indent(block)));

  if (!interactive) {
    console.log();
    info(`Not installed automatically this time. Install it later with:`);
    info(chalk.cyan(`  node "${binPath}" cron-install "${dataDir}"`));
    return;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(chalk.bold(`\n  Turn this on now? `) + chalk.dim("[Y/n]: "))).trim().toLowerCase();
  rl.close();
  if (answer === "n" || answer === "no") {
    info(`Skipped. Turn it on later by re-running setup, or ask to run "cron-install".`);
    return;
  }

  writeCronBlock(slug, block);
  success(`Automatic schedule is on. (Advanced: \`crontab -l\` to view it, \`crontab -e\` to edit it.)`);
}

function buildCronBlock({ dataDir, slug }) {
  const cmd = (sub) => `node "${binPath}" ${sub} "${dataDir}"`;
  return [
    START_MARKER(slug),
    `0 8 * * MON ${cmd("research")}`,
    `0 9 * * * ${cmd("draft")}`,
    `0 10 * * * ${cmd("send")}`,
    `0 * * * * ${cmd("triage")}`,
    `0 9 * * MON ${cmd("report")}`,
    END_MARKER(slug),
  ].join("\n");
}

function writeCronBlock(slug, block) {
  let existing = "";
  try {
    existing = execFileSync("crontab", ["-l"], { encoding: "utf8" });
  } catch {
    existing = ""; // no crontab yet
  }

  const lines = existing.split("\n");
  const startIdx = lines.indexOf(START_MARKER(slug));
  const endIdx = lines.indexOf(END_MARKER(slug));

  let newLines;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    newLines = [...lines.slice(0, startIdx), ...block.split("\n"), ...lines.slice(endIdx + 1)];
  } else {
    newLines = [...lines.filter((l) => l.trim() !== ""), "", ...block.split("\n")];
  }

  const newCrontab = newLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  execFileSync("crontab", ["-"], { input: newCrontab });
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => "  " + l)
    .join("\n");
}

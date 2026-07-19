import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin, stdout, execPath } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chalk, success, info } from "./ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cronNodeBin = path.dirname(execPath);

// Cron entries must never point at a file path that can disappear between
// runs. A path resolved via __dirname is fine for a global `npm install -g`,
// but when this command was itself invoked through `npx` (no persistent
// install), __dirname resolves inside npm's ephemeral npx cache
// (~/.npm/_npx/<hash>/...), which npm can prune at any time — that would
// silently break every scheduled job with no warning. Detect that case and
// use a pinned `npx @navig-me/local-marketing@<version>` invocation instead,
// which re-fetches on demand rather than depending on a specific file
// surviving. The version is pinned to what's current right now (not
// @latest) so cron doesn't silently auto-update between runs — matches the
// project's "explicit updates only" design.
function resolveCronCommandPrefix() {
  const localBin = path.resolve(__dirname, "..", "..", "bin", "local-marketing.js");
  const isEphemeralNpx = __dirname.includes(`${path.sep}_npx${path.sep}`);

  if (!isEphemeralNpx && fs.existsSync(localBin)) {
    return `node "${localBin}"`;
  }

  const pkgJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const { name, version } = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  return `npx --yes ${name}@${version}`;
}

const cronCommandPrefix = resolveCronCommandPrefix();

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
    info(chalk.cyan(`  npx @navig-me/local-marketing cron-install "${dataDir}"`));
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

export async function uninstallCron({ slug }) {
  let existing = "";
  try {
    existing = execFileSync("crontab", ["-l"], { encoding: "utf8" });
  } catch {
    info("No automatic schedule is running for this project (no crontab at all).");
    return;
  }

  const lines = existing.split("\n");
  const startIdx = lines.indexOf(START_MARKER(slug));
  const endIdx = lines.indexOf(END_MARKER(slug));

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    info(`No automatic schedule is currently on for "${slug}".`);
    return;
  }

  const newLines = [...lines.slice(0, startIdx), ...lines.slice(endIdx + 1)];
  const newCrontab = newLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  execFileSync("crontab", ["-"], { input: newCrontab });
  success(`Automatic schedule turned off for "${slug}". Nothing runs on its own until you turn it back on.`);
}

export function buildCronBlock({ dataDir, slug }) {
  // cron never inherits the user's shell environment (no .zshrc/.bashrc
  // sourcing), so SMTP secrets exported there are invisible here. If the
  // project has a <dataDir>/.env (created per docs/SMTP_SETUP.md, already
  // gitignored by init.js), source it before running — this is the only
  // way scheduled send/research/draft/triage can see the credentials.
  // It also has a minimal PATH, so preserve the Node runtime that installed
  // this schedule. This supports Node managed by nvm, fnm, and similar tools.
  const cmd = (sub) => {
    const logPath = `${dataDir}/logs/cron-${sub}.log`;
    const inner = `set -a; [ -f "${dataDir}/.env" ] && . "${dataDir}/.env"; set +a; PATH="${cronNodeBin}:/usr/local/bin:/usr/bin:/bin"; export PATH; mkdir -p "${dataDir}/logs"; ${cronCommandPrefix} ${sub} "${dataDir}" >> "${logPath}" 2>&1`;
    return `/bin/sh -c '${inner}'`;
  };
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

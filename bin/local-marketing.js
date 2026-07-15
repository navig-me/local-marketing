#!/usr/bin/env node
import { Command } from "commander";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");
const skillRoot = path.join(pkgRoot, "skill");

const program = new Command();
program
  .name("local-marketing")
  .description("Local-only marketing skill installer + CLI")
  .version(JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"))).version);

program
  .command("install")
  .description("Install this skill into an agent's skill directory (asks which agent)")
  .action(async () => {
    const { installFlow } = await import("../skill/scripts/install.js");
    await installFlow({ pkgRoot, skillRoot });
  });

program
  .command("init")
  .description("Run the init interview and scaffold a local data directory")
  .action(async () => {
    const { init } = await import("../skill/scripts/init.js");
    await init({ skillRoot });
  });

program
  .command("review")
  .description("List pending drafts and explain how to approve them")
  .argument("[dataDir]", "path to the marketing data directory")
  .action(async (dataDir) => {
    const { review } = await import("../skill/scripts/review.js");
    await review({ dataDir });
  });

program
  .command("approve")
  .description("Approve a draft: move it from pending_review/ to approved/")
  .argument("<file>", "path to the draft file inside pending_review/")
  .action(async (file) => {
    const { approve } = await import("../skill/scripts/approve.js");
    await approve({ file });
  });

program
  .command("research")
  .description("Score human-curated candidate prospects against the active segment brief")
  .argument("[dataDir]", "path to the marketing data directory")
  .option("--segment <id>", "segment id to score (defaults to the active segment)")
  .action(async (dataDir, opts) => {
    const { research } = await import("../skill/scripts/research.js");
    await research({ dataDir, segmentId: opts.segment });
  });

program
  .command("draft")
  .description("Write outreach drafts for qualified prospects into pending_review/")
  .argument("[dataDir]", "path to the marketing data directory")
  .option("--segment <id>", "restrict to one segment id")
  .action(async (dataDir, opts) => {
    const { draft } = await import("../skill/scripts/draft.js");
    await draft({ dataDir, segmentId: opts.segment });
  });

program
  .command("triage")
  .description("Poll the SMTP provider API for replies/bounces and classify them")
  .argument("[dataDir]", "path to the marketing data directory")
  .action(async (dataDir) => {
    const { triage } = await import("../skill/scripts/triage.js");
    await triage({ dataDir });
  });

program
  .command("send")
  .description("Check the circuit breaker and send everything due today from approved/")
  .argument("[dataDir]", "path to the marketing data directory")
  .action(async (dataDir) => {
    const { send } = await import("../skill/scripts/send.js");
    await send({ dataDir });
  });

program
  .command("report")
  .description("Roll up the week's funnel and email the report to the admin")
  .argument("[dataDir]", "path to the marketing data directory")
  .action(async (dataDir) => {
    const { report } = await import("../skill/scripts/report.js");
    await report({ dataDir });
  });

if (process.argv.includes("--postinstall-noop")) {
  process.exit(0);
}

program.parseAsync(process.argv);

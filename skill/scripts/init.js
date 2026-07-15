import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { openDb } from "./db.js";
import { registerProject } from "./registry.js";
import { installCron } from "./cron.js";
import { banner, heading, spinner, success, info, summaryBox, kv, chalk } from "./ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COPY_INSTRUCTIONS_FILE = "copy-instructions.md";
const MARKETING_PLAN_FILE = "MARKETING_PLAN.md";

// This does NOT run the conversational interview — that's the calling agent's
// job (see SKILL.md "Init interview"). This scaffolds the data directory once
// the agent has collected answers into a config object and passes it via the
// CLI's --answers JSON file option, or falls back to writing empty templates
// the agent can then fill in and re-run.
export async function init({ skillRoot, answersPath }) {
  banner();

  const exampleConfigPath = path.join(skillRoot, "config", "config.example.yaml");
  const exampleConfig = yaml.load(fs.readFileSync(exampleConfigPath, "utf8"));

  let config = exampleConfig;
  let copyInstructions = "";
  let marketingPlan = "";
  if (answersPath && fs.existsSync(answersPath)) {
    const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
    ({ copy_instructions: copyInstructions = "", marketing_plan: marketingPlan = "", ...config } = answers);
    config = deepMerge(exampleConfig, config);
  }

  // `init` is also a useful direct CLI command. When no agent interview has
  // supplied an explicit data directory, use the folder the user is working
  // in instead of creating an unrelated ~/marketing/unnamed-project folder.
  const isDirectInit = !answersPath;
  const dataDir = config.project?.data_dir || (isDirectInit
    ? process.cwd()
    : path.join(process.env.HOME, "marketing", config.project?.slug || "unnamed-project"));
  const slug = config.project?.slug || path.basename(dataDir);

  const existingConfigPath = path.join(dataDir, "config.yaml");
  const isExisting = fs.existsSync(existingConfigPath);
  if (isExisting) {
    const backupPath = path.join(dataDir, `config.yaml.bak-${Date.now()}`);
    fs.copyFileSync(existingConfigPath, backupPath);
    heading("Updating an existing project");
    info(`This project was already set up at ${dataDir}.`);
    info(`Its previous settings are backed up at ${path.basename(backupPath)} before anything is overwritten.`);
    info(`Prospects, drafts, and send history in the database are untouched either way.`);
  } else {
    heading("Setting things up");
  }
  const scaffoldSpinner = spinner("Creating your local project folder and database...").start();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "pending_review"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "approved"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "segments"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "reports"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "tasks"), { recursive: true });

  config.project = { ...config.project, slug, data_dir: dataDir };
  fs.writeFileSync(path.join(dataDir, "config.yaml"), yaml.dump(config));
  writeIfMissing(path.join(dataDir, COPY_INSTRUCTIONS_FILE), copyInstructions || copyInstructionsTemplate());
  writeIfMissing(path.join(dataDir, MARKETING_PLAN_FILE), marketingPlan || marketingPlanTemplate(config));

  const db = openDb(dataDir);
  db.close();

  const gitignore = ["*.sqlite3", "*.sqlite3-*", ".env", "*.env"].join("\n") + "\n";
  fs.writeFileSync(path.join(dataDir, ".gitignore"), gitignore);
  scaffoldSpinner.succeed("Your local project folder and database are ready.");

  const passwordVar = config.smtp?.password_env_var || "LOCAL_MARKETING_SMTP_PASSWORD";
  const apiKeyVar = config.smtp?.api_key_env_var || "LOCAL_MARKETING_SMTP_API_KEY";

  const regSpinner = spinner("Remembering this project so you don't have to type its location again...").start();
  const registry = registerProject(slug, dataDir, { makeDefault: true });
  const isDefault = registry.defaultSlug === slug;
  if (isDefault) {
    regSpinner.succeed("Saved. From now on, commands will use this project automatically.");
  }

  heading("Automatic schedule");
  info("This is the schedule that runs research, drafting, sending, and reporting for you —");
  info("without it, nothing happens automatically and you'd have to run each step by hand.");
  await installCron({ dataDir, slug, interactive: !answersPath });

  summaryBox(chalk.bold("You're set up! 🎉"), [
    kv("Project", config.project?.name || slug),
    kv("Saved to", dataDir),
    "",
    chalk.bold("Before anything can send, add these two secrets:"),
    `  export ${passwordVar}="..."`,
    `  export ${apiKeyVar}="..."`,
    chalk.dim("(get these from your email provider — see skill/docs/SMTP_SETUP.md)"),
    "",
    chalk.bold("Nothing sends without your OK:"),
    chalk.dim("Every email is written to a folder first. You (or the agent, with you") ,
    chalk.dim("watching) review and approve each one before it ever goes out."),
  ]);

  return { dataDir, config };
}

function deepMerge(base, overrides) {
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, `${content.trim()}\n`);
}

function copyInstructionsTemplate() {
  return `# Copy instructions

This is the durable source of truth for email-specific preferences. Every
interactive and scheduled draft uses it. Keep requests compatible with the
non-negotiable safety rules in the local-marketing copy playbook.

## Voice and tone

- Add the agreed voice, vocabulary, and formality preferences here.

## Positioning and proof

- Add approved value propositions, proof points, and claims here.
- Claims must be verifiable in project materials or approved by the user.

## Do and do not

- Add required phrases, prohibited phrases, CTA preferences, and formatting rules here.`;
}

function marketingPlanTemplate(config) {
  const name = config.project?.name || config.project?.slug || "this project";
  return `# Marketing plan: ${name}

Complete this plan through the agent-led init interview before outreach begins.

## Positioning

## Ideal customer profile

## Prioritized segments

## Offer and call to action

## Outreach approach

## Proof and claim policy

## Metrics and review cadence`;
}

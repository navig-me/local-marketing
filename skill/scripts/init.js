import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { openDb } from "./db.js";
import { registerProject } from "./registry.js";
import { installCron } from "./cron.js";
import { banner, heading, spinner, success, info, summaryBox, kv, chalk } from "./ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This does NOT run the conversational interview — that's the calling agent's
// job (see SKILL.md "Init interview"). This scaffolds the data directory once
// the agent has collected answers into a config object and passes it in via
// a JSON file at process.argv[2], or falls back to writing an empty template
// the agent can then fill in and re-run.
export async function init({ skillRoot, answersPath }) {
  banner();

  const exampleConfigPath = path.join(skillRoot, "config", "config.example.yaml");
  const exampleConfig = yaml.load(fs.readFileSync(exampleConfigPath, "utf8"));

  let config = exampleConfig;
  if (answersPath && fs.existsSync(answersPath)) {
    const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
    config = deepMerge(exampleConfig, answers);
  }

  const dataDir = config.project?.data_dir || path.join(process.env.HOME, "marketing", config.project?.slug || "unnamed-project");

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

  config.project = { ...config.project, data_dir: dataDir };
  fs.writeFileSync(path.join(dataDir, "config.yaml"), yaml.dump(config));

  const db = openDb(dataDir);
  db.close();

  const gitignore = ["*.sqlite3", "*.sqlite3-*", ".env", "*.env"].join("\n") + "\n";
  fs.writeFileSync(path.join(dataDir, ".gitignore"), gitignore);
  scaffoldSpinner.succeed("Your local project folder and database are ready.");

  const passwordVar = config.smtp?.password_env_var || "LOCAL_MARKETING_SMTP_PASSWORD";
  const apiKeyVar = config.smtp?.api_key_env_var || "LOCAL_MARKETING_SMTP_API_KEY";

  const slug = config.project?.slug || path.basename(dataDir);
  const regSpinner = spinner("Remembering this project so you don't have to type its location again...").start();
  const registry = registerProject(slug, dataDir);
  const isDefault = registry.defaultSlug === slug;
  if (isDefault) {
    regSpinner.succeed("Saved. From now on, commands will use this project automatically.");
  } else {
    regSpinner.warn(`Saved, but "${registry.defaultSlug}" is still your default project (you have more than one set up).`);
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

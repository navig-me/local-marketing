import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { openDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This does NOT run the conversational interview — that's the calling agent's
// job (see SKILL.md "Init interview"). This scaffolds the data directory once
// the agent has collected answers into a config object and passes it in via
// a JSON file at process.argv[2], or falls back to writing an empty template
// the agent can then fill in and re-run.
export async function init({ skillRoot, answersPath }) {
  const exampleConfigPath = path.join(skillRoot, "config", "config.example.yaml");
  const exampleConfig = yaml.load(fs.readFileSync(exampleConfigPath, "utf8"));

  let config = exampleConfig;
  if (answersPath && fs.existsSync(answersPath)) {
    const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
    config = deepMerge(exampleConfig, answers);
  }

  const dataDir = config.project?.data_dir || path.join(process.env.HOME, "marketing", config.project?.slug || "unnamed-project");
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

  console.log(`Scaffolded local-marketing data directory at: ${dataDir}`);
  console.log(`  - config.yaml`);
  console.log(`  - local-marketing.sqlite3 (schema initialized)`);
  console.log(`  - pending_review/, approved/, segments/, reports/, tasks/`);
  console.log(`\nSet these environment variables before sending:`);
  console.log(`  ${config.smtp?.password_env_var || "LOCAL_MARKETING_SMTP_PASSWORD"}`);
  console.log(`  ${config.smtp?.api_key_env_var || "LOCAL_MARKETING_SMTP_API_KEY"}`);

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

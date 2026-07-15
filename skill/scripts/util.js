import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export function resolveDataDir(dataDir) {
  if (dataDir) return path.resolve(dataDir);
  // Fall back to cwd if it looks like a data dir (has config.yaml)
  if (fs.existsSync(path.join(process.cwd(), "config.yaml"))) return process.cwd();
  throw new Error("Pass the data directory explicitly, or run this from inside it.");
}

export function loadConfig(dataDir) {
  const configPath = path.join(dataDir, "config.yaml");
  return yaml.load(fs.readFileSync(configPath, "utf8"));
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

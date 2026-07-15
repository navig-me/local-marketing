import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { getDefaultDataDir, readRegistry } from "./registry.js";
import { chalk } from "./ui.js";

// An error meant to be read by a non-technical user: a plain-language
// "what happened" plus a concrete "what to do next" — no stack traces,
// no jargon like "path" or "ENOENT" surfaced directly.
export class FriendlyError extends Error {
  constructor(message, nextStep) {
    super(message);
    this.name = "FriendlyError";
    this.nextStep = nextStep;
  }
}

export function resolveDataDir(dataDir) {
  if (dataDir) return path.resolve(dataDir);

  // Fall back to cwd if it looks like a data dir (has config.yaml)
  if (fs.existsSync(path.join(process.cwd(), "config.yaml"))) return process.cwd();

  // Fall back to the default project registered by the most recent `init`
  // (or whichever project was marked default) at ~/.local-marketing/projects.json.
  // Since this is an implicit choice the user didn't type, always announce it —
  // this is the one place a command could silently act on the wrong project if
  // more than one is set up on this machine.
  const defaultDir = getDefaultDataDir();
  if (defaultDir && fs.existsSync(path.join(defaultDir, "config.yaml"))) {
    const registry = readRegistry();
    const projectCount = Object.keys(registry.projects).length;
    const label = registry.defaultSlug || path.basename(defaultDir);
    if (projectCount > 1) {
      console.log(
        chalk.dim(`  Using project "${label}" (${defaultDir}) — you have ${projectCount} projects set up; pass a path to use a different one.\n`)
      );
    } else {
      console.log(chalk.dim(`  Using project "${label}" (${defaultDir})\n`));
    }
    return defaultDir;
  }

  throw new FriendlyError(
    "I can't find a local-marketing project to work with yet.",
    "Run the setup command first: npx @navig-me/local-marketing init — it will ask you a few questions and set everything up. After that, this command will just work without needing a path."
  );
}

export function loadConfig(dataDir) {
  const configPath = path.join(dataDir, "config.yaml");
  return yaml.load(fs.readFileSync(configPath, "utf8"));
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new FriendlyError(
      `I need your email password/API key to do this, but it's not set up yet.`,
      `Set it once in your terminal with: export ${name}="your-password-here" (see skill/docs/SMTP_SETUP.md if you're not sure where to get it), then try again.`
    );
  }
  return v;
}

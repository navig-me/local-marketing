import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spinner, success, info, chalk } from "./ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lightweight, explicit check only — never installs anything itself.
// Per design: no silent auto-update, given the SMTP-sending risk surface.
export async function checkUpdate({ pkgRoot }) {
  const pkgJsonPath = path.join(pkgRoot, "package.json");
  const { name, version } = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

  const s = spinner("Checking for updates...").start();
  let latest;
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}/latest`);
    if (!res.ok) throw new Error(`registry returned ${res.status}`);
    const data = await res.json();
    latest = data.version;
  } catch (err) {
    s.fail(`Couldn't check for updates: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (latest === version) {
    s.succeed(`You're on the latest version (v${version}).`);
    return;
  }

  s.warn(`A newer version is out: v${version} → v${latest}`);
  info(chalk.cyan(`Update with: npx ${name}@latest install`));
}

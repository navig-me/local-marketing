import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lightweight, explicit check only — never installs anything itself.
// Per design: no silent auto-update, given the SMTP-sending risk surface.
export async function checkUpdate({ pkgRoot }) {
  const pkgJsonPath = path.join(pkgRoot, "package.json");
  const { name, version } = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

  let latest;
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}/latest`);
    if (!res.ok) throw new Error(`registry returned ${res.status}`);
    const data = await res.json();
    latest = data.version;
  } catch (err) {
    console.error(`Could not check for updates: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (latest === version) {
    console.log(`local-marketing is up to date (v${version}).`);
    return;
  }

  console.log(`A newer version is available: v${version} -> v${latest}`);
  console.log(`Update with: npx ${name}@latest install`);
}

import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./util.js";

export async function review({ dataDir }) {
  const dir = resolveDataDir(dataDir);
  const pendingDir = path.join(dir, "pending_review");
  if (!fs.existsSync(pendingDir)) {
    console.log(`No pending_review/ folder found at ${pendingDir}. Run init first.`);
    return;
  }
  const files = fs.readdirSync(pendingDir).filter((f) => !f.startsWith("."));
  if (files.length === 0) {
    console.log("No pending drafts.");
    return;
  }

  console.log(`${files.length} pending draft(s) in ${pendingDir}:\n`);
  for (const f of files) {
    const full = path.join(pendingDir, f);
    console.log(`--- ${f} ---`);
    console.log(fs.readFileSync(full, "utf8"));
    console.log(`\nTo approve: local-marketing approve "${full}"`);
    console.log(`  (this moves the file to ${path.join(dir, "approved", f)} — nothing sends until it's there)`);
    console.log(`To reject: delete the file, or leave it in place and it will never be sent.\n`);
  }
}

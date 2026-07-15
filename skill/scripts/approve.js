import fs from "node:fs";
import path from "node:path";

export async function approve({ file }) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`No such file: ${abs}`);
    process.exitCode = 1;
    return;
  }
  const pendingMarker = `${path.sep}pending_review${path.sep}`;
  if (!abs.includes(pendingMarker)) {
    console.error(`Refusing to approve a file outside pending_review/: ${abs}`);
    process.exitCode = 1;
    return;
  }
  const dest = abs.replace(pendingMarker, `${path.sep}approved${path.sep}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  console.log(`Moving:\n  ${abs}\n  -> ${dest}`);
  fs.renameSync(abs, dest);
  console.log(`Approved. The send agent only reads from approved/, so this is now eligible to send on its scheduled day.`);
}

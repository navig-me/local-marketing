import fs from "node:fs";
import path from "node:path";
import { info, success, warn, chalk } from "./ui.js";
import { FriendlyError } from "./util.js";

export async function approve({ file }) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new FriendlyError(`I can't find that draft.`, `Double-check the file path — run "review" to see the exact path for each pending draft.`);
  }
  const pendingMarker = `${path.sep}pending_review${path.sep}`;
  if (!abs.includes(pendingMarker)) {
    throw new FriendlyError(
      `That file isn't in a pending_review/ folder, so I won't touch it.`,
      `Only drafts sitting in pending_review/ can be approved this way — this is a safety check so nothing outside the review flow gets sent by accident.`
    );
  }
  const dest = abs.replace(pendingMarker, `${path.sep}approved${path.sep}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  info(`Moving this draft out of review and into the send queue:`);
  info(chalk.dim(`  from: ${abs}`));
  info(chalk.dim(`  to:   ${dest}`));
  fs.renameSync(abs, dest);
  success(`Approved — this will go out on its scheduled day.`);
}

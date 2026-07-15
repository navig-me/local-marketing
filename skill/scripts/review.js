import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./util.js";
import { heading, info, success, chalk } from "./ui.js";

export async function review({ dataDir }) {
  const dir = resolveDataDir(dataDir);
  const pendingDir = path.join(dir, "pending_review");
  if (!fs.existsSync(pendingDir)) {
    info("There's nothing to review yet — run \"draft\" first to write some outreach emails.");
    return;
  }
  const files = fs.readdirSync(pendingDir).filter((f) => !f.startsWith("."));
  if (files.length === 0) {
    success("Nothing waiting for review right now.");
    return;
  }

  heading(`${files.length} draft${files.length === 1 ? "" : "s"} waiting for your OK`);

  files.forEach((f, i) => {
    const full = path.join(pendingDir, f);
    const body = fs.readFileSync(full, "utf8");

    console.log(chalk.bold(`  [${i + 1}/${files.length}] ${f}`));
    console.log(
      chalk.dim("  ┌" + "─".repeat(60)) +
        "\n" +
        body
          .split("\n")
          .map((l) => chalk.dim("  │ ") + l)
          .join("\n") +
        "\n" +
        chalk.dim("  └" + "─".repeat(60))
    );
    console.log(chalk.green(`  To send this: `) + chalk.cyan(`local-marketing approve "${full}"`));
    console.log(chalk.dim(`  To skip it:   delete the file, or just leave it here — it will never send on its own.\n`));
  });
}

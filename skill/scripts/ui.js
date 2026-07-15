import chalk from "chalk";
import boxen from "boxen";
import ora from "ora";

const brand = chalk.hex("#7C5CFF");

export function banner() {
  console.log(
    "\n" +
      brand.bold("  ┌─────────────────────────────┐\n") +
      brand.bold("  │  local-marketing") + chalk.dim("  ·  setup") + brand.bold("   │\n") +
      brand.bold("  └─────────────────────────────┘\n") +
      chalk.dim("  Local-only outreach, run entirely on your machine.\n")
  );
}

export function heading(text) {
  console.log("\n" + chalk.bold.underline(text) + "\n");
}

export function info(text) {
  console.log(chalk.dim("  " + text));
}

export function success(text) {
  console.log(chalk.green("  ✓ ") + text);
}

export function warn(text) {
  console.log(chalk.yellow("  ! ") + text);
}

export function bullet(text) {
  console.log(chalk.dim("  • ") + text);
}

export function spinner(text) {
  return ora({ text, color: "magenta" });
}

export function summaryBox(title, lines) {
  const body = lines.join("\n");
  console.log(
    "\n" +
      boxen(body, {
        title,
        titleAlignment: "left",
        padding: 1,
        margin: { top: 0, bottom: 1, left: 1, right: 1 },
        borderColor: "magenta",
        borderStyle: "round",
      })
  );
}

export function kv(key, value) {
  return `${chalk.dim(key + ":")} ${chalk.white(value)}`;
}

export { chalk };

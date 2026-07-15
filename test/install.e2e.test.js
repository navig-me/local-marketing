import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { buildPrompt } from "../skill/scripts/draft.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cli = path.join(repoRoot, "bin", "local-marketing.js");

function runCli(args, { cwd, home, input }) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, HOME: home, NO_COLOR: "1" },
    input,
    encoding: "utf8",
  });
}

test("install accepts multiple targets and installs Claude and Codex integrations", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "local-marketing-install-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const result = runCli(["install"], { cwd: repoRoot, home, input: "1,2\n" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Choose one or more/);
  assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "local-marketing", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "local-marketing", "init.md")));
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "local-marketing", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "local-marketing-init.md")));
});

test("bare init uses the current directory and makes it the default project", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-marketing-init-"));
  const home = path.join(root, "home");
  const projectDir = path.join(root, "new-project");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(home, ".local-marketing"), { recursive: true });
  fs.writeFileSync(
    path.join(home, ".local-marketing", "projects.json"),
    JSON.stringify({ defaultSlug: "scout-select", projects: { "scout-select": "/tmp/scout-select" } })
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = runCli(["init"], { cwd: projectDir, home, input: "n\n" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Saved\. From now on, commands will use this project automatically\./);
  const config = yaml.load(fs.readFileSync(path.join(projectDir, "config.yaml"), "utf8"));
  assert.equal(config.project.slug, path.basename(projectDir));
  const resolvedProjectDir = fs.realpathSync(projectDir);
  assert.equal(config.project.data_dir, resolvedProjectDir);
  const registry = JSON.parse(fs.readFileSync(path.join(home, ".local-marketing", "projects.json"), "utf8"));
  assert.equal(registry.defaultSlug, path.basename(projectDir));
  assert.equal(registry.projects[path.basename(projectDir)], resolvedProjectDir);
  assert.ok(fs.existsSync(path.join(projectDir, "copy-instructions.md")));
  assert.ok(fs.existsSync(path.join(projectDir, "MARKETING_PLAN.md")));
});

test("agent-led init persists the agreed marketing plan and copy instructions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-marketing-guided-init-"));
  const home = path.join(root, "home");
  const projectDir = path.join(root, "guided-project");
  const answersPath = path.join(root, "answers.json");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    answersPath,
    JSON.stringify({
      project: { name: "Guided Project", slug: "guided-project", data_dir: projectDir },
      marketing_plan: "# Marketing plan\n\nPrioritize operators with manual workflows.",
      copy_instructions: "# Copy instructions\n\nUse a friendly, direct tone.",
    })
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = runCli(["init", "--answers", answersPath], { cwd: projectDir, home, input: "n\n" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(path.join(projectDir, "MARKETING_PLAN.md"), "utf8"), /Prioritize operators/);
  assert.match(fs.readFileSync(path.join(projectDir, "copy-instructions.md"), "utf8"), /friendly, direct/);
  const config = fs.readFileSync(path.join(projectDir, "config.yaml"), "utf8");
  assert.doesNotMatch(config, /copy_instructions|marketing_plan/);
});

test("draft prompts include approved copy instructions without relaxing copy rules", () => {
  const prompt = buildPrompt(
    "Never fabricate claims.",
    { business_name: "Acme", relevance_note: "Uses a manual process." },
    { offer: "Save time" },
    [1, 4],
    "Use a warm, concise tone. Never mention discounts."
  );

  assert.match(prompt, /Approved project copy instructions/);
  assert.match(prompt, /Use a warm, concise tone/);
  assert.match(prompt, /cannot relax safety, truthfulness, personalization, or approval requirements/);
});

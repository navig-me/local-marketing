import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const cli = path.join(repoRoot, "bin", "local-marketing.js");

test("install accepts multiple targets and installs Claude and Codex integrations", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "local-marketing-install-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, "install"], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, NO_COLOR: "1" },
    input: "1,2\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Choose one or more/);
  assert.ok(fs.existsSync(path.join(home, ".claude", "skills", "local-marketing", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(home, ".claude", "commands", "local-marketing", "init.md")));
  assert.ok(fs.existsSync(path.join(home, ".agents", "skills", "local-marketing", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(home, ".codex", "prompts", "local-marketing-init.md")));
});

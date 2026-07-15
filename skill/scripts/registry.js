import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Tracks known projects (data dirs) across the whole machine, so commands
// can be run without an explicit path. Lives outside any project's own data
// dir since it spans all of them.
const REGISTRY_PATH = path.join(os.homedir(), ".local-marketing", "projects.json");

export function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { defaultSlug: null, projects: {} };
  }
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

export function writeRegistry(registry) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// Registers/updates a project and makes it the default if none is set yet
// (or if there's currently only one project registered).
export function registerProject(slug, dataDir) {
  const registry = readRegistry();
  registry.projects[slug] = dataDir;
  if (!registry.defaultSlug || Object.keys(registry.projects).length === 1) {
    registry.defaultSlug = slug;
  }
  writeRegistry(registry);
  return registry;
}

export function getDefaultDataDir() {
  const registry = readRegistry();
  if (!registry.defaultSlug) return null;
  return registry.projects[registry.defaultSlug] || null;
}

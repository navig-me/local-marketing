import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { openDb } from "./db.js";
import { resolveDataDir, loadConfig } from "./util.js";
import { callLlm, extractJson } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Scores human-curated candidate rows against the active segment's brief.
// Never searches for new candidates itself — see skill/playbooks/research.md.
export async function research({ dataDir, segmentId }) {
  const dir = resolveDataDir(dataDir);
  const config = loadConfig(dir);
  const db = openDb(dir);
  const playbook = fs.readFileSync(path.join(__dirname, "..", "playbooks", "research.md"), "utf8");

  const segment = pickSegment(db, dir, segmentId);
  if (!segment) {
    console.log("No active segment found. Activate one in the segments table / segments/ folder first.");
    return;
  }

  const suppressed = new Set(db.prepare(`SELECT email FROM suppression`).all().map((r) => r.email));

  const cap = effectiveCap(segment, config);
  const candidates = db
    .prepare(`SELECT * FROM prospects WHERE segment_id = ? AND status = 'candidate' LIMIT ?`)
    .all(segment.id, cap);

  if (candidates.length === 0) {
    console.log(`No candidate prospects queued for segment "${segment.id}".`);
    return;
  }

  const toScore = candidates.filter((c) => !suppressed.has(c.email));
  const alreadySuppressed = candidates.filter((c) => suppressed.has(c.email));
  for (const c of alreadySuppressed) {
    db.prepare(`UPDATE prospects SET status='disqualified', disqualify_reason='suppressed', updated_at=datetime('now') WHERE id=?`).run(c.id);
  }

  if (toScore.length === 0) {
    console.log(`All ${candidates.length} queued candidates were already suppressed.`);
    return;
  }

  const prompt = buildPrompt(playbook, segment, toScore);
  console.log(`Scoring ${toScore.length} candidate(s) for segment "${segment.id}" via ${config.llm?.command || "claude"}...`);
  const raw = await callLlm(config, prompt);
  const results = extractJson(raw);

  if (!Array.isArray(results)) {
    throw new Error("Expected the LLM to return a JSON array of scoring results.");
  }

  const byId = new Map(toScore.map((c) => [c.id, c]));
  let qualified = 0;
  let disqualified = 0;
  let skipped = 0;

  for (const r of results) {
    const prospect = byId.get(r.prospect_id);
    if (!prospect) continue;

    if (r.status === "qualified") {
      db.prepare(
        `UPDATE prospects SET status='qualified', relevance_note=?, relevance_source=?, fit_score=?, updated_at=datetime('now') WHERE id=?`
      ).run(r.relevance_note || "", r.relevance_source || "", r.fit_score ?? null, prospect.id);
      qualified++;
    } else if (r.status === "disqualified") {
      db.prepare(
        `UPDATE prospects SET status='disqualified', disqualify_reason=?, updated_at=datetime('now') WHERE id=?`
      ).run(r.disqualify_reason || "unspecified", prospect.id);
      disqualified++;
    } else {
      // left as 'candidate' — not enough public info to score confidently
      skipped++;
    }
  }

  console.log(`Research done for "${segment.id}": ${qualified} qualified, ${disqualified} disqualified, ${skipped} left unscored.`);
}

function pickSegment(db, dir, segmentId) {
  if (segmentId) {
    return db.prepare(`SELECT * FROM segments WHERE id = ?`).get(segmentId);
  }
  return db.prepare(`SELECT * FROM segments WHERE status = 'active' ORDER BY activated_at LIMIT 1`).get();
}

function effectiveCap(segment, config) {
  const ramp = config.safety?.ramp_schedule || [5, 10, 15, 25];
  if (segment.ramp_week >= 0 && segment.ramp_week < ramp.length) {
    return ramp[segment.ramp_week];
  }
  return segment.weekly_new_prospect_cap;
}

function buildPrompt(playbook, segment, candidates) {
  const briefPath = segment.brief_path;
  let brief = {};
  try {
    brief = yaml.load(fs.readFileSync(briefPath, "utf8"));
  } catch {
    brief = { id: segment.id, name: segment.name };
  }

  return [
    playbook,
    "\n## Segment brief\n",
    yaml.dump(brief),
    "\n## Candidates to score\n",
    JSON.stringify(
      candidates.map((c) => ({
        prospect_id: c.id,
        business_name: c.business_name,
        website: c.website,
        source: c.source,
      })),
      null,
      2
    ),
    "\n\nRespond with ONLY a JSON array, one object per candidate, each shaped as:\n",
    JSON.stringify(
      {
        prospect_id: "number, matching input",
        status: "qualified | disqualified | candidate (leave as candidate if you cannot confidently score it)",
        relevance_note: "string, required if status=qualified",
        relevance_source: "URL backing the note, required if status=qualified",
        fit_score: "number 0-1, required if status=qualified",
        disqualify_reason: "string, required if status=disqualified",
      },
      null,
      2
    ),
  ].join("\n");
}

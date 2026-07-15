import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { openDb } from "./db.js";
import { resolveDataDir, loadConfig } from "./util.js";
import { callLlm, extractJson } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Writes the four-email sequence for newly-qualified prospects into
// pending_review/. Never sends — see skill/playbooks/copy-draft.md.
export async function draft({ dataDir, segmentId }) {
  const dir = resolveDataDir(dataDir);
  const config = loadConfig(dir);
  const db = openDb(dir);
  const playbook = fs.readFileSync(path.join(__dirname, "..", "playbooks", "copy-draft.md"), "utf8");

  const where = segmentId ? `AND segment_id = ?` : "";
  const params = segmentId ? [segmentId] : [];
  const qualified = db
    .prepare(
      `SELECT p.* FROM prospects p
       WHERE p.status = 'qualified' ${where}
       AND NOT EXISTS (SELECT 1 FROM sequence_state ss WHERE ss.prospect_id = p.id)
       AND p.relevance_note IS NOT NULL AND trim(p.relevance_note) != ''`
    )
    .all(...params);

  if (qualified.length === 0) {
    console.log("No newly-qualified prospects with a relevance note to draft for.");
    return;
  }

  const pendingDir = path.join(dir, "pending_review");
  fs.mkdirSync(pendingDir, { recursive: true });

  const cadenceDays = config.safety?.cadence_days || [1, 4, 9, 15];
  let written = 0;

  for (const prospect of qualified) {
    const segment = db.prepare(`SELECT * FROM segments WHERE id = ?`).get(prospect.segment_id);
    let brief = {};
    try {
      brief = yaml.load(fs.readFileSync(segment.brief_path, "utf8"));
    } catch {
      brief = { id: segment?.id, offer: "" };
    }

    const prompt = buildPrompt(playbook, prospect, brief, cadenceDays);
    console.log(`Drafting sequence for "${prospect.business_name}"...`);
    const raw = await callLlm(config, prompt);
    const emails = extractJson(raw);

    if (!Array.isArray(emails) || emails.length !== cadenceDays.length) {
      console.error(`  Skipping: expected ${cadenceDays.length} emails, got ${Array.isArray(emails) ? emails.length : "non-array"}.`);
      continue;
    }

    const slug = slugify(prospect.business_name);
    const dateStr = new Date().toISOString().slice(0, 10);

    emails.forEach((email, idx) => {
      const step = idx + 1;
      const fileName = `${dateStr}_${slug}_day${step}.md`;
      const filePath = path.join(pendingDir, fileName);
      const body = `Subject: ${email.subject}\n\n${email.body}\n`;
      fs.writeFileSync(filePath, body);

      const nextSendDate = new Date();
      nextSendDate.setDate(nextSendDate.getDate() + cadenceDays[idx]);

      db.prepare(
        `INSERT INTO sequence_state (prospect_id, step, next_send_date, status, draft_path)
         VALUES (?, ?, ?, 'drafted', ?)`
      ).run(prospect.id, step, nextSendDate.toISOString().slice(0, 10), filePath);
    });

    written += emails.length;
  }

  console.log(`\nWrote ${written} draft(s) into ${pendingDir}.`);
  console.log(`Nothing sends until you run "review" and "approve" each one (or move files to approved/ yourself).`);
}

function buildPrompt(playbook, prospect, brief, cadenceDays) {
  return [
    playbook,
    "\n## Prospect\n",
    JSON.stringify(
      {
        business_name: prospect.business_name,
        contact_name: prospect.contact_name,
        website: prospect.website,
        relevance_note: prospect.relevance_note,
        relevance_source: prospect.relevance_source,
      },
      null,
      2
    ),
    "\n## Segment brief / offer\n",
    yaml.dump(brief),
    `\n## Cadence\n\nWrite exactly ${cadenceDays.length} emails, for send-day offsets ${cadenceDays.join(", ")} (day 1 = first touch, grounded in relevance_note; later emails follow the reference cadence: useful insight/template, outcome/case study, polite close-the-loop).\n`,
    "\nRespond with ONLY a JSON array of exactly that many objects, in order, each shaped as:\n",
    JSON.stringify({ subject: "string", body: "string, plain text, 70-120 words for the first email" }, null, 2),
  ].join("\n");
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

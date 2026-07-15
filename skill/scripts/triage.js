import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.js";
import { resolveDataDir, loadConfig, requireEnv } from "./util.js";
import { callLlm, extractJson } from "./llm.js";
import { info, spinner, summaryBox, kv, chalk } from "./ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Polls the SMTP provider's REST API for events since the last run and
// classifies them. Never sends anything — see skill/playbooks/triage.md.
export async function triage({ dataDir }) {
  const dir = resolveDataDir(dataDir);
  const config = loadConfig(dir);
  const db = openDb(dir);
  const playbook = fs.readFileSync(path.join(__dirname, "..", "playbooks", "triage.md"), "utf8");

  if (!config.smtp?.api_base_url) {
    info("Email tracking isn't set up yet — see skill/docs/SMTP_SETUP.md to add it.");
    return;
  }

  const events = await fetchProviderEvents(config);
  if (events.length === 0) {
    info("No new replies, bounces, or complaints since the last check.");
    return;
  }

  const openProspects = db
    .prepare(
      `SELECT p.id, p.email, p.business_name FROM prospects p
       WHERE p.email IS NOT NULL AND p.email != ''`
    )
    .all();
  const byEmail = new Map(openProspects.map((p) => [p.email?.toLowerCase(), p]));

  const prompt = buildPrompt(playbook, events);
  const s = spinner(`Reading ${events.length} new reply/bounce event${events.length === 1 ? "" : "s"}...`).start();
  const raw = await callLlm(config, prompt);
  const classified = extractJson(raw);
  s.succeed(`Done.`);

  if (!Array.isArray(classified)) {
    throw new Error("Expected the LLM to return a JSON array of classified events.");
  }

  const tasksDir = path.join(dir, "tasks");
  fs.mkdirSync(tasksDir, { recursive: true });

  let bounces = 0,
    complaints = 0,
    unsubs = 0,
    tasks = 0;

  for (const evt of classified) {
    const prospect = byEmail.get((evt.email || "").toLowerCase());
    if (!prospect) continue;

    if (evt.label === "bounce") {
      db.prepare(`INSERT OR IGNORE INTO suppression (email, reason) VALUES (?, 'bounce')`).run(prospect.email);
      stopSequences(db, prospect.id, "bounce");
      db.prepare(`INSERT INTO send_log (prospect_id, sequence_step, status) VALUES (?, 0, 'bounced')`).run(prospect.id);
      bounces++;
    } else if (evt.label === "complaint") {
      db.prepare(`INSERT OR IGNORE INTO suppression (email, reason) VALUES (?, 'complaint')`).run(prospect.email);
      stopSequences(db, prospect.id, "complaint");
      db.prepare(`INSERT INTO send_log (prospect_id, sequence_step, status) VALUES (?, 0, 'complained')`).run(prospect.id);
      complaints++;
    } else if (evt.label === "unsubscribe") {
      db.prepare(`INSERT OR IGNORE INTO suppression (email, reason) VALUES (?, 'unsubscribe')`).run(prospect.email);
      stopSequences(db, prospect.id, "unsubscribe");
      unsubs++;
    } else {
      // positive | objection | not_now | referral — file a task, never auto-reply
      const requiresHuman = evt.label !== "unsubscribe";
      const taskPath = path.join(tasksDir, `${Date.now()}_${prospect.id}_${evt.label || "reply"}.md`);
      fs.writeFileSync(
        taskPath,
        `# Reply from ${prospect.business_name} <${prospect.email}>\n\nLabel: ${evt.label || "unlabeled"}\n\n${evt.raw_excerpt || ""}\n\n---\nThis needs a human response. local-marketing never sends a substantive autonomous reply.\n`
      );
      db.prepare(
        `INSERT INTO replies (prospect_id, raw_excerpt, label, requires_human, task_path) VALUES (?, ?, ?, ?, ?)`
      ).run(prospect.id, evt.raw_excerpt || "", evt.label || "unknown", requiresHuman ? 1 : 0, taskPath);
      tasks++;
    }
  }

  summaryBox(chalk.bold("Triage results"), [
    kv("Bounces", bounces),
    kv("Complaints", complaints),
    kv("Unsubscribes", unsubs),
    kv("Replies needing you", tasks),
  ]);
  if (tasks > 0) {
    info(`See the ${tasks === 1 ? "file" : "files"} in ${tasksDir} — these need a human reply, nothing was sent automatically.`);
  }
}

function stopSequences(db, prospectId, reason) {
  db.prepare(
    `UPDATE sequence_state SET status='stopped', stopped_reason=? WHERE prospect_id=? AND status NOT IN ('sent','stopped')`
  ).run(reason, prospectId);
}

// Provider APIs differ in shape (Resend, Elastic Email, MailerSend, Postmark...).
// This fetches raw events and hands them to the LLM to normalize + classify,
// rather than hand-coding a parser per provider.
async function fetchProviderEvents(config) {
  const apiKey = requireEnv(config.smtp.api_key_env_var);
  const res = await fetch(config.smtp.api_base_url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`SMTP provider API request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.events || data.data || [];
}

function buildPrompt(playbook, events) {
  return [
    playbook,
    "\n## Raw provider events (shape varies by provider; normalize as you classify)\n",
    JSON.stringify(events, null, 2),
    "\n\nRespond with ONLY a JSON array, one object per event, each shaped as:\n",
    JSON.stringify(
      {
        email: "recipient email address this event is about",
        label: "positive | objection | not_now | referral | unsubscribe | bounce | complaint",
        raw_excerpt: "short excerpt of the reply text, empty string for bounce/complaint",
      },
      null,
      2
    ),
  ].join("\n");
}

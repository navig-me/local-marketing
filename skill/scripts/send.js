import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { openDb } from "./db.js";
import { resolveDataDir, loadConfig, requireEnv } from "./util.js";
import { heading, info as logInfo, success, warn, spinner, chalk } from "./ui.js";

export async function send({ dataDir }) {
  const dir = resolveDataDir(dataDir);
  const config = loadConfig(dir);
  const db = openDb(dir);

  const breaker = checkCircuitBreaker(db, config);
  if (breaker.tripped) {
    db.prepare(
      `INSERT INTO circuit_breaker_events (reason, metric_value, threshold) VALUES (?, ?, ?)`
    ).run(breaker.reason, breaker.value, breaker.threshold);
    warn(chalk.bold(`Sending is paused — ${breaker.reason.replace("_", " ")} is ${(breaker.value * 100).toFixed(2)}%, above the ${(breaker.threshold * 100).toFixed(2)}% safety limit.`));
    logInfo(`Nothing was sent. Have a person check what's going on before trying again.`);
    return;
  }

  const approvedDir = path.join(dir, "approved");
  if (!fs.existsSync(approvedDir)) {
    logInfo("Nothing to send yet.");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const due = db
    .prepare(
      `SELECT ss.*, p.email, p.business_name FROM sequence_state ss
       JOIN prospects p ON p.id = ss.prospect_id
       WHERE ss.status = 'approved' AND date(ss.next_send_date) <= date(?)`
    )
    .all(today);

  if (due.length === 0) {
    logInfo("Nothing due to send today.");
    return;
  }

  heading(`Sending ${due.length} approved email${due.length === 1 ? "" : "s"}`);

  const password = requireEnv(config.smtp.password_env_var);
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: { user: config.smtp.username, pass: password },
  });

  const suppressed = new Set(
    db.prepare(`SELECT email FROM suppression`).all().map((r) => r.email)
  );

  let sent = 0,
    skipped = 0,
    failed = 0;

  for (const row of due) {
    if (suppressed.has(row.email)) {
      warn(`Skipping ${row.email} — they've opted out or bounced before.`);
      db.prepare(`UPDATE sequence_state SET status='stopped', stopped_reason='suppression' WHERE id=?`).run(row.id);
      skipped++;
      continue;
    }
    if (!row.draft_path || !fs.existsSync(row.draft_path)) {
      warn(`Skipping ${row.business_name} — no approved draft found for this step.`);
      skipped++;
      continue;
    }
    const raw = fs.readFileSync(row.draft_path, "utf8");
    const subjectMatch = raw.match(/^Subject:\s*(.+)$/m);
    const subject = subjectMatch ? subjectMatch[1] : `Re: ${row.business_name}`;
    const body = raw.replace(/^Subject:\s*.+\n+/, "");

    const s = spinner(`Sending to ${row.email}...`).start();
    try {
      const result = await transporter.sendMail({
        from: `${config.smtp.from_name} <${config.smtp.from_address}>`,
        to: row.email,
        subject,
        text: body,
        html: bodyToHtml(body),
      });
      db.prepare(
        `INSERT INTO send_log (prospect_id, sequence_step, status, provider_message_id) VALUES (?, ?, 'sent', ?)`
      ).run(row.prospect_id, row.step, result.messageId);
      db.prepare(`UPDATE sequence_state SET status='sent' WHERE id=?`).run(row.id);
      s.succeed(`Sent to ${row.email}`);
      sent++;
    } catch (err) {
      s.fail(`Couldn't send to ${row.email}: ${err.message}`);
      failed++;
    }
  }

  console.log();
  success(`${sent} sent` + (skipped ? `, ${skipped} skipped` : "") + (failed ? `, ${chalk.red(failed + " failed")}` : ""));
}

// Plain-text drafts, rendered as minimal HTML so the site link is a real
// anchor tag — no template, no images/logo, just escaped text + <p>/<br>
// and auto-linked URLs/bare domains, kept close to how the plain text reads.
function bodyToHtml(text) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = escape(text).replace(
    /\b((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)\b/gi,
    (match) => {
      if (!/\.[a-z]{2,}/i.test(match)) return match;
      const href = /^https?:\/\//i.test(match) ? match : `https://${match}`;
      return `<a href="${href}">${match}</a>`;
    }
  );
  const paragraphs = linked
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div>${paragraphs}</div>`;
}

function checkCircuitBreaker(db, config) {
  const window = db
    .prepare(
      `SELECT status, COUNT(*) as n FROM send_log
       WHERE sent_at >= datetime('now', '-7 days')
       GROUP BY status`
    )
    .all();
  const total = window.reduce((s, r) => s + r.n, 0);
  if (total === 0) return { tripped: false };

  const bounced = window.find((r) => r.status === "bounced")?.n || 0;
  const complained = window.find((r) => r.status === "complained")?.n || 0;

  const bounceRate = bounced / total;
  const complaintRate = complained / total;

  if (bounceRate > config.safety.bounce_rate_threshold) {
    return { tripped: true, reason: "bounce_rate", value: bounceRate, threshold: config.safety.bounce_rate_threshold };
  }
  if (complaintRate > config.safety.complaint_rate_threshold) {
    return { tripped: true, reason: "complaint_rate", value: complaintRate, threshold: config.safety.complaint_rate_threshold };
  }
  return { tripped: false };
}

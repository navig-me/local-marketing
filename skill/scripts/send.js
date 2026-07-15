import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { openDb } from "./db.js";
import { resolveDataDir, loadConfig, requireEnv } from "./util.js";

export async function send({ dataDir }) {
  const dir = resolveDataDir(dataDir);
  const config = loadConfig(dir);
  const db = openDb(dir);

  const breaker = checkCircuitBreaker(db, config);
  if (breaker.tripped) {
    db.prepare(
      `INSERT INTO circuit_breaker_events (reason, metric_value, threshold) VALUES (?, ?, ?)`
    ).run(breaker.reason, breaker.value, breaker.threshold);
    console.error(
      `CIRCUIT BREAKER TRIPPED: ${breaker.reason} = ${(breaker.value * 100).toFixed(2)}% ` +
        `exceeds threshold ${(breaker.threshold * 100).toFixed(2)}%. Sending nothing. ` +
        `A human must investigate and clear this before sends resume.`
    );
    return;
  }

  const approvedDir = path.join(dir, "approved");
  if (!fs.existsSync(approvedDir)) {
    console.log("No approved/ folder — nothing to send.");
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
    console.log("No sends due today.");
    return;
  }

  const password = requireEnv(config.smtp.password_env_var);
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: { user: config.smtp.username, pass: password },
  });

  const suppressed = new Set(
    db.prepare(`SELECT email FROM suppression`).all().map((r) => r.email)
  );

  for (const row of due) {
    if (suppressed.has(row.email)) {
      console.log(`Skipping ${row.email} (suppressed).`);
      db.prepare(`UPDATE sequence_state SET status='stopped', stopped_reason='suppression' WHERE id=?`).run(row.id);
      continue;
    }
    if (!row.draft_path || !fs.existsSync(row.draft_path)) {
      console.log(`Skipping prospect ${row.prospect_id}: no approved draft file found.`);
      continue;
    }
    const body = fs.readFileSync(row.draft_path, "utf8");
    const subjectMatch = body.match(/^Subject:\s*(.+)$/m);
    const subject = subjectMatch ? subjectMatch[1] : `Re: ${row.business_name}`;

    try {
      const info = await transporter.sendMail({
        from: `${config.smtp.from_name} <${config.smtp.from_address}>`,
        to: row.email,
        subject,
        text: body,
      });
      db.prepare(
        `INSERT INTO send_log (prospect_id, sequence_step, status, provider_message_id) VALUES (?, ?, 'sent', ?)`
      ).run(row.prospect_id, row.step, info.messageId);
      db.prepare(`UPDATE sequence_state SET status='sent' WHERE id=?`).run(row.id);
      console.log(`Sent step ${row.step} to ${row.email}`);
    } catch (err) {
      console.error(`Failed to send to ${row.email}: ${err.message}`);
    }
  }
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

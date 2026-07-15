import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { openDb } from "./db.js";
import { resolveDataDir, loadConfig, requireEnv } from "./util.js";
import { heading, info, success, summaryBox, kv, spinner, chalk } from "./ui.js";

export async function report({ dataDir }) {
  const dir = resolveDataDir(dataDir);
  const config = loadConfig(dir);
  const db = openDb(dir);

  const funnel = {
    candidates: count(db, `SELECT COUNT(*) n FROM prospects WHERE status='candidate'`),
    qualified: count(db, `SELECT COUNT(*) n FROM prospects WHERE status='qualified'`),
    disqualified: count(db, `SELECT COUNT(*) n FROM prospects WHERE status='disqualified'`),
    sent: count(db, `SELECT COUNT(*) n FROM send_log WHERE sent_at >= datetime('now','-7 days') AND status='sent'`),
    bounced: count(db, `SELECT COUNT(*) n FROM send_log WHERE sent_at >= datetime('now','-7 days') AND status='bounced'`),
    replies: count(db, `SELECT COUNT(*) n FROM replies WHERE received_at >= datetime('now','-7 days')`),
    breakerTrips: count(db, `SELECT COUNT(*) n FROM circuit_breaker_events WHERE tripped_at >= datetime('now','-7 days')`),
  };

  const dateStr = new Date().toISOString().slice(0, 10);
  const md = `# local-marketing weekly report — ${dateStr}

| Metric | Last 7 days |
| --- | --- |
| New candidates | ${funnel.candidates} |
| Qualified | ${funnel.qualified} |
| Disqualified | ${funnel.disqualified} |
| Emails sent | ${funnel.sent} |
| Bounces | ${funnel.bounced} |
| Replies | ${funnel.replies} |
| Circuit breaker trips | ${funnel.breakerTrips} |

${funnel.breakerTrips > 0 ? "**Circuit breaker tripped this week — check circuit_breaker_events before resuming sends.**" : "No circuit breaker trips this week."}
`;

  heading(`This week's report — ${dateStr}`);

  const reportsDir = path.join(dir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${dateStr}.md`);
  fs.writeFileSync(reportPath, md);

  summaryBox(chalk.bold("Funnel — last 7 days"), [
    kv("New candidates", funnel.candidates),
    kv("Qualified", funnel.qualified),
    kv("Disqualified", funnel.disqualified),
    kv("Emails sent", funnel.sent),
    kv("Bounces", funnel.bounced),
    kv("Replies", funnel.replies),
    kv("Circuit breaker trips", funnel.breakerTrips),
  ]);

  if (funnel.breakerTrips > 0) {
    console.log(chalk.yellow.bold("  ! Sending was paused at least once this week — check circuit_breaker_events."));
  }

  info(`Saved to ${reportPath}`);

  if (config.reporting?.admin_email) {
    const password = requireEnv(config.smtp.password_env_var);
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: { user: config.smtp.username, pass: password },
    });
    const s = spinner(`Emailing this to ${config.reporting.admin_email}...`).start();
    await transporter.sendMail({
      from: `${config.smtp.from_name} <${config.smtp.from_address}>`,
      to: config.reporting.admin_email,
      subject: `local-marketing weekly report — ${dateStr}`,
      text: md,
    });
    s.succeed(`Emailed to ${config.reporting.admin_email}`);
  }
}

function count(db, sql) {
  return db.prepare(sql).get().n;
}

# Playbook: reply-triage agent

Input: bounce/complaint/reply data pulled from the SMTP provider's REST API
(`smtp.api_base_url` + `smtp.api_key_env_var`) since the last run. No
webhook, no public endpoint — this is always a pull, run on demand or via
cron.

For each new event:
- **Bounce**: insert into `suppression` (reason `bounce`), set matching
  `sequence_state` rows to `stopped` (reason `bounce`), log to `send_log`
  with status `bounced`.
- **Complaint**: insert into `suppression` (reason `complaint`), stop the
  sequence, log status `complained`.
- **Reply**: classify into one of `positive | objection | not_now | referral
  | unsubscribe | bounce`. Insert a `replies` row. If `unsubscribe`, also
  add to `suppression` and stop the sequence immediately, regardless of
  statutory grace periods. For every other label except an unambiguous
  auto-reply, write a task file into `tasks/` describing the reply and
  what a human should consider doing — never draft or send a substantive
  reply yourself.

This agent only classifies and writes to SQLite/files. It must never send
an email.

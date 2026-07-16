# SMTP setup for local-marketing

`local-marketing` sends both marketing sequences and admin/reporting emails
through a single SMTP relay — no separate notification channel. Pick one
provider below, complete its setup, then paste the values into the init
interview when asked.

You need, from any provider: **SMTP host, port, username, password**, and
ideally a **REST API key** for the same account (used to poll bounce/complaint
data for the circuit breaker and reply-triage agent — plain SMTP send alone
can't tell you what happened after the message left your machine).

Always set up SPF, DKIM, and DMARC on a dedicated sending subdomain (e.g.
`mail.yourdomain.com`), separate from any transactional/product email domain.
Every provider below has a guided DNS wizard for this — use it before sending
at any real volume.

## Where the secrets actually need to live

Exporting `LOCAL_MARKETING_SMTP_PASSWORD` / `LOCAL_MARKETING_SMTP_API_KEY` in
your shell profile (`.zshrc`/`.bashrc`) is enough for commands you run by
hand, but **cron never sources your shell profile** — a scheduled `send` will
fail with a missing-credentials error even if manual runs work fine.

For the automatic schedule (`cron-install`) to work, put the same two
`export` lines in a `.env` file in the project's data directory (e.g.
`<data_dir>/.env`), and lock its permissions down:

```bash
chmod 600 <data_dir>/.env
```

`init.js` already adds `.env`/`*.env` to the project's `.gitignore`, and
`cron-install` sources this file automatically before every scheduled run if
it exists — no other configuration needed. Keep the shell-profile export too
if you also want to run commands manually.

---

## Option 1: Elastic Email

Sign up: https://navig.me/elasticemail

Setup:
1. Create an account, verify your sending domain (Settings → Domains), add the
   provided SPF/DKIM/DMARC DNS records.
2. Settings → SMTP/API → create SMTP credentials. Note host (`smtp.elasticemail.com`),
   port `2525` (or `587`), username (your account email), and the generated
   SMTP password.
3. Settings → API → generate an API key for bounce/complaint polling via their
   REST API.
4. Paste host/port/username, set the SMTP password as `LOCAL_MARKETING_SMTP_PASSWORD`
   in your shell environment (never in `config.yaml`), and the API key as
   `LOCAL_MARKETING_SMTP_API_KEY`.

## Option 2: MailerSend

Sign up: https://navig.me/mailersend

Setup:
1. Add and verify your sending domain under Domains, apply the SPF/DKIM/DMARC
   records it gives you.
2. Domains → your domain → SMTP — note host (`smtp.mailersend.net`), port
   `587`, username, and generate an SMTP password.
3. Integrations → API tokens — generate a token scoped to email sending +
   activity/analytics read, used for bounce/complaint polling.
4. Set `LOCAL_MARKETING_SMTP_PASSWORD` and `LOCAL_MARKETING_SMTP_API_KEY` env vars.

## Option 3: Resend (recommended default)

Sign up: https://resend.com

Setup:
1. Add and verify your domain (Domains → Add Domain), apply the SPF/DKIM/DMARC
   records shown.
2. Domains → SMTP — note host (`smtp.resend.com`), port `587`, username
   (`resend`), and generate an SMTP password (this is your API key, reused for
   both SMTP auth and REST API polling).
3. Set `LOCAL_MARKETING_SMTP_PASSWORD` (and reuse the same value for
   `LOCAL_MARKETING_SMTP_API_KEY`).

Resend is the simplest of the three to get from zero to authenticated sending,
with one credential covering both SMTP and API access.

## Bring your own (Postmark, SES, etc.)

Any SMTP provider works. Fill in `smtp.host`/`port`/`username`/`from_address`
in `config.yaml` manually, set the two env vars above, and confirm the
provider exposes a REST API for delivery events — without it, the circuit
breaker and reply-triage agent have no bounce/complaint signal to act on.

## What NOT to use

**Gmail / Google Workspace SMTP** — tempting because you likely already have
it, but Google's sending limits and reputation system are built for personal/
transactional mail, not cold outreach sequences. Expect throttling or account
suspension at low volume, and there's no bounce/complaint API to feed the
circuit breaker. Don't use it for this.

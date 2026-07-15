# local-marketing

**Your AI coding agent already writes your code. Now it can find your first
customers too — entirely on your own machine, nothing sent anywhere without
your sign-off.**

[![npm version](https://img.shields.io/npm/v/@navig-me/local-marketing.svg)](https://www.npmjs.com/package/@navig-me/local-marketing)
[![license](https://img.shields.io/npm/l/@navig-me/local-marketing.svg)](LICENSE)

`local-marketing` turns Claude Code (or any headless CLI agent — Codex CLI,
Gemini CLI, etc.) into a customer-acquisition system for solo founders and
small teams: it interviews you about your product and ICP, researches your
market, scores and drafts outreach to prospects you curate, and sends it —
but only after you've approved every single message.

There's no hosted CRM, no workflow platform, no cloud database, and no
subscription. Everything lives in one folder on your machine: a SQLite file,
a plain-text config, and two folders (`pending_review/`, `approved/`) that
are the entire "approval workflow" — move a file, and that's your sign-off.
Your only external dependency is an SMTP provider, used purely as a dumb
send/poll pipe.

Built for people who want the leverage of an "AI SDR" without handing a
prospect list, a CRM, or sending credentials to another SaaS company.

## What it does

1. **Init interview** — the agent grills you (one question at a time, with a
   recommended default) about your project, ICP, target segments, priority
   geography, and SMTP setup, then scaffolds your local data directory.
2. **Research** — scores human-curated candidate businesses against each
   segment's signals/disqualifiers, writes an evidence-backed relevance note
   per prospect. Discovery is never autonomous — you (optionally
   agent-assisted, interactively) curate the candidate list; the agent only
   scores it. This is a deliberate compliance/ToS boundary, not a limitation.
3. **Copy-draft** — writes the four-email sequence (day 1/4/9/15) per
   qualified prospect into `pending_review/`. Nothing sends from here.
4. **Review & approve** — you review drafts in your editor and approve by
   moving the file to `approved/` (or `local-marketing approve <file>`,
   which prints exactly what it's doing).
5. **Send** — checks a circuit breaker (bounce/complaint rate thresholds)
   before every batch, sends only what's in `approved/` and due today, logs
   everything to `send_log`.
6. **Reply-triage** — classifies replies/bounces/complaints, updates the
   suppression list, never sends a substantive autonomous reply.
7. **Report** — weekly funnel rollup, written to `reports/` and emailed to
   you via the same SMTP pipe used for outreach.

## Requirements

- Node.js 18+
- A headless LLM CLI already installed and authenticated on your machine —
  by default this is [Claude Code](https://claude.com/claude-code)
  (`claude -p ...`), used non-interactively for research/draft/triage. Any
  other CLI that accepts a prompt on stdin and prints text/JSON works too
  (see `llm.command`/`llm.args` in Configuration below).
- An SMTP-sending provider account (Elastic Email, MailerSend, Resend, or
  your own) — see [Installation → SMTP setup](#3-set-up-smtp) below.

## Installation

### 1. Install the skill

```
npx @navig-me/local-marketing install
```

This prompts you to choose one or more agent targets. Enter comma-separated
numbers when you use more than one, such as `1,2` for Claude Code and Codex CLI:

1. **Claude Code** — installs the skill to `~/.claude/skills/local-marketing/`
   and adds explicit slash commands to `~/.claude/commands/local-marketing/`
   (`/local-marketing:init`, `/local-marketing:review`, etc.).
2. **Codex CLI** — installs the skill to the shared `~/.agents/skills/`
   location (see below) and adds custom prompts to `~/.codex/prompts/`
   (`/local-marketing-init`, `/local-marketing-review`, etc.).
3. **Other** (Gemini CLI, Cursor, GitHub Copilot, and any other tool that
   supports the open [Agent Skills standard](https://agentskills.io)) —
   installs to the shared `~/.agents/skills/local-marketing/` location,
   which 30+ tools read from automatically. This is the same
   fully-functional skill as the Claude Code install — nothing is held
   back from non-Claude targets.

Either way, the skill **activates automatically** when you make a relevant
request ("set up marketing for this project") — the explicit slash
commands (Claude Code, Codex CLI) are a faster, more discoverable shortcut
to the same thing, not a requirement.

To update later, re-run:

```
npx @navig-me/local-marketing@latest install
```

### 2. Run the init interview

From inside (or referring to) the project you want to market, ask your
agent to run the `local-marketing` skill, or use `/local-marketing:init`
(Claude Code) / `/local-marketing-init` (Codex CLI) directly. The agent
will:

- interview you about your product, ICP, target segments, and priority
  geography (one question at a time, with a recommended default you can
  accept or override)
- research your company/market using its own web-search tool
- walk you through SMTP setup (below)
- show you the recommended safety defaults (bounce/complaint thresholds,
  send-ramp schedule, cadence days) and ask you to confirm or override them
- ask where to put the local data directory (default `~/marketing/<slug>/`)
- scaffold that directory: `config.yaml`, the SQLite DB, and
  `pending_review/`, `approved/`, `segments/`, `reports/`, `tasks/` folders

### 3. Set up SMTP

You need SMTP host/port/username/password plus, ideally, a REST API key
for bounce/complaint polling. Full walkthroughs for each provider —
including DNS/SPF/DKIM/DMARC setup — are in
[`skill/docs/SMTP_SETUP.md`](skill/docs/SMTP_SETUP.md):

- [Elastic Email](https://navig.me/elasticemail)
- [MailerSend](https://navig.me/mailersend)
- [Resend](https://resend.com) (recommended default — simplest setup, one
  credential covers both SMTP and API)
- Bring your own (Postmark, SES, etc.)

**Do not use Gmail/Google Workspace SMTP** for outreach — see the doc for why.

Store the SMTP password and API key as environment variables (never in
`config.yaml`), matching whatever names `config.yaml` specifies
(defaults: `LOCAL_MARKETING_SMTP_PASSWORD`, `LOCAL_MARKETING_SMTP_API_KEY`):

```bash
export LOCAL_MARKETING_SMTP_PASSWORD="..."
export LOCAL_MARKETING_SMTP_API_KEY="..."
```

Add these to your shell profile (`~/.zshrc`, `~/.bashrc`) so they persist.

## Usage

Once you've run `init` once, every command below works with **no path
needed** — it automatically uses the project you just set up. (If you ever
set up more than one project, pass the path to disambiguate; the command
that scaffolded it also tells you where it saved things.)

```bash
# 1. Add candidate businesses to the SQLite `prospects` table yourself
#    (or with your agent's help, interactively) — discovery is never
#    autonomous. See skill/SKILL.md for the exact insert shape, or ask
#    your agent to "add these candidates to local-marketing".

# 2. Score curated candidates against the active segment's brief
npx @navig-me/local-marketing research

# 3. Draft the 4-email sequence for newly-qualified prospects
npx @navig-me/local-marketing draft

# 4. Review what was drafted
npx @navig-me/local-marketing review

# 5. Approve individual drafts (or just move the file into approved/ yourself)
npx @navig-me/local-marketing approve pending_review/2026-07-15_acme_day1.md

# 6. Send whatever is approved and due today (checks the circuit breaker first)
npx @navig-me/local-marketing send

# 7. Pull and classify replies/bounces/complaints (never auto-replies)
npx @navig-me/local-marketing triage

# 8. Generate + email the weekly funnel report
npx @navig-me/local-marketing report
```

If you're scripting or running from somewhere else on the machine, every
command also accepts the project's folder as an optional final argument,
e.g. `npx @navig-me/local-marketing send /path/to/that/folder`.

### Running it on a schedule

`init` asks you, at the end, whether to turn on the automatic schedule —
say yes and it's done, nothing more to configure. Behind the scenes this
installs a `cron` entry (a built-in macOS/Linux feature that runs commands
at set times, even with no app open) for each step: research, draft, send,
triage, report — matching the cadence from the reference marketing plan
this skill is based on. Re-running `init` for the same project updates its
schedule instead of duplicating it; nothing else in your crontab is
touched. You can also turn it on later, or update it, with:

```
npx @navig-me/local-marketing cron-install
```

Nothing sends unattended beyond what you've already approved — `send` only
ever reads from `approved/`, and the circuit breaker halts sending
automatically if bounce/complaint rates cross the configured thresholds.

### Configuration reference

All settings live in `<data-dir>/config.yaml`, generated during init.
Key sections: `smtp` (provider creds + API), `safety` (circuit-breaker
thresholds, ramp schedule, cadence days), `llm` (which headless CLI/args to
shell out to for research/draft/triage), `reporting` (admin email). See
[`skill/config/config.example.yaml`](skill/config/config.example.yaml) for
the full annotated template, and
[`skill/config/segment.example.yaml`](skill/config/segment.example.yaml)
for the per-segment brief format (signals, disqualifiers, offer).

## Design principles

- **Local-only.** SQLite + files, no hosted service in the loop except your
  SMTP provider (used as a dumb send/poll pipe).
- **Human-approved sends.** File-move from `pending_review/` to `approved/`
  is the only way anything gets sent — auditable, git-diffable, no hidden
  automation.
- **Human-curated discovery.** The agent scores and drafts; it never
  autonomously scrapes or discovers new prospects.
- **Agent-agnostic core.** The skill folder is plain markdown + scripts +
  config. Claude Code gets a thin native wrapper; every other CLI agent gets
  the identical, fully-functional core.

See `skill/SKILL.md` for the complete spec.

# local-marketing

A local-only, agent-agnostic marketing/customer-acquisition skill. Works with
Claude Code and any other headless CLI agent (Codex CLI, Gemini CLI, etc.)
that can read markdown, run bash/node, and call its own LLM. No hosted CRM,
no hosted workflow engine, no cloud database — everything lives in one data
directory on your machine: a SQLite file, a YAML config, and two folders
(`pending_review/`, `approved/`) that gate every outbound send behind a human.

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

This prompts you to choose an agent target:

1. **Claude Code** — installs to `~/.claude/skills/local-marketing/`.
   Claude Code picks it up automatically; no further config needed.
2. **Generic** — installs to `~/.agent-skills/local-marketing/` for any
   other CLI agent (Codex CLI, Gemini CLI, etc.) that can read markdown,
   run bash/node, and shell out to its own LLM. Point that agent at the
   installed `SKILL.md` as its instructions entrypoint. This is the same
   fully-functional skill as the Claude Code install — nothing is held
   back from non-Claude targets.

To update later, re-run:

```
npx @navig-me/local-marketing@latest install
```

### 2. Run the init interview

From inside (or referring to) the project you want to market, ask your
agent to run the `local-marketing` skill — in Claude Code it activates
automatically on relevant requests ("set up marketing for this project",
"/local-marketing init"), or invoke it directly. The agent will:

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

Once initialized, the following commands operate on your data directory
(pass its path explicitly, or run them from inside it):

```bash
# 1. Add candidate businesses to the SQLite `prospects` table yourself
#    (or with your agent's help, interactively) — discovery is never
#    autonomous. See skill/SKILL.md for the exact insert shape, or ask
#    your agent to "add these candidates to local-marketing".

# 2. Score curated candidates against the active segment's brief
npx @navig-me/local-marketing research /path/to/data-dir

# 3. Draft the 4-email sequence for newly-qualified prospects
npx @navig-me/local-marketing draft /path/to/data-dir

# 4. Review what was drafted
npx @navig-me/local-marketing review /path/to/data-dir

# 5. Approve individual drafts (or just move the file into approved/ yourself)
npx @navig-me/local-marketing approve /path/to/data-dir/pending_review/2026-07-15_acme_day1.md

# 6. Send whatever is approved and due today (checks the circuit breaker first)
npx @navig-me/local-marketing send /path/to/data-dir

# 7. Pull and classify replies/bounces/complaints (never auto-replies)
npx @navig-me/local-marketing triage /path/to/data-dir

# 8. Generate + email the weekly funnel report
npx @navig-me/local-marketing report /path/to/data-dir
```

### Running it on a schedule

Each command is a one-shot script, meant to be triggered by `cron`,
`launchd`, or `systemd` timers — there's no persistent background process.
A cadence matching the reference marketing plan this skill is based on:

```cron
# crontab -e
0 8 * * MON     npx @navig-me/local-marketing research  /path/to/data-dir
0 9 * * *       npx @navig-me/local-marketing draft     /path/to/data-dir
0 10 * * *      npx @navig-me/local-marketing send      /path/to/data-dir
0 * * * *       npx @navig-me/local-marketing triage    /path/to/data-dir
0 9 * * MON     npx @navig-me/local-marketing report    /path/to/data-dir
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

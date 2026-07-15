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

## Install

```
npx local-marketing install
```

Asks which agent to install for (Claude Code gets a native skill directory;
any other CLI agent gets the same full-featured skill folder as a generic
drop-in — nothing is held back from non-Claude targets). Re-run
`npx local-marketing@latest install` later to update.

## Use

Inside the project you want to market, ask your agent to run the
`local-marketing` skill (in Claude Code: it activates automatically on
relevant requests, or invoke it directly), and it will start the init
interview. See `skill/SKILL.md` for the full instruction set the agent
follows, and `skill/docs/SMTP_SETUP.md` for provider setup (Elastic Email,
MailerSend, Resend, or bring your own).

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

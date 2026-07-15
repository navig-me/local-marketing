---
name: local-marketing
description: Local-only marketing system. Interviews the user about their project/ICP, researches their market, scaffolds a local SQLite CRM + file-approved outbound email pipeline over SMTP. Use when the user wants to set up or run customer-acquisition outreach for their own product, asks to "init marketing", "research my ICP", "draft outreach", "review pending emails", or "send today's sequence".
---

# local-marketing

A local-only, agent-agnostic marketing/outreach system. Everything lives in
one data directory on the user's machine: a SQLite database (system of
record), a YAML config (source of truth for settings), and two folders,
`pending_review/` and `approved/`, that are the human approval gate before
anything sends. No hosted CRM, no hosted workflow engine. You (the agent
running this skill) are the only "automation" — invoked once per script, not
a persistent background service.

This skill works identically regardless of which CLI agent is running it.
Everything here is plain instructions, bash/node scripts, and files. If
you are Claude Code, also see `claude-code/` in the package root for the
native skill manifest — it just points back here.

## Commands this skill implements

Run these via `node <package_root>/skill/scripts/<name>.js` or the installed
`local-marketing <subcommand>` CLI if available.

| Subcommand | Purpose |
| --- | --- |
| `init` | Interview the user, scaffold data dir, write `config.yaml` + SQLite DB |
| `research` | Score human-curated `candidate` prospects against the active segment brief, write evidence-backed relevance notes |
| `draft` | Write outreach drafts for `qualified` prospects into `pending_review/` |
| `review` | Show pending drafts, explain how to approve/edit/reject each one |
| `approve <file>` | Move a draft from `pending_review/` to `approved/` |
| `send` | Check the circuit breaker, send everything due today from `approved/`, log to `send_log` |
| `triage` | Poll the SMTP provider's API for replies/bounces, classify, update `suppression`/`sequence_state` |
| `report` | Roll up the week's funnel, write a Markdown report, email it to `reporting.admin_email` |

## Init interview (run first, once)

Follow the grilling pattern: one question at a time, offer a sensible default
based on what you can find (e.g. by fetching the user's website), wait for
their answer before continuing. Do not batch questions.

Cover, in order:
1. Project name, one-line description, website URL.
2. What the product actually does — pull detail out of the user, don't just
   summarize the website homepage.
3. Ideal customer profile: who buys this, what operational/business pain
   triggers a purchase, company size/type, geography.
4. 2-4 candidate market segments (like the tuition-centre / enrichment /
   solo-teacher / growing-operator split in the ClassOps reference plan) —
   each becomes a `segments/<id>.yaml` brief with signals, disqualifiers, and
   an offer.
5. Priority geography and any compliance constraints for that market (e.g.
   Singapore DNC rules, CAN-SPAM, UK PECR/ICO B2B guidance) — flag these,
   don't silently skip.
6. SMTP setup — point them at `docs/SMTP_SETUP.md`, walk them through
   whichever provider they pick, collect host/port/username/from address
   (never the password — that goes in an env var, tell them which one).
7. Admin report email address (can be the same inbox).
8. Safety defaults (bounce/complaint thresholds, ramp schedule, cadence days)
   — show the recommended values from `config/config.example.yaml` with a
   one-line reason for each, ask "keep these or change?" rather than asking
   open-ended.
9. Where to put the data directory — default `~/marketing/<slug>/`, confirm
   or let them override.

At the end: research the company/market using your own web search/fetch
tools (this skill does not bundle a search API), write findings into the
generated `PROJECT.md`, then run `scripts/init.js` to scaffold the directory,
copy `config.example.yaml` → `config.yaml` filled in with their answers, and
initialize the SQLite DB from `db/schema.sql`.

## Candidate sourcing stays human-curated

The `research` command never searches the open web for new prospects
autonomously and is never run on an unattended schedule for discovery. Each
week, the user (optionally with your help in an interactive session) adds
candidate businesses to the `prospects` table with `status = 'candidate'`.
Only then does `research` score them against the active segment's brief
(`segments/<id>.yaml`: `signals`, `disqualifiers`) and write one
evidence-backed relevance note per prospect, with a source citation. This is
a deliberate compliance/ToS boundary from the reference plan — do not relax
it even if your web tools could technically do open-ended discovery.

## Approval flow

`draft` writes each outreach email as a plain markdown file into
`pending_review/`, e.g. `pending_review/2026-07-15_acme-tuition_day1.md`.
Nothing sends from this folder. The user reviews/edits the file directly in
their editor. To approve, either:
- run `local-marketing approve pending_review/<file>` (prints exactly what
  it's about to do before moving the file), or
- move the file to `approved/` themselves.

`send` only ever reads from `approved/`. Always tell the user which of these
two paths you just used, and where the file ended up, so the mechanism is
never a black box.

## Circuit breaker

Before every `send` batch: compute rolling bounce rate and complaint rate
from `send_log`. If either exceeds `safety.bounce_rate_threshold` /
`complaint_rate_threshold` from `config.yaml`, write a row to
`circuit_breaker_events`, set affected segments to a paused state, send
nothing, and clearly tell the user why — do not auto-clear; a human must
investigate and explicitly clear it.

## Guardrails (apply to every command)

- Never fabricate a relevance note, personalization detail, or claim about a
  prospect. If you don't have evidence, say so and leave the prospect
  unscored rather than inventing a signal.
- Never send a substantive autonomous reply to a prospect's response — the
  `triage` command only classifies and files a task for the human.
- Always check `suppression` before drafting or sending anything to an email
  address.
- Respect `safety.cadence_days` and `safety.ramp_schedule` exactly as
  configured — don't "optimize" send volume on your own judgment.

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
you are Claude Code, also see `.claude/skills/local-marketing/SKILL.md` in
the package root for the native skill manifest — it just points back here.

## Commands this skill implements

Run these via `node <package_root>/skill/scripts/<name>.js`, the installed
`local-marketing <subcommand>` CLI if available, or — once the skill is
installed — the corresponding Claude Code slash command
(`/local-marketing:init`, `/local-marketing:review`, etc.) or Codex CLI
custom prompt (`/local-marketing-init`, `/local-marketing-review`, etc.).
All three invoke the same underlying script; the slash commands/prompts are
just a discoverable shortcut, not a different code path.

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
based on what you can find, wait for their answer before continuing. Do not
batch questions — including sub-parts of the same question (e.g. "from
address," "from name," and "report recipient" are three separate turns, not
one message with three asks). If the user gives a one-word answer like "ok"
to something you bundled, that's a sign you batched — split it up and ask
again one at a time.

Cover, in order:
1. Project name, website URL. As soon as you have the URL, fetch the live
   site before asking anything else — repo READMEs and package.json
   metadata can describe an earlier or aspirational version of the product,
   not what's actually shipped. Ground every later question in what the
   live site actually says, and if it contradicts the repo's own docs,
   surface that mismatch to the user rather than silently picking one.
2. One-line description and what the product actually does — propose a
   description grounded in the live site, then pull correction/detail out
   of the user rather than just repeating the homepage copy verbatim.
3. Ideal customer profile: who buys this, what operational/business pain
   triggers a purchase, company size/type, geography.
4. 2-4 candidate market segments (like the tuition-centre / enrichment /
   solo-teacher / growing-operator split in the ClassOps reference plan) —
   each becomes a `segments/<id>.yaml` brief with signals, disqualifiers, and
   an offer.
5. Priority geography and any compliance constraints for that market (e.g.
   Singapore DNC rules, CAN-SPAM, UK PECR/ICO B2B guidance) — flag these,
   don't silently skip.
6. SMTP setup — point them at `docs/SMTP_SETUP.md` and present the provider
   options (Resend, Elastic Email, MailerSend, bring-your-own) as a plain
   list with sign-up links so they can open each and decide; Resend is the
   documented default recommendation for setup simplicity, but don't
   comment on or editorialize about any other link (e.g. why it's included) —
   just the option and the link. Walk them through whichever provider they
   pick, collect host/port/username/from address (never the password —
   that goes in an env var, tell them which one).
7. Admin report email address (can be the same inbox).
8. Safety defaults (bounce/complaint thresholds, ramp schedule, cadence days)
   — show the recommended values from `config/config.example.yaml` with a
   one-line reason for each, ask "keep these or change?" rather than asking
   open-ended.
9. Where to put the data directory — default `~/marketing/<slug>/`, confirm
   or let them override.

You already fetched the live site in step 1 and used it to ground steps 2-5
— consolidate those findings (plus anything from the ICP/segment
conversation) into a generated `PROJECT.md`, then run `scripts/init.js` to
scaffold the directory, copy `config.example.yaml` → `config.yaml` filled in
with their answers, and initialize the SQLite DB from `db/schema.sql`. This
skill does not bundle a search API — all research uses your own web
search/fetch tools.

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

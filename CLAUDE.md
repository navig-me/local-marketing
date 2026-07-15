# local-marketing — repo notes for coding agents

This repo is the `local-marketing` npm package: a local-only, agent-agnostic
marketing/outreach skill. See `README.md` for the product description and
`skill/SKILL.md` for the full behavioral spec any agent follows at runtime.

## Layout

- `bin/local-marketing.js` — CLI entrypoint (`npx @navig-me/local-marketing ...`).
- `skill/` — the actual skill: `SKILL.md` (instructions), `scripts/` (node
  helpers: db, init, review, approve, send, report, install), `playbooks/`
  (research/copy-draft/triage prompts), `db/schema.sql`, `config/` (YAML
  templates), `docs/SMTP_SETUP.md`.
- `.claude/skills/local-marketing/SKILL.md` — thin Claude Code native
  wrapper that just points at `skill/SKILL.md`. Keep it a pointer, not a
  fork — the fallback used by other agents must stay fully-featured, so
  don't add Claude-only capability here.

## Working on this repo

- The deterministic parts (DB writes, file moves, SMTP send, circuit
  breaker math) live in `skill/scripts/*.js` — test these like normal code.
- The judgment-requiring parts (the interview itself, research scoring,
  drafting copy, reply classification) are deliberately left as
  instructions in `skill/SKILL.md` / `skill/playbooks/*.md` for the calling
  agent to execute — don't try to hardcode these into scripts.
- Don't relax the two safety boundaries baked into the design: candidate
  discovery stays human-curated (never autonomous/cron'd), and sends only
  ever come from files physically present in `approved/`.
- SMTP credentials are always env vars (`LOCAL_MARKETING_SMTP_PASSWORD`,
  `LOCAL_MARKETING_SMTP_API_KEY`), never written into `config.yaml`.

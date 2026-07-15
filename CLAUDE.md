# local-marketing — repo notes for coding agents

This repo is the `local-marketing` npm package: a local-only, agent-agnostic
marketing/outreach skill. See `README.md` for the product description and
`skill/SKILL.md` for the full behavioral spec any agent follows at runtime.

## Layout

- `bin/local-marketing.js` — CLI entrypoint (`npx @navig-me/local-marketing ...`).
- `skill/` — the actual skill: `SKILL.md` (instructions), `scripts/` (node
  helpers: db, init, review, approve, send, report, install), `playbooks/`
  (research/copy-draft/triage prompts), `commands/` (one markdown file per
  subcommand — source for both Claude Code slash commands and Codex CLI
  custom prompts, see below), `db/schema.sql`, `config/` (YAML templates),
  `docs/SMTP_SETUP.md`.
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
- Target audience includes non-technical users. Every command output goes
  through `skill/scripts/ui.js` (chalk/ora/boxen wrappers — `heading`,
  `info`, `success`, `warn`, `spinner`, `summaryBox`) and every user-facing
  error should be thrown as a `FriendlyError` (`skill/scripts/util.js`) with
  a plain-language message plus a concrete `nextStep` — never let a raw
  stack trace or a message like "ENOENT" or "path" reach the user.
- `skill/scripts/registry.js` tracks known projects at
  `~/.local-marketing/projects.json` so commands work with no path argument
  once `init` has run once. `resolveDataDir` (`util.js`) is the single place
  that falls back through: explicit arg → cwd's config.yaml → registry
  default. Keep new commands going through it rather than requiring a path.
- Install targets (`skill/scripts/install.js`): Claude Code gets its own
  `~/.claude/skills/` copy plus slash commands in `~/.claude/commands/`;
  Codex CLI and everything else share `~/.agents/skills/` — the open Agent
  Skills standard's cross-tool location (agentskills.io), read by Codex,
  Gemini CLI, Cursor, GitHub Copilot, and 30+ other tools without a
  per-agent copy. Codex CLI additionally gets custom prompts in
  `~/.codex/prompts/` (flat-named `local-marketing-<command>`, since Codex
  has no command-namespacing). If you add a new subcommand, add its markdown
  file to `skill/commands/` and it's automatically picked up by both the
  Claude Code and Codex CLI install paths — no other wiring needed.

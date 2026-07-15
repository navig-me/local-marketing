---
name: local-marketing
description: Local-only marketing system. Interviews the user about their project/ICP, researches their market, scaffolds a local SQLite CRM + file-approved outbound email pipeline over SMTP. Use when the user wants to set up or run customer-acquisition outreach for their own product, asks to "init marketing", "research my ICP", "draft outreach", "review pending emails", or "send today's sequence".
---

This is the Claude Code native entrypoint. Full instructions live in the
package's agent-agnostic skill folder — read `../../../skill/SKILL.md` (or,
once installed via `npx local-marketing install`, `~/.claude/skills/local-marketing/SKILL.md`)
and follow it exactly. There is no Claude-specific behavior here beyond this
pointer — the fallback used by other CLI agents is the same, full-featured
skill, not a stripped-down version.

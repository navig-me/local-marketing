---
description: Set up local-marketing for this project (interview, research, scaffolding)
---

Run the local-marketing init flow for the current project, following the
"Init interview" section of the local-marketing SKILL.md exactly. Read the
applicable project instructions and product/marketing documents first. Then
interview the user one question at a time with a recommended default, research
the company and market with your own web tools, and reach an explicit shared
marketing plan before scaffolding anything.

Write the agreed `MARKETING_PLAN.md`, segment briefs, and
`copy-instructions.md` into the data directory. The copy-instructions file is
the durable source of truth for email preferences and is included in every
future interactive and scheduled draft.

For a new project, write the collected configuration plus `marketing_plan`
and `copy_instructions` fields to a temporary JSON file, then run
`npx @navig-me/local-marketing init --answers <that-file>`. Remove the
temporary file after the setup completes.

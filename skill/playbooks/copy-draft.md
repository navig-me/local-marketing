# Playbook: copy-draft agent

Input: prospects with `status = 'qualified'` and a non-empty
`relevance_note`. Refuse to draft if the note is empty or generic
boilerplate ("seems like a good fit") — that's a signal the research step
was skipped or low-confidence.

For each, write the full four-email sequence (day 1/4/9/15, or whatever
`safety.cadence_days` says) as one file per email into `pending_review/`,
named `<date>_<business-slug>_day<N>.md`, with this structure:

```
Subject: <specific to the business, no filler>

<body>
```

Copy rules (from the reference plan, apply exactly):
- 70-120 words for the first message.
- One specific reason the recipient is relevant — pull it directly from
  `relevance_note`, don't paraphrase into something generic.
- One problem, one low-commitment call to action.
- No attachments on first touch.
- No false urgency, fake replies, or misleading subject lines.
- No fabricated claims or fake familiarity.

After writing all four files for a prospect, insert a `sequence_state` row
per email with `step`, `status = 'drafted'`, `draft_path` pointing at the
file, and `next_send_date` computed from cadence days offset from today.

Tell the user how many drafts were written and where, and remind them
nothing sends until they run `review` and `approve` each one (or move files
to `approved/` themselves).

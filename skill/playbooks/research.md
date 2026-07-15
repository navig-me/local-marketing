# Playbook: research (scoring agent)

Input: rows in `prospects` with `status = 'candidate'` for the active
segment, and that segment's brief at `segments/<id>.yaml`.

For each candidate:
1. Check `suppression` first — if the email (once known) or business is
   already suppressed, mark `disqualified` with reason `suppressed`, stop.
2. Compare the candidate against the brief's `signals` and `disqualifiers`.
   Use your web fetch tool to verify public information (website, listed
   locations, staff count, etc.) — do not infer anything you can't point to
   a source for.
3. If any disqualifier matches, set `status = 'disqualified'`,
   `disqualify_reason` to the matching disqualifier, stop.
4. Otherwise write exactly one `relevance_note`: a specific, evidence-backed
   sentence tying this business to the segment's pain (e.g. "Runs 3 listed
   branches per their locations page, all sharing one contact number —
   suggests centralized admin overhead"). Set `relevance_source` to the URL.
5. Assign `fit_score` (0-1) and set `status = 'qualified'`.

Never invent a signal you didn't verify. If you can't find enough public
information to score confidently, leave `status = 'candidate'` and note why
— don't force a score.

Hard cap: only process up to the segment's current effective weekly cap
(`ramp_schedule` for weeks 1-4 of an active segment, else
`weekly_new_prospect_cap`). Stop once reached, even if more candidates
remain — they roll to next week.

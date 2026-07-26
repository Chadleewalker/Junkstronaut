# Visualization Audit — review-viz.html (Round 5, Phase 3)

Auditor: viz-reviewer. Sources checked: `review-viz.html`, `reviews/viz-data.json`,
`reviews/viz-spec.md`, the six reviewer files, and `reviews/SYNTHESIS.md`.
All severity tallies below were recounted by hand from the review files.

---

## 1. Accuracy errors

### A1 — MUST-FIX: The severity-tally footnote is false, and the page contradicts itself on screen

The V1 caption renders (with runtime-computed numbers):

> "Round 1: 3 BLOCKING · 20 MAJOR · 7 MINOR → Final: 10 BLOCKING · 14 MAJOR ·
> 6 MINOR. Note: SYNTHESIS.md states 10/14/6; counts here are recomputed from
> the six review files (the synthesis tally missed player-psychologist F5's
> MINOR→MAJOR upgrade)."

The computed numbers and the "note" cannot both be true, and on the rendered
page they sit in the same sentence: the displayed final counts ARE 10/14/6,
identical to SYNTHESIS.md, yet the note claims they differ and accuses the
synthesis of a miscount.

Ground truth, recounted from the review files:

- Round 1: 3 BLOCKING / 20 MAJOR / 7 MINOR (viz-spec.md §0 has this right).
- Round 2 moves: 7 MAJOR→BLOCKING, 1 MINOR→MAJOR (player-psychologist F5),
  0 downgrades. Final: 10 BLOCKING / 14 MAJOR / 6 MINOR.
- **SYNTHESIS.md's stated tally (10/14/6) is correct.** It did not miss the
  F5 upgrade — 20 − 7 + 1 = 14 MAJOR already includes it.

The error originates in `viz-data.json`'s `aggregates` block, which
contradicts the JSON's own `findings[]` array:

- `findings_per_severity_round1: {BLOCKING:3, MAJOR:21, MINOR:6}` — wrong;
  counting the array's own `severity_round1` fields gives 3/20/7.
- `findings_per_severity_final_computed: {BLOCKING:10, MAJOR:15, MINOR:5}` —
  wrong; counting `severity_final` gives 10/14/6.
- `tally_note` — the false "synthesis missed the upgrade" narrative.

The builder correctly computed counts at runtime (so all bars, lanes, stats,
and lane labels on the page are right) but hardcoded the extractor's false
note into the V1 caption, and repeated the wrong 10/15/5 figure in the HTML
builder-notes comment (lines 7–17).

**Fix:** delete or rewrite the footnote (the computed counts simply agree
with SYNTHESIS.md), correct the builder comment, and correct the three
aggregate fields in viz-data.json so the file stops contradicting itself.

### A2 — MUST-FIX: Misattributed "view finding" links in the cross-examination matrix detail strips

`refLinks()` (HTML ~line 638) builds finding links by cross-producting every
`F#` in the engagement's `their_finding` string with every reviewer in
`about`. For multi-target conflicts this attributes findings to the wrong
reviewer:

1. **feasibility-lead → systems-designer / business-analyst** cell (conflict
   re: "systems F3 / business F2"): correctly links systems-designer-F3 and
   business-analyst-F2, but ALSO emits "view business-analyst-F3" (the
   production-fallback finding — unrelated) and "view systems-designer-F2"
   (the pricing finding — not the conflict's target).
2. **adversarial-qa → systems-designer / business-analyst** cell (same
   "systems F3 / business F2" ref): same two wrong links.
3. **systems-designer → player-psychologist / business-analyst** cell
   (conflict re: "psychologist F5 ... / business-analyst F2"): emits "view
   business-analyst-F5" ('sells anywhere' — wrong finding entirely) and
   MISSES player-psychologist-F5, the actual target, because the code
   matches on the substring "player" which the ref ("psychologist F5")
   doesn't contain.

Every wrong link deep-links the reader to a finding the conflict is not
about, with row-flash emphasis — an active misattribution, not just a dead
link. **Fix:** either curate the link targets per engagement (as was done
for ISSUE_ENG) or drop the auto-generated links from multi-target conflicts.

### A3 — Note (borderline, no action required): paraphrased verdict

The masthead verdict line comes from the extractor-authored
`verdict_one_line`, a condensation rather than a verbatim clause of
SYNTHESIS.md's verdict paragraph. Substance is faithful ("not ready to
drive production"; §2.6 rewrite is the single most important change), so I
am not flagging it as an error — but the full verdict paragraph appears
nowhere on the page (see U7).

### Everything else checked clean

- All 30 findings present; 5 per reviewer; none missing, duplicated, or
  invented. Titles, descriptions, and references are faithful trims of the
  review files.
- Every per-finding `severity_round1` / `severity_final` matches the review
  files, including all 8 Round 2 revisions and the three held-at-BLOCKING
  findings. "Upgraded 7 to BLOCKING and 1 to MAJOR; none downgraded or
  withdrawn" is correct.
- Reviewer attributions correct throughout (findings table, slopegraph
  tooltips, matrix rows/columns, engagement "who" lines, issue chips).
- Top 5 issues: ranks, titles, severities, flagged-by lists (including
  "MAJOR→BLOCKING" notes), and STRENGTHENED/WEAKENED outcome tags all match
  SYNTHESIS.md, including Issue 5's contested-BLOCKING caveat.
- The curated ISSUE_ENG join is accurate: I traced all 21 mapped engagements
  to their Round 2 sources; each is relevant to its issue and verbatim in
  substance. Issue↔disagreement links (1↔D, 5↔A) match the spec and
  synthesis.
- Disagreements A–D: positions, holders (including C's systems-designer
  middle position), and escalation lines match SYNTHESIS.md word-for-word.
  B and C are present despite not being top-5 issues, as the spec requires.
- Quick wins (3) and the footer method note match.
- Matrix numbers: 19 conflicts / 20 connections computed correctly; diagonal
  self-revision counts (2 UPGR·3 HELD for systems-designer and
  player-psychologist; 1·4 for the other four) are correct; contested
  red-edge cells correspond exactly to the disagreement position-holder
  pairs.

---

## 2. Usability issues

- **U1 — MUST-FIX.** The self-contradicting tally footnote (A1). Beyond
  being false, it makes a first-time reader distrust the page's numbers: the
  note says the counts disagree with the synthesis while the same line shows
  them agreeing.
- **U2 — SHOULD-FIX.** V6 row expansion re-renders the entire tbody, so
  keyboard focus drops to `<body>` after every Enter/Space toggle. A
  keyboard user loses their place in a 30-row table each time they open a
  row. Restore focus to the toggled row after render.
- **U3 — SHOULD-FIX.** Sortable column headers show a static "▸" with no
  indication of the active sort column or direction; clicking looks inert
  unless you watch the rows closely. Swap the glyph per state (▸/▾/▴).
- **U4 — SHOULD-FIX.** The V5 matrix uses `role="grid"` with headers and
  cells as direct grid children and no `role="row"` wrappers — invalid ARIA
  grid semantics; screen readers will not announce row/column context. The
  per-cell aria-labels partially rescue it, but either add proper row
  structure or downgrade to `role="group"` + labels.
- **U5 — NICE-TO-FIX.** Chevrons on issue cards and disagreement panels
  don't rotate or change when expanded; open/closed state is only inferable
  from the body's presence.
- **U6 — NICE-TO-FIX.** The slopegraph legend colors "— changed" red, but
  one changed line (player-psychologist F5, MINOR→MAJOR) is amber; the
  legend mildly implies all movement went to BLOCKING.
- **U7 — NICE-TO-FIX.** The full one-paragraph verdict from SYNTHESIS.md
  appears nowhere; only the one-line condensation does. The footer has room
  for it.
- **U8 — NICE-TO-FIX.** Under `prefers-reduced-motion`, the `.flash` class
  applied to a disagreement panel is never removed, leaving a permanent blue
  inset outline after following an issue-card link (the table-row flash does
  clean itself up).
- **U9 — NICE-TO-FIX.** Reviewer bars and chips show role ids only; the spec
  asked for a one-line lens per reviewer. The builder correctly noted the
  JSON lacks this field — worth adding to the extractor rather than the
  HTML.
- **U10 — Acceptable as-is.** The MAJOR lane of the slopegraph packs 20
  near-parallel lines at 13px spacing; hover dimming and 10px hit strokes
  make it workable with a mouse, and all tooltip content is reachable via
  the table, but touch users effectively can't disambiguate lines.

Interaction spot-checks that passed: V1 segment → table filter handoff
(including Round 1/final state sync), slopegraph click → row flash,
issue-card → disagreement deep link with auto-open, matrix filters and
detail strip, Escape/× closing, `#issue-N` deep links, empty matrix cells
correctly non-interactive, single-target "view finding" links all correct.

---

## 3. Verdict

**Not ready to show — one more builder pass needed.** The page is
structurally excellent and 95% faithful: every finding, severity,
attribution, disagreement, and synthesis outcome checks out, and the
interactive flows work. But it currently displays a false statement about
its own source data in the very first panel (A1) — a credibility-killer for
a report whose premise is fidelity — and three matrix cells deep-link
readers to the wrong findings (A2). Fix those two (and ideally the
viz-data.json aggregates so the error can't resurface), pick up U2–U4 if
cheap, and this is ready for an audience.

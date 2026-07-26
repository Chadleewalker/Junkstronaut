# Visualization Audit — `review-viz.html`

Audited against `reviews/viz-data.json`, `reviews/SYNTHESIS.md`, and the six
reviewer files (the finding text is embedded verbatim in both the JSON and the
HTML's inline `DATA` block, so they were cross-checked line-for-line).

Scope: data accuracy of every number/label/attribution, plus usability of the
six interactive visualizations.

---

## 1. Accuracy errors

The headline numbers and the great majority of labels are correct. Verified:

- **Total findings = 29.** `#s-total` renders `FINDINGS.length`; the array holds
  5+5+5+5+5+4 = 29. Matches `aggregate_counts.total_findings`.
- **Blocking = 3.** systems-designer F1, player-psychologist F1, adversarial-qa
  F1. Matches `blocking_finding_ids`.
- **Unresolved = 2** (disagreements A and B). Correct.
- **Severity split.** Final BLOCKING 3 / MAJOR 19 / MINOR 7 (= 29); Round-1
  BLOCKING 3 / MAJOR 18 / MINOR 8. I recounted both by hand from the finding
  list — both are exactly right, and the only difference is systems-designer F4
  (MINOR→MAJOR), which the code special-cases correctly in `round1Severity`.
- **Flow tally.** STRENGTHENED 10 / HELD 18 / UPGRADED 1 / WEAKENED 0 /
  WITHDRAWN 0. The "exactly one upgraded, nothing weakened or withdrawn" copy in
  Viz 3 is accurate.
- **Top 5.** All five cards, their severities, `flagged_by` chips, and the
  all-STRENGTHENED outcomes match `synthesis_top5` and SYNTHESIS.md. The Round-1
  severity stamps in each expanded trail (e.g. SYS F4 shown as MINOR) are correct.
- **Reviewer attributions** in every finding row, top-5 card, and disagreement
  panel trace to the right reviewer. No finding is missing, duplicated, or
  invented.
- **Conflict count.** The matrix builds 11 conflict links; matches
  `cross_examination_conflicts_raised: 11`.

### Error found

**E1 (matrix, moderate) — one red-outlined cell is mis-attributed to a
disagreement it does not belong to.**
Viz 2's own caption states red cells are "clashes that hardened into unresolved
board disagreements." The red outline is applied whenever a cell has a CONFLICT
link *and* both reviewers happen to appear in a disagreement's position list
(`disagPairKey`). That over-triggers for **systems-designer → business-analyst**:
the actual conflict recorded there is the *"anxiety hook gated late"* boundary
dispute, which did **not** escalate — yet the cell is outlined red and its drawer
offers a *"See unresolved disagreement A"* button. Disagreement A is the
break-even economic clash (SYS↔QA and BIZ↔QA), not this one. So one of the five
red cells asserts an escalation that the source data does not support.
Correctly-tagged red cells: SYS→QA, QA→SYS, BIZ→QA (all disagreement A) and
NAR→PSY (disagreement B). The stray one is SYS→BIZ.

### Non-surfaced data note (not an HTML error)

- `viz-data.json` reports `cross_examination_connections_found: 21`, but there
  are only **19** discrete connection link objects (which is what the matrix
  actually counts and renders). The "21" figure is never displayed in the HTML,
  so it is not a visible defect — but it is an internal inconsistency in the
  source JSON worth correcting at the source.

---

## 2. Usability issues

**U1 — "Filter table to this clash →" only filters to one side of the clash.
SHOULD-FIX.**
In Viz 5 the button calls `setFilter({reviewer: d.positions[0].reviewer})`, i.e.
only the *first* participant. For disagreement A that shows systems-designer
findings alone and silently drops adversarial-qa and business-analyst; the code
comment even acknowledges the limitation. The label promises "this clash" (both
sides) but delivers one lens, which will mislead a presenter drilling in. Either
relabel it ("Show systems-designer findings") or filter to all participants.

**U2 — Matrix corner label contradicts the caption. SHOULD-FIX.**
The corner header reads `engages →` / `▼ engaged by`, implying rows are the
*engaged* party, while the caption directly below says "Rows engage columns" and
the per-cell aria-labels correctly say "[row] engages [column]." The `▼ engaged
by` line is backwards relative to the authoritative caption and will confuse a
first-time reader trying to decode who initiated whom. Align the axis label with
the caption.

**U3 — Disagreement B is visually one-sided in the matrix. NICE-TO-FIX.**
Because player-psychologist's conflict entry points at systems-designer (not
narrative), only NAR→PSY is outlined for disagreement B; the reciprocal PSY→NAR
cell is blank. That accurately reflects the link direction, but on a projector it
under-sells B as a two-way clash. A reader scanning for "the disagreements" sees
a lopsided pair. Consider outlining both directions for any pair that feeds a
disagreement.

**U4 — Reviewer chips in the findings table look clickable but aren't.
NICE-TO-FIX.**
Row chips use the `.chip` class, which keeps its hover highlight (border/color
brighten on hover), but they carry `cursor:default` and no handler — clicking one
just toggles the row like any other cell. Elsewhere chips (top-5 "Flagged by",
disagreement names) *are* interactive filters, so the inconsistent affordance
invites a dead click. Suppress the hover state on the static table chips.

**U5 — "STRENGTHENED" is used for findings the reviewers explicitly held, not
upgraded. NICE-TO-FIX.**
The table/flow taxonomy marks several findings STRENGTHENED (e.g. narrative F5,
player F5) whose own Round-2 notes say "held at MINOR … reinforced/second-sourced"
with no severity change. This is a defensible definition (STRENGTHENED = confidence
up, severity unchanged; UPGRADED = severity up), and it keeps the top-5 in step
with SYNTHESIS. But nothing on the page defines the four outcome words, so a
viewer may read STRENGTHENED as a severity change. A one-line legend distinguishing
HELD / STRENGTHENED / UPGRADED would remove the ambiguity.

### Things that are fine

First-time orientation is good: every section carries an eyebrow ("Viz N — …"),
a title, and a plain-language sub-line telling the reader what to do ("Click any
segment to filter…"). Visual hierarchy is clear (masthead stats, oversized rank
numerals, severity-colored stamps as the only color). Tooltips, the matrix
drawer, top-5 trails, sortable/filterable table, active-filter chips, sticky
filter strip, keyboard focus states, `prefers-reduced-motion`, and the aria
labeling on the flow SVG all behave as expected. No truncation, overlap, or
unreadable text found in the markup. Bar segments, tally segments, top-5 chips,
and matrix cells all wire to the shared table filter correctly.

---

## 3. Verdict

**Ready to show, with one recommended correction first.** There are no
page-breaking MUST-FIX defects — the counts, severities, attributions, and
top-5 outcomes are all accurate, and the interactions work. However, before
presenting I'd fix **E1** (the stray SYS→BIZ red cell falsely claiming an
escalation) and **U1** (the clash-filter button that only shows one reviewer),
because both directly undercut Viz 2/Viz 5 — the sections whose entire purpose is
to demonstrate the cross-examination payoff. Those two are SHOULD-FIX. U2–U5 are
polish that can ship as-is if time is short. Recommend one quick builder pass for
E1 + U1, then it is projector-ready.

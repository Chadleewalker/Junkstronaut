# Interactive Visualization Spec — *Junkstronaut* Review Board

**For:** html-builder (Round 5, Phase 2) → produces `review-viz.html`
**Reads:** `reviews/viz-data.json` (data) + this file (design intent)
**Source of truth for content:** the six `reviews/*.md` files and `reviews/SYNTHESIS.md`

This spec defines six visualizations. Each is chosen because the review
data actually supports it and because it shows an insight none of the
others does. Nothing decorative. If two candidates showed the same thing,
the clearer one was kept and the other folded in (see "Cuts" at the end).

---

## Data model (expected `viz-data.json` schema)

The data-extractor writes `viz-data.json` in parallel with this spec, so the
exact keys may differ slightly. Build against these logical fields and
reconcile names against the actual JSON; do **not** invent values not present
in the file.

- `meta`: `title`, `date`, `verdict` (one-liner), `totalFindings`,
  `blockingCount`, `unresolvedCount`.
- `reviewers[]`: `{ id, name, shortName }` — the six lenses. Fixed display
  order everywhere: systems-designer, narrative-critic, player-psychologist,
  feasibility-lead, adversarial-qa, business-analyst.
- `findings[]`: one per Round-1 finding (≈29 total).
  `{ id, reviewerId, number, title, severity, round1Severity, finalSeverity,
  summary, traces[], crossExamOutcome, top5Rank|null }`.
  `crossExamOutcome ∈ { STRENGTHENED, HELD, UPGRADED, WEAKENED, WITHDRAWN }`.
  (From the data: many HELD/STRENGTHENED, exactly one UPGRADED —
  systems-designer F4 MINOR→MAJOR — and zero WEAKENED/WITHDRAWN. Render the
  real counts, whatever they are.)
- `crossExam.links[]`: the Round-2 traffic between reviewers.
  `{ fromReviewerId, toReviewerId, kind, fromFinding, toFinding, note }`,
  where `kind ∈ { CONNECTION, CONFLICT }`.
- `disagreements[]`: the unresolved board escalations.
  `{ id, title, positions[]:{ reviewerId, stance }, escalation }`.
- `top5[]`: `{ rank, title, severity, statement, flaggedBy[], outcome,
  trail:{ original, crossExam, finalStatus } }`.

Severity is the ONLY color in the document. Fixed palette (match
`review-board.html`): BLOCKING `#E5484D`, MAJOR `#F5A623`, MINOR `#5A6270`.
Background `#16181D`, panel `#1F232B`, text `#E8E6E1`, muted `#8A8F98`,
hairline `#2A2F38`. Reviewer chips are monochrome outlines, never colored.
No emoji, no icons, no gradients, no drop shadows, radius ≤ 4px. Everything
must read from the back of a classroom.

---

## Global interaction model

There is **one shared filter state** driving the whole page:
`{ reviewer, severity, round, outcome }`, any of which may be null (= all).
Clicking a bar segment, a matrix cell, an outcome band, or a top-5 chip sets
the corresponding filter and scrolls the Findings Table (Viz 6) into view
with a brief highlight. A persistent "Filters: … ✕ clear all" strip sits
directly above the table so users always see and can undo the active state.
`prefers-reduced-motion` disables scroll-smoothing and the single section
fade-up; no other motion exists.

---

## Viz 1 — Severity Breakdown

**Insight:** where the weight of criticism sits, per reviewer and overall —
and that BLOCKINGs are concentrated in three lenses, not spread evenly.

1. **Type:** horizontal stacked bar chart, one row per reviewer, segments
   ordered BLOCKING → MAJOR → MINOR left-to-right. Above the six reviewer
   rows, one wider **AGGREGATE** row totals all findings. A small toggle
   ("Per reviewer / Aggregate only") lets the presenter collapse to just the
   totals bar for the projector.
2. **Reads:** `findings[].reviewerId`, `findings[].finalSeverity` (default;
   a "Round 1 severity" toggle switches the count basis to `round1Severity`
   so the audience can see the one upgrade move a segment). `reviewers[]` for
   row labels and order.
3. **Interaction:**
   - Hover a segment → tooltip: reviewer, severity, count, and the finding
     titles in that bucket.
   - Click a segment → sets `{reviewer, severity}` filter, scrolls to table.
   - Segments are labeled with the integer count inside the bar (min 18px);
     bars are the severity color at full saturation, thin hairline separators
     between segments rather than gaps.
4. **Layout:** full content width (max 1100px), near the top, right after the
   masthead/stat blocks. Height ~ 7 rows × 44px + labels. This is the
   orientation chart — it comes first.

---

## Viz 2 — Cross-Examination Matrix (the multi-agent payoff)

**Insight:** who actually engaged whom in Round 2, whether that engagement
was a CONNECTION (combined-lens discovery) or a CONFLICT (clash), and where
the clashes hardened into unresolved board disagreements. This is the single
artifact that makes "six isolated agents cross-examining each other" visible.

1. **Type:** 6×6 grid / heatmap. Rows = the reviewer doing the engaging
   ("from"), columns = the colleague engaged ("to"), fixed reviewer order on
   both axes. Diagonal cells are inert (a lens doesn't cross-examine itself) —
   render them as muted hatch. Each off-diagonal cell encodes the Round-2
   links from `crossExam.links`:
   - cell **fill intensity** = number of links between that ordered pair;
   - a small **corner marker** distinguishes cells that contain a CONFLICT
     (open square outline) from connection-only cells (filled dot), so clash
     cells are findable at a glance;
   - cells whose conflict feeds an unresolved item in `disagreements[]` get a
     **1px BLOCKING-red outline** — these are "the active disagreements"
     called out in the brief. Everything else stays monochrome; red here is
     doing real semantic work (an unresolved clash), consistent with the
     severity-only color rule.
2. **Reads:** `crossExam.links[]` (`fromReviewerId`, `toReviewerId`, `kind`,
   `note`, `fromFinding`, `toFinding`); `disagreements[]` to know which cells
   to red-outline; `reviewers[].shortName` for axis labels.
3. **Interaction:**
   - Hover a cell → tooltip listing each link in it: "SD F1 × Feasibility F1
     — [note]" with kind tag.
   - Click a cell → opens a detail drawer/panel beneath the matrix showing the
     full `note` text for every link in that pair (verbatim-in-substance from
     the review files). If the cell is red-outlined, the drawer also shows a
     "See disagreement →" button that scrolls to the matching panel in Viz 5.
   - A legend explains fill intensity, connection dot, conflict square, and
     the red disagreement outline.
4. **Layout:** full width, square-ish (~560×560 plus axis labels and the
   detail drawer below). Sits after Viz 1. Give it generous whitespace; it is
   the conceptual centerpiece of the interactive report even though the Top 5
   is the emotional centerpiece.

---

## Viz 3 — Finding Flow (Round 1 → after cross-examination)

**Insight:** cross-examination did not soften this board — it reinforced it.
Almost every finding was HELD or STRENGTHENED, exactly one was UPGRADED in
severity (systems-designer F4, MINOR→MAJOR), and **nothing was weakened or
withdrawn.** That "nothing withdrawn" is itself the headline.

1. **Type:** a two-column slope/flow. Left column = Round-1 severity buckets
   (BLOCKING/MAJOR/MINOR) with counts; right column = post-cross-exam severity
   buckets. Draw a thin connector for each finding from its R1 bucket to its
   final bucket. Findings that did not change severity run as flat horizontal
   hairlines; the one that moved (MINOR→MAJOR) crosses and is drawn heavier
   and labeled. Beneath the slope, a single-row segmented **outcome tally**:
   STRENGTHENED n · HELD n · UPGRADED n · WEAKENED 0 · WITHDRAWN 0.
2. **Reads:** `findings[].round1Severity`, `findings[].finalSeverity`,
   `findings[].crossExamOutcome`.
3. **Interaction:**
   - Hover a connector → finding title + "R1: X → Final: Y (outcome)".
   - Click an outcome segment in the tally → sets `{outcome}` filter, scrolls
     to table. (This is how a user pulls up "show me everything that was
     STRENGTHENED.")
   - The WEAKENED/WITHDRAWN segments render at zero width with a muted "0"
     label — the emptiness is the point; do not hide them.
4. **Layout:** full width, ~320px tall, after the matrix. Keep it visually
   quiet (hairline connectors, severity color only on the bucket labels) so it
   reads as a ledger, not a firework.

*Note:* if the extracted data shows more severity movement than the single
upgrade, this same slope renders it correctly — no special-casing.

---

## Viz 4 — Top 5 Issues Drill-Down (centerpiece)

**Insight:** the five highest severity×confidence issues, each openable to its
full trail — original finding → cross-examination → final status. This is the
synthesis made explorable.

1. **Type:** five stacked expandable cards, ranked 1–5 with an oversized rank
   numeral (~90px, muted, low opacity) beside each. Collapsed state shows:
   rank numeral, severity stamp, one-line problem statement (26–32px), the
   reviewer chips that flagged it, and the cross-exam outcome tag
   (SURVIVED/STRENGTHENED/WEAKENED — from `outcome`). Expanded state reveals
   three labeled sub-blocks: **Original finding**, **Cross-examination**
   (the arguments that strengthened/challenged it), **Final status**.
2. **Reads:** `top5[]` — `rank`, `severity`, `statement`, `flaggedBy[]`
   (→ monochrome reviewer chips), `outcome`, `trail.original`,
   `trail.crossExam`, `trail.finalStatus`.
3. **Interaction:**
   - Click a card header (or its rank) → expand/collapse the trail. Multiple
     cards may be open at once; keyboard-accessible (Enter/Space, `aria-expanded`).
   - Click a reviewer chip → sets `{reviewer}` filter and scrolls to table.
   - Severity stamp renders as the signature inspection-stamp style: 1px solid
     border in the severity color, transparent fill, letterspaced small caps.
4. **Layout:** full width, one card per row, generous vertical rhythm (64px+
   between cards is too much; ~28px between cards, 64px before the section).
   Positioned after the Finding Flow — this is where a reader spends the most
   time, so it gets the most room.

---

## Viz 5 — Active Disagreement Panels

**Insight:** the two conflicts the board could not settle, each shown as
opposing positions side by side so the reader can judge the clash rather than
be handed a verdict. These are the cells the matrix (Viz 2) outlines in red.

1. **Type:** one panel per unresolved disagreement. Disagreement A has
   **three** positions (systems-designer / adversarial-qa / business-analyst
   read "break-even" as floor / trap / reassurance) — render as three
   columns. Disagreement B has **two** positions (narrative-critic vs
   player-psychologist on tone) — render as two columns. Each column: reviewer
   name (monochrome chip), their stance summary. Below the columns, an
   **ESCALATED** stamp with the one-line question being sent up to the board.
2. **Reads:** `disagreements[]` — `title`, `positions[].reviewerId`,
   `positions[].stance`, `escalation`. Panel count is data-driven; do not
   hardcode two. If `disagreements[]` is empty, show the empty state:
   "The board reached consensus — rerun Round 2 if that seems too easy."
3. **Interaction:**
   - Each panel has an anchor id so Viz 2's "See disagreement →" scrolls here.
   - Hover a position column → subtle hairline emphasis; no color change
     (color stays reserved for severity).
   - A "filter table to this clash" link sets the reviewer filter to the
     panel's participants.
4. **Layout:** full width. Disagreement A's three-column and B's two-column
   panels stack vertically with a hairline rule between. Comes after Top 5.

---

## Viz 6 — Filterable / Sortable Findings Table (the substrate)

**Insight:** the complete evidence base, every finding in one place, so the
reader can slice it by lens, severity, round, or outcome and sort it. This is
the drill-down floor that every other viz filters into.

1. **Type:** a dense, filterable, sortable table. Columns: Reviewer · #
   · Severity (stamp) · Finding title · Round-2 outcome · Traces (§ refs).
   Each row expands on click to show the finding `summary`. A control bar
   above the table exposes: reviewer dropdown, severity toggle chips
   (BLOCKING/MAJOR/MINOR), round toggle (R1 findings / R2 revisions / all),
   outcome dropdown, and a free-text search over titles/summaries. Column
   headers sort (severity sorts BLOCKING→MINOR by rank, not alphabetically).
2. **Reads:** the full `findings[]` array — all fields.
3. **Interaction:**
   - Any control edits the shared global filter state; the table re-renders
     and the "Filters: … ✕ clear all" strip updates.
   - This table is the scroll target for clicks in Viz 1, 2, 3, 4, and 5.
   - Click a row → expand `summary`; click Severity header → sort by severity;
     etc. Sort and filter compose (filter first, then sort the result).
   - Show a live "showing X of N findings" count so an empty filter result is
     never mistaken for a bug.
4. **Layout:** full width, at the bottom as the reference layer. Rows are
   hairline-separated (no boxes-within-boxes), min 18px text, severity only as
   the stamp in its column.

---

## Cuts and consolidations (why not more)

- **Reviewer agreement matrix vs. cross-examination network** — these showed
  the same relation (who engaged whom). Kept the **matrix** (Viz 2) because a
  6×6 grid reads cleanly from the back of a room and highlights the active
  disagreements structurally; a node-link network of six nodes with many
  labeled edges would be messier and no more informative. The network's unique
  value — *what* each connection found — is preserved in the matrix's cell
  detail drawer.
- **No standalone severity donut/pie** — Viz 1's stacked bars already carry
  the per-reviewer and aggregate distribution; a pie would restate it less
  legibly and violate the "no charts unless counting real numbers, kept
  minimal" restraint.
- **Finding Flow kept deliberately quiet** — with one severity change and zero
  withdrawals, a lavish Sankey would be decorative. The slope-plus-tally form
  states the real, modest story (cross-exam only reinforced) without pretending
  to more movement than the data holds.
- **Six visualizations total** — the maximum allowed, and each earns its place:
  1 orients, 2 shows the multi-agent engagement, 3 shows what cross-exam did,
  4 is the rank-ordered payoff, 5 is the unresolved clash, 6 is the searchable
  ground truth everything filters into.

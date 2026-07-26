# Visualization Spec — Junkstronaut Review Board Interactive Report

Author: viz-designer (Round 5, Phase 1)
Target file: `review-viz.html` (single self-contained file, inline CSS,
vanilla JS, inline SVG for charts — no external libraries or assets).
Data source: `reviews/viz-data.json`. Ground truth for all text:
`reviews/*.md` and `reviews/SYNTHESIS.md`.

---

## 0. Data contract

The spec below names fields as I expect them from the data-extractor. If
viz-data.json uses different key names for the same concepts, adapt the
bindings — but every visualization's REQUIRED data is listed so the builder
knows what must exist. Nothing may be invented: if a field is missing from
the JSON, pull the text verbatim-in-substance from the review files.

Expected shape (builder: reconcile against the actual file):

- `meta` — document title, review date, totals
  (30 findings; R1 severities: 3 BLOCKING / 20 MAJOR / 7 MINOR;
  final severities: 10 BLOCKING / 14 MAJOR / 6 MINOR — builder must
  recount from the findings array, not trust hardcoded totals).
- `reviewers[]` — id, display name, one-line lens.
  Six ids: systems-designer, narrative-critic, player-psychologist,
  feasibility-lead, adversarial-qa, business-analyst.
- `findings[]` — one entry per Round 1 finding (30 total):
  `id` (e.g. `"adversarial-qa-F1"`), `reviewer`, `title` (the finding
  heading), `summary` (1–2 sentence trim of the problem text),
  `severityR1`, `severityFinal`, `revision`
  (`"upgraded" | "held" | "downgraded" | "withdrawn"`), `revisionReason`
  (short quote from the Round 2 REVISIONS block, empty if held).
- `engagements[]` — one entry per Round 2 conflict/connection:
  `from` (reviewer id), `about` (reviewer id(s) engaged), `type`
  (`"conflict" | "connection"`), `targets` (finding ids referenced),
  `summary` (1–2 sentence trim of the argument).
- `topIssues[]` — the 5 synthesis issues: `rank`, `title` (one-line
  problem statement), `flaggedBy[]` ({reviewer, findingId, severity
  note e.g. "MAJOR→BLOCKING"}), `outcome`
  (`"SURVIVED" | "STRENGTHENED" | "WEAKENED"`), `summary`,
  `disagreementRef` (id of related unresolved disagreement, or null).
- `disagreements[]` — the 4 escalations (A–D): `id`, `title`,
  `positions[]` ({reviewers[], argument}), `escalation` (the "Decision
  escalated" line).
- `quickWins[]`, `verdict` (final paragraph of SYNTHESIS.md).

Known cross-references the extractor should have captured (builder can
verify against SYNTHESIS.md): Issue 5 ↔ Disagreement A; Issue 1 ↔
Disagreement D. Disagreements B and C do not map to a top-5 issue —
they must not be dropped.

---

## Global design rules

- Palette and type: reuse the Round 4 system. Background `#16181D`,
  panel `#1F232B`, text `#E8E6E1`, muted `#8A8F98`, hairline `#2A2F38`.
  Severity is the dominant color channel: BLOCKING `#E5484D`,
  MAJOR `#F5A623`, MINOR `#5A6270`. Severity always appears as the
  small-caps stamp (1px border, transparent fill, letterspaced) WITH the
  word spelled out — color is never the only encoding (colorblind
  safety).
- One additional accent is permitted in this interactive artifact for
  engagement type, because conflict-vs-connection is a core dimension:
  conflicts use BLOCKING red `#E5484D`, connections use a desaturated
  steel blue `#6E9BC5`. Always pair with a text label ("CONFLICT" /
  "CONNECTION").
- Layout: single column, max-width 1100px, 64px+ between sections.
- Motion: 150–200ms ease on expand/collapse and drawer slide only;
  everything instant under `prefers-reduced-motion`.
- Every interactive element keyboard-reachable (real `<button>`,
  `<details>`, or tabindex + Enter/Space handlers).
- Tooltips: single reusable positioned div; on touch/no-hover devices,
  tap = click behavior (tooltips are never the only path to info).

---

## Page order

1. Masthead + severity breakdown (V1)
2. Finding flow slopegraph (V2)
3. Top 5 issues drill-down (V3)
4. Unresolved disagreements (V4)
5. Cross-examination matrix (V5)
6. All-findings table with filters (V6)
7. Footer: method note ("Six isolated agent contexts · parallel review ·
   cross-examination · moderated synthesis") + source line + quick wins
   as three short list items (no chart — they're prose).

Rationale for order: headline numbers → what cross-examination did to
them (the story of this review is the upgrade wave) → what matters most
→ what's still contested → how the board interacted → the full record.

---

## V1 — Masthead + severity breakdown

**What it shows:** The report identity, the verdict, and how findings
distribute across severities — per reviewer and in aggregate — with the
Round 1 → Final shift as the headline.

**Type:** Stat blocks + one horizontal stacked-bar panel with a
two-state toggle.

**Data:** `meta`, `verdict` (first clause only, e.g. "This document is
not ready to drive production"), `findings[].severityR1/severityFinal/
reviewer`.

**Layout:**
- Masthead row: "DESIGN REVIEW BOARD — INTERACTIVE" eyebrow, document
  title, date, one-line verdict. Right-aligned: three large stat blocks
  — total findings (30), BLOCKING count (renders per toggle state:
  3 → 10), unresolved disagreements (4).
- Below, full-width panel (~260px tall): six horizontal stacked bars,
  one per reviewer (labeled with name + lens on the left, ~220px
  gutter), segments sized by count of BLOCKING/MAJOR/MINOR in severity
  order. A seventh, visually separated "ALL REVIEWERS" bar at the
  bottom, thicker. Segment counts printed inside segments when width
  permits, else on hover.
- Toggle: two-button segmented control top-right of the panel —
  "ROUND 1" / "AFTER CROSS-EXAM" (default: AFTER CROSS-EXAM). Switching
  re-renders bar segments and the masthead BLOCKING stat. Under the
  toggle, a fixed caption line: "Cross-examination upgraded 7 findings
  to BLOCKING and 1 to MAJOR; none were withdrawn."

**Interactions:**
- Hover a segment: tooltip lists the finding titles in that bucket.
- Click a segment: jumps to V6 with reviewer + severity filters applied.
- Toggle change: masthead BLOCKING stat and bars update; if
  reduced-motion is off, a 150ms width transition on segments.

**Size/position:** Top of page. Masthead ~200px, bar panel ~280px.

---

## V2 — Finding flow slopegraph ("What cross-examination did")

**What it shows:** Each of the 30 findings as a line from its Round 1
severity to its post-cross-examination severity. The visual story: a
fan of 8 rising lines (7 into BLOCKING, 1 MINOR→MAJOR) against 22 flat
lines. This is chosen over a Sankey: with only 3 ranks and 8 movers,
individual traceable lines are clearer than aggregated ribbons, and
every line is a real finding you can hover.

**Type:** Two-column slopegraph, inline SVG, ~900×420px.

**Data:** `findings[]` — `id`, `title`, `reviewer`, `severityR1`,
`severityFinal`, `revision`, `revisionReason`.

**Layout:**
- Left axis labeled "ROUND 1", right axis "AFTER CROSS-EXAMINATION".
  Three lanes top-to-bottom: BLOCKING, MAJOR, MINOR, each lane labeled
  with a severity stamp on both sides plus the count at that side
  (e.g. left "MAJOR · 20", right "MAJOR · 14").
- Within a lane, findings are spread vertically, grouped by reviewer
  (stable order) so lines don't cross pointlessly. Endpoints are 6px
  dots colored by the severity at that end.
- Unchanged findings: 1.5px lines in muted `#5A6270` at 60% opacity.
  Changed findings: 2.5px lines colored by FINAL severity at full
  opacity, drawn on top. No arrowheads (direction is left→right by
  convention).

**Interactions:**
- Hover a line or endpoint: line thickens, others dim to 25%; tooltip
  shows reviewer chip, finding title, "MAJOR → BLOCKING", and the
  `revisionReason` quote (e.g. QA on bankruptcy: "A soft-lock that most
  new players can plausibly reach... is a shipping blocker").
- Click: scrolls to V6 and highlights that finding's row (2s hairline
  flash).
- Legend row beneath: "— changed (8)" / "— held (22)"; clicking either
  legend item isolates that set (toggle back on second click).

**Size/position:** Second section, full content width, ~500px tall
including title and legend. Section title: "THE UPGRADE WAVE — 30
findings, before and after cross-examination".

---

## V3 — Top 5 issues drill-down

**What it shows:** The synthesis's ranked top 5, each expandable to the
full evidence trail: who flagged it in Round 1 and at what severity, how
Round 2 moved it, and its outcome. This is the centerpiece.

**Type:** Five full-width expandable cards (accordion; multiple may be
open; card 1 starts open).

**Data:** `topIssues[]` (all fields), joined to `findings[]` via
`flaggedBy[].findingId` for R1 titles/summaries, and to `engagements[]`
filtered by `targets` for the cross-examination trail; `disagreementRef`
links into V4.

**Card, collapsed (~120px):**
- Oversized rank numeral (~90px, muted, low opacity) left of the text.
- Row 1: severity stamp (highest final severity among flaggedBy —
  BLOCKING for issues 1–3, MAJOR for 4–5) + outcome tag
  (STRENGTHENED/SURVIVED/WEAKENED as a bordered small-caps tag; WEAKENED
  in muted color with subcaption "diagnosis accepted; severity and
  remedy contested" for issue 5).
- Row 2: the one-line problem statement, 26–30px.
- Row 3: reviewer chips (monochrome outline), each carrying its severity
  note inline, e.g. `SYSTEMS-DESIGNER · F4 MAJOR→BLOCKING`.
- Chevron affordance right; entire header is the toggle button.

**Card, expanded — three stacked blocks under a hairline:**
1. "ROUND 1 — INDEPENDENT FINDINGS": one row per flaggedBy reviewer:
   chip, R1 severity stamp, finding title, 1-line summary.
2. "ROUND 2 — CROSS-EXAMINATION": the relevant engagements as rows,
   each prefixed CONFLICT (red) or CONNECTION (steel blue) with
   `from → about` chips and the argument summary. E.g. issue 5 shows
   the three contesting arguments (systems-designer's tier-1 physics
   scaffold, business-analyst's audience objection, feasibility-lead's
   budget objection) plus QA's amplifying connection.
3. "WHERE IT LANDED": the synthesis outcome sentence; if
   `disagreementRef` is set, a link-button "→ Unresolved disagreement A:
   Onboarding severity & fix" that scrolls to and opens that V4 panel.

**Interactions:** header click toggles; expand animates max-height
~200ms; deep links via `#issue-3` URL hashes so the report can be cited.

**Size/position:** Third section, title "TOP 5 ISSUES — ranked by
severity × confidence". Collapsed stack ~650px.

---

## V4 — Unresolved disagreements (position vs. position)

**What it shows:** The four escalations the board could not settle —
the honest residue of cross-examination. Kept separate from V3 because
disagreements B ("land safer": restore vs. delete) and C (sacrificial
cargo: exploit vs. mechanic) are not top-5 issues and would otherwise
vanish.

**Type:** Four expandable two-column panels (collapsed to title rows;
first panel open by default).

**Data:** `disagreements[]` — `id`, `title`, `positions[]`,
`escalation`.

**Layout per panel:**
- Header row: letter badge (A–D, monochrome), title, and the reviewers
  involved as chips split by "vs." (e.g. `PLAYER-PSYCHOLOGIST vs.
  BUSINESS-ANALYST · FEASIBILITY-LEAD · SYSTEMS-DESIGNER`).
- Expanded: two columns (stack vertically under 720px), one per
  position, each with reviewer chip(s) at top and the argument summary
  (18px body). Disagreement C has a third "middle position"
  (systems-designer) — render as a full-width third row beneath the two
  columns, labeled "MIDDLE POSITION".
- Footer strip inside the panel, hairline above: "DECISION ESCALATED:"
  + the escalation line in emphasized text.

**Interactions:** header toggles; if a V3 card linked here, the target
panel auto-opens and flashes its border once. No hover behavior needed.

**Size/position:** Fourth section, title "THE BOARD COULD NOT SETTLE —
4 decisions escalated to the design owner". Collapsed ~300px.

---

## V5 — Cross-examination matrix

**What it shows:** Who engaged with whom in Round 2, and whether the
engagement was a clash or a discovery. This is the multi-agent payoff
made visible: every reviewer engaged multiple colleagues; conflicts and
connections are both dense. Chosen over a node-link network diagram:
with exactly 6 actors, a 6×6 grid is fully readable, shows absences
(empty cells) as clearly as presences, and needs no layout physics.

**Type:** 6×6 heatmap-style grid, HTML table or CSS grid (not SVG),
cells ~110px square. Rows = the reviewer speaking ("FROM"), columns =
the colleague whose finding is engaged ("ABOUT").

**Data:** `engagements[]` aggregated per (from, about) pair: conflict
count, connection count, list of summaries. Multi-target connections
(e.g. one connection combining systems + narrative findings) count once
per `about` reviewer they cite. `disagreements[].positions[].reviewers`
marks contested pairs.

**Cell rendering:**
- Empty pair: blank cell, hairline border only.
- Otherwise: up to two count tokens: `2 ⊘ CONFLICT` in red outline,
  `1 ∞ CONNECTION` in steel-blue outline — rendered as two small
  stamp-style pills stacked, each showing its count and word (no
  icons/emoji; the words carry the meaning; drop the glyphs if they
  read decorative — words + color + count suffice).
- Cells belonging to an UNRESOLVED disagreement pair get a 2px red
  left border and are listed in the caption: "Red-edged cells feed the
  escalated disagreements above."
- Diagonal: the reviewer's own REVISIONS — muted cell showing e.g.
  `2 UPGRADED` / `HELD` derived from `findings[].revision`. Labeled in
  the legend: "diagonal = self-revisions after reading the board."

**Interactions:**
- Hover a cell: row and column headers highlight; tooltip shows the
  engagement titles (first ~80 chars each).
- Click a cell: a drawer slides up from the cell (or expands a
  full-width detail strip below the matrix — builder's choice, detail
  strip is simpler and preferred) listing each engagement in full:
  type tag, target finding ids, summary text, and a "view finding"
  link into V6. Clicking another cell replaces the strip; Escape or ×
  closes it.
- Two filter buttons above the grid: "CONFLICTS ONLY" / "CONNECTIONS
  ONLY" (toggle, mutually exclusive) — non-matching pills dim to 20%.

**Size/position:** Fifth section, title "CROSS-EXAMINATION — who
engaged whom". Grid ~780px wide, centered; detail strip grows below.

---

## V6 — All-findings table (filter/sort/drill)

**What it shows:** The complete record — all 30 findings — as the
drill-down destination every other visualization links into.

**Type:** Filterable, sortable table with expandable rows.

**Data:** `findings[]` (all fields).

**Columns:** Reviewer (chip) · Finding (id + title) · R1 severity
(stamp) · Final severity (stamp) · Changed ("↑ UPGRADED" in final-
severity color, or "—") .

**Controls row above the table:**
- Reviewer filter: seven chips (ALL + six reviewers), single-select.
- Severity filter: four stamps (ALL / BLOCKING / MAJOR / MINOR),
  single-select, applies to FINAL severity; a small checkbox "use
  Round 1 severity" flips which column filters and sorts.
- Changed-only checkbox: "show only findings cross-examination moved".
- Sort: clicking the R1, Final, or Reviewer column header sorts
  (severity order BLOCKING > MAJOR > MINOR; second click reverses).
  Default sort: Final severity desc, then reviewer.
- Live count line: "Showing 8 of 30 findings."

**Row expansion:** clicking a row toggles a detail panel: full finding
summary, source citation (e.g. "§2.5, §1 loss conditions"), and — if
changed — the revisionReason quote under a "WHY IT MOVED" label.

**Incoming links:** V1 segment clicks preset reviewer+severity filters;
V2 line clicks and V5 "view finding" links scroll here, clear
conflicting filters, and flash the row.

**Size/position:** Last content section, title "FULL BOARD — every
finding, both rounds". ~50px per collapsed row; table is the page's
dense tail, as in the Round 4 report.

---

## Cut list (and why)

- **Node-link cross-examination network** — cut as duplicative of V5;
  the matrix shows the same relationships with exact counts and
  visible absences, and builds reliably without layout physics.
- **Aggregate-only Sankey for finding flow** — cut in favor of the
  per-finding slopegraph (V2); with 30 findings and 8 movers,
  individual lines carry more information than ribbon widths.
- **Round-by-round timeline** — there are only two effective states
  (R1, post-R2); the V1 toggle and V2 slopegraph already encode the
  transition; a timeline would be decoration.
- **Quick wins visualization** — three prose items; rendered as a
  plain list in the footer, not a chart.

## Fidelity rules for the builder

- All counts must be computed from `findings[]` /`engagements[]` at
  build time (hardcode nothing that can drift from the JSON).
- All finding titles, arguments, and quotes must trace to the review
  files; trimming for length is allowed, rewording is not.
- If viz-data.json is missing a field this spec requires, source the
  text from the review files directly rather than inventing it, and
  note the gap in an HTML comment for the viz-reviewer.

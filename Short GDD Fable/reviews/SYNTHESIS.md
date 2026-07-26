# Review Board Synthesis — Junkstronaut GDD (gdd.txt)

Moderator synthesis of six specialist reviews (Round 1) and their
cross-examination (Round 2). Every item below traces to the review files;
nothing here is the moderator's own critique.

Post-cross-examination tally: 30 findings — 10 BLOCKING, 14 MAJOR, 6 MINOR.
(Round 1 opened with 3 BLOCKING; cross-examination upgraded 7 more.)

---

## 1. TOP 5 ISSUES (ranked by severity × confidence)

### 1. The satellite endgame is undefined where it matters most — and may be unwinnable by construction
**Flagged by:** adversarial-qa (F1, BLOCKING), systems-designer (F4, MAJOR→BLOCKING), narrative-critic (F1, MAJOR→BLOCKING), player-psychologist (F4, MAJOR)
**Cross-examination outcome:** STRENGTHENED
One sentence in §2.6 ("arrives damaged unless the touchdown is soft") leaves unanswered: whether a damaged satellite wins, whether the satellite can be destroyed outright (making the save permanently unwinnable with no covering fail state), how per-slot heat damage applies to a single hold-filling object, and — per the systems-designer's √mass arithmetic — whether a soft (<5 m/s) landing at doubled mass is even achievable at fixed mid-tier chute values. Four lenses converged on the same sentence independently; three upgraded to BLOCKING in Round 2. The narrative-critic adds that even a mechanical patch leaves the climax an unwritten ending.

### 2. Bankruptcy soft-lock: a broke-but-alive state that neither loss condition covers, sitting on the new-player path
**Flagged by:** systems-designer (F1, MAJOR→BLOCKING), adversarial-qa (F5, MAJOR→BLOCKING), player-psychologist (F3, MAJOR→BLOCKING)
**Cross-examination outcome:** STRENGTHENED
Three reviewers independently found the same sequence: crash destroys cargo (income) while adding a per-% repair bill; two bad runs put cash below the next launch cost. The player is alive, landed, and cannot pay Armstrong — triggering neither "stranded with no fuel" nor "0 HP." The psychologist's onboarding analysis moved it from tail-risk to expected: the triggering crashes are exactly what new players do while learning reentry. All three upgraded to BLOCKING in Round 2.

### 3. The tuning methodology is dead on its own schedule: the sweep needs an unbudgeted autopilot, and the fallback contradicts the design's central claim
**Flagged by:** feasibility-lead (F1 BLOCKING, F2 MAJOR), business-analyst (F3, MAJOR→BLOCKING)
**Cross-examination outcome:** STRENGTHENED
§3 claims the difficulty loop is too coupled and nonlinear for anything but empirical sampling; §4.4 timeboxes the sweep harness at half a day and falls back to hand-tuning. The feasibility-lead showed the harness's real cost is an autopilot that can fly the full launch/EVA/reentry/soft-landing loop — nowhere in the plan — so hand-tuning is the de facto plan of record, which by the document's own §3 claim cannot produce a tuned game. The business-analyst upgraded to BLOCKING on this basis: both the graded methodology and the tuned-game claim fail on the document's own terms. Composite (feasibility × QA × psychologist): as planned, nobody — human or bot — verifies the win condition before ship.

### 4. No prices, no run-count, no pacing targets: the sweep has no objective function and campaign length is unbounded
**Flagged by:** systems-designer (F2, MAJOR), business-analyst (F4, MAJOR), player-psychologist (F5, MINOR→MAJOR), feasibility-lead (connection)
**Cross-examination outcome:** STRENGTHENED
The document contains zero prices, no junk values beyond one ratio, and no target for how many runs a playthrough should take. Since the win requires near-full upgrades, upgrade prices ARE the game's pacing — and both tuning paths (sweep or hand-tuning) fail without target numbers to converge on. The board's composite: §3's four Playtester questions are the project's de facto acceptance criteria, and they can confirm completability but cannot detect a 6-hour grind, a bankruptcy spiral, or a miserable-but-beatable finale.

### 5. No onboarding for a one-way sequence that punishes first attempts with permanent loss
**Flagged by:** player-psychologist (F1, BLOCKING), amplified by adversarial-qa (connection: undefined first-session softlocks)
**Cross-examination outcome:** WEAKENED (diagnosis accepted; severity and remedy contested by three reviewers)
The reentry sequence (stage → plasma → chute → gear) has no tutorial, practice mode, or first-launch scaffolding, and mistakes destroy the session's haul in the first 20 minutes. QA's connection makes it worse: untutored key-mashing (stage on the pad, EVA mid-descent) lands in undefined softlock states. But three reviewers contested the BLOCKING grade: the systems-designer argues tier-1 physics may already scaffold the first hour (slow, light, low = coolest reentries — unverified); the business-analyst argues severity is unadjudicable without an audience statement; the feasibility-lead argues a tutorial is unaffordable and only a zero-cost rules change (e.g., free cargo-less first launch) fits the budget. Survives as at-least-MAJOR with the fix in dispute.

---

## 2. UNRESOLVED DISAGREEMENTS (escalated to the design owner)

### A. Onboarding: how severe, and what fix is affordable?
**player-psychologist:** BLOCKING — first-session confusion-then-punishment is a rage-quit generator; the two quit-prone moments live in narrow numeric windows only a sweep can tune, so hand-tuning cannot rescue them.
**business-analyst / feasibility-lead / systems-designer:** Severity unadjudicable without an audience statement (a grader playing 20 minutes is not a retail player); a tutorial is the first real feature creep in a disciplined document; the affordable fix is a constants-level rules change (free practice reentry / waived early repair fees), and the physics may already provide a natural ramp.
**Decision escalated:** state the audience, then choose tutorial-as-feature vs. zero-cost rules scaffolding.

### B. "Land safer": restore the missing mitigation track, or delete the promise?
**player-psychologist:** deleting the promise is unshippable — the endgame stacks the worst landing conditions on the longest run, and monotonic difficulty with zero purchasable relief leaves raw retry as the only lever.
**feasibility-lead:** the mitigation track is the one fix this schedule cannot buy — it adds a Coder session, QA invariants, shop UI, and a new dimension to both already-under-budgeted sweeps; delete the promise from §2.1 and state that difficulty ratchets.
**Decision escalated:** honesty-and-cheap vs. shippable-experience-and-expensive. (systems-designer and business-analyst flagged the axis as missing; both fixes remain on the table.)

### C. Sacrificial cargo: exploit to close, or mechanic to formalize?
**adversarial-qa:** cheap-junk-as-ablative-armor inverts the greed penalty; close it with deliberately punishing rules (highest-value slot burns first, destroyed mass does not shed) — two sentences.
**player-psychologist:** it is the design's only accidental player-agency mitigation; planned loss is motivating, so specify burn order deliberately, surface it in the UI, and make sacrificial padding intentional.
**systems-designer (middle position):** burning cargo converts the landing penalty into an income penalty and feeds the death spiral either way; the burn-order rule is a prerequisite for tuning regardless of which side wins.
**Decision escalated:** both sides agree the ambiguity must be resolved; the direction is a design-intent call the board cannot make.

### D. The finale's cruelty: soften it, or cash it?
**player-psychologist:** the satellite run risks a frustration cliff exactly where the player should feel mastery; repeatability needs relief.
**narrative-critic:** the terrifying finale is the correct dramatic apex of the #Feeling pillar — the fix is a graded ending (pristine vs. damaged producing different closing beats), not a softer landing; fix the payoff before touching the difficulty.
**Decision escalated:** contingent on Issue #1's resolution — both positions assume "damaged" gets a defined meaning first.

---

## 3. QUICK WINS

1. **Armstrong extends credit.** A debt mechanic closes the bankruptcy floor (Issue #2) and delivers the unclaimed company-store/blue-collar theme (narrative-critic F4) in one stroke — the systems-designer calls it an interlock the document gets almost for free.
2. **Write three numbers into the document:** intended total run count, intended mid-game earnings per run, and a rough tier-1:tier-3 price ratio. Restores an objective function to both tuning paths (Issue #4) at the cost of one paragraph.
3. **Two sentences on cargo burn order and destroyed-cargo mass.** Per adversarial-qa's Round 2 revision, this is now "a decision, not an investigation" — whichever direction Disagreement C resolves, the sentences cost nothing and unblock QA's invariant list.

---

## 4. VERDICT

This document is not ready to drive production. Its moment-to-moment core — the mass → heat → chute-window → touchdown interlock — survived six-lens review essentially intact, repeatedly cited as the strongest system work; but the game around that core has two undefined terminal states reachable through normal play (a destroyable win object and a bankruptcy dead-end), a shop whose advertised third axis does not exist, an economy with no numbers, and a tuning methodology whose own schedule guarantees its fallback — a fallback the document's central claim says cannot work. The single change that matters most is rewriting §2.6 into real rules: state whether a damaged satellite wins, whether it can be destroyed and what happens if it is, how heat damage applies to it, and whether a soft landing at doubled mass is achievable at fixed chute values — because until the game's one win condition is defined, nothing downstream (tuning, testing, pacing, the ending) can be built or verified.

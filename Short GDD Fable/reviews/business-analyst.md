# Production/Business Analyst — Round 1

Reviewer lens: feature creep, load-bearing vs. decorative features, market/audience positioning, document coherence (is this one game or several?). Story logic and systems math left to colleagues.

Overall: the scope discipline here is genuinely above average — the cut list in 4.3 is the strongest section in the document. The problems are almost all on the *positioning and production-plan* side: who this is for, what "done" means, and whether the plan's own fallbacks are consistent with its own claims.

---

## Finding 1 — The document has no audience or positioning statement, and it is visibly two documents at once
**Problem:** Nowhere does the document say who plays this game or what it sits next to. There is no target-player statement, no comparable titles (the obvious 2020s comps for a 2D haul-loop with a greed dial — Dome Keeper, Motherload-likes, Hardspace: Shipbreaker thematically, Lunar Lander mechanically — go unmentioned), no session-length or platform framing beyond "keyboard and mouse only." Meanwhile, roughly half the page count (Sections 3, 4.2, 4.4) is an AI-production methodology paper addressed to a grader, not a design document addressed to a team building a player experience. That dual audience is defensible for the assignment context ("Multi-Agent AI for Game Development, Assignment #1"), but the design half never gets its audience back: every design decision is justified by tuning cost or agent workflow, and none by a stated player or market.
**Source:** Header line; Sections 3, 4.2; the total absence of any audience/comps/positioning language anywhere in the document.
**Severity:** MAJOR

## Finding 2 — The shop's advertised decision axis does not exist in the upgrade catalog
**Problem:** The controls table (2.1) says the shop decision is "reach higher, land safer, or haul more." But 2.5 defines the purchasable upgrades as Fuel tank, Thruster, and Storage — and explicitly states "Parachute, heat shield, and jetpack ship at fixed mid-tier values." There is no "land safer" purchase. Worse for the economy's role as a game: the win condition (Section 1) says the satellite is "reachable and landable only near full upgrades," which means all 9 purchases are mandatory and the only real player choice is *ordering*. The document itself concedes Storage is the only interesting purchase ("double-edged"); Fuel tank and Thruster are pure gates. The shop is presented as a decision space but is functionally a linear progression track wearing one. Either add a real safety-side purchase or stop advertising a three-way choice.
**Source:** 2.1 shop row ("reach higher, land safer, or haul more") vs. 2.5 ("Parachute, heat shield, and jetpack ship at fixed mid-tier values") vs. Section 1 win condition.
**Severity:** MAJOR

## Finding 3 — The production plan's fallback contradicts the design's own central claim
**Problem:** Section 3 stakes the whole design on this: the difficulty loop "is coupled and nonlinear, so its behavior is determined empirically by sampling the parameter space" — i.e., you cannot hand-reason your way to good values. Section 4.4 then timeboxes the sweep harness (the sampling instrument) at half a day and declares the fallback is "hand-tuning for the rest of the build — the game ships either way." Both statements cannot be true. If the loop genuinely requires empirical sampling, the hand-tuning fallback ships an untuned game, and "ships either way" is a schedule promise, not a quality promise. This is the single biggest production risk in the document and it is currently papered over with a confident sentence.
**Source:** Section 3 ("determined empirically by sampling the parameter space") vs. 4.4 ("Fallback is hand-tuning for the rest of the build — the game ships either way").
**Severity:** MAJOR *(upgraded to BLOCKING in Round 2 — see below)*

## Finding 4 — No pacing targets: the economy sweep has nothing to sweep toward
**Problem:** The Playtester's economy sweep asks "does a lazy run break even?" and "is the satellite run beatable at full upgrades?" — both are binary feasibility checks, not pacing targets. The document never states how long a run should take, how many runs the campaign should take (win in 10 runs? 40?), or total intended playtime. Without a target progression curve, the economy sweep can confirm the game is *completable* but cannot tell you whether it is a 25-minute game or a 6-hour grind, and the 9-purchase mandatory upgrade ladder (Finding 2) makes campaign length a direct function of numbers no one has bounded. For a one-week deliverable that will be graded/demoed, "how long is this game" is a production question with no answer in the document.
**Source:** Section 3 Playtester description (binary questions only); omission of any run-length, run-count, or playtime target anywhere in the document.
**Severity:** MAJOR

## Finding 5 — "Sells anywhere you come down" quietly implies a world the document never scopes
**Problem:** 2.3 says "An intact landing sells the haul wherever you come down," and 4.3 confirms the tow fee was cut so "an intact landing sells anywhere." That implies landable terrain beyond the launch pad — a 2D surface of some extent, off-pad landing zones, and some answer to how the rocket returns to the pad for the next launch (walk back? instant reset? recovery screen?). None of this appears in the mechanics, the art plan (pixel packs + a planet generator), or the cut list. It is probably a one-line answer ("run auto-resets to the pad"), but right now it is an unpriced feature hiding inside a sentence about economy, and unpriced features are how disciplined scopes die in week-long builds.
**Source:** 2.3 and 4.3 ("sells anywhere"); omission of any world/terrain/recovery description.
**Severity:** MINOR

---

## What is load-bearing (for the record)
The reentry commit sequence (2.2), the mass-greed dial (2.4, 2.6), and the single value-by-altitude band are load-bearing and mutually reinforcing; nothing in the shipped feature list reads as decorative. The cut list is doing real work. The creep risk in this project is not features — it is the unbounded items above (world extent, campaign length) and the methodology half of the document crowding out the answers a builder needs.

## Round 2 — Cross-examination

### Conflicts

**vs. Player-Psychologist, Finding 1 (BLOCKING: no onboarding).** I dispute the severity call — not because the problem isn't real, but because it is *unadjudicable* until my Finding 1 is resolved. BLOCKING for whom? If the audience is a retail player base, first-session rage-quit is plausibly blocking. If the audience is a grader playing a 20-minute demo of an assignment whose graded artifact is the AI methodology, "no tutorial" is a MAJOR polish gap, not a ship-stopper — jam games ship tutorial-free constantly. I'll grant the psychologist this much: the grader IS a first-20-minutes player, so the failure mode lands on exactly the person who matters. But the implied fix worries me more than the finding: a tutorial or practice mode is a new feature in a build whose token budget the Feasibility Lead has already shown is fully consumed (their Finding 4). If the board endorses this finding, it must endorse a zero-cost version — e.g., first launch is free and cargo-less, teaching reentry with nothing at stake — not a tutorial system. Adding onboarding *content* to this schedule would be the first genuine feature creep in an otherwise disciplined document.

**vs. Player-Psychologist, Finding 5 (flat mid-game motivation curve).** Their diagnosis is sound; their prescription list ("intermediate rewards... cosmetic or narrative drip") is scope creep in a costume. Cosmetic reward tracks are precisely the class of feature the 4.3 cut list exists to keep out of a one-week build. The cheap fix for a nine-beat meta-loop with silence in between is not more beats — it is pricing the nine beats correctly, which is my Finding 4 (pacing targets) and the Systems Designer's Finding 2 (no prices). If the purchase cadence is tuned to land every 2–3 runs, the flat spot largely disappears without a single new feature. I'd ask the board to adopt the diagnosis and strike the prescription.

**vs. Feasibility-Lead, Finding 1 (framing: "the game itself survives" via hand-tuning).** I agree with nearly all of this finding and it materially changes my Round 1 (see Revisions), but I contest one clause: that the hand-tuning downgrade "rescues the game." By the document's own Section 3 claim, the loop cannot be hand-reasoned — so hand-tuning ships a *build*, not a tuned game. The fallback fails both deliverables at once: the methodology (silently deleted, as the Feasibility Lead says) and the game quality claim (my Finding 3). "The game ships either way" is the most expensive sentence in the document and neither of us should let it stand as a rescue.

**vs. Narrative-Critic, Finding 5 (art plan undercuts the scrapyard pillar).** Half agreement, half alarm. A paragraph of asset *selection criteria* (palette, weathering, what to reject from a pack) is cheap and I'd support it. But the proposed "mismatched-parts rule for choosing/**editing** pack assets" reopens exactly the scope that cutting the Art Director closed: per-asset editing labor is an open-ended cost with no line in the schedule or token budget. From my lens, the correct resolution is the cheaper of the critic's two options only — selection criteria yes, an editing pass no — or accept that the thematic pillar is delivered by writing and mechanics (the company-store framing in their Finding 4, which costs a few lines) rather than by art.

### Connections

**Feasibility F1 × my F3 — the fallback isn't a fallback, it's the plan.** The Feasibility Lead shows the sweep requires an unbudgeted autopilot that cannot be built in the half-day timebox. Combined with my F3, this means the contradiction I flagged isn't a latent risk — hand-tuning is the *de facto* plan of record, and the document's centerpiece methodology is, on its own schedule, already dead. This connection drives my severity upgrade below.

**Adversarial-QA F2 + F5 × my F5 — a pattern of unpriced recurring costs.** QA found that every successful run consumes jettisoned stages that are never priced (their F2), and that the economy's break-even claim ignores the post-crash repair bill (their F5). My F5 found an unscoped world hiding in "sells anywhere." Individually these are small; together they show the economy claims ("launch cost ≈ 2–3 cheap pieces," "a lazy run breaks even") are being made against an incomplete cost model. The break-even claim — which the whole risk posture leans on — is unverifiable until stages, repairs, and recovery are priced. That elevates the pattern above the sum of its parts.

**Systems F2 × QA F5 × my F4 — the Playtester's question list is the de facto definition of "done," and it's wrong.** The Systems Designer shows a sweep can only validate against a target curve that doesn't exist; QA shows the sweep never samples the post-crash recovery path; I showed its questions are binary feasibility checks. Three lenses converge on the same production fact: Section 3's four questions are currently the project's only acceptance criteria, and they cannot detect a 6-hour grind, a bankruptcy spiral, or a miserable-but-technically-beatable finale. Fixing the question list is cheaper than fixing any single system and improves all of them.

**My F1 × the board's severity spread.** The bankruptcy spiral was found independently by three reviewers (Systems F1, Psychologist F3, QA F5) at MAJOR, while onboarding got one BLOCKING. Note that every one of these calls silently assumes an audience the document never states. The absence of a positioning statement isn't just a marketing gap — it is why this board cannot consistently rank its own findings.

### Revisions

**Finding 3: upgraded MAJOR → BLOCKING.** Round 1, I treated the sampling-vs-hand-tuning contradiction as a papered-over risk. The Feasibility Lead's autopilot analysis (their F1) converts it: the empirical path is not merely timeboxed optimistically, it is unachievable as scheduled, which means the fallback is the plan, which means both the graded methodology and the tuned-game claim fail on the document's own terms. For a deliverable whose header says the methodology is the assignment, that is blocking.

**Finding 2: stands at MAJOR, strengthened.** The Systems Designer's F3 independently found the missing "land safer" track and added a consequence I under-weighted: every Storage purchase makes landings strictly harder with no purchasable counter, so the advertised decision axis isn't just absent — its absence makes the difficulty curve monotonic. Convergent, and worse than I said.

**Finding 5: stands at MINOR individually, but should be read as part of the unpriced-cost-model pattern above** (with QA's F2 and F5). If the board consolidates findings, mine folds into that pattern rather than standing alone.

**Finding 4: stands at MAJOR, strengthened** by the three-way convergence with Systems F2 and QA F5 described in Connections. No downgrades or withdrawals this round.

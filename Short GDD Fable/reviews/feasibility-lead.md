# Technical Feasibility Lead — Round 1

Reviewed: `gdd.txt` — "Junkstronaut," first-draft GDD for a one-week, solo,
AI-agent-assisted build in Godot 4.x. Judged against 2026-era tooling
(Godot 4.x headless, GUT, Claude Pro subscription limits).

## Finding 1 — The headless Playtester requires an unbudgeted autopilot
**Problem:** Section 3 asks the Playtester to answer questions like "Can a
full-hold ship reach the top of the band, reenter, and land under 5 m/s?"
by "running headless Godot across a grid of config values." Answering those
questions requires an automated pilot capable of executing the entire
mission loop — launch, ascent guidance, EVA jetpack navigation, tether
collection, staged reentry, chute timing, and a graded soft landing. That
is a scripted-control or optimal-control problem in its own right, and it
is nowhere in the document. Section 4.4 timeboxes "the sweep harness" at
half a day, but a harness that iterates configs is trivial; the pilot that
flies each config is the actual work, and half a day is not a credible
estimate for a bot that can soft-land a mass-varying ship through a
plasma/chute deploy window. The stated fallback ("hand-tuning for the rest
of the build") rescues the game but silently deletes Section 3's entire
measurement methodology.
**Passage:** §3 Playtester ("Runs headless Godot across a grid of config
values..."), §4.4 ("The sweep harness... Timebox: half a day").
**Severity:** BLOCKING — for the AI-architecture claims that are the
document's centerpiece; the game itself survives only via the unstated
downgrade to hand-tuning.

## Finding 2 — Tuning methodology contradicts its own fallback
**Problem:** Section 3 argues the difficulty loop is "coupled and
nonlinear, so its behavior is determined empirically by sampling the
parameter space" — i.e., the design explicitly claims hand-reasoning about
these constants won't work. The risk section's fallback for losing the
sweep harness is... hand-tuning. Both statements cannot be true. If the
loop genuinely requires empirical sampling, the half-day-timeboxed harness
is not optional infrastructure, it is a critical-path dependency and should
be scheduled and de-risked as such (e.g., built Day 1, before the mechanics
it must validate). If hand-tuning is actually viable, the empirical-sampling
framing is overstated and the two planned sweeps ("reentry sweep and the
economy sweep") should be marked cuttable.
**Passage:** §3 ("coupled and nonlinear... determined empirically") vs.
§4.4 ("Fallback is hand-tuning for the rest of the build — the game ships
either way").
**Severity:** MAJOR

## Finding 3 — No schedule, and the hardest system is a universal dependency
**Problem:** The custom fixed-timestep gravity integrator on
CharacterBody2D is named one of the "two hardest problems" and is the
foundation for literally everything else: rocket flight, EVA movement,
tether mass coupling, heat/drag, and — critically — the determinism that
"enables" the Playtester. Yet the document contains no build order or
day-by-day plan; the only scheduled items are a Day-3 towing gate and a
half-day sweep timebox. If the integrator slips or ships with
nondeterminism (accumulated float error across platforms/runs is a classic
failure here), every downstream mechanic session and both sweeps are
invalidated, and there is no stated gate or fallback for it — unlike
towing, which gets one. A seven-day project with this dependency shape
needs the integrator proven by end of Day 1 and an explicit determinism
test in the QA invariant list; neither appears.
**Passage:** §4.1 ("Custom fixed-timestep gravity integration... 
deterministic"), §4.2 ("Opus reserved for the two hardest problems"), §3
("Enabled by the deterministic fixed-timestep integration"); omission of
any schedule or integrator fallback in §4.4.
**Severity:** MAJOR

## Finding 4 — Token budget has zero rework margin and untracked work items
**Problem:** §4.2's arithmetic (~150–200k/day, ~1.2M/week) assumes every
Coder session lands its mechanic in one pass. But §3's own process
guarantees rework: "A red test returns to the Coder with the failing
assertion as the bug report" — those return trips are unbudgeted, and on a
coupled physics loop, red tests will be common. Counting the mechanics in
§2 (flight, staging, heat/drag, plasma/chute window, landing grading, EVA
jetpack, tether/winch, stow/hold, economy, upgrades, win/loss, satellite
endgame) gives ~11–12 Coder sessions; at 95–115k per Coder+QA+Playtester
cycle, the week is fully consumed with no allowance for the shop UI, HUD,
menus, art integration, or the two Opus problems (Opus tokens burn the Pro
allowance several times faster than Sonnet, which the budget does not
model). Any single bad day forces cuts, and the document does not say
which mechanic gets cut first.
**Passage:** §4.2 entire; §3 ("A red test returns to the Coder"); omission
of UI/shop/HUD from the session cadence.
**Severity:** MAJOR

## Finding 5 — QA "reads the spec, not the implementation" has no API contract
**Problem:** §4.2 budgets QA at ~25k tokens because "the test suite reads
the spec and the invariant list rather than the implementation." GUT tests
must still instantiate real classes, call real method names, and assert on
real signals — none of which exist in the spec. Without a pre-agreed API
contract (node names, method signatures, config keys), either QA must read
the implementation anyway (blowing the 25k budget) or every QA session
produces tests that fail to compile and bounces back through the Coder
loop. The single `game_params.tres` convention solves this for constants
but not for behavior-level APIs. One page of interface contract would fix
this; it is conspicuously absent.
**Passage:** §4.2 ("QA sessions run ~25k, since the test suite reads the
spec and the invariant list rather than the implementation").
**Severity:** MINOR

## Round 2 — Cross-examination

### CONFLICTS

**vs. Systems Designer (F3) and Business Analyst (F2) — "restore a
landing-mitigation upgrade track."** Both colleagues correctly note the
"land safer" purchase advertised in §2.1 doesn't exist in §2.5, and both
offer "add a real safety-side purchase" as one of the two fixes. From the
feasibility side, only the *other* fix is affordable. Adding a
chute/heat-shield upgrade track is not one feature: it adds a Coder
session, new QA invariants, shop UI rows, and — worst — a new dimension to
both parameter sweeps. The document's own tuning claim (§3: "coupled and
nonlinear... determined empirically") means every new upgradeable constant
multiplies the sweep grid, and my Finding 1 already shows the sweep
apparatus is under-budgeted by an order of magnitude with the *current*
dimensionality. In a one-week build with the token arithmetic of §4.2
(my Finding 4: zero rework margin), the only shippable resolution is to
delete the "land safer" promise from 2.1 and state that landing difficulty
ratchets. The Systems Designer's difficulty-curve concern is real, but the
purchasable relief valve is the one fix this schedule cannot buy.

**vs. Player Psychologist (F1, BLOCKING) — "no onboarding path."** The
diagnosis is sound; the implied remedy is in tension with the budget. A
tutorial, practice mode, or "first-launch scaffolding" is an additional
feature with its own Coder/QA cycle, and my Finding 4 shows the token plan
is already fully consumed by the mechanics in §2 with UI/HUD unbudgeted.
If the board endorses this as BLOCKING, it must simultaneously name the
mechanic that gets cut to pay for it — the document doesn't, and neither
does the finding. The affordable version within this plan's constraints is
not a tutorial system but a rules change (e.g., first N launches waive
repair fees, or a free no-cargo practice reentry) — a constants-level fix
that fits the `game_params.tres` architecture rather than a new feature.
I'd hold the psychologist's severity to MAJOR *for this scope* unless the
cheap-rules-fix version is rejected on psychological grounds.

**vs. Narrative Critic (summary) — "none of these are expensive to fix."**
Partly contested. Findings 2 and 3 (rewording the frame, one clause of
fictional cover) genuinely are free — they're text edits to the GDD. But
Finding 1's fix (an ending beat, victory screen intent) and Finding 4's
(character voice, dialogue intent, shop-screen tone) are *content*, and
content means art/UI sessions the §4.2 cadence never scheduled — my
Finding 4 explicitly lists UI/menus as unbudgeted. "Cheap to write into
the document" and "cheap to build" are different claims; only the first
is true.

### CONNECTIONS

**My F1 × Adversarial QA F1 / Player Psychologist F4 (the satellite run).**
Both colleagues lean on the Playtester's question "Is the satellite run
beatable at full upgrades?" — QA notes it doesn't test failure handling,
the psychologist notes machine-beatable ≠ human-repeatable. My Finding 1
sharpens both: the autopilot that would answer even the machine-beatable
version doesn't exist and isn't budgeted. As planned, *nobody* — human
playtest (unscheduled), autopilot (unbuilt) — verifies the game's win
condition before ship. That composite is stronger than any of the three
findings alone: the single most difficult mandatory maneuver in the game
has no verification path at all.

**My F2 × Systems Designer F2 / Business Analyst F4 (no targets to sweep
toward).** I argued the harness is critical-path; they show that even a
working harness has nothing to converge on — no run-count target, no price
curve, no intended playtime. Combined result: the sweep can only answer
binary feasibility ("beatable? breaks even?"), not tune pacing. So the
document's empirical-tuning story fails twice — the instrument is
under-budgeted (my F1/F2) and the objective function is undefined (their
findings). Fixing the harness without adding targets would still ship an
unpaced game.

**My F5 × Adversarial QA F4 (ambiguity baked into tests).** QA's burn-order
finding ends with exactly the failure mode my Finding 5 predicts: the QA
agent "reads the spec, not the implementation," so the spec's ambiguity
("cargo damages before hull" — which slot? does mass vanish?) gets encoded
as an underspecified invariant and green tests certify unresolved design.
Every ambiguity QA-adversarial found (burn order, stage-on-pad, EVA fuel)
is a future red-test/rework loop, which compounds my Finding 4's
zero-margin token math. Their five findings are, in production terms, a
preview of the unbudgeted rework I flagged.

### REVISIONS

- **Finding 2 — maintained at MAJOR, confidence raised.** The Business
  Analyst independently identified the identical contradiction (§3
  empirical-sampling claim vs. §4.4 hand-tuning fallback) from the
  production-risk lens, and added the correct framing: "'ships either way'
  is a schedule promise, not a quality promise." Two lenses converging on
  the same sentence pair moves this from my-reading to board-consensus.
- **Finding 4 — upgraded from MAJOR to BLOCKING.** In Round 1 I scored the
  zero-margin token budget MAJOR because the mechanic list alone consumed
  the week. The cross-read makes it worse: nearly every fix proposed by
  the board (onboarding scaffolding, ending beat, safety-net economy
  rules, EVA fail-state handling, satellite persistence rules, possible
  mitigation track) is *additive*, and the document names no cut priority
  beyond towing. A plan with no slack, an inbound list of mandatory
  additions, and no stated cut order is not schedulable as written.
- **Finding 1 — maintained at BLOCKING**, strengthened by the connection
  above: without the autopilot, the win condition has no verification path
  of any kind.
- **Findings 3 and 5 — unchanged** (MAJOR, MINOR). No colleague evidence
  moved either.

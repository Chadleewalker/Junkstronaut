# Technical Feasibility Lead — Round 1

Context I'm judging against: this is a **solo, 7-day build in Godot 4.x /
GDScript, driven by Claude Code agents on a Claude Pro subscription**
(header line 2; §4.2). Everything below is scored against that budget, not
a studio's.

---

## Finding 1 — The Playtester needs an agent that can *fly the game*, and the doc never says who does
**Severity: MAJOR**

The Playtester is described as running "headless Godot across a grid of
config values" and answering questions like "Can a full-hold ship reach the
top of the band, reenter, and land under 5 m/s?" and "Is the satellite run
beatable at full upgrades?" (§3, §4.3 Playtester). Varying a config grid is
trivial. But every one of those questions requires something to actually
**pilot the ship** — thrust to altitude, EVA out, magnet-tow junk back,
stow it, reenter, stage at the right moment, and open the chute inside the
plasma window. That control policy is the hard part, and it is completely
omitted. There is no mention of a scripted autopilot, a recorded input
trace, or a heuristic flight controller. A "survivability" answer is only
meaningful relative to *some* pilot skill; without a defined policy the
sweep measures nothing reproducible. This is the load-bearing claim of the
entire "AI Architecture" section and it rests on an unspecified component.
The game still ships via hand-tuning (§4.4), which is why this is MAJOR and
not BLOCKING — but the headline value prop is at risk.

## Finding 2 — "Deterministic" is asserted as a foundation but collisions on CharacterBody2D don't guarantee it
**Severity: MAJOR**

The Playtester architecture is explicitly "Enabled by the deterministic
fixed-timestep integration" (§3), and §4.1 promises "Custom fixed-timestep
gravity integration on CharacterBody2D (deterministic)." A hand-rolled
integrator can be made deterministic, but the game leans on Godot's built-in
2D collision system for core mechanics — the magnet "clangs on" a piece,
gear/parachute/hull contact drives touchdown grading, and towed pieces
trail on a leash (§2.4, §2.6). Godot's physics solver, contact resolution,
and `move_and_slide` are not contractually deterministic across runs/machines,
and floating-point contact ordering is exactly where reproducibility breaks.
If a sweep run diverges on collision handling, the outcome table the
Playtester returns is no longer trustworthy. The doc treats determinism as a
settled fact rather than a thing that must be engineered and verified against
the physics engine. No test in the QA invariant list (§3) checks
run-to-run reproducibility.

## Finding 3 — The coupled loop backloads all integration risk; the sweeps can't run until the game is nearly complete
**Severity: MAJOR**

§3 makes the design's virtue explicit: difficulty "emerges from a single
closed feedback loop" — cargo mass → heat → chute delay → touchdown speed →
cargo damage → economy → upgrades → capacity — "coupled and nonlinear."
That's fine as design, but it has a schedule consequence the doc never
acknowledges: the reentry sweep and economy sweep (§4.2, §4.3) each require
**nearly the whole game standing up at once** — flight, EVA, tether/mass,
staging, heat/drag/plasma, touchdown grading, and the shop economy all
integrated. You cannot meaningfully sweep one link of a coupled loop in
isolation. So the two sweeps, which are the project's core justification,
land at the *end* of the week and depend on every prior mechanic shipping on
time. Any single slipped mechanic (see Finding 4) blocks both sweeps. §4.3
carefully lists what's cut, but never flags this end-of-week integration
cliff.

## Finding 4 — Mechanic count vs. one-per-session cadence in 7 days, and an over-clean token budget
**Severity: MAJOR**

§3 states the Coder implements "one mechanic per session." Counting the
mechanics the spec actually requires: rocket thrust/rotate, RCS, staging,
parachute, gear, EVA jetpack, magnet tether + towed-mass physics, heat/drag,
plasma window, touchdown grading, fuel/economy, the 9-purchase upgrade tree,
and the satellite endgame — that's ~12+ Coder sessions, each gated behind a
QA session (~25k) and feeding a Playtester session (~30k), plus the sweep
harness infrastructure. §4.2 lands this at "roughly 150–200k tokens per day,
~1.2M across the week." Two problems: (a) that cadence is one-plus mechanic
*per day* with zero slack for red-test rework, which the QA loop explicitly
generates ("A red test returns to the Coder," §3); and (b) the budget is
stated in raw tokens, but **Claude Pro's limit is a rolling message/usage
cap, not a clean weekly token pool**, and §4.1's separate mention of a
"Claude Code subscription" muddies which plan is actually assumed. The plan
also "reserves Opus for the two hardest problems" (§4.2) — Opus access under
Pro is rate-limited and may not be available on demand at the moment those
problems surface. The budget reads as arithmetic on paper rather than
against the platform's real throttling.

## Finding 5 — Sweep-harness half-day timebox is inconsistent with Findings 1–2
**Severity: MINOR**

§4.4 calls the sweep harness "the one piece of pure infrastructure" and
timeboxes it at "half a day," fallback hand-tuning. Half a day is plausible
for the config-grid runner *alone* — but only because the timebox silently
excludes the flight-control policy (Finding 1) and the determinism guarantee
(Finding 2) that make the harness's output meaningful. The fallback ("game
ships either way") is honest and correct, so this is MINOR — but the timebox
is measuring the easy 20% of the harness and calling it the whole job.

---

### Severity roll-up
- MAJOR ×4 (Findings 1–4)
- MINOR ×1 (Finding 5)

The game itself is scoped defensibly for one week — the cuts in §4.3 are
real and well-reasoned. The feasibility risk is concentrated almost entirely
in the **AI-agent tooling** (Playtester pilot, determinism, sweep timing),
which is also the assignment's whole point.

---

## Round 2 — Cross-examination

### CONNECTIONS

**My Finding 1 (Playtester has no pilot) × Systems Designer F1 / Adversarial QA F1 (satellite is unwinnable, both BLOCKING).** This is the most important
combination on the board, and it is only visible with both lenses. SD and QA
independently prove, from the √mass chute rule and the fixed non-upgradeable
parachute, that the win object cannot be soft-landed — a design-math BLOCKER.
My lens explains *why that error will survive all the way to a shipped build*:
the one automated safeguard the document points at, the Playtester answering
"Is the satellite run beatable at full upgrades?" (§4.3), **cannot actually
answer it**, because nothing in the doc can fly the ship through a reentry.
The single most dangerous defect in the game is precisely the question the
project's flagship tooling was built to catch — and can't. The verification
gap and the design gap are the same hole seen from two sides.

**My Finding 2 (determinism unproven) × Adversarial QA F5 (cargo-ablation
order unspecified — "or random").** QA flags that heat destroys "one slot per
~3 s" with no stated ordering, and raises randomness as a live possibility.
From my lens that is not just a balance question: if ablation order (or any
piece-selection, contact, or tie-break step) is RNG-driven and unseeded, the
economy sweep's determinism claim (§3) is dead on arrival — the same config
grid returns different cargo-value outcomes run to run. QA's "feel-bad coin
flip" is my "the sweep table is non-reproducible." Same omission, two failure
modes.

**My Finding 4 (12+ mechanics, no slack) × Player Psychologist F1 (no
onboarding, BLOCKING) and F2 (control scheme needs remapping/HUD prompts).**
Both of the Psychologist's fixes are *unbudgeted engineering*. A tutorial /
safe-first-flight (F1) and input remapping + on-screen deploy prompts (F2)
are each effectively additional Coder sessions that appear nowhere in my
~12-session count or the §4.2 token math. The design board wants these built;
the schedule has no room for them. This sharpens my Finding 4: the mechanic
list I counted is already the *floor*, and the game-feel reviewers are adding
to it.

**My Findings 3–4 × Business Analyst F1 (the doc is two documents; method
crowds out game spec).** BA notes Sections 3–4 are lavished with token counts
and GUT invariants while playtime/run-count go unspecified. I'll add the
sharper point: even the over-specified methodology half is technically
under-specified — it asserts determinism it hasn't earned (my F2) and a
Playtester it can't build (my F1). So the document isn't just lopsided toward
method; the method it leans on has load-bearing holes. BA's "under-specifies
the game" and my "the AI tooling is where the risk lives" are complementary,
not competing.

### CONFLICTS

**My Finding 1 severity (MAJOR) vs. SD F1 + QA F1 (BLOCKING).** In Round 1 I
graded the missing pilot MAJOR-not-BLOCKING on the reasoning that "the game
still ships via hand-tuning (§4.4)." SD and QA put pressure on that fallback.
Their BLOCKING math means the thing most needing verification — satellite
winnability on a coupled, nonlinear loop — is exactly what a solo dev
hand-tuning in the last day is *least* able to eyeball, because you can't
manually explore a config grid across an emergent loop in the time left. So
my escape hatch ("ships either way") is thinner than I claimed: it ships, but
it may ship the unwinnable game SD/QA describe. I'm not fully conceding — the
non-satellite economy still ships and is playable, which keeps this from being
a total BLOCKER on the whole product — but the fallback does not cover the
win condition. See revision below.

### REVISIONS

- **Finding 1 — reframe the fallback, hold at MAJOR (borderline).** I stand by
  MAJOR for "the Playtester can't fly," but I withdraw the implication that
  hand-tuning makes the risk benign. Given SD F1 / QA F1, hand-tuning is not a
  safety net for the *winnability* question — it's a way to ship without ever
  answering it. The correct framing: absent a scripted pilot, the satellite
  BLOCKER cannot be detected before ship by any process the document
  describes. This makes my Finding 1 the enabling condition for the board's
  top BLOCKER.

- **Finding 2 — upgrade confidence, hold severity.** QA F5's random-ablation
  possibility gives determinism a concrete, in-scope way to break that I only
  argued abstractly (physics contact ordering) in Round 1. The determinism
  claim is now shown to be at risk from *game-logic RNG*, not just the physics
  engine — a second independent failure path. Severity stays MAJOR; my
  certainty that this needs an explicit ruling goes up.

- **No withdrawals.** Findings 3, 4, 5 stand as written; nothing in the other
  five reviews contradicts the schedule/budget/timebox analysis, and PsychF1/F2
  and BA F1 reinforce Finding 4.

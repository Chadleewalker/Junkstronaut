# GDD change proposal — what the flight simulator measured

> **If you are here to edit the GDD, read `gdd-edit-brief.md` instead.** This file is the
> evidence, and it includes measurements that were later retracted. §11a, §11b and §14 are
> corrections to sections above them, and the **128.9** figure that recurs through §11b and
> §12 is an artifact — superseded by §14. Reading this top to bottom will hand you numbers
> that were afterwards shown to be wrong.

**Status: proposal. Nothing here has been applied to `Junkstronaut GDD.txt`.**

Every claim below comes from `crew/lib/sim.js` — a deterministic 2D flight model that
integrates gravity, an exponential atmosphere, drag, heating and orbital mechanics at a
fixed timestep. It simulates *physics* and applies *game rules* from the crew's params
without re-deriving them, so a disagreement between the two is a real finding rather than a
restatement.

Read the caveats at the bottom before acting on any of it.

---

## 1. §2.3.1 — replace "2–4 committed passes" with "1–2 skims, then commit"

> **Resolved — this section was right, and §7 was measuring in vacuum.** For three runs this
> carried a warning that a later measurement of the same quantity got a tenth of the effect,
> and that one of the two had to be wrong. Neither was. The skim altitude in `lib/sweep.js`
> had been fixed at `atmTop * 0.87`, which on the shipped planet is twelve scale heights up
> at ρ = 8.6e-6 kg/m³ — skims flown there shed nothing, so the crew measured 2.8% and
> reported that skimming does not work. Scanned properly, one skim takes the high band's
> committed entry from 159.9 to 78.0 on the bar: **−56%**, in the same range this section
> originally measured. See §10.
>
> The half of this section that does *not* survive is the proposed replacement wording. A
> single plunge is still the cheapest descent — see §7 — but not for the structural reason
> given below.

**What the GDD says now:**

> the two knobs are tuned so the cheapest descent is 2–4 committed passes, never a single
> plunge and never feathering

**What was measured:** this cannot be tuned into existence, and the reason is structural.
The model assumes peak heat divides across passes (`peak = H / n`). It does not. A committed
entry's peak is set by **how deep it goes** and by the **ballistic coefficient** — it
largely forgets how fast the ship arrived. Splitting a descent into more passes therefore
adds heat cycles without reducing the hot one.

Across a 500× sweep of ballistic coefficient (3 → 1600 kg/m²) at a 1/20-Earth planet, the
cheapest descent was a single pass in every single case.

**But skimming does work** — it was being measured wrongly. Holding the final entry depth
fixed and varying *only* how many shallow skims precede it:

| final entry depth | 0 skims | 2 skims | 3 skims | change |
|---|---|---|---|---|
| 0 km (grazing the surface) | 2.20e8 | 1.66e8 | 1.09e8 | **−50%** |
| 20 km | 2.00e8 | 1.55e8 | 1.09e8 | −45% |
| 40 km | 1.73e8 | 1.39e8 | 1.09e8 | −37% |
| 55 km | 1.41e8 | 1.23e8 | 1.09e8 | −22% |

Skims cool the committed entry by 22–50%, exactly as the design intuition says: bleed speed
high up where the air is thin, then enter slower. Every row converges on the same floor —
once the orbit is grazing there is no speed left to shed, and past 3 skims the commit burn
is 0 m/s.

**Proposed wording:** the cheapest descent from the high band is **1–2 shallow skims and
then a committed entry**, and fewer from lower bands. The heat saving is large for the first
two skims and nil afterwards, so the plate's thermal-fatigue toll only has to price the
difference — it does not have to create the optimum, because the physics already does.

Steeper entries benefit more from skimming (−50% vs −22%), which is a free second-order
property: the greedier the entry, the more the skim pays.

---

## 2. §2.3.1 — thermal fatigue should escalate, and that is its whole job

The GDD already has *"a small fixed toll per pass from thermal cycling (heating and cooling
cracks the material)"*. With time warp shipping (see §3 below), orbits cost no real playtime,
so **nothing else stops a player skimming twenty times**. A flat toll is linear in skim count
and can shift the optimum by one at most.

**Proposed:** state that each successive heat cycle damages the plate more than the last —
`toll(i) = base × growth^i` with growth above 1. Its purpose is to close the feathering
exploit, not to pick the pass count.

---

## 3. §4.1 and the appendix — time warp is required, not deferred

**Currently deferred:** *"Time compression / on-rails warp. Mitigated by scoping the planet
small enough that a two-band orbit period is under a minute."*

**What was measured:** that constraint caps the planet radius **under 1 km at Earth gravity**
(a 60 s period needs radius/gravity ≤ 91). An 800 m planet can only carry a shell of air —
90 m in the crew's own baseline — and a ship cannot fly through it: measured deceleration is
18 g at 20 m altitude and 95 g at the surface. The first contact with air removes the whole
orbit, so no skim is even reachable.

Aerobraking needs a radius in the 160–320 km range, which gives orbital periods of **13–43
minutes**. The appendix says to *"decide once the Researcher pins the planet scale"* — the
measurements decide it: **real aerobraking and sub-minute orbits are mutually exclusive.**

**Proposed:** move time warp from "deferred" to "required", and record the planet scale it
buys.

---

## 4. §2.3.7 / §4.5 risk 2 — the difficulty curve comes from mass, and it works

Risk 2 worries the difficulty curve might invert as upgrades outpace mass. It does not,
and the mechanism is cleaner than the GDD assumes.

Peak entry heating scales with **ballistic coefficient** = mass / (drag coefficient × frontal
area), measured across an 8× range (2.7e7 → 2.1e8 from β 3 → 1600). Cargo raises mass,
which raises β, which raises heating. **The bet that "the better the haul, the harder the
ride home" falls out of the physics for free** — no tuning required, and it cannot be bought
off with upgrades because the player keeps filling the bigger hold.

**Proposed:** name ballistic coefficient explicitly in §2.3.5 as the quantity cargo mass
moves, and note in §4.5 that risk 2's mitigation is structural rather than a tuning target.

---

## 5. §2.3.1 — the unstaged braking phase is unflyable on every planet examined closely

**What the GDD says:** coarse braking happens before staging, *"shallow passes with the
naked hull soaking slow heat"*.

**What was measured, at the crew's own numbers:** those passes peak at **687–719** on a
0–100 heat bar. The Spec Auditor noted that even at an unstaged heat multiplier of 1.0
instead of 3.2 it is still 2× over the cap, so the multiplier is not the cause — the hull's
lower drag lets it linger where the heat bar reaches equilibrium.

**Correction, from the 5184-cell sweep:** "unflyable" was too strong, and so was a later
claim that no ship configuration survives it. Across the full space, **15.4% of configurations
satisfy `unstaged_pass_survivable`** — it is the rarest of the eight design targets, not an
impossible one. The earlier verdict came from probing the shipped planet and the
best-scoring worlds of a *previous* grid, all of which happened to fail it; a sample chosen
by one grid is not evidence about the space. On the shipped planet the pass peaks at 407
against a capacity of 100, and on the best-scoring world 354 — still 3.5× over, and still
227 when barely dipping in at 94% of the atmosphere's top. So it is hard everywhere that
has been looked at closely, and possible somewhere that has not.

**Proposed:** either the naked hull needs materially more heat tolerance, or the braking
phase happens *after* staging and the one-way commit moves later in the sequence. This one
is a genuine design decision, not a number to nudge, and the measurements do not choose
for you. If the answer is "keep the phase", the 15.4% of the space that survives it is where
to go looking for the planet.

---

## 6. A modelling decision the design has not made explicit

Heat is currently a **bar** — it fills at a rate and drains with a 5-second constant. That
choice has a consequence worth stating deliberately, because it is counter-intuitive: a bar
rewards *brevity*. A plunge ends before it fills; a long shallow pass lets it reach
equilibrium. So under a bar, **gentle flying reads as hotter**.

Three candidates, all now tracked by the simulator:

| Measure | Rewards | Effect on the design |
|---|---|---|
| **Heat bar** (as written) | brevity | a plunge looks cool, skims look hot |
| **Integrated heat load** | gentleness | thin air for longer absorbs less total energy |
| **Peak instantaneous rate** | gentleness | what real vehicles are designed against |

The measurements above use peak rate. If the shipped game keys ablation off the bar with a
5-second constant, it will invert them. **Shortening `heat_dissipation_s` makes the bar
track the rate**, which is a one-parameter fix that keeps the existing concept.

---

## 7. §2.3.1 again — the pass-count finding, and a skim measurement that was broken

> **The skim half of this section was wrong.** Everything below about *pass count* stands and
> has since been reproduced across three ships. Everything below about *skim multipliers*
> was measured with the skim altitude pinned in vacuum, and the numbers are an artifact of
> that constant rather than a property of the design. They are left in place, struck through
> in effect, because the way this section confidently contradicted §1 for three runs is the
> most useful thing in it. See §10.

This section disagreed with section 1 of this document for three runs. Both were recorded
rather than one quietly replacing the other, on the grounds that the disagreement was the
finding. That was the right instinct and it paid: the disagreement was real, and it was a bug.

The crew's runs measured the skim multipliers at the same entry depth section 1 uses (0 m —
a grazing entry, where skimming has the most to give). **These are the broken numbers**, kept
for the record:

| band | 0 skims | 1 | 2 | 3 | corrected (§10) |
|---|---|---|---|---|---|
| suborbital | 1 | 0.968 | 0.937 | 0.907 | **0.697** |
| low | 1 | 0.984 | 0.969 | 0.956 | **0.526** |
| high | 1 | 0.990 | 0.980 | 0.972 | **0.439** |

The conclusion drawn here at the time — that three measurements spanning an order of
magnitude meant "no number should be written into the GDD until it is known which" — read as
appropriate caution and was in fact a bug report nobody recognised. The variance was not
planet scale or ballistic coefficient. It was that the skim altitude was a hardcoded
constant, and the runs that flew it on a thick atmosphere put the skims in vacuum.

Two claims made here are now measurably false and are worth naming, because both were stated
with confidence:

- *"Skims always cool more from lower bands than higher ones, which is the opposite of what
  the design would prefer."* Corrected, the ordering is 0.697 / 0.526 / 0.439 — skimming
  helps **most** from the high band, which is the direction the design wants.
- *"Each run has widened rather than closed the question."* The runs were re-measuring the
  same constant and getting the same wrong answer with better precision.

What does not depend on any of that:

**A single committed plunge is the cheapest descent at every band and every load.** Ablation
rises monotonically with pass count in all nine band × load descents without exception:

| descent | 1 pass | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| suborbital, full hold | 13.5 | 15.5 | 16.8 | 18.5 | 21.6 | 26.9 |
| low, full hold | 11.7 | 14.9 | 16.5 | 18.3 | 21.3 | 27.7 |
| high, full hold | 10.8 | 15.8 | 17.4 | 19.4 | 22.6 | 28.3 |
| suborbital, empty | 4.6 | 5.6 | 6.6 | 8.3 | 11.3 | 16.6 |

The second pass costs 2.0–5.0 plate-percent and returns nothing. §2.3.1's *"never a single
plunge"* is false at every band and every load, and this is the check the crew could not
revise its way out of across three rounds — the cost array is internally exact and describes
a descent the game does not fly.

**This now holds across three ships, not one.** The finding survived a deliberate order-of-
magnitude change to the vehicle. Successive runs flew staged ballistic coefficients of 19.4,
182.8 and 290.3 kg/m² — the first below the ~50 threshold where the atmosphere stops a ship
rather than braking it, the last squarely inside the 300–500 band real reentry capsules
occupy. Every one of them made the single plunge cheapest. That is much stronger evidence
than a single run: it is not an artefact of a badly sized ship, because a well-sized ship
does the same thing.

The tolls above are also now charged correctly. An earlier version of the simulator billed
every pass at the *first* heat cycle's rate, so a 25-pass feathering descent cost about the
same as a 4-pass one — the exploit `cycle_toll_growth` exists to close was priced at nearly
nothing in the flown model while the params priced it as prohibitive. Fixing it moved no
verdict, because the cheapest descent was already a single pass, but it means the multi-pass
columns above are the real cost rather than a floor.

**~~Depth is the lever skimming was supposed to be.~~ Corrected — skimming is the stronger
lever, and it is nearly free.** This paragraph previously concluded that depth was "roughly
fifteen times the lever" and that each skim cost 45 m/s of Δv and an hour and a half of extra
flight. Every one of those figures came from skims flown in vacuum. Re-measured on the same
planet with the skim altitude scanned:

| lever | effect on high-band peak heat |
|---|---|
| entry depth, 0 → 21,500 m | 159.9 → 90.9 = **0.568×** |
| one skim at 23,600 m, entry held at 0 | **0.453×** |

Skimming is the *bigger* lever, not a fifteenth of it. And the cost that was supposed to
price it is not there: commit Δv is **0 m/s**, because a skim at that altitude drops apoapsis
inside the atmosphere and no burn is needed, and the time cost is **0.70 h against 0.80 h** —
six minutes, not ninety.

That matters for more than the arithmetic. The thermal-fatigue toll in §2 exists to stop a
player skimming indefinitely for free, and on these numbers skimming really is very nearly
free. The toll is now doing the whole job of bounding the mechanic, rather than merely
pricing a difference the physics had already created.

**~~Proposed:~~ withdrawn.** This section previously proposed replacing the skim mechanic with
an entry-depth one, on the grounds that depth was the far stronger lever. It is not. Both
levers are real, they are close in magnitude (0.568× against 0.453×), and **they are
substitutes** — a shallower entry and a skim buy the same reduction in entry speed, so a
player who can freely choose entry depth will never pay for a skim.

That substitution, not any impossibility, is why the cheapest descent is still a single pass.
The margin is small: 3.65% against 4.18% for two passes, a 13% penalty rather than the chasm
earlier runs reported.

**What is worth proposing instead:** constrain entry depth so the substitution is not free.
If the shallow committed entry has a cost the plunge does not — a minimum commit angle, a
navigation-precision limit, or a soak-time penalty on the long shallow path — skimming
becomes the only route to the velocity reduction and 2–4 passes becomes the cheapest descent
on its own merits. At a 13% margin that is a small rule, not a redesign.

Section 2's escalating thermal toll still stands either way, and matters more than before:
with skims costing 0 m/s and six minutes, the toll is the only thing bounding the mechanic.

---

## 8. The ship spec is a design axis nobody has chosen

Not a GDD change so much as a gap in it. The tank and the engine were never explored: every
world the crew scored flew one fixed 620 kg tank at a fixed 1.8 liftoff TWR — including,
for a long time, a tank that could not reach orbit on the shipped planet at all. The grid was
scoring worlds using a ship that could not fly in them and reporting the result as a property
of the worlds.

With both swept, two of the eight design targets turn out to be the scarce ones:

| target | satisfied by | stable across rounds? |
|---|---|---|
| `unstaged_pass_survivable` | 15.4% | yes — 15.4 / 13.9 / 15.4 |
| `fuel_margin_sane` | 16.2% | roughly — 15.3 / 17.9 / 18.5 |
| `difficulty_rises_with_band` | 31.8% | yes — 32.1 / 31.8 / 31.8 |
| `bands_reachable` | 33.8% | **no** — 79.9 / 67.5 / 59.3 |

That last column is a correction. These rates were first written down as though they were
properties of the design. They are not all the same kind of number. Re-flying the whole grid
against each revision round's own params and catalog — the same three rounds of the same run —
moves **73% of cells' scores**, and the twenty best cells have **zero overlap** between round 0
and round 1. Every round still reports "best 7/8"; they are different sevens.

The split is legible once seen. Targets that read only the world (`unstaged`, `skimming_cools`,
`difficulty_rises`) barely move. Targets that read the ship or the hold swing hard, because the
Designer's catalog revisions move the full-hold mass and the Balancer's revisions move the
flight params — `full_hold_lands_soft` goes 93.5% → 54.0%, `greed_costs_something` 44.8% → 84.0%.

**What follows:** a sweep result is a statement about *a world grid crossed with one particular
catalog and params*, not about the design. Quote the world-only rates freely; quote the others
only alongside which round produced them. And a "best world" from the exploration is not a
finding until it survives being re-scored against something the crew did not author on the
same night.

`fuel_margin_sane` is bounded **above as well as below** (spare fuel between 8% and 60%),
which is the design correctly refusing a ship with nothing to decide. It is also why more
fuel is not simply better: on the good worlds a 1500 kg tank scores strictly worse than a
900 kg one. Fuel and thrust trade along a ridge rather than a gradient.

### A later run corrects the classification above

A subsequent full run over the same 5,184-world grid produced these final-round rates:

| target | this run | previous run |
|---|---|---|
| `unstaged_pass_survivable` | **7.4%** | 15.4% |
| `fuel_margin_sane` | 18.4% | 16.2% |
| `full_hold_lands_soft` | 31.5% | — |
| `skimming_cools_the_entry` | 43.8% | — |
| `bands_reachable` | 50.0% | 33.8% |
| `difficulty_rises_with_band` | 60.8% | 31.8% |
| `greed_costs_something` | 88.0% | — |
| `skim_benefit_saturates` | 92.6% | — |

`unstaged_pass_survivable` **halved**, and the section above lists it as one of the targets
that "barely move" because it reads only the world. That classification is wrong, and the
correction is worth more than the number.

The route is the heat-scale calibration. The simulator fixes its heat scale once per world so
that an empty single-pass suborbital descent reads 100 on the bar, and *that calibration is
performed with the crew's own ship*. Change the ship and you change what "100" means, which
changes whether an unstaged pass clears it — even though `unstaged_heat_multiplier` (3) and
`heat_capacity` (100) are identical across both runs. Dry mass moved 900 → 1350 kg and
reference area 3.5 → 3.1 m² between them, and `difficulty_rises_with_band` nearly doubling
in the same run points the same way.

So the split is not world-only versus ship-dependent. **Every target is ship-dependent**,
because the normalisation every heat figure is quoted against is itself measured off the
ship. The safe reading is the one the section above already lands on, only stronger: a sweep
rate is a statement about a world grid crossed with one particular ship, catalog and params.
There is no subset of these numbers that can be quoted free of that.

This is inferred from the parameters that changed, not proven by an experiment that holds the
ship fixed and varies nothing else. That experiment is cheap — `bench.js` can do it — and it
has not been run.

Two specifics worth recording:

- **The base tank is oversized for the slice.** All three bands are reachable at base config,
  including the deferred high band, at fuel margins 16.6% / 13.5% / 11.8%. So `fuel_tank`
  tier 1 at 450 credits buys nothing the player needs — the first of twelve purchases is a
  dead purchase.
- **Thrust and engine efficiency are the same number in this model.** `ve = thrust / burn_rate`
  and the burn rate is not swept, so raising thrust buys exhaust velocity. The ascent that
  fails at 16000 N succeeds at 28000 N by turning a 408 s engine into a 714 s one. If the
  GDD wants those to be separate upgrades — a bigger engine and a better one — the params
  need a separate handle for it.

---

## 9. Three small things the params say and the document does not

- **`off_retrograde_penalty` is 1** — no penalty at all. §2.3.1 asks for heat to build with
  the cosine of off-retrograde drift, which is what makes holding attitude a skill during the
  plasma phase. As set, the player can tumble through an entry for free.
- **The 100-heat bar appears to be decorative.** Sixteen entries in the descent table peak
  above `heat_capacity` 100 — direct entries reach 131.5 (low) and 163.1 (high), 63% over —
  and every one still reports `plate_survives`, `soft_landing`, touchdown 3.25 m/s. Either
  the bar does not gate cargo damage, or the two heat figures are different quantities
  wearing the same name. Worth resolving before anyone implements *"cargo damage begins at
  100% heat"*.
- **The parachute rule is checked against itself.** `parachute_area_m2` is absent from the
  params, so the simulator solves the area from `descent_speed_full_hold_ms` and then measures
  that same speed back. The greedy-haul crossing that justifies the Parachute upgrade is
  asserted arithmetic, never a flight. Adding `parachute_area_m2` to the params would make it
  measurable.

---

## 10. The constant that produced three runs of a false finding

Not a GDD change. A correction to this document and to the crew that wrote it, recorded here
because the failure mode is the interesting part and it has now happened three times.

`lib/sweep.js` measured what skimming does by flying shallow passes at a **hardcoded**
altitude, `atmTop * 0.87`, on the reasoning that a skim should be high and thin. On the
shipped planet that is twelve scale heights up, at ρ = 8.6e-6 kg/m³. There is no air there.
The skims shed nothing, the measured multiplier came back at 0.97, and everything downstream
behaved impeccably on top of a number that was an artifact of a constant:

- the Balancer priced a mechanic the simulator had told it was worthless;
- the Auditor confirmed the pricing was internally consistent, which it was;
- §7 of this document concluded that skimming does not work and that §1 must be wrong;
- three successive runs re-measured it and got the same wrong answer with better precision,
  which read as convergence.

Scanned across 0.35–0.95 of the atmosphere instead, one skim takes the high band's committed
entry from 159.9 to 78.0 on the bar. The corrected multipliers are 0.697 / 0.526 / 0.439 for
suborbital / low / high, against 0.907 / 0.956 / 0.972 before — and the ordering inverts, so
skimming helps most from the high band rather than least.

**The pattern.** This is the third instance of one bug, and they are worth listing together:

| constant | what it was | what it made the crew report |
|---|---|---|
| fuel tank & engine | fixed 620 kg tank, 1.8 TWR | worlds scored with a ship that could not reach orbit in them |
| skim altitude | `atmTop * 0.87` | "skimming does not cool the entry" |
| band altitude | `atmTop * [1.6, 2.6, 4.2]` | **still fixed** — the grid cannot test the one geometry that governs multi-pass |

Each time, a value nobody swept was reported as a property of the design. The exploration
grid varies seven axes and is careful about all of them; the constants outside it were never
questioned, and they are where every false finding has come from.

**The check that would have caught it:** none of the crew's gates can. The schema validates
shape, the audit validates the params against the design document, and both were satisfied.
What was wrong was the *instrument*, and nothing audits the instrument. The nearest thing is
the discipline already written into the `SCAN_SAMPLES` comment — measure the constant, do not
choose it — and that discipline had simply never been applied to this one.

---

## Caveats — what these numbers are not

- **The pilot is perfect.** Point mass, no attitude error, always retrograde. Measured heat
  is a best case; a real player does worse.
- **Cargo is only mass.** No collisions, no momentum transfer.
- **Heat units are arbitrary.** Only ratios mean anything. Figures normalised per band are
  not comparable across bands, and one earlier analysis got that wrong.
- **This model was wrong twice.** It first used a single periapsis for a whole descent,
  which cannot represent skimming at all and produced a confident, false "skimming never
  helps". It also had time constants hardcoded for an 800 m world, which reported big
  planets as "never lands". Both are fixed, and both are the reason for the caveats: treat a
  surprising result as a question about the model first.
- **The search has been wrong too, in a way that is harder to see.** A parameter held fixed
  reads exactly like a parameter that does not matter. The grid held the tank and the engine
  constant and reported the consequences as facts about planets; when they were finally
  swept, the best cells all sat at the top of both new ranges, meaning the optimum was
  outside the grid and the winning row was a wall rather than a peak. The ranges have since
  been widened past that frontier. **Check where a best cell sits in its range before
  believing it** — an edge is a warning, not an answer.
- **Percentages here describe the swept space, not the game.** "15.4% of configurations" is a
  statement about 5184 grid cells, most of which are worlds nobody would ship. It says a
  target is reachable somewhere, not that it is reachable anywhere good.

---

## 11. Multi-pass as a requirement, not a preference

Measured 2026-07-28 with `crew/probes/multipass-probe.js`, `keying-probe.js` and
`force-multipass.js`. The design goal being tested is Chad's, stated plainly: **with a heavy
load from a high band, multi-pass should be the only option, and the final satellite reentry
should require at least one skim.**

### The question §2.3.1 has been asking is the wrong one

`cheapest_descent_is_multi_pass` asks whether 2-4 passes is the *cheapest* descent. That is a
cost question, and it is a fight the design keeps losing by a small margin — 13% at last
count. Chad's goal is a *feasibility* question: not "is the plunge more expensive" but "is
the plunge available at all". Those need different rules and different measurements, and the
feasibility one turns out to be far easier to satisfy.

### Cost tuning cannot deliver it — three keys measured, all rank one pass first

`step()` tracks three candidate quantities and its own comment says they "rank descents in
OPPOSITE orders, and which one ablation keys off is a design decision rather than a physical
fact" — suggesting that keying ablation off peak heating *rate* would "make a plunge the
dangerous option and multi-pass braking the cheap one". Re-scoring the same descents under
each key, on the two-depth model, at the calibration that makes an empty suborbital plunge
read 100:

| band / load | key = bar (today) | key = peak rate | key = total load |
|---|---|---|---|
| high, empty | 1 pass (3.90%) | **2 pass (10.54%)** — by 0.2%, i.e. noise | 1 pass (13.91%) |
| high, full hold | 1 pass (10.82%) | 1 pass (30.24%) | 1 pass (44.86%) |
| high, satellite | 1 pass (26.86%) | 1 pass (76.97%) | 1 pass (119.62%) |
| low, satellite | 1 pass (29.17%) | 1 pass (83.00%) | 1 pass (103.55%) |

The comment is wrong, and this confirms the earlier finding rather than overturning it. **Do
not spend time on the ablation key.** The argmin sits at one pass under every key, at every
band, at every load but one, and that one wins by less than the grid resolution.

### But the mechanic already exists — it is the bar's capacity that hides it

Minimum achievable peak bar from the high band, over the whole (entry depth x skim altitude x
skim count) space, on the shipped numbers:

| load | best 1 pass | best multi-pass | verdict at capacity 100 |
|---|---|---|---|
| empty (0 kg) | 68 | — | plunge is fine |
| full hold (1,398 kg) | 104 | 98 | **skimming already required**, by 6 points |
| satellite (3,600 kg) | 140 | 131 (3 passes) | unflyable at any pass count |

Two things fall out. The full hold **already** cannot plunge home from the high band — one
pass reads 104 against a capacity of 100 — and nothing in the crew reports it, because
`cheapest_descent_is_multi_pass` reads cost and the reachability check never gets that far.
And the satellite cannot come home at all: its cheapest profile still reads 131.

The satellite figure is not a descent problem. 3,600 kg of cargo on a 1,350 kg ship through a
3.1 m2 shield is a ballistic coefficient no descent profile rescues, and heavier cargo makes
skimming *less* effective, not more — aerobraking authority scales as 1/beta, so the piece
the design most wants to force into multi-pass is the piece least able to brake on air.

### The lever is the capacity, and the margin is the scale height

The bar's capacity is not a constant. It is what a heat-shield tier buys — the crew already
ships 100 / 140 / 190. So the real question is whether **any** capacity C forces the mechanic:

    max(empty_1pass, hold_1pass)  <  C     ordinary hauls can still plunge
    satellite_multipass  <  C  <  satellite_1pass    the satellite must skim, and can

The width of that window is the whole design margin. On the shipped numbers it is 131..140 —
**7%**, which is a coincidence rather than a mechanic. Sweeping scale height and shield area
(25 entry depths x 13 skim altitudes x 5 skim counts per cell):

| variant | sat 1-pass | sat multi | hold 1-pass | empty 1-pass | capacity window | width |
|---|---|---|---|---|---|---|
| **scale height 1,100 m** | 177 | 121 (2) | 93 | 83 | **121 .. 177** | **46%** |
| scale height 1,100 m, area 12 | 160 | 128 (2) | 100 | 74 | 128 .. 160 | 25% |
| scale height 1,600 m | 156 | 128 (2) | 94 | 72 | 128 .. 156 | 21% |
| scale height 1,600 m, area 8 | 145 | 121 (2) | 89 | 79 | 121 .. 145 | 20% |
| scale height 2,200 m, area 5 | 144 | 124 (2) | 97 | 64 | 124 .. 144 | 16% |
| *shipped (3,100 m, area 3.1)* | *140* | *131 (3)* | *104* | *68* | *131 .. 140* | *7%* |

**Recommended: scale height 1,100 m, shield area unchanged at 3.1 m2, bar capacity ~140.**
That gives the satellite a 46% margin — one pass reads 177 against a capacity of 140, two
passes read 121 — while an empty ship (83) and a full hold (93) can still plunge. 140 is
already the crew's heat-shield tier-1 value.

The physics is the reason it works. Scale height is how abruptly the air thickens. A deep,
gradual column — 3,100 m on a 43,000 m atmosphere — lets a ship brake gently all the way down
in a single pass, which is exactly what makes the plunge safe. A steep column gives the same
total air in a thinner skin: you cannot brake gradually through it, but you can still graze
its top repeatedly. That is aerobraking, and it is the only thing the geometry leaves.

### Caveats, because this project has been burned by all of them

- **The surface is rough, not smooth.** The ranking above is not monotonic in shield area
  (area 5 and 8 swap places twice), which means the optimizer is finding local minima on a
  jagged surface. Treat the ordering as indicative and **confirm scale height 1,100 m at
  higher resolution before committing it to the GDD**.
- **Resolution flips results.** At `N_ENTRY=8` the same probe reports two passes beating one
  at satellite mass; at 31 it reverses. Every number above is from the finer grid.
- **`descentScan` cannot see any of this.** It calls `simulateDescent` with no options, so
  `maxSkims` is Infinity and it never commits to a separate entry — it measures decay, not
  skim-then-commit. `descents[]`, and therefore `cheapest_descent_is_multi_pass`, is built
  from it. The crew's headline reentry finding is measured on the one model that structurally
  cannot express the manoeuvre.
- **Nothing in the crew ever flies the satellite.** Loads are empty / half / full hold. The
  win condition of the game — the heaviest object in it — has never been in a load set, which
  is why "the satellite cannot come home" took a hand-written probe to find.
- **Scale height is not a free knob.** It is currently derived as `atmTop * 0.1` in the
  exploration grid, so changing it changes what the grid means. Check `scoreCell` before
  assuming the sweep will agree with the probe.
- **The skim passes in every probe here are flown staged.** `stageAfter = 0`, which is what
  `flySkimSeries` in `sweep.js` does too. §2.3.1 says braking passes are flown *unstaged*, at
  a 3x heat multiplier, and staging is one-way. If that rule is real, skims are far more
  dangerous than anything measured here and the whole window needs re-measuring with
  `stageAfter` set to the skim count. **This is the largest unquantified risk to the
  recommendation above.**

### 11a. Correction: the 46% window was a resolution artifact

Added 2026-07-28, same session. The caveat above — "confirm scale height 1,100 m at higher
resolution before committing it" — was acted on, and **it did not confirm**.

The table in §11 was measured at 25 entry depths x 13 skim altitudes. Re-measured at
**41 x 21**, holding everything else identical:

| variant | sat 1-pass | sat multi | hold 1-pass | empty 1-pass | window | width at 25x13 | width at 41x21 |
|---|---|---|---|---|---|---|---|
| scale height 800 m | 142 | 126 (7) | 127 | 72 | 127 .. 142 | — | **12%** |
| scale height 950 m | 134 | 124 (7) | 99 | 74 | 124 .. 134 | — | **7%** |
| **scale height 1,100 m** | **128** | **126 (2)** | 101 | 75 | 126 .. 128 | *46%* | **1%** |

The finer entry-depth scan finds a much cooler single pass for the satellite — 128 on the bar
where the coarse scan reported 177. The single-pass number is what the window's upper edge is
made of, so the window collapses from 46% to 1%.

**So the recommendation in §11 does not stand as written.** A 1% window is not a mechanic; it
is two numbers that happen to be close. Nothing in the shape of the argument changed — cost
tuning still cannot force multi-pass, the capacity is still the lever, the satellite still
cannot come home at a capacity of 100 — but the specific claim that scale height 1,100 m buys
a comfortable margin was wrong, and it was wrong for exactly the reason the probes' README
already warned about.

**What this costs, stated plainly.** The minimum achievable single-pass peak is a *minimum
over a search*, so refining the search can only lower it. Every window measured this way is
therefore an upper bound that shrinks as the grid gets finer, and a window is only credible
once it stops moving. None of these have been shown to stop moving. Before any of this
reaches the GDD, the promising rows need re-measuring at a third resolution and the number
has to hold.

The direction that survives so far is the opposite of the one §11 recommended: the widest
confirmed window is at **800 m**, the steepest atmosphere tested, not at 1,100.

### 11b. Correction, and the answer: it is a rule, not a parameter

Added 2026-07-28, same session, after §11a. Measured with `crew/probes/entry-boundary.js`
and `crew/probes/commit-floor.js`.

**§11's central claim is wrong, and so is §11a's.** Both were built on grid scans over entry
depth, and both were reading noise in an under-resolved search.

#### What the grid was hiding

Minimising properly — a coarse scan to bracket the minimum, then golden-section inside the
winning bracket — gives the true coolest single-pass descent for the satellite:

| scale height | sat 1-pass | sat multi-pass | gap | hold 1-pass | empty 1-pass |
|---|---|---|---|---|---|
| 800 m | 122 | 128 (4 passes) | **none** | 90 | 63 |
| 1,100 m | 121 | 121 (2) | **none** | 89 | 62 |
| 1,400 m | 121 | 122 (2) | **none** | 89 | 62 |
| 2,200 m | 123 | 127 (2) | **none** | 90 | 62 |
| 3,100 m (shipped) | 128 | 134 (2) | **none** | 94 | 64 |

**There is no window at any scale height.** The coolest single pass is as cool as or cooler
than the coolest multi-pass everywhere, and the number barely moves across a 4x range of
scale height — 121 to 128. Two conclusions, both the opposite of §11:

- **No heat capacity can force multi-pass.** Whatever bar height blocks the plunge also
  blocks the skimmed descent.
- **Scale height is not a lever.** It scales every peak together and leaves the ratios alone.

Also recorded, because it cost a probe: bisecting for the 1 -> 2 pass boundary does *not*
find the single-pass minimum. Peak falls as the entry gets shallower and then turns and rises
over the last kilometre — 306.5 at the surface, 142.6 at 19,689 m, back up to 151.1 at
21,479 m, two passes from 23,268 m. The boundary is a local maximum of that tail.

#### Why skimming looked useless, and what actually restores it

A skim drops apoapsis into the atmosphere, so the committed entry arrives slower. **But a
shallower committed entry does the same thing**, for one heat cycle instead of two — and the
player picks the entry depth for free. That substitution is the whole story, and it is what
§7 of this document said before §11 talked itself out of it.

Hold the entry depth fixed and skimming is worth **0.42-0.53x on the peak**. The mechanic is
real; the player's freedom to enter arbitrarily shallow is what makes it pointless.

#### The recommendation: a commit floor

**Put a floor on how shallow the committed entry may be** — the minimum commit angle or
navigation-precision limit proposed in §7. Then the numbers, from the top of the band:

| commit floor | | plunge | 1 skim | capacity that forces the satellite alone to skim | width |
|---|---|---|---|---|---|
| **8,000 m** | empty | 144.7 | 67.4 | | |
| | full hold | 203.7 | 98.7 | | |
| | satellite | 268.8 | 128.9 | **(204, 269]** | **32%** |
| 12,000 m | satellite | 241.3 | 128.9 | (186, 241] | 30% |
| 16,000 m | satellite | 201.4 | 128.9 | (162, 201] | 24% |
| 20,000 m | satellite | 136.9 | 128.9 | (129, 137] | 6% |

**Recommended: commit floor 8,000 m, heat capacity ~235.** The satellite cannot plunge (268.8
against 235) and comes home on one skim (128.9). A full hold still plunges at 203.7 and an
empty ship at 144.7. That is a 32% window — and unlike every window in §11 it is bounded by
a rule rather than by the resolution of a search, so refining the grid cannot erode it.

If the full hold should be forced to skim as well, the window is **(145, 204]** at the same
floor — capacity ~180, a 41% window, with only the empty ship able to plunge.

The heat-shield tiers can ladder inside these: every tier must stay below the satellite's
plunge peak, or a maxed shield buys the plunge back.

#### The methodological lesson, since this is the fourth time

Every wrong answer this project has produced about aerobraking came from a search whose
bounds were doing the talking. The tank and engine were fixed; the skim altitude was fixed;
band altitude is still fixed; and here the entry depth was *unbounded*, which is the same
error inverted — an unconstrained minimum is not a measurement of the design, it is a
measurement of the search. **A quantity defined as a minimum over a free parameter is only
meaningful once that parameter has a rule bounding it.**

---

## 12. The two extremes, measured

Added 2026-07-28 with `crew/probes/extremes.js`. These are the two ends that are either
possible or not; everything between them is tuning.

### The first launch works. The audit was asking the wrong question.

`shipping_slice_bands_reachable` has failed every run with "out of fuel before circularising",
13.8-28% short. Both halves of that were artifacts:

- **`simulateAscent` circularised unconditionally.** GDD §1 offers "a suborbital arc or
  orbit" and both are legal play, but the arc did not exist in the simulator, so a ship
  perfectly able to throw one read as unable to reach the band. Fixed — `opts.circularise`.
- **It targeted the band midpoint**, not the band floor. The first launch is supposed to reach
  the *bottom* of the envelope, not the middle of it.

Measured against the band floor at 50,000 m, with the arc judged on how long it spends at or
above that floor — the EVA window:

| ship | arc apex | EVA window | fuel left after the arc | orbit at the floor? |
|---|---|---|---|---|
| **base (first launch)** | 56,164 m | **97 s** | **29%** | yes, but 0% fuel left |
| tank 1 | 56,800 m | 104 s | 36% | yes, 11% left |
| tank 1 + thruster 1 | 56,509 m | 101 s | 45% | yes, 21% left |
| tank 2 + thruster 1 | 56,998 m | 105 s | 50% | yes, 28% left |
| tank 2 + thruster 2 | 56,719 m | 102 s | 57% | yes, 36% left |

**The base ship reaches the junk and comes home with 29% of its tank**, on a 97-second EVA
window. That is a game. It can also technically circularise at the floor, but arrives with
nothing left to deorbit on — so the arc is the first launch's route and orbit is what the
first tank upgrade buys. That progression is the one §2.5 describes and nobody had measured
it.

The one number a human has to judge: **97 seconds** is the whole first-launch EVA. If that is
too tight to fly out, tether a piece and stow it, the fix is a bigger arc, not a bigger tank —
apex barely moves with upgrades (56.2 km to 57.0 km) because the climb is thrust-limited, not
fuel-limited.

### The final reentry requires a skim, and the commit floor is what does it

Peak heat on the coolest *legal* descent, from the top of the band, maxed ship. The commit
floor is the rule: the player may not commit to an entry above it, so a lower floor is a
stricter rule and a higher one gives the player more room to fly shallow and stay cool.

| commit floor | empty | full hold | satellite | satellite, 1 skim |
|---|---|---|---|---|
| 0 m (dive straight in) | 159.9 | 228.5 | 306.5 | 128.9 |
| **8,000 m** | **144.7** | **203.7** | **268.8** | **128.9** |
| 12,000 m | 134.3 | 186.2 | 241.3 | 128.9 |
| none (free, ~19,700 m) | — | — | ~128 | 128.9 |

**At a commit floor of 8,000 m and a heat capacity of 235:** the satellite cannot plunge
(268.8 against 235) and comes home on one skim (128.9), while an empty ship (144.7) and a
full hold (203.7) still plunge freely. A 14% margin on the rule that matters.

A floor of 12,000 m also works but leaves only 2.7% between the satellite's plunge and the
capacity — too close to survive a catalog revision. Without any floor the satellite's coolest
plunge falls to about 128 and no capacity separates it from the skimmed descent at all, which
is §11b.

Note what does **not** change across the whole table: the skimmed descent is 128.9 at every
floor. Skimming drops apoapsis into the atmosphere, so the committed entry arrives at the same
speed however deep it is. That is why the floor only bites the plunge, and why it is the right
lever.

---

## 13. Drag, and a thing nobody was looking at

Asked 2026-07-28: is air resistance modelled with depth, including during liftoff?

**Yes, everywhere, from one function.** `world.rhoAt(h)` is `rho0 * exp(-h / scale_height_m)`,
and both ascent and descent run through the same `step()`, which applies
`drag = 0.5 * rho * v^2 * Cd * A / mass` against the velocity vector every timestep. There is
no separate ascent model and no simplified atmosphere for the climb.

Which coefficient applies is configuration-dependent and correct: the slender hull on the way
up and on unstaged braking passes, the blunt shield after staging, the canopy once the chute
is out.

### It is not a rounding error on the climb

Re-flown with the same ship and only the sea-level density changed:

| | arc apex | EVA window | fuel left after the arc | orbit at the floor |
|---|---|---|---|---|
| vacuum (drag off) | 57,363 m | 106 s | **45.2%** | yes, 7.0% left |
| half density | 56,680 m | 101 s | 36.5% | yes, 3.4% left |
| **as shipped** | 56,164 m | 97 s | **29.5%** | yes, 0.0% left |
| double density | 55,291 m | 91 s | 18.2% | **no** |

Drag on the way up costs **15.7 points of tank** — a third of what the ship comes home with —
and doubling the air takes orbit off the table entirely. Anyone tuning `sea_level_density_kgm3`
for reentry feel is also tuning whether the first launch works.

Where the air actually is, on the shipped profile:

| altitude | density | share of sea level |
|---|---|---|
| 0 m | 1.5 | 100% |
| 6,200 m | 2.03e-1 | 13.5% |
| 20,000 m | 2.37e-3 | 0.158% |
| 30,000 m | 9.40e-5 | 0.0063% |
| 43,000 m | 0 | hard cut |

### Three things the model does not do, stated so nobody assumes otherwise

- **One reference area for hull and shield.** `reference_area_m2` is 3.1 m2 for both; only the
  drag coefficient changes (0.45 hull, 1.5 shield). A real blunt shield presents a bigger
  frontal area as well as a higher Cd, so staging is modelled as worth 3.3x in drag when it
  should be more. Every aerobraking number is conservative by that margin.
- **The atmosphere is cut hard to zero at `atmosphere_top_m`.** Just below the cut the density
  is 1.4e-6 kg/m3, about one part in a million of sea level, so the discontinuity is
  negligible in force terms — but it is a true edge, and it is why the skim-altitude scan
  finds such a sharp optimum.
- **Point mass.** No attitude, no angle of attack. The pilot is assumed to hold retrograde
  perfectly, so measured heat is a best case.

### The finding: the ship overheats on the way UP, and nothing checks it

`step()` accumulates the heat bar during ascent exactly as it does during reentry — the
unstaged 3x multiplier included, because the ship has not staged. `simulateAscent` never read
it. Now that it reports it:

| route | peak heat on the climb | capacity |
|---|---|---|
| ballistic arc | **142.5** | 100 |
| circularised orbit | **141.6** | 100 |

**The base ship's launch peaks at 1.4x the heat capacity before it ever reaches the junk.**
Max dynamic pressure is 19.7 kPa at 2,857 m, and the bar peaks in the thick air low down.

Two readings, and the design has to pick one:

- **The 3x unstaged multiplier should not apply to a nose-first climb.** It exists because a
  braking pass presents a naked hull broadside to the airflow with no shield behind it. A
  rocket flying prograde under thrust is in its aerodynamic configuration, not its worst one.
  This is the likelier answer.
- **Or ascent heating is a real mechanic** — throttle back through max Q or burn through —
  which would be a new decision for §2.2 and would need the ascent to enforce the bar.

Either way it is currently unresolved rather than decided, and `bands_reachable` passes a ship
that would have burned up.

---

## 14. Correction: the skimmed-descent figures in §11b and §12 were the floor being evaded

Found 2026-07-28 while drawing the trajectories, which is the only reason it was found at all:
the "one skim" path rendered as a **single pass**.

**What was wrong.** With `skims >= 1` the ship starts on an ellipse whose periapsis is the
*skim* altitude, not `entryPeriapsis`. If that skim altitude is low enough, the ship lands on
that first passage and never commits — so `entryPeriapsis`, and with it the commit floor, is
never used. The search happily found those descents and reported them as skimmed. They are
the shallow plunge the floor exists to forbid, wearing a skim's name.

**Every "1 skim" and "2 skim" number in §11b and §12 is affected. The plunge figures are
sound** — with `skims = 0` the ship starts on the entry trajectory and the floor binds
properly.

A descent now only counts if it flew all its skims **and** a committed entry
(`passes >= skims + 1`). Re-measured:

| commit floor | load | plunge | 1 skim (corrected) | *1 skim (as printed before)* |
|---|---|---|---|---|
| 8,000 m | empty | 144.7 | **86.2** | *67.4* |
| 8,000 m | full hold | 203.7 | **125.5** | *98.7* |
| **8,000 m** | **satellite** | **268.8** | **196.5** | *128.9* |
| 12,000 m | satellite | 241.3 | 181.9 | *128.9* |
| 16,000 m | satellite | 201.4 | 163.6 | *128.9* |
| 20,000 m | satellite | 136.9 | 130.7 | *128.9* |

The old column being constant at 128.9 across every floor should have been the tell: if the
floor changes nothing about a descent, that descent is not obeying the floor.

**The recommendation survives, because the binding constraint was never the satellite's
skim.** At a floor of 8,000 m the window is bounded below by the *full hold's plunge* at
203.7, which has not moved, and above by the satellite's plunge at 268.8. Capacity 235 still
sits inside it, and the window is still 32% wide.

**What does not survive: "capacity ~180 forces the full hold to skim as well".** That was
built on the artifact. The real window for forcing both is (196.5, 203.7] — **4% wide**, a
coincidence rather than a mechanic. Force the satellite alone.

A side effect worth noting as evidence the correction is right: two skims now reads *cooler*
than one (170.3 against 199.8, from the top of the band). The old numbers had them identical,
because both were the same non-committing pass.

### Where the line actually sits, for when this is revisited

Chad's framing — "a ship that stays in the upper atmosphere for a full orbit before coming
down is fine, even as one continuous pass" — is a better rule than the pass count, which is
brittle: whether a ship *exits* the air is an accident of where its periapsis sits. Arc swept
inside the atmosphere measures the intent directly. Satellite, from the top of the band:

| descent | peak | arc swept in the air | in air |
|---|---|---|---|
| plunge, entry 8,000 m | 268.4 | 44° | 926 s |
| the evading pass at 20,604 m | 131.3 | **118°** | 1,196 s |
| one skim then commit | 199.8 | **338°** | 1,346 s |
| two skims then commit | 170.3 | 582° | 1,888 s |

The evading descent is a third of a lap — a long shallow dive that reaches the ground on the
way through, not a ship loitering in thin air. A threshold near 270° would separate them on a
physical quantity instead of a pass count, and give the same answer. Not implemented; the
pass-count rule stands until the endgame has been played.

---

## 15. The live run, and the harness bug it exposed

Ran 2026-07-28, live, against the short GDD and the locked planet. 102 minutes, two Designer
revisions, two Balancer revisions, three audits.

**Result: 20 of 21 checks passed.** The one failure is a defect in the measuring instrument,
not in the design or the config — and the Auditor characterised it correctly without being
able to see why.

### What the crew produced

| | |
|---|---|
| planet | the locked one, unchanged — the lock held |
| band | `orbit`, 50,000–280,000 m, samples 65 / 115 / 215 km |
| `commit_floor_m` | **8,000 m** |
| `heat_capacity` | **208**, with heat-shield tiers buying **213** and **218** |
| endgame haul | Scorched Reentry Cone, 1,600 kg |
| debris | 25 types, 7 fragile |
| verification | 12/12 scenarios landed, ballistic coefficient 233.9 kg/m² |

Flown against those numbers, from the top of the band:

| load | plunge | one skim, then commit |
|---|---|---|
| empty | 145.8 | 98.3 |
| full hold (1,146 kg) | 203.8 | 139.5 |
| **endgame haul** | **222.2** | **134.9** |

The endgame haul is locked out of the plunge at **every** shield tier (222.2 against a top
tier of 218) and comes home on one skim (134.9, against a base capacity of 208). Ordinary
loads plunge freely. **This is the design working.** The full hold's 203.8 against 208 is only
a 2% margin and is the number to watch on the next catalog revision.

### The bug: the commit floor must not bound `descentScan`

`descentScan` flies ONE periapsis for the whole descent — a decay. That single periapsis is
both where the ship brakes and where it comes down, and the commit floor constrains only the
second. Bounding the scan by the floor therefore forbade the shallow braking altitudes that
are the only way that model reaches a second pass at all, so every cell returned
`pass_counts_reachable [1]`.

The Auditor read that honestly and concluded:

> all twelve descent cells report `pass_counts_reachable [1]` and `cheapest_pass_count 1`, so
> no two-pass descent is reachable at any load or altitude … This rule is unsatisfiable by any
> numbers in this harness, not a value the Balancer chose badly.

Every word of which is true **of the harness**. The manoeuvre was working the whole time; the
instrument could not express it. That is the fifth time on this project that a bounded or
fixed search has been reported as a property of the design.

### Fixed

- **`descentScan` is unbounded again.** The floor belongs where the entry is a separate
  variable.
- **`verificationSweep` now emits `committed_descents`** — for each altitude and load, the
  coolest descent at 0–3 skims with the entry pinned at the floor and the skim altitude
  searched above it, plus `must_skim` and `skim_saves_it`. On the shipped config, exactly one
  of the twelve rows reports `must_skim` — top of the band, endgame haul. That is the rule,
  measured.
- **The Auditor is told to judge the rule on `committed_descents` and nothing else**, with the
  reason spelled out: if its evidence cites a pass count, it is reading the wrong table.
- Two tests pin it: that a commit floor in the params does not change which depths
  `descentScan` visits, and that a skim which lands on its own never paid a commit burn.

**The run should be repeated** now that the instrument can see the manoeuvre. Nothing about
the config needs to change for it — the numbers already satisfy the rule.

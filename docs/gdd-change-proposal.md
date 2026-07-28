# GDD change proposal — what the flight simulator measured

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

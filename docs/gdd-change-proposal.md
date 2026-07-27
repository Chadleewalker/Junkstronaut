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

> **Contested — read §7 before acting on this.** A later run measured the same quantity on a
> different planet scale and got a tenth of the effect. The half of this section that
> survived is the half that says a single plunge is cheapest; the proposed replacement
> wording did not.

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

## 7. §2.3.1 again — the newest run contradicts §1 above, and §1 may be the wrong one

This section disagrees with section 1 of this document. Both are recorded rather than one
quietly replacing the other, because the disagreement is the finding.

The crew's most recent full run flew the shipped config and measured the skim multipliers at
the same entry depth section 1 uses (0 m — a grazing entry, where skimming has the most to
give):

| band | 0 skims | 1 | 2 | 3 |
|---|---|---|---|---|
| suborbital | 1 | 0.951 | 0.897 | **0.684** |
| low | 1 | 0.977 | 0.955 | 0.934 |
| high | 1 | 0.984 | 0.968 | **0.954** |

Section 1's table, on a different planet scale, has three skims cooling a grazing entry by
**50%**. This run has three high-band skims cooling it by **4.6%** — an order of magnitude
apart, in the same measurement, on the same simulator. Something about planet scale or
ballistic coefficient moves this enormously, and **neither number should be written into the
GDD until it is known which.** That is the open question this document now carries.

What does not depend on resolving it:

**A single committed plunge is the cheapest descent at every band and every load.** Ablation
rises monotonically with pass count in all nine band × load descents without exception:

| descent | 1 pass | 2 | 3 | 4 |
|---|---|---|---|---|
| suborbital, full hold | 15.6 | 18.0 | 18.5 | 18.9 |
| low, full hold | 13.1 | 17.2 | 18.1 | 18.5 |
| high, full hold | 13.6 | 18.7 | 19.5 | 19.7 |

The second pass costs 3.9–6.9 plate-percent and returns nothing. §2.3.1's *"never a single
plunge"* is false at every band and every load, and this is the one check the crew could not
revise its way out of across three rounds — the cost array is internally exact to within
0.01% and describes a descent the game does not fly.

**Depth is the lever skimming was supposed to be.** On the high band, moving entry depth from
0 to 36000 m drops peak heat 163.1 → 93.8 (0.575×), while three skims reach only 0.954 —
**depth is roughly eight times the lever.** Each skim also costs 43–54 m/s of commit Δv and
about an hour of simulated flight (1.25 h direct against 4.18 h with three skims).

**Proposed:** the descent decision the design wants is *how deep do you commit*, not *how many
times do you skim*. That is a decision the config does not currently expose — there is no
entry-depth parameter — and it is worth considering before tuning the skim economy further.
Section 2's escalating thermal toll still stands either way: it exists to close the feathering
exploit, and it does that regardless of which lever picks the optimum.

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

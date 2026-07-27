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

## 5. §2.3.1 — the unstaged braking phase is currently unflyable

**What the GDD says:** coarse braking happens before staging, *"shallow passes with the
naked hull soaking slow heat"*.

**What was measured, at the crew's own numbers:** those passes peak at **687–719** on a
0–100 heat bar. The Spec Auditor noted that even at an unstaged heat multiplier of 1.0
instead of 3.2 it is still 2× over the cap, so the multiplier is not the cause — the hull's
lower drag lets it linger where the heat bar reaches equilibrium.

**Proposed:** either the naked hull needs materially more heat tolerance, or the braking
phase happens *after* staging and the one-way commit moves later in the sequence. This one
is a genuine design decision, not a number to nudge, and the measurements do not choose
for you.

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

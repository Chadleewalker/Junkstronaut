# Pending GDD changes — decisions taken, not yet written into the document

> **If you are here to edit the GDD, read `gdd-edit-brief.md` instead.** This file is the
> decision log in the order decisions were taken, and later entries retract earlier ones —
> reading it top to bottom will hand you a recommendation that was afterwards measured to be
> wrong. The brief is the work order; this is the trail.

**Status: a decision log, not a proposal.** Every item here has been decided. None of it has
been applied to `Junkstronaut GDD Short.txt`, which is the document of record and currently
does not contain these rules.

The measurements behind each decision are in `gdd-change-proposal.md`. This file exists so
that the GDD edit, when it happens, does not have to re-derive them.

---

## The scope decision

`Junkstronaut GDD Short.txt` §4.3 "Cut From the Scope" currently cuts four things that are
**being kept**:

| §4.3 says cut | decision |
|---|---|
| Ablative shield & multi-pass aerobraking — "reentry is one committed pass against a simple heat bar" | **keep the full mechanic.** Skimming and the committed plunge both stay. |
| Tow fee | **keep**, clamped at 50% |
| — | the break-even rule stays (already in §2.5, no change needed) |

So §4.3 needs those entries removed or narrowed when the document is updated. The three
remaining cuts in §4.3 — multi-tether shear, size classes / fragile / compactor / crane /
oversized, and the Researcher and Art Director agents — have **not** been revisited here and
should be treated as still cut unless separately decided.

Note that the short GDD also differs from what the crew currently audits in ways that are
*not* covered by any decision above and still need resolving: it describes **one** suborbital
band where the crew assumes three, and **3 parts × 3 tiers = 9** upgrade purchases where the
crew assumes 6 × 2 = 12.

---

## What to write into §2.2 (reentry)

### The descent has two decisions, not one

- **How deep you commit.** Already implied by §2.2's "the deeper and faster, the hotter".
  Measured: moving the committed entry from a grazing 0 m to 21,500 m drops high-band peak
  heat 159.9 → 90.9, a **0.568×** lever.
- **How many shallow skims you fly first.** Measured at the altitude where a skim actually
  bites: **0.453×** from the high band. Skimming is the *stronger* of the two levers.

An earlier version of the analysis said depth was roughly fifteen times the lever and skims
were worth 2.8%. That was an artifact of a hardcoded skim altitude twelve scale heights up in
vacuum, since fixed. Do not carry those numbers into the document.

### Skims are nearly free, so the toll is the whole brake

Measured, high band, entry held fixed:

- commit Δv for a skim: **0 m/s** — a skim at the right altitude drops apoapsis inside the
  atmosphere and no burn is needed
- time cost: **0.70 h direct against 0.80 h with skims** — six minutes

Nothing in the physics stops a player skimming indefinitely. The **escalating thermal-fatigue
toll is the only thing that does**, and it has to be written as load-bearing rather than as a
tiebreaker. With a flat toll a 25-pass feathering descent costs about the same as a 4-pass
one; with `cycle_toll_growth > 1` it costs 847% of plate. State the escalation explicitly.

### The benefit saturates after roughly one skim

Measured multipliers on the committed entry, at the scanned skim altitude:

| band | 0 skims | 1 | 2 | 3 |
|---|---|---|---|---|
| suborbital | 1 | 0.697 | 0.697 | 0.697 |
| low | 1 | 0.526 | 0.526 | 0.526 |
| high | 1 | 0.439 | 0.439 | 0.439 |

One skim drops apoapsis into the atmosphere; after that there is no speed left to shed. Two
things follow for the document: the curve flattens rather than declining smoothly, and
**skimming helps most from the high band** — the direction the design wants, and the opposite
of what the crew reported before the fix.

---

## The 2-pass high-altitude goal, and what it requires

**Decision: the cheapest descent from the high band should be 2 passes.**

This does not hold at present, and the reason is specific and fixable. Measured with skim
altitude, entry depth and skim count all optimised:

| passes | best plate cost |
|---|---|
| 1 | 3.65% |
| **2** | **4.18%** |
| 3 | 5.07% |
| 4 | 6.70% |

One pass wins by **13%** — a margin, not a chasm. The cause is **substitution**: choosing a
shallower committed entry buys the same reduction in entry speed that a skim does, for one
heat cycle instead of two. A player free to pick any entry depth will never pay for a skim.

**So the rule needs a constraint that makes the substitution cost something.** Any one of
these would do it, and the choice is a design call that has not been made:

- a minimum commit angle or depth — you cannot enter arbitrarily shallow
- a navigation-precision limit on how finely entry depth can be chosen
- a soak-time penalty on the long shallow path (the heat bar has a ~5 s drain, so a shallow
  entry stays warm for much longer — this is already half-modelled)

At a 13% margin this is a small rule, not a redesign. **Write the constraint into §2.2 at the
same time as the skim mechanic**, or the 2-pass goal will not survive contact with the
simulator.

### What will not rescue it

Recorded so nobody spends the time again:

- **Not the ablation rule.** Peak bar, total heat load and peak heating rate all get *worse*
  with more passes; total load is worst at 2.4×.
- **Not the toll.** Set `cycle_toll_base_pct` to zero and one pass still wins.
- **Not the ship.** Three runs at ballistic coefficients of 19.4, 182.8 and 290.3 kg/m² —
  spanning "the atmosphere stops it" to "a real reentry capsule" — all gave one pass.
- **Not band altitude alone.** Multi-pass only becomes optimal unaided at apoapsis ≈ 9.5×
  periapsis, roughly ten planet radii up, and even then it wins by 1.2%.

---

## Two smaller things to state while editing

- **`parachute_area_m2` belongs in the config.** The chute ships at a fixed mid-tier value
  (§2.5), so its area is a design constant and should be written down. Until it was, the
  simulator had to solve the area backwards out of the claimed descent speed and then measure
  that same speed back — the parachute rule passed every audit it ever faced by construction.
- **The √mass chute law in §2.3 is confirmed.** Doubling ship mass raises touchdown speed by
  a measured 1.41×. No change needed; it is right.

---

## Consequences for the crew, once the GDD is updated

Not GDD changes, but they follow from these decisions and should not be forgotten:

- The crew currently audits against §2.3.1–2.3.7 subsections that exist in the withdrawn long
  GDD and **not** in the short one. Its charters cite them by number.
- Of the 20 checks in the last recorded audit, 6 survive the short GDD unchanged, 5 need
  rescoping for one band and 9 purchases, and 9 relate to mechanics cut in §4.3 — of which
  the skim, ablation and tow-fee checks come back under the decisions above.
- `findGdd` does not know the filename `Junkstronaut GDD Short.txt`.
- The long GDD is recoverable at `git show HEAD:"Junkstronaut GDD.txt"` if any of its wording
  is worth lifting rather than rewriting.

---

## Decided 2026-07-28: multi-pass is a requirement, not a preference

**Decision (Chad):** with a heavy load from a high band, multi-pass must be the player's only
option, and **the final satellite reentry must require at least one skim.**

This replaces the goal recorded above it. "The cheapest descent from the high band should be
2 passes" is a cost rule, and the measurements say it cannot be won by tuning — one pass is
the argmin under every ablation key, at every band and load. The new goal is a *feasibility*
rule, and it is both easier to satisfy and closer to what the mechanic is for.

**So §2.2 does not need the entry-depth constraint after all.** The three candidates listed
earlier — minimum commit angle, navigation-precision limit, soak-time penalty — were all
attempts to win the cost argument. Superseded. Leave them recorded as dead ends.

**What to write into §2.2 instead:** the heat bar has a capacity, and above a certain cargo
mass a single committed pass exceeds it no matter how the entry is flown. Skimming is not the
cheaper route home for a heavy haul; it is the only one.

### What the numbers require

Measured in `gdd-change-proposal.md` §11. Two changes, both outside §2.2:

| parameter | now | proposed | why |
|---|---|---|---|
| `planet.scale_height_m` | 3,100 | **1,100** | Widens the design margin from 7% to 46%. A gradual air column lets a ship brake gently in one pass, which is what makes the plunge safe. |
| `reentry.heat_capacity` | 100 | **~140** | At 100 the satellite is unflyable at any pass count (best profile reads 131). At 140 one pass reads 177 and two passes read 121. |

Shield area stays at 3.1 m2. At those settings an empty ship (83) and a full hold (93) can
still plunge, so the requirement lands only on the heavy endgame haul — which is the design.

**Not yet confirmed.** The optimizer surface is jagged and the ranking is not monotonic in
shield area. Re-measure at higher resolution before this goes into the document.

### Two things this surfaced that were not on any list

- **The full hold already cannot plunge home from the high band.** One pass reads 104 against
  a capacity of 100. The mechanic the design wants partly exists today; no crew check reports
  it, because `cheapest_descent_is_multi_pass` reads cost and never reads survivability.
- **Nothing in the crew has ever flown the satellite.** Loads are empty / half / full hold.
  The win condition of the game is not in any load set. Add it.

### Bearing on the two open scope questions

- **One suborbital band or three.** Unchanged as a question, but note that the crew's
  "suborbital" band carries an `orbital_speed_ms` and a `period_s` — it is a circular orbit,
  not the ballistic arc §2.6 describes. That naming is why `shipping_slice_bands_reachable`
  fails: the simulator makes the ship circularise and it runs 13.8-28% short of fuel at all
  three bands. **If the design really is suborbital arcs, that check is failing against a
  requirement the GDD never made.** Settle the band question before re-running anything.
- **9 upgrade purchases or 12.** No longer a bookkeeping difference. §2.5 ships the heat
  shield "at fixed mid-tier", which makes bar capacity a single design constant — and §11
  shows bar capacity is the parameter that decides whether the satellite run requires
  multi-pass at all. The crew's 12-purchase version makes it a tier the player buys, which
  turns the endgame's difficulty into a shopping decision. **Pick deliberately; this is a
  mechanics question now, not a shop-size one.**

---

## Decided 2026-07-28 (second pass): scope questions closed

Both open scope questions are now settled, plus one that came out of the multi-pass work.

### One orbital band, with a value gradient by altitude

**Decision:** one band, not three. Junk gets more valuable the higher it is.

The player chooses how to fly it — circularise into orbit, or throw a high-altitude ballistic
arc. Both are legal, and each has its own bargain: the arc is far cheaper in delta-v because
it never pays for circularisation, but it comes back in faster and hotter. Height is where
the money is, so the value gradient and the reentry risk rise together on their own — which
is the difficulty curve §2.6 wanted, without three discrete tiers to keep in sync.

**Consequence for the crew, which currently hardcodes three bands.** `band_value_multiplier`
(1 / 2.4 / 5.5) becomes a continuous function of altitude. Every per-band map in the params —
`heat_index`, `cost_curve`, `optimal_skims` — loses its keys, and the debris catalog's
per-piece `band` enum has to become a position in the envelope. This is a contract change,
not a constant change: four schemas, five charters, `sweep.js`, `charts.js` and the tests.

### Twelve upgrade purchases — the crew's path, not the GDD's

**Decision:** 6 parts x 2 tiers = 12. Fuel tank, thruster, storage, **heat shield**,
**parachute**, **hand magnet**.

§2.5 currently says 3 parts x 3 tiers = 9 and that "parachute, heat shield, and jetpack ship
at fixed mid-tier values". That sentence goes.

This is the decision with the most reach, and it is not a shop-size question. §11 of
`gdd-change-proposal.md` shows the heat bar's **capacity is the parameter that decides whether
the satellite run requires multi-pass at all**. Making the shield a purchase puts that
parameter in the player's hands: the endgame's difficulty becomes something they shop for.
The capacity window measured in §11 (121..177 at scale height 1,100 m) is wide enough to hold
a tier ladder rather than a single constant, which is what makes this affordable.

### Skim passes may be flown staged or unstaged — the player chooses

**Decision:** both are legal. Staging before the braking passes is allowed.

This closes the risk flagged at the end of §11. Every number in that section was measured with
`stageAfter = 0` — staged from the start — which turns out to be a legal line of play rather
than a modelling error, so **the measurements stand as the staged branch**. Unstaged skimming
is the other branch, and it is the dangerous one: §2.2's 3x unstaged heat multiplier applies
to every braking pass flown before the shield is exposed.

The trade is genuinely two-sided, and it is a better decision than either half alone:

| | staged skims | unstaged skims |
|---|---|---|
| heat on each braking pass | shield exposed, 1x | naked hull, **3x** |
| control | **none** — staging is one-way, no thrust to adjust periapsis between passes | full — can raise or lower periapsis between passes |

So committing early buys cool passes at the price of flying the rest of the descent on the
trajectory you already have; staying unstaged buys steering at triple heat. **Write both into
§2.2.** What is not yet measured is the unstaged branch's own capacity window — see the
outstanding work below.

---

## Correction 2026-07-28: the planet change is NOT ready to write into the GDD

The two parameter changes proposed above — `scale_height_m` 3,100 → 1,100 and a heat-capacity
ladder — were conditional on a higher-resolution confirmation. **That confirmation failed.**
See `gdd-change-proposal.md` §11a.

At 41 x 21 rather than 25 x 13, the capacity window at scale height 1,100 m collapses from
**46% to 1%**. The finer entry-depth scan finds a much cooler single pass for the satellite —
128 on the bar where the coarse scan said 177 — and the single-pass peak is what the window's
upper edge is made of.

**What still stands:**

- Multi-pass has to be a feasibility rule, not a cost rule. Unchanged and well measured.
- The heat bar's capacity is the lever, and putting it on the heat-shield tiers is what makes
  the endgame's difficulty a purchase.
- At the shipped numbers the satellite cannot come home at any pass count, and a full hold
  already cannot plunge from the top of the band.
- The one-band decision and the twelve-upgrade decision are independent of all of this and
  are unaffected.

**What does not stand:** any specific value for `scale_height_m`, and the claim that a
comfortable capacity window exists. **Do not write a planet number into the GDD yet.**

**Why this keeps happening, and what would end it.** The minimum achievable single-pass peak
is a minimum over a search, so a finer search can only lower it — every window measured this
way is an upper bound that shrinks as the grid refines. A window is only believable once it
stops moving between resolutions, and none of these has been shown to. The next step is a
third resolution on the promising rows, and a number that holds.

---

## Correction 2026-07-28 (final): the entry-depth constraint is back, and it is the answer

The section above marked the entry-depth constraint **superseded**. That was wrong, and it is
reinstated. See `gdd-change-proposal.md` §11b for the measurements.

**What was wrong.** §11 claimed the heat capacity could force multi-pass on its own. It cannot.
Minimising the single-pass descent properly — rather than sampling it on a grid — shows the
coolest single pass is as cool as or cooler than the coolest multi-pass at *every* scale
height tested, 800 m through 3,100 m. No bar height separates them, and scale height moves
every peak together without changing the ratios. **Drop the planet change entirely.**

**Why skimming looked useless.** A skim makes the committed entry arrive slower — but so does
committing shallower, for one heat cycle instead of two, and the player chooses the entry
depth for free. Hold the entry depth fixed and one skim is worth **0.42-0.53x** on the peak.
The mechanic works; the freedom to enter arbitrarily shallow is what makes it pointless.

### The decision to write into §2.2

**A floor on how shallow the committed entry may be.** A minimum commit angle, or a
navigation-precision limit on how finely entry depth can be chosen — whichever reads better
in fiction. Both do the same job: they stop the player buying a skim's worth of speed
reduction for free.

With a floor at **8,000 m**, from the top of the band:

| load | plunge | one skim |
|---|---|---|
| empty | 144.7 | 67.4 |
| full hold | 203.7 | 98.7 |
| satellite | 268.8 | 128.9 |

- **Heat capacity ~235** — the satellite cannot plunge and must skim; a full hold and an empty
  ship still can. A 32% window.
- **Heat capacity ~180** — the full hold must skim too, and only an empty ship can plunge. A
  41% window.

Either satisfies the decision that the final reentry requires at least one multi-pass. The
second is the stronger reading of "when you have a really heavy load and are high up".

Unlike everything in §11, these windows are bounded by a rule rather than by how finely a
search was sampled, so they do not erode when the measurement gets more careful. That is the
property that was missing, and it is why this one is safe to write down.

### What this does not change

The one-band decision, the twelve-upgrade decision, and the staged/unstaged skim choice are
all independent of this and stand as recorded. So does the shape of the audit rule: multi-pass
is a feasibility question, not a cost question.

---

## Decided 2026-07-28: the climb does not pay the unstaged heat penalty

**Decision (Chad):** the ascent is exempt from the 3x unstaged heat multiplier.

Measured in `gdd-change-proposal.md` §13: with the penalty applied the base ship's launch
peaked at **142.5** against a heat capacity of 100 — it burned up before ever reaching the
junk, and no check looked at ascent heat at all. Exempt, it reads **47.5**, about half the
bar. That is the better number for its own reason: the player meets the heat mechanic on
their very first flight and learns to read it, and reentry stays the place it is dangerous.

**This is a phase rule, not a change to `unstaged_heat_multiplier`.** Turning that parameter
down to 1 would have taken the penalty off *braking passes* as well, and those are the one
place the design wants it — §2.2 puts the shield behind the thruster and tank, so an unstaged
ship taking a braking pass has only hull between it and the airflow. The rule implemented is:

> The unstaged penalty applies to unstaged flight in the atmosphere **except during ascent**,
> where the ship is flying pointy end first in the configuration it was built for.

Verified: descent numbers are byte-identical to before the change (unstaged first pass
53.5329, plunge 100.0000, two-skim entry 71.2519, checked against the committed `sim.js`), and
an unstaged braking pass still pays exactly 3.000x.

**One caveat that is not a decision yet.** "The launch survives" is a property of the shipped
planet, not a guarantee of the rule. On the synthetic test-fixture world the exempt climb
still reads 157 against a capacity of 100. So a Researcher free to pick a different planet can
still produce one whose launch burns up, and nothing currently fails that. The ascent now
reports `peakHeat`; making the audit read it is a separate, small piece of work.

### What §2.2 should say

- Heat builds on the way up as well as on the way down — it is the same bar and the same rule,
  `above ~half orbital speed in atmosphere`. The climb crosses that threshold at 583 m/s and
  spends **41.8 seconds** above it.
- The climb tops out around **half the bar** on the base ship. It is a warning, not a threat.
- Peak heating on the climb is at **16,103 m and 794 m/s**, not at max dynamic pressure, which
  is five times lower at **2,875 m**. They are 13 km apart because heating goes as
  `sqrt(density) x speed^3` while dynamic pressure goes as `density x speed^2`.

---

## Decided 2026-07-28: one planet, locked

**Decision (Chad):** pick one planet and stick with it. It is now `crew/planet.lock.json`.

| | |
|---|---|
| radius | 200,000 m |
| surface gravity | 9 m/s² |
| atmosphere top | 43,000 m |
| scale height | 3,100 m |
| sea-level density | 1.5 kg/m³ |
| band | 50,000 – 280,000 m, samples at 65,000 / 115,000 / 215,000 |

These are the numbers **every** measurement in `gdd-change-proposal.md` was taken against —
the 97-second EVA window, the satellite's 268.8 plunge, the commit floor, the heat capacity.
Change one and all of them are void.

**Why it had to be locked.** The Researcher invented a planet every run. That is why
re-flying the exploration grid against each revision round moved 73% of cells' scores and the
twenty best cells had zero overlap between round 0 and round 1 — every round reported
"best 7/8" and they were different sevens. It also meant every number in the proposal was a
property of a planet the next run might not produce.

**How it is enforced.** The orchestrator passes the locked planet to the Researcher as a hard
constraint *and* overwrites the planet and band blocks after it returns, recording in `notes`
if the Researcher proposed something else. Sample orbital speeds and periods are recomputed
from the locked radius and gravity rather than trusted, so they cannot drift out of agreement
with the planet. The Researcher's remit is now the reentry block only: drag coefficients,
heating exponent, onset speeds, reference area.

---

## Also landed 2026-07-28: the two parameters the design was missing

- **`reentry.commit_floor_m`** is now a real parameter, in the schema, set by the Balancer,
  and enforced by `descentScan` and `skimStudy` — both used to scan entry depths all the way
  to the top of the atmosphere, which is what made skimming pointless. The Auditor is told to
  check the floor *first*, because a floor near `atmosphere_top_m` constrains nothing and the
  rest of the endgame check is then moot.
- **`launch_survives_itself`** is a new verification target and audit rule. The climb's peak
  heat is reported per sample and overall; a config whose first flight burns up now fails
  instead of passing reachability without comment.
- The **heat-shield tiers buy `heat_capacity`**, not plate capacity — the bar is the parameter
  that decides whether the endgame must aerobrake, so putting it on the shield is what makes
  the endgame's difficulty something the player shops for.

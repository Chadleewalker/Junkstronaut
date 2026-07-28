# Pending GDD changes — decisions taken, not yet written into the document

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

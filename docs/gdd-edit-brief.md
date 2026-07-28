# GDD edit brief

**For whoever updates `Junkstronaut GDD Short.txt`.** Everything below is decided. This is a
work order, not a discussion.

Read this file alone. `gdd-pending-changes.md` and `gdd-change-proposal.md` grew by accretion
over one long session and contain **superseded recommendations that were later measured to be
wrong** — an agent reading them top to bottom will hit a retracted recommendation before its
correction. Those two files are the audit trail and the evidence; this one is the instruction.
Where they disagree with this file, this file wins.

Status as of 2026-07-28. Written by the session that produced the measurements.

---

## The one-paragraph version

The game is one continuous orbital band with a value gradient, reached either by ballistic arc
or by circularising. Twelve upgrade purchases across six parts. Reentry keeps skimming and the
committed plunge, and the endgame is forced to aerobrake by a **commit floor** — a limit on how
shallow the player may commit — combined with a heat-bar capacity the loaded ship cannot plunge
under. The planet is fixed and must not be re-derived.

---

## 1 · The planet is locked — do not restate it as open

`crew/planet.lock.json` is the decision. Radius 200,000 m, surface gravity 9 m/s², atmosphere
top 43,000 m, scale height 3,100 m, sea-level density 1.5 kg/m³.

**Every number in this brief is a property of that planet.** If §4 or an appendix invites the
Researcher to choose a planet scale, remove the invitation.

---

## 2 · §2.6 — one band, value rises with altitude

**Current text is nearly right and needs only sharpening.** §2.6 already says one suborbital
band with a value gradient. Keep that. Two things to make explicit:

- The band spans **50,000 – 280,000 m**. The player picks their own altitude inside it; there
  are no tiers.
- **Value rises continuously with altitude**, from a multiplier of 1.0 at the floor to 5.5 at
  the ceiling, interpolated on a piece's altitude. Not three steps.

The phrase "suborbital band" is now misleading and should go. The band is orbital; what is
suborbital is one of the two **routes** to it (§3 below).

---

## 3 · §1 and §2.2 — both routes up are legal, and the arc is the first launch's route

§1 already offers "a suborbital arc or orbit". Promote that from an aside to a stated
mechanic, because it is what makes the opening of the game work:

- **The ballistic arc** never pays for circularisation, which is most of the delta-v. The base
  ship reaches the band floor on an arc with a **97-second EVA window** and **29.5% of its tank
  left**. That is the first launch.
- **Circularising** costs the rest of the tank. The base ship can just barely do it and arrives
  with nothing to deorbit on; the **first fuel-tank upgrade** is what makes orbit a real option
  (10.9% left). Say so — it is the first upgrade's purpose.

---

## 4 · §2.2 — the climb heats the ship too

New, and it belongs in the reentry section because it is the same bar:

- Heat builds above roughly half orbital speed **in atmosphere**, on the way up as well as
  down. The climb crosses that threshold at 583 m/s and spends **41.8 seconds** above it.
- The base ship's launch peaks at about **half the heat bar**. A warning, not a threat — it is
  where the player learns to read the mechanic.
- Peak heating on the climb is at **16,103 m and 794 m/s**, *not* at maximum dynamic pressure,
  which is five times lower at **2,875 m**. Heating goes as √density × speed³; dynamic pressure
  as density × speed². Worth a sentence, because it is counter-intuitive and it tells the
  Coder where to put the effect.
- **The ascent does not pay the unstaged heat penalty.** The 3× penalty is for an unstaged ship
  taking a braking pass with only hull between it and the airflow. A rocket climbing prograde
  is in its aerodynamic configuration. This is a phase rule, not a change to the multiplier —
  braking passes still pay 3×.

---

## 5 · §2.2 — the reentry rules, including the one that is genuinely new

### Keep, against §4.3's cut list

Ablative shield and multi-pass aerobraking, the committed plunge, the tow fee (clamped at 50%),
and the break-even rule. §4.3 currently cuts the first two and the tow fee; those entries go.

### Skimming and the plunge are substitutes, and that is the whole design problem

A skim drops apoapsis into the atmosphere so the committed entry arrives slower. **But
committing shallower does the same thing**, for one heat cycle instead of two — and the player
picks the entry depth for free. Measured: with the entry free, the coolest single pass is as
cool as or cooler than the coolest multi-pass at every scale height from 800 m to 3,100 m. **No
heat capacity separates them, and scale height is not a lever.**

### The commit floor is the rule that fixes it — this is the new mechanic

**The player may not commit to an entry shallower than 8,000 m.** Fictionally: a minimum commit
angle, or a limit on how finely the entry can be aimed. Either reads fine; pick one.

With the floor in place, from the top of the band:

| load | plunge | one skim, then commit |
|---|---|---|
| empty | 144.7 | 86.2 |
| full hold (≈1,398 kg) | 203.7 | 125.5 |
| **Armstrong's satellite (3,600 kg)** | **268.8** | **196.5** |

**Heat capacity 235.** The satellite cannot plunge (268.8) and comes home on one skim (196.5),
while an empty ship and a full hold still plunge freely. A 32% window, bounded below by the
full hold's plunge.

**Do not try to force the full hold to skim as well.** That window is (196.5, 203.7] — 4% wide,
a coincidence rather than a mechanic.

### Skims may be flown staged or unstaged — a real choice

| | staged skims | unstaged skims |
|---|---|---|
| heat per braking pass | shield exposed, 1× | naked hull, **3×** |
| control | **none** — staging is one-way, no thrust to adjust periapsis between passes | full |

Committing early buys cool passes at the price of flying the rest of the descent on the
trajectory you already have. Both branches are legal and both should be described.

### The escalating thermal toll is load-bearing

A skim costs **0 m/s of Δv and about six minutes**. Nothing in the physics stops a player
skimming indefinitely; the escalating per-cycle toll is the only thing that does. State it as
the brake, not as a tiebreaker.

---

## 6 · §2.5 — twelve upgrade purchases, and the shield is one of them

Replace "3 parts × 3 tiers = 9 purchases" and "parachute, heat shield, and jetpack ship at
fixed mid-tier values" with:

**Six parts × two tiers = 12 purchases:** fuel tank, thruster, storage, heat shield, parachute,
hand magnet.

**The heat-shield tiers buy heat-bar capacity**, not plate capacity. The bar is what decides
whether the endgame must aerobrake, so putting it on the shield makes the endgame's difficulty
something the player shops for. **Every tier must stay below the satellite's plunge peak** — a
maxed shield that buys the plunge back removes the win condition's mechanic.

---

## 7 · §2.3 — confirmed, no change

The √mass parachute law is right: doubling ship mass raises touchdown speed by a measured
1.41×.

One addition: **`parachute_area_m2` belongs in the config.** Until it was stated, the simulator
had to solve the area backwards out of the claimed descent speed and then measure that same
speed — the parachute rule passed every audit it faced by construction.

---

## 8 · Do not reintroduce these

Each was proposed, measured, and killed. They are listed so nobody re-derives them.

| dead idea | why |
|---|---|
| "The cheapest descent should be 2–4 passes" | Unsatisfiable. One pass is the argmin under every ablation key, at every altitude and load. The design's requirement is **feasibility**, not cost. |
| Tuning scale height to make skimming worth flying | Moves every peak together and changes no ratio. 800 m to 3,100 m shifts the satellite's single-pass peak only 121 → 128. |
| Keying ablation off peak heating rate or total heat load instead of the bar | Measured all three. One pass wins under each. |
| A capacity that forces multi-pass without a commit floor | With the entry free, no capacity separates a plunge from a skimmed descent. |
| Capacity ~180 to force the full hold to skim too | Built on a measurement error (see below). The real window is 4% wide. |

---

## 9 · Numbers in the older documents that are known wrong

If you read `gdd-change-proposal.md`, these will appear and are **superseded**:

- **§11's recommendation** (scale height 1,100 m, a 46% window) — a resolution artifact.
  Corrected in §11a and §11b.
- **Every "1 skim" and "2 skim" figure in §11b and §12**, especially the recurring **128.9**.
  Those descents landed on the skim itself and never committed, so the commit floor was being
  evaded. Corrected in §14. The plunge figures in those sections are sound.

---

## 10 · Still genuinely open

Not blockers for the edit, but do not write them down as settled:

- **The EVA window is 97 seconds** on the first launch. Whether that is enough time to fly out,
  tether a piece and stow it is a judgement nobody has made in play. If it is too tight, the
  fix is a bigger arc, not a bigger tank — apex barely moves across the whole shop
  (56.2 → 57.0 km) because the climb is thrust-limited.
- **How "skimming" is distinguished from "a long shallow entry."** Currently by pass count,
  which is brittle. Arc swept inside the atmosphere is the better measure — the evading descent
  sweeps 118°, a genuine skim-then-commit sweeps 338° — and a threshold near 270° would
  separate them physically. Not implemented.
- **The audit does not yet fail a planet whose launch burns up.** The climb's peak heat is
  reported and checked against the capacity, but on a different planet the exempt climb can
  still exceed it.

---

## Where the evidence lives

| file | what it is |
|---|---|
| `gdd-change-proposal.md` | every measurement, including the ones that were wrong and their corrections. §11a, §11b and §14 are the retractions. |
| `gdd-pending-changes.md` | the decision log, in the order decisions were taken |
| `crew/planet.lock.json` | the locked planet |
| `crew/probes/` | seven scripts that produced the numbers; each re-runnable, README explains the order they were written in and why that order is the argument |
| `crew/out/report/tuning-candidate.html` | the candidate config against eight gates |
| `crew/out/report/trajectories.html` | the flight paths, drawn to scale |

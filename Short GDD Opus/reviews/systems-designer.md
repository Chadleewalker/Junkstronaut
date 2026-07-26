# Systems Designer — Round 1

Lane: core loop, progression, pacing, difficulty curve, resource/economy math. The
question throughout: do these systems interlock, or just share a page?

---

## Finding 1 — The win object has no upgrade path that reaches it (BLOCKING)

The document states the satellite is "reachable and landable only near full upgrades"
(§2.6) and that the win requires retrieving it. But trace the descent systems against
the upgrade tree and the math does not close:

- Descent braking after staging is **parachute only** — staging is "one-way, no thrust
  after" (§2.2), and you must stage to expose the heat shield and survive reentry.
- Parachute terminal speed "grows with ship mass (≈ square root)" (§2.3), and the
  parachute "ships at fixed mid-tier values" (§2.5). It **cannot be upgraded.**
- The satellite "roughly doubles the ship's mass" (§2.6). So chute descent speed is
  ~1.41× a normal maxed haul — and §2.3 already says a merely "greedy haul drifts
  toward the hard-landing line." Double mass is well past it.
- The three purchasable upgrades are Fuel tank, Thruster, Storage (§2.5). **None of
  them reduce chute descent speed.** Thruster helps only *before* staging; once you
  stage for the shield, thrust is gone.

There is no lever — purchasable or otherwise — that buys down the satellite's touchdown
speed under the fixed chute. "Landable only near full upgrades" describes a capability
the upgrade tree does not contain. Compounding it: §2.2 says "cargo damages one slot per
~3 s at 100% heat" and the doubled-mass satellite "runs hotter and opens the chute
window later and lower," so the satellite also cooks on the way down before it ever
reaches the chute. The endgame goal appears mechanically unwinnable as specified. This
is the keystone of the whole progression and it does not resolve.

---

## Finding 2 — The upgrade tree doesn't touch the game's hardest system (MAJOR)

§4 declares the central difficulty engine to be the reentry loop: "cargo mass raises
reentry heat, heat delays safe parachute deployment, later deployment increases
touchdown speed, touchdown speed destroys cargo." Yet the three things the player can
actually buy (Fuel tank, Thruster, Storage — §2.5) map onto that loop as follows:

- Fuel tank: eases the *ascent*, does nothing for reentry.
- Thruster: eases the *ascent*; irrelevant once staged.
- Storage: explicitly *worsens* the descent ("raises the profit ceiling and the
  difficulty of the flight home," §2.5).

Heat shield, parachute, and jetpack — the systems that actually govern surviving
reentry — are all fixed-tier and non-upgradeable (§2.5). So the player spends the entire
economy buying capacity to fly *higher and heavier*, while the reentry challenge has **no
player-controlled counter-lever** and gets strictly harder as cargo mass climbs. §2.6
calls this "difficulty scales with success automatically," but self-balancing only holds
if progression also buys down difficulty somewhere; here it only ratchets difficulty up.
The result is not a difficulty curve, it's a difficulty ramp with no brake — the systems
coexist rather than interlock.

---

## Finding 3 — Jetpack fuel is a load-bearing resource that is never defined (MAJOR)

Two systems depend on jetpack fuel:
- The core greed decision — "every trip out costs jetpack fuel and every stowed piece is
  permanent mass" (§2.4) — is the stated heart of the EVA loop.
- A loss condition — "stranded with no fuel" (§1, §... loss clause).

But the document never specifies jetpack fuel's capacity, its refill rule, whether it's
a separate pool from rocket tank fuel (rocket fuel is the thing Armstrong refills for
money, §2.5), whether running dry mid-EVA far from the ship actually strands you, or how
it scales — and the jetpack "ships at fixed mid-tier values" (§2.5), so it can't be
upgraded either. Without a capacity and refill model there is no way to reason about EVA
pacing, how many pieces a trip affords, or how close the player skates to the stranding
loss. A resource that gates the collect step *and* triggers a loss cannot be left this
undefined; the economy sweep (§3) has nothing to sweep around for it.

---

## Finding 4 — The economy has a floor, one anchor, and no fail state (MINOR)

The only quantified economic statement is "Launch cost ≈ the value of 2–3 cheap pieces,
so a lazy run still breaks even" (§2.5). No piece values, no upgrade prices, no run
length, no fuel-per-distance are given. Two structural consequences:

- With a guaranteed breakeven floor and the loss conditions being only crash/strand (§1),
  there is **no economic fail state and no downward pressure** — a player can grind
  break-even runs indefinitely. The "#Feeling — fear of wasting cargo value" pillar (§1)
  therefore has no teeth on lazy or moderate runs; the anxiety only exists on ambitious
  ones the player is free never to attempt. Progression becomes a monotonic grind gated
  only by patience.
- The breakeven claim also omits a real sink: Armstrong "repairs the hull/heat shield at
  a flat fee per %" (§2.5). A run that lands hard pays launch *plus* repairs next time,
  so damaged runs are net-negative — meaning the true break-even/loss boundary is not
  modeled by the single stated anchor. The economy sweep is being asked to find a curve
  from essentially one scaffolded data point.

---

## Finding 5 — The soft-landing requirement fights the chute window for heavy loads (MINOR)

§2.3: "Soft landings require deploying the chute early to shed enough speed." §2.2: a
chute deployed during plasma "shreds," so you must wait until "the plasma clears," and
for a heavy hold this window "opens later and lower." These two rules pull opposite
directions for exactly the heavy hauls the game funnels the player toward: you're told to
deploy *early* to land soft, but the game forbids deployment until plasma clears, which
for heavy loads happens *late and low*. For a sufficiently heavy haul the earliest legal
deployment may already be too low/fast for a soft landing to be reachable at all. This is
the mechanism underneath Finding 1, but it also affects ordinary greedy hauls, so it's
worth confirming there exists a mass range where "deploy early" and "wait out plasma" can
both be satisfied.

---

## Round 2 — Cross-examination

### CONFLICTS

**vs. Adversarial QA, Finding 2 (economic soft-lock) — tension with my Finding 4.**
QA reads the economy as a *downward spiral into an unrecoverable bankruptcy state*: a
survivable-but-hard landing sells for less than launch cost, repeat and the balance
trends below the launch price, leaving the player alive, un-stranded, and too poor to
fly. I read the same passages and concluded the opposite headline — a *monotonic grind
with no downward pressure*, because §2.5 guarantees "a lazy run still breaks even." Both
can't be the top-line truth, so here's the reconciliation I'll defend: the breakeven
floor is conditioned on an **intact** lazy run. A patient player who only flies safe,
low-mass, intact runs can never go bankrupt — but also never progresses (my failure
mode). A player who takes the risk the game demands to afford upgrades and lands hard
can spiral (QA's failure mode). They are not contradictory; they are the two exits from
the same missing piece — the document never models the repair sink against the breakeven
anchor. My Finding 4's second bullet already named that sink, but I stopped at
"net-negative"; QA carried it to the soft-lock conclusion, which is the sharper end
state. I concede QA's framing is the more severe reading and that the *combined* issue
is stronger than my MINOR. See revision below.

**vs. Business Analyst, Finding 4 (anxiety hook gated late) — no conflict, but a boundary
dispute.** The Business Analyst and I land on the same observation from opposite lanes:
the "fear of wasting cargo value" pillar has no teeth until greedy late-game play (their
market lens, my systems lens, both citing §2.5's break-even floor and §2.3's land-anywhere
sale). We agree it's MINOR *as a pillar-timing issue*. My only push-back: from the systems
side this isn't merely a "positioning/onboarding concern" — it's evidence that the
*difficulty curve itself is flat-then-cliff* rather than a curve, which is the same root
as my Finding 2 (no counter-lever, difficulty only ramps). The late activation isn't a
marketing footnote; it's the shape of the progression.

### CONNECTIONS

**My Finding 1 (satellite unwinnable) × Feasibility Finding 1 (Playtester has no pilot).**
This is the scariest combination on the board. My finding says the endgame is unwinnable
*on paper*. The one tool the project builds to catch exactly that — the Playtester
answering "Is the satellite run beatable at full upgrades?" (§3) — has, per Feasibility,
**no specified flight-control policy** to actually fly the reentry. So the safety net
designed to falsify my BLOCKING finding is itself unbuilt. If the pilot policy never
materializes and the team falls back to hand-tuning (§4.4), nobody discovers the
satellite is unlandable until a human tries it late in week one. The determinism gap
(Feasibility Finding 2) compounds this: even if a sweep *does* run, a non-reproducible
result can't prove beatability. My BLOCKING and their MAJOR reinforce each other — the
flaw and the mechanism that would have caught it are both absent.

**My Finding 2 (upgrade tree ignores reentry) × Adversarial QA cross-cutting note
(low-arc runs skip heat entirely).** QA notes heat only builds "above ~half orbital speed"
(§2.2), so a suborbital arc that stays below that threshold triggers no heat, needs no
staging, and permits a *powered* landing with the engine retained. Combine that with my
Finding 2: since the upgrade tree only buys ascent capacity and never buys down reentry
difficulty, the rational player response to the un-counterable reentry ramp is to
**avoid reentry** — farm the entire non-satellite economy on low arcs under the heat
threshold, engine retained, chute never needed. The two findings interlock into a single
exploit: the game's hardest system has no upgrade counter-lever AND a legal bypass, so
the "central difficulty engine" (§4) is optional for everything except the one forced
satellite run. That hollows out the difficulty curve for ~9 tiers of grind.

**My Finding 2/4 × Player Psychologist Finding 3 (loss aversion, no positive
reinforcement).** I argued the systems give the player no lever to buy down reentry
difficulty; the Psychologist argues the player gets no *emotional* reward for surviving a
greedy run either. Stacked, these say the greedy late game is punishing on both the
mechanical axis (harder every tier, no brake) and the affective axis (no triumph payoff,
only relief). A progression that gets monotonically harder with no counter-lever and no
positive reinforcement is the exact recipe for the "haul timid / quit" behavior they
predict. Neither lens alone shows how tightly the ramp and the punishment-weighting
feed each other.

### REVISIONS

- **Finding 4 (economy) — UPGRADE MINOR → MAJOR.** On its own I scored the missing
  economic fail state as a MINOR modeling gap. After QA Finding 2, the same missing
  model produces a concrete unrecoverable soft-lock (alive, un-stranded, can't afford to
  launch, no loss screen). An undefined *terminal* state is a build-blocking-adjacent
  problem, not a tuning nicety. I'm raising my severity to MAJOR and explicitly merging
  it with QA's bankruptcy case.

- **Finding 5 (soft-landing vs. chute window) — HOLD at MINOR, narrow the claim.** QA
  Finding 1 supplies the concrete math I hand-waved (a normal maxed haul must descend
  near ~3.5 m/s for 1.41× to stay under the ~5 m/s soft threshold). That strengthens the
  *satellite* case in my Finding 1, but it also means my Finding 5's independent value is
  only the claim about *ordinary* greedy (non-satellite) hauls. I'm keeping it MINOR and
  scoping it explicitly to "confirm a legal deploy window exists across the normal mass
  range," so it doesn't just duplicate Finding 1.

- **Finding 1 (BLOCKING) — HOLD, strengthened.** QA independently reached the same
  BLOCKING conclusion from the same passages with the descent-speed arithmetic spelled
  out. Two isolated reviewers converging on "the win is mechanically unreachable as
  written" is the strongest signal in my lane. No change; confidence up.

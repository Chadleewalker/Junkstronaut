# Adversarial QA — Round 1

Document reviewed: `gdd.txt` — *Junkstronaut* (First Draft)

Five findings, each traced to a passage or a specific omission. Severity: BLOCKING / MAJOR / MINOR.

---

## Finding 1 — The win object may be physically unlandable, and upgrades don't help
**Severity: BLOCKING**

**Problem.** The win condition requires soft-landing the satellite, but the document's own physics push that landing past the fail line, and none of the purchasable upgrades can pull it back.

- §1 (Win): the satellite is "reachable and landable only near full upgrades."
- §2.6: the satellite "roughly doubles the ship's mass … and arrives damaged unless the touchdown is soft."
- §2.3: "Chute descent speed grows with ship mass (≈ square root)," and soft = under ~5 m/s.
- §2.5: "Parachute, heat shield, and jetpack ship at fixed mid-tier values" — i.e., the chute is **not** upgradeable.
- §2.2 / §2.4: you must **stage away the thruster and tank** for reentry ("one-way, no thrust after"), so there is no powered descent to help either.

Doubling mass raises chute descent speed by ≈√2 (≈1.41×). To land the satellite soft you must therefore have a normal-haul descent speed near ~3.5 m/s so that 1.41× stays under 5. But the three upgrades that "near full upgrades" refers to are Fuel tank, Thruster, and Storage — none improve descent speed, and Storage actively *raises* it ("bigger hold raises … the difficulty of the flight home"). The chute is fixed. So "landable only near full upgrades" is contradicted by the mechanics: **upgrades improve reach, not landability**, and the single component that governs landability can never be improved. Either the win is gated on a landing the player has no growth lever for, or the satellite silently doesn't obey the √mass chute rule. This needs a resolved answer before build, because it determines whether the game is winnable.

---

## Finding 2 — Economic soft-lock: bankruptcy is not a defined loss (or recovery) state
**Severity: MAJOR**

**Problem.** The only loss states listed are "stranded with no fuel, or 0 HP" (§1). Nothing covers the player who is alive, landed, and simply too poor to launch again.

- §2.5: "Every launch costs money." "Launch cost ≈ the value of 2–3 cheap pieces, so a lazy run still breaks even."
- §2.3: a hard (non-fatal) landing damages cargo, so the haul sells for less.

"Breaks even" means a cautious run nets ~zero — it never funds an upgrade. To progress you must take risk, and a risky run that ends in a hard-but-survivable landing (cargo damaged, HP > 0) can sell for **less than the launch cost**, i.e., a net loss. Repeat that and the player's balance trends toward the launch price and below. At that point the player cannot afford to launch, is not stranded, and is not at 0 HP — an undefined, unrecoverable state with no loss screen and no restart trigger. The document needs either a bankruptcy loss condition or a guaranteed-affordable-launch floor (e.g., Armstrong fronts a minimum run).

---

## Finding 3 — Jetpack fuel vs. tank fuel: the EVA-stranding case is unhandled
**Severity: MAJOR**

**Problem.** The document treats "fuel" as one thing at the shop but as two things in play, and never closes the EVA-runs-dry case.

- §2.4: "every trip out costs jetpack fuel."
- §2.5: "Armstrong fills the tank" — the rocket tank, at launch.
- §1 (Loss): "stranded with no fuel."

Jetpack fuel is clearly distinct from rocket-tank fuel, yet the doc never says how the jetpack is refueled, whether it's finite per launch, or whether it shares the tank. The concrete edge case: an astronaut who exhausts jetpack fuel while EVA and away from the rocket (e.g., after chasing a high-value piece near the top of the band) is drifting in space with no way back and a full/partial hold that was never stowed. Is that "stranded with no fuel" (a loss)? Can they cold-drift back? Is there reserve? Undefined. Given §2.6 explicitly encourages pushing "near the top of the envelope" for the good stuff, this case will be hit regularly.

---

## Finding 4 — A shredded parachute is not covered by launch repairs; chute-less relaunch is possible
**Severity: MAJOR**

**Problem.** The parachute can be destroyed in play, but the repair rule only names hull and heat shield.

- §2.2: "a parachute deployed during plasma shreds."
- §2.5: Armstrong "repairs the hull/heat shield at a flat fee per %." No mention of the parachute.

If a player deploys during plasma (an easy mistake — the safe cue is a subtle "white toward orange" glow, §2.2) and shreds the chute, the doc doesn't say the chute is restored at the next launch. Read literally, launch repairs cover hull and heat shield only, so the player could relaunch with a shredded/absent chute, guaranteeing an unavoidable hard landing — or, worse, a cascade where each hard landing damages the hull/cargo further while the root cause (no chute) is never repairable at the shop. At minimum the parachute must be added to the launch-repair scope, or its post-shred persistence explicitly defined.

---

## Finding 5 — Cargo-ablation order is unspecified: exploit and/or feel-bad
**Severity: MINOR**

**Problem.** Reentry heat destroys cargo "one slot per ~3 s at 100% heat, hull only after all cargo" (§2.2), but the document never says *which* slot goes first.

Two failure modes fall out of this omission:
- **Exploit:** if the destruction order is predictable/player-controllable, a player loads cheap sacrificial panels to act as ablative shielding for a valuable piece, blunting the intended "greed vs. survival" tension (the whole point of §2.4/§2.6).
- **Feel-bad / unfairness:** if the order destroys the most valuable piece first, or is random, the player loses the run's entire value to an invisible coin flip with no counterplay.

Either way, this interacts directly with §2.6's "value scales with mass" — heavier = more valuable = the pieces you most want protected. The ablation ordering rule is load-bearing for balance and must be specified.

---

### Cross-cutting note (not counted among the five)
Heat only builds "above ~half orbital speed in atmosphere" (§2.2). A suborbital arc that stays below that threshold triggers no heat, needs no staging, and permits a powered landing with the engine retained — potentially letting the entire non-satellite economy be farmed with the heat/staging system fully bypassed. Worth a deliberate ruling on whether low-arc runs are meant to skip reentry entirely.

---

## Round 2 — Cross-examination

I break things, so I'll spend this round on where colleagues' findings either sharpen my edge cases into structural breaks or actually contradict me. Two conflicts, three connections, two revisions.

### CONFLICTS

**vs. Systems Designer Finding 4 (and Business Analyst Finding 4) — "the economy has a breakeven floor / no downward pressure."** This is a direct conflict with my Finding 2. Systems Designer writes the economy has "a guaranteed breakeven floor" and "no economic fail state and no downward pressure — a player can grind break-even runs indefinitely," concluding progression is "a monotonic grind gated only by patience." Business Analyst leans the same way, calling "a lazy run still breaks even" a *safety net* that removes stakes. My Finding 2 argues the opposite: money can trend **down** into an unrecoverable bankruptcy hole. I'll defend my side, and I think the document backs me — because Systems Designer's own second bullet concedes it: "Armstrong repairs the hull/heat shield at a flat fee per %… A run that lands hard pays launch *plus* repairs next time, so damaged runs are net-negative." That is precisely the downward pressure their headline denies. You cannot simultaneously claim "guaranteed breakeven floor / no downward pressure" and "damaged runs are net-negative." The breakeven claim (§2.5) is stated for a *clean* lazy run only; the moment a hard-but-survivable landing damages cargo (§2.3) and adds a repair bill (§2.5), the floor is gone. So the correct read is not "monotonic grind" (Systems) nor "safe early game" (Business) — it's that the floor is conditional and a run of bad landings walks the balance below launch price into the undefined bankruptcy state I flagged. My Finding 2 stands, and it is *strengthened* by Systems Designer's repair-sink observation, which I did not price in as heavily as I should have.

**vs. Player Psychologist Finding 3 — "players haul timid to avoid the pain."** Not a hard contradiction, but a tension worth surfacing against my Finding 2. The Psychologist's predicted failure mode (a) is players who, after one bad loss, "start hauling timid, boring, half-empty loads to avoid the pain." If that behavior is dominant, players sit on the breakeven line indefinitely — which looks like Systems' monotonic grind, not my bankruptcy spiral. My rebuttal: timid play is only *safe* if breakeven truly holds, and per the conflict above it doesn't — a timid run that still catches a hard landing (heat/plasma mistimed, §2.2, which the Psychologist's own Finding 1 says new players will routinely botch) is net-negative. So the two behavioral outcomes converge on the same unhandled state: the timid player grinds toward zero slowly, the greedy player crashes toward zero fast, and neither has a defined bankruptcy loss screen. The psychology finding actually *widens* the population that reaches my edge case.

### CONNECTIONS

**My Finding 1 × Narrative Critic Finding 3 — the "hollow climax" is not an edge case, it's the default.** Narrative flags that the satellite "arrives damaged unless the touchdown is soft" (§2.6) and worries the payoff "can resolve with you delivering it dented and scorched." Combine that with my Finding 1 / Systems Finding 1: if there is *no upgrade lever that buys the satellite's touchdown speed under 5 m/s*, then the soft landing is not merely hard — it may be unreachable. Which means the damaged delivery Narrative treats as a risk is the **guaranteed** outcome. The two lenses together escalate this: it's not "the ending might feel hollow," it's "the ending mechanically cannot be the good one." That converts a story-logic gap and a systems gap into a single load-bearing question — is a soft satellite landing physically possible? — that both the climax and the win condition depend on.

**My Finding 1 × Feasibility Lead Finding 1 — the Playtester can't answer the one question that matters.** Feasibility notes the Playtester is asked "Is the satellite run beatable at full upgrades?" but has no defined flight-control policy to actually pilot the ship. Cross that with my Finding 1: even a *perfect* pilot cannot land a fixed chute under a doubled mass if the math forbids it. So the sweep's headline question has two failure modes stacked — no pilot to run it (Feasibility), and no winnable answer for the pilot to find (me). If the harness ever does run, a "not beatable" result would be indistinguishable from "pilot too weak." The winnability question needs to be resolved *analytically* (my Finding 1), before it's ever handed to an underspecified autopilot.

**My Finding 5 × Player Psychologist Finding 3 — ablation order is a loss-aversion amplifier.** My cargo-ablation finding worried about exploit vs. feel-bad. The Psychologist's loss-aversion frame tells me which one hurts more: if the ablation order strips the *most valuable* piece first (or randomly), it lands the sting exactly on the run the player cared about most — the full-hold greedy run whose investment-and-loss both peak at descent. So the "feel-bad" branch of my Finding 5 isn't cosmetic; it's a direct multiplier on the rage-quit trigger the Psychologist describes. The ordering rule should be specified *and* biased toward player-favorable (cheap-first) to avoid compounding the loss-aversion problem.

### REVISIONS

- **Finding 2 (bankruptcy) — hold at MAJOR, but note it's now double-sourced.** I nearly upgraded it after seeing Systems Designer independently reach the repair-sink net-negative math and Business Analyst independently flag the fragility of the breakeven claim. Three lenses now touch the same soft economic floor. I'm keeping it MAJOR rather than BLOCKING only because it's a slow-onset state, not a launch-blocker — but the moderator should note it survived cross-examination *strengthened*, since a colleague's finding supplied the exact mechanism (repairs) my argument needed.
- **Finding 5 (cargo-ablation order) — keep at MINOR, but withdraw the implication that it's isolated.** In Round 1 I framed it as a standalone balance/feel issue. The connection to Player Psychologist Finding 3 shows it's a node in the broader "descent punishes the run you care about most" complaint, not a separate quibble. Same severity, but it should be reported as part of that cluster rather than on its own.
- **Nothing withdrawn.** Findings 1, 3, and 4 drew no colleague contradiction; Finding 1 in particular was independently reconstructed by Systems Designer, so I'm more confident in it, not less.

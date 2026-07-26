# Adversarial QA — Round 1

## Finding 1 — Armstrong's satellite can be destroyed, making the game unwinnable
**Severity: BLOCKING**

**Problem:** The win condition is "retrieve Mr. Armstrong's satellite," and Section 2.6 says it "arrives damaged unless the touchdown is soft." Section 2.2 says cargo takes damage during hot reentry ("cargo damages one slot per ~3 s at 100% heat") and Section 2.3 says landing damage scales with vertical speed. Nothing states whether the satellite can be *destroyed* outright, whether a destroyed satellite respawns in orbit, or whether a "damaged" satellite still counts as a win. If the heaviest object in the game — which by design runs the hottest reentry and the latest, lowest chute window — burns up or is destroyed on a hard landing, the player may be locked into a permanently unwinnable save with no listed fail state covering it. The Playtester's question ("Is the satellite run beatable at full upgrades?") tests that success is *possible*, not what happens on failure.

**Source:** Sections 1 (win/loss), 2.2, 2.3, 2.6 — omission of satellite persistence/destruction rules.

## Finding 2 — Staging is one-way, but every successful run ends staged; the ship's engine replacement is never specified
**Severity: MAJOR**

**Problem:** Section 2.2: staging "jettisons them — one-way, no thrust after," and staging is required for any shielded reentry. So the intended loop means *every* landing leaves a ship with no thruster and no tank. Section 2.5 says Armstrong "fills the tank, and repairs the hull/heat shield at a flat fee per %" — filling a tank that was jettisoned in the upper atmosphere. Stage replacement is never priced, never mentioned as free, and never mentioned at all. Related edge case: what happens if the player presses B (stage) on the launch pad or at low altitude with a full tank? By the stated rules they now have fuel but no thrust — which doesn't match either listed loss condition ("stranded with no fuel, or 0 HP"). That's an undefined soft-lock reachable with one keypress.

**Source:** Sections 2.1 (stage on B), 2.2 ("one-way, no thrust after"), 2.5 (refuel/repair list omits stages); Section 1 loss conditions.

## Finding 3 — EVA fail states are entirely unhandled: jetpack fuel exhaustion, exit during descent, ship/astronaut separation
**Severity: MAJOR**

**Problem:** Section 2.4 says "every trip out costs jetpack fuel," and Section 2.1 gives exit/enter on F with no stated restrictions. Unhandled cases: (a) astronaut runs out of jetpack fuel while tethered to a heavy piece away from the ship — is this "stranded," a death, or a drift-forever state? Jetpack fuel capacity, refill rules, and whether it counts toward the "stranded with no fuel" loss are all unstated. (b) Can the player press F and exit during atmospheric descent or reentry? An astronaut in plasma has no defined outcome. (c) Both ship and astronaut are on ballistic arcs — if the ship's orbit decays or drifts while the player is out hauling junk, can the ship reenter without the player? No rule says the ship holds station.

**Source:** Sections 2.1 (unconditional F verb), 2.4 (jetpack fuel cost with no capacity/refill/failure rules); Section 1 loss list.

## Finding 4 — "Cargo damages before hull" turns cheap junk into ablative armor; burn order and mass-after-destruction are unspecified
**Severity: MAJOR**

**Problem:** Section 2.2: at 100% heat, "cargo damages one slot per ~3 s… hull only after all cargo." Two omissions create an exploit: (1) Which slot burns first — cheapest, random, last-stowed? If cheapest-first or player-orderable, the optimal strategy is to pad the hold with worthless panels as sacrificial heat shielding for high-value pieces, inverting the intended greed penalty. (2) Does a destroyed slot's mass disappear? If yes, an overloaded ship *sheds mass mid-reentry as it burns*, cooling itself and pulling the chute window earlier — meaning overloading is partially self-correcting and the "full hold runs hotter" punishment softens exactly when it should bite. This also lands directly on the QA agent's invariant list ("cargo damages before hull"), so the ambiguity will get baked into tests as written.

**Source:** Section 2.2 (damage ordering), 2.3 (chute speed vs. mass), 3 (QA invariant list) — omission of burn order and destroyed-cargo mass rules.

## Finding 5 — Bankruptcy soft-lock: intact ship, empty wallet, and no loss condition that covers it
**Severity: MAJOR**

**Problem:** Section 2.5: "Every launch costs money," and repairs are "a flat fee per %." Section 2.3/4.3: an intact landing sells the haul, "crashing is the only penalty." Sequence: player takes a hard-but-survivable landing, cargo destroyed by heat, hull heavily damaged, cash below (repair + fuel). The player is alive, landed, at 0 HP-adjacent but not dead, and cannot afford to launch. Neither loss condition ("stranded with no fuel, or 0 HP") triggers — you *have* a ship, you just can't pay Armstrong. The "lazy run breaks even" claim (launch cost ≈ 2–3 cheap pieces) assumes you can afford the launch in the first place and assumes zero repair bill. Nothing specifies a debt floor, a free minimal refuel, or a bankruptcy game-over. The Playtester sweep asks "does the economy let a lazy run break even?" but never samples the post-crash recovery path.

**Source:** Section 2.5 (launch cost, per-% repair fee), Section 1 (loss conditions), Section 3 (economy sweep scope) — omission of a broke-but-alive state.

## Round 2 — Cross-examination

### CONFLICTS

**vs. Systems Designer, Finding 5 (jetpack fuel, MINOR).** We found the same hole — EVA fuel has no capacity, refill, or loss-state rules — and I rated it MAJOR (my Finding 3) while the Systems Designer rated it MINOR, framing it as "the resource that gates it needs its rules written down." That framing undersells it. This is not a missing tuning paragraph; it is a *reachable undefined terminal state* in the middle third of every single run: burn the jetpack dry while tethered to a heavy piece and the game has no answer — not death, not loss, not rescue. A player can sit in that state forever. Missing rules that produce soft-locks are fail-state bugs, not documentation gaps, and my Finding 3 also covers two adjacent undefined states (EVA during reentry, ship reentering without the pilot) that the Systems Designer's version doesn't reach. MAJOR stands.

**vs. Business Analyst, Finding 5 ("sells anywhere," MINOR — "probably a one-line answer").** I'll argue it is not a one-liner, because "land anywhere" composes with the economy rules into new undefined states. Armstrong's services (refuel, repair, shop — Section 2.5) are described with no stated location, but the launch pad is the only launch site the document mentions. If you can land intact 20 km from the pad with an empty tank: is that "stranded with no fuel" (a loss, despite a perfect landing)? Does Armstrong refuel you remotely? Does the ship teleport back? Each answer creates or destroys a fail state, and one of them (intact landing = loss condition trigger) would directly contradict 2.3's "crashing is the only penalty." The BA priced this as a scoping one-liner; from the fail-state side it's a rules decision with at least three edge cases hanging off it. I'd put it at MAJOR, not MINOR.

**vs. Systems Designer Finding 3 / Business Analyst Finding 2 ("land safer doesn't exist").** Partial conflict worth stating precisely: both colleagues claim the player has *no* systemic counter to rising landing difficulty. Under one resolution of my Finding 4's ambiguity, that's false — if cargo burn order is exploitable and destroyed mass sheds, players can and will build their own "land safer" out of sacrificial cheap junk (ablative armor + self-lightening ship). So the design space isn't "no relief valve"; it's "no *designed* relief valve, and a degenerate one waiting in an unspecified rule." That makes both findings worse, not softer: the absence of a legitimate mitigation purchase is exactly the pressure that will push players to find the exploit.

### CONNECTIONS

**Bankruptcy × onboarding (my Finding 5 × Player Psychologist Finding 1).** The Psychologist establishes that a new player's first 2–3 reentries will "almost certainly destroy their haul" while learning the stage→plasma→chute→gear sequence. Chain that with my Finding 5: those exact first crashes are the sequence that drives cash below (repair + fuel) with nothing sold. The undefined broke-but-alive state isn't a tail-risk for unlucky veterans — it sits directly on the mandatory new-player path, in the first hour. Three reviewers (me, Systems Designer Finding 1, Psychologist Finding 3) hit this independently; the Psychologist's onboarding evidence is what moves it from "possible" to "expected."

**Spec ambiguity × spec-driven QA (my Finding 4 × Feasibility Lead Finding 5).** The Feasibility Lead notes the QA agent "reads the spec, not the implementation." Combine with my Finding 4: the spec's invariant "cargo damages before hull" is silent on burn order and mass-after-destruction, so the QA agent will canonize *some* arbitrary interpretation in green tests. The pipeline then actively defends the ambiguity — the exploit ships with a passing test suite certifying it. A methodology that treats the spec as ground truth converts every underspecified rule I flagged into a tested, "verified" behavior.

**Happy-path autopilot × off-path fail states (my Findings 2/3/5 × Feasibility Lead Finding 1).** Even if the unbudgeted autopilot gets built, it flies the mission loop — launch, collect, reenter, land. Every fail state I flagged (stage on the pad, EVA in plasma, jetpack-dry drift, broke-but-alive) is *off* that path by construction. So Section 3's measurement methodology, working exactly as designed, structurally cannot detect the document's undefined-state class of bugs; and under the hand-tuning fallback, nothing else will either. "Beatable" will be validated; "un-soft-lockable" is validated by no one.

**Satellite fragility × satellite retry loop (my Finding 1 × Psychologist Finding 4, Narrative Critic Finding 1).** The Psychologist's frustration-cliff argument assumes the worst case is *repeating* the satellite run; the Narrative Critic's assumes the worst case is an ambiguous ending. My Finding 1 is the floor under both: if the satellite can burn or be destroyed with no respawn rule, there is no retry and no ending — a dead save. Their findings are about the quality of the climax; mine is about whether the climax remains reachable. The three should be resolved together but are not the same fix.

### REVISIONS

**Finding 5 (bankruptcy soft-lock): upgraded MAJOR → BLOCKING.** Independently discovered by the Systems Designer (Finding 1) and Player Psychologist (Finding 3), and the Psychologist's onboarding analysis shows the triggering sequence lies on the mandatory first-hour path rather than a rare tail. A soft-lock that most new players can plausibly reach, with no covering loss condition and no safety net, is a shipping blocker, not a balance issue.

**Finding 1 (satellite destructibility): retained at BLOCKING, confidence raised.** Three colleagues flagged the "arrives damaged" ambiguity (Narrative Critic 1, Systems Designer 4, Psychologist 4); none contradicted the harder case I raised (outright destruction / no respawn → unwinnable save), and the Feasibility Lead's autopilot finding explains why the planned sweeps would never surface it. Nothing to withdraw.

**Finding 4 (ablative cargo): retained at MAJOR, with a note.** Cross-examination cuts both ways here: the Systems Designer's missing-relief-valve finding makes the exploit more likely to be found and leaned on, but it also suggests a cheap fix — if the designers *deliberately* specify punishing rules (highest-value slot burns first, destroyed mass does not shed), they close the exploit and preserve the greed penalty in two sentences. The severity stays MAJOR because unresolved it inverts a core system, but it is now clearly a decision, not an investigation.

No findings withdrawn or downgraded.

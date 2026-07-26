# DESIGN REVIEW BOARD — Moderator Synthesis

**Document:** `gdd.txt` — *Junkstronaut* (First Draft GDD)
**Board:** systems-designer · narrative-critic · player-psychologist · feasibility-lead · adversarial-qa · business-analyst
**Rounds:** parallel independent review → cross-examination → moderated synthesis

Everything below traces to the six review files. The moderator introduces no new critiques.

---

## 1. TOP 5 ISSUES (ranked by severity × confidence)

### #1 — The win object is mechanically unlandable (BLOCKING)
The satellite "roughly doubles the ship's mass," chute descent speed grows with √mass, and the parachute "ships at fixed mid-tier values" — non-upgradeable. None of the three purchasable upgrades (fuel, thruster, storage) buys down touchdown speed, and storage actively worsens it; staging removes powered descent. So "landable only near full upgrades" describes a capability the upgrade tree does not contain.
- **Flagged by:** systems-designer (F1), adversarial-qa (F1). Connected by narrative-critic (F3) and feasibility-lead (F1).
- **Cross-examination:** **STRENGTHENED.** Two isolated reviewers independently reconstructed the same BLOCKER from the same passages; QA spelled out the arithmetic (a normal maxed haul would need to descend near ~3.5 m/s for 1.41× to stay under the ~5 m/s soft line). Narrative showed the "hollow, damaged-satellite climax" is not a risk but the *mechanically default* outcome; feasibility showed the one tool meant to catch it cannot.

### #2 — The punishing reentry sequence has no onboarding (BLOCKING)
The entire skill ceiling lives in a one-way-staging, wait-for-plasma, deploy-chute-then-gear timing sequence where a single mistake permanently loses the run's cargo or kills the player. The document describes no tutorial, safe first flight, practice mode, or forgiving early band. A new player's first descent is a multi-step timing puzzle with permanent failure and no thrust to correct.
- **Flagged by:** player-psychologist (F1).
- **Cross-examination:** **STRENGTHENED.** Feasibility-lead's F1 (scripting an autopilot for this exact sequence is the single hardest technical task in the project) is independent evidence for the difficulty of the human onboarding — "a second witness from an unrelated lens." Narrative's tone gap (F5) sharpens it: a comedic frame makes the un-tutored first death read as a betrayal of tone.

### #3 — Economic bankruptcy soft-lock (MAJOR, upgraded during cross-examination)
The only loss states are "stranded, no fuel" and "0 HP." A player who survives hard landings with damaged, below-cost hauls — paying launch *plus* per-% repairs next time — can trend below the launch price into an alive, un-stranded, un-recoverable state with no loss screen.
- **Flagged by:** adversarial-qa (F2); systems-designer (F4, **upgraded MINOR → MAJOR** in Round 2); business-analyst (F4, conceded).
- **Cross-examination:** **STRENGTHENED.** Triple-sourced. Systems-designer's own repair-sink observation ("damaged runs are net-negative") supplied the exact downward-pressure mechanism QA's argument needed. QA further showed the psychologist's "timid play" population *also* reaches this state, widening it.

### #4 — The AI Playtester cannot fly the game, and determinism is unproven (MAJOR ×2)
The Playtester is asked "Is the satellite run beatable at full upgrades?" and "Can a full-hold ship land under 5 m/s?" — but the document specifies no flight-control policy (autopilot / input trace / heuristic pilot) to actually fly the reentry. Separately, "deterministic" is asserted while core mechanics ride Godot's non-contractually-deterministic 2D collision system.
- **Flagged by:** feasibility-lead (F1, F2).
- **Cross-examination:** **STRENGTHENED.** Reframed as *the enabling condition for issue #1*: absent a scripted pilot, the satellite BLOCKER "cannot be detected before ship by any process the document describes." QA's F5 (unspecified, possibly random cargo-ablation order) gave the determinism finding a concrete in-scope failure path beyond physics contact-ordering.

### #5 — Thin, undefined content and the missing run-count number (MAJOR)
After the cut list, the game is one suborbital band of functionally identical mass-in-a-slot junk leading to a single win object with no post-game. The document never states target playtime or how many runs the 9-purchase economy takes — the pivot number that decides whether one homogeneous band sustains engagement.
- **Flagged by:** business-analyst (F3); player-psychologist (F4). Reinforced by narrative-critic (F1/F2: blank protagonist, mute vending-machine Armstrong).
- **Cross-examination:** **STRENGTHENED.** Business-analyst and player-psychologist "independently hit the same wall from opposite lenses," converging on run-count-to-completion as "the pivot variable for the entire game's viability" and "the highest-leverage single addition in the doc."

---

## 2. UNRESOLVED DISAGREEMENTS

### A. Does "break-even" describe a floor, a trap, or a reassurance?
Three lenses read the same line ("a lazy run still breaks even") three ways:
- **systems-designer (Round 1):** a guaranteed floor → no downward pressure → a monotonic patience-grind.
- **adversarial-qa:** *not* a floor once repairs enter → downward spiral into an undefined bankruptcy state.
- **business-analyst:** a marketed *safety net* that removes early-game stakes and delays the anxiety pillar.

Cross-examination partly converged — systems-designer conceded QA's is "the sharper reading," and business-analyst withdrew "safety net" in favor of "unverified reassurance." But the design ruling underneath is **escalated to the board**: *does break-even actually hold, and what is the intended economic fail/recovery state?* One answer resolves all three faces; the document quantifies no price, so it currently supports all three.

### B. Is the game anxious, or a scrapyard comedy?
- **narrative-critic (F5):** tone is genuinely undecided — the "#Feeling: anxiety" pillar versus the wry *Junkstronaut* / "clangs on" register — and this indecision is *upstream* of the psychology; it should be resolved before anyone can assert how loss feels.
- **player-psychologist (F3):** builds the loss-aversion retention analysis on the assumption that "anxiety" is the settled, governing feel.

The board cannot settle which tone governs from the document. Business-analyst connects this to the positioning vacuum (F2): the two tones target opposite audiences (*Obra Dinn*-anxiety vs. *Human: Fall Flat*-slapstick) wanting opposite art, audio, and marketing. **Escalated:** pick the governing tone; it gates both the retention model and the market position.

---

## 3. QUICK WINS (cheap fixes)

1. **Add the parachute to launch-repair scope** (or define its post-shred persistence). Repairs currently name only hull/heat shield, so a plasma-shredded chute can carry into a guaranteed-hard-landing relaunch. — *adversarial-qa F4.*
2. **Specify cargo-ablation order and bias it cheap-first.** The "one slot per ~3 s" rule never says which slot burns; a stated player-favorable order kills both the sacrificial-panel exploit and the random feel-bad that amplifies rage-quit. — *adversarial-qa F5.*
3. **State the target playtime / run-count-to-satellite.** One number that resolves both the thin-content and monotony findings and lets production judge whether the single band needs more variety. — *business-analyst F3 / player-psychologist F4.* (Cut the hook's "starting with," which promises a saga the single-object endgame can't deliver — *narrative-critic F4* — while you're there.)

---

## 4. VERDICT

**This document is not yet ready to drive production.** It has a genuine, honestly-expressed thematic spine (greed literally weighing you down), and its 7-day build scope is defensible — but two independent lenses proved the win object may be mechanically unlandable, a second BLOCKER (no onboarding for the game's hardest, most punishing sequence) sits beside it, and the one automated safeguard the plan relies on cannot fly the ship to catch either. The single change that matters most is **resolving satellite winnability** — define an upgrade lever that buys down the satellite's touchdown speed under the fixed chute, or explicitly exempt the satellite from the √mass rule — because it is the keystone the progression, the narrative climax, and the Playtester's headline question all depend on, and every downstream fix is provisional until it is settled.

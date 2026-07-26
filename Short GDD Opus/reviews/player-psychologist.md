# Player Psychologist — Round 1

I review what a real player *feels* moment to moment: the first hour, where
they get confused, where they rage-quit, and whether the reward structure
actually keeps them coming back. The other reviewers can worry about
feasibility and story.

---

## Finding 1 — The hardest, most punishing mechanic has no described onboarding
**Severity: BLOCKING**

The entire skill ceiling of Junkstronaut lives in the reentry/deploy
sequence, and it is brutally unforgiving. From §2.2: the player must
"shape your descent while you still have an engine, then stage once the
final arc is set" (staging is one-way, no thrust after), then wait for
plasma to clear — reading that "the hull glow fades from white toward
orange" — then deploy chute, then gear, in that order. A chute deployed
during plasma "shreds." Get any step wrong and you lose the cargo you
spent the whole run collecting, or die (§1: "0 HP … reentering too hot").

Nowhere does the document describe a tutorial, a safe first flight, a
practice mode, a forgiving early band, or any scaffolding for teaching
this sequence. The design's own emotional pillar is "Anxiety from
atmospheric reentry" (§1) — but anxiety without a learning path is just
frustration. A new player's *first* reentry is a multi-step timing puzzle
with permanent failure and no thrust to correct mistakes. The most likely
first-hour experience is: collect junk, feel good, then get destroyed on
the way down without understanding why. That is a classic quit trigger.

This is a blocking gap because the game cannot ship a teachable version of
its core fantasy without an onboarding plan, and none exists in the doc.

**Traces to:** §2.2 (reentry sequence, one-way staging), §1 (loss
conditions, anxiety pillar); omission of any tutorial/onboarding section.

---

## Finding 2 — Control scheme is overloaded and inconsistent across contexts
**Severity: MAJOR**

The rocket context (§2.1) asks the player to juggle *seven* distinct verbs
on non-standard keys: Thrust (W), rotate (Q/E), RCS (A/D), stage (B),
parachute (C), gear (G), exit/enter (F). That is a lot of simultaneous
cognitive load during the single most stressful phase of the game
(descent), and several bindings fight muscle memory — A/D is "strafe/turn"
in almost every 2D game, but here it's RCS while Q/E rotates.

Worse, the two contexts reuse the same keys with different meanings. In
the Rocket, W = thrust and A/D = RCS. In the Astronaut/EVA context (§2.1),
WASD = jetpack (so W now means "move up," A/D now mean "move
left/right"). The player is asked to context-switch their entire hand
model every time they hit F to exit or enter the ship — often several
times per run. New players will routinely fire the wrong verb (e.g.,
hitting stage or parachute at the wrong moment), and given that staging is
one-way and a mistimed chute shreds, a single fat-finger is catastrophic.

The doc never addresses input legibility, remapping, or on-screen prompts.
For a keyboard-and-mouse-only game (§1) with this many verbs, that is a
real first-hour friction point.

**Traces to:** §2.1 (control table, dual WASD meanings), §1 (K&M only);
omission of any remapping/HUD-prompt discussion.

---

## Finding 3 — The reward loop is built on loss aversion, and it peaks at the worst moment
**Severity: MAJOR**

The design repeatedly frames motivation as *fear of loss* rather than
anticipation of gain. Pillar #Feeling is "the fear of wasting cargo value"
(§1). The tether section calls the core tension "the greed decision"
(§2.4). The value gradient means "the good stuff fights you on the tether
and on the way down" (§2.6), and a greedy haul "drifts toward the
hard-landing line" (§2.3).

The structural problem: player investment and catastrophic-loss risk both
peak at the *same* instant — the descent with a full hold. The run the
player cares about most (heaviest, most valuable cargo) is the run most
likely to end in total loss, because mass raises heat, delays the chute,
and increases touchdown speed (§3's feedback loop). Loss aversion research
says the sting of losing a hard-won full haul dwarfs the joy of the safe
sale that preceded it. The predictable behavioral outcome is one of two
failure modes: (a) players get burned once and start hauling timid,
boring, half-empty loads to avoid the pain — collapsing the game's own
greed fantasy — or (b) they keep gambling, keep losing, and quit.

The doc has no counterweight: no partial-credit for a mostly-good landing
beyond per-slot cargo damage, no "close call" positive feedback, no
momentum/streak reward, nothing that makes a *successful* greedy run feel
proportionally triumphant. A loop this punishment-weighted needs designed
positive reinforcement, and none is specified.

**Traces to:** §1 (Feeling pillar), §2.3, §2.4, §2.6, §3 (feedback loop);
omission of any positive-reinforcement / partial-success reward.

---

## Finding 4 — Long-term motivation rests on a repetitive grind toward a single goal
**Severity: MAJOR**

Winning requires retrieving Armstrong's satellite, which is "reachable and
landable only near full upgrades" (§1), and upgrades are "3 parts × 3
tiers = 9 purchases" (§2.5). Since launch cost is only "≈ the value of 2–3
cheap pieces" and a lazy run "still breaks even" (§2.5), the profit per run
is deliberately thin — which means the player must repeat the same core
loop *many* times to bank nine upgrade tiers.

The content backing that grind is thin: there is exactly "one suborbital
band with a value gradient" (§2.6). No enemies, no events, no biome/level
variety, no mission variety, no narrative beats between launches are
described. The moment-to-moment loop is identical every run — launch, EVA,
tether, reenter, sell — with only the numbers creeping up. The doc even
cut the systems that would have added texture (size classes, fragile flag,
compactor, oversized junk — §4.3). The risk is monotony: the mechanics are
engaging the first few times, but the reward cadence (grind nine tiers,
one band, one goal) may not sustain motivation to the finish. The
psychological question "why do I launch a *20th* time?" is unanswered.

**Traces to:** §1 (win = single satellite, near-full upgrades), §2.5 (9
purchases, thin margins), §2.6 (single band), §4.3 (variety systems cut);
omission of any run-to-run variety or intermediate goal structure.

---

## Finding 5 — The single most important feedback cue is a subtle color shift under time pressure
**Severity: MINOR**

The go/no-go signal for the whole descent — when it is safe to deploy the
chute without shredding it — is communicated as the hull glow fading "from
white toward orange" (§2.2). This is asking a player, in a high-anxiety
moment, to distinguish a gradual color transition in 2D pixel art and act
on it within a narrow window ("opens the chute window later and lower" for
heavy hauls). Color-only cues are a known accessibility and legibility
problem (color-blind players especially), and a *gradient* cue is even
harder to read than a discrete state change. The doc specifies no
threshold indicator, audio cue, gauge, or explicit "SAFE TO DEPLOY"
prompt. Given that mis-timing this destroys the run, the cue deserves a
clearer, multi-channel signal.

**Traces to:** §2.2 (hull glow white→orange as the deploy cue); omission of
any non-color / audio / gauge feedback.

---

*Player Psychologist, Round 1.*

---

## Round 2 — Cross-examination

I read all five colleague reviews. The systems, QA, and business lenses
turn out to reinforce my behavioral concerns hard — but there is one real
severity conflict I want to argue, and two connections that change how bad
my own findings actually are.

### CONFLICT 1 — Business Analyst F4 vs. my Finding 3 (where the pain lives, and how bad it is)

Business Analyst rates the "feeling is undercut, and only activates late"
problem **MINOR**, arguing the safety nets ("lazy run breaks even,"
"land-anywhere sell") mean early/cautious play "carries no stakes," so the
promised anxiety simply switches on late. I rate the reward structure
**MAJOR**, arguing the loss aversion is too *punishing* at the moment it
does fire.

These read as opposite diagnoses — BA says "not enough tension early," I
say "too much punishment when it lands" — but they are the same curve seen
from two ends, and putting them together makes *both* worse, not milder.
The player's emotional journey is: hours of stakes-free, break-even
busywork (BA's point) followed by a sudden cliff where the first genuinely
greedy run can wipe the whole haul (my point). That is the worst possible
shape for retention: boredom on the front, trauma on the back, and no
graduated middle where risk and reward scale together. I hold my MAJOR and
argue BA's own finding is under-rated: a hook that is both absent early
*and* over-punishing late is a structural motivation failure, not a
positioning nit. The safety nets BA identifies are precisely why the eventual
loss stings so much — the player was lulled.

### CONFLICT 2 — implicit tension with Systems F1 / QA F1 (is there even a reward to chase?)

Systems Designer F1 and Adversarial QA F1 both argue, from the physics,
that the satellite may be **mechanically unwinnable** — the chute is fixed,
no upgrade buys down descent speed, and doubled mass pushes touchdown past
the fail line. This does not conflict with my findings so much as it
raises the stakes of my Finding 4. My Round 1 worry was *monotony* — "why
launch a 20th time?" If Systems and QA are right, the answer is darker: the
player grinds all nine tiers toward a goal that, on arrival, cannot be
landed. That converts a slow-burn motivation risk into an outright betrayal
of the reward contract — the ultimate quit trigger is a final objective
that punishes the exact behavior the whole game trained. I defer to them on
the physics, but from the player's chair the psychological damage of an
unwinnable-feeling climax is severe, and it strengthens my Finding 4.

### CONNECTION 1 — Feasibility F1 (no pilot policy) × my Finding 1 (no onboarding)

Feasibility Lead F1 notes the Playtester "needs an agent that can *fly the
game*" and that this control policy — thrust, EVA, tow, stage in the plasma
window, open the chute in time — "is the hard part, and it is completely
omitted." Read that as a player-psychology signal: if scripting an
*automated* pilot for this reentry sequence is the single hardest technical
task in the project, then expecting an unassisted *human* to execute the
same sequence on their first descent, with permanent-loss stakes and no
tutorial, is exactly the wall I flagged. The difficulty of the autopilot is
independent evidence for the difficulty of the onboarding. My Finding 1
BLOCKING stands and gains a second witness from an unrelated lens.

### CONNECTION 2 — QA F2 (economic soft-lock) + QA F4 (unrepaired chute) × my Finding 3

My Finding 3 was about the *emotional* weight of losing a full haul. QA
adds two *mechanical* death spirals I did not price in: F2 (a hard landing
can sell for less than the next launch cost, trending the player toward an
undefined bankruptcy state) and F4 (a shredded chute is not covered by
launch repairs, so the player may relaunch guaranteed to hard-land). Combine
these with the loss-aversion loop: the player who gets burned once on a
greedy descent is not just sad — they may be pushed into a spiral where each
run is poorer and more dangerous than the last, with no recovery ramp and no
loss screen to reset the feeling. That turns my "they quit" prediction from a
motivational soft-failure into a mechanically enforced one. Positive-
reinforcement and partial-credit systems (my Finding 3 ask) would also serve
as the recovery ramp QA's findings show is missing.

### CONNECTION 3 — Narrative F5 (tone) × my Finding 1 (onboarding)

Narrative Critic F5 flags an unreconciled tone: white-knuckle anxiety vs.
scrapyard comedy. This matters to onboarding specifically. A comedic frame
sets a player's expectation that failure is cheap and funny (Looney-Tunes
plummet); the actual systems deliver permanent, run-wiping punishment. That
expectation mismatch makes the un-onboarded first death land as a *betrayal
of tone*, not just a difficulty spike — sharpening the quit risk in my
Finding 1. The tonal ambiguity and the missing tutorial compound.

### REVISIONS to my Round 1

- **Finding 4 — hold MAJOR, but reframe.** In light of Systems F1 / QA F1, my
  "monotony" framing understates it. If the endgame is unlandable, the risk is
  not just "the grind gets boring" but "the grind pays out in a broken promise."
  I keep the severity (the underlying variety/pacing gap is real regardless of
  the physics verdict) but flag that it is entangled with the winnability
  dispute the board must resolve first.
- **Finding 5 — hold MINOR.** QA F4 (chute shred) leans on the same "subtle
  white→orange cue" I flagged, giving my legibility point a second source. I
  considered upgrading to MAJOR, but the cue itself is a symptom; the
  onboarding gap (F1) and the loss-aversion loop (F3) are the load-bearing
  problems, so F5 stays MINOR as the concrete fix that supports both.
- **Findings 1–3 — no change in severity;** all three picked up corroboration
  from at least one other lens, and none were contradicted.

*Player Psychologist, Round 2.*

# Narrative Critic — Round 1

Reviewing *Junkstronaut* for story logic, character motivation, tone,
theme, and whether the narrative pays off what it promises.

The good news first, so the criticism has a baseline: the document has a
genuine thematic spine. The "greed decision" — "every trip out costs
jetpack fuel and every stowed piece is permanent mass for the ride down"
(2.4) — is a real theme (avarice literally weighing you down) that the
mechanics express honestly. The problem is everything *around* that spine.

---

## Finding 1 — The protagonist has no identity, no stake, and no reason to want the ending. (MAJOR)

The Executive Summary gives *Armstrong* a clear motivation: he "wants it
back — starting with his own lost satellite, hanging at the very top of the
sky" (1). But the player character is only ever "you fly a rocket built
from scrap." Who is the junkstronaut? Why do they climb toward Armstrong's
satellite instead of just farming cheap panels forever? The document never
says. The win condition — "retrieve Mr. Armstrong's satellite" (Win, line
6) — is framed entirely as *Armstrong's* goal, not the player's, and no
reward, resolution, or personal stake is attached to achieving it.
Mechanically the satellite is just the top of the upgrade tree; narratively
it is supposed to be the climax, but the document sets up someone *else's*
desire as the finale and never gives the player a reason to care. The
emotional payoff the structure promises (a triumphant return) has no
character to land on.

## Finding 2 — Armstrong is written as a character but implemented as a vending machine. (MAJOR)

The narrative leans hard on Armstrong: he is named, he owns the junkyard,
he has a want, and his satellite is the entire endgame. Yet every actual
point of contact with him is transactional and silent: "sell it to
Armstrong for upgrades" (1), "haul auto-sells on landing" (2.1), "Armstrong
fills the tank, and repairs the hull/heat shield at a flat fee per %"
(2.5). There is no dialogue, no cutscene, no narrative UI, no delivery
mechanism of any kind described anywhere in the document. The one character
the story depends on never speaks and is only ever a price list. The
document promises a personal quest ("his own lost satellite") and delivers
an auto-sell function. Nothing in the design lets the player *feel*
Armstrong's want, so the framing in Section 1 is decoration that never
reaches the screen.

## Finding 3 — The climax may be quietly hollow: returning a damaged satellite. (MAJOR)

Section 2.6 states the satellite "arrives damaged unless the touchdown is
soft." The Win condition (line 6) is simply "retrieve Mr. Armstrong's
satellite" and says nothing about its condition. So the emotional peak of
the game — handing a man back his prized lost possession — can resolve with
you delivering it dented and scorched, and the document never addresses
whether that still counts as a win, whether Armstrong reacts, or whether a
damaged delivery undercuts the ending. This is a story-logic gap at the
single most important narrative beat. Either damage should matter to the
resolution (a soft landing = the "real" ending) or the document should
admit the satellite's condition is cosmetic — but as written, the payoff
is undefined at exactly the moment it matters most.

## Finding 4 — "Starting with" promises a campaign the game doesn't deliver. (MINOR)

The hook says Armstrong "wants it back — starting with his own lost
satellite" (1). "Starting with" explicitly frames the satellite as the
*first* objective in a larger reclamation. But the satellite is also the
Win condition and "the heaviest object in the game" (6) — i.e., the end,
not the start. The single line of setup contradicts the actual arc: the
game both opens and closes on the same object. Cut "starting with," or
acknowledge somewhere that this satellite *is* the whole story, because the
current phrasing writes a check for a saga the scope explicitly can't cash.

## Finding 5 — Unreconciled tone: is this anxious or is it a scrapyard comedy? (MINOR)

The #Feeling pillar names the intended emotion precisely: "Anxiety from
atmospheric reentry and the fear of wasting cargo value" (7). But the
surrounding voice pulls the other way — the title *Junkstronaut*, the
"blue-collar handmade spacecraft," the magnet that "clangs on" the junk
(2.4). That register reads wry and comedic. Tension and junkyard slapstick
can coexist, but the document never states which tone governs, and they
imply very different presentations of the same reentry moment (white-
knuckle survival vs. Looney-Tunes plummet). Because there is no stated
tonal intent to arbitrate, downstream art and audio choices have nothing
to align to, and the "anxiety" pillar is at risk of being undercut by a
fundamentally jokey frame.

## Round 2 — Cross-examination

I read all five colleague reviews. The systems and QA reviewers, working a
completely different lens, independently walked into the same wall my
Finding 3 leans against — and that changes how urgent my narrative gap is.

### Systems Designer

**CONNECTION (strong).** Systems Finding 1 ("The win object has no upgrade
path that reaches it," BLOCKING) argues the satellite is likely
*mechanically unlandable soft* — the chute is fixed-tier, doubled mass
pushes descent speed past the hard-landing line, and no upgrade buys down
touchdown speed. My Finding 3 worried the climax *could* resolve with a
dented satellite because the Win condition ignores condition. Combine the
lenses and it is worse than either of us said alone: if a soft landing is
not achievable, then the *only* ending the game can produce is the hollow
one. The "triumphant return" my Finding 1 says the structure promises isn't
merely undefined — it may be unreachable, leaving "hand the man back his
scorched, dented satellite" as the game's mandatory finale. Neither of us
can see that from inside our own lane; it only appears when narrative
payoff is laid over the descent math.

**CONNECTION.** Systems Finding 2 (the upgrade tree never touches reentry;
"a difficulty ramp with no brake") reinforces my Finding 1's motivation
problem from the economy side: if progression only makes the ride home
scarier and never safer, the player has even less narrative reason to keep
climbing toward *Armstrong's* goal rather than farming safe low hauls. The
missing personal stake and the missing mechanical reward point the same
direction.

### Adversarial QA

**CONNECTION.** QA Finding 1 reaches my Finding 3's cliff from the pure
winnability angle ("upgrades improve reach, not landability"). Same
convergence as with Systems: two reviewers who don't care about story have
independently established that the narrative climax may be forced into its
worst form. That is corroboration I should fold into my severity thinking.

**TENSION (mild).** QA's cross-cutting note observes low-arc runs can skip
reentry/heat/staging entirely and land powered. If true, that hands me a
second tonal fork for Finding 5: a game where the "anxiety" pillar can be
farm-bypassed for most of the economy is even harder to read as white-
knuckle survival — it strengthens my worry that the jokey frame, not the
anxious one, is what a real playthrough delivers.

### Player Psychologist

**CONFLICT / TENSION.** Psych Finding 3 builds its whole loss-aversion
analysis on the assumption that "anxiety" is the settled, governing feel of
the game. My Finding 5 argues that tone is *not* settled — the surrounding
voice (Junkstronaut, blue-collar scrap, magnet "clangs on") pulls comedic,
and the document never arbitrates. My side: Psych is tuning a critique
against a tonal commitment the document hasn't actually made. If the shipped
presentation leans wry/slapstick, the "sting of a lost full haul" Psych
relies on may land as a comic pratfall instead of a gut-punch — which would
*change* the behavioral prediction, not just soften it. The tonal
undefinedness is upstream of the psychology; it should be resolved before
anyone can assert how loss will feel.

**CONNECTION (strong).** Psych Finding 3 says the loop has "no designed
positive reinforcement… nothing that makes a successful greedy run feel
proportionally triumphant." My Finding 2 names exactly where that
reinforcement should have lived and doesn't: Armstrong. A named character
who wants his satellite back is the natural, cheap source of triumphant
payoff — gratitude, reaction, a story beat on delivery — and the document
gives him no voice or delivery mechanism at all. Psych's missing
reward-feedback and my mute vending-machine Armstrong are the same hole seen
from two lenses. Likewise Psych Finding 4 ("why do I launch a 20th time?")
is my Finding 1's missing-stake problem measured in retention: with no
narrative beats between launches and no personal reason to want the ending,
the grind has nothing but rising numbers to carry it.

### Business Analyst

**CONNECTION.** Business Finding 4 (the marketed anxiety hook only switches
on late, blunted by break-even and land-anywhere selling) dovetails with my
Finding 5. Business frames it as positioning; I frame it as tone. Together:
the promised feeling is both *late* (Business) and *tonally contested*
(mine), so the pillar is exposed on two axes at once.

**MILD TENSION on severity.** Business rates its "feeling undercut" MINOR;
I rated my tone finding MINOR too. But stacking my Finding 4 ("starting
with" promises a larger saga) onto Business Finding 3 (single win object,
no post-game, one homogeneous band) suggests the "starting with" line isn't
an isolated wording slip — it's symptomatic of a document that gestures at a
world-reclamation story while the entire content scope refuses one. I still
hold Finding 4 at MINOR as a fix (cut two words), but I now read it as a
*symptom* of a MAJOR-scale content/story mismatch that Business names from
the production side.

### Revisions to my Round 1

- **Finding 3 — hold at MAJOR, but flag as STRENGTHENED.** Two independent
  reviewers (Systems F1, QA F1) argue the soft landing may be unreachable,
  which converts my "the payoff is undefined" into "the mechanics may force
  the hollow payoff." I keep it MAJOR rather than upgrading to BLOCKING only
  because the *narrative* fix (define whether damaged delivery counts, and
  give Armstrong a reaction) is cheap and independent of resolving the
  physics; the winnability BLOCKING is properly Systems/QA's to own.
- **Finding 5 — hold at MINOR, reinforced.** QA's low-arc bypass note and
  Business F4's late-activation point both support that the anxious frame is
  weaker in practice than the pillar claims. No change in severity, but I no
  longer treat it as merely a downstream art-alignment worry — it feeds a
  real gap in what the game actually feels like.
- **No withdrawals.** Nothing in the five reviews contradicts a Round 1
  finding; the cross-lens traffic runs entirely toward corroboration.

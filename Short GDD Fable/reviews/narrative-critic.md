# Narrative Critic — Round 1

Reviewer: narrative-critic
Document: gdd.txt (Junkstronaut, First Draft)
Lens: story logic, character motivation, tone, theme, dialogue intent. Systems balance, technical scope, and business viability left to other reviewers.

---

## Finding 1 — The climactic payoff is undefined: what happens when the satellite comes home damaged, or at all?

**Problem.** The entire game funnels toward one narrative moment — returning Mr. Armstrong's satellite — and the document never describes that moment or even its success criteria. Section 2.6 says the satellite "arrives damaged unless the touchdown is soft," but nowhere does the document state whether a damaged satellite still wins the game, wins it with a lesser ending, or fails the run. The Executive Summary's win line ("Win: retrieve Mr. Armstrong's satellite") does not resolve this. There is no ending beat of any kind: no description of Armstrong receiving the satellite, no closing scene, no epilogue, not even a victory screen intent. The document spends a full section (2.2) choreographing the tension of reentry and zero sentences on what all that tension pays off into.

**Passage.** Section 2.6: "arrives damaged unless the touchdown is soft" — a consequence with no stated meaning. Section 1: "Win: retrieve Mr. Armstrong's satellite" — retrieval is defined mechanically ("reachable and landable") but the delivery/resolution is absent everywhere.

**Severity: MAJOR.** The mechanics build a promise the document never cashes. The climax of the game is currently a rules ambiguity.

---

## Finding 2 — "Starting with his own lost satellite" promises a structure the design doesn't have

**Problem.** The Executive Summary frames Armstrong's goal as reclaiming all the orbital junk, "starting with his own lost satellite" — language that positions the satellite as the first objective in a larger campaign. But the win condition ends the game at exactly that satellite. The framing device and the actual structure contradict each other: either the fiction promises a continuation the game will never deliver, or the satellite is the whole story and the "starting with" framing is wrong. This isn't pedantry — the phrase shapes player expectation of scope in the very first paragraph they'd encounter, and the design pays it off as a finale, not a beginning.

**Passage.** Section 1: "wants it back — starting with his own lost satellite, hanging at the very top of the sky" versus, two lines later, "Win: retrieve Mr. Armstrong's satellite."

**Severity: MINOR.** One sentence of rewriting fixes it, but as drafted the document's own opening paragraph misstates its story shape.

---

## Finding 3 — The premise contradicts the goal object

**Problem.** The fiction's inciting incident is that "a Kessler cascade has shattered every satellite in orbit into valuable junk." The win object is an intact satellite — heavy, whole, "parked" — that survived the event that, by the document's own words, destroyed every satellite. No explanation is offered for why Armstrong's satellite alone endured, why it is "the heaviest object in the game," or why it sits conveniently "at the very top of the flight envelope" rather than among the debris. For a one-page fiction this is fixable with a single clause (armored, dormant, above the cascade's shell, etc.), but as written the story's setup and its objective are mutually exclusive, and the goal object's defining traits (heaviest, highest, intact) read as pure difficulty-curve reverse-engineering with no fictional cover.

**Passage.** Section 1: "shattered every satellite in orbit into valuable junk" versus Section 1/2.6: "his own lost satellite, hanging at the very top of the sky" / "At the very top hangs Armstrong's satellite."

**Severity: MINOR.** Small to fix, but currently the premise disproves the quest.

---

## Finding 4 — Armstrong is the game's only character and has no motivation, no voice, and no defined relationship to the player

**Problem.** Mr. Armstrong appears in the first sentence of the pitch and then functions purely as an economy valve: he "fills the tank, and repairs the hull/heat shield at a flat fee" (2.5), buys the haul, and sells upgrades. The document never says why he wants the satellite, who the player is to him (employee? contractor? indentured scrapper?), or what he sounds like. This matters because the design has accidentally built a potent theme it never acknowledges: the player's sole buyer is also their sole supplier — a classic company-store arrangement that is the "blue-collar" thematic pillar (#Thematic — "Scrapyard Spaceflight, blue-collar handmade spacecraft") sitting right there, unclaimed. There is no dialogue intent, no tone guidance for the shop screen, no character section at all. Relatedly, the loss state "stranded with no fuel" (Section 1) has an unexamined narrative implication — Armstrong lets his scrapper die in orbit — that the document neither leans into (dark comedy, exploitation) nor softens (rescue at a price). The tone of the game's only relationship is completely unspecified.

**Passage.** Section 1 (Armstrong introduced, never characterized); Section 2.5 (Armstrong as pure transaction); Section 1 pillars (#Thematic promise); omission: no character, dialogue, or tone section anywhere in the document.

**Severity: MAJOR.** For a scoped jam project the fix is cheap — a few lines of intent — but right now the thematic pillar is asserted in Section 1 and delivered by no section that follows.

---

## Finding 5 — The "handmade scrapyard" aesthetic pillar is undercut by the document's own asset plan

**Problem.** The thematic pillar promises "blue-collar handmade spacecraft" — a fiction of improvised, welded-together machines. The art strategy in 4.1 is "pixel packs + Deep-Fold planet generator; Aseprite for gap sprites only," and 4.3 explicitly cuts the "Art Director" agent. Off-the-shelf pixel packs are, almost by definition, generic sci-fi — the opposite of a junk-built visual identity — and the document provides no selection criteria, no reference imagery, no note on how stock assets will be bent toward the scrap fiction. I am not questioning the budget decision (that belongs to other reviewers); I am flagging that the document contains no mechanism by which its central aesthetic promise gets expressed, and no acknowledgment of the tension.

**Passage.** Section 1: "#Thematic — Scrapyard Spaceflight, blue-collar handmade spacecraft" versus Section 4.1: "Art: pixel packs + Deep-Fold planet generator; Aseprite for gap sprites only" and Section 4.3: "Researcher and Art Director agents" cut.

**Severity: MINOR.** A short art-direction paragraph (palette, weathering, mismatched-parts rule for choosing/editing pack assets) would close the gap.

---

## Summary

The mechanical fiction is genuinely coherent — greed, mass, heat, and fear reinforce each other, and the #Feeling pillar (reentry anxiety) is the one promise the document fully keeps. But the story frame is load-bearing and hollow: the climax has no defined outcome (Finding 1), the opening line promises a campaign shape the game doesn't have (Finding 2), the premise contradicts the goal object (Finding 3), and the only character in the game — who embodies the blue-collar theme — is an unvoiced vending machine (Finding 4). None of these are expensive to fix; all of them are currently unwritten.

## Round 2 — Cross-examination

### Conflicts

**1. Adversarial QA, Finding 1 (satellite destruction, BLOCKING) — same sentence, wrong-sized fix.** QA and I converged independently on "arrives damaged unless the touchdown is soft," but our framings pull in different directions. QA's framing invites a purely mechanical patch: define destruction rules, add a respawn, close the unwinnable-save hole. My concern is that the document could accept exactly that patch and still fail — a satellite that respawns and a win flag that flips at touchdown repairs the bug while leaving the climax an empty boolean. The narrative question ("what does bringing it home *mean*, and what does damaged versus pristine mean?") is not answered by persistence rules. If the board adopts QA's fix as the fix, my Finding 1 should be understood as *not addressed* by it. The correct resolution defines both: the rules (QA's hole) and the ending they resolve into (mine).

**2. Business Analyst's praise of the cut list vs. my Finding 5.** The Business Analyst calls the cut list (4.3) "the strongest section in the document" and states "nothing in the shipped feature list reads as decorative." I contest the second half by the analyst's own standard: the #Thematic pillar — "blue-collar handmade spacecraft" — currently has no delivery mechanism anywhere in the document (stock pixel packs, Art Director cut, no selection criteria), which makes it a decorative feature written in prose instead of in the feature list. I am not arguing to reverse the cut; I am arguing that a pillar with no owner is exactly the kind of unpriced, unaccountable item the analyst's own Finding 5 warns about. The cut list is disciplined about *features*; it is silent about *promises*.

**3. Player Psychologist, Finding 4 (endgame frustration cliff) — the cruelty may be the point, but only if the ending exists.** The Psychologist argues the satellite run stacks the game's cruelest constraints and risks frustration where the player should feel mastery, implying the finale should be softened toward repeatability. From the narrative lens I'd argue the opposite instinct: the finale being the game's most terrifying reentry is the correct dramatic apex of the #Feeling pillar — the one promise the document keeps — and sanding it down would flatten the climax. But the Psychologist's complaint is only fully true because my Finding 1 is true: repeating a brutal run is intolerable when nothing narratively distinct waits at the end of it. A graded ending (pristine vs. damaged satellite producing different closing beats with Armstrong) converts their "ambiguous 'damaged' outcome" into intentional narrative texture, preserves the difficulty, and resolves both findings at once. Fix the payoff before touching the difficulty.

### Connections

**1. The company store is already built — Systems Finding 3 + Business Finding 2 × my Finding 4.** Systems and Business both establish that "land safer" doesn't exist, all 9 purchases are effectively mandatory, and the shop is "a linear progression track wearing" a decision space. Combine that with my Finding 4: Armstrong is sole buyer, sole supplier, sole repairman, charging per-% fees on damage his own missions cause. Mechanically, the game *is* a company-store economy. What my colleagues flag as a design flaw to hide is, through the narrative lens, the blue-collar theme fully assembled and unclaimed — one paragraph of tone intent would let the linear ladder read as indenture rather than as a broken decision space. The theme could absorb the flaw; nobody has claimed it.

**2. "Sells anywhere you come down" quietly breaks the one-character world — Business Finding 5 × my Finding 4.** The analyst flags off-pad selling as an unscoped world feature. The narrative version of that hole: *who is buying?* Armstrong is the game's only stated entity, and the fiction (2.5) routes all commerce through him. Either the world is implicitly populated with other buyers — contradicting the lone-scrapper frame — or Armstrong is somehow omnipresent, which is unwritten. The analyst's "one-line answer" needs to be a fictional line as much as a systems line.

**3. The missing character voice is also the missing tutorial channel — Psychologist Finding 1 × my Finding 4.** The Psychologist's BLOCKING finding is that the reentry sequence has no onboarding and first hauls die to untaught rules. The document's cheapest possible onboarding vehicle — Armstrong's dialogue ("stage before the plasma, kid, and don't pop the chute while she's glowing white") — cannot exist because Armstrong has no voice, no tone, and no dialogue intent anywhere in the document. These are the same omission seen through two lenses: writing the character partially solves the onboarding hole diegetically, at near-zero scope cost, and it is the only tutorial channel the cut list hasn't already forbidden.

### Revisions

- **Finding 1: upgraded MAJOR → BLOCKING.** Three lenses (Adversarial QA F1, Player Psychologist F4, mine) independently landed on the same unresolved sentence in 2.6. It is simultaneously a possible unwinnable state, a frustration cliff, and an unwritten climax. When the game's single win condition is ambiguous from three separate review directions, it blocks: no one can build, test, or tune the endgame until "damaged" has a defined meaning.
- **Finding 4: held at MAJOR, strengthened.** Round 2 revealed it is load-bearing for two colleagues' findings (onboarding channel, off-pad buyer, company-store economy). It is the highest-leverage cheap fix on my list.
- **Finding 5: held at MINOR, scope clarified.** Against the Business Analyst's praise of the cut list: I do not contest the Art Director cut, only the absence of a one-paragraph art-direction rule that survives it.
- **Findings 2 and 3: held at MINOR, unchallenged.** No colleague engaged either; both remain one-sentence fixes to a self-contradicting opening page.

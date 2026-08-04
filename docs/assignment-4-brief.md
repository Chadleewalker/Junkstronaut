# Assignment #4 — Dynamic Content Pipeline

Working brief. The authoritative text is `Assignment #4_ Dynamic Content Pipeline.txt` at the
repository root; this file records what the assignment asks for and where the work stands against
it.

**Due:** before session 7 — 30 July 2026, 11:59 ET.

---

## What the assignment asks for

> Build a pipeline that generates content for your game using your GDD as the source material.
> Your agent reads your game docs before generating — so the output sounds like your game, not
> generic content.

Deliverables, verbatim:

1. **The pipeline** — however it was built: script, notebook, or LLM-assisted workflow.
2. **Three generated outputs that your game actually needs.**
3. **A short ReadMe** answering three questions by name: what content did you generate, does it
   sound like your game, and what did the critic agent catch?

Two constraints carry real weight:

- *"Submissions using placeholder lore receive no credit on Content Quality or Game Connection."*
  The knowledge base must be the actual GDD.
- *"Code that does not run receives 0 across all criteria."* Verify from a clean copy the way a
  grader will.

### Rubric — 10 points

| criterion | points | what earns it |
|---|---|---|
| Game-Anchored Source | 2.0 | Knowledge base is the student's GDD or a direct extension. Placeholder lore scores 0 here **and** on Content Fit. |
| Content Fit | 2.5 | The three content types are ones this game specifically needs. The submission **names the gap** and the output fills it. |
| RAG Implementation | 2.0 | Retrieval is accurate and the output reflects it, shown as **query, retrieved chunk and output side by side**. |
| Consistency Checking | 2.0 | The critic catches and corrects at least one lore break or tone drift. The correction is **shown, not claimed**. |
| Voice Judgment | 1.5 | Self-assessment, plus at least one **concrete prompt or retrieval tweak** made to improve game-fit. |

---

## Where the work lives

Two copies, and the difference matters.

| | |
|---|---|
| `Junkstronaut_Final/content/` | **The working copy.** Beside the game, the art and the sprite map. This is where the art stage can actually run. |
| [`Junkstronaut-Content-Pipeline`](https://github.com/Chadleewalker/Junkstronaut-Content-Pipeline) | **The public repo — what the teacher is given.** Same pipeline, plus the GDD and the config it reads. No art, and neither of the other two agent crews. |

There is a third copy in this repository (`Junkstronaut/content/`), which is where the pipeline was
originally built. It is the odd one out now; the working copy is the one in the game.

Both runnable copies must stay identical. Any change lands in `Junkstronaut_Final/content/` first,
then syncs.

## Running it

```bash
node run-content.js --stub     replay a recorded run, ~1s, no API key, no art needed
node run-content.js            live: 10-20 min, needs Claude Code signed in
node --test "test/*.test.js"   47 tests, no credentials
```

---

## The content, and the gap each one fills

The GDD names its own content gaps in one sentence, §4.2:

> "UI/content is a budget line, not a remainder: HUD, shop labels, post-mortem screen, the two
> lamps, the mass scale, the ablating-shield readout, and landing grades are three Coder sessions
> (~40k each), and the narrative layer — **the dozen barks and the three ending screens** — is a
> fourth."

**1 · Armstrong's radio barks.** §1 promises "a dozen state-triggered one-liners ... carrying both
the tutorial hints and, later, the characterization the graded endings pay off." The document
contains three — one of them buried parenthetically in §2.5 where it does not look like a bark.
18 generated, each tied to a state with a real detector; the three canon lines ship flagged
`source: "gdd"`.

**2 · Debris flavour.** 30 junk types with mass, altitude, size class and a fragile flag, and a
loot table that reads like a spreadsheet. **Grounded in the sprite as well as the numbers** — see
the art stage below, which is the whole reason this type is worth generating rather than
duplicating fields the tuning crew already writes.

**3 · Post-mortem screens.** §2.7 defines five terminal states with a detector each, plus four
stranded sub-cases. §1 wants the first run to teach reentry through "one cheap, legible failure —
a post-mortem screen names the cause of death and the rule broken." Nine screens, each naming the
rule without blaming the player.

> **A type that was considered and dropped: shop labels for the twelve upgrade purchases.** §2.5
> literally instructs someone to write one — *"Say it in the shop label: this is the buy that turns
> a hop into a stay"* — and the tiers exist with real numbers in `game_params.json`. It is the
> strongest remaining gap in the document and the obvious next content type if a fourth is ever
> wanted. It lost to the art stage because the art was the live problem.

---

## The art stage

**The problem it was built for.** The pipeline originally wrote each piece's flavour from its
`id` — `torn_foil_blanket` — and never saw the sprite. The id is a name somebody typed, and the
mapping from names to sprites was made by eye and never checked. `debris_sprites.json` says so
itself: *"Assignments were made by eye from the pack's own contact sheets."* So where a name was
wrong, the pipeline wrote confident, fluent prose about an object the player will never see, and
the lore critic could not catch it: an art mismatch is not a contradiction with any passage, and
there was no image in any prompt.

**The shape of the fix is two agents that are deliberately kept apart.**

1. **The reader** is shown contact sheets — the pipeline renders its own, 7× on a neutral ground,
   numbered cells — and is **not told any names**. It says what is drawn.
2. **The matcher** is shown the names and the reader's words, and **never an image**. It returns
   `match` / `loose` / `mismatch` with the reading quoted as evidence.

A single agent given both would read the picture through the name and confirm it. The split costs
one extra call and buys a verdict whose evidence is quotable. It is the same discipline the lore
critic runs on — it never sees the writer's reasoning — applied to a second kind of source.

Two tests enforce the seam: one asserts the reader's prompt contains no piece name, the other that
the matcher's prompt contains no image path. Without them the property is one prompt edit from
disappearing silently.

**The findings are text and they ship. The pixels do not.** `out/art/art_reading.json` and
`out/art/art_match.json` are published; `out/report/art.html` embeds the sprites and is excluded
everywhere, because a base64 sprite is the same bytes as the PNG.

## Standing cautions

- **The sprite pack cannot be redistributed.** RehanDev's grant is *"free to use ... in personal or
  commercial projects without restrictions"* **and** *"You may not resell or redistribute the
  asset."* The permissive first half is what makes the second half easy to miss. The pipeline runs
  without art on purpose; `--stub` needs none.
- **Do not edit the GDD.** It is the document of record and the knowledge base.
- **Do not write into `crew/`.** A live tuning-crew run owns that directory.
- **Never hardcode a count.** "25 pieces" was typed into four files and went stale the day the
  catalog grew to 30 — including inside a writer's own charter, where it argued with its input.
- **One continuous orbital band**, value rising by altitude — not three bands. Twelve upgrade
  purchases across six parts. Any prose describing three bands is stale; the GDD wins.
- **Keep the tweak notes as you go.** Voice Judgment wants a concrete before/after, and it is easy
  to reconstruct badly at the end.

## Getting the voice right

Read GDD §1 and §2.6 first. Blue-collar spaceflight: scrap, salvage, debt, a junkyard owner who
fronts your launches and wants one specific Apollo-era module back for reasons that are personal.
Nothing is sleek. Instruments are *salvaged* — the CHUTE lamp, the RETURN lamp, a painted mass
dial. Failure is cheap and repeatable, and the tone treats it as a lesson rather than a punishment.

Avoid heroic sci-fi, corporate polish, "commander", anything that sounds like a mission patch.

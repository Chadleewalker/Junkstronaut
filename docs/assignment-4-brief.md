# Build the Assignment #4 content pipeline

Paste this to the agent that will build it. It assumes nothing about the conversation.

---

## What you are building

A **dynamic content pipeline** for **Junkstronaut**, a 2D pixel-art game about salvaging
space junk. It reads the game's design document, retrieves the relevant passages, generates
written content grounded in them, and runs a critic agent that catches lore breaks and tone
drift before anything ships.

This is course Assignment #4, due **30 July 2026, 11:59 ET**. The rubric is at the bottom —
read it before you design anything, because two criteria are about *demonstrating* the
pipeline, not just building it.

Build it in a new directory `content/` at the repository root, beside `crew/` and `board/`.

## The repository you are working in

`C:\Code\Projects\Junkstronaut` — public at https://github.com/Chadleewalker/Junkstronaut

| path | what it is |
|---|---|
| `Junkstronaut GDD Short.txt` | **The design document. This is your knowledge base.** ~44,500 characters, sections 1 through 5. Document of record — do not edit it. |
| `crew/` | Assignment #3: five agents plus a flight simulator that write the game's config. |
| `board/` | Assignment #2: nine agents that review the design document. |
| `docs/` | Design decisions and the measurements behind them. |

Both existing crews are **raw Node orchestration — no framework, no dependencies, no
`npm install`.** Match that. It is what makes them runnable by a grader in one command, and
it is a deliberate choice, not an accident.

## Reuse these — do not rewrite them

Read each before using it. They are small and commented.

| file | what it gives you |
|---|---|
| `crew/lib/agent.js` | Runs an agent: prompt on stdin, JSON on stdout, strips CLI chatter, retries on malformed output. |
| `crew/lib/schema.js` | The schema gate. Validates an agent's output and feeds the exact validation errors back on retry. |
| `crew/lib/envelope.js` | Parses an agent's JSON envelope out of noisy stdout. |
| `board/lib/render.js` | Renders a deterministic HTML report from data. Look at how it separates data from presentation. |
| `board/agents/narrative-critic.md` | **Closest thing to your critic agent.** Already judges tone and fiction against the GDD. Read it before writing yours. |
| `crew/agents/spec-auditor.md` | The structural pattern for a critic: it is given the spec and the artifact, never the other agents' reasoning, so it cannot be talked into agreeing. Copy that discipline. |
| `crew/run-crew.js` | The orchestrator pattern: deterministic control flow, `--stub` replay, `--record`, per-agent logs. |

Follow `crew/`'s conventions: a `--stub` flag that replays a recorded run in about a second
with no API key, and `--record` to refresh the fixtures. A grader must be able to see real
output without signing in. This is worth real points and both existing crews do it.

## The three content types to generate

These are chosen because the GDD promises them and the game does not have them. Each one is
a gap the design document names itself — say so in the ReadMe, because the rubric rewards
naming the gap.

**1 · Armstrong's radio barks.** The GDD (§1) promises "a dozen state-triggered one-liners"
from Mr. Armstrong, the junkyard owner, carrying both tutorial hints and the characterisation
that the graded endings pay off. Only two exist in the document:

- "Chute stays packed while she's glowing, kid"
- "See her glinting up there? That's the one. Not yet, kid."

Generate the remaining ten or more, each tied to a specific game state — first launch, first
plasma, hold-mass into amber, module tethered, hard landing, burn-up, the three endings.
Armstrong's voice: blue-collar, terse, calls the player "kid", fond but never soft. He fronts
every launch against your next haul, so he is a creditor as much as a mentor.

**2 · Debris flavour text.** `crew/out/data/debris_catalog.json` holds 25 junk types with
mechanical fields — mass, altitude, size class, fragile — and a short `notes` line each.
Generate proper `display_name` and flavour for each, so the loot table reads like a scrapyard
rather than a spreadsheet. Constraint: a piece's fiction must match its mechanics. A 1,600 kg
piece at 276,000 m has to read as heavy and high; a fragile piece has to read as fragile.
**Read the catalog and use the real pieces** — inventing your own is placeholder lore and
scores zero.

**3 · Post-mortem screens.** GDD §2.7 defines five terminal states, each with a detector:
`Landed`, `Refused`, `0 HP`, `Burned up`, `Stranded`. §1 says the first run teaches reentry
through "one cheap, legible failure — a post-mortem screen names the cause of death and the
rule broken." Generate that screen text for each state, plus the stranded sub-cases (a)-(d).
Each must name the rule the player broke, in Armstrong's voice, without blaming them.

## What the pipeline must do

**Chunk and index the GDD.** Section-aware — §2.2 is one retrievable unit, not fragments
split mid-sentence. No external embedding service is required and none is available offline;
a local scoring function over terms is fine and easier to defend, but whatever you choose,
**log the query, the chunks retrieved, and their scores.** You cannot demonstrate retrieval
you did not record.

**Generate**, with the retrieved chunks in the prompt and nothing else about the game. That
is the point: the output should sound like Junkstronaut because it was grounded in
Junkstronaut, not because you pasted the whole document in.

**Criticise.** A critic agent reads each generated item **against the retrieved source** and
flags: contradicts the GDD; wrong voice; invents a mechanic that does not exist; states a
number that disagrees with the design. It returns a verdict plus a corrected version.

**Record the correction.** The rubric wants at least one lore break *caught and corrected*,
shown rather than claimed. Keep the before, the critic's reasoning, and the after. Do not
overwrite the rejected draft — it is the evidence.

**Report.** An HTML page and a ReadMe. For at least three items, show **query → retrieved
chunk → generated output** side by side. That layout is 2 points on its own.

## Deliverables

1. The pipeline, runnable — `--stub` replay and a live mode
2. Three generated outputs, each a file the game could load
3. A ReadMe answering three questions the rubric asks by name:
   - What content did you generate, and what gap does it fill?
   - Does it sound like the game? Your own honest assessment.
   - What did the critic catch? Show the correction.
4. At least one **concrete prompt or retrieval tweak** you made to improve game-fit, with
   before and after. The rubric asks for this explicitly and it is easy to forget until the
   end — so keep notes as you go rather than reconstructing them.

## Rubric — 10 points

| criterion | points | what earns it |
|---|---|---|
| Game-Anchored Source | 2.0 | Knowledge base is the actual GDD. Placeholder lore scores 0 here **and** on Content Fit. |
| Content Fit | 2.5 | The three types are ones this game specifically needs. Name the gap. |
| RAG Implementation | 2.0 | Retrieval is accurate, shown as query + retrieved chunk + output side by side. |
| Consistency Checking | 2.0 | Critic catches and corrects at least one lore break or tone drift. Correction shown. |
| Voice Judgment | 1.5 | Self-assessment plus one concrete prompt or retrieval tweak. |

**Code that does not run scores 0 on every criterion.** Verify from a clean copy of the
repository before you call it done — no `.git`, nothing prebuilt — the way a grader will.

## Getting the voice right

Read GDD §1 and §2.6 first. The game's register is blue-collar spaceflight: scrap, salvage,
debt, a junkyard owner who fronts your launches and wants one specific Apollo-era module back
for reasons that are personal. Nothing is sleek. Instruments are *salvaged* — the CHUTE lamp,
the RETURN lamp, a painted mass dial. Failure is cheap and repeatable, and the tone treats it
as a lesson rather than a punishment.

Avoid: heroic sci-fi, corporate polish, "commander", anything that sounds like a mission
patch. Armstrong runs a junkyard.

## Two things to check before you start

- **The design document changed on 28 July 2026.** One continuous orbital band with value
  rising by altitude (not three bands); twelve upgrade purchases across six parts; reentry
  has a commit floor and the endgame requires aerobraking. If you find prose describing three
  bands anywhere, it is stale — the GDD wins.
- **`crew/out/` may be mid-run.** A live crew run writes there. Read the catalog from it, but
  do not write anything into `crew/`.

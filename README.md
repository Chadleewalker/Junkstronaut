# Junkstronaut — agent crews

Mermaid Chart: https://github.com/Chadleewalker/Junkstronaut/blob/master/crew/DIAGRAM.md

## Quick start

**Assignment #3 submission: the [`crew/`](crew/) folder.** Nothing to install — no
dependencies, no `npm install`, no API key needed for the replay. Tested on Node 24.

**1 · Get it**

```bash
git clone https://github.com/Chadleewalker/Junkstronaut
cd Junkstronaut/crew
```

(Or use the green **Code → Download ZIP** button and unzip it.)

**2 · Run it** — either way works:

```bash
claude              # then type:  /run-crew stub
```

```bash
node run-crew.js --stub     # same thing without Claude Code
```

Takes about a second. It replays a recorded run of the five agents, so you see the real
output without spending tokens. Drop `stub` / `--stub` to run the agents live instead
(30–90 minutes, needs Claude Code signed in).

**3 · Look at what it made** — everything lands in `crew/out/`:

| open this | what it is |
|---|---|
| **`out/report/dashboard.html`** | **Start here.** The whole run as charts in a browser — what the agents decided, what the simulator measured, and a plain-English verdict at the top. |
| `out/config/game_params.tres` | The point of the whole thing: the config file Godot loads at runtime. Every tunable in the game — gravity, thrust, heat, prices — in one file. |
| `out/audit/audit_report.md` | Per-rule pass/fail against the design document, with the arithmetic. Read this before trusting the numbers. |
| `out/data/debris_catalog.json` | The loot table — 30 junk types with mass, size and fragility. |
| `out/playtest/playtest_report.json` | What the ship actually did when flown: claimed vs. measured, and proposed fixes. |
| `out/run.json` | Run summary — which agents ran, how many retries, the final verdict. |

The console prints a summary when it finishes. **A run ending in `AUDIT FAIL` is not a
crash** — it means the crew measured the design's own numbers and found a rule they don't
satisfy. That is the auditor doing its job; the failing rule and its evidence are in
`audit_report.md`.

**Also here:** the architecture diagram is [`crew/DIAGRAM.md`](crew/DIAGRAM.md) (rendered
below too), the tests are `node --test "test/*.test.js"` from `crew/` (95 tests, ~18 s), and
[`board/`](board/) is a **separate crew from Assignment #2** — not part of this submission.

---

**The game: Junkstronaut.** A 2D pixel-art game about salvaging space junk. A Kessler
cascade has destroyed every satellite in orbit. You work at Mr. Armstrong's junkyard: fly a
rocket built out of scrap up to the debris field, get out and drag junk home on magnetic
tethers, survive reentry, land it. Sell the haul, buy upgrades, go higher. This is my
capstone project.

Two crews in this repo. Both are raw Node orchestration — no framework, no dependencies —
and both run against this game's design document.

---

## `crew/` — the tuning crew · **Assignment #3 submission**

**Five agents and a flight simulator write the game's config file.**

Not a document about the config — `config/game_params.tres`, the resource Godot loads at
runtime. Junkstronaut's design says every tunable value lives in one file and nothing is
hardcoded: gravity, thrust, heat shield ablation, tow fees, magnet hold force, what each
piece of junk weighs and what it sells for. This crew writes that file, plus the debris
catalog it prices, an audit of whether the numbers obey the design document, and a playtest
report of what those numbers actually *do* when the ship is flown.

| agent | reads → writes |
|---|---|
| **researcher** | GDD → `params/baseline.json` — orbital speeds, atmosphere, heating thresholds, drag |
| **debris-designer** | baseline → `data/debris_catalog.json` — the loot table: mass, size class, fragility |
| **economy-balancer** | baseline + catalog → `config/game_params.json` — every tunable, solved against all design rules at once |
| **playtester** | simulator output → `playtest/playtest_report.json` — claimed vs measured, proposed fixes |
| **spec-auditor** | GDD + params + measurements → `audit/audit_report.md` — per-rule pass/fail with evidence |


### What the crew is actually enforcing

These are the design goals the audit checks, in the game's own terms. Each one is a rule the
numbers have to satisfy, not a preference — and each is measured by flying it, not by
restating the formula that claimed it.

| the goal | how it is checked |
|---|---|
| **The endgame must aerobrake.** Armstrong's module — the win condition, ~3,600 kg at the top of the band — cannot be brought home on one committed plunge. Getting it down requires at least one braking pass. | `heavy_descent_requires_multi_pass` — the module's single-pass peak heat must exceed the heat bar at *every* shield tier. A maxed shield that buys the plunge back would delete the mechanic. |
| **Ordinary hauls must still plunge.** An empty ship and a full hold can dive straight in from any altitude. The rule lands on the endgame alone. | Same check, part three — every ordinary load's peak stays under the base capacity. |
| **The player cannot buy a skim's benefit for free.** Committing to a shallower entry sheds the same speed a braking pass does, for one heat cycle instead of two — so without a floor on entry depth, skimming is pointless and no heat capacity can force it. | `commit_floor_m` must sit well below the atmosphere top, or it constrains nothing and the endgame rule is moot. Checked first, for that reason. |
| **Feathering must cost something.** A braking pass costs 0 m/s of Δv and about six minutes, so nothing in the physics stops a player skimming forever. Escalating thermal fatigue is the only brake. | `skim_pricing_saturates_and_toll_grows` — the per-cycle toll must compound, and the benefit must saturate. |
| **The first launch must survive itself.** The climb heats the ship too. A config whose opening flight burns up before reaching the junk must fail, not pass quietly. | `launch_survives_itself` — added after the ascent was found to peak at 1.4× the bar with nothing reading it. |
| **Height is where the money is.** One continuous band, value rising with altitude, so reward and reentry risk climb together without discrete tiers to keep in sync. | `single_band_and_sample_keys`, plus a strictly increasing value gradient. |
| **Nothing is satisfied by moving the target.** An agent may not make a rule pass by editing the constant the rule is about. | `nothing_satisfied_by_moving_the_target` — every GDD-stated constant is re-read and compared. |

The full rule set, with the arithmetic behind each verdict, is in `out/audit/audit_report.md`
after a run.

Full detail on every agent, every schema and both gates: [`crew/README.md`](crew/README.md).

---

## `content/` — the content pipeline · **Assignment #4 submission**

**Retrieval-grounded writing, with a critic on the gate.** The design document promises three
kinds of written content the game does not have — Armstrong's radio barks, flavour for the 30
junk types, and the post-mortem screen that names how a run ended. This pipeline chunks the
GDD by section, retrieves the passages that answer each individual game state, writes from
those passages *and nothing else about the game*, and then hands the result to a critic that
reads every line back against the same passages and never sees the writer's reasoning.

| stage | what it does |
|---|---|
| chunk + index | 48 sentence-bounded chunks over 15 sections, BM25, no embedding service |
| retrieve | one query per game state, every query and score logged |
| **bark-writer** | 18 state-triggered radio lines → `content/armstrong_barks.json` |
| **debris-flavourist** | display names and flavour for all 30 pieces → `content/debris_flavour.json` |
| **postmortem-writer** | 5 terminal states + 4 stranded sub-cases → `content/postmortem_screens.json` |
| **lore-critic** | reads each item against its sources; corrections applied, drafts kept |

```bash
cd content
node run-content.js --stub      # replay a recorded run, ~1 s, no credentials
node --test "test/*.test.js"
```

`out/report/content.html` shows **query → retrieved passage → generated output** side by side
for every item, plus every correction the critic made with the draft it replaced. See
[`content/README.md`](content/README.md).

---

## `board/` — the design review board

**Nine agents review the design document itself.** Six specialists read it blind, then
cross-examine each other, a moderator synthesises what they found, and a visualisation
auditor checks the resulting report against the data it was built from. It produces a ranked
list of what is wrong with the document, an explicit list of what the board could not agree
on, and a page where every claim traces to a numbered finding a named reviewer raised.

Built after the tuning crew and sharing its agent runner and schema validator — one
direction only, so `crew/` still runs standalone. See [`board/README.md`](board/README.md).

```bash
cd board
node run-board.js
node --test "test/*.test.js"
```

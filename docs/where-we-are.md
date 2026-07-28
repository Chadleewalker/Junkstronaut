# Where we are

A resume note. Last updated at the end of the session that reviewed both crews, fixed what
that review found, and discovered the skim-altitude bug.

## State of the tree

Work sits on branch **`crew-review-fixes`**, five commits ahead of `master`, **not merged**:

```
Make the short GDD the document of record, and write down what it still owes
Re-record the crew against the new contracts
Fix what reviewing the crew found, and stop trusting constants nobody measured
Rebuild the review board as a crew that can actually be re-run
```

Merge with `git checkout master && git merge crew-review-fixes`. There is no remote.

Both suites pass: **88 crew tests, 41 board tests** — about 1.9 s and 0.8 s.

```bash
cd crew  && node --test "test/*.test.js"
cd board && node --test "test/*.test.js"
```

Use that exact invocation. `node --test test/` does not resolve, and a bare `node --test`
picks up the fake-agent fixtures and hangs on stdin.

## What is done

- **The board is a real crew now** (`board/`), not an archive of outputs. Nine charters, four
  contracts, a runner, a deterministic tally and renderer. Round one is blind and the
  moderator cannot cite a finding nobody raised — both enforced and both tested.
- **The tuning crew's review findings are all fixed**: the escalating ablation toll, the
  ablation check split onto skim and pass axes, the parachute measured instead of checked
  against itself, the sweep cache gated three ways, stale prose, and a test suite covering
  the parts `--stub` never executes.
- **The skim altitude is scanned rather than hardcoded.** This was the big one — see
  `gdd-change-proposal.md` §10.
- **The dashboard opens with a computed summary** instead of nine cards of equal-looking
  prose. Every takeaway is derived from the data on its own card.

## What is next

1. **Decide the two open scope questions.** The short GDD says **one** suborbital band where
   the crew assumes three, and **9** upgrade purchases (3 parts × 3 tiers) where the crew
   assumes 12 (6 × 2). Neither was settled. A live run means little until they are.
2. **Update the GDD** per `gdd-pending-changes.md`. Skim/plunge, the 50% tow fee and the
   break-even rule are all staying, and §4.3 currently cuts two of them.
3. **Pick the entry-depth constraint.** The 2-pass high-band goal does not hold without one
   — one pass wins by 13% because entry depth substitutes for skimming. Options and the
   dead ends are in `gdd-pending-changes.md`.
4. **Regenerate the sweep caches.** `crew/stubs/sweep*.json` predates the skim scan, so a
   replay still reports the old physics. Clearing them and running
   `node run-crew.js --stub --record` recomputes all three rounds against the current
   simulator — about an hour of CPU, no model calls. Started once and abandoned when the GDD
   question surfaced.
5. **Run the board live.** It has only ever run through its fake-agent test, so `board/out/`
   does not exist. `JUNK_MODEL` set differently on two runs makes the model-variance result
   attributable for the first time.

## Traps that already cost time

- **`--stub` overwrites `crew/out/`** from the cached sweeps in `stubs/`. A regenerated
  dashboard silently reverts to the old physics the next time anyone replays. This bit twice,
  once badly enough to put stale data in a commit whose message claimed otherwise.
- **`git checkout -- crew/out` discards a live run's artifacts.** `out/` is the product of a
  90-minute run, not scratch. Recoverable only because `stubs/` survived and a replay
  reproduces it.
- **A small sample lies about grid cost.** Cell cost varies strongly with planet radius, the
  outermost axis. A 32-cell sample underestimated the grid by 2.5×. Measure against the full
  grid or not at all.
- **Constants nobody sweeps become false findings.** Three instances so far: the tank and
  engine, the skim altitude, and band altitude — which is *still* fixed at
  `atmTop × [1.6, 2.6, 4.2]` in `scoreCell` and is the one parameter that governs whether
  multi-pass can ever be optimal.

## Documents

| file | what it is |
|---|---|
| `gdd-change-proposal.md` | what the simulator measured, including where it contradicts itself and §10's account of the skim-altitude bug |
| `gdd-pending-changes.md` | decisions taken but not yet written into the GDD |
| `where-we-are.md` | this file |

---

## Update, 2026-07-28 (second session)

### Decided

The short GDD is the document of record and all three open questions are closed. See
`gdd-pending-changes.md` for the decisions and `gdd-change-proposal.md` §11 for the
measurements behind them.

- **One band**, a single envelope with a value gradient. The player picks their own altitude
  and chooses whether to circularise or throw a ballistic arc.
- **Twelve upgrade purchases** — the crew's 6 parts x 2 tiers, so the heat shield is bought
  rather than fixed at mid-tier.
- **Skims may be flown staged or unstaged**, a player choice. Staged is cool but one-way;
  unstaged keeps steering at a 3x heat multiplier.
- **Multi-pass is a requirement, not a preference.** The old "cheapest descent is 2 passes"
  cost rule is superseded — it cannot be won by tuning, and the feasibility rule is both
  easier to satisfy and closer to what the mechanic is for.

### Done in the crew

The one-band contract is in, and **86 crew tests and 41 board tests pass**.

- `schemas/baseline.schema.json` — one band with three named sample points.
- `schemas/debris-catalog.schema.json` — pieces carry `altitude_m`, not a band enum.
- `schemas/game-params.schema.json` — ablation maps rekeyed to bottom/middle/top;
  `economy.band_value_multiplier` became `economy.value_gradient`.
- `lib/sweep.js` — `sampleAlt`, `sampleFor` and `valueMultiplier` replace the band lookups;
  `fullHoldMass` takes an optional baseline and cuts the slice by altitude.
- `test/fixtures/world.js` migrated, six new tests covering the new helpers.
- `probes/` — three scripts that produced the §11 numbers, kept so they can be re-run.

### Still owed

1. **The five charters in `agents/`.** They still cite three bands and §2.3.1-2.3.7
   subsections that do not exist in the short GDD. A live run reads these, so it will produce
   the old shape until they are rewritten. **This is the blocker on running the crew live.**
2. **`lib/charts.js`** (78 band references) and `lib/godot.js` (3). The dashboard still
   renders three bands.
3. **The recorded run in `out/` predates the contract.** `test/schema.test.js` carries a
   documented allowance for exactly that. Do not hand-migrate those files — they record what
   a run produced. The allowance comes out when the crew is re-recorded.
4. **Confirm scale height 1,100 m at higher resolution** before it goes into the GDD. The
   optimizer surface is jagged and the ranking is not monotonic in shield area.
5. Everything on the previous list that is still open: regenerate the sweep caches, run the
   board live.

---

## Update, 2026-07-28 (third pass)

### The crew now speaks the decided design

All five charters, both remaining lib files and the orchestrator were brought onto the
one-band, twelve-upgrade, multi-pass-as-feasibility contract. **88 crew tests and 41 board
tests pass.**

- `agents/researcher.md` — one band with three named sample points; scale height called out
  as the parameter that decides whether aerobraking exists.
- `agents/debris-designer.md` — pieces carry `altitude_m`; fragile share and mass rise with
  altitude, smoothly rather than in three steps.
- `agents/economy-balancer.md` — sample-keyed ablation maps, `value_gradient`, and the
  retired cost rule replaced by the feasibility rule. The heat-shield tiers now buy
  `heat_capacity`.
- `agents/spec-auditor.md` — `cheapest_descent_is_multi_pass` replaced by
  `heavy_descent_requires_multi_pass`, judged on survivable peak heat in three parts.
- `agents/playtester.md`, `lib/charts.js`, `lib/godot.js`, `run-crew.js` — band vocabulary,
  the GDScript value gradient, and the retired target window on the dashboard.
- `lib/sweep.js` — **the endgame haul is now a load.** Loads ran empty / half / full hold, so
  the heaviest object in the game had never been flown by the crew at all.

### Two defects found while doing it

- **`fullHoldMass` silently mis-counted a legacy catalog.** Pieces without `altitude_m` made
  the envelope NaN, the span not-greater-than-zero, the fraction fall back to 0, and every
  piece read as `bottom` — so the shipping-slice filter stopped excluding anything and it
  returned 2,277.7 kg where the truth was 1,397.8. It now throws. Two regression tests, and
  `probes/legacy-catalog.js` does the conversion explicitly for reading the recorded run.
- **The scale-height recommendation did not survive confirmation.** See below.

### The planet change is on hold

`gdd-change-proposal.md` §11a and the correction in `gdd-pending-changes.md`. At 41 x 21
rather than 25 x 13 the capacity window at scale height 1,100 m collapses from 46% to 1%.
**Do not write a planet number into the GDD.** The measurement method has a bias that has now
bitten twice: the minimum single-pass peak is a minimum over a search, so refining the search
can only lower it, and every window is an upper bound until it stops moving between
resolutions.

### Still owed

1. A third resolution on the promising rows, to find a window that holds. `H=800` is the
   widest so far at 12%.
2. Re-record the crew live. The artifacts in `out/` are still pre-contract, and
   `test/schema.test.js` carries a documented allowance for exactly that.
3. `crew/README.md`, `CLAUDE.md` and `DIAGRAM.md` still describe three bands.
4. Regenerate the sweep caches; run the board live.

---

## Update, 2026-07-28 (fourth pass) — the reentry question is settled

**The planet change is dropped. The answer is a rule in §2.2, not a parameter.**

`gdd-change-proposal.md` §11b has the measurements; `gdd-pending-changes.md` has the decision.
In short: with the committed entry depth free, **no heat capacity separates a plunge from a
skimmed descent** — the coolest single pass is as cool as or cooler than the coolest
multi-pass at every scale height from 800 m to 3,100 m. Scale height moves every peak together
and changes no ratio. §11's recommendation was an artifact of an under-resolved grid.

Hold the entry depth fixed and one skim is worth **0.42-0.53x** on the peak. So the mechanic
works; the player's freedom to enter arbitrarily shallow is what makes it pointless. **A
commit floor restores it.** At a floor of 8,000 m, a capacity of ~235 forces the satellite
alone to skim (32% window) and ~180 forces the full hold too (41% window). These are bounded
by a rule rather than by a search, so they do not erode under a finer measurement — which is
the property every earlier window lacked.

The charters carry this now: the Researcher is told scale height is *not* the lever, and the
Balancer is told to report rather than pretend if the params it is given have no commit floor.

### Probes

`crew/probes/` now holds five, and the READMEd order they were written in is the argument:
`multipass-probe` (cost, by pass count), `keying-probe` (would a different ablation key help —
no), `force-multipass` (grid over scale height and shield area — produced the wrong answer),
`entry-boundary` (minimise properly — showed there is no window), `commit-floor` (the rule
that works).

### Still owed

1. **`crew/README.md`, `CLAUDE.md` and `DIAGRAM.md`** still describe three bands. Prose only,
   no behaviour depends on them.
2. **Re-record the crew live.** `out/` is pre-contract; `test/schema.test.js` carries a
   documented allowance that comes out when it is re-recorded.
3. **A `commit_floor_m` param** has to exist before the Balancer can honour the rule above —
   it is in no schema yet.
4. Regenerate the sweep caches; run the board live.

---

## Update, 2026-07-28 (fifth pass) — the GDD edit is specified

**`docs/gdd-edit-brief.md` is the work order.** Another agent can pick it up cold and edit the
GDD from it without reading anything else.

It exists because the other two design documents grew by accretion across one long session and
now retract themselves in places — an agent reading either top to bottom hits a recommendation
before the measurement that killed it. Both now carry a pointer at the top saying so. The brief
is the instruction; those two are the trail and the evidence.

### A measurement error found and corrected

Drawing the trajectories caught it, which is the only reason it was caught: the "one skim" path
rendered as a **single pass**. With `skims >= 1` the ship starts on an ellipse whose periapsis
is the *skim* altitude, so a low skim lands on that first passage and never commits —
`entryPeriapsis`, and with it the commit floor, is never used. Those descents are the shallow
plunge the floor exists to forbid.

Every "1 skim" and "2 skim" figure in §11b and §12 was affected; the recurring **128.9** is the
artifact. Corrected in §14: the satellite's committed skim reads **196.5**, not 128.9. The
plunge figures were always sound.

**The recommendation survives** — the window's lower edge was set by the full hold's plunge
(203.7), not by the satellite's skim — but "capacity ~180 forces the full hold to skim too" is
dead. That window is 4% wide.

### Still owed

1. The live run is still going. `out/` is untouched so far.
2. `crew/README.md`, `CLAUDE.md` and `DIAGRAM.md` still describe three bands. Prose only.
3. The audit does not fail a planet whose launch burns up — the climb's peak heat is reported
   and gated, but only against the locked planet's numbers.
4. Whether 97 seconds is a workable EVA window is a judgement nobody has made in play.

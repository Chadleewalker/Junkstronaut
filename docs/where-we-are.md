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

Both suites pass: **80 crew tests, 41 board tests**, about a second each.

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

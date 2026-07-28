# probes

One-off measurements that answer a specific design question. Not part of the crew, not run
by `run-crew.js`, not covered by the test suite. They read the crew's shipped output
(`out/params/baseline.json`, `out/config/game_params.json`, `out/data/debris_catalog.json`)
and fly `lib/sim.js` directly.

They live here because this project has three times reported a hardcoded constant as a fact
about the design, and the fix each time was to vary the thing and measure it. A probe that
produced a number in a document should still exist when someone doubts the number.

Run them from `crew/`. All are pure CPU, no credentials, seconds to a couple of minutes.

**Which of these still execute.** A probe reads whatever run is sitting in `out/`, so a probe
outlives its data only if the contract has not moved under it. `out/` now holds a live run on
the one-band contract, and the six probes written before that contract —
`multipass-probe`, `keying-probe`, `entry-boundary`, `extremes`, `commit-floor`, `candidate` —
read `baseline.bands` by name and exit on it. `force-multipass`, `smoke-pipeline`,
`trajectories` and everything in `rev2/` run against the current output. The six are kept
rather than deleted because each produced a number that is quoted in
`docs/gdd-change-proposal.md`, and the argument for that number is the script; to re-run one,
check out the recorded three-band run it was written against
(`git log -- out/params/baseline.json`).

| probe | question |
|---|---|
| `multipass-probe.js` | At each band and load, what is the cheapest descent at each flown pass count — and is a single pass survivable at all? |
| `keying-probe.js` | Ablation keys off the heat bar. Would keying it off peak heating rate or total heat load make multi-pass the cheapest descent? (Measured: no.) |
| `force-multipass.js` | What settings make a single pass *impossible* with the satellite aboard while leaving it possible for ordinary hauls? |

Environment knobs: `N_ENTRY` and `N_SKIMALT` set the resolution of the entry-depth and
skim-altitude scans, `BANDS` selects bands. Defaults are the resolution the recorded numbers
were taken at.

**Resolution matters more than it looks.** `multipass-probe.js` at `N_ENTRY=8` reports that
two passes beat one at satellite mass. At `N_ENTRY=31` the finer entry grid finds a cheaper
single pass and the result reverses. Do not quote a number from a coarse run.

All three use the two-depth descent model — `simulateDescent(..., { skims, entryPeriapsis })`
— and not `descentScan`, which never commits to a separate entry and so cannot express
skim-then-commit at all. That distinction is the reason for most of what is in
`docs/gdd-change-proposal.md` §11.

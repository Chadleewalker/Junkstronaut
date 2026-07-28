# Junkstronaut Tuning Crew — instructions for Claude Code

This folder is a five-agent crew that produces the config file for **Junkstronaut**, a 2D
game about salvaging space junk. Read `README.md` for what it does.

## If the user asks to run the crew

They will say something like "run the crew", "run it", "run the simulation", or "produce
the config". Run this from this folder:

```bash
node run-crew.js
```

It takes several minutes and prints its own progress. Do not wrap it, summarise it while it
runs, or re-implement any part of it — **the script is the crew**. Your job is to start it
and then explain the result.

If they want it to finish quickly, or they are not signed in, or they say they don't want
to spend tokens:

```bash
node run-crew.js --stub
```

That replays a recorded run through the identical code path. It takes about a second and
needs no credentials. Say plainly that it is a replay.

A live run takes 30–45 minutes. Tell them that before you start it, so they can choose the
replay instead if they only wanted to see it work.

## After it finishes

Read `out/audit/audit_report.md` and tell them:

1. Whether the audit passed, and if not, which rules failed and what the numbers were.
2. Where the game-ready files are: `out/config/game_params.tres` and `game_params.gd`.
3. That `out/report/dashboard.html` has the charts, and can be opened directly in a browser.
4. Anything in the report's **Observations** section — those satisfy the spec but are
   flagged for a human to look at before flying the numbers. They are usually the most
   interesting part of the run, because they are what a passing audit could not catch.

## Tests

`node --test "test/*.test.js"` from this folder. No credentials, about two seconds.

Most of that is one file. `sweep.test.js` flies real skim studies at ~340 ms each, and it
memoises them by band and scan resolution — the default study at the top of the band was
being recomputed seven times, 2.5 s of a 4.5 s suite. If you add a test there that varies
anything beyond those two inputs, extend the cache key or it will silently hand you the
wrong study.

Use that exact form. `node --test test/` does not resolve, and a bare `node --test` picks up
`test/fixtures/fake-agent.js` — which is a stand-in for the CLI, not a test — and blocks
forever waiting for a prompt on stdin.

Run it after touching anything in `lib/` or `run-crew.js`. It exists because `--stub` is not
a test: a replay reads its sweep from `stubs/`, so it never executes a single line of
`lib/sim.js` or the scoring in `lib/sweep.js` — the exact place the project's interesting
claims come from. The suite covers the schema validator, envelope parsing, the ablation rule,
the full-hold mass, the retry-with-feedback loop, and the audit routing.

## Do not

- Do not edit files in `agents/`, `schemas/` or `lib/` unless asked. The agent charters and
  their schemas are the crew's contract with itself.
- Do not "fix" a failing audit by editing `out/config/game_params.json` by hand. A failing
  audit is a real finding about the design. Report it; the crew is what changes numbers.
- Do not add dependencies. The crew is zero-dependency on purpose so it runs anywhere with
  Node and no install step.

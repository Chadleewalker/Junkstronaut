# Junkstronaut Review Board — instructions for Claude Code

This folder is a nine-agent design review board: six specialists review a design document
blind, cross-examine each other, a moderator synthesises, and a visualisation auditor checks
the report against its own data. Read `README.md` for what it does.

## If the user asks to run the board

They will say something like "run the board", "review the GDD", or "get the reviewers on
this". From this folder:

```bash
node run-board.js
```

It takes about ten minutes and prints its own progress. Do not wrap it, summarise it while
it runs, or re-implement any part of it — the script is the board.

To review a different document, pass `--gdd <file>`. The default is the full
`Junkstronaut GDD.txt` at the repository root; the short version lives under
`Short GDD Opus/`.

If they want it quick, are not signed in, or do not want to spend tokens:

```bash
node run-board.js --stub
```

That replays a recorded run through the identical code path. Say plainly it is a replay.

## After it finishes

Read `out/SYNTHESIS.md` and tell them:

1. The headline, and the top issues in rank order.
2. Anything under **unresolved** — these are the disagreements the board deliberately did
   not settle, and they are usually the most useful part of the run, because they mark
   exactly where a judgement call is needed.
3. The visualisation audit verdict, and any failing check.
4. That `out/review-board.html` opens in a browser.

## Tests

```bash
node --test "test/*.test.js"
```

Run after touching `lib/`, `run-board.js` or any schema. No credentials, about a second.
Use that exact form — a bare `node --test` picks up `test/fixtures/fake-board.js`, which is
a stand-in for the CLI rather than a test.

## Do not

- Do not edit `agents/` or `schemas/` unless asked. The charters and their contracts are the
  board's contract with itself, and the id enums injected at call time are what make the
  synthesis traceable.
- Do not hand-edit anything in `out/`. If the board found something wrong, that is the
  finding; the board is what changes it.
- Do not give the moderator the design document. It is deliberately withheld — a moderator
  that reads the source starts reviewing it, and the synthesis acquires a seventh opinion
  nobody can trace.
- Do not give the visualisation auditor the renderer. A page audited against the code that
  drew it agrees with itself by construction.
- Do not add dependencies. The board is zero-dependency and shares `../crew/lib/` on purpose.

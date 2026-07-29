# Junkstronaut Content Pipeline — instructions for Claude Code

This folder is a retrieval-grounded content pipeline for **Junkstronaut**, a 2D game about
salvaging space junk. It reads the game's design document, retrieves the passages that answer
each question, writes content from those passages alone, and runs a critic that reads every
line back against the same passages. Read `README.md` for what it produces.

## If the user asks to run it

They will say something like "run the content pipeline", "generate the barks", or "write the
flavour text". From this folder:

```bash
node run-content.js
```

It takes 10–20 minutes on opus and prints its own progress. Do not wrap it, summarise it
while it runs, or re-implement any part of it — the script is the pipeline.

If they want it quick, are not signed in, or do not want to spend tokens:

```bash
node run-content.js --stub
```

That replays a recorded run through the identical code path in about a second. Say plainly
that it is a replay.

`--reuse bark-writer,lore-critic.barks` replays named agents and runs the rest live, which is
how you iterate on one charter without paying for the other eight calls.

## After it finishes

Open `out/report/content.html` and tell them:

1. What the critic caught, and whether the correction held on the re-check. This is the most
   interesting part of any run — it is the pipeline catching itself.
2. Any **failing deterministic check**. Those are facts about two files, not judgements, so a
   failure there is unambiguous.
3. Where the game-ready files are: `out/content/*.json` plus the `content.gd` autoload.
4. The retrieval numbers, if they ask: precision@1 is measured against the `expect` labels in
   `lib/items.js`, which were written by reading the document and not by looking at what the
   retriever returned.

## Tests

```bash
node --test "test/*.test.js"
```

About two seconds, no credentials. Run after touching anything in `lib/` or `run-content.js`.

Use that exact form. A bare `node --test` picks up `test/fixtures/fake-writer.js` — a
stand-in for the CLI, not a test — and blocks forever waiting for a prompt on stdin.

The suite exists because `--stub` is not a test: a replay only walks the path one recorded
run happened to take, so it never exercises the schema gate rejecting output, the
retry-with-feedback loop, or a critic verdict that has nothing to apply. All three are
covered here against `test/fixtures/fake-writer.js`.

## Do not

- **Do not write anything into `crew/`.** This pipeline reads
  `crew/out/data/debris_catalog.json` and nothing else from there. A live crew run owns that
  directory.
- Do not edit the design document. It is the document of record and the knowledge base.
- Do not hand-edit files in `out/`. If the content is wrong, that is a finding about the
  pipeline; the pipeline is what changes it.
- Do not give the critic the writer's reasoning. It is given the artifact and the passages,
  deliberately — a critic that reads the justification can be argued into agreeing with it.
  `run-content.js` strips `why` before the critic call, and that line is load-bearing.
- Do not delete `lib/retrieve.js`'s `overlap` scorer. It is the retired retriever, kept
  runnable so the improvement in the ReadMe stays a measurement rather than a claim.
- Do not add dependencies. Zero-dependency on purpose, like `crew/` and `board/`, and it
  shares `../crew/lib/` rather than copying it.

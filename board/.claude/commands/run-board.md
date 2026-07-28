---
description: Run the Junkstronaut design review board and explain what it found
---

Run the Junkstronaut design review board.

Use `node run-board.js` from this folder. If the user passed `stub`, `replay` or `fast` as an
argument ($ARGUMENTS), use `node run-board.js --stub` instead and say clearly that it is a
replay of a recorded run rather than live agents.

If they named a document, pass it with `--gdd <file>`. The default is
`Junkstronaut GDD Short.txt` at the repository root, which is the document of record.

Let the script print its own progress — do not summarise while it runs.

Tell the user a live run takes about ten minutes before you start one.

When it finishes, read `out/SYNTHESIS.md` and report:

1. The headline, and the top issues in rank order.
2. Everything under **unresolved** — the disagreements the board deliberately did not settle.
   These are usually the most useful part of the run, because they mark exactly where a
   judgement call is needed and who is on each side.
3. The visualisation audit verdict, and any failing check with the numbers it compared.
4. That `out/review-board.html` opens directly in a browser.

Do not edit any output by hand. If a reviewer found something, that is the finding.

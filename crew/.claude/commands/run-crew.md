---
description: Run the Junkstronaut tuning crew and explain the result
---

Run the Junkstronaut tuning crew.

Use `node run-crew.js` from the repository root. If the user passed `stub`, `replay`, or
`fast` as an argument ($ARGUMENTS), use `node run-crew.js --stub` instead and say clearly
that it is a replay of a recorded run rather than live agents.

Let the script print its own progress — do not summarise while it runs.

Warn the user that a live run takes 30–45 minutes before you start one.

When it finishes, read `out/audit/audit_report.md` and report:

1. The audit verdict, and for any failing check, the rule and the numbers it compared.
2. Where the game-ready files landed: `out/config/game_params.tres` and `game_params.gd`,
   plus `out/report/dashboard.html` for the charts.
3. Anything under **Observations** — those pass the spec but are flagged for a human.

Do not edit any output by hand. If the audit failed, that is a finding about the design,
not something to patch.

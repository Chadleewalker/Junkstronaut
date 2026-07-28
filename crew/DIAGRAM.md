# Junkstronaut tuning crew — architecture

Five agents, one deterministic orchestrator, two feedback edges, and a flight simulator in
the middle. Every arrow between agents is a **file**, not a conversation: each agent writes
a schema-checked JSON artifact and the next agent reads it. Nothing is passed as chat
history, so any stage can be re-run alone.

## Agent roles and data flow

```mermaid
flowchart TB
  GDD["Junkstronaut GDD<br/><i>§2.3 rules, §2.3 Key values</i>"]

  subgraph CREW["The crew — five agents"]
    direction TB
    R["<b>1 · RESEARCHER</b><br/>scales real orbital and reentry<br/>physics to a small planet"]
    D["<b>2 · DEBRIS DESIGNER</b><br/>authors the loot table:<br/>mass, size class, fragility"]
    B["<b>3 · ECONOMY BALANCER</b><br/>prices the catalog against<br/>every rule in §2.3 at once"]
    P["<b>4 · PLAYTESTER</b><br/>reads what the flights did;<br/>proposes a value set"]
    A["<b>5 · SPEC AUDITOR</b><br/>recomputes each Key values<br/>bullet against the numbers"]
  end

  SIM[["<b>FLIGHT SIMULATOR</b><br/><i>deterministic, no model</i><br/>flies the config, then sweeps<br/>5,184 worlds against 8 targets"]]

  BASE[/"params/baseline.json<br/><i>orbital speeds, atmosphere,<br/>heating thresholds, drag</i>"/]
  CAT[/"data/debris_catalog.json<br/><i>18–30 debris types, no prices</i>"/]
  PAR[/"config/game_params.json<br/><i>every tunable in the game</i>"/]
  SWP[/"playtest/sweep_*.json<br/><i>measured outcomes</i>"/]
  PLAY[/"playtest/playtest_report.json<br/><i>claim vs measured, proposals</i>"/]
  AUD[/"audit/audit_report.md<br/><i>per-rule pass/fail + evidence</i>"/]

  TRES["<b>config/game_params.tres</b><br/>+ game_params.gd<br/><i>the resource Godot loads</i>"]
  HUMAN{{"Chad flies the candidate<br/><i>GDD §3.3 Checkpoint 2</i>"}}

  GDD --> R
  GDD -.->|"§2.3.4, §2.3.7"| D
  GDD -.->|"every Key values list"| B
  GDD -.->|"§2.3.1, §4.5 risks"| P
  GDD ==>|"the spec, never the<br/>other agents' reasoning"| A

  R -->|writes| BASE
  BASE -->|"band names,<br/>speeds, drag"| D
  D -->|writes| CAT
  BASE --> B
  CAT -->|"masses to price"| B
  B -->|writes| PAR
  PAR --> SIM
  BASE --> SIM
  CAT --> SIM
  SIM -->|writes| SWP
  SWP -->|"thousands of flights"| P
  P -->|writes| PLAY
  PAR -->|"the numbers<br/>under audit"| A
  SWP -->|"measured evidence"| A
  PLAY -->|"findings"| A
  A -->|writes| AUD

  A -->|"<b>fail · owner: economy-balancer</b><br/>prices, ablation, landing, tow fee"| B
  A -->|"<b>fail · owner: debris-designer</b><br/>masses, spawn weights, band summaries"| D
  B -.->|"catalog_concerns<br/><i>can't fix it, don't own it</i>"| D

  PAR --> TRES
  CAT --> TRES
  AUD --> HUMAN
  PLAY -->|"candidate value set"| HUMAN
  TRES --> HUMAN
  HUMAN -->|"feels wrong — narrow the range"| B

  classDef agent fill:#e8f0fb,stroke:#2c5aa0,stroke-width:2px,color:#14181d
  classDef artifact fill:#fdf4e3,stroke:#a86c17,stroke-width:1.5px,color:#14181d
  classDef ship fill:#e4f3e7,stroke:#2f7a41,stroke-width:2px,color:#14181d
  classDef human fill:#f7e2df,stroke:#9d3a2f,stroke-width:2px,color:#14181d
  classDef sim fill:#ece9f7,stroke:#4a3aa7,stroke-width:2px,color:#14181d
  class R,D,B,P,A agent
  class BASE,CAT,PAR,SWP,PLAY,AUD artifact
  class TRES ship
  class HUMAN human
  class SIM sim
```

**The simulator is scaffolding, not an agent.** It integrates trajectories at a fixed
timestep with no randomness and no model in the loop, which is what makes a sweep of
thousands of flights mean anything (GDD §4.4, headless determinism). It keeps a hard line
between physics and game rules: gravity, drag, heating and orbital mechanics are simulated;
how peak heat converts to shield ablation is a *design decision* and is taken from the
Balancer's params rather than re-derived. Simulating the physics and applying the crew's
rules is what lets the sweep answer "is the cheapest descent really 2–4 passes" by
measurement instead of by restating the formula that claimed it.

**Why the Playtester sits between the simulator and the Auditor.** The sweep produces
thousands of rows; somebody has to say what they mean. The Auditor could read them, but it
answers a different question — *does the config obey the written rules* — and the GDD (§3.1)
draws that boundary explicitly: QA tests conformance, the Playtester measures behaviour and
proposes numbers. Only the Playtester emits a candidate value set, which is the artifact
Chad actually flies at Checkpoint 2, and only the Playtester distinguishes a **tuning**
problem (grid configurations exist that fix it) from a **design** problem (almost none do,
so the rule itself has to change). That distinction decides whether you go hunting for a
value or rewrite a mechanic, and nothing else in the crew produces it.

The thick arrow into the Spec Auditor is load-bearing. The Auditor is given the **design
document**, never the other agents' reasoning — if it audited their reasoning it would
encode their mistakes along with their intent. It checks numbers against the spec and
nothing else.

**Why there are two return edges and not one.** Every check the Auditor emits carries an
`owner` — the agent whose artifact the rule is actually about — and failures go back to
that agent. Catalog rules (piece masses, spawn weights, band summaries) return to the
Debris Designer; parameter rules (prices, ablation, landing, tow fee) return to the Economy
Balancer.

This was not the first design. The first version had one edge, everything returning to the
Balancer, and it produced exactly the failure you would expect: when the audit failed on
*fragile spawn share* — the Designer's data — the Balancer was the only agent in the loop,
so it emitted a corrected copy of the catalog inside its own output. The audit then passed.
The run was green and the repo had two loot tables that disagreed, with the corrected one
guaranteed to lose the moment anyone opened the original file.

The Auditor caught it, in an observation rather than a check:

> Only the params copy is correct. Whichever file ends up in the repo as the debris source
> of truth needs to be the params one, or the spawn-share fix will be silently undone.

So the Balancer can no longer do that — its schema forbids extra keys, and it has a
`catalog_concerns` field instead: a way to say *this is wrong and it is not mine to fix*.
The dotted arrow is that channel. The general rule is worth stating plainly, because it is
the thing that makes a crew a crew rather than a relay: **an agent that can edit another
agent's artifact to pass its own gate is not being audited.**

## How the orchestrator drives it

The chain above is what the agents do. This is what the **code** does, and none of it is a
model decision — control flow, retries and gates are all deterministic scaffolding.

```mermaid
flowchart TB
  S(["node run-crew.js"]) --> RUN["run agent<br/><i>prompt on stdin, JSON on stdout</i>"]
  RUN --> ENV{"envelope parses?<br/><i>CLI chatter stripped bottom-up</i>"}
  ENV -->|no| RETRY
  ENV -->|yes| SCH{"output valid<br/>against its schema?"}
  SCH -->|no| RETRY["feed the exact errors back<br/>attempt &lt; 3"]
  RETRY --> RUN
  SCH -->|yes| NEXT["hand the artifact<br/>to the next agent"]

  NEXT --> LAST{"was that<br/>the Auditor?"}
  LAST -->|no| RUN
  LAST -->|yes| V{"verdict"}
  V -->|pass| SHIP["emit .tres + .gd<br/>render charts<br/>write run.json"]
  V -->|"fail, revisions &lt; 2"| SPLIT["partition failures by owner"]
  SPLIT --> BUG["bug report per agent<br/>re-run the ones implicated"]
  BUG --> RUN
  V -->|"fail, revisions spent"| REPORT["report the failure<br/><i>still emits every artifact</i>"]
  REPORT --> SHIP

  classDef gate fill:#fdf4e3,stroke:#a86c17,stroke-width:1.5px,color:#14181d
  classDef ship fill:#e4f3e7,stroke:#2f7a41,stroke-width:2px,color:#14181d
  class ENV,SCH,V,LAST gate
  class SHIP ship
```

Two gates, and they do different jobs:

- **The schema gate is syntactic** and it is cheap. A malformed artifact never reaches the
  next agent — it retries the agent that produced it, with the exact validation errors fed
  back in. Being told `$.upgrades: has 6 items, needs at least 12` fixes the problem far
  more reliably than being told to try again.
- **The audit gate is semantic** and it is the interesting one. It sends a per-rule bug
  report — naming the GDD section that failed and the arithmetic that showed it — back to
  whichever agent owns the artifact the rule is about.

Note where the judgement sits. The Auditor decides *which agent a rule belongs to*, because
that takes reading the rule. The orchestrator only reads the resulting label and dispatches
on it. Deciding is fuzzy work and belongs to an agent; dispatching is a switch statement and
belongs in code — so the routing is reproducible even though the labelling is not.

An audit that still fails after two revisions is **reported, not retried forever**. Every
artifact is still written and the exit code is still 0, because a crew that correctly
reports "these three rules cannot be satisfied together" is a crew that worked — that is a
design finding, and it is exactly what a human needs to see.

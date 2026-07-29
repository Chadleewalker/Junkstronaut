# The content pipeline, in one picture

```mermaid
flowchart TB
  GDD["<b>Junkstronaut GDD</b><br/>44,500 chars · the knowledge base"]
  CAT["<b>debris_catalog.json</b><br/><i>read from crew/out, never written</i>"]

  CH[["<b>CHUNK</b><br/>section-aware, sentence-bounded<br/>48 chunks over 15 sections"]]
  RET[["<b>RETRIEVE</b><br/>BM25 · one query per game state<br/><i>query, chunks and scores logged</i>"]]

  BW["<b>BARK WRITER</b><br/>18 state-triggered lines"]
  DF["<b>DEBRIS FLAVOURIST</b><br/>25 names + flavour"]
  PW["<b>POST-MORTEM WRITER</b><br/>9 end-of-run screens"]

  VER[["<b>CODE CHECKS</b><br/>coverage · citations<br/>fiction vs. mechanics"]]
  LC["<b>LORE CRITIC</b><br/>×3, one per content type"]
  RC["<b>LORE CRITIC · RE-CHECK</b><br/>only what changed"]

  OUT["<b>content/*.json + content.gd</b><br/><i>what the game loads</i>"]
  EV["<b>critique_log.json</b><br/><i>the rejected drafts</i>"]

  GDD --> CH --> RET
  CAT -->|"mass, altitude, class, fragile"| DF
  RET -->|"3 passages per item"| BW
  RET -->|"3 passages per item"| DF
  RET -->|"3 passages per item"| PW

  BW --> VER
  DF --> VER
  PW --> VER
  VER --> LC
  RET ==>|"the same passages,<br/>never the writer's reasoning"| LC
  LC -->|"corrected"| RC
  LC -->|"before + reasoning + after"| EV
  RC --> OUT

  classDef agent fill:#e8f0fb,stroke:#2c5aa0,stroke-width:2px,color:#14181d
  classDef code fill:#ece9f7,stroke:#4a3aa7,stroke-width:2px,color:#14181d
  classDef ship fill:#e4f3e7,stroke:#2f7a41,stroke-width:2px,color:#14181d
  classDef doc fill:#fdf4e3,stroke:#a86c17,stroke-width:1.5px,color:#14181d
  class BW,DF,PW,LC,RC agent
  class CH,RET,VER code
  class OUT ship
  class GDD,CAT,EV doc
```

## What is a model and what is not

Everything in purple is code with no model in it: the chunker, the retriever, the coverage
and citation checks, the fiction-versus-mechanics check, and the decision to apply a
correction. Everything in blue is an agent. Nothing crosses.

That line is where the pipeline's claims come from. "Retrieval is accurate" is a number
computed against labels written before either retriever ran. "The fiction matches the
mechanics" is a comparison of two files. "The critic caught a lore break" is an agent's
judgement — and it is the only one of the three that is, which is why the report prints the
passage the critic cited next to the line it rejected.

## The one edge that matters

`RET ==> LC` is drawn heavy because it is the design decision the critic stage rests on. The
critic is given the retrieved passages and the generated items, and **not** the writer's
`why` field. `run-content.js` strips it before the call.

A critic that reads the writer's justification is a critic being argued with: a confident
sentence about why a line is fine talks it into agreeing with a passage that says otherwise.
This is the same discipline the tuning crew's Spec Auditor runs on — given the design
document rather than the other agents' reasoning — and it is copied here deliberately.

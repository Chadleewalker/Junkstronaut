#!/usr/bin/env node
'use strict';
// The Junkstronaut tuning crew.
//
// Five agents in a chain with two feedback edges, producing the config the game loads.
//
//   Researcher -> Debris Designer -> Economy Balancer -> [flight sim] -> Playtester
//                       ^                  ^                                 |
//                       |                  |                                 v
//                       +-- catalog rules -+-- parameter rules ------- Spec Auditor
//
// The flight simulator in the middle is deterministic scaffolding, not an agent: it flies
// the params and sweeps the parameter space, and the Playtester reads what it found. That
// is the difference between a crew that asserts its numbers and one that measures them.
//
// This file is the orchestrator and it contains no model. Control flow, retries, gates and
// exit conditions are all deterministic — agents do the fuzzy work, scaffolding decides
// what happens next. That separation is the whole reason the run is reproducible enough to
// hand to somebody else.
//
//   node run-crew.js                 run the real crew
//   node run-crew.js --stub          replay recorded output, no model calls, no credentials
//   node run-crew.js --record        run for real, then save the logs as replay fixtures
//   node run-crew.js --gdd <file>    point at a different design document
//   node run-crew.js --out <dir>     write artifacts somewhere else

const fs = require('fs');
const path = require('path');
const { runAgent } = require('./lib/agent');
const { emitResource, emitScript } = require('./lib/godot');
const { renderDashboard } = require('./lib/charts');
const { verificationSweep, explorationSweep } = require('./lib/sweep');

const ROOT = __dirname;
const MAX_REVISIONS = 2; // balancer attempts after the first audit failure

// ---------------------------------------------------------------- argument handling

function parseArgs(argv) {
  const args = { mode: 'live', record: false, out: null, gdd: null, reuse: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stub') args.mode = 'stub';
    else if (a === '--record') args.record = true;
    else if (a === '--reuse') args.reuse = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--gdd') args.gdd = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

const USAGE = `
Junkstronaut tuning crew — five agents that produce the game's config file.

  node run-crew.js                run the real crew (needs Claude Code, signed in)
  node run-crew.js --stub         replay recorded output — no model calls, no credentials
  node run-crew.js --record       run for real, then save the logs as replay fixtures
  node run-crew.js --gdd <file>   point at a different design document
  node run-crew.js --out <dir>    write artifacts somewhere else (default: crew/out)
  node run-crew.js --reuse a,b    replay these agents from stubs, run the rest live
                                  (e.g. --reuse researcher, while iterating downstream).
                                  Names are labels, so revisions are addressable too:
                                  --reuse researcher,economy-balancer.rev1 — which is how
                                  you resume a run that died partway through.

Environment:
  JUNK_MODEL          model alias for the agents (default: opus)
  JUNK_AGENT_CMD      replace the agent command entirely (the test seam)
  JUNK_AGENT_TIMEOUT_MS  per-agent timeout in ms (default: 1500000)
`.trim();

// ---------------------------------------------------------------- small helpers

const t0 = Date.now();
function log(msg) {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  console.log(`[${s}s] ${msg}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function findGdd(explicit) {
  if (explicit) return path.resolve(explicit);
  const candidates = [
    path.join(ROOT, '..', 'Junkstronaut GDD.txt'),
    path.join(ROOT, 'Junkstronaut GDD.txt'),
    path.join(ROOT, 'gdd.txt'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      'could not find the design document. Looked for:\n  ' +
      candidates.join('\n  ') +
      '\nPass one with --gdd <file>.'
    );
  }
  return found;
}

// The auditor's failing checks, rendered as the bug report an agent gets back. It carries
// the rule, the evidence and the hint — never a value, because choosing the value is the
// agent's job and an auditor that dictates numbers has stopped being a check.
//
// `owner` is what decides who receives which finding. The auditor labels each check with
// the agent whose artifact the rule is about; this function only reads that label. The
// judgement is the auditor's, the dispatch is deterministic — which is the same division
// the whole crew runs on.
function bugReport(checks, audience) {
  const body = checks
    .map((c, i) =>
      `${i + 1}. [${c.rule_id}] GDD ${c.gdd_ref} — ${c.statement}\n` +
      `   What the audit found: ${c.evidence}\n` +
      (c.fix_hint ? `   Suggested direction: ${c.fix_hint}\n` : '')
    )
    .join('\n');

  const target = audience === 'debris-designer'
    ? 'These are findings about the catalog you authored, so they come back to you — no ' +
      'other agent is allowed to edit that data.\n\nRevise the catalog so every rule above ' +
      'holds. Keep every id stable and leave unrelated pieces alone. Return the complete ' +
      'corrected object.'
    : 'Revise the parameters so every rule above holds. Change only what these findings ' +
      'implicate — a revision that moves unrelated values makes the next audit ' +
      'uninterpretable. Return the complete corrected object.';

  return (
    'The Spec Auditor rejected the last pass. It checked the numbers against the design ' +
    'document, not against anyone\'s reasoning, and these rules did not hold:\n\n' +
    body + '\n' + target
  );
}

// The Balancer's channel for "this rule is blocked by the catalog, which is not mine to
// fix". Routed to the Designer alongside any audit findings it owns.
function concernReport(concerns) {
  return (
    'The Economy Balancer raised these concerns about the catalog while pricing it. They ' +
    'are not audit failures — they are the agent downstream of you telling you what it ' +
    'could not work around:\n\n' +
    concerns.map((c, i) => `${i + 1}. ${c}`).join('\n') +
    '\n\nAddress the ones you agree with. If you think one is mistaken, say so in ' +
    'design_notes and leave the catalog as it is.'
  );
}

// ---------------------------------------------------------------- the crew

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const outDir = args.out ? path.resolve(args.out) : path.join(ROOT, 'out');
  const logDir = path.join(outDir, 'logs');
  const stubDir = path.join(ROOT, 'stubs');
  fs.mkdirSync(logDir, { recursive: true });

  const gddPath = findGdd(args.gdd);
  const gdd = read(gddPath);

  const charter = (name) => read(path.join(ROOT, 'agents', `${name}.md`));
  const schema = (name) => readJson(path.join(ROOT, 'schemas', `${name}.schema.json`));

  // `label` names the log and the replay fixture; `name` still picks the charter. They
  // differ on a revision pass, because the Balancer and Auditor each run more than once
  // and a shared label would overwrite the first run's log with the second's.
  const call = (name, inputs, schemaName, label) =>
    runAgent({
      name: label || name,
      charter: charter(name),
      inputs,
      schema: schema(schemaName),
      logDir,
      // --reuse replays named agents from stubs while the rest run live, so iterating on a
      // downstream charter does not re-pay for the Researcher every time.
      //
      // It matches the LABEL, which is the thing a fixture is actually filed under — so
      // `--reuse researcher` replays the Researcher, and `--reuse economy-balancer.rev1`
      // replays that one revision and nothing else. Matching the charter name instead is
      // what broke this before: `--reuse debris-designer` sent every revision hunting for
      // its own fixture, found none, and killed the run three attempts later. An exact
      // label cannot make that mistake, because a revision's label is a different string
      // from the first pass's — which is also what makes resuming an interrupted run
      // possible at all: name the calls that already happened, live the ones that did not.
      mode: args.reuse.includes(label || name) ? 'stub' : args.mode,
      stubDir,
      log,
    });

  log(`Junkstronaut tuning crew — ${args.mode === 'stub' ? 'REPLAY (no model calls)' : 'live'}`);
  log(`design document: ${path.basename(gddPath)} (${gdd.length.toLocaleString()} chars)`);
  console.log('');

  const models = new Set();
  const track = (r) => { if (r.model) models.add(r.model); return r; };

  // -- 1. Researcher ------------------------------------------------------------
  log('1/5  Researcher — scaling real orbital physics to the game planet');
  const research = track(call('researcher', { 'GAME DESIGN DOCUMENT': gdd }, 'baseline'));
  const baseline = research.object;
  log(`     ok — ${baseline.bands.length} bands, ` +
      `planet radius ${baseline.planet.radius_m.toLocaleString()} m, ` +
      `${baseline.derivation.length} derivation steps`);

  // -- 2. Debris Designer -------------------------------------------------------
  log('2/5  Debris Designer — authoring the loot table');
  const design = track(call('debris-designer', {
    'GAME DESIGN DOCUMENT': gdd,
    'BASELINE PHYSICS (from the Researcher)': JSON.stringify(baseline, null, 2),
  }, 'debris-catalog'));
  let catalog = design.object;
  log(`     ok — ${catalog.debris.length} debris types, ` +
      `${catalog.debris.filter((d) => d.fragile).length} fragile`);

  // -- 3 & 4. Balancer, then Auditor, looping while the audit fails -------------
  //
  // Two feedback edges, not one. A failing check names the agent whose artifact it is
  // about, and the finding goes there: catalog rules to the Designer, parameter rules to
  // the Balancer. The single-edge version of this loop is how the Balancer ended up
  // "fixing" the Designer's spawn weights inside its own output — it was the only agent in
  // the loop, so every finding became its problem whether or not it owned the data.
  let params = null;
  let audit = null;
  let sweeps = null;
  let playtest = null;
  let revision = 0;
  let designerFeedback = null;
  let balancerFeedback = null;
  let designerRevisions = 0;

  while (true) {
    if (designerFeedback) {
      designerRevisions++;
      log(`2/5  Debris Designer (revision ${designerRevisions}) — fixing the catalog findings routed back to it`);
      const redesign = track(call('debris-designer', {
        'GAME DESIGN DOCUMENT': gdd,
        'BASELINE PHYSICS (from the Researcher)': JSON.stringify(baseline, null, 2),
        'YOUR PREVIOUS CATALOG': JSON.stringify(catalog, null, 2),
        'FINDINGS ROUTED BACK TO YOU': designerFeedback,
      }, 'debris-catalog', `debris-designer.rev${designerRevisions}`));
      catalog = redesign.object;
      log(`     ok — ${catalog.debris.length} debris types, ` +
          `${catalog.debris.filter((d) => d.fragile).length} fragile`);
      designerFeedback = null;
    }

    const label = revision === 0 ? '3/5  Economy Balancer' : `3/5  Economy Balancer (revision ${revision})`;
    log(`${label} — pricing the catalog against every rule in §2.3`);

    const balanceInputs = {
      'GAME DESIGN DOCUMENT': gdd,
      'BASELINE PHYSICS (from the Researcher)': JSON.stringify(baseline, null, 2),
      'DEBRIS CATALOG (from the Debris Designer)': JSON.stringify(catalog, null, 2),
    };
    if (balancerFeedback) balanceInputs['SPEC AUDIT — FAILING CHECKS FROM YOUR LAST ATTEMPT'] = balancerFeedback;

    const suffix = revision === 0 ? '' : `.rev${revision}`;
    const balance = track(call('economy-balancer', balanceInputs, 'game-params', `economy-balancer${suffix}`));
    params = balance.object;
    log(`     ok — ${params.upgrades.length} upgrades, ` +
        `optimal skims ${JSON.stringify(params.ablation.optimal_skims)}`);
    if ((params.catalog_concerns || []).length) {
      log(`     raised ${params.catalog_concerns.length} catalog concern(s) for the Designer`);
    }

    // -- the flight model. Deterministic: it flies the params, it does not judge them.
    // Cached in stub mode so a replay stays instant; the exploration grid is ~8 minutes of
    // honest compute and re-running it would defeat the point of having a replay at all.
    log('4/5  Flight simulator — flying the config, then sweeping the parameter space');
    const sweepCache = path.join(stubDir, `sweep${suffix}.json`);
    if (args.mode === 'stub' && fs.existsSync(sweepCache)) {
      sweeps = readJson(sweepCache);
      log('     replayed from a recorded sweep');
    } else {
      const tSweep = Date.now();
      const verification = verificationSweep(baseline, params, catalog);
      log(`     verification: ${verification.descents.filter((d) => d.landed).length}/${verification.descents.length} scenarios landed` +
          `, ballistic coefficient ${verification.ballistic_coefficient.staged_kg_m2} kg/m2`);
      const exploration = explorationSweep(baseline, params, catalog);
      sweeps = { verification, exploration };
      log(`     exploration: ${exploration.total_configs} worlds scored, best ${exploration.best_score}/${exploration.max_score}` +
          ` (${((Date.now() - tSweep) / 1000).toFixed(0)}s)`);
      if (args.record) { fs.mkdirSync(stubDir, { recursive: true }); writeJson(sweepCache, sweeps); }
    }

    // The exploration grid is far too large to put in a prompt, and the rows past the top
    // few are noise. What the Playtester needs is the satisfaction rates — which targets
    // are reachable anywhere at all — plus the best configurations.
    const explorationDigest = {
      grid: sweeps.exploration.grid,
      total_configs: sweeps.exploration.total_configs,
      best_score: sweeps.exploration.best_score,
      max_score: sweeps.exploration.max_score,
      target_satisfaction_rate: sweeps.exploration.target_satisfaction_rate,
      top: sweeps.exploration.top.slice(0, 12),
    };

    log('4/5  Playtester — reading what the numbers actually did');
    const playRun = track(call('playtester', {
      'GAME DESIGN DOCUMENT': gdd,
      'BASELINE PHYSICS': JSON.stringify(baseline, null, 2),
      'GAME PARAMETERS AS FLOWN': JSON.stringify(params, null, 2),
      'VERIFICATION SWEEP — the crew\'s own config, flown': JSON.stringify(sweeps.verification, null, 2),
      'EXPLORATION SWEEP — a grid of worlds, scored': JSON.stringify(explorationDigest, null, 2),
    }, 'playtest-report', `playtester${suffix}`));
    playtest = playRun.object;
    const blocking = playtest.findings.filter((f) => f.severity === 'blocking').length;
    log(`     ${playtest.verdict.toUpperCase()} — ${playtest.findings.length} findings (${blocking} blocking), ` +
        `${(playtest.proposed_changes || []).length} proposed changes`);

    log('5/5  Spec Auditor — checking the numbers against the design document');
    const auditRun = track(call('spec-auditor', {
      'GAME DESIGN DOCUMENT': gdd,
      'BASELINE PHYSICS': JSON.stringify(baseline, null, 2),
      'DEBRIS CATALOG': JSON.stringify(catalog, null, 2),
      'GAME PARAMETERS UNDER AUDIT': JSON.stringify(params, null, 2),
      'MEASURED FLIGHT RESULTS — from the simulator, not from anyone\'s arithmetic':
        JSON.stringify(sweeps.verification, null, 2),
      'PLAYTESTER FINDINGS': JSON.stringify(playtest.findings, null, 2),
    }, 'audit-report', `spec-auditor${suffix}`));
    audit = auditRun.object;

    const failed = audit.checks.filter((c) => c.result === 'fail');
    log(`     ${audit.verdict.toUpperCase()} — ${audit.checks.length - failed.length}/${audit.checks.length} checks passed`);

    if (audit.verdict !== 'fail') break;
    if (revision >= MAX_REVISIONS) {
      log(`     audit still failing after ${MAX_REVISIONS} revisions — reporting it rather than looping`);
      break;
    }

    const forDesigner = failed.filter((c) => c.owner === 'debris-designer');
    const forBalancer = failed.filter((c) => c.owner !== 'debris-designer');
    for (const c of failed) log(`       fail (${c.owner}): ${c.rule_id} — ${c.evidence}`);

    const concerns = params.catalog_concerns || [];
    if (forDesigner.length || concerns.length) {
      const parts = [];
      if (forDesigner.length) parts.push(bugReport(forDesigner, 'debris-designer'));
      if (concerns.length) parts.push(concernReport(concerns));
      designerFeedback = parts.join('\n\n');
      log(`     routing ${forDesigner.length} finding(s) + ${concerns.length} concern(s) to the Debris Designer`);
    }
    balancerFeedback = forBalancer.length ? bugReport(forBalancer, 'economy-balancer') : null;
    if (forBalancer.length) log(`     routing ${forBalancer.length} finding(s) to the Economy Balancer`);

    revision++;
    console.log('');
  }

  const fragileCount = catalog.debris.filter((d) => d.fragile).length;

  // -- artifacts ----------------------------------------------------------------
  console.log('');
  log('writing artifacts');

  writeJson(path.join(outDir, 'params', 'baseline.json'), baseline);
  writeJson(path.join(outDir, 'data', 'debris_catalog.json'), catalog);
  writeJson(path.join(outDir, 'config', 'game_params.json'), params);
  writeJson(path.join(outDir, 'audit', 'audit_report.json'), audit);
  writeJson(path.join(outDir, 'playtest', 'playtest_report.json'), playtest);
  writeJson(path.join(outDir, 'playtest', 'sweep_verification.json'), sweeps.verification);
  writeJson(path.join(outDir, 'playtest', 'sweep_exploration.json'), sweeps.exploration);

  const configDir = path.join(outDir, 'config');
  fs.writeFileSync(path.join(configDir, 'game_params.tres'), emitResource(params, catalog));
  fs.writeFileSync(path.join(configDir, 'game_params.gd'), emitScript());
  fs.writeFileSync(path.join(outDir, 'audit', 'audit_report.md'), renderAudit(audit));

  const manifest = {
    crew: 'junkstronaut-tuning-crew',
    mode: args.mode,
    finished_at: new Date().toISOString(),
    duration_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
    design_document: path.basename(gddPath),
    models: [...models],
    agents: [
      { name: 'researcher', attempts: research.attempts },
      { name: 'debris-designer', attempts: design.attempts, revisions: designerRevisions },
      { name: 'economy-balancer', revisions: revision },
      { name: 'playtester', verdict: playtest.verdict, findings: playtest.findings.length },
      { name: 'spec-auditor', verdict: audit.verdict, audits: revision + 1 },
    ],
    audit: {
      verdict: audit.verdict,
      checks_total: audit.checks.length,
      checks_failed: audit.checks.filter((c) => c.result === 'fail').length,
      observations: (audit.observations || []).length,
    },
    // Surfaced here because a concern raised on a run whose audit passes is never routed
    // anywhere — the loop only fires on failure. Without this the Balancer can say "these
    // catalog masses are wrong" and the finding reaches nothing a human reads. Advisory
    // only: a concern has never changed an outcome and must not start now.
    catalog_concerns: params.catalog_concerns || [],
    artifacts: [
      'params/baseline.json',
      'data/debris_catalog.json',
      'config/game_params.json',
      'config/game_params.tres',
      'config/game_params.gd',
      'audit/audit_report.json',
      'audit/audit_report.md',
      'playtest/playtest_report.json',
      'playtest/sweep_verification.json',
      'playtest/sweep_exploration.json',
      'report/dashboard.html',
    ],
  };
  writeJson(path.join(outDir, 'run.json'), manifest);

  // Charts last, so the manifest they display is the finished one. Deterministic rendering
  // of numbers the crew already produced — never a fifth agent.
  const reportDir = path.join(outDir, 'report');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'dashboard.html'),
    renderDashboard({ baseline, catalog, params, audit, manifest, playtest, sweeps })
  );

  // The audit report is the file a human opens; a concern that only exists in the params
  // JSON has not been surfaced. Append rather than interleave, so the auditor's own text
  // is never mixed with something the auditor did not write.
  if ((params.catalog_concerns || []).length) {
    fs.appendFileSync(path.join(outDir, 'audit', 'audit_report.md'),
      '\n## Catalog concerns raised by the Economy Balancer\n\n' +
      '_Not audit findings. These are things the Balancer could not work around and does ' +
      'not own — it may not edit the catalog. They are routed to the Debris Designer on a ' +
      'failing run; on a passing run they land here, for you._\n\n' +
      params.catalog_concerns.map((c) => `- ${c}`).join('\n') + '\n');
  }

  if (args.record) {
    fs.mkdirSync(stubDir, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(logDir)) {
      if (!f.endsWith('.log') || f.endsWith('.err.log')) continue;
      fs.copyFileSync(path.join(logDir, f), path.join(stubDir, f));
      n++;
    }
    log(`recorded ${n} agent logs to stubs/ — \`--stub\` will now replay this run`);
  }

  // -- summary ------------------------------------------------------------------
  console.log('');
  console.log('  ' + '-'.repeat(66));
  console.log(`  Junkstronaut tuning crew — ${audit.verdict === 'pass' ? 'AUDIT PASSED' : `AUDIT ${audit.verdict.toUpperCase()}`}`);
  console.log('  ' + '-'.repeat(66));
  console.log(`  ${audit.summary}`);
  console.log('');
  console.log(`  debris types      ${catalog.debris.length} (${fragileCount} fragile)`);
  console.log(`  upgrades priced   ${params.upgrades.length}`);
  console.log(`  audits run        ${revision + 1}`);
  console.log(`  revisions         ${revision} balancer, ${designerRevisions} designer`);
  console.log(`  audit             ${audit.checks.filter((c) => c.result === 'pass').length}/${audit.checks.length} checks passed`);
  console.log(`  playtest          ${playtest.verdict} — ${playtest.findings.filter((f) => f.severity === 'blocking').length} blocking of ${playtest.findings.length} findings`);
  console.log(`  observations      ${(audit.observations || []).length} (advisory — never fail a run)`);
  if ((params.catalog_concerns || []).length) {
    console.log(`  catalog concerns  ${params.catalog_concerns.length} raised by the Balancer`);
  }
  if (models.size) console.log(`  models            ${[...models].join(', ')}`);
  console.log(`  artifacts         ${path.relative(process.cwd(), outDir) || outDir}`);
  console.log('  ' + '-'.repeat(66));
  console.log('');
  console.log('  Game-ready output:');
  console.log('    config/game_params.tres   the resource the game loads (GDD §4.4)');
  console.log('    config/game_params.gd     its companion script');
  console.log('    data/debris_catalog.json  the loot table');
  console.log('    audit/audit_report.md     what a human should look at before flying it');
  console.log('    report/dashboard.html     the charts — open this one in a browser');
  console.log('    playtest/                 what the simulator measured, and the sweep');
  console.log('');

  // An audit failure is a finding, not a crash. The crew ran, every artifact exists, and
  // the report says exactly which rules did not hold — that is the crew working, so the
  // exit code stays 0. Only a crew that could not produce artifacts exits non-zero.
  return 0;
}

function renderAudit(audit) {
  const lines = [
    '# Spec audit — Junkstronaut tuning crew',
    '',
    `**Verdict: ${audit.verdict.toUpperCase()}**`,
    '',
    audit.summary,
    '',
    '## Checks',
    '',
    '| Rule | GDD | Result | Evidence |',
    '|---|---|---|---|',
  ];
  for (const c of audit.checks) {
    const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| \`${c.rule_id}\` | §${c.gdd_ref} | ${c.result === 'pass' ? 'pass' : '**FAIL**'} | ${cell(c.evidence)} |`);
  }
  const failed = audit.checks.filter((c) => c.result === 'fail');
  if (failed.length) {
    lines.push('', '## Failing checks in detail', '');
    for (const c of failed) {
      lines.push(`### \`${c.rule_id}\` — GDD §${c.gdd_ref}`, '', c.statement, '', `**Found:** ${c.evidence}`, '');
      if (c.fix_hint) lines.push(`**Suggested direction:** ${c.fix_hint}`, '');
    }
  }
  if (audit.observations && audit.observations.length) {
    lines.push('', '## Observations', '',
      '_Satisfies the spec, but worth a human\'s attention before it is flown. ' +
      'These never fail the audit._', '');
    for (const o of audit.observations) lines.push(`- ${o}`);
  }
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error('');
    console.error(`crew failed: ${err.message}`);
    console.error('');
    console.error('Nothing was produced. Check crew/out/logs/ for the last agent prompt and reply.');
    process.exit(1);
  }
}

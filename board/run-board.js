#!/usr/bin/env node
'use strict';
// The Junkstronaut design review board.
//
// Six specialists read a design document independently, then read each other, then a
// moderator synthesises what they found. A visualisation auditor checks the resulting page
// against the data it was built from.
//
//   systems-designer ┐
//   adversarial-qa   │
//   player-psych     ├─ round 1 ─→ round 2 ─→ [tally] ─→ moderator ─→ [render] ─→ viz-auditor
//   narrative-critic │  (alone)   (cross-      code                     code
//   feasibility-lead │            examine)
//   business-analyst ┘
//
// Two things make this a board rather than six opinions in a folder:
//
//   1. ROUND ONE IS BLIND. No reviewer sees another's findings until it has filed its own.
//      Convergence between lenses that could not have coordinated is the strongest signal
//      the board produces, and it is only worth anything if it was not manufactured.
//   2. THE MODERATOR CANNOT INVENT. Every claim in the synthesis carries the finding ids it
//      is built from, and the ids it is allowed to cite are injected into its output
//      contract as an enum before it is called. A citation of something nobody said is a
//      schema error, which retries the agent with the exact dangling id. The promise that
//      "nothing here is the moderator's own critique" is a gate, not a sentence.
//
// The cross-examination outcomes are computed, not asserted. Reviewers vote; lib/aggregate.js
// counts. Deciding whether a finding survives another lens takes reading it, so an agent does
// that; adding up votes is arithmetic, so code does. No model decides what happens next.
//
//   node run-board.js                    run the board (needs Claude Code, signed in)
//   node run-board.js --stub             replay a recorded run; no model calls, no credentials
//   node run-board.js --record           run live, then save the logs as replay fixtures
//   node run-board.js --gdd <file>       review a different document
//   node run-board.js --out <dir>        write artifacts somewhere else
//   node run-board.js --reuse a,b        replay these agents, run the rest live

const fs = require('fs');
const path = require('path');

// Shared with the tuning crew on purpose. A second copy of a JSON Schema validator is two
// sources of truth about what a valid artifact is, which is the exact failure the crew's own
// architecture is built to avoid. The dependency runs one way: crew/ knows nothing about
// board/, and still runs standalone.
const { runAgent } = require('../crew/lib/agent');
const {
  reviewSchemaFor, crossExamSchemaFor, synthesisSchemaFor, danglingCitations,
} = require('./lib/contract');
const { aggregate, moderatorDigest } = require('./lib/aggregate');
const { renderBoard } = require('./lib/render');

const ROOT = __dirname;

const REVIEWERS = [
  'systems-designer',
  'adversarial-qa',
  'player-psychologist',
  'narrative-critic',
  'feasibility-lead',
  'business-analyst',
];

const USAGE = `
Junkstronaut design review board — six reviewers, cross-examined, then synthesised.

  node run-board.js                run the board (needs Claude Code, signed in)
  node run-board.js --stub         replay a recorded run — no model calls, no credentials
  node run-board.js --record       run live, then save the logs as replay fixtures
  node run-board.js --gdd <file>   review a different document
  node run-board.js --out <dir>    write artifacts somewhere else (default: board/out)
  node run-board.js --reuse a,b    replay these agents from stubs, run the rest live.
                                   Names are labels, so a round is addressable on its own:
                                   --reuse systems-designer,systems-designer.round2

Environment:
  JUNK_MODEL             model alias for the agents (default: opus). Set this to run the
                         same board on a different model — the two runs are directly
                         comparable, which is the point of recording the prompts at all.
  JUNK_AGENT_CMD         replace the agent command entirely (the test seam)
  JUNK_AGENT_TIMEOUT_MS  per-agent timeout in ms
`.trim();

// ---------------------------------------------------------------- helpers

const t0 = Date.now();
function log(msg) {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  console.log(`[${s}s] ${msg}`);
}

const read = (f) => fs.readFileSync(f, 'utf8');
const readJson = (f) => JSON.parse(read(f));

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

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
    else { console.error(`unknown argument: ${a}`); process.exit(2); }
  }
  return args;
}

function findGdd(explicit) {
  if (explicit) return path.resolve(explicit);
  // The short GDD at the repository root is the document of record. The copies under
  // Short GDD Opus/ and Short GDD Fable/ are archives of what the earlier boards reviewed and
  // are kept only as fallbacks; the long GDD is a withdrawn draft.
  const candidates = [
    path.join(ROOT, '..', 'Junkstronaut GDD Short.txt'),
    path.join(ROOT, '..', 'Junkstronaut GDD.txt'),
    path.join(ROOT, '..', 'Short GDD Opus', 'Junkstronaut GDD Short.txt'),
    path.join(ROOT, 'gdd.txt'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('could not find a design document. Looked for:\n  ' +
      candidates.join('\n  ') + '\nPass one with --gdd <file>.');
  }
  return found;
}

// What a reviewer is shown in round two: everybody's findings, with its own marked, and
// nothing else. Not the other reviewers' reasoning about each other — that would arrive in
// round three and there isn't one.
function crossExamPacket(reviews, slug) {
  return reviews.flatMap((r) => r.findings.map((f) => ({
    id: f.id,
    raised_by: r.agent,
    yours: r.agent === slug,
    lens: r.lens,
    title: f.title,
    severity: f.severity,
    problem: f.problem,
    where: f.where,
    why_it_matters: f.why_it_matters,
    proposed_fix: f.proposed_fix || null,
  })));
}

function renderSynthesisMd(synthesis, agg, manifest) {
  const byId = new Map(agg.findings.map((f) => [f.id, f]));
  const cite = (ids) => ids.map((id) => {
    const f = byId.get(id);
    return f ? `\`${id}\` (${f.reviewer}, ${f.severity}${f.outcome === 'STRENGTHENED' ? ', strengthened' : ''})` : `\`${id}\``;
  }).join('; ');

  const L = [
    `# Review board synthesis — ${manifest.design_document}`,
    '',
    'Moderator synthesis of six independent specialist reviews and their cross-examination.',
    'Every claim below carries the finding ids it is built from, and the moderator could not',
    'have cited an id no reviewer raised: the permitted ids are injected into its output',
    'contract, so an invented source fails validation rather than reaching this page.',
    '',
    `Findings: **${agg.counts.total}** from ${agg.counts.reviewers} reviewers — ` +
      `${agg.counts.by_severity.BLOCKING} blocking, ${agg.counts.by_severity.MAJOR} major, ` +
      `${agg.counts.by_severity.MINOR} minor ` +
      `(round one opened with ${agg.counts.by_round1_severity.BLOCKING} blocking).`,
    '',
    `Cross-examination: ${agg.counts.cross_examination_responses} responses, ` +
      `${agg.counts.conflicts_raised} conflicts. ` +
      `${agg.counts.by_outcome.STRENGTHENED} strengthened, ${agg.counts.by_outcome.HELD} held, ` +
      `${agg.counts.by_outcome.CONTESTED} contested, ${agg.counts.by_outcome.WEAKENED} weakened. ` +
      'These are tallied from the reviewers\' votes, not asserted by the moderator.',
    '',
    '---',
    '',
    '## Headline',
    '',
    synthesis.headline,
    '',
    '## Top issues',
    '',
  ];

  for (const t of (synthesis.top_issues || []).slice().sort((a, b) => a.rank - b.rank)) {
    L.push(`### ${t.rank}. ${t.title}`, '',
      `**Built from:** ${cite(t.finding_ids)}`, '',
      t.summary, '',
      `**Why ranked here:** ${t.why_ranked_here}`, '');
  }

  if ((synthesis.unresolved || []).length) {
    L.push('## Unresolved disagreements', '',
      '_Escalated to the design owner rather than averaged. Two competent lenses disagreeing',
      'is a map of where the judgement call is._', '');
    for (const u of synthesis.unresolved) {
      L.push(`### ${u.question}`, '');
      for (const p of u.positions) {
        L.push(`**${p.reviewers.join(', ')}:** ${p.stance}` +
          ((p.finding_ids || []).length ? ` — ${cite(p.finding_ids)}` : ''), '');
      }
      L.push(`**Decision needed:** ${u.decision_needed}`, '');
    }
  }

  if ((synthesis.themes || []).length) {
    L.push('## Themes', '');
    for (const t of synthesis.themes) L.push(`- ${t.theme}`, `  - ${cite(t.finding_ids)}`);
    L.push('');
  }

  if ((synthesis.what_the_document_does_well || []).length) {
    L.push('## What the document does well', '');
    for (const s of synthesis.what_the_document_does_well) L.push(`- ${s}`);
    L.push('');
  }

  L.push('## Every finding', '',
    '| id | reviewer | severity | outcome | +/− | title |', '|---|---|---|---|---|---|');
  for (const f of agg.findings) {
    const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    L.push(`| \`${f.id}\` | ${f.reviewer} | ${f.severity}` +
      `${f.severity_change !== 'UNCHANGED' ? ` (${f.severity_change.toLowerCase()} from ${f.round1_severity})` : ''}` +
      ` | ${f.outcome} | +${f.support_count}/−${f.contest_count} | ${cell(f.title)} |`);
  }
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- the board

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }

  const outDir = args.out ? path.resolve(args.out) : path.join(ROOT, 'out');
  const logDir = path.join(outDir, 'logs');
  const stubDir = path.join(ROOT, 'stubs');
  fs.mkdirSync(logDir, { recursive: true });

  const gddPath = findGdd(args.gdd);
  const gdd = read(gddPath);

  const charter = (name) => read(path.join(ROOT, 'agents', `${name}.md`));
  const schemaFile = (name) => readJson(path.join(ROOT, 'schemas', `${name}.schema.json`));

  const call = (name, inputs, schema, label) =>
    runAgent({
      name: label || name,
      charter: charter(name),
      inputs,
      schema,
      logDir,
      mode: args.reuse.includes(label || name) ? 'stub' : args.mode,
      stubDir,
      log,
    });

  log(`Junkstronaut review board — ${args.mode === 'stub' ? 'REPLAY (no model calls)' : 'live'}`);
  log(`document under review: ${path.basename(gddPath)} (${gdd.length.toLocaleString()} chars)`);
  console.log('');

  const models = new Set();
  const track = (r) => { if (r.model) models.add(r.model); return r; };

  // -- round 1: six reviewers, each blind to the others ---------------------------
  const reviewSchema = schemaFile('review');
  const reviews = [];
  for (const [i, slug] of REVIEWERS.entries()) {
    log(`round 1 · ${i + 1}/${REVIEWERS.length}  ${slug}`);
    const r = track(call(slug, { 'DESIGN DOCUMENT UNDER REVIEW': gdd },
      reviewSchemaFor(reviewSchema, slug), slug));
    reviews.push(r.object);
    const sev = r.object.findings.reduce((a, f) => {
      a[f.severity] = (a[f.severity] || 0) + 1; return a;
    }, {});
    log(`     ok — ${r.object.findings.length} findings ` +
        `(${sev.BLOCKING || 0} blocking, ${sev.MAJOR || 0} major, ${sev.MINOR || 0} minor)`);
  }

  const allIds = reviews.flatMap((r) => r.findings.map((f) => f.id));
  console.log('');
  log(`${allIds.length} findings on the table — cross-examining`);

  // -- round 2: everyone reads everyone ------------------------------------------
  const crossSchema = schemaFile('cross-exam');
  const crossExams = [];
  for (const [i, slug] of REVIEWERS.entries()) {
    const ownIds = reviews.find((r) => r.agent === slug).findings.map((f) => f.id);
    log(`round 2 · ${i + 1}/${REVIEWERS.length}  ${slug}`);
    const r = track(call(slug, {
      'DESIGN DOCUMENT UNDER REVIEW': gdd,
      'EVERY FINDING ON THE TABLE — yours are marked': JSON.stringify(crossExamPacket(reviews, slug), null, 2),
      'WHAT YOU ARE DOING NOW':
        'This is round two. Take a position on the other reviewers\' findings and revise ' +
        'the severity of your own where what you have read changes it. Return the ' +
        'cross-examination object described in your charter, not another review.',
    }, crossExamSchemaFor(crossSchema, slug, allIds, ownIds), `${slug}.round2`));
    crossExams.push(r.object);
    const pos = (r.object.responses || []).reduce((a, x) => {
      a[x.position] = (a[x.position] || 0) + 1; return a;
    }, {});
    log(`     ok — ${pos.supports || 0} supports, ${pos.contests || 0} contests, ` +
        `${(r.object.revisions || []).length} own revisions`);
  }

  // -- the tally. Code, not an agent. --------------------------------------------
  console.log('');
  const agg = aggregate(reviews, crossExams);
  log(`tally — ${agg.counts.by_severity.BLOCKING} blocking (was ${agg.counts.by_round1_severity.BLOCKING}), ` +
      `${agg.counts.by_outcome.STRENGTHENED} strengthened, ${agg.counts.by_outcome.WEAKENED} weakened`);
  if (agg.dropped_revisions.length) {
    // Never silently. A reviewer trying to restate somebody else's severity is worth seeing.
    for (const d of agg.dropped_revisions) {
      log(`     discarded ${d.kind} from ${d.by} on ${d.finding_id}` +
          (d.owner ? ` (owned by ${d.owner})` : ''));
    }
  }

  // -- the moderator, which may rank and connect but may not invent ---------------
  log('moderator — ranking, connecting, escalating');
  const moderation = track(call('moderator', {
    'THE BOARD\'S FINDINGS, WITH THE CROSS-EXAMINATION TALLY': JSON.stringify(moderatorDigest(agg), null, 2),
  }, synthesisSchemaFor(schemaFile('synthesis'), allIds), 'moderator'));
  const synthesis = moderation.object;

  // The enum in the contract should make this unreachable. Checking anyway, because the one
  // thing this board promises is that every claim traces to a finding somebody raised, and a
  // promise enforced by a mechanism nobody verifies is a promise.
  const dangling = danglingCitations(synthesis, allIds);
  if (dangling.length) {
    throw new Error(
      `the synthesis cites findings nobody raised: ${dangling.join(', ')}.\n` +
      'The schema enum should have caught this before the object was accepted — the ' +
      'contract in schemas/synthesis.schema.json and lib/contract.js have diverged.'
    );
  }
  log(`     ok — ${synthesis.top_issues.length} top issues, ${synthesis.unresolved.length} unresolved, ` +
      `${synthesis.themes.length} themes, every citation traced`);

  // -- the page. Deterministic. --------------------------------------------------
  const manifest = {
    board: 'junkstronaut-review-board',
    mode: args.mode,
    finished_at: new Date().toISOString(),
    duration_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
    design_document: path.basename(gddPath),
    models: [...models],
    reviewers: REVIEWERS,
    counts: agg.counts,
  };

  const pagePath = path.join(outDir, 'review-board.html');
  fs.writeFileSync(pagePath, renderBoard({ aggregate: agg, synthesis, manifest }));
  log(`rendered ${path.relative(process.cwd(), pagePath)} from the data, by code`);

  // -- the visualisation audit ---------------------------------------------------
  // Given the finished page and the source data, and NOT the renderer. A page audited
  // against the code that drew it agrees with itself by construction.
  log('viz-auditor — checking the page against the data it was built from');
  const audit = track(call('viz-auditor', {
    'THE RENDERED PAGE': read(pagePath),
    'THE DATA IT SHOULD AGREE WITH': JSON.stringify({
      counts: agg.counts,
      findings: agg.findings.map((f) => ({
        id: f.id, reviewer: f.reviewer, title: f.title, severity: f.severity,
        round1_severity: f.round1_severity, outcome: f.outcome,
        support_count: f.support_count, contest_count: f.contest_count,
      })),
      synthesis_citations: {
        top_issues: synthesis.top_issues.map((t) => ({ rank: t.rank, title: t.title, finding_ids: t.finding_ids })),
        themes: synthesis.themes.map((t) => t.finding_ids),
        unresolved: synthesis.unresolved.length,
      },
    }, null, 2),
  }, schemaFile('viz-audit'), 'viz-auditor'));
  const vizAudit = audit.object;
  const failed = vizAudit.checks.filter((c) => c.result === 'fail');
  log(`     ${vizAudit.verdict.toUpperCase()} — ${vizAudit.checks.length - failed.length}/${vizAudit.checks.length} checks passed`);
  for (const c of failed) log(`       fail: ${c.claim} — ${c.evidence}`);

  // Re-rendered with the audit appended. The audited content above it is byte-identical;
  // the new section makes no claim about the findings, only about the audit, which is why
  // appending it does not invalidate what was checked.
  fs.writeFileSync(pagePath, renderBoard({ aggregate: agg, synthesis, manifest, vizAudit }));

  // -- artifacts -----------------------------------------------------------------
  console.log('');
  log('writing artifacts');
  for (const r of reviews) writeJson(path.join(outDir, 'reviews', `${r.agent}.json`), r);
  for (const x of crossExams) writeJson(path.join(outDir, 'reviews', `${x.agent}.round2.json`), x);
  writeJson(path.join(outDir, 'aggregate.json'), agg);
  writeJson(path.join(outDir, 'synthesis.json'), synthesis);
  writeJson(path.join(outDir, 'viz_audit.json'), vizAudit);
  fs.writeFileSync(path.join(outDir, 'SYNTHESIS.md'), renderSynthesisMd(synthesis, agg, manifest));
  manifest.viz_audit = { verdict: vizAudit.verdict, checks_failed: failed.length };
  writeJson(path.join(outDir, 'run.json'), manifest);

  if (args.record) {
    fs.mkdirSync(stubDir, { recursive: true });
    let n = 0;
    for (const file of fs.readdirSync(logDir)) {
      if (!file.endsWith('.log') || file.endsWith('.err.log')) continue;
      fs.copyFileSync(path.join(logDir, file), path.join(stubDir, file));
      n++;
    }
    log(`recorded ${n} agent logs to stubs/ — \`--stub\` will now replay this run`);
  }

  // -- summary -------------------------------------------------------------------
  const c = agg.counts;
  console.log('');
  console.log('  ' + '-'.repeat(66));
  console.log('  Junkstronaut review board');
  console.log('  ' + '-'.repeat(66));
  console.log(`  ${synthesis.headline.split('\n')[0]}`);
  console.log('');
  console.log(`  findings          ${c.total} (${c.by_severity.BLOCKING} blocking, ${c.by_severity.MAJOR} major, ${c.by_severity.MINOR} minor)`);
  console.log(`  round one opened  ${c.by_round1_severity.BLOCKING} blocking`);
  console.log(`  cross-examined    ${c.cross_examination_responses} responses, ${c.conflicts_raised} conflicts`);
  console.log(`  outcomes          ${c.by_outcome.STRENGTHENED} strengthened, ${c.by_outcome.HELD} held, ${c.by_outcome.CONTESTED} contested, ${c.by_outcome.WEAKENED} weakened`);
  console.log(`  top issues        ${synthesis.top_issues.length}`);
  console.log(`  unresolved        ${synthesis.unresolved.length} (escalated, not averaged)`);
  console.log(`  viz audit         ${vizAudit.verdict} — ${failed.length} failed of ${vizAudit.checks.length}`);
  if (models.size) console.log(`  models            ${[...models].join(', ')}`);
  console.log(`  artifacts         ${path.relative(process.cwd(), outDir) || outDir}`);
  console.log('  ' + '-'.repeat(66));
  console.log('');
  console.log('  Read these:');
  console.log('    out/review-board.html   the report — open this one in a browser');
  console.log('    out/SYNTHESIS.md        the same thing as text, with every citation');
  console.log('    out/aggregate.json      every finding, every vote, the computed tally');
  console.log('');
  return 0;
}

module.exports = { parseArgs, crossExamPacket, renderSynthesisMd, REVIEWERS, USAGE };

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('');
      console.error(`board failed: ${err.message}`);
      console.error('');
      console.error('Check board/out/logs/ for the last agent prompt and reply. Artifacts are');
      console.error('written near the end, so a late failure still leaves the page unwritten but');
      console.error('every review on disk in the logs.');
      process.exit(1);
    }
  );
}

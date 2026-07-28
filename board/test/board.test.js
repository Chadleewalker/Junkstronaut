'use strict';
// The board, end to end, with a fake agent standing in for the model.
//
// This is the test the old board could not have: its charters, prompts and orchestration
// were never written down, so there was nothing to run. Everything here goes through the
// real run-board.js — the real contracts, the real specialisation, the real tally, the real
// renderer — and only the model is substituted.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { renderBoard } = require('../lib/render');
const { renderSynthesisMd, crossExamPacket, parseArgs, REVIEWERS } = require('../run-board');

const RUNNER = path.join(__dirname, '..', 'run-board.js');
const FAKE = path.join(__dirname, 'fixtures', 'fake-board.js');
// The document of record. Passed explicitly rather than left to findGdd, so the test does
// not quietly start reviewing a different file when the repository's documents change —
// which is exactly what broke it once, when the long draft was withdrawn.
const GDD = path.join(__dirname, '..', '..', 'Junkstronaut GDD Short.txt');

// One run, shared by the assertions below — it takes about a second and re-running it per
// test would be the slowest thing in either suite.
let RUN = null;
function board() {
  if (RUN) return RUN;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'junk-board-test-'));
  const res = spawnSync(process.execPath, [RUNNER, '--out', out, '--gdd', GDD], {
    encoding: 'utf8',
    env: { ...process.env, JUNK_AGENT_CMD: `"${process.execPath}" "${FAKE}"` },
  });
  const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
  RUN = {
    out, res,
    stdout: res.stdout || '',
    html: read('review-board.html'),
    md: read('SYNTHESIS.md'),
    aggregate: JSON.parse(read('aggregate.json')),
    synthesis: JSON.parse(read('synthesis.json')),
    manifest: JSON.parse(read('run.json')),
    vizAudit: JSON.parse(read('viz_audit.json')),
  };
  return RUN;
}

test('the board runs from first reviewer to visualisation audit and exits clean', () => {
  const b = board();
  assert.equal(b.res.status, 0, `board exited ${b.res.status}\n${b.res.stderr}`);
  assert.match(b.stdout, /round 1 · 6\/6/);
  assert.match(b.stdout, /round 2 · 6\/6/);
  assert.match(b.stdout, /every citation traced/);
});

test('every reviewer is called twice — blind, then cross-examining', () => {
  const b = board();
  for (const slug of REVIEWERS) {
    assert.ok(fs.existsSync(path.join(b.out, 'reviews', `${slug}.json`)), `${slug} round 1`);
    assert.ok(fs.existsSync(path.join(b.out, 'reviews', `${slug}.round2.json`)), `${slug} round 2`);
  }
});

test('round one is blind — no reviewer prompt contains another reviewer\'s findings', () => {
  // The single most important property of this board. Convergence between lenses is only
  // evidence if the lenses could not have coordinated.
  const b = board();
  for (const slug of REVIEWERS) {
    const prompt = fs.readFileSync(path.join(b.out, 'logs', `${slug}.attempt1.prompt.md`), 'utf8');
    assert.doesNotMatch(prompt, /EVERY FINDING ON THE TABLE/,
      `${slug} was shown other findings in round one`);
    assert.doesNotMatch(prompt, /-F1"/, `${slug} saw finding ids in round one`);
  }
});

test('round two shows every finding, with the reviewer\'s own marked', () => {
  const b = board();
  const prompt = fs.readFileSync(
    path.join(b.out, 'logs', 'systems-designer.round2.attempt1.prompt.md'), 'utf8');
  assert.match(prompt, /EVERY FINDING ON THE TABLE/);
  assert.match(prompt, /"raised_by": "adversarial-qa"/);
  assert.match(prompt, /"yours": true/);
  assert.match(prompt, /This is round two/);
});

test('the moderator never sees the document under review', () => {
  // A moderator that can read the source starts reviewing it, and the synthesis quietly
  // acquires a seventh opinion nobody can trace.
  const b = board();
  const prompt = fs.readFileSync(path.join(b.out, 'logs', 'moderator.attempt1.prompt.md'), 'utf8');
  assert.doesNotMatch(prompt, /DESIGN DOCUMENT UNDER REVIEW/);
  assert.match(prompt, /THE BOARD'S FINDINGS, WITH THE CROSS-EXAMINATION TALLY/);
});

test('every synthesis citation resolves to a finding somebody raised', () => {
  const b = board();
  const ids = new Set(b.aggregate.findings.map((f) => f.id));
  const cited = [
    ...b.synthesis.top_issues.flatMap((t) => t.finding_ids),
    ...b.synthesis.themes.flatMap((t) => t.finding_ids),
    ...b.synthesis.unresolved.flatMap((u) => u.positions.flatMap((p) => p.finding_ids || [])),
  ];
  assert.ok(cited.length > 0, 'a synthesis that cites nothing proves nothing');
  for (const id of cited) assert.ok(ids.has(id), `${id} was cited but never raised`);
});

test('the tally is computed, and the page agrees with it', () => {
  const b = board();
  const c = b.aggregate.counts;
  assert.equal(c.total, b.aggregate.findings.length);
  assert.equal(
    c.by_severity.BLOCKING + c.by_severity.MAJOR + c.by_severity.MINOR, c.total);
  // The severity a reviewer revised in round two must show up as a difference between the
  // two distributions, and the page must display both.
  assert.notDeepEqual(c.by_severity, c.by_round1_severity);
  assert.match(b.html, /Severity after round one/);
  assert.match(b.html, /Severity after cross-examination/);
});

test('the page reports the counts the data holds', () => {
  const b = board();
  const c = b.aggregate.counts;
  const tile = (label) => {
    const re = new RegExp(`<div class="tile-value">(\\d+)</div>\\s*<div class="tile-label">${label}</div>`);
    const m = b.html.match(re);
    assert.ok(m, `no tile for ${label}`);
    return Number(m[1]);
  };
  assert.equal(tile('findings'), c.total);
  assert.equal(tile('blocking'), c.by_severity.BLOCKING);
  assert.equal(tile('strengthened'), c.by_outcome.STRENGTHENED);
  assert.equal(tile('unresolved'), b.synthesis.unresolved.length);
});

test('every finding appears on the page, attributed to the reviewer that raised it', () => {
  const b = board();
  for (const f of b.aggregate.findings) {
    assert.ok(b.html.includes(`id="${f.id}"`), `${f.id} missing from the page`);
    const block = b.html.slice(b.html.indexOf(`id="${f.id}"`));
    assert.ok(block.slice(0, 1200).includes(f.reviewer),
      `${f.id} is not attributed to ${f.reviewer}`);
  }
});

test('the markdown synthesis carries the same citations as the page', () => {
  const b = board();
  for (const t of b.synthesis.top_issues) {
    for (const id of t.finding_ids) {
      assert.ok(b.md.includes(id), `${id} cited in the synthesis but absent from SYNTHESIS.md`);
    }
  }
  assert.match(b.md, /\| id \| reviewer \| severity \| outcome \|/);
});

test('the visualisation audit runs against the page and lands in the manifest', () => {
  const b = board();
  assert.equal(b.vizAudit.agent, 'viz-auditor');
  assert.ok(b.vizAudit.checks.length >= 5);
  assert.equal(b.manifest.viz_audit.verdict, b.vizAudit.verdict);
  assert.match(b.html, /Visualisation audit/);
});

test('the auditor is given the page and the data, and never the renderer', () => {
  // A page audited against the code that drew it agrees with itself by construction.
  const b = board();
  const prompt = fs.readFileSync(path.join(b.out, 'logs', 'viz-auditor.attempt1.prompt.md'), 'utf8');
  assert.match(prompt, /THE RENDERED PAGE/);
  assert.match(prompt, /THE DATA IT SHOULD AGREE WITH/);
  assert.doesNotMatch(prompt, /renderBoard|lib\/render/);
});

// ---------------------------------------------------------------- pure pieces

test('the packet marks exactly one reviewer\'s findings as their own', () => {
  const reviews = [
    { agent: 'a', lens: 'l', findings: [{ id: 'a-F1', title: 't', severity: 'MAJOR', problem: 'p', where: [], why_it_matters: 'w' }] },
    { agent: 'b', lens: 'l', findings: [{ id: 'b-F1', title: 't', severity: 'MAJOR', problem: 'p', where: [], why_it_matters: 'w' }] },
  ];
  const packet = crossExamPacket(reviews, 'a');
  assert.deepEqual(packet.map((p) => p.yours), [true, false]);
  assert.deepEqual(packet.map((p) => p.raised_by), ['a', 'b']);
});

test('the renderer escapes data rather than trusting it', () => {
  // Every string on the page was written by a model.
  const nasty = '<script>alert(1)</script>';
  const agg = {
    findings: [{
      id: 'a-F1', reviewer: 'a', title: nasty, severity: 'MAJOR', round1_severity: 'MAJOR',
      outcome: 'HELD', problem: nasty, where: [nasty], why_it_matters: nasty,
      supports: [], contests: [], support_count: 0, contest_count: 0,
      severity_change: 'UNCHANGED', revision: null,
    }],
    counts: {
      total: 1, reviewers: 1, by_severity: { BLOCKING: 0, MAJOR: 1, MINOR: 0 },
      by_round1_severity: { BLOCKING: 0, MAJOR: 1, MINOR: 0 },
      by_outcome: { STRENGTHENED: 0, HELD: 1, CONTESTED: 0, WEAKENED: 0 },
      severity_changes: { UPGRADED: 0, DOWNGRADED: 0, UNCHANGED: 1 },
      cross_examination_responses: 0, conflicts_raised: 0,
    },
    by_reviewer: [{ agent: 'a', lens: 'l', findings: 1, blocking: 0 }],
    conflicts: [], connections: [], dropped_revisions: [],
  };
  const html = renderBoard({
    aggregate: agg,
    synthesis: { headline: nasty, top_issues: [], unresolved: [], themes: [] },
    manifest: { design_document: nasty, finished_at: 'now', mode: 'stub', models: [] },
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('a pipe in a finding title does not break the markdown table', () => {
  const agg = {
    findings: [{
      id: 'a-F1', reviewer: 'a', title: 'a | b', severity: 'MAJOR', round1_severity: 'MAJOR',
      outcome: 'HELD', support_count: 0, contest_count: 0, severity_change: 'UNCHANGED',
    }],
    counts: {
      total: 1, reviewers: 1, by_severity: { BLOCKING: 0, MAJOR: 1, MINOR: 0 },
      by_round1_severity: { BLOCKING: 0, MAJOR: 1, MINOR: 0 },
      by_outcome: { STRENGTHENED: 0, HELD: 1, CONTESTED: 0, WEAKENED: 0 },
      cross_examination_responses: 0, conflicts_raised: 0,
    },
  };
  const md = renderSynthesisMd(
    { headline: 'h', top_issues: [], unresolved: [], themes: [] }, agg,
    { design_document: 'doc' });
  const row = md.split('\n').find((l) => l.includes('a-F1'));
  assert.match(row, /a \\\| b/);
});

test('board arguments parse the same way the crew\'s do', () => {
  assert.equal(parseArgs(['--stub']).mode, 'stub');
  assert.deepEqual(parseArgs(['--reuse', 'moderator, systems-designer.round2']).reuse,
    ['moderator', 'systems-designer.round2']);
  assert.equal(parseArgs(['--gdd', 'other.txt']).gdd, 'other.txt');
});

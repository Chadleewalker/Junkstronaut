'use strict';
// The orchestrator's deterministic parts: argument parsing, the bug reports the audit
// routing produces, and the audit renderer.
//
// The routing is the crew's whole architecture in one function. A failing check names the
// agent whose artifact it is about, and `bugReport` is what that agent actually receives.
// Get the audience wrong and the finding reaches somebody who cannot act on it; get the
// content wrong — hand over a value instead of a rule — and the auditor has stopped being a
// check and started being the designer.

const test = require('node:test');
const assert = require('node:assert');

const { parseArgs, bugReport, concernReport, renderAudit } = require('../run-crew');

const CHECK = {
  rule_id: 'fragile_share_rises_by_band',
  gdd_ref: '2.3.7',
  statement: 'Fragile spawn share rises across the bands.',
  evidence: 'suborbital 0.31, low 0.22, high 0.19 — falling, not rising.',
  fix_hint: 'Lower the fragile spawn weights in the suborbital band.',
  owner: 'debris-designer',
};

// ---------------------------------------------------------------- arguments

test('the default run is live and writes to the default output directory', () => {
  assert.deepEqual(parseArgs([]),
    { mode: 'live', record: false, out: null, gdd: null, reuse: [] });
});

test('flags parse', () => {
  assert.equal(parseArgs(['--stub']).mode, 'stub');
  assert.equal(parseArgs(['--record']).record, true);
  assert.equal(parseArgs(['--out', 'somewhere']).out, 'somewhere');
  assert.equal(parseArgs(['--gdd', 'other.txt']).gdd, 'other.txt');
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
});

test('--reuse takes labels, so a revision is addressable on its own', () => {
  // Matching the charter name instead of the label is what broke this before: --reuse
  // debris-designer sent every revision hunting for its own fixture, found none, and killed
  // the run three attempts later. Labels are also what makes resuming a dead run possible.
  assert.deepEqual(parseArgs(['--reuse', 'researcher,economy-balancer.rev1']).reuse,
    ['researcher', 'economy-balancer.rev1']);
  assert.deepEqual(parseArgs(['--reuse', ' researcher , debris-designer.rev2 ']).reuse,
    ['researcher', 'debris-designer.rev2']);
  assert.deepEqual(parseArgs(['--reuse', 'researcher,,']).reuse, ['researcher']);
});

test('flags compose', () => {
  const a = parseArgs(['--stub', '--out', 'tmp', '--reuse', 'researcher']);
  assert.equal(a.mode, 'stub');
  assert.equal(a.out, 'tmp');
  assert.deepEqual(a.reuse, ['researcher']);
});

// ---------------------------------------------------------------- the bug report

test('a bug report carries the rule, the reference and the evidence', () => {
  const body = bugReport([CHECK], 'debris-designer');
  assert.match(body, /\[fragile_share_rises_by_band\]/);
  assert.match(body, /GDD 2\.3\.7/);
  assert.match(body, /Fragile spawn share rises across the bands\./);
  assert.match(body, /What the audit found: suborbital 0\.31/);
  assert.match(body, /Suggested direction: Lower the fragile spawn weights/);
});

test('the Designer is told the data is theirs and nobody else may touch it', () => {
  // The single-edge version of this loop is how the Balancer ended up writing a corrected
  // copy of the catalog inside its own output. This sentence is the fix.
  const body = bugReport([CHECK], 'debris-designer');
  assert.match(body, /no other agent is allowed to edit that data/);
  assert.match(body, /Keep every id stable/);
  assert.doesNotMatch(body, /Change only what these findings implicate/);
});

test('the Balancer is told to touch only what the findings implicate', () => {
  const body = bugReport([{ ...CHECK, owner: 'economy-balancer' }], 'economy-balancer');
  assert.match(body, /Change only what these findings implicate/);
  assert.match(body, /uninterpretable/);
  assert.doesNotMatch(body, /no other agent is allowed to edit that data/);
});

test('a check with no fix hint omits the line rather than printing an empty one', () => {
  const body = bugReport([{ ...CHECK, fix_hint: '' }], 'economy-balancer');
  assert.doesNotMatch(body, /Suggested direction/);
});

test('findings are numbered so a revision can answer them one at a time', () => {
  const body = bugReport([CHECK, { ...CHECK, rule_id: 'second_rule' }], 'economy-balancer');
  assert.match(body, /1\. \[fragile_share_rises_by_band\]/);
  assert.match(body, /2\. \[second_rule\]/);
});

test('every bug report says the audit checked the document, not anyone\'s reasoning', () => {
  for (const audience of ['debris-designer', 'economy-balancer']) {
    assert.match(bugReport([CHECK], audience),
      /against the design document, not against anyone's reasoning/);
  }
});

// ---------------------------------------------------------------- catalog concerns

test('a concern is routed as a concern, not as an audit failure', () => {
  // The Balancer's channel for "this is wrong and it is not mine to fix". It must not read
  // as a finding, because the Designer is allowed to disagree with it.
  const body = concernReport(['docking_collar at 555 kg is close to the floor.']);
  assert.match(body, /They are not audit failures/);
  assert.match(body, /Address the ones you agree with/);
  assert.match(body, /If you think one is mistaken, say so in design_notes/);
  assert.match(body, /1\. docking_collar at 555 kg/);
});

// ---------------------------------------------------------------- the rendered audit

test('the rendered report leads with the verdict and the summary', () => {
  const md = renderAudit({
    verdict: 'fail', summary: 'One rule did not hold.',
    checks: [{ ...CHECK, result: 'fail' }],
  });
  assert.match(md, /\*\*Verdict: FAIL\*\*/);
  assert.match(md, /One rule did not hold\./);
  assert.match(md, /\*\*FAIL\*\*/);
  assert.match(md, /## Failing checks in detail/);
});

test('a pipe in the evidence does not break the table it is printed in', () => {
  // Evidence is arithmetic written by a model. It contains whatever it contains.
  const md = renderAudit({
    verdict: 'pass', summary: 'ok',
    checks: [{ ...CHECK, result: 'pass', evidence: 'a | b\nsecond line' }],
  });
  const row = md.split('\n').find((l) => l.includes('fragile_share_rises_by_band'));
  assert.match(row, /a \\\| b second line/);
  assert.equal(row.split(/(?<!\\)\|/).length - 1, 5, 'the row should have exactly 5 cell walls');
});

test('a passing audit prints no failure section', () => {
  const md = renderAudit({
    verdict: 'pass', summary: 'All good.',
    checks: [{ ...CHECK, result: 'pass' }],
  });
  assert.doesNotMatch(md, /## Failing checks in detail/);
});

test('observations are rendered as advisory and never as failures', () => {
  const md = renderAudit({
    verdict: 'pass', summary: 'ok', checks: [{ ...CHECK, result: 'pass' }],
    observations: ['The 100-heat bar appears to be decorative.'],
  });
  assert.match(md, /## Observations/);
  assert.match(md, /These never fail the audit/);
  assert.match(md, /- The 100-heat bar appears to be decorative\./);
});

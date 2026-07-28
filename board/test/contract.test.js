'use strict';
// Contract specialisation — the mechanism that turns "nothing here is the moderator's own
// critique" from a sentence at the top of a document into something that cannot be violated.
//
// The board's whole authority rests on traceability: every claim in the synthesis is one a
// reviewer actually made, and a reader can check that rather than trust it. These tests
// exercise the enforcement, not the promise.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { validate } = require('../../crew/lib/schema');
const {
  reviewSchemaFor, crossExamSchemaFor, synthesisSchemaFor, danglingCitations,
} = require('../lib/contract');

const schema = (n) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'schemas', `${n}.schema.json`), 'utf8'));

const IDS = ['systems-designer-F1', 'systems-designer-F2', 'adversarial-qa-F1'];

// ---------------------------------------------------------------- reviewer ids

test('a reviewer can only file findings under its own slug', () => {
  const s = reviewSchemaFor(schema('review'), 'adversarial-qa');
  const mine = { id: 'adversarial-qa-F1', title: 'A finding with a title', severity: 'MAJOR',
    problem: 'x'.repeat(90), where: ['§2'], why_it_matters: 'y'.repeat(50) };
  assert.deepEqual(validate(mine, s.properties.findings.items), []);

  const theirs = { ...mine, id: 'systems-designer-F1' };
  const errs = validate(theirs, s.properties.findings.items);
  assert.ok(errs.some((e) => /does not match/.test(e)),
    'a finding filed under another reviewer\'s slug must be rejected');
});

test('the agent field is pinned to the reviewer being called', () => {
  const s = reviewSchemaFor(schema('review'), 'narrative-critic');
  assert.equal(s.properties.agent.const, 'narrative-critic');
  assert.equal(s.properties.agent.pattern, undefined,
    'the loose pattern must be removed, or const and pattern fight');
});

test('specialising does not mutate the schema on disk', () => {
  const original = schema('review');
  const before = JSON.stringify(original);
  reviewSchemaFor(original, 'feasibility-lead');
  assert.equal(JSON.stringify(original), before);
});

// ---------------------------------------------------------------- cross-examination

test('a reviewer may take positions only on other people\'s findings', () => {
  const own = ['systems-designer-F1', 'systems-designer-F2'];
  const s = crossExamSchemaFor(schema('cross-exam'), 'systems-designer', IDS, own);
  const item = s.properties.responses.items;

  assert.deepEqual(validate(
    { finding_id: 'adversarial-qa-F1', position: 'contests', reason: 'r'.repeat(50) }, item), []);

  const selfVote = validate(
    { finding_id: 'systems-designer-F1', position: 'supports', reason: 'r'.repeat(50) }, item);
  assert.ok(selfVote.some((e) => /is not one of/.test(e)),
    'voting for your own finding must not be expressible');
});

test('a reviewer may revise only its own severities', () => {
  const own = ['systems-designer-F1'];
  const s = crossExamSchemaFor(schema('cross-exam'), 'systems-designer', IDS, own);
  const item = s.properties.revisions.items;

  assert.deepEqual(validate(
    { finding_id: 'systems-designer-F1', severity: 'BLOCKING', why: 'w'.repeat(50) }, item), []);

  const foreign = validate(
    { finding_id: 'adversarial-qa-F1', severity: 'MINOR', why: 'w'.repeat(50) }, item);
  assert.ok(foreign.some((e) => /is not one of/.test(e)),
    'restating somebody else\'s severity is how a board becomes whoever spoke last');
});

test('an invented finding id fails the contract rather than dangling', () => {
  const s = crossExamSchemaFor(schema('cross-exam'), 'narrative-critic', IDS, []);
  const errs = validate(
    { finding_id: 'narrative-critic-F9', position: 'supports', reason: 'r'.repeat(50) },
    s.properties.responses.items);
  assert.ok(errs.length > 0);
});

// ---------------------------------------------------------------- the synthesis

test('the moderator may cite only findings that exist — everywhere it can cite', () => {
  const s = synthesisSchemaFor(schema('synthesis'), IDS);
  const paths = [
    s.properties.top_issues.items.properties.finding_ids.items,
    s.properties.themes.items.properties.finding_ids.items,
    s.properties.unresolved.items.properties.positions.items.properties.finding_ids.items,
  ];
  // Every place a citation can appear must be constrained. One unguarded path is a hole
  // through which an untraceable claim reaches the report.
  for (const p of paths) {
    assert.deepEqual(p.enum, IDS);
    assert.deepEqual(validate('made-up-F7', p).length > 0, true);
  }
});

test('a synthesis citing a real finding validates', () => {
  const s = synthesisSchemaFor(schema('synthesis'), IDS);
  const issue = {
    rank: 1, title: 'A top issue with a title', finding_ids: ['adversarial-qa-F1'],
    summary: 's'.repeat(110), why_ranked_here: 'w'.repeat(50),
  };
  assert.deepEqual(validate(issue, s.properties.top_issues.items), []);
});

// ---------------------------------------------------------------- the belt-and-braces check

test('danglingCitations sweeps every citation site', () => {
  const synthesis = {
    top_issues: [{ finding_ids: ['systems-designer-F1', 'ghost-F1'] }],
    themes: [{ finding_ids: ['adversarial-qa-F1'] }],
    unresolved: [{ positions: [{ finding_ids: ['phantom-F2'] }, { finding_ids: [] }] }],
  };
  assert.deepEqual(danglingCitations(synthesis, IDS), ['ghost-F1', 'phantom-F2']);
});

test('a fully traceable synthesis reports nothing dangling', () => {
  assert.deepEqual(danglingCitations({
    top_issues: [{ finding_ids: IDS }],
    themes: [{ finding_ids: [IDS[0]] }],
    unresolved: [],
  }, IDS), []);
});

test('danglingCitations tolerates a synthesis with sections missing', () => {
  assert.deepEqual(danglingCitations({}, IDS), []);
});

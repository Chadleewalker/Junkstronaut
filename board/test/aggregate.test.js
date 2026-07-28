'use strict';
// The tally.
//
// In the board this replaces, each finding's cross-examination outcome was asserted by the
// moderator in prose — the outcome and the account of the outcome came from the same agent,
// so nothing could check it. Here the reviewers vote and code counts, which means the
// synthesis can be wrong about emphasis but not about arithmetic. These tests are what make
// that claim true.

const test = require('node:test');
const assert = require('node:assert');

const { aggregate, moderatorDigest, outcomeFor } = require('../lib/aggregate');

const finding = (id, severity = 'MAJOR') => ({
  id, title: `title for ${id}`, severity,
  problem: 'p'.repeat(90), where: ['§1'], why_it_matters: 'w'.repeat(50),
});

const review = (agent, ids, severities = {}) => ({
  agent, lens: 'l'.repeat(50),
  findings: ids.map((id) => finding(id, severities[id] || 'MAJOR')),
});

const resp = (finding_id, position) => ({ finding_id, position, reason: 'r'.repeat(50) });

// ---------------------------------------------------------------- the rule itself

test('outcomeFor is written out rather than folded into a score', () => {
  assert.equal(outcomeFor(2, 0), 'STRENGTHENED');   // two lenses agree, nobody argues
  assert.equal(outcomeFor(5, 0), 'STRENGTHENED');
  assert.equal(outcomeFor(0, 0), 'HELD');           // nobody piled on either way
  assert.equal(outcomeFor(1, 0), 'HELD');           // one voice is not corroboration
  assert.equal(outcomeFor(3, 1), 'CONTESTED');      // argued over, support leads
  assert.equal(outcomeFor(1, 1), 'WEAKENED');       // a tie goes to the objection
  assert.equal(outcomeFor(0, 2), 'WEAKENED');
});

// ---------------------------------------------------------------- counting votes

test('supports and contests are tallied per finding', () => {
  const reviews = [review('a', ['a-F1']), review('b', ['b-F1']), review('c', ['c-F1'])];
  const agg = aggregate(reviews, [
    { agent: 'b', responses: [resp('a-F1', 'supports')], revisions: [] },
    { agent: 'c', responses: [resp('a-F1', 'supports')], revisions: [] },
  ]);
  const f = agg.findings.find((x) => x.id === 'a-F1');
  assert.equal(f.support_count, 2);
  assert.equal(f.contest_count, 0);
  assert.equal(f.outcome, 'STRENGTHENED');
  assert.deepEqual(f.supports.map((s) => s.reviewer), ['b', 'c']);
});

test('a reviewer cannot vote for its own finding, and the attempt is recorded', () => {
  // The schema enum makes this unreachable in a real run. If a contract is ever loosened,
  // the vote is discarded loudly rather than quietly inflating a tally nobody can trace.
  const agg = aggregate([review('a', ['a-F1'])], [
    { agent: 'a', responses: [resp('a-F1', 'supports')], revisions: [] },
  ]);
  assert.equal(agg.findings[0].support_count, 0);
  assert.deepEqual(agg.dropped_revisions, [{ kind: 'self-vote', by: 'a', finding_id: 'a-F1' }]);
});

test('a vote on a finding nobody raised is discarded, not counted', () => {
  const agg = aggregate([review('a', ['a-F1'])], [
    { agent: 'b', responses: [resp('ghost-F1', 'supports')], revisions: [] },
  ]);
  assert.equal(agg.counts.total, 1);
  assert.equal(agg.dropped_revisions[0].kind, 'response');
});

test('neutral is counted as neither, which is what makes silence free', () => {
  const agg = aggregate([review('a', ['a-F1']), review('b', ['b-F1'])], [
    { agent: 'b', responses: [resp('a-F1', 'neutral')], revisions: [] },
  ]);
  const f = agg.findings.find((x) => x.id === 'a-F1');
  assert.equal(f.support_count, 0);
  assert.equal(f.contest_count, 0);
  assert.equal(f.outcome, 'HELD');
});

// ---------------------------------------------------------------- revisions

test('a reviewer may raise the severity of its own finding', () => {
  const agg = aggregate([review('a', ['a-F1'], { 'a-F1': 'MAJOR' })], [
    { agent: 'a', responses: [], revisions: [{ finding_id: 'a-F1', severity: 'BLOCKING', why: 'w'.repeat(50) }] },
  ]);
  const f = agg.findings[0];
  assert.equal(f.severity, 'BLOCKING');
  assert.equal(f.round1_severity, 'MAJOR');
  assert.equal(f.severity_change, 'UPGRADED');
  assert.equal(f.revision.from, 'MAJOR');
});

test('a reviewer may not revise somebody else\'s severity', () => {
  const agg = aggregate([review('a', ['a-F1']), review('b', ['b-F1'])], [
    { agent: 'b', responses: [], revisions: [{ finding_id: 'a-F1', severity: 'MINOR', why: 'w'.repeat(50) }] },
  ]);
  assert.equal(agg.findings.find((x) => x.id === 'a-F1').severity, 'MAJOR');
  assert.deepEqual(agg.dropped_revisions, [
    { kind: 'foreign-revision', by: 'b', finding_id: 'a-F1', owner: 'a' },
  ]);
});

test('lowering your own severity is recorded as a downgrade', () => {
  const agg = aggregate([review('a', ['a-F1'], { 'a-F1': 'BLOCKING' })], [
    { agent: 'a', responses: [], revisions: [{ finding_id: 'a-F1', severity: 'MINOR', why: 'w'.repeat(50) }] },
  ]);
  assert.equal(agg.findings[0].severity_change, 'DOWNGRADED');
});

// ---------------------------------------------------------------- the shape of the output

test('both severity distributions are reported, so the round-two effect is visible', () => {
  const agg = aggregate([review('a', ['a-F1'], { 'a-F1': 'MINOR' })], [
    { agent: 'a', responses: [], revisions: [{ finding_id: 'a-F1', severity: 'BLOCKING', why: 'w'.repeat(50) }] },
  ]);
  assert.equal(agg.counts.by_round1_severity.MINOR, 1);
  assert.equal(agg.counts.by_round1_severity.BLOCKING, 0);
  assert.equal(agg.counts.by_severity.BLOCKING, 1);
  assert.equal(agg.counts.severity_changes.UPGRADED, 1);
});

test('every severity and outcome key is present even at zero', () => {
  // A missing key renders as blank on the page; an explicit zero renders as zero.
  const agg = aggregate([review('a', ['a-F1'])], []);
  for (const k of ['BLOCKING', 'MAJOR', 'MINOR']) {
    assert.equal(typeof agg.counts.by_severity[k], 'number');
  }
  for (const k of ['STRENGTHENED', 'HELD', 'CONTESTED', 'WEAKENED']) {
    assert.equal(typeof agg.counts.by_outcome[k], 'number');
  }
});

test('findings sort most severe first, then most corroborated, then reproducibly by id', () => {
  const reviews = [
    review('a', ['a-F1', 'a-F2'], { 'a-F1': 'MINOR', 'a-F2': 'BLOCKING' }),
    review('b', ['b-F1', 'b-F2'], { 'b-F1': 'MINOR', 'b-F2': 'MINOR' }),
  ];
  const agg = aggregate(reviews, [
    { agent: 'b', responses: [resp('a-F1', 'supports')], revisions: [] },
  ]);
  assert.deepEqual(agg.findings.map((f) => f.id), ['a-F2', 'a-F1', 'b-F1', 'b-F2']);
});

test('a contest is recorded as a conflict with both parties named', () => {
  const agg = aggregate([review('a', ['a-F1']), review('b', ['b-F1'])], [
    { agent: 'b', responses: [resp('a-F1', 'contests')], revisions: [] },
  ]);
  assert.equal(agg.counts.conflicts_raised, 1);
  assert.equal(agg.conflicts[0].from, 'b');
  assert.equal(agg.conflicts[0].to, 'a');
  assert.equal(agg.conflicts[0].finding_id, 'a-F1');
});

// ---------------------------------------------------------------- the moderator's packet

test('the moderator is given the tally rather than asked to produce one', () => {
  const agg = aggregate([review('a', ['a-F1']), review('b', ['b-F1'])], [
    { agent: 'b', responses: [resp('a-F1', 'contests')], revisions: [] },
  ]);
  const d = moderatorDigest(agg);
  const f = d.findings.find((x) => x.id === 'a-F1');
  assert.equal(f.outcome, 'WEAKENED');
  assert.equal(f.contested_by[0].reviewer, 'b');
  assert.ok(f.reviewer, 'a finding without its author cannot be traced');
});

test('the moderator packet carries no vote counts it could restate as its own judgement', () => {
  // It gets the reasons and the computed outcome. Handing it raw tallies to re-derive would
  // invite it to disagree with arithmetic.
  const agg = aggregate([review('a', ['a-F1'])], []);
  const f = moderatorDigest(agg).findings[0];
  assert.equal(f.support_count, undefined);
  assert.equal(f.contest_count, undefined);
  assert.equal(f.outcome, 'HELD');
});

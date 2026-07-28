'use strict';
// What the board found, tallied.
//
// This is plain code with no model in it, and that is the point. In the board this replaces,
// the moderator asserted each finding's cross-examination outcome — "STRENGTHENED",
// "WEAKENED" — in prose, and nothing could check it, because the outcome and the account of
// the outcome came from the same agent. Here the reviewers vote and the code counts.
//
// The division is the same one the tuning crew runs on: deciding whether a finding survives
// contact with another lens takes reading it, so an agent does that. Adding up the votes is
// arithmetic, so code does it. The moderator is then handed the tally rather than asked to
// produce one, which means the synthesis can be wrong about emphasis but not about counts.

const SEVERITIES = ['BLOCKING', 'MAJOR', 'MINOR'];
const RANK = { BLOCKING: 0, MAJOR: 1, MINOR: 2 };

// How a vote count becomes an outcome. Written out rather than folded into a score, so a
// finding labelled CONTESTED says which way the votes actually went.
//
//   STRENGTHENED  two or more lenses independently back it and nobody argues
//   HELD          nobody argues, but nobody piled on either
//   CONTESTED     argued over, and support still leads
//   WEAKENED      the objections outnumber the support
//
// Note what is NOT here: a rule that drops a finding. A weakened finding stays in the
// report with its objections attached. The board's job is to hand a designer the argument,
// not to hold a vote and delete the loser.
function outcomeFor(supports, contests) {
  if (contests === 0) return supports >= 2 ? 'STRENGTHENED' : 'HELD';
  return supports > contests ? 'CONTESTED' : 'WEAKENED';
}

// -> { findings, counts, conflicts, by_reviewer, dropped_revisions }
function aggregate(reviews, crossExams) {
  const findings = new Map();
  for (const r of reviews) {
    for (const f of r.findings) {
      findings.set(f.id, {
        ...f,
        reviewer: r.agent,
        round1_severity: f.severity,
        severity: f.severity,
        supports: [],
        contests: [],
        neutral: [],
        revision: null,
      });
    }
  }

  const dropped = [];
  const conflicts = [];

  for (const x of crossExams) {
    for (const resp of x.responses || []) {
      const f = findings.get(resp.finding_id);
      // The schema enum should make this unreachable; if a contract is ever loosened, a
      // stray id is discarded loudly rather than counted into a tally nobody can trace.
      if (!f) { dropped.push({ kind: 'response', by: x.agent, finding_id: resp.finding_id }); continue; }
      if (f.reviewer === x.agent) { dropped.push({ kind: 'self-vote', by: x.agent, finding_id: resp.finding_id }); continue; }
      f[resp.position].push({ reviewer: x.agent, reason: resp.reason });
      if (resp.position === 'contests') {
        conflicts.push({ from: x.agent, to: f.reviewer, finding_id: f.id, reason: resp.reason });
      }
    }

    for (const rev of x.revisions || []) {
      const f = findings.get(rev.finding_id);
      if (!f) { dropped.push({ kind: 'revision', by: x.agent, finding_id: rev.finding_id }); continue; }
      // A reviewer may only revise its own findings. Letting one agent restate another's
      // severity is how a board turns into whoever spoke last.
      if (f.reviewer !== x.agent) {
        dropped.push({ kind: 'foreign-revision', by: x.agent, finding_id: rev.finding_id, owner: f.reviewer });
        continue;
      }
      f.severity = rev.severity;
      f.revision = { from: f.round1_severity, to: rev.severity, why: rev.why };
    }
  }

  const list = [...findings.values()].map((f) => ({
    ...f,
    support_count: f.supports.length,
    contest_count: f.contests.length,
    outcome: outcomeFor(f.supports.length, f.contests.length),
    severity_change: f.severity === f.round1_severity
      ? 'UNCHANGED'
      : (RANK[f.severity] < RANK[f.round1_severity] ? 'UPGRADED' : 'DOWNGRADED'),
  }));

  // Most severe first, then most corroborated, then by id so the order is reproducible.
  list.sort((a, b) =>
    RANK[a.severity] - RANK[b.severity] ||
    b.support_count - a.support_count ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tally = (key, values) => values.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, Object.fromEntries((key || []).map((k) => [k, 0])));

  return {
    findings: list,
    counts: {
      total: list.length,
      reviewers: reviews.length,
      by_severity: tally(SEVERITIES, list.map((f) => f.severity)),
      by_round1_severity: tally(SEVERITIES, list.map((f) => f.round1_severity)),
      by_outcome: tally(['STRENGTHENED', 'HELD', 'CONTESTED', 'WEAKENED'],
        list.map((f) => f.outcome)),
      severity_changes: tally(['UPGRADED', 'DOWNGRADED', 'UNCHANGED'],
        list.map((f) => f.severity_change)),
      cross_examination_responses: crossExams.reduce((n, x) => n + (x.responses || []).length, 0),
      conflicts_raised: conflicts.length,
    },
    by_reviewer: reviews.map((r) => ({
      agent: r.agent,
      lens: r.lens,
      findings: r.findings.length,
      blocking: list.filter((f) => f.reviewer === r.agent && f.severity === 'BLOCKING').length,
    })),
    conflicts,
    connections: crossExams.flatMap((x) =>
      (x.connections || []).map((c) => ({ ...c, raised_by: x.agent }))),
    dropped_revisions: dropped,
  };
}

// The digest handed to the moderator. The full finding set with every vote attached is large
// and mostly restates itself; what the moderator needs is each finding, what it is, and how
// the room reacted to it.
function moderatorDigest(agg) {
  return {
    counts: agg.counts,
    reviewers: agg.by_reviewer,
    findings: agg.findings.map((f) => ({
      id: f.id,
      reviewer: f.reviewer,
      title: f.title,
      severity: f.severity,
      round1_severity: f.round1_severity,
      outcome: f.outcome,
      problem: f.problem,
      where: f.where,
      why_it_matters: f.why_it_matters,
      supported_by: f.supports.map((s) => ({ reviewer: s.reviewer, reason: s.reason })),
      contested_by: f.contests.map((s) => ({ reviewer: s.reviewer, reason: s.reason })),
      revision: f.revision,
    })),
    connections: agg.connections,
  };
}

module.exports = { aggregate, moderatorDigest, outcomeFor, SEVERITIES };

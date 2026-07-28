#!/usr/bin/env node
'use strict';
// A stand-in for the whole board, for the end-to-end test.
//
// It reads the prompt on stdin, works out which agent it is being asked to be by looking at
// the charter it was handed, and returns a valid object for that role. That is enough to
// drive run-board.js from the first reviewer to the visualisation audit without a model, a
// network or a credential — which is the only way to test that the orchestration itself
// works rather than that one recorded run happened to.
//
// It deliberately produces AWKWARD data, not tidy data: a reviewer who contests more than it
// supports, a severity revised upward, a foreign revision that must be discarded, and a
// self-vote that must not be counted. Tidy fixtures pass orchestration bugs straight through.

const fs = require('fs');

let prompt = '';
try { prompt = fs.readFileSync(0, 'utf8'); } catch { prompt = ''; }

// Node's test discovery runs every .js under test/; with no prompt there is nothing to do.
if (!prompt.trim()) process.exit(0);

const envelope = (obj) => JSON.stringify({
  type: 'result',
  result: JSON.stringify(obj),
  modelUsage: { 'claude-opus-5': { outputTokens: 500 } },
});

const CHARTERS = [
  ['# Systems Designer', 'systems-designer'],
  ['# Adversarial QA', 'adversarial-qa'],
  ['# Player Psychologist', 'player-psychologist'],
  ['# Narrative Critic', 'narrative-critic'],
  ['# Technical Feasibility Lead', 'feasibility-lead'],
  ['# Production / Business Analyst', 'business-analyst'],
];

const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length) + '.');
const LONG = (s) => pad(s, 110);
const MED = (s) => pad(s, 50);

function reviewFor(slug) {
  const sev = slug === 'adversarial-qa' ? 'BLOCKING'
    : slug === 'narrative-critic' ? 'MINOR' : 'MAJOR';
  return {
    agent: slug,
    lens: MED(`What ${slug} judges, and what it deliberately leaves to the other five reviewers`),
    findings: [1, 2, 3].map((n) => ({
      id: `${slug}-F${n}`,
      title: `Finding ${n} raised by ${slug}`,
      severity: n === 1 ? sev : n === 2 ? 'MAJOR' : 'MINOR',
      problem: LONG(`The ${n}th problem ${slug} found, argued rather than asserted`),
      where: ['§2.3', 'the paragraph beginning "Every launch costs money"'],
      why_it_matters: MED(`What happens to the player or the build if finding ${n} is ignored`),
    })),
  };
}

// Round two. The ids come out of the packet in the prompt rather than being guessed, which
// is also what the real reviewers do.
function crossExamFor(slug) {
  const ids = [...new Set((prompt.match(/"id": "([a-z-]+-F\d+)"/g) || [])
    .map((m) => m.replace(/.*"([a-z-]+-F\d+)".*/, '$1')))];
  const own = ids.filter((id) => id.startsWith(`${slug}-F`));
  const others = ids.filter((id) => !id.startsWith(`${slug}-F`));

  // A spread of positions, weighted so at least one finding ends up STRENGTHENED and at
  // least one WEAKENED once the votes are counted.
  const responses = others.slice(0, 6).map((id, i) => ({
    finding_id: id,
    position: id.endsWith('-F3') ? 'contests' : (i % 4 === 3 ? 'neutral' : 'supports'),
    reason: MED(`What ${slug}'s lens adds to ${id}, or why it does not land`),
  }));

  const out = { agent: slug, responses, revisions: [] };

  // Exactly one reviewer revises its own severity upward, so the round-one and final
  // distributions differ and the page has something to show.
  if (slug === 'player-psychologist' && own.length) {
    out.revisions = [{
      finding_id: own[0],
      severity: 'BLOCKING',
      why: MED('Which other finding moved this, and in what direction'),
    }];
  }
  if (slug === 'systems-designer' && own.length >= 2) {
    out.connections = [{
      finding_ids: [own[0], others[0]].filter(Boolean),
      compound_risk: MED('Why these two are survivable apart and fatal together'),
    }];
  }
  return out;
}

function synthesis() {
  const ids = [...new Set((prompt.match(/"id": "([a-z-]+-F\d+)"/g) || [])
    .map((m) => m.replace(/.*"([a-z-]+-F\d+)".*/, '$1')))];
  const pick = (n) => ids.slice(n, n + 2);
  return {
    agent: 'moderator',
    headline: LONG('The state of this document in two or three sentences, and the single most important thing to do about it next'),
    top_issues: [1, 2, 3].map((rank) => ({
      rank,
      title: `The ${rank === 1 ? 'first' : rank === 2 ? 'second' : 'third'} thing to deal with`,
      finding_ids: pick((rank - 1) * 2),
      summary: LONG(`What issue ${rank} is, drawn only from the findings cited beside it`),
      why_ranked_here: MED(`Why issue ${rank} sits where it does`),
    })),
    unresolved: [{
      question: 'How severe is the onboarding gap, and what fix is affordable?',
      positions: [
        { reviewers: ['player-psychologist'], stance: MED('One side of the disagreement, stated fairly'), finding_ids: pick(0) },
        { reviewers: ['feasibility-lead'], stance: MED('The other side, stated equally fairly'), finding_ids: pick(2) },
      ],
      decision_needed: MED('What the design owner has to decide'),
    }],
    themes: [{
      theme: MED('A pattern across findings that no single reviewer named'),
      finding_ids: pick(1),
    }],
    what_the_document_does_well: [MED('Something the reviewers agreed was solid')],
  };
}

function vizAudit() {
  return {
    agent: 'viz-auditor',
    verdict: 'pass',
    checks: [
      'the total findings count in the headline tiles',
      'the blocking count against the finding list',
      'every finding attribution against the data',
      'the round-one severity distribution',
      'the top-issue citations against the synthesis',
    ].map((claim) => ({
      claim,
      result: 'pass',
      evidence: MED(`Recounted ${claim} by hand; the page and the data agree`),
    })),
    usability: [MED('Something about the page that is easy to misread')],
  };
}

const isRound2 = prompt.includes('This is round two');
const reviewer = CHARTERS.find(([marker]) => prompt.includes(marker));

if (prompt.includes('# Visualisation Auditor')) {
  console.log(envelope(vizAudit()));
} else if (prompt.includes('# Moderator')) {
  console.log(envelope(synthesis()));
} else if (reviewer) {
  console.log(envelope(isRound2 ? crossExamFor(reviewer[1]) : reviewFor(reviewer[1])));
} else {
  process.stderr.write('fake-board: could not tell which agent this prompt is for\n');
  process.exit(4);
}

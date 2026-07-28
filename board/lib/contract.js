'use strict';
// Specialising a contract before an agent is asked to satisfy it.
//
// The board's central invariant is that nothing in the synthesis is the moderator's own
// critique — every claim traces to a finding a reviewer actually raised. The observed way to
// state that is a sentence at the top of the document promising it. This module makes it a
// gate instead.
//
// The trick is that the ids are known before the call. So rather than checking citations
// afterwards and hoping, the orchestrator injects the real finding ids into a copy of the
// schema as an `enum`, and the existing validator rejects a citation of something nobody
// said — which retries the agent with the exact dangling id fed back in. No new machinery:
// the same schema gate that catches a missing field catches an invented source.
//
// Same idea for reviewer ids. A copy of the review schema is tightened so `id` must start
// with that reviewer's own slug, which is what makes a finding traceable to its author and
// stops one reviewer filing under another's name.

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

// Every finding id in one reviewer's output must begin with that reviewer's slug.
// -> a copy of the review schema, tightened for this reviewer.
function reviewSchemaFor(schema, slug) {
  const s = clone(schema);
  s.properties.agent.const = slug;
  delete s.properties.agent.pattern;
  s.properties.findings.items.properties.id.pattern = `^${slug}-F[1-9][0-9]?$`;
  s.properties.findings.items.properties.id.description =
    `Must be ${slug}-F1, ${slug}-F2, ... — your own slug, numbered from 1.`;
  return s;
}

// Responses may cite any finding; revisions may only cite this reviewer's own. Both become
// enums, so a hallucinated id is a schema error rather than a dangling pointer discovered
// three stages later.
function crossExamSchemaFor(schema, slug, allIds, ownIds) {
  const s = clone(schema);
  s.properties.agent.const = slug;
  delete s.properties.agent.pattern;

  // A reviewer takes positions on OTHER people's findings; its own are handled by revisions.
  const othersIds = allIds.filter((id) => !ownIds.includes(id));
  s.properties.responses.items.properties.finding_id.enum = othersIds;
  s.properties.revisions.items.properties.finding_id.enum = ownIds;
  if (s.properties.connections) {
    s.properties.connections.items.properties.finding_ids.items.enum = allIds;
  }
  return s;
}

// Every id the moderator cites, anywhere in the synthesis, must be a real finding.
function synthesisSchemaFor(schema, allIds) {
  const s = clone(schema);
  s.properties.top_issues.items.properties.finding_ids.items.enum = allIds;
  s.properties.themes.items.properties.finding_ids.items.enum = allIds;
  s.properties.unresolved.items.properties.positions.items
    .properties.finding_ids.items.enum = allIds;
  return s;
}

// Belt and braces. The enums above should make this impossible, but the check is cheap and
// the failure it guards against — a synthesis that cites a finding nobody raised — is the
// one thing this board promises cannot happen. Asserting it separately from the mechanism
// that enforces it is the difference between a claim and a check.
// -> array of ids cited but not raised; empty means the synthesis is fully traceable.
function danglingCitations(synthesis, allIds) {
  const known = new Set(allIds);
  const cited = new Set();
  const take = (ids) => { for (const id of ids || []) cited.add(id); };

  for (const t of synthesis.top_issues || []) take(t.finding_ids);
  for (const t of synthesis.themes || []) take(t.finding_ids);
  for (const u of synthesis.unresolved || []) {
    for (const p of u.positions || []) take(p.finding_ids);
  }
  return [...cited].filter((id) => !known.has(id)).sort();
}

module.exports = {
  reviewSchemaFor, crossExamSchemaFor, synthesisSchemaFor, danglingCitations,
};

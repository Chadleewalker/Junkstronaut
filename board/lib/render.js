'use strict';
// The board's report page, rendered deterministically from the aggregate JSON.
//
// No model runs here. In the board this replaces, the page itself was authored by an agent,
// which is why it needed auditing for invented numbers — and why the audit found one. Here
// every figure on the page is computed from the data, so the remaining risk is narrower:
// prose that states a number and goes stale, and a layout that misleads. Those are what the
// viz-auditor is pointed at, and it is given the finished HTML rather than this file, so it
// cannot check the page against the code that drew it.
//
// COLOUR. Two encodings, both deliberate:
//
//   * Severity is a STATUS encoding, so it uses the status palette (critical / serious /
//     warning) rather than categorical slots — a severity must never impersonate a series.
//     Status colours are documented as sub-3:1 on the light surface by design, and the
//     mitigation is that the colour never carries the meaning alone: every severity mark
//     ships the word beside it, every stacked segment is direct-labelled, and segments are
//     separated by a 2px surface gap. That matters here specifically because serious and
//     warning sit at normal-vision dE 13.6 — below the 15 floor — and they are adjacent in
//     the severity stack. The label is what makes that legible, not the hue.
//   * Findings per reviewer is one measure across categories — magnitude, not identity — so
//     it is a single sequential hue, not six categorical ones. Painting six reviewers six
//     colours would imply the colour meant something.
//
// Dark mode is selected from the same ramps rather than flipped, and the viewer's theme
// toggle wins over the OS setting in both directions.

const SEVERITY_ORDER = ['BLOCKING', 'MAJOR', 'MINOR'];
const OUTCOME_ORDER = ['STRENGTHENED', 'HELD', 'CONTESTED', 'WEAKENED'];
const SEVERITY_GLYPH = { BLOCKING: '●', MAJOR: '◆', MINOR: '○' };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const pct = (n, total) => (total > 0 ? (n / total) * 100 : 0);

// ---------------------------------------------------------------- pieces

function statTile(value, label, note) {
  return `<div class="tile">
      <div class="tile-value">${esc(value)}</div>
      <div class="tile-label">${esc(label)}</div>
      ${note ? `<div class="tile-note">${esc(note)}</div>` : ''}
    </div>`;
}

// A stacked bar with every segment direct-labelled. The label is not decoration: it is what
// keeps the encoding readable when two adjacent status hues sit below the normal-vision
// separation floor.
function severityBar(counts, total, caption) {
  const segs = SEVERITY_ORDER
    .filter((s) => counts[s] > 0)
    .map((s) => `<div class="seg seg-${s.toLowerCase()}" style="flex:${counts[s]}"
        title="${esc(`${counts[s]} ${s}`)}"><span>${counts[s]}</span></div>`)
    .join('');
  const legend = SEVERITY_ORDER.map((s) =>
    `<span class="key"><i class="dot dot-${s.toLowerCase()}"></i>${s} <b>${counts[s] || 0}</b></span>`
  ).join('');
  return `<div class="barblock">
      <div class="barcaption">${esc(caption)}</div>
      <div class="stack">${segs}</div>
      <div class="keys">${legend}</div>
    </div>`;
}

function reviewerBars(byReviewer, findings) {
  const max = Math.max(1, ...byReviewer.map((r) => r.findings));
  return byReviewer.map((r) => {
    const blocking = findings.filter((f) => f.reviewer === r.agent && f.severity === 'BLOCKING').length;
    return `<div class="rrow">
        <div class="rname">${esc(r.agent)}</div>
        <div class="rtrack"><div class="rbar" style="width:${pct(r.findings, max)}%"></div></div>
        <div class="rval">${r.findings}${blocking ? ` <span class="rblock">${blocking} blocking</span>` : ''}</div>
      </div>`;
  }).join('');
}

function chip(id, findings) {
  const f = findings.find((x) => x.id === id);
  const title = f ? `${f.reviewer} — ${f.title}` : id;
  return `<a class="chip" href="#${esc(id)}" title="${esc(title)}">${esc(id)}</a>`;
}

function findingRow(f) {
  const votes = [];
  if (f.support_count) votes.push(`<span class="v-sup">+${f.support_count}</span>`);
  if (f.contest_count) votes.push(`<span class="v-con">&minus;${f.contest_count}</span>`);
  const revised = f.severity_change !== 'UNCHANGED'
    ? `<span class="revised">${esc(f.severity_change.toLowerCase())} from ${esc(f.round1_severity)}</span>` : '';

  const say = (list, kind) => list.length
    ? `<div class="votes ${kind}"><b>${kind === 'sup' ? 'Supported by' : 'Contested by'}</b>
        <ul>${list.map((s) => `<li><i>${esc(s.reviewer)}</i> ${esc(s.reason)}</li>`).join('')}</ul></div>`
    : '';

  return `<details class="finding" id="${esc(f.id)}" data-severity="${esc(f.severity)}"
      data-outcome="${esc(f.outcome)}" data-reviewer="${esc(f.reviewer)}">
    <summary>
      <span class="sev sev-${f.severity.toLowerCase()}">${SEVERITY_GLYPH[f.severity]} ${esc(f.severity)}</span>
      <span class="ftitle">${esc(f.title)}</span>
      <span class="fmeta">${esc(f.reviewer)} &middot; ${esc(f.id)} &middot;
        <span class="outcome">${esc(f.outcome)}</span> ${votes.join(' ')} ${revised}</span>
    </summary>
    <div class="fbody">
      <p>${esc(f.problem)}</p>
      <p class="where"><b>Where:</b> ${f.where.map((w) => `<code>${esc(w)}</code>`).join(' ')}</p>
      <p><b>Why it matters:</b> ${esc(f.why_it_matters)}</p>
      ${f.proposed_fix ? `<p><b>Proposed fix:</b> ${esc(f.proposed_fix)}</p>` : ''}
      ${f.revision ? `<p class="rev"><b>Revised ${esc(f.revision.from)} &rarr; ${esc(f.revision.to)}:</b> ${esc(f.revision.why)}</p>` : ''}
      ${say(f.supports, 'sup')}
      ${say(f.contests, 'con')}
    </div>
  </details>`;
}

// ---------------------------------------------------------------- the page

function renderBoard({ aggregate: agg, synthesis, manifest, vizAudit }) {
  const f = agg.findings;
  const c = agg.counts;

  const top = (synthesis.top_issues || []).slice().sort((a, b) => a.rank - b.rank).map((t) => `
    <article class="issue">
      <div class="issue-rank">${t.rank}</div>
      <div>
        <h3>${esc(t.title)}</h3>
        <div class="chips">${t.finding_ids.map((id) => chip(id, f)).join(' ')}</div>
        <p>${esc(t.summary)}</p>
        <p class="why"><b>Why ranked here:</b> ${esc(t.why_ranked_here)}</p>
      </div>
    </article>`).join('');

  const unresolved = (synthesis.unresolved || []).map((u) => `
    <article class="disagreement">
      <h3>${esc(u.question)}</h3>
      ${u.positions.map((p) => `<div class="position">
          <div class="who">${p.reviewers.map((r) => `<span class="who-tag">${esc(r)}</span>`).join(' ')}</div>
          <p>${esc(p.stance)}</p>
          <div class="chips">${(p.finding_ids || []).map((id) => chip(id, f)).join(' ')}</div>
        </div>`).join('')}
      <p class="decision"><b>Decision needed:</b> ${esc(u.decision_needed)}</p>
    </article>`).join('');

  const themes = (synthesis.themes || []).map((t) => `
    <li><p>${esc(t.theme)}</p><div class="chips">${t.finding_ids.map((id) => chip(id, f)).join(' ')}</div></li>`
  ).join('');

  const wellSection = (synthesis.what_the_document_does_well || []).length ? `
    <section>
      <h2>What the document does well</h2>
      <ul class="plain">${synthesis.what_the_document_does_well.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </section>` : '';

  const auditSection = vizAudit ? `
    <section>
      <h2>Visualisation audit</h2>
      <p class="lede">This page was checked against the data it was built from, by an agent
        that was given the finished page and the source JSON and not the renderer. The audit
        ran against everything above this heading, before this section existed &mdash; an
        auditor cannot check its own verdict, and pretending otherwise would be the same
        circularity this stage exists to avoid.
        Verdict: <b>${esc(vizAudit.verdict.toUpperCase())}</b> &mdash;
        ${vizAudit.checks.filter((x) => x.result === 'pass').length}/${vizAudit.checks.length} checks passed.</p>
      <table class="audit">
        <thead><tr><th>Checked</th><th>Result</th><th>Evidence</th></tr></thead>
        <tbody>${vizAudit.checks.map((x) => `<tr class="${x.result}">
          <td>${esc(x.claim)}</td><td>${x.result === 'pass' ? 'pass' : '<b>FAIL</b>'}</td>
          <td>${esc(x.evidence)}</td></tr>`).join('')}</tbody>
      </table>
      ${(vizAudit.usability || []).length ? `<h3>Usability notes</h3>
        <ul class="plain">${vizAudit.usability.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
    </section>` : '';

  const conflicts = agg.conflicts.length ? `
    <section>
      <h2>Where the board argued</h2>
      <p class="lede">Every position a reviewer took against another's finding. These are the
        raw disagreements; the ones the board could not settle are escalated above.</p>
      <ul class="plain conflicts">
        ${agg.conflicts.map((x) => `<li><span class="who-tag">${esc(x.from)}</span>
          contests ${chip(x.finding_id, f)} <span class="who-tag">${esc(x.to)}</span>
          <p>${esc(x.reason)}</p></li>`).join('')}
      </ul>
    </section>` : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design review board — ${esc(manifest.design_document)}</title>
<style>
:root{
  color-scheme: light;
  --surface-1:#fcfcfb; --plane:#f9f9f7;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --rule:#c3c2b7; --border:rgba(11,11,11,0.10);
  --series-1:#2a78d6;
  --critical:#d03b3b; --serious:#ec835a; --warning:#fab219; --good:#0ca30c;
}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme="light"])){
    color-scheme: dark;
    --surface-1:#1a1a19; --plane:#0d0d0d;
    --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --rule:#383835; --border:rgba(255,255,255,0.10);
    --series-1:#3987e5;
  }
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --surface-1:#1a1a19; --plane:#0d0d0d;
  --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --rule:#383835; --border:rgba(255,255,255,0.10);
  --series-1:#3987e5;
}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;}
.wrap{max-width:1060px;margin:0 auto;padding:32px 20px 72px}
header{border-bottom:1px solid var(--rule);padding-bottom:20px;margin-bottom:28px}
h1{font-size:26px;margin:0 0 6px}
.sub{color:var(--ink-2);margin:0}
.meta{color:var(--muted);font-size:13px;margin-top:10px}
h2{font-size:19px;margin:38px 0 6px;padding-top:22px;border-top:1px solid var(--grid)}
h3{font-size:16px;margin:0 0 6px}
.lede{color:var(--ink-2);margin:0 0 16px}
section:first-of-type h2{border-top:0;padding-top:0}

.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:20px 0 8px}
.tile{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.tile-value{font-size:32px;font-weight:600;letter-spacing:-0.02em}
.tile-label{font-size:13px;color:var(--ink-2);margin-top:2px}
.tile-note{font-size:12px;color:var(--muted);margin-top:4px}

.barblock{margin:18px 0}
.barcaption{font-size:13px;color:var(--ink-2);margin-bottom:6px}
.stack{display:flex;gap:2px;height:30px}
.seg{display:flex;align-items:center;justify-content:center;min-width:26px;
  border-radius:4px;color:#0b0b0b;font-size:12px;font-weight:600}
.seg-blocking{background:var(--critical);color:#fff}
.seg-major{background:var(--serious)}
.seg-minor{background:var(--warning)}
.keys{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--ink-2)}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:baseline}
.dot-blocking{background:var(--critical)} .dot-major{background:var(--serious)} .dot-minor{background:var(--warning)}

.rrow{display:grid;grid-template-columns:170px 1fr 130px;gap:12px;align-items:center;margin:6px 0;font-size:13px}
.rname{color:var(--ink-2)}
.rtrack{background:var(--grid);border-radius:4px;height:14px}
.rbar{background:var(--series-1);height:14px;border-radius:4px}
.rval{color:var(--ink-2);font-variant-numeric:tabular-nums}
.rblock{color:var(--critical);font-weight:600}

.issue{display:grid;grid-template-columns:44px 1fr;gap:14px;background:var(--surface-1);
  border:1px solid var(--border);border-radius:10px;padding:16px;margin:12px 0}
.issue-rank{font-size:26px;font-weight:600;color:var(--muted);text-align:center}
.why{color:var(--ink-2);font-size:14px}
.chips{margin:6px 0}
.chip{display:inline-block;font-size:11px;font-family:ui-monospace,monospace;
  border:1px solid var(--border);border-radius:20px;padding:2px 9px;margin:2px 4px 2px 0;
  color:var(--ink-2);text-decoration:none;background:var(--plane)}
.chip:hover{border-color:var(--series-1);color:var(--series-1)}

.disagreement{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;
  padding:16px;margin:12px 0}
.position{border-left:3px solid var(--grid);padding-left:14px;margin:12px 0}
.who-tag{display:inline-block;font-size:11px;background:var(--plane);border:1px solid var(--border);
  border-radius:4px;padding:1px 7px;color:var(--ink-2)}
.decision{background:var(--plane);border-radius:8px;padding:10px 12px;font-size:14px}

.filters{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 10px}
.filters button{font:inherit;font-size:13px;background:var(--surface-1);color:var(--ink-2);
  border:1px solid var(--border);border-radius:20px;padding:4px 13px;cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--series-1);border-color:var(--series-1);color:#fff}

.finding{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;
  padding:10px 14px;margin:8px 0}
.finding summary{cursor:pointer;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:baseline}
.finding summary::-webkit-details-marker{display:none}
.sev{font-size:11px;font-weight:700;letter-spacing:0.04em;white-space:nowrap}
.sev-blocking{color:var(--critical)} .sev-major{color:var(--serious)} .sev-minor{color:var(--warning)}
:root:where(:not([data-theme="dark"])) .sev-minor{color:#8a6200}
:root:where(:not([data-theme="dark"])) .sev-major{color:#b8552c}
.ftitle{font-weight:600}
.fmeta{grid-column:2;font-size:12px;color:var(--muted)}
.outcome{color:var(--ink-2);font-weight:600}
.v-sup{color:var(--good);font-weight:600} .v-con{color:var(--critical);font-weight:600}
.revised{color:var(--ink-2);font-style:italic}
.fbody{padding:8px 0 4px;font-size:14px;border-top:1px solid var(--grid);margin-top:10px}
.fbody p{margin:8px 0}
.where code{background:var(--plane);border:1px solid var(--border);border-radius:4px;padding:1px 5px;font-size:12px}
.votes{margin-top:10px;font-size:13px;color:var(--ink-2)}
.votes ul{margin:4px 0 0;padding-left:18px} .votes li{margin:4px 0}
.votes i{font-style:normal;font-weight:600;color:var(--ink)}
.rev{color:var(--ink-2)}

table.audit{width:100%;border-collapse:collapse;font-size:13px;display:block;overflow-x:auto}
table.audit th,table.audit td{border-bottom:1px solid var(--grid);padding:7px 9px;text-align:left;vertical-align:top}
table.audit tr.fail td{background:color-mix(in srgb,var(--critical) 8%,transparent)}
ul.plain{padding-left:18px} ul.plain li{margin:8px 0}
.conflicts p{margin:4px 0 0;color:var(--ink-2);font-size:13px}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--grid);color:var(--muted);font-size:12px}
</style>
</head><body>
<div class="wrap">
<header>
  <h1>Design review board</h1>
  <p class="sub">${esc(manifest.design_document)} &mdash; six specialist reviewers, cross-examined, then synthesised.</p>
  <p class="meta">${esc(manifest.finished_at)} &middot; ${esc(manifest.mode)} &middot;
    ${esc((manifest.models || []).join(', ') || 'model not recorded')} &middot;
    every claim below traces to a numbered finding, and that is enforced by the output contract rather than promised</p>
</header>

<section>
  <h2>Headline</h2>
  <p class="lede">${esc(synthesis.headline)}</p>
  <div class="tiles">
    ${statTile(c.total, 'findings', `from ${c.reviewers} reviewers`)}
    ${statTile(c.by_severity.BLOCKING || 0, 'blocking', `${c.by_round1_severity.BLOCKING || 0} before cross-examination`)}
    ${statTile(c.by_outcome.STRENGTHENED || 0, 'strengthened', 'backed by two or more other lenses')}
    ${statTile((synthesis.unresolved || []).length, 'unresolved', 'escalated, not averaged')}
    ${statTile(c.conflicts_raised, 'conflicts raised', `across ${c.cross_examination_responses} responses`)}
  </div>
  ${severityBar(c.by_round1_severity, c.total, 'Severity after round one — each reviewer alone')}
  ${severityBar(c.by_severity, c.total, 'Severity after cross-examination — reviewers may revise only their own')}
</section>

<section>
  <h2>Findings per reviewer</h2>
  <p class="lede">One measure across six lenses, so one colour. A tall bar is not a better
    reviewer &mdash; the lenses differ in how much of the document they can see.</p>
  ${reviewerBars(agg.by_reviewer, f)}
</section>

<section>
  <h2>Top issues</h2>
  <p class="lede">Ranked by severity times confidence, where confidence rises when lenses that
    could not have coordinated reached the same passage independently.</p>
  ${top}
</section>

${unresolved ? `<section>
  <h2>Unresolved disagreements</h2>
  <p class="lede">The board could not settle these, and did not try to. Two competent lenses
    disagreeing is a map of where the judgement call is; averaging it would hide it.</p>
  ${unresolved}
</section>` : ''}

${themes ? `<section>
  <h2>Themes</h2>
  <p class="lede">Patterns no single reviewer could see, because each had one lens.</p>
  <ul class="plain">${themes}</ul>
</section>` : ''}

${wellSection}

<section>
  <h2>All findings</h2>
  <p class="lede">${c.total} findings, most severe first. Open one to see its evidence and
    what the other reviewers said about it.</p>
  <div class="filters" id="filters">
    <button data-filter="all" aria-pressed="true">All ${c.total}</button>
    ${SEVERITY_ORDER.map((s) => `<button data-filter="severity:${s}" aria-pressed="false">${s} ${c.by_severity[s] || 0}</button>`).join('')}
    ${OUTCOME_ORDER.map((s) => `<button data-filter="outcome:${s}" aria-pressed="false">${s} ${c.by_outcome[s] || 0}</button>`).join('')}
  </div>
  <div id="findings">${f.map(findingRow).join('')}</div>
</section>

${conflicts}
${auditSection}

<footer>
  Generated by <code>board/run-board.js</code>. The page is rendered from
  <code>out/aggregate.json</code> by code, not by a model &mdash; the numbers on it are
  computed, and the cross-examination outcomes are tallied from the reviewers' votes rather
  than asserted by anyone.
</footer>
</div>
<script>
(function(){
  var bar=document.getElementById('filters'), items=document.getElementById('findings');
  if(!bar||!items) return;
  bar.addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    [].forEach.call(bar.querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',String(x===b));});
    var q=b.dataset.filter, parts=q.split(':');
    [].forEach.call(items.children,function(el){
      el.style.display=(q==='all'||el.dataset[parts[0]]===parts[1])?'':'none';
    });
  });
})();
</script>
</body></html>
`;
}

module.exports = { renderBoard, esc };

#!/usr/bin/env node
'use strict';
// Fly the whole game against one candidate config, and write a page you can look at.
//
// Everything measured so far has been one question at a time. This assembles the answers
// into a single parameter set and asks the only question that matters: does the game work
// end to end, from the first launch to Armstrong's satellite?
//
// The candidate:
//   * heat capacity 235             — the bar the satellite cannot plunge under
//   * commit floor 8,000 m          — the player may not commit to an entry above this
//   * ascent exempt from the 3x     — already in sim.js, a phase rule not a parameter
//
// Writes out/report/tuning-candidate.html. It does NOT touch dashboard.html, which is the
// record of the last crew run.

const fs = require('fs');
const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const BASE = require(path.join(CREW, 'out/params/baseline.json'));
const P0 = require(path.join(CREW, 'out/config/game_params.json'));
const catalog = require('./legacy-catalog').migrate(
  require(path.join(CREW, 'out/data/debris_catalog.json')), BASE);

const CAPACITY = Number(process.env.CAPACITY) || 235;
const COMMIT_FLOOR = Number(process.env.COMMIT_FLOOR) || 8000;

const PARAMS = JSON.parse(JSON.stringify(P0));
PARAMS.reentry.heat_capacity = CAPACITY;

const bandAlt = (n) => {
  const b = BASE.bands.find((x) => x.name === n);
  return (b.altitude_min_m + b.altitude_max_m) / 2;
};
const FLOOR = BASE.bands.find((b) => b.name === 'suborbital').altitude_min_m;
const TOP = bandAlt('high');
const SAT = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const HOLD = fullHoldMass(catalog, PARAMS).fullHold;

const upv = (part, tier) => {
  const u = PARAMS.upgrades.find((x) => x.part === part && x.tier === tier);
  return u ? u.value : null;
};

function rig(fuel, thrust) {
  const p = JSON.parse(JSON.stringify(PARAMS));
  if (fuel) p.flight.fuel_capacity_kg = fuel;
  if (thrust) p.flight.thrust_n = thrust;
  const { world, cfg } = sim.buildConfig(BASE, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt('suborbital'));
  return { world, cfg };
}

// Coolest legal descent: entry pinned at the commit floor (the shallowest the rule allows,
// which is also the coolest), skim altitude searched.
function coolest(world, cfg, cargoMass, startAlt, skims, floor) {
  let best = Infinity, at = null;
  const alts = skims === 0 ? [world.atmTop * 0.5]
    : Array.from({ length: 25 }, (_, j) => world.atmTop * (0.35 + 0.62 * (j / 24)));
  for (const sa of alts) {
    if (skims > 0 && sa <= floor) continue;
    try {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, sa, 0,
        { skims, entryPeriapsis: floor });
      // See probes/trajectories.js: a skim that lands never commits, so it evades the floor.
      // Only count descents that flew all their skims AND a committed entry.
      if (r.landed && r.passes.length >= skims + 1) {
        const p = Math.max(...r.passes.map((x) => x.peakHeat));
        if (p < best) { best = p; at = r; }
      }
    } catch (e) { /* that depth does not fly */ }
  }
  return { peak: best, run: at };
}

// ---------------------------------------------------------------- gather
const SHIPS = [
  { name: 'base', fuel: null, thrust: null },
  { name: 'tank 1', fuel: upv('fuel_tank', 1), thrust: null },
  { name: 'tank 1 + thruster 1', fuel: upv('fuel_tank', 1), thrust: upv('thruster', 1) },
  { name: 'tank 2 + thruster 1', fuel: upv('fuel_tank', 2), thrust: upv('thruster', 1) },
  { name: 'maxed', fuel: upv('fuel_tank', 2), thrust: upv('thruster', 2) },
];

const ascents = SHIPS.map((s) => {
  const { world, cfg } = rig(s.fuel, s.thrust);
  const arc = sim.simulateAscent(world, cfg, FLOOR * 1.15,
    { circularise: false, hangAltitude: FLOOR });
  const orb = sim.simulateAscent(world, cfg, FLOOR);
  return {
    ship: s.name,
    apex: arc.apoapsisAlt, eva: arc.timeAbove,
    fuelLeft: (arc.fuelRemaining / cfg.fuel) * 100,
    climbHeat: arc.peakHeat,
    orbit: orb.reached, orbitFuelLeft: orb.reached ? (orb.fuelRemaining / cfg.fuel) * 100 : null,
    maxSpeed: arc.maxSpeed_ms, maxQ: arc.maxQ_pa, maxQalt: arc.maxQ_alt_m,
    heatAlt: arc.peakHeat_alt_m,
  };
});

const { world, cfg } = rig(upv('fuel_tank', 2), upv('thruster', 2));
const LOADS = [
  { name: 'empty', mass: 0 },
  { name: 'half hold', mass: HOLD / 2 },
  { name: 'full hold', mass: HOLD },
  { name: SAT.display_name, mass: SAT.mass_kg },
];
const descents = LOADS.map((l) => {
  const p0 = coolest(world, cfg, l.mass, TOP, 0, COMMIT_FLOOR);
  const p1 = coolest(world, cfg, l.mass, TOP, 1, COMMIT_FLOOR);
  const p2 = coolest(world, cfg, l.mass, TOP, 2, COMMIT_FLOOR);
  return {
    load: l.name, mass: l.mass,
    plunge: p0.peak, skim1: p1.peak, skim2: p2.peak,
    touchdown: p1.run ? p1.run.touchdownSpeed : null,
    mustSkim: p0.peak > CAPACITY,
    survivable: Math.min(p0.peak, p1.peak, p2.peak) <= CAPACITY,
  };
});

// The peak-vs-entry curve for the satellite, which is the picture that explains the rule.
const curve = [];
for (let i = 0; i <= 40; i++) {
  const e = (i / 40) * world.atmTop * 0.999;
  try {
    const r = sim.simulateDescent(world, { ...cfg, cargoMass: SAT.mass_kg }, TOP, e, 0,
      { skims: 0, entryPeriapsis: e });
    if (r.landed && r.passes.length) {
      curve.push({ entry: e, peak: Math.max(...r.passes.map((x) => x.peakHeat)),
                   passes: r.passes.length });
    }
  } catch (err) { /* skip */ }
}

// The ascent trace for the profile chart.
const traceRig = rig(null, null);
const traced = sim.simulateAscent(traceRig.world, traceRig.cfg, FLOOR * 1.15,
  { circularise: false, hangAltitude: FLOOR, traceEvery: 2 });

// ---------------------------------------------------------------- gates
const base = ascents[0];
const sat = descents[3];
const empty = descents[0];
const full = descents[2];

const gates = [
  { id: 'first launch reaches the junk',
    pass: base.apex > FLOOR && base.eva > 30,
    detail: `apex ${base.apex.toFixed(0)} m against a floor of ${FLOOR.toFixed(0)} m, ` +
            `${base.eva.toFixed(0)} s of EVA window` },
  { id: 'first launch comes home with fuel',
    pass: base.fuelLeft > 15,
    detail: `${base.fuelLeft.toFixed(1)}% of the tank left after the arc` },
  { id: 'the climb survives itself',
    pass: base.climbHeat < CAPACITY,
    detail: `climb peaks at ${base.climbHeat.toFixed(1)} against a capacity of ${CAPACITY}` },
  { id: 'orbit is something upgrades buy',
    pass: !ascents[0].orbit || ascents[0].orbitFuelLeft < 5,
    detail: ascents[0].orbit
      ? `base ship circularises with only ${ascents[0].orbitFuelLeft.toFixed(1)}% left; ` +
        `tank 1 makes it ${ascents[1].orbitFuelLeft.toFixed(1)}%`
      : 'base ship cannot circularise at all' },
  { id: 'ordinary hauls may still plunge',
    pass: !empty.mustSkim && !full.mustSkim,
    detail: `empty plunges at ${empty.plunge.toFixed(1)}, full hold at ${full.plunge.toFixed(1)}, ` +
            `both under ${CAPACITY}` },
  { id: 'the endgame haul CANNOT plunge',
    pass: sat.mustSkim,
    detail: `${SAT.display_name} plunges at ${sat.plunge.toFixed(1)}, over ${CAPACITY}` },
  { id: 'the endgame haul comes home on a skim',
    pass: sat.skim1 <= CAPACITY,
    detail: `one skim brings it to ${sat.skim1.toFixed(1)}` },
  { id: 'greed costs something',
    pass: full.plunge > empty.plunge * 1.15,
    detail: `full hold ${full.plunge.toFixed(1)} against empty ${empty.plunge.toFixed(1)}, ` +
            `${((full.plunge / empty.plunge - 1) * 100).toFixed(0)}% hotter` },
];

const passed = gates.filter((g) => g.pass).length;

// ---------------------------------------------------------------- render
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f0 = (x) => (Number.isFinite(x) ? x.toFixed(0) : '—');

function lineChart(pts, xk, yk, opts) {
  const W = 640, H = 260, M = { l: 56, r: 20, t: 18, b: 40 };
  const xs = pts.map((p) => p[xk]), ys = pts.map((p) => p[yk]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = 0, y1 = Math.max(...ys) * 1.08;
  const px = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const py = (v) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[xk]).toFixed(1)},${py(p[yk]).toFixed(1)}`).join('');
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = y0 + f * (y1 - y0);
    return `<line x1="${M.l}" y1="${py(v).toFixed(1)}" x2="${W - M.r}" y2="${py(v).toFixed(1)}" class="grid"/>` +
      `<text class="tick" x="${M.l - 8}" y="${(py(v) + 4).toFixed(1)}" text-anchor="end">${f0(v)}</text>`;
  }).join('');
  const gridX = [0, 0.5, 1].map((f) => {
    const v = x0 + f * (x1 - x0);
    return `<text class="tick" x="${px(v).toFixed(1)}" y="${H - M.b + 18}" text-anchor="middle">${f0(v)}</text>`;
  }).join('');
  const rule = opts.rule !== undefined && opts.rule < y1
    ? `<line x1="${M.l}" y1="${py(opts.rule).toFixed(1)}" x2="${W - M.r}" y2="${py(opts.rule).toFixed(1)}" class="rule"/>` +
      `<text class="rulelabel" x="${W - M.r - 4}" y="${(py(opts.rule) - 6).toFixed(1)}" text-anchor="end">${esc(opts.ruleLabel || '')}</text>`
    : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.alt || '')}">
    ${gridY}${gridX}${rule}
    <path d="${d}" class="line"/>
    <text class="axis" x="${M.l}" y="${H - 6}">${esc(opts.xlabel)}</text>
    <text class="axis" x="4" y="12">${esc(opts.ylabel)}</text>
  </svg>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Junkstronaut — candidate tuning</title>
<style>
  :root{color-scheme:light dark;
    --bg:#fbfaf8;--fg:#1a1a1a;--dim:#6a6a6a;--card:#fff;--line:#dcd8d2;
    --good:#1f8a5f;--bad:#c0392b;--accent:#2a78d6;--rule:#c0392b}
  @media (prefers-color-scheme:dark){:root{
    --bg:#16181c;--fg:#e8e6e3;--dim:#9a9894;--card:#1e2126;--line:#31353c;
    --good:#3fbf88;--bad:#e2685a;--accent:#5aa0e8;--rule:#e2685a}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:900px;margin:0 auto;padding:32px 20px 64px}
  h1{font-size:26px;margin:0 0 4px}
  .sub{color:var(--dim);margin:0 0 28px}
  .verdict{background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:20px 22px;margin-bottom:26px}
  .score{font-size:34px;font-weight:600;letter-spacing:-.5px}
  .score .of{color:var(--dim);font-size:18px;font-weight:400}
  table{width:100%;border-collapse:collapse;margin:10px 0 0}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);
    font-variant-numeric:tabular-nums}
  th{color:var(--dim);font-weight:600;font-size:13px;text-transform:uppercase;
    letter-spacing:.4px}
  td.n,th.n{text-align:right}
  .ok{color:var(--good);font-weight:600}
  .no{color:var(--bad);font-weight:600}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:18px 22px;margin-bottom:22px}
  .card h2{font-size:17px;margin:0 0 4px}
  .card p.note{color:var(--dim);margin:0 0 14px;font-size:14px}
  .chart{width:100%;height:auto;overflow:visible}
  .grid{stroke:var(--line);stroke-width:1}
  .tick{fill:var(--dim);font-size:11px}
  .axis{fill:var(--dim);font-size:11px}
  .line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round}
  .rule{stroke:var(--rule);stroke-width:1.5;stroke-dasharray:5 4}
  .rulelabel{fill:var(--rule);font-size:11px;font-weight:600}
  code{background:var(--bg);padding:1px 5px;border-radius:4px;font-size:13px}
  .cfg{display:flex;gap:26px;flex-wrap:wrap;margin-top:12px}
  .cfg div{font-size:14px}
  .cfg b{display:block;font-size:19px;font-variant-numeric:tabular-nums}
  .warn{border-left:3px solid var(--rule);padding-left:14px;color:var(--dim);font-size:14px}
</style></head><body><div class="wrap">

<h1>Candidate tuning</h1>
<p class="sub">The whole game flown against one parameter set — first launch to
${esc(SAT.display_name)}. Not a crew run: this is the flight model driven directly.</p>

<div class="verdict">
  <div class="score">${passed}<span class="of"> / ${gates.length} gates</span></div>
  <div class="cfg">
    <div>heat capacity<b>${CAPACITY}</b></div>
    <div>commit floor<b>${f0(COMMIT_FLOOR)} m</b></div>
    <div>ascent heat penalty<b>exempt</b></div>
    <div>full hold<b>${f0(HOLD)} kg</b></div>
  </div>
  <table><thead><tr><th>gate</th><th>what was measured</th><th class="n">verdict</th></tr></thead><tbody>
  ${gates.map((g) => `<tr><td>${esc(g.id)}</td><td>${esc(g.detail)}</td>
    <td class="n ${g.pass ? 'ok' : 'no'}">${g.pass ? 'holds' : 'FAILS'}</td></tr>`).join('')}
  </tbody></table>
</div>

<div class="card">
  <h2>The first launch</h2>
  <p class="note">The base ship on a ballistic arc — no circularisation, which is where the
  fuel goes. The EVA window is the seconds spent at or above the band floor
  (${f0(FLOOR)} m).</p>
  <table><thead><tr><th>ship</th><th class="n">apex</th><th class="n">EVA window</th>
    <th class="n">fuel left</th><th class="n">climb heat</th><th>orbit?</th></tr></thead><tbody>
  ${ascents.map((a) => `<tr><td>${esc(a.ship)}</td><td class="n">${f0(a.apex)} m</td>
    <td class="n">${f0(a.eva)} s</td><td class="n">${f1(a.fuelLeft)}%</td>
    <td class="n">${f1(a.climbHeat)}</td>
    <td>${a.orbit ? `yes, ${f1(a.orbitFuelLeft)}% left` : 'no'}</td></tr>`).join('')}
  </tbody></table>
</div>

<div class="card">
  <h2>The climb</h2>
  <p class="note">Base ship. Heating peaks at ${f0(base.heatAlt)} m and
  ${f0(base.maxSpeed)} m/s — <b>not</b> at max dynamic pressure, which is five times lower at
  ${f0(base.maxQalt)} m. Heating goes as √density × speed³; dynamic pressure as
  density × speed².</p>
  ${lineChart(traced.trace.filter((t) => t.alt < 44000), 'alt', 'heat',
    { xlabel: 'altitude, m', ylabel: 'heat bar', rule: CAPACITY, ruleLabel: `capacity ${CAPACITY}`,
      alt: 'Heat bar against altitude during the climb' })}
</div>

<div class="card">
  <h2>Coming home, from the top of the band</h2>
  <p class="note">Coolest legal descent at each load. The commit floor is the rule doing the
  work: the player may not commit to an entry above ${f0(COMMIT_FLOOR)} m, so flying shallow
  to stay cool is off the table and skimming is the only way left to arrive slower.</p>
  <table><thead><tr><th>load</th><th class="n">mass</th><th class="n">plunge</th>
    <th class="n">1 skim</th><th class="n">2 skims</th><th>verdict</th></tr></thead><tbody>
  ${descents.map((d) => `<tr><td>${esc(d.load)}</td><td class="n">${f0(d.mass)} kg</td>
    <td class="n ${d.plunge > CAPACITY ? 'no' : ''}">${f1(d.plunge)}</td>
    <td class="n">${f1(d.skim1)}</td><td class="n">${f1(d.skim2)}</td>
    <td>${d.mustSkim ? '<span class="ok">must skim</span>' : 'may plunge'}</td></tr>`).join('')}
  </tbody></table>
</div>

<div class="card">
  <h2>Why the commit floor is the lever</h2>
  <p class="note">${esc(SAT.display_name)} on a single pass, against how deep the player
  commits. Peak heat falls steeply as the entry gets shallower — that is the escape route the
  floor closes. Without it the player enters at about 19,700 m, the plunge reads about 128,
  and no capacity can tell it apart from a skimmed descent.</p>
  ${lineChart(curve.filter((c) => c.passes === 1), 'entry', 'peak',
    { xlabel: 'committed entry altitude, m', ylabel: 'peak heat',
      rule: CAPACITY, ruleLabel: `capacity ${CAPACITY}`,
      alt: 'Peak heat against committed entry altitude, single pass' })}
  <p class="warn">The floor sits at ${f0(COMMIT_FLOOR)} m — left of this curve's cheap end.
  Everything to the right of it is what the rule takes away.</p>
</div>

<p class="sub" style="margin-top:32px">Generated by <code>crew/probes/candidate.js</code>.
Re-run with <code>CAPACITY=… COMMIT_FLOOR=… node probes/candidate.js</code>.
This is the flight model driven directly, not a crew run — the agents have not seen these
numbers and no audit has been performed against them.</p>

</div></body></html>`;

const out = path.join(CREW, 'out', 'report', 'tuning-candidate.html');
fs.writeFileSync(out, html);
console.log(`${passed}/${gates.length} gates hold`);
for (const g of gates) console.log(`  ${g.pass ? 'ok  ' : 'FAIL'} ${g.id} — ${g.detail}`);
console.log(`\nwrote ${out}`);

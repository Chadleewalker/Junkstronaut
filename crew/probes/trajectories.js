#!/usr/bin/env node
'use strict';
// Draw the flight paths. Not a chart of the numbers — the actual trails.
//
// Everything measured so far has been scalar: a peak of 268.8, a cut of 0.42x. Those say
// what happens and not why. The trail says why: the skimmed descent clips the top of the air,
// exits, comes back round on a smaller ellipse, and only then commits — and the reason its
// entry is cooler is visibly that it is arriving slower, not that it is entering shallower.
//
// Writes out/report/trajectories.html.

const fs = require('fs');
const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const lock = require(path.join(CREW, 'planet.lock.json'));
const P0 = require(path.join(CREW, 'out/config/game_params.json'));
const catalog = require('./legacy-catalog').migrate(
  require(path.join(CREW, 'out/data/debris_catalog.json')),
  require(path.join(CREW, 'out/params/baseline.json')));

const CAPACITY = Number(process.env.CAPACITY) || 235;
const COMMIT_FLOOR = Number(process.env.COMMIT_FLOOR) || 8000;

// Baseline straight off the lock, so the picture is of the decided planet.
const R = lock.planet.radius_m;
const mu = lock.planet.surface_gravity_ms2 * R * R;
const samples = ['bottom', 'middle', 'top'].map((name) => {
  const alt = lock.band.sample_altitudes_m[name];
  const r = R + alt;
  const v = Math.sqrt(mu / r);
  return { name, altitude_m: alt, orbital_speed_ms: Number(v.toFixed(1)),
           period_s: Number(((2 * Math.PI * r) / v).toFixed(1)) };
});
const baseline = {
  planet: lock.planet,
  bands: [{ name: lock.band.name, altitude_min_m: lock.band.altitude_min_m,
            altitude_max_m: lock.band.altitude_max_m, samples }],
  reentry: require(path.join(CREW, 'out/params/baseline.json')).reentry,
};

const params = JSON.parse(JSON.stringify(P0));
params.reentry.heat_capacity = CAPACITY;
params.reentry.commit_floor_m = COMMIT_FLOOR;

const { world, cfg } = sim.buildConfig(baseline, params);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, samples[0].altitude_m);

const TOP = samples[2].altitude_m;
const FLOOR_ALT = baseline.bands[0].altitude_min_m;
const SAT = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const HOLD = fullHoldMass(catalog, params).fullHold;
const TRACE_EVERY = 4;

// Coolest descent at a given skim count, with the entry pinned at the commit floor.
function fly(cargoMass, skims) {
  let best = null;
  const alts = skims === 0 ? [world.atmTop * 0.5]
    : Array.from({ length: 25 }, (_, j) => world.atmTop * (0.35 + 0.62 * (j / 24)));
  for (const sa of alts) {
    if (skims > 0 && sa <= COMMIT_FLOOR) continue;
    try {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass }, TOP, sa, 0,
        { skims, entryPeriapsis: COMMIT_FLOOR, traceEvery: TRACE_EVERY });
      // LEGALITY. A descent only respects the commit floor if it actually commits: the pass
      // that lands must be the committed entry, not a skim that happened to bring the ship
      // down. With skims >= 1 the ship starts on an ellipse whose periapsis is the SKIM
      // altitude, so a shallow skim that lands never touches entryPeriapsis and the floor is
      // evaded entirely. That is the plunge the floor exists to forbid, wearing a skim's
      // name — it reported the satellite coming home at 131.3 on a single pass at 20,604 m,
      // when every genuinely committed skimmed descent reads 196.5.
      if (!r.landed || r.passes.length < skims + 1) continue;
      const peak = Math.max(...r.passes.map((p) => p.peakHeat));
      if (!best || peak < best.peak) best = { peak, run: r, skimAlt: sa };
    } catch (e) { /* that depth does not fly */ }
  }
  return best;
}

const paths = [
  { key: 'plunge', label: 'Plunge — 0 skims', colour: 'var(--c-plunge)', ...fly(SAT.mass_kg, 0) },
  { key: 'skim1', label: 'One skim, then commit', colour: 'var(--c-skim1)', ...fly(SAT.mass_kg, 1) },
  { key: 'skim2', label: 'Two skims, then commit', colour: 'var(--c-skim2)', ...fly(SAT.mass_kg, 2) },
].filter((p) => p.run);

// The first launch, for scale and for the other half of the loop.
const baseCfg = sim.buildConfig(baseline, params);
baseCfg.cfg.heatScale = cfg.heatScale;
const launch = sim.simulateAscent(baseCfg.world, baseCfg.cfg, FLOOR_ALT * 1.15,
  { circularise: false, hangAltitude: FLOOR_ALT, traceEvery: 2 });

// ---------------------------------------------------------------- render
// World coordinates are metres from the planet centre. The view is scaled so the highest
// point of any drawn path fits, and everything is drawn to true scale — the atmosphere really
// is that thin a skin, and that is most of the point of the picture.
const allR = [];
for (const p of paths) for (const t of p.run.trace) allR.push(Math.hypot(t.x, t.y));
allR.push(R + TOP);
const RMAX = Math.max(...allR) * 1.06;

const SIZE = 720, C = SIZE / 2;
const sc = (m) => (m / RMAX) * (SIZE / 2);
const PX = (x) => C + sc(x);
const PY = (y) => C - sc(y);

function trailPath(trace) {
  return trace.map((t, i) => `${i ? 'L' : 'M'}${PX(t.x).toFixed(1)},${PY(t.y).toFixed(1)}`).join('');
}
// Split a trail into the segments that are inside the atmosphere, so the hot parts can be
// drawn thicker — that is where all the heat and all the drag happen.
function atmSegments(trace) {
  const segs = [];
  let cur = null;
  for (const t of trace) {
    if (t.h < world.atmTop) {
      if (!cur) { cur = []; segs.push(cur); }
      cur.push(t);
    } else cur = null;
  }
  return segs.filter((s) => s.length > 1).map(trailPath);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString() : '—');

const orbitDots = samples.map((s) =>
  `<circle cx="${C}" cy="${C}" r="${sc(R + s.altitude_m).toFixed(1)}" class="bandring"/>`).join('');

const trails = paths.map((p) => `
  <g class="trail" data-path="${p.key}">
    <path d="${trailPath(p.run.trace)}" fill="none" stroke="${p.colour}"
      stroke-width="1.6" stroke-opacity=".55"/>
    ${atmSegments(p.run.trace).map((d) =>
      `<path d="${d}" fill="none" stroke="${p.colour}" stroke-width="4"
        stroke-linecap="round"/>`).join('')}
    <circle cx="${PX(p.run.trace[0].x).toFixed(1)}" cy="${PY(p.run.trace[0].y).toFixed(1)}"
      r="4" fill="${p.colour}"/>
  </g>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Junkstronaut — flight paths</title>
<style>
  :root{color-scheme:light dark;
    --bg:#fbfaf8;--fg:#1a1a1a;--dim:#6a6a6a;--card:#fff;--line:#dcd8d2;
    --ground:#c8bfae;--air:#7fb4e6;--ring:#c9c3ba;
    --c-plunge:#c0392b;--c-skim1:#2a78d6;--c-skim2:#1f8a5f;--c-launch:#b8860b}
  @media (prefers-color-scheme:dark){:root{
    --bg:#16181c;--fg:#e8e6e3;--dim:#9a9894;--card:#1e2126;--line:#31353c;
    --ground:#4a4437;--air:#3d6c9e;--ring:#3a3f47;
    --c-plunge:#e2685a;--c-skim1:#5aa0e8;--c-skim2:#3fbf88;--c-launch:#d9a441}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:1000px;margin:0 auto;padding:32px 20px 64px}
  h1{font-size:26px;margin:0 0 4px}
  .sub{color:var(--dim);margin:0 0 26px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:20px 22px;margin-bottom:22px}
  .card h2{font-size:17px;margin:0 0 4px}
  .card p.note{color:var(--dim);margin:0 0 16px;font-size:14px}
  svg{width:100%;height:auto;display:block}
  .planet{fill:var(--ground)}
  .atm{fill:var(--air);fill-opacity:.20}
  .bandring{fill:none;stroke:var(--ring);stroke-width:1;stroke-dasharray:3 5}
  .lbl{fill:var(--dim);font-size:11px}
  table{width:100%;border-collapse:collapse;margin-top:14px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);
    font-variant-numeric:tabular-nums}
  th{color:var(--dim);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.4px}
  td.n,th.n{text-align:right}
  .sw{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:8px;
    vertical-align:-1px}
  .over{color:var(--c-plunge);font-weight:600}
  .ok{color:var(--c-skim2);font-weight:600}
  .legend{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;font-size:14px}
</style></head><body><div class="wrap">

<h1>Flight paths</h1>
<p class="sub">${esc(SAT.display_name)}, ${f0(SAT.mass_kg)} kg, coming home from
${f0(TOP)} m. Drawn to true scale on the locked planet — the atmosphere really is that thin.</p>

<div class="card">
  <h2>Three ways down</h2>
  <p class="note">All three start at the same place with the same ship and commit to the same
  depth (${f0(COMMIT_FLOOR)} m — the floor). The only difference is how many times they clip
  the air first. Thick segments are inside the atmosphere; that is where every bit of the heat
  and the braking happens.</p>
  <svg viewBox="0 0 ${SIZE} ${SIZE}" role="img"
    aria-label="Three descent trajectories drawn to scale around the planet">
    <circle cx="${C}" cy="${C}" r="${sc(R + world.atmTop).toFixed(1)}" class="atm"/>
    <circle cx="${C}" cy="${C}" r="${sc(R).toFixed(1)}" class="planet"/>
    ${orbitDots}
    ${trails}
    <text class="lbl" x="${C}" y="${(C - sc(R + TOP) - 8).toFixed(1)}"
      text-anchor="middle">top of the band · ${f0(TOP)} m</text>
    <text class="lbl" x="${C}" y="${(C - sc(R + world.atmTop) + 14).toFixed(1)}"
      text-anchor="middle">atmosphere · ${f0(world.atmTop)} m</text>
  </svg>
  <div class="legend">
    ${paths.map((p) => `<span><span class="sw" style="background:${p.colour}"></span>${esc(p.label)}</span>`).join('')}
  </div>
  <table><thead><tr><th>path</th><th class="n">peak heat</th><th class="n">passes</th>
    <th class="n">time</th><th class="n">touchdown</th><th>at capacity ${CAPACITY}</th></tr></thead><tbody>
  ${paths.map((p) => `<tr>
    <td><span class="sw" style="background:${p.colour}"></span>${esc(p.label)}</td>
    <td class="n ${p.peak > CAPACITY ? 'over' : ''}">${f1(p.peak)}</td>
    <td class="n">${p.run.passes.length}</td>
    <td class="n">${(p.run.time / 3600).toFixed(2)} h</td>
    <td class="n">${f1(p.run.touchdownSpeed)} m/s</td>
    <td>${p.peak > CAPACITY ? '<span class="over">burns through</span>' : '<span class="ok">survives</span>'}</td>
  </tr>`).join('')}
  </tbody></table>
</div>

<div class="card">
  <h2>The first launch</h2>
  <p class="note">Base ship, no upgrades, on a ballistic arc — up through the air, over the
  top, and back. It never circularises, which is where the fuel would have gone. The EVA
  window is the ${f1(launch.timeAbove)} s it spends at or above the band floor.</p>
  <svg viewBox="0 0 ${SIZE} ${Math.round(SIZE * 0.52)}" role="img"
    aria-label="Altitude against time for the first launch">
    ${(() => {
      const W = SIZE, H = Math.round(SIZE * 0.52), M = { l: 64, r: 24, t: 20, b: 40 };
      const tr = launch.trace;
      const tMax = tr[tr.length - 1].t, aMax = Math.max(...tr.map((p) => p.alt)) * 1.1;
      const px = (t) => M.l + (t / tMax) * (W - M.l - M.r);
      const py = (a) => H - M.b - (a / aMax) * (H - M.t - M.b);
      const d = tr.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(1)},${py(p.alt).toFixed(1)}`).join('');
      const atmBand = `<rect x="${M.l}" y="${py(world.atmTop).toFixed(1)}"
        width="${W - M.l - M.r}" height="${(H - M.b - py(world.atmTop)).toFixed(1)}" class="atm"/>`;
      const floorLine = `<line x1="${M.l}" y1="${py(FLOOR_ALT).toFixed(1)}"
        x2="${W - M.r}" y2="${py(FLOOR_ALT).toFixed(1)}" stroke="var(--ring)"
        stroke-dasharray="4 4"/>
        <text class="lbl" x="${W - M.r}" y="${(py(FLOOR_ALT) - 6).toFixed(1)}"
          text-anchor="end">band floor · ${f0(FLOOR_ALT)} m</text>`;
      const ticks = [0, 0.5, 1].map((f) => `<text class="lbl" x="${px(f * tMax).toFixed(1)}"
        y="${H - M.b + 18}" text-anchor="middle">${Math.round(f * tMax)} s</text>`).join('');
      return `${atmBand}${floorLine}${ticks}
        <path d="${d}" fill="none" stroke="var(--c-launch)" stroke-width="2.5"/>
        <text class="lbl" x="6" y="14">altitude, m</text>`;
    })()}
  </svg>
</div>

<p class="sub">Generated by <code>crew/probes/trajectories.js</code>. Paths are the flight
model's own output, sampled every ${TRACE_EVERY} s.</p>

</div></body></html>`;

const out = path.join(CREW, 'out', 'report', 'trajectories.html');
fs.writeFileSync(out, html);
for (const p of paths) {
  console.log(`${p.label.padEnd(26)} peak ${f1(p.peak).padStart(6)}  ` +
    `passes ${p.run.passes.length}  ${(p.run.time / 3600).toFixed(2)} h  ` +
    `${p.run.trace.length} trace points`);
}
console.log(`launch: apex ${f0(launch.apoapsisAlt)} m, EVA ${f1(launch.timeAbove)} s`);
console.log(`\nwrote ${out}`);

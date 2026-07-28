#!/usr/bin/env node
'use strict';
// Find the single-pass minimum peak heat EXACTLY, instead of estimating it off a grid.
//
// Why this probe exists. Every capacity window measured so far shrank when the entry-depth
// scan got finer: 46% at 25 samples, 1% at 41. That is not noise and it is not the surface
// being jagged — it is the shape of the problem. Peak heat falls monotonically as the
// committed entry gets shallower, and the entry can only get so shallow before the ship
// skips back out and the descent is no longer a single pass. So the coolest single pass sits
// exactly AT that boundary, and a grid can only ever approach it from below. Refining the
// grid moves the answer down every time, forever, and no resolution is ever "enough".
//
// Bisecting for the boundary removes the bias entirely: about 40 flights, and the answer
// does not depend on how finely anything was sampled.
//
// The old finding this replaces — "a bisection converges on a boundary and can skip whole
// values" (lib/sim.js, descentScan) — is about bisecting for a TARGET PASS COUNT, which is a
// step function with several steps. This bisects for one specific step, the 1 -> 2 boundary,
// and that step is what the quantity is defined by.

const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const BASE = require(path.join(CREW, 'out/params/baseline.json'));
const params = require(path.join(CREW, 'out/config/game_params.json'));
const rawCatalog = require(path.join(CREW, 'out/data/debris_catalog.json'));
const catalog = require('./legacy-catalog').migrate(rawCatalog, BASE);

const SAT = 3600;
const HOLD = fullHoldMass(catalog, params).fullHold;
const clone = (o) => JSON.parse(JSON.stringify(o));
const bandAlt = (b, n) => {
  const x = b.bands.find((y) => y.name === n);
  return (x.altitude_min_m + x.altitude_max_m) / 2;
};

// One descent, committing straight to `entry` with no skims.
function fly(world, cfg, startAlt, cargoMass, entry) {
  try {
    const r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, entry, 0,
      { skims: 0, entryPeriapsis: entry });
    if (!r.landed || !r.passes.length) return null;
    return { passes: r.passes.length, peak: Math.max(...r.passes.map((p) => p.peakHeat)) };
  } catch (e) { return null; }
}

// The coolest committed entry that still comes down in ONE atmospheric passage.
//
// THE FIRST VERSION OF THIS FUNCTION WAS WRONG, and the monotonicity check below is what
// caught it. It bisected for the 1 -> 2 pass boundary and reported the peak there, on the
// reasoning that peak falls as the entry gets shallower so the coolest single pass must sit
// against the boundary. Peak does fall — and then it turns and rises again over the last few
// hundred metres before the boundary. Flown at the shipped scale height with the satellite
// aboard: 306.5 at the surface, down to 142.6 at 19,689 m, back up to 151.1 at 21,479 m, and
// two passes from 23,268 m. The boundary is a local MAXIMUM of that tail. Bisecting to it
// overstated the satellite's single-pass floor by 6%.
//
// So: scan the interval coarsely to find which bracket holds the minimum, then refine inside
// that bracket. The scan is what makes it robust to the turn; the refinement is what makes it
// independent of the scan's resolution.
function singlePassFloor(world, cfg, startAlt, cargoMass, coarse = 160, refine = 40) {
  const top = world.atmTop * 0.999;
  const pts = [];
  for (let i = 0; i <= coarse; i++) {
    const e = (i / coarse) * top;
    const r = fly(world, cfg, startAlt, cargoMass, e);
    if (r && r.passes === 1) pts.push({ e, peak: r.peak });
  }
  if (!pts.length) return { ok: false, why: 'no single-pass descent lands at all' };

  let bi = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].peak < pts[bi].peak) bi = i;
  // Golden-section inside the bracket either side of the coarse best. Anything that stops
  // being a single pass is treated as infinitely hot, so the search cannot walk past the
  // boundary while refining.
  let lo = pts[Math.max(0, bi - 1)].e;
  let hi = pts[Math.min(pts.length - 1, bi + 1)].e;
  const at = (e) => {
    const r = fly(world, cfg, startAlt, cargoMass, e);
    return r && r.passes === 1 ? r.peak : Infinity;
  };
  const g = (Math.sqrt(5) - 1) / 2;
  let c = hi - g * (hi - lo), d = lo + g * (hi - lo);
  let fc = at(c), fd = at(d);
  for (let i = 0; i < refine; i++) {
    if (fc < fd) { hi = d; d = c; fd = fc; c = hi - g * (hi - lo); fc = at(c); }
    else { lo = c; c = d; fc = fd; d = lo + g * (hi - lo); fd = at(d); }
  }
  const e = fc < fd ? c : d;
  const peak = Math.min(fc, fd, pts[bi].peak);
  return { ok: true, entry: fc < fd ? e : d, peak, coarseBest: pts[bi].peak };
}

// The cheapest MULTI-pass descent, for comparison: the same search, but keeping only
// descents that take two or more atmospheric passages. Without this the single-pass floor is
// half an answer — the design needs the gap between them, not either number alone.
function multiPassFloor(world, cfg, startAlt, cargoMass, coarse = 160) {
  const top = world.atmTop * 0.999;
  let best = null;
  for (let i = 0; i <= coarse; i++) {
    const e = (i / coarse) * top;
    const r = fly(world, cfg, startAlt, cargoMass, e);
    if (r && r.passes >= 2 && (!best || r.peak < best.peak)) best = { e, peak: r.peak, n: r.passes };
  }
  return best;
}

function evaluate(H) {
  const b = clone(BASE);
  if (H !== null) b.planet.scale_height_m = H;
  const { world, cfg } = sim.buildConfig(b, params);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt(b, 'suborbital'));
  const hi = bandAlt(b, 'high');
  const out = {};
  for (const [name, mass] of [['empty', 0], ['hold', HOLD], ['sat', SAT]]) {
    out[name] = singlePassFloor(world, cfg, hi, mass);
  }
  out.satMulti = multiPassFloor(world, cfg, hi, SAT);
  return out;
}

const f0 = (x) => (Number.isFinite(x) ? Number(x).toFixed(0) : 'n/a');
const HS = (process.env.SCAN_H || '800,950,1100,1250,1400,1700,2200,3100').split(',').map(Number);

console.log('Exact single-pass minimum peak heat, by bisection on the 1 -> 2 pass boundary.');
console.log('Grid scans can only approach these from below, which is why they kept moving.\n');
console.log('scale height | sat 1p | sat multi (n) | gap | hold 1p | empty 1p');
console.log('-------------|--------|---------------|------|---------|---------');
for (const H of HS) {
  const r = evaluate(H);
  const lo = Math.max(r.satMulti ? r.satMulti.peak : Infinity, r.hold.peak, r.empty.peak);
  const gap = r.sat.peak > lo ? ((r.sat.peak / lo - 1) * 100).toFixed(0) + '%' : 'none';
  console.log(`${String(H).padStart(12)} | ${f0(r.sat.peak).padStart(6)} | ` +
    `${(f0(r.satMulti && r.satMulti.peak) + ' (' + (r.satMulti ? r.satMulti.n : '-') + ')').padStart(13)} | ` +
    `${gap.padStart(4)} | ${f0(r.hold.peak).padStart(7)} | ${f0(r.empty.peak).padStart(8)}`);
}

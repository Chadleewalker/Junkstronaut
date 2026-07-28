#!/usr/bin/env node
'use strict';
// Does a minimum commit depth make skimming necessary for a heavy haul?
//
// This is the probe that got the answer right, after two that did not.
//
// The story, because it is the whole reason to trust this one:
//
//   1. Grid scans over entry depth said a capacity window existed and that scale height set
//      its width. The window shrank every time the grid got finer — 46% at 25 samples, 1% at
//      41 — which read like a resolution problem.
//   2. Bisecting for the 1 -> 2 pass boundary was meant to remove the resolution bias. It
//      found the wrong point: peak heat falls as the committed entry gets shallower and then
//      TURNS AND RISES over the last kilometre before the boundary, so the boundary is a
//      local maximum of the tail, not the minimum.
//   3. Minimising properly — coarse scan, then golden-section inside the winning bracket —
//      showed there is NO window at any scale height. The coolest single pass is as cool as
//      or cooler than the coolest multi-pass everywhere from 800 m to 3,100 m, and the number
//      barely moves (121 to 128). **Skimming does not lower the peak of a descent that was
//      free to pick its own entry depth.** No capacity can force multi-pass, and scale height
//      is not a lever.
//
// So the mechanic cannot come from a parameter. It has to come from a RULE, and this probe
// measures the one the design already proposed and this analysis wrongly retired: a floor on
// how shallow the committed entry may be. Hold the entry depth fixed and skimming is worth
// 0.42-0.53x on the peak — because a skim drops apoapsis into the atmosphere, so the
// committed entry arrives slower no matter how deep it is. Take away the player's freedom to
// enter arbitrarily shallow and skimming becomes the only remaining way to arrive slower.

const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const BASE = require(path.join(CREW, 'out/params/baseline.json'));
const params = require(path.join(CREW, 'out/config/game_params.json'));
const catalog = require('./legacy-catalog').migrate(
  require(path.join(CREW, 'out/data/debris_catalog.json')), BASE);

const SAT = 3600;
const HOLD = fullHoldMass(catalog, params).fullHold;
const bandAlt = (b, n) => {
  const x = b.bands.find((y) => y.name === n);
  return (x.altitude_min_m + x.altitude_max_m) / 2;
};

const { world, cfg } = sim.buildConfig(BASE, params);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt(BASE, 'suborbital'));
const TOP = bandAlt(BASE, 'high');
const N_SKIMALT = Number(process.env.N_SKIMALT) || 25;

// Coolest descent at a FIXED committed entry depth, with k skims, searching skim altitude.
function bestAt(cargoMass, entry, k) {
  let best = Infinity;
  const alts = k === 0 ? [world.atmTop * 0.5]
    : Array.from({ length: N_SKIMALT }, (_, j) =>
        world.atmTop * (0.35 + 0.62 * (j / (N_SKIMALT - 1))));
  for (const sa of alts) {
    if (k > 0 && sa <= entry) continue;
    try {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass }, TOP, sa, 0,
        { skims: k, entryPeriapsis: entry });
      // A skim that lands never commits, so it evades the floor entirely — see
      // probes/trajectories.js. Only descents that flew all their skims AND a committed
      // entry count.
      if (r.landed && r.passes.length >= k + 1) {
        const p = Math.max(...r.passes.map((x) => x.peakHeat));
        if (p < best) best = p;
      }
    } catch (e) { /* this depth does not fly; the scan reports what does */ }
  }
  return best;
}

const LOADS = [['empty', 0], ['full hold', HOLD], ['satellite', SAT]];
const FLOORS = (process.env.FLOORS || '8000,12000,16000,20000').split(',').map(Number);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '  --');

console.log(`full hold ${HOLD.toFixed(0)} kg | satellite ${SAT} kg | from ${TOP.toFixed(0)} m\n`);
console.log('A commit floor of X means the player may not commit to an entry above X.\n');
console.log('floor  | load      | plunge | 1 skim | a capacity here forces the skim');
console.log('-------|-----------|--------|--------|--------------------------------');
for (const floor of FLOORS) {
  const rows = LOADS.map(([n, m]) => ({ n, p0: bestAt(m, floor, 0), p1: bestAt(m, floor, 1) }));
  for (const r of rows) {
    console.log(`${String(floor).padStart(6)} | ${r.n.padEnd(9)} | ${f1(r.p0).padStart(6)} | ` +
      `${f1(r.p1).padStart(6)} | ${r.p0 > r.p1 ? `(${r.p1.toFixed(0)}, ${r.p0.toFixed(0)}]` : 'n/a'}`);
  }
  // The design wants the endgame haul forced to skim while ordinary hauls may still plunge.
  // That needs a capacity above every ordinary plunge and below the satellite's.
  const sat = rows[2], ordinary = Math.max(rows[0].p0, rows[1].p0);
  const lo = Math.max(ordinary, sat.p1), hi = sat.p0;
  console.log(`       | -> satellite alone must skim: capacity in (${lo.toFixed(0)}, ${hi.toFixed(0)}]` +
    (hi > lo ? `, a ${((hi / lo - 1) * 100).toFixed(0)}% window` : ' — empty'));
  const lo2 = Math.max(rows[0].p0, rows[1].p1, sat.p1), hi2 = Math.min(rows[1].p0, sat.p0);
  console.log(`       | -> full hold too:            capacity in (${lo2.toFixed(0)}, ${hi2.toFixed(0)}]` +
    (hi2 > lo2 ? `, a ${((hi2 / lo2 - 1) * 100).toFixed(0)}% window` : ' — empty') + '\n');
}

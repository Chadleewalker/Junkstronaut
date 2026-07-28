#!/usr/bin/env node
'use strict';
// Which quantity should ablation key off?
//
// sim.js step() tracks three, and says in a comment that they "rank descents in OPPOSITE
// orders, and which one ablation keys off is a design decision rather than a physical fact":
//   peakHeat  the 0-100 bar with a 5 s drain   (what ablation uses today)
//   peakRate  peak instantaneous heating rate  (what real vehicles are designed against)
//   heatLoad  total energy absorbed
//
// This flies the two-depth descent model and re-scores the SAME descents under each key,
// so the only thing that varies is the rule.

const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const baseline = require(path.join(CREW, 'out/params/baseline.json'));
const params = require(path.join(CREW, 'out/config/game_params.json'));
const rawCatalog = require(path.join(CREW, 'out/data/debris_catalog.json'));
// The recorded run predates the one-band contract, so its pieces carry band names rather
// than altitudes. Convert explicitly — fullHoldMass now refuses a legacy catalog.
const catalog = require('./legacy-catalog').migrate(rawCatalog, baseline);

const bandAlt = (n) => {
  const b = baseline.bands.find((x) => x.name === n);
  return (b.altitude_min_m + b.altitude_max_m) / 2;
};

const { world, cfg } = sim.buildConfig(baseline, params);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt('suborbital'));

const hold = fullHoldMass(catalog, params);
const A = params.ablation;
const N_ENTRY = Number(process.env.N_ENTRY) || 31;
const N_SKIMALT = Number(process.env.N_SKIMALT) || 15;

function flyAll(cargoMass, startAlt) {
  const rows = [];
  for (let i = 0; i < N_ENTRY; i++) {
    const entry = (i / (N_ENTRY - 1)) * world.atmTop * 0.999;
    for (const skims of [0, 1, 2, 3, 4]) {
      const alts = skims === 0 ? [world.atmTop * 0.5]
        : Array.from({ length: N_SKIMALT }, (_, j) =>
            world.atmTop * (0.40 + 0.55 * (j / (N_SKIMALT - 1))));
      for (const skimAlt of alts) {
        if (skims > 0 && skimAlt <= entry) continue;
        let r;
        try {
          r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, skimAlt, 0,
            { skims, entryPeriapsis: entry });
        } catch (e) { continue; }
        if (!r.landed || !r.passes.length) continue;
        rows.push({
          entry, skimAlt, skims, flown: r.passes.length,
          bar: Math.max(...r.passes.map((p) => p.peakHeat)),
          rate: Math.max(...r.passes.map((p) => p.peakRate)),
          load: r.heatLoad,
          perPassBar: r.passes.map((p) => p.peakHeat),
          perPassRate: r.passes.map((p) => p.peakRate),
        });
      }
    }
  }
  return rows;
}

// Calibrate each key so a 1-pass empty suborbital descent reads 100 on it — the crew's own
// convention for the bar, applied to the other two so the cost formula stays comparable.
const calRows = flyAll(0, bandAlt('suborbital')).filter((r) => r.flown === 1);
const cal = {
  bar: 1,
  rate: 100 / Math.min(...calRows.map((r) => r.rate)),
  load: 100 / Math.min(...calRows.map((r) => r.load)),
};
console.log(`calibration (1-pass empty suborbital reads 100): rate x${cal.rate.toExponential(3)}` +
  `  load x${cal.load.toExponential(3)}\n`);

// Cost under a given key, charged per pass with the escalating cycle toll, exactly as
// ablationFor does — only the quantity fed to the heat term changes.
function costUnder(row, key) {
  const per = key === 'bar' ? row.perPassBar : key === 'rate' ? row.perPassRate : null;
  let total = 0;
  if (per) {
    per.forEach((v, i) => {
      total += A.cycle_toll_base_pct * Math.pow(A.cycle_toll_growth, i)
        + A.heat_cost_coefficient * Math.pow(v * cal[key], A.heat_cost_exponent);
    });
  } else {
    for (let i = 0; i < row.flown; i++) total += A.cycle_toll_base_pct * Math.pow(A.cycle_toll_growth, i);
    total += A.heat_cost_coefficient * Math.pow(row.load * cal.load, A.heat_cost_exponent);
  }
  return total;
}

const f2 = (x) => Number(x).toFixed(2);
const f0 = (x) => Number(x).toFixed(0);
const LOADS = [
  { name: 'empty', cargoMass: 0 },
  { name: 'full hold', cargoMass: hold.fullHold },
  { name: 'satellite', cargoMass: 3600 },
];

for (const band of (process.env.BANDS || 'suborbital,low,high').split(',')) {
  const startAlt = bandAlt(band);
  console.log(`################ ${band} band (${f0(startAlt)} m) ################`);
  for (const load of LOADS) {
    const rows = flyAll(load.cargoMass, startAlt);
    console.log(`\n--- ${load.name} (${f0(load.cargoMass)} kg), ${rows.length} landed descents ---`);
    for (const key of ['bar', 'rate', 'load']) {
      const best = new Map();
      for (const r of rows) {
        const c = costUnder(r, key);
        const cur = best.get(r.flown);
        if (!cur || c < cur.c) best.set(r.flown, { c, r });
      }
      const ranked = [...best.entries()].sort((a, b) => a[1].c - b[1].c);
      const winner = ranked[0];
      const byN = [...best.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6);
      console.log(`  key=${key.padEnd(5)} winner: ${winner[0]} pass ` +
        `(${f2(winner[1].c)}%)   ` +
        byN.map(([n, v]) => `${n}p ${f2(v.c)}`).join('  '));
    }
  }
  console.log('');
}

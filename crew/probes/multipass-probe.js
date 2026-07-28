#!/usr/bin/env node
'use strict';
// Probe: what makes multi-pass the cheapest — and the only — descent from the high band?
//
// Uses the two-depth model (skim at one periapsis, commit to another) rather than
// descentScan, which never commits separately and so cannot express the manoeuvre.

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

const bandAlt = (name) => {
  const b = baseline.bands.find((x) => x.name === name);
  return (b.altitude_min_m + b.altitude_max_m) / 2;
};

const { world, cfg } = sim.buildConfig(baseline, params);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt('suborbital'));

const hold = fullHoldMass(catalog, params);
const SAT = 3600;   // armstrongs_satellite, the win condition

const N_ENTRY = Number(process.env.N_ENTRY) || 21;
const N_SKIMALT = Number(process.env.N_SKIMALT) || 11;
const SKIM_COUNTS = [0, 1, 2, 3, 4];
const CAP = params.reentry.heat_capacity;   // 100

// Fly the whole (entry depth x skim altitude x skim count) space once per load and keep
// every landed descent. Everything downstream is a filter over this list.
function flyAll(cargoMass, startAlt, band) {
  const rows = [];
  for (let i = 0; i < N_ENTRY; i++) {
    const entry = (i / (N_ENTRY - 1)) * world.atmTop * 0.999;
    for (const skims of SKIM_COUNTS) {
      const alts = skims === 0
        ? [world.atmTop * 0.5]                       // unused when skims = 0
        : Array.from({ length: N_SKIMALT }, (_, j) =>
            world.atmTop * (0.40 + (0.95 - 0.40) * (j / (N_SKIMALT - 1))));
      for (const skimAlt of alts) {
        if (skims > 0 && skimAlt <= entry) continue;
        let r;
        try {
          r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, skimAlt, 0,
            { skims, entryPeriapsis: entry });
        } catch (e) { continue; }
        if (!r.landed || !r.passes.length) continue;
        const abl = sim.ablationFor(r.passes, params, band);
        rows.push({
          entry, skimAlt, skims,
          flown: r.passes.length,
          peak: Math.max(...r.passes.map((p) => p.peakHeat)),
          cost: abl.total,
          overheat_s: r.overheatTime || 0,
          touchdown: r.touchdownSpeed,
          hours: r.time / 3600,
        });
      }
    }
  }
  return rows;
}

const f2 = (x) => Number(x).toFixed(2);
const f0 = (x) => Number(x).toFixed(0);

function cheapestBy(rows, keyFn) {
  const best = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const cur = best.get(k);
    if (!cur || r.cost < cur.cost) best.set(k, r);
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]);
}

const LOADS = [
  { name: 'empty', cargoMass: 0 },
  { name: 'full hold', cargoMass: hold.fullHold },
  { name: 'satellite', cargoMass: SAT },
];

console.log(`world: R=${world.R} atmTop=${world.atmTop} H=${baseline.planet.scale_height_m}`);
console.log(`ship:  dry=${cfg.dryMass} area=${cfg.area} plate_capacity=${params.ablation.plate_capacity_pct}%`);
console.log(`full hold = ${f2(hold.fullHold)} kg | satellite = ${SAT} kg | heat cap = ${CAP}\n`);

const store = {};
for (const band of (process.env.BANDS || 'high').split(',')) {
  const startAlt = bandAlt(band);
  for (const load of LOADS) {
    const t0 = Date.now();
    const rows = flyAll(load.cargoMass, startAlt, band);
    store[`${band}/${load.name}`] = rows;
    console.log(`===== ${band} band, ${load.name} (${f0(load.cargoMass)} kg) — ` +
      `${rows.length} landed descents in ${f2((Date.now() - t0) / 1000)}s =====`);

    // 1. Unconstrained: cheapest at each FLOWN pass count. This is the current design question.
    console.log('  cheapest by flown pass count (entry depth free):');
    for (const [n, r] of cheapestBy(rows, (r) => r.flown)) {
      const slots = Math.floor(r.overheat_s / params.reentry.cargo_damage_interval_s);
      console.log(`    ${n} pass  cost ${f2(r.cost).padStart(8)}%  peak ${f0(r.peak).padStart(4)}` +
        `  entry ${f0(r.entry).padStart(6)}m  skimAlt ${f0(r.skimAlt).padStart(6)}m` +
        `  skims ${r.skims}  overheat ${f2(r.overheat_s).padStart(6)}s (${slots} slots)` +
        `  td ${f2(r.touchdown)}m/s`);
    }

    // 2. Feasibility: is a single flown pass survivable at all, and at what depth?
    const single = rows.filter((r) => r.flown === 1);
    const singleOK = single.filter((r) => r.peak < CAP);
    if (!single.length) {
      console.log('  NO single-pass descent lands at all.');
    } else {
      const coolest = single.reduce((a, x) => (x.peak < a.peak ? x : a));
      console.log(`  single pass: ${single.length} land, ${singleOK.length} stay under the bar; ` +
        `coolest peak ${f0(coolest.peak)} at entry ${f0(coolest.entry)}m`);
      if (singleOK.length) {
        const shallowest = singleOK.reduce((a, x) => (x.entry > a.entry ? x : a));
        const deepest = singleOK.reduce((a, x) => (x.entry < a.entry ? x : a));
        console.log(`    survivable entry window: ${f0(deepest.entry)}m .. ${f0(shallowest.entry)}m`);
      }
    }
    console.log('');
  }
}

// 3. THE LEVER. Impose a minimum commit depth (a ceiling on entry periapsis altitude) and
//    re-ask which pass count is cheapest. This is the constraint the design is missing.
console.log('\n##### minimum commit depth sweep — high band #####');
console.log('"entry must be at or below X m" — then which pass count wins?\n');
for (const load of LOADS) {
  const rows = store[`high/${load.name}`];
  console.log(`--- ${load.name} ---`);
  console.log('  max entry alt |  winner  | cost  | peak | 1-pass cost | 1-pass peak | forced?');
  for (let i = 0; i <= 10; i++) {
    const capAlt = (i / 10) * world.atmTop * 0.999;
    const ok = rows.filter((r) => r.entry <= capAlt + 1);
    if (!ok.length) { console.log(`  ${f0(capAlt).padStart(13)} | (none)`); continue; }
    const win = ok.reduce((a, x) => (x.cost < a.cost ? x : a));
    const ones = ok.filter((r) => r.flown === 1);
    const one = ones.length ? ones.reduce((a, x) => (x.cost < a.cost ? x : a)) : null;
    const oneSurv = ones.filter((r) => r.peak < CAP);
    console.log(`  ${f0(capAlt).padStart(13)} | ${String(win.flown).padStart(2)} pass` +
      ` | ${f2(win.cost).padStart(5)} | ${f0(win.peak).padStart(4)}` +
      ` | ${(one ? f2(one.cost) : '  n/a').padStart(11)}` +
      ` | ${(one ? f0(one.peak) : 'n/a').padStart(11)}` +
      ` | ${oneSurv.length ? 'no' : 'YES — multi-pass required'}`);
  }
  console.log('');
}

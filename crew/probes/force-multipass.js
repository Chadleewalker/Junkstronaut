#!/usr/bin/env node
'use strict';
// Search for settings where, from the high band with the satellite aboard, a single pass
// CANNOT stay under the heat bar but a multi-pass descent CAN.
//
// That is a feasibility question, not a cost question — "your only option is multi-pass"
// rather than "multi-pass is 13% cheaper". Cost tuning has already been measured and cannot
// deliver it; the argmin sits at one pass under every ablation key.
//
// Pass condition, all three at once:
//   satellite @ high : min peak over 1-pass descents  >  heat_capacity   (plunge impossible)
//   satellite @ high : min peak over >=2-pass descents <  heat_capacity   (skimming rescues it)
//   empty     @ high : min peak over 1-pass descents  <  heat_capacity   (ordinary runs fine)

const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const BASE = require(path.join(CREW, 'out/params/baseline.json'));
const params = require(path.join(CREW, 'out/config/game_params.json'));
const rawCatalog = require(path.join(CREW, 'out/data/debris_catalog.json'));
// The recorded run predates the one-band contract, so its pieces carry band names rather
// than altitudes. Convert explicitly — fullHoldMass now refuses a legacy catalog.
const catalog = require('./legacy-catalog').migrate(rawCatalog, BASE);

const CAP = params.reentry.heat_capacity;
const SAT = 3600;
const HOLD = fullHoldMass(catalog, params).fullHold;
const STAGE_MODE = process.env.STAGE_MODE || 'staged';
const N_ENTRY = Number(process.env.N_ENTRY) || 17;
const N_SKIMALT = Number(process.env.N_SKIMALT) || 9;

const clone = (o) => JSON.parse(JSON.stringify(o));
const bandAlt = (b, n) => {
  const x = b.bands.find((y) => y.name === n);
  return (x.altitude_min_m + x.altitude_max_m) / 2;
};

// Minimum achievable bar peak at each pass count, over the whole two-depth space.
function minPeaks(world, cfg, startAlt, cargoMass) {
  const byN = new Map();
  for (let i = 0; i < N_ENTRY; i++) {
    const entry = (i / (N_ENTRY - 1)) * world.atmTop * 0.999;
    for (const skims of [0, 1, 2, 3, 4]) {
      const alts = skims === 0 ? [world.atmTop * 0.5]
        : Array.from({ length: N_SKIMALT }, (_, j) =>
            world.atmTop * (0.40 + 0.55 * (j / (N_SKIMALT - 1))));
      for (const skimAlt of alts) {
        if (skims > 0 && skimAlt <= entry) continue;
        // STAGE_MODE picks which branch of the §2.2 decision is being flown. Staged: the
        // shield is exposed from the start, braking passes run at 1x heat, and there is no
        // thrust left to move the periapsis between them. Unstaged: the naked hull takes
        // every braking pass at the 3x multiplier, in exchange for keeping that control.
        const stageAfter = STAGE_MODE === 'unstaged' ? skims : 0;
        let r;
        try {
          r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, skimAlt, stageAfter,
            { skims, entryPeriapsis: entry });
        } catch (e) { continue; }
        if (!r.landed || !r.passes.length) continue;
        const peak = Math.max(...r.passes.map((p) => p.peakHeat));
        const n = r.passes.length;
        const cur = byN.get(n);
        if (!cur || peak < cur.peak) byN.set(n, { peak, entry, skimAlt, skims, td: r.touchdownSpeed });
      }
    }
  }
  return byN;
}

function evaluate(mods) {
  const b = clone(BASE);
  if (mods.scale_height_m !== undefined) b.planet.scale_height_m = mods.scale_height_m;
  if (mods.atmosphere_top_m !== undefined) b.planet.atmosphere_top_m = mods.atmosphere_top_m;
  if (mods.reference_area_m2 !== undefined) b.reentry.reference_area_m2 = mods.reference_area_m2;
  if (mods.high_alt_m !== undefined) {
    const hb = b.bands.find((x) => x.name === 'high');
    hb.altitude_min_m = mods.high_alt_m * 0.9;
    hb.altitude_max_m = mods.high_alt_m * 1.1;
  }
  const { world, cfg } = sim.buildConfig(b, params);
  // Re-anchor the bar: an empty suborbital plunge still reads 100, so "capacity 100" keeps
  // meaning the same thing across variants and the comparison is honest.
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt(b, 'suborbital'));

  const hi = bandAlt(b, 'high');
  const sat = minPeaks(world, cfg, hi, SAT);
  const empty = minPeaks(world, cfg, hi, 0);
  const hold = minPeaks(world, cfg, hi, HOLD);

  const p1 = (m) => (m.get(1) ? m.get(1).peak : Infinity);
  const pMulti = (m) => {
    const vals = [...m.entries()].filter(([n]) => n >= 2).map(([, v]) => v.peak);
    return vals.length ? Math.min(...vals) : Infinity;
  };
  const bestMultiN = (m) => {
    const rows = [...m.entries()].filter(([n]) => n >= 2);
    if (!rows.length) return null;
    return rows.reduce((a, x) => (x[1].peak < a[1].peak ? x : a))[0];
  };

  return {
    sat1: p1(sat), satM: pMulti(sat), satMN: bestMultiN(sat),
    hold1: p1(hold), holdM: pMulti(hold),
    empty1: p1(empty),
    pass: p1(sat) > CAP && pMulti(sat) < CAP && p1(empty) < CAP,
  };
}

const f0 = (x) => (Number.isFinite(x) ? Number(x).toFixed(0) : ' inf');
const rows = [];

const VARIANTS = [];
if (process.env.SCAN_H) {
  // Confirmation mode: hold the shield area and walk the scale height finely, to check that
  // the recommended value sits on a plateau rather than on a spike of the jagged surface.
  for (const H of process.env.SCAN_H.split(',').map(Number)) {
    VARIANTS.push({ label: `H=${H}`, mods: { scale_height_m: H, reference_area_m2: 3.1 } });
  }
} else if (process.env.ONLY) {
  VARIANTS.push({ label: 'shipped (baseline)', mods: {} },
    { label: 'H=1100 area=3.1', mods: { scale_height_m: 1100, reference_area_m2: 3.1 } });
} else {
  VARIANTS.push({ label: 'shipped (baseline)', mods: {} });
  for (const H of [3100, 2200, 1600, 1100]) {
    for (const A of [3.1, 5, 8, 12]) {
      VARIANTS.push({ label: `H=${H} area=${A}`, mods: { scale_height_m: H, reference_area_m2: A } });
    }
  }
}

console.log(`heat capacity ${CAP} | satellite ${SAT} kg | full hold ${HOLD.toFixed(0)} kg`);
console.log(`grid: ${N_ENTRY} entry depths x ${N_SKIMALT} skim altitudes x 5 skim counts\n`);
// The bar's capacity is a design choice, not a constant — it is what the heat-shield tier
// buys (the crew ships 100 / 140 / 190). So the question is not "does 100 force multi-pass"
// but "does ANY capacity C force it": the satellite must need skims, while an empty ship and
// a full hold can still plunge.
//
//   need   max(empty1, hold1) < C   and   satM < C < sat1
//
// The width of that window is the whole design margin. A 2% window is a coincidence; a 40%
// window is a mechanic.
console.log('variant                 | sat 1p | sat Np (n) | hold 1p | empty 1p | capacity window | width');
console.log('------------------------|--------|------------|---------|----------|-----------------|------');
for (const v of VARIANTS) {
  let r;
  try { r = evaluate(v.mods); } catch (e) { console.log(`${v.label.padEnd(23)} | ERROR ${e.message}`); continue; }
  const lo = Math.max(r.satM, r.hold1, r.empty1);
  const hi = r.sat1;
  const width = hi > lo ? (hi / lo - 1) * 100 : 0;
  rows.push({ ...v, ...r, lo, hi, width });
  console.log(`${v.label.padEnd(23)} | ${f0(r.sat1).padStart(6)} | ` +
    `${f0(r.satM).padStart(6)} (${r.satMN ?? '-'})`.padStart(10) + ` | ` +
    `${f0(r.hold1).padStart(7)} | ${f0(r.empty1).padStart(8)} | ` +
    (hi > lo ? `${f0(lo)} .. ${f0(hi)}`.padStart(15) : '         (none)') +
    ` | ${hi > lo ? f0(width) + '%' : '-'}`);
}

console.log('\nranked by how much room the design has (widest window first):');
for (const r of rows.filter((x) => x.width > 0).sort((a, b) => b.width - a.width)) {
  console.log(`  ${f0(r.width).padStart(4)}%  ${r.label.padEnd(20)} ` +
    `capacity anywhere in ${f0(r.lo)}..${f0(r.hi)} forces >=${r.satMN} passes for the satellite`);
}

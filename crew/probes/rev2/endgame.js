'use strict';
// Q7: the endgame haul's route home. Entry pinned at the commit floor, skim altitude scanned,
// per-pass peaks and the plate cost of the two-cycle descent. The sweep never flies this —
// skimStudy is called with cargoMass 0 — so it exists nowhere but here.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');
const P = require('./params');

const hold = fullHoldMass(catalog, P, baseline);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const { world, cfg } = sim.buildConfig(baseline, P);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
const FLOOR = P.reentry.commit_floor_m;
const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const a = P.ablation;

function best(cargoMass, startAlt, skims) {
  let out = null;
  const alts = skims === 0 ? [FLOOR]
    : Array.from({ length: 65 }, (_, j) => world.atmTop * (0.30 + 0.68 * (j / 64)));
  for (const sa of alts) {
    if (skims > 0 && sa <= FLOOR) continue;
    let r;
    try {
      r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, skims === 0 ? FLOOR : sa, 0,
        { skims, entryPeriapsis: FLOOR });
    } catch (e) { continue; }
    if (!r.landed || r.passes.length < skims + 1) continue;
    const peak = Math.max(...r.passes.map((x) => x.peakHeat));
    if (!out || peak < out.peak) out = { peak, r, sa };
  }
  return out;
}

console.log(`floor ${FLOOR} m, capacity ladder ${P.reentry.heat_capacity} / ` +
  P.upgrades.filter((u) => u.part === 'heat_shield').map((u) => u.value).join(' / '));
console.log('load        k | peak | per-pass peaks              | plate % | under every tier?');
for (const [name, m] of [['full hold', hold.fullHold], ['endgame', heaviest.mass_kg]]) {
  for (const k of [0, 1, 2]) {
    const b = best(m, ALT.top, k);
    if (!b) { console.log(`${name.padEnd(11)} ${k} | none`); continue; }
    const abl = sim.ablationFor(b.r.passes, P, 'top');
    const maxTier = Math.max(P.reentry.heat_capacity,
      ...P.upgrades.filter((u) => u.part === 'heat_shield').map((u) => u.value));
    console.log(`${name.padEnd(11)} ${k} | ${b.peak.toFixed(1).padStart(5)} | ` +
      `${b.r.passes.map((x) => x.peakHeat.toFixed(1)).join(' / ').padEnd(27)} | ` +
      `${abl.total.toFixed(1).padStart(6)}% | ${b.peak < maxTier ? 'yes' : 'NO (must skim)'}` +
      `  skimAlt ${k ? b.sa.toFixed(0) : '-'}  td ${b.r.touchdownSpeed.toFixed(2)}`);
  }
}

// Touchdown at the upgrade tiers that a module run would actually be flying.
console.log('\n--- endgame touchdown by parachute tier ---');
const rho0 = baseline.planet.sea_level_density_kgm3, g = baseline.planet.surface_gravity_ms2;
const cd = P.landing.parachute_drag_coefficient;
for (const A of [P.landing.parachute_area_m2,
                 ...P.upgrades.filter((u) => u.part === 'parachute').map((u) => u.value)]) {
  for (const [nm, mass] of [['endgame haul 1600 kg', 1146 + 1600], ["Armstrong's module ~1146 kg", 1146 + 1146],
                            ['10-slot hold', 1146 + 1910.6]]) {
    console.log(`  A=${String(A).padStart(4)} m2  ${nm.padEnd(28)} ${Math.sqrt((2 * mass * g) / (rho0 * cd * A)).toFixed(2)} m/s`);
  }
}

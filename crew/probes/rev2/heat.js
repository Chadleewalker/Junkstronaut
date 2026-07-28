'use strict';
// Q2: the heat-capacity window at the rescaled mass. Peaks for empty / half / full hold /
// endgame haul at each sample, at a range of commit floors, plus the skim ladder that has
// to bring the endgame haul home, plus the direct-entry basis for heat_index.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

const DRY = Number(process.env.DRY) || 1146;
const P = {
  flight: { dry_mass_kg: DRY, fuel_capacity_kg: 3820, thrust_n: 74200, fuel_burn_kgs: 21.2 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 230, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: 8000, unstaged_heat_multiplier: 3 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 870,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.6 },
};

const hold = fullHoldMass(catalog, P, baseline);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const { world, cfg } = sim.buildConfig(baseline, P);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
console.log(`heatScale ${cfg.heatScale.toExponential(4)}  full hold ${hold.fullHold.toFixed(1)} kg  ` +
  `endgame ${heaviest.id} ${heaviest.mass_kg} kg  dry ${cfg.dryMass} kg`);

const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const NSKIMALT = Number(process.env.N_SKIMALT) || 33;

// Coolest legal descent at k skims: entry pinned at the floor, skim altitude scanned.
function coolest(cargoMass, startAlt, skims, floor) {
  let best = Infinity, at = null;
  const alts = skims === 0 ? [world.atmTop * 0.5]
    : Array.from({ length: NSKIMALT }, (_, j) => world.atmTop * (0.30 + 0.68 * (j / (NSKIMALT - 1))));
  for (const sa of alts) {
    if (skims > 0 && sa <= floor) continue;
    try {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, sa, 0,
        { skims, entryPeriapsis: floor });
      if (r.landed && r.passes.length >= skims + 1) {
        const p = Math.max(...r.passes.map((x) => x.peakHeat));
        if (p < best) { best = p; at = { r, sa }; }
      }
    } catch (e) { /* that depth does not fly */ }
  }
  return { peak: best, at };
}

const LOADS = [
  ['empty', 0],
  ['half hold', hold.fullHold / 2],
  ['full hold', hold.fullHold],
  ['endgame', heaviest.mass_kg],
];

console.log('\n--- peaks from the TOP of the band, by commit floor ---');
console.log('floor |  empty   half   full  endgame | gap full->endgame | endgame k=1  k=2  k=3');
for (const floor of [2000, 4000, 6000, 8000, 11000, 14000, 20000]) {
  const p = LOADS.map(([, m]) => coolest(m, ALT.top, 0, floor).peak);
  const e1 = coolest(heaviest.mass_kg, ALT.top, 1, floor).peak;
  const e2 = coolest(heaviest.mass_kg, ALT.top, 2, floor).peak;
  const e3 = coolest(heaviest.mass_kg, ALT.top, 3, floor).peak;
  const gap = p[3] - p[2];
  console.log(`${String(floor).padStart(5)} | ${p.map((x) => x.toFixed(1).padStart(6)).join(' ')} | ` +
    `${gap.toFixed(1).padStart(6)} (${((p[3] / p[2] - 1) * 100).toFixed(1)}%) | ` +
    `${e1.toFixed(1).padStart(7)} ${e2.toFixed(1).padStart(6)} ${e3.toFixed(1).padStart(6)}`);
}

const FLOOR = Number(process.env.FLOOR) || 8000;
console.log(`\n--- plunge peaks at every sample, floor ${FLOOR} ---`);
for (const s of ['bottom', 'middle', 'top']) {
  const p = LOADS.map(([, m]) => coolest(m, ALT[s], 0, FLOOR).peak);
  console.log(`${s.padEnd(7)} ${p.map((x) => x.toFixed(1).padStart(7)).join(' ')}`);
}

console.log('\n--- direct entry (periapsis 0, the skim-study basis), empty ---');
for (const s of ['bottom', 'middle', 'top']) {
  const r = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, ALT[s], 0);
  console.log(`${s.padEnd(7)} peak ${Math.max(...r.passes.map((x) => x.peakHeat)).toFixed(1)}`);
}

console.log(`\n--- skim multipliers, empty, entry pinned at floor ${FLOOR} ---`);
for (const s of ['bottom', 'middle', 'top']) {
  const p0 = coolest(0, ALT[s], 0, FLOOR).peak;
  const row = [0, 1, 2, 3].map((k) => coolest(0, ALT[s], k, FLOOR).peak);
  console.log(`${s.padEnd(7)} peaks ${row.map((x) => x.toFixed(1).padStart(7)).join(' ')}  ` +
    `mult ${row.map((x) => (x / p0).toFixed(3)).join(', ')}`);
}

console.log(`\n--- skim's OWN peak (the skim pass itself), empty, floor ${FLOOR} ---`);
for (const s of ['bottom', 'middle', 'top']) {
  const c = coolest(0, ALT[s], 1, FLOOR);
  if (c.at) {
    const peaks = c.at.r.passes.map((x) => x.peakHeat.toFixed(1)).join(' / ');
    console.log(`${s.padEnd(7)} skim alt ${c.at.sa.toFixed(0)} m, per-pass peaks ${peaks}`);
  }
}

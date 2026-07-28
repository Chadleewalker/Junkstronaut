'use strict';
// Q2: the heat-capacity window. Peaks for empty / full hold / endgame haul from the top of
// the band, at a range of commit floors, plus the skim ladder that has to bring the endgame
// haul home.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass, skimStudy } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

const P = {
  flight: { dry_mass_kg: 108, fuel_capacity_kg: 440, thrust_n: 6000, fuel_burn_kgs: 1.7 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 215, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: 8000, unstaged_heat_multiplier: 3 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 65,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.6 },
};

const hold = fullHoldMass(catalog, P, baseline);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const { world, cfg } = sim.buildConfig(baseline, P);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
console.log(`heatScale ${cfg.heatScale.toExponential(4)}  full hold ${hold.fullHold.toFixed(1)} kg  ` +
  `endgame ${heaviest.id} ${heaviest.mass_kg} kg  dry ${cfg.dryMass} kg`);

const ALT = { bottom: 65000, middle: 115000, top: 215000 };

// Coolest legal descent at k skims: entry pinned at the floor, skim altitude scanned.
function coolest(cargoMass, startAlt, skims, floor) {
  let best = Infinity, at = null;
  const alts = skims === 0 ? [world.atmTop * 0.5]
    : Array.from({ length: 33 }, (_, j) => world.atmTop * (0.30 + 0.68 * (j / 32)));
  for (const sa of alts) {
    if (skims > 0 && sa <= floor) continue;
    try {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass }, startAlt, sa, 0,
        { skims, entryPeriapsis: floor });
      if (r.landed && r.passes.length >= skims + 1) {
        const p = Math.max(...r.passes.map((x) => x.peakHeat));
        if (p < best) { best = p; at = r; }
      }
    } catch (e) { /* that depth does not fly */ }
  }
  return { peak: best, run: at };
}

const LOADS = [
  ['empty', 0],
  ['half hold', hold.fullHold / 2],
  ['full hold', hold.fullHold],
  ['endgame', heaviest.mass_kg],
];

console.log('\n--- peaks from the TOP of the band, by commit floor ---');
console.log('floor |  empty   half   full  endgame | gap full->endgame | endgame k=1  k=2');
for (const floor of [2000, 4000, 6000, 8000, 11000, 14000]) {
  const p = LOADS.map(([, m]) => coolest(m, ALT.top, 0, floor).peak);
  const e1 = coolest(heaviest.mass_kg, ALT.top, 1, floor).peak;
  const e2 = coolest(heaviest.mass_kg, ALT.top, 2, floor).peak;
  const gap = p[3] - p[2];
  console.log(`${String(floor).padStart(5)} | ${p.map((x) => x.toFixed(1).padStart(6)).join(' ')} | ` +
    `${gap.toFixed(1).padStart(6)} (${((p[3] / p[2] - 1) * 100).toFixed(1)}%) | ` +
    `${e1.toFixed(1).padStart(7)} ${e2.toFixed(1).padStart(6)}`);
}

console.log('\n--- plunge peaks at every sample, floor 8000 ---');
for (const s of ['bottom', 'middle', 'top']) {
  const p = LOADS.map(([, m]) => coolest(m, ALT[s], 0, 8000).peak);
  console.log(`${s.padEnd(7)} ${p.map((x) => x.toFixed(1).padStart(7)).join(' ')}`);
}

console.log('\n--- direct entry (periapsis 0, the skim study basis), empty ---');
for (const s of ['bottom', 'middle', 'top']) {
  const r = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, ALT[s], 0);
  console.log(`${s.padEnd(7)} peak ${Math.max(...r.passes.map((x) => x.peakHeat)).toFixed(1)}`);
}

console.log('\n--- skim study (measured multipliers), floor 8000 ---');
for (const s of ['bottom', 'middle', 'top']) {
  const st = skimStudy(world, cfg, ALT[s], P, s, 0);
  if (!st) { console.log(`${s}: none`); continue; }
  console.log(`${s.padEnd(7)} entry ${st.measured_at_entry_depth_m} m, skim alt ` +
    `${st.measured_at_skim_altitude_m} m -> [${st.skim_heat_multiplier_measured.join(', ')}]`);
  for (const d of st.by_entry_depth) {
    console.log(`        depth ${String(d.entry_depth_m).padStart(5)} m: bar ` +
      `[${d.series.map((x) => x.bar_vs_direct).join(', ')}]  peak bar ` +
      `${d.series.map((x) => x.entry_peak_heat.toFixed(1)).join(' / ')}`);
  }
}

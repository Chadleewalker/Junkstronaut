'use strict';
// Q3: what the VERIFICATION SWEEP itself sees — descentScan, bounded by the commit floor,
// at every band x load. This is the block the audit read `pass_counts_reachable` off, and
// the reason the last pass failed: at beta 22 the only reachable pass count was 1.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

const DRY = Number(process.env.DRY) || 1146;
const AREA = Number(process.env.AREA) || 870;
const P = {
  flight: { dry_mass_kg: DRY, fuel_capacity_kg: 3820, thrust_n: 74200, fuel_burn_kgs: 21.2 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 208, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: Number(process.env.FLOOR) || 8000, unstaged_heat_multiplier: 3 },
  ablation: { cycle_toll_base_pct: 5, cycle_toll_growth: 1.9,
              heat_cost_coefficient: 0.000007, heat_cost_exponent: 3, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: AREA,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.6 },
};

const hold = fullHoldMass(catalog, P, baseline);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const { world, cfg } = sim.buildConfig(baseline, P);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);

const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const LOADS = [
  ['empty', 0],
  ['half hold', hold.fullHold / 2],
  ['full hold', hold.fullHold],
  ['endgame', heaviest.mass_kg],
];

console.log(`dry ${DRY}  full hold ${hold.fullHold.toFixed(1)}  endgame ${heaviest.mass_kg}  chute ${AREA} m2`);
console.log('band    load        passes reachable | cheapest n | peak | touchdown | soft');
for (const s of ['bottom', 'middle', 'top']) {
  for (const [name, m] of LOADS) {
    const scan = sim.descentScan(world, { ...cfg, cargoMass: m }, ALT[s], P, s, 200);
    const byN = sim.ablationByPassCount(scan);
    if (!byN.length) { console.log(`${s.padEnd(7)} ${name.padEnd(11)} NO LANDING`); continue; }
    const best = byN.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a));
    console.log(`${s.padEnd(7)} ${name.padEnd(11)} ${JSON.stringify(byN.map((r) => r.passes)).padEnd(18)} ` +
      `${String(best.passes).padStart(6)} | ${best.peakHeat.toFixed(0).padStart(4)} | ` +
      `${best.touchdownSpeed.toFixed(2).padStart(9)} | ${best.touchdownSpeed <= 5 ? 'yes' : 'NO'}`);
  }
}

// The canopy, integrated rather than asserted.
console.log('\n--- terminal descent speed under the stated canopy (sea level) ---');
const rho0 = baseline.planet.sea_level_density_kgm3, g = baseline.planet.surface_gravity_ms2;
for (const [name, m] of [['empty', 0], ['half hold', hold.fullHold / 2], ['full hold', hold.fullHold],
                          ['8-slot hold', 191.06 * 8], ['10-slot hold', 191.06 * 10],
                          ['endgame', heaviest.mass_kg]]) {
  const mass = DRY + m;
  const closed = Math.sqrt((2 * mass * g) / (rho0 * P.landing.parachute_drag_coefficient * AREA));
  const scan = sim.descentScan(world, { ...cfg, cargoMass: m }, ALT.bottom, P, 'bottom', 120);
  const flown = scan.length ? Math.min(...scan.map((r) => r.touchdownSpeed)) : null;
  console.log(`${name.padEnd(12)} mass ${mass.toFixed(1).padStart(7)} kg  closed-form ${closed.toFixed(2)} m/s  ` +
    `flown(min) ${flown === null ? 'n/a' : flown.toFixed(2)} m/s`);
}

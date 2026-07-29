'use strict';
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');
const P = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13.0 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 185, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: 8000, unstaged_heat_multiplier: 3 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 630,
             parachute_drag_coefficient: 1.8, descent_speed_full_hold_ms: 3.99 },
};
const hold = fullHoldMass(catalog, P, baseline);
const { world, cfg } = sim.buildConfig(baseline, P);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
console.log('hold', hold.fullHold.toFixed(2), 'dryMass', cfg.dryMass);
const g = baseline.planet.surface_gravity_ms2, rho = baseline.planet.sea_level_density_kgm3;
const A = P.landing.parachute_area_m2, Cd = P.landing.parachute_drag_coefficient;
for (const [name, m] of [['empty', 0], ['full hold', hold.fullHold], ['module', 3600]]) {
  const algebra = Math.sqrt(2 * (cfg.dryMass + m) * g / (rho * Cd * A));
  const row = [];
  for (const alt of [65000, 115000, 215000]) {
    const r = sim.simulateDescent(world, { ...cfg, cargoMass: m }, alt, 8000, 0, { skims: m > 1000 ? 1 : 0, entryPeriapsis: 8000 });
    row.push(r.landed ? r.touchdownSpeed.toFixed(2) : 'no');
  }
  console.log(name.padEnd(10), 'mass', (cfg.dryMass + m).toFixed(1), 'algebra', algebra.toFixed(3), 'flown', row.join(' '));
}
// canopy tiers against the module
for (const area of [630, 900, 1200, 1400, 1600]) {
  console.log('area', area, 'full hold', Math.sqrt(2 * (cfg.dryMass + hold.fullHold) * g / (rho * Cd * area)).toFixed(2),
    'module', Math.sqrt(2 * (cfg.dryMass + 3600) * g / (rho * Cd * area)).toFixed(2));
}

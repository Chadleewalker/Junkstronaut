'use strict';
// Is the "committed plunge" still ONE pass at a raised floor, or has it quietly become an
// aerobraking decay? A rule that passes because everybody skims is not the rule.
const sim = require('../../lib/sim');
const sweep = require('../../lib/sweep');
const baseline = require('./inputs').baseline;
const catalog = require('./tmp_catalog_v3.json');
const base = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13,
            rcs_thrust_n: 2600, rcs_fuel_burn_kgs: 0.85, rotation_rate_degs: 90 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 185, unstaged_heat_multiplier: 3, commit_floor_m: 8000,
             heat_dissipation_s: 5, cargo_damage_interval_s: 3, off_retrograde_penalty: 1 },
  ablation: { cycle_toll_base_pct: 3.1, cycle_toll_growth: 1.17, heat_cost_coefficient: 0.0009,
              heat_cost_exponent: 2, skim_peak: 46.7, skim_heat_multiplier: [1, 0.434, 0.434, 0.434],
              heat_index: { bottom: 100, middle: 125, top: 160 }, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2, fragile_multiplier: 2,
             parachute_area_m2: 630, parachute_drag_coefficient: 1.8, descent_speed_full_hold_ms: 4.4 },
  tow_fee: {}, eva: {}, economy: {}, upgrades: [],
};
const { world, cfg } = sim.buildConfig(baseline, base);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, sweep.sampleAlt(baseline, 'bottom'));
const hold = sweep.fullHoldMass(catalog, base, baseline);
const loads = [['empty', 0], ['full', hold.fullHold], ['module', 3600]];
for (const floorM of (process.argv[2] || '8000').split(',').map(Number)) {
  const cells = [];
  for (const b of ['bottom', 'middle', 'top']) {
    const alt = sweep.sampleAlt(baseline, b);
    for (const [n, m] of loads) {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass: m }, alt, world.atmTop * 0.5, 0,
        { skims: 0, entryPeriapsis: floorM });
      cells.push(`${b[0]}/${n}=${r.landed ? Math.max(...r.passes.map((x) => x.peakHeat)).toFixed(1) : 'X'}` +
        `(${r.passes.length}p)`);
    }
  }
  console.log(String(floorM).padStart(6), cells.join(' '));
}

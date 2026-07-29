'use strict';
const sim = require('../../lib/sim');
const sweep = require('../../lib/sweep');
const baseline = require('./inputs').baseline;
const mk = (fuel, thrust) => ({
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: fuel, thrust_n: thrust, fuel_burn_kgs: 13,
            rcs_thrust_n: 2600, rcs_fuel_burn_kgs: 0.85, rotation_rate_degs: 90 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 212, unstaged_heat_multiplier: 3, commit_floor_m: 8000,
             heat_dissipation_s: 5, cargo_damage_interval_s: 3, off_retrograde_penalty: 1 },
  ablation: { cycle_toll_base_pct: 3.1, cycle_toll_growth: 1.17, heat_cost_coefficient: 0.0009,
              heat_cost_exponent: 2, skim_peak: 46.7, skim_heat_multiplier: [1, 0.434, 0.434, 0.434],
              heat_index: { bottom: 100, middle: 125, top: 160 }, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, parachute_area_m2: 900, parachute_drag_coefficient: 1.8,
             descent_speed_full_hold_ms: 4.55, damage_per_ms_over: 6, no_gear_multiplier: 2, fragile_multiplier: 2 },
  tow_fee: {}, eva: {}, economy: {}, upgrades: [],
});
for (const [tag, fuel, thrust] of [['base', 860, 57000], ['tank1', 1250, 57000],
                                   ['tank2+thr2', 1600, 76000], ['tank2', 1600, 57000]]) {
  const p = mk(fuel, thrust);
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, sweep.sampleAlt(baseline, 'bottom'));
  const out = [];
  for (const b of ['bottom', 'middle', 'top']) {
    const alt = sweep.sampleAlt(baseline, b);
    const orb = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt);
    const arc = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt * 1.15, { circularise: false, hangAltitude: alt });
    out.push(`${b}: orbit=${orb.reached ? (orb.fuelRemaining / cfg.fuel * 100).toFixed(1) + '%' : 'no'} ` +
      `arc=${arc.reached ? (arc.timeAbove || 0).toFixed(0) + 's/' + (arc.fuelRemaining / cfg.fuel * 100).toFixed(1) + '%' : 'no(' + (arc.why || '') + ')'}`);
  }
  console.log(tag.padEnd(11), out.join('  '));
}

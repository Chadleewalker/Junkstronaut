'use strict';
// Rev-3 probe: how the committed-plunge peaks move with reentry.commit_floor_m.
// The audit's finding is that no capacity separates the module's plunge from the full
// hold's, so the question is whether the OTHER parameter in that rule — the floor — can.
const sim = require('../../lib/sweep') && require('../../lib/sim');
const sweep = require('../../lib/sweep');
const baseline = require('./inputs').baseline;
const catalog = require('./tmp_catalog_v3.json');

const base = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13,
            rcs_thrust_n: 2600, rcs_fuel_burn_kgs: 0.85, rotation_rate_degs: 90 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 185, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             unstaged_heat_multiplier: 3, off_retrograde_penalty: 1, commit_floor_m: 8000 },
  ablation: { cycle_toll_base_pct: 3.1, cycle_toll_growth: 1.17, heat_cost_coefficient: 0.0009,
              heat_cost_exponent: 2, skim_peak: 46.7, skim_heat_multiplier: [1, 0.434, 0.434, 0.434],
              heat_index: { bottom: 100, middle: 125, top: 160 }, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2, fragile_multiplier: 2,
             parachute_area_m2: 630, parachute_drag_coefficient: 1.8, descent_speed_full_hold_ms: 4.4 },
  tow_fee: { free_radius_m: 1200, max_fee_fraction: 0.5, curve: 'linear' },
  eva: {}, economy: {}, upgrades: [],
};

const { world, cfg } = sim.buildConfig(baseline, base);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, sweep.sampleAlt(baseline, 'bottom'));
const hold = sweep.fullHoldMass(catalog, base, baseline);
const loads = [['empty', 0], ['full hold', hold.fullHold], ['module', 3600]];
const bands = ['bottom', 'middle', 'top'];

const floors = (process.argv[2] || '8000').split(',').map(Number);
for (const floorM of floors) {
  const out = { floor: floorM };
  for (const b of bands) {
    const alt = sweep.sampleAlt(baseline, b);
    for (const [name, m] of loads) {
      let peak = null;
      try {
        const r = sim.simulateDescent(world, { ...cfg, cargoMass: m }, alt, world.atmTop * 0.5, 0,
          { skims: 0, entryPeriapsis: floorM });
        peak = r.landed ? Math.max(...r.passes.map((x) => x.peakHeat)) : null;
      } catch (e) { peak = null; }
      out[`${b}/${name}`] = peak === null ? null : Number(peak.toFixed(1));
    }
  }
  const gap = out['bottom/module'] / out['top/full hold'];
  console.log(JSON.stringify(out), ' module@bottom / fullhold@top =', gap ? gap.toFixed(3) : 'n/a');
}

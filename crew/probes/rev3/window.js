'use strict';
// For each candidate commit floor, the three numbers the audit's rule turns on:
//   lower bound = max(full-hold plunge over bands, module's best skimmed peak at the top)
//   upper bound = min(module plunge over bands)
// A capacity ladder has to fit strictly between them.
const sim = require('../../lib/sim');
const sweep = require('../../lib/sweep');
const baseline = require('./inputs').baseline;
const catalog = require('./tmp_catalog_v3.json');
const base = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13,
            rcs_thrust_n: 2600, rcs_fuel_burn_kgs: 0.85, rotation_rate_degs: 90 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 114, unstaged_heat_multiplier: 3, commit_floor_m: 8000,
             heat_dissipation_s: 5, cargo_damage_interval_s: 3, off_retrograde_penalty: 1 },
  ablation: { cycle_toll_base_pct: 3.1, cycle_toll_growth: 1.17, heat_cost_coefficient: 0.0009,
              heat_cost_exponent: 2, skim_peak: 46.7, skim_heat_multiplier: [1, 0.434, 0.434, 0.434],
              heat_index: { bottom: 100, middle: 125, top: 160 }, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2, fragile_multiplier: 2,
             parachute_area_m2: 900, parachute_drag_coefficient: 1.8, descent_speed_full_hold_ms: 4.55 },
  tow_fee: {}, eva: {}, economy: {}, upgrades: [],
};
const { world, cfg } = sim.buildConfig(baseline, base);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, sweep.sampleAlt(baseline, 'bottom'));
const hold = sweep.fullHoldMass(catalog, base, baseline);
const N = 24;

function row(floorM, alt, m) {
  const out = [];
  for (const k of [0, 1, 2, 3]) {
    let best = Infinity, passes = null;
    const alts = k === 0 ? [world.atmTop * 0.5]
      : Array.from({ length: N }, (_, j) => world.atmTop * (0.25 + 0.74 * (j / (N - 1))));
    for (const sa of alts) {
      if (k > 0 && sa <= floorM) continue;
      let r; try { r = sim.simulateDescent(world, { ...cfg, cargoMass: m }, alt, sa, 0,
        { skims: k, entryPeriapsis: floorM }); } catch (e) { continue; }
      if (!r.landed || r.passes.length < k + 1) continue;
      const p = Math.max(...r.passes.map((x) => x.peakHeat));
      if (p < best) { best = p; passes = r.passes.length; }
    }
    out.push(Number.isFinite(best) ? { k, peak: Number(best.toFixed(1)), passes } : { k, peak: null });
  }
  return out;
}

for (const floorM of (process.argv[2] || '20000').split(',').map(Number)) {
  const res = { floor: floorM };
  for (const b of ['bottom', 'middle', 'top']) {
    const alt = sweep.sampleAlt(baseline, b);
    res[b] = { full: row(floorM, alt, hold.fullHold), mod: row(floorM, alt, 3600) };
  }
  const fullPlunge = ['bottom', 'middle', 'top'].map((b) => res[b].full[0].peak);
  const modPlunge = ['bottom', 'middle', 'top'].map((b) => res[b].mod[0].peak);
  const modSkimTop = Math.min(...res.top.mod.slice(1).filter((x) => x.peak !== null).map((x) => x.peak));
  const modSkimMid = Math.min(...res.middle.mod.slice(1).filter((x) => x.peak !== null).map((x) => x.peak));
  const lower = Math.max(...fullPlunge, modSkimTop);
  const upper = Math.min(...modPlunge);
  console.log(`floor ${floorM}: fullPlunge=[${fullPlunge}] modPlunge=[${modPlunge}] ` +
    `modSkim top=${modSkimTop} mid=${modSkimMid} -> window (${lower.toFixed(1)}, ${upper.toFixed(1)}) ` +
    `= ${(((upper - lower) / lower) * 100).toFixed(1)}%`);
  console.log('   top mod by k:', JSON.stringify(res.top.mod), ' mid mod by k:', JSON.stringify(res.middle.mod));
}

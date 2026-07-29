'use strict';
// Throwaway measurement probe for the Economy Balancer's rev-3 pass.
// Flies a candidate params object through lib/sweep.js's verification sweep so the numbers
// that go into game_params.json are measured rather than guessed.

const path = require('path');
const sweep = require('../../lib/sweep');

const baseline = require('../../out/params/baseline.json');
const catalog = require('./tmp_catalog_v2.json');

function params(over = {}) {
  const f = Object.assign({
    dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13,
    rcs_thrust_n: 2600, rcs_fuel_burn_kgs: 0.85, rotation_rate_degs: 90,
  }, over.flight || {});
  const l = Object.assign({
    soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2, fragile_multiplier: 2,
    parachute_area_m2: 630, parachute_drag_coefficient: 1.8, descent_speed_full_hold_ms: 4.4,
  }, over.landing || {});
  return {
    flight: f,
    cargo: Object.assign({ base_slots: 6, compactor_tier: 1 }, over.cargo || {}),
    reentry: Object.assign({
      heat_capacity: 185, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
      unstaged_heat_multiplier: 3, off_retrograde_penalty: 1, commit_floor_m: 8000,
    }, over.reentry || {}),
    ablation: Object.assign({
      cycle_toll_base_pct: 3.1, cycle_toll_growth: 1.17, heat_cost_coefficient: 0.0009,
      heat_cost_exponent: 2, skim_peak: 46.7,
      skim_heat_multiplier: [1, 0.434, 0.434, 0.434],
      heat_index: { bottom: 100, middle: 125, top: 160 },
      plate_capacity_pct: 100,
    }, over.ablation || {}),
    landing: l,
    tow_fee: { free_radius_m: 1200, max_fee_fraction: 0.5, curve: 'linear' },
    eva: { suit_mass_kg: 110, jetpack_thrust_n: 240, jetpack_fuel_kg: 18, jetpack_burn_kgs: 0.35,
           base_tether_slots: 2, magnet_hold_force_n: 900, magnet_range_screens: 0.125,
           latch_jerk_coefficient: 1, swing_jerk_coefficient: 1 },
    economy: { launch_cost: 120, replate_cost_per_pct: 3, repair_cost_per_pct: 5,
               value_gradient: { at_bottom: 1, at_top: 5.5 },
               size_class_base_value: { small: 40, medium: 90, oversized: 320 },
               fragile_value_premium: 3 },
    upgrades: [],
  };
}

function report(tag, over) {
  const p = params(over);
  const t0 = Date.now();
  const v = sweep.verificationSweep(baseline, p, catalog);
  console.log(`\n===== ${tag}  (${((Date.now() - t0) / 1000).toFixed(1)}s) =====`);
  console.log('hold:', JSON.stringify(v.cargo), 'beta:', JSON.stringify(v.ballistic_coefficient).slice(0, 90));
  console.log('parachute:', JSON.stringify(v.parachute));
  console.log('ascents:');
  for (const a of v.ascents) {
    console.log(`  ${a.band}: reached=${a.reached} route=${a.route} apex=${a.arc_apex_m} eva=${a.arc_eva_window_s}s ` +
      `arcMargin=${a.arc_fuel_margin_pct}% orbMargin=${a.fuel_margin_pct}% climbHeat=${a.climb_peak_heat} why=${a.why}`);
  }
  console.log('committed descents (plunge / by-skim peaks):');
  for (const r of v.committed_descents) {
    console.log(`  ${r.band.padEnd(7)} ${r.load.padEnd(24)} cargo=${String(r.cargo_kg).padStart(7)} ` +
      r.by_skims.map((s) => `k${s.skims}=${s.peak_heat === null ? '--' : s.peak_heat}`).join(' ') +
      `  td=${r.by_skims.map((s) => s.touchdown_ms).join('/')}`);
  }
  console.log('skims (measured multiplier, entry depth 0):');
  for (const k of Object.keys(v.skims)) {
    const s = v.skims[k];
    console.log(`  ${k}: mult=${JSON.stringify(s.skim_heat_multiplier_measured)} skimAlt=${s.measured_at_skim_altitude_m} ` +
      `entryPeaks=${JSON.stringify(s.by_entry_depth[0].series.map((x) => x.entry_peak_heat))} skimPeaks=${JSON.stringify(s.by_entry_depth[0].series.map((x) => x.skim_peak_heat))}`);
  }
  console.log('descentScan rows (single-periapsis, for touchdown speeds):');
  for (const d of v.descents) {
    console.log(`  ${d.band.padEnd(7)} ${d.load.padEnd(24)} peak=${d.peak_heat} td=${d.touchdown_ms} soft=${d.soft_landing} abl=${d.cheapest_ablation_pct}`);
  }
  return v;
}

const arg = process.argv[2] || 'base';
const overrides = JSON.parse(process.argv[3] || '{}');
report(arg, overrides);

'use strict';
// A planet and a ship for the tests.
//
// Written out here rather than loaded from out/ so the tests survive the recorded run being
// regenerated or deleted, but kept realistic on purpose: these are the same shape and scale
// the Researcher actually produces. A world with the wrong ballistic regime cannot exercise
// multi-pass aerobraking at all, and a test that never sees a second atmospheric pass is not
// testing the thing this crew is about.

const BASELINE = {
  planet: {
    radius_m: 200000,
    surface_gravity_ms2: 4,
    sea_level_density_kgm3: 0.6,
    atmosphere_top_m: 72000,
    scale_height_m: 5500,
  },
  reentry: {
    drag_coefficient_shield: 1.5,
    drag_coefficient_hull: 0.35,
    reference_area_m2: 3.5,
    heating_velocity_exponent: 3,
    plasma_onset_speed_ms: 600,
  },
  bands: [
    { name: 'suborbital', altitude_min_m: 80000, altitude_max_m: 120000 },
    { name: 'low', altitude_min_m: 140000, altitude_max_m: 220000 },
    { name: 'high', altitude_min_m: 250000, altitude_max_m: 340000 },
  ],
};

const PARAMS = {
  flight: { dry_mass_kg: 900, fuel_capacity_kg: 1900, thrust_n: 35200, fuel_burn_kgs: 16 },
  reentry: { heat_dissipation_s: 5, unstaged_heat_multiplier: 3, heat_capacity: 100 },
  landing: {
    soft_landing_ms: 5,
    parachute_area_m2: 630,
    parachute_drag_coefficient: 1.8,
    descent_speed_full_hold_ms: 4.6,
  },
  ablation: {
    cycle_toll_base_pct: 2,
    cycle_toll_growth: 1.5,
    heat_cost_coefficient: 0.000018,
    heat_cost_exponent: 3,
    plate_capacity_pct: 100,
  },
  cargo: { base_slots: 6, compactor_tier: 1 },
};

const bandAlt = (name) => {
  const b = BASELINE.bands.find((x) => x.name === name);
  return (b.altitude_min_m + b.altitude_max_m) / 2;
};

module.exports = { BASELINE, PARAMS, bandAlt };

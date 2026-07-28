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
  // ONE band, per GDD §2.6 — a single envelope with a value gradient. The three altitudes
  // inside it are the sample points the sweep flies to measure that gradient, bottom to top.
  // They are not tiers: nothing may branch on them, and they sit where the old three bands'
  // midpoints did so the numbers these tests assert stay comparable across the change.
  bands: [
    {
      name: 'orbit',
      altitude_min_m: 80000,
      altitude_max_m: 340000,
      samples: [
        { name: 'bottom', altitude_m: 100000, orbital_speed_ms: 730.3, period_s: 2580.6 },
        { name: 'middle', altitude_m: 180000, orbital_speed_ms: 648.9, period_s: 3679.5 },
        { name: 'top', altitude_m: 295000, orbital_speed_ms: 568.5, period_s: 5470.4 },
      ],
    },
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

// The altitude of a named sample point. Mirrors lib/sweep.js's sampleAlt deliberately: the
// tests should break if the two ever disagree about where a sample sits.
const sampleAlt = (name) => {
  const s = BASELINE.bands[0].samples.find((x) => x.name === name);
  return s.altitude_m;
};

module.exports = { BASELINE, PARAMS, sampleAlt };

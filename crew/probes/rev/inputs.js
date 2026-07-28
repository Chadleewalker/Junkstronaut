'use strict';
// The current-contract baseline and catalog, as handed to the Economy Balancer in its
// revision prompt. Kept here because out/ still holds the previous three-band recording.
module.exports.baseline = {
  agent: 'researcher',
  planet: {
    radius_m: 200000,
    surface_gravity_ms2: 9,
    atmosphere_top_m: 43000,
    scale_height_m: 3100,
    sea_level_density_kgm3: 1.5,
  },
  bands: [
    {
      name: 'orbit',
      altitude_min_m: 50000,
      altitude_max_m: 280000,
      samples: [
        { name: 'bottom', altitude_m: 65000, orbital_speed_ms: 1165.5, period_s: 1428.6 },
        { name: 'middle', altitude_m: 115000, orbital_speed_ms: 1069, period_s: 1851.4 },
        { name: 'top', altitude_m: 215000, orbital_speed_ms: 931.4, period_s: 2799.6 },
      ],
    },
  ],
  reentry: {
    heating_onset_speed_ms: 580,
    plasma_onset_speed_ms: 900,
    heating_velocity_exponent: 3,
    drag_coefficient_hull: 0.35,
    drag_coefficient_shield: 1.4,
    reference_area_m2: 3.5,
  },
};

const D = (id, altitude_m, size_class, fragile, mass_kg, spawn_weight) =>
  ({ id, display_name: id, altitude_m, size_class, fragile, mass_kg, spawn_weight });

module.exports.catalog = {
  agent: 'debris-designer',
  size_classes: {
    small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true },
    medium: { slots_crushed: 2, slots_uncrushed: 4, hand_tetherable: true },
    oversized: { slots_crushed: 6, slots_uncrushed: 12, hand_tetherable: false },
  },
  debris: [
    D('scorched_hull_panel', 52000, 'small', false, 11.3, 12),
    D('bent_truss_section', 58000, 'medium', false, 16.5, 11),
    D('cracked_solar_array', 63000, 'medium', true, 13.5, 4),
    D('dented_fuel_bladder', 71000, 'small', false, 19.5, 10),
    D('foil_insulation_bale', 79000, 'small', false, 18, 9),
    D('collapsed_antenna_dish', 88000, 'oversized', false, 30, 3),
    D('reaction_wheel_housing', 97000, 'small', false, 33, 8),
    D('snapped_boom_arm', 108000, 'medium', false, 31.5, 8),
    D('shattered_camera_mast', 118000, 'medium', true, 28.5, 4),
    D('battery_pallet', 124000, 'small', false, 39, 7),
    D('torn_radiator_panel', 132000, 'medium', true, 39, 4),
    D('cryo_tank_girdle', 141000, 'medium', false, 48, 8),
    D('gyro_package', 149000, 'small', false, 52.5, 7),
    D('docking_collar', 157000, 'medium', false, 57, 7),
    D('buckled_truss_node', 166000, 'medium', false, 60, 7),
    D('optics_bench', 175000, 'medium', true, 55.5, 4),
    D('deployable_mast_cassette', 186000, 'oversized', false, 78, 2),
    D('ion_thruster_cluster', 196000, 'small', false, 75, 6),
    D('cracked_pressure_dome', 209000, 'medium', true, 84, 3),
    D('reactor_shield_plug', 220000, 'small', false, 102, 6),
    D('comsat_bus_frame', 232000, 'medium', false, 108, 8),
    D('telescope_mirror_segment', 244000, 'medium', true, 105, 2),
    D('isotope_cask', 255000, 'small', false, 132, 5),
    D('solar_wing_spine', 266000, 'oversized', false, 142.5, 2),
    D('scorched_reentry_cone', 276000, 'medium', true, 138, 2),
  ],
};

'use strict';
// Baseline and catalog exactly as handed to the Economy Balancer in THIS revision prompt
// (the 30-piece light catalog, before any mass rescale). Kept beside the rev/rev2 inputs
// because out/ holds a different recording.
module.exports.baseline = {
  agent: 'researcher',
  planet: { radius_m: 200000, surface_gravity_ms2: 9, atmosphere_top_m: 43000,
            scale_height_m: 3100, sea_level_density_kgm3: 1.5 },
  bands: [{ name: 'orbit', altitude_min_m: 50000, altitude_max_m: 280000,
    samples: [ { name: 'bottom', altitude_m: 65000, orbital_speed_ms: 1165.5, period_s: 1428.6 },
               { name: 'middle', altitude_m: 115000, orbital_speed_ms: 1069, period_s: 1851.4 },
               { name: 'top', altitude_m: 215000, orbital_speed_ms: 931.4, period_s: 2799.6 } ] }],
  reentry: { heating_onset_speed_ms: 583, plasma_onset_speed_ms: 875, heating_velocity_exponent: 3,
             drag_coefficient_hull: 0.4, drag_coefficient_shield: 1.4, reference_area_m2: 3.5 },
};
const D = (id, altitude_m, size_class, fragile, mass_kg, spawn_weight) =>
  ({ id, display_name: id, altitude_m, size_class, fragile, mass_kg, spawn_weight });
module.exports.catalog = {
  agent: 'debris-designer',
  size_classes: {
    small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true, fragile_crushable: false },
    medium: { slots_crushed: 2, slots_uncrushed: 4, hand_tetherable: true, fragile_crushable: false },
    oversized: { slots_crushed: 6, slots_uncrushed: 12, hand_tetherable: false, fragile_crushable: false },
  },
  debris: [
    D('torn_foil_blanket', 52500, 'small', true, 5.5, 3),
    D('crumpled_panel_stack', 56000, 'small', false, 8, 18),
    D('cracked_solar_array', 61500, 'medium', true, 10.5, 2),
    D('bent_truss_section', 67000, 'medium', false, 13, 15),
    D('spent_kick_motor_casing', 73500, 'small', false, 15.5, 12),
    D('collapsed_dish_frame', 86500, 'oversized', false, 48, 2),
    D('shredded_antenna_mesh', 93000, 'medium', true, 19, 2),
    D('cracked_battery_pallet', 99500, 'medium', false, 22.5, 11),
    D('seized_reaction_wheel_housing', 106000, 'small', false, 25, 12),
    D('burst_pressurant_sphere', 113000, 'small', false, 27, 10),
    D('delaminated_radiator_fin', 120000, 'medium', true, 24, 2),
    D('torn_solar_wing_spar', 131000, 'medium', false, 34, 11),
    D('cracked_optics_barrel', 138000, 'small', true, 30, 3),
    D('fractured_docking_collar', 145000, 'medium', false, 41, 10),
    D('dead_thruster_quad', 152500, 'small', false, 45, 12),
    D('buckled_pressure_bulkhead', 160000, 'oversized', false, 96, 2),
    D('ruptured_helium_tank', 167000, 'medium', false, 52, 11),
    D('shattered_star_tracker', 174000, 'small', true, 48, 4),
    D('warped_gyro_deck', 181500, 'medium', false, 61, 11),
    D('cracked_ablative_nose_cone', 189000, 'medium', true, 58, 3),
    D('split_avionics_rack', 197500, 'medium', true, 64, 2),
    D('torn_reactor_shield_plate', 209000, 'medium', false, 82, 11),
    D('cracked_deep_space_dish', 217500, 'medium', true, 78, 3),
    D('fused_ion_grid_assembly', 226000, 'small', true, 88, 2),
    D('severed_boom_mast', 234000, 'oversized', false, 165, 2),
    D('scorched_fuel_cell_stack', 242500, 'medium', false, 104, 9),
    D('shattered_cryo_dewar', 251000, 'medium', true, 98, 3),
    D('impact_pitted_engine_bell', 259500, 'medium', false, 122, 7),
    D('cracked_command_module_hatch', 268000, 'small', true, 112, 2),
    D('armstrongs_module', 277000, 'small', false, 3600, 1),
  ],
};

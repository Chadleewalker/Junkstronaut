'use strict';
// Finer scan: base ship to the bottom sample (65,000 m) with margin, plus what the
// fuel-tank and thruster tiers would then buy.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { baseline } = require('./inputs');

const base = {
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 215, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: 8000, unstaged_heat_multiplier: 3 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 65,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.6 },
};

function fly(dry, fuel, thrust, burn, target) {
  const p = JSON.parse(JSON.stringify(base));
  p.flight = { dry_mass_kg: dry, fuel_capacity_kg: fuel, thrust_n: thrust, fuel_burn_kgs: burn };
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const arc = sim.simulateAscent(world, cfg, target * 1.15,
    { circularise: false, hangAltitude: target });
  const orb = sim.simulateAscent(world, cfg, target);
  return { arc, orb };
}

const DRY = Number(process.env.DRY) || 108;
const rows = [];
for (const fuel of [320, 380, 440, 500, 560]) {
  for (const thrust of [4000, 5000, 6000, 7500, 9000]) {
    for (const isp of [2400, 3000, 3600]) {
      const burn = thrust / isp;
      const { arc, orb } = fly(DRY, fuel, thrust, burn, 65000);
      rows.push({ fuel, thrust, isp, burn,
        twr: thrust / ((DRY + fuel) * 9),
        apex: arc.apoapsisAlt || 0, eva: arc.timeAbove || 0,
        fuelPct: ((arc.fuelRemaining || 0) / fuel) * 100,
        heat: arc.peakHeat || 0, t: arc.ascentTime || 0,
        orbit: orb.reached ? (orb.fuelRemaining / fuel) * 100 : null });
    }
  }
}
rows.sort((a, b) => b.apex - a.apex);
console.log(`dry ${DRY} kg`);
console.log(' fuel thrust  isp  burn |  TWR |   apex   eva  fuel%   heat  time | orbit fuel%');
for (const r of rows.slice(0, 30)) {
  console.log(
    `${String(r.fuel).padStart(5)} ${String(r.thrust).padStart(6)} ${String(r.isp).padStart(5)} ` +
    `${r.burn.toFixed(2).padStart(5)} | ${r.twr.toFixed(2).padStart(4)} | ` +
    `${r.apex.toFixed(0).padStart(6)} ${r.eva.toFixed(0).padStart(5)} ${r.fuelPct.toFixed(1).padStart(6)} ` +
    `${r.heat.toFixed(1).padStart(6)} ${r.t.toFixed(0).padStart(5)} | ` +
    `${r.orbit === null ? '   no' : r.orbit.toFixed(1).padStart(5)}`);
}

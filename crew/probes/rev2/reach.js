'use strict';
// Q1: at dry_mass 1146 kg, which tank/thruster reaches the band by arc and by orbit?
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { baseline } = require('./inputs');

const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const DRY = Number(process.env.DRY) || 1146;
const VE = Number(process.env.VE) || 3500;
const FUELS = (process.env.FUELS || '2800,3400,3800,4400').split(',').map(Number);
const THRUSTS = (process.env.THRUSTS || '55000,70000,85000,100000').split(',').map(Number);

const BASE = {
  flight: {}, cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 230, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: 8000, unstaged_heat_multiplier: 3 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 870,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.6 },
};

console.log(`dry ${DRY} kg, ve ${VE} m/s`);
console.log('fuel  thrust  TWR    dv | bottom            | middle            | top               | climb');
for (const fuel of FUELS) {
  for (const thrust of THRUSTS) {
    const p = JSON.parse(JSON.stringify(BASE));
    p.flight = { dry_mass_kg: DRY, fuel_capacity_kg: fuel, thrust_n: thrust, fuel_burn_kgs: thrust / VE };
    const { world, cfg } = sim.buildConfig(baseline, p);
    cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
    const cells = []; let climb = 0;
    for (const s of ['bottom', 'middle', 'top']) {
      const arc = sim.simulateAscent(world, cfg, ALT[s] * 1.15, { circularise: false, hangAltitude: ALT[s] });
      const orb = sim.simulateAscent(world, cfg, ALT[s]);
      climb = Math.max(climb, arc.peakHeat || 0, orb.peakHeat || 0);
      cells.push(arc.reached || orb.reached
        ? `${(arc.timeAbove || 0).toFixed(0).padStart(4)}s arc${((arc.fuelRemaining || 0) / fuel * 100).toFixed(0).padStart(3)}% orb${orb.reached ? ((orb.fuelRemaining / fuel) * 100).toFixed(0).padStart(3) + '%' : '  no'}`
        : `   UNREACHED @${(arc.apoapsisAlt || 0).toFixed(0)}`.padEnd(17));
    }
    const dv = VE * Math.log((DRY + fuel) / DRY);
    console.log(`${String(fuel).padStart(5)} ${String(thrust).padStart(6)} ${(thrust / ((DRY + fuel) * 9)).toFixed(2).padStart(5)} ${dv.toFixed(0).padStart(5)} | ${cells.join(' | ')} | ${climb.toFixed(0)}`);
  }
}

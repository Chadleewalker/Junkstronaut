'use strict';
// Does the upgrade ladder actually buy the routes the GDD claims it buys?
// Base ship: arc to the band floor. Tank tier 1: circularise at the floor.
// Full upgrades: reach the top of the band, where Armstrong's module hangs.

const sim = require('../../lib/sim');
const baseline = require('../../out/params/baseline.json');

const base = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13 },
  reentry: { unstaged_heat_multiplier: 3, heat_dissipation_s: 5, commit_floor_m: 8000 },
  landing: { parachute_area_m2: 630, parachute_drag_coefficient: 1.8 },
};

function fly(tag, over, alt) {
  const p = JSON.parse(JSON.stringify(base));
  Object.assign(p.flight, over);
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const orb = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt);
  const arc = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt * 1.15,
    { circularise: false, hangAltitude: alt });
  console.log(`${tag.padEnd(34)} alt=${String(alt).padStart(6)}  ` +
    `orbit=${String(!!orb.reached).padEnd(5)} orbMargin=${((orb.fuelRemaining || 0) / cfg.fuel * 100).toFixed(1)}%  ` +
    `arc=${String(!!arc.reached).padEnd(5)} apex=${(arc.apoapsisAlt || 0).toFixed(0).padStart(6)} ` +
    `eva=${(arc.timeAbove || 0).toFixed(1)}s arcMargin=${((arc.fuelRemaining || 0) / cfg.fuel * 100).toFixed(1)}% ` +
    `climbHeat=${(arc.peakHeat || orb.peakHeat || 0).toFixed(1)} why=${orb.why || '-'}`);
}

fly('base ship', {}, 50000);
fly('base ship', {}, 65000);
fly('tank t1 (1250)', { fuel_capacity_kg: 1250 }, 50000);
fly('tank t1 (1250)', { fuel_capacity_kg: 1250 }, 65000);
fly('tank t2 (1600)', { fuel_capacity_kg: 1600 }, 115000);
fly('tank t2 + thruster t2', { fuel_capacity_kg: 1600, thrust_n: 76000 }, 215000);
fly('tank t2 + thruster t2', { fuel_capacity_kg: 1600, thrust_n: 76000 }, 277000);
fly('full upgrades, lighter shield', { fuel_capacity_kg: 1600, thrust_n: 76000, dry_mass_kg: 1250 }, 277000);

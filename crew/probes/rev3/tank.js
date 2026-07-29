'use strict';
// GDD 2.5's clearest progression beat, in numbers: the base ship arcs to the band floor with
// fuel to spare and circularises there with nothing; the first tank upgrade turns the hop
// into a stay. Scan the tank against both claims. Fuel is jettisoned at staging, so nothing
// here touches a single reentry figure.

const sim = require('../../lib/sim');
const baseline = require('../../out/params/baseline.json');

const base = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13 },
  reentry: { unstaged_heat_multiplier: 3, heat_dissipation_s: 5, commit_floor_m: 8000 },
  landing: { parachute_area_m2: 630, parachute_drag_coefficient: 1.8 },
};

for (const fuel of [860, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400]) {
  const p = JSON.parse(JSON.stringify(base));
  p.flight.fuel_capacity_kg = fuel;
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const orb = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, 50000);
  const arc = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, 50000 * 1.15,
    { circularise: false, hangAltitude: 50000 });
  console.log(`fuel=${String(fuel).padStart(5)}  arc apex=${(arc.apoapsisAlt || 0).toFixed(0).padStart(6)} ` +
    `eva=${(arc.timeAbove || 0).toFixed(1).padStart(6)}s arcLeft=${((arc.fuelRemaining || 0) / fuel * 100).toFixed(1).padStart(5)}%  ` +
    `circ=${String(!!orb.reached).padEnd(5)} orbLeft=${((orb.fuelRemaining || 0) / fuel * 100).toFixed(1).padStart(5)}% ` +
    `climbHeat=${(arc.peakHeat || 0).toFixed(1)}`);
}

'use strict';
// Question 8: is the module run reachable at full upgrades? Armstrong's module hangs at
// 277,000 m and the sweep's samples top out at 215,000, so fly both.

const sim = require('../../lib/sim');
const baseline = require('../../out/params/baseline.json');

const base = {
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 1100, thrust_n: 57000, fuel_burn_kgs: 13 },
  reentry: { unstaged_heat_multiplier: 3, heat_dissipation_s: 5, commit_floor_m: 8000 },
  landing: { parachute_area_m2: 630, parachute_drag_coefficient: 1.8 },
};

const rigs = [
  ['base                    ', { fuel_capacity_kg: 1100, thrust_n: 57000, dry_mass_kg: 1400 }],
  ['tank t1                 ', { fuel_capacity_kg: 1300, thrust_n: 57000, dry_mass_kg: 1400 }],
  ['tank t2                 ', { fuel_capacity_kg: 1500, thrust_n: 57000, dry_mass_kg: 1400 }],
  ['tank t2 + thrust t1     ', { fuel_capacity_kg: 1500, thrust_n: 66000, dry_mass_kg: 1400 }],
  ['tank t2 + thrust t2     ', { fuel_capacity_kg: 1500, thrust_n: 76000, dry_mass_kg: 1400 }],
  ['tank t2 + thrust t2 -100', { fuel_capacity_kg: 1500, thrust_n: 76000, dry_mass_kg: 1300 }],
];

for (const alt of [115000, 215000, 277000]) {
  for (const [tag, over] of rigs) {
    const p = JSON.parse(JSON.stringify(base));
    Object.assign(p.flight, over);
    const { world, cfg } = sim.buildConfig(baseline, p);
    cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
    const orb = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt);
    const arc = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt * 1.15,
      { circularise: false, hangAltitude: alt });
    console.log(`alt=${String(alt).padStart(6)} ${tag} circ=${String(!!orb.reached).padEnd(5)} ` +
      `orbLeft=${((orb.fuelRemaining || 0) / cfg.fuel * 100).toFixed(1).padStart(5)}%  ` +
      `arc=${String(!!arc.reached).padEnd(5)} apex=${(arc.apoapsisAlt || 0).toFixed(0).padStart(6)} ` +
      `eva=${(arc.timeAbove || 0).toFixed(1).padStart(6)}s climbHeat=${(arc.peakHeat || orb.peakHeat || 0).toFixed(1)}`);
  }
  console.log('');
}

'use strict';
// Q3: what does each tank/thruster tier actually open up? Reach per sample, by fuel load.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { baseline } = require('./inputs');
const P = require('./params');

const ALT = { bottom: 65000, middle: 115000, top: 215000 };

function reach(fuel, thrust, burn) {
  const p = JSON.parse(JSON.stringify(P));
  p.flight.fuel_capacity_kg = fuel;
  p.flight.thrust_n = thrust;
  p.flight.fuel_burn_kgs = burn;
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const out = {};
  for (const s of Object.keys(ALT)) {
    const orb = sim.simulateAscent(world, cfg, ALT[s]);
    const arc = sim.simulateAscent(world, cfg, ALT[s] * 1.15,
      { circularise: false, hangAltitude: ALT[s] });
    out[s] = {
      orbit: orb.reached ? ((orb.fuelRemaining / fuel) * 100).toFixed(0) + '%' : 'no',
      arc: arc.reached ? `${(arc.timeAbove).toFixed(0)}s/${((arc.fuelRemaining / fuel) * 100).toFixed(0)}%` : 'no',
      apex: (arc.apoapsisAlt || 0).toFixed(0),
    };
  }
  return out;
}

console.log('fuel thrust burn |  bottom orbit/arc      | middle                | top');
for (const [fuel, thrust, burn] of [
  [220, 6000, 1.7], [260, 6000, 1.7], [300, 6000, 1.7], [340, 6000, 1.7],
  [380, 6000, 1.7], [440, 6000, 1.7],
  [300, 7500, 2.1], [380, 7500, 2.1], [440, 7500, 2.1],
  [380, 9000, 2.5], [440, 9000, 2.5], [520, 9000, 2.5],
]) {
  const r = reach(fuel, thrust, burn);
  const c = (s) => `${r[s].orbit.padStart(4)}/${r[s].arc.padStart(9)}@${r[s].apex.padStart(6)}`;
  console.log(`${String(fuel).padStart(4)} ${String(thrust).padStart(6)} ${burn.toFixed(2)} | ` +
    `${c('bottom')} | ${c('middle')} | ${c('top')}`);
}

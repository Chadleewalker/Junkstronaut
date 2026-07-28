'use strict';
// Q3c: every purchasable tank/thruster combination must still fly. TWR, reach, margins.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { baseline } = require('./inputs');
const P = require('./params');

const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const DRY = 108, BURN_RATIO = Number(process.env.VE) || 3500;

const FUELS = (process.env.FUELS || '360,460,560').split(',').map(Number);
const THRUSTS = (process.env.THRUSTS || '7000,8500,10000').split(',').map(Number);

console.log(`dry ${DRY} kg, exhaust velocity ${BURN_RATIO} m/s`);
console.log('fuel thrust  TWR |  bottom          | middle           | top              | climb');
for (const fuel of FUELS) {
  for (const thrust of THRUSTS) {
    const burn = thrust / BURN_RATIO;
    const p = JSON.parse(JSON.stringify(P));
    p.flight = { ...p.flight, dry_mass_kg: DRY, fuel_capacity_kg: fuel, thrust_n: thrust, fuel_burn_kgs: burn };
    const { world, cfg } = sim.buildConfig(baseline, p);
    cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
    const cells = [];
    let climb = 0;
    for (const s of ['bottom', 'middle', 'top']) {
      const arc = sim.simulateAscent(world, cfg, ALT[s] * 1.15,
        { circularise: false, hangAltitude: ALT[s] });
      const orb = sim.simulateAscent(world, cfg, ALT[s]);
      climb = Math.max(climb, arc.peakHeat || 0, orb.peakHeat || 0);
      cells.push(arc.reached || orb.reached
        ? `${(arc.timeAbove || 0).toFixed(0).padStart(4)}s arc${((arc.fuelRemaining || 0) / fuel * 100).toFixed(0).padStart(3)}%` +
          ` orb${orb.reached ? ((orb.fuelRemaining / fuel) * 100).toFixed(0).padStart(3) + '%' : '  no'}`
        : `  UNREACHED @${(arc.apoapsisAlt || 0).toFixed(0)}`);
    }
    console.log(`${String(fuel).padStart(4)} ${String(thrust).padStart(6)} ` +
      `${(thrust / ((DRY + fuel) * 9)).toFixed(2).padStart(4)} | ${cells.join(' | ')} | ${climb.toFixed(0)}`);
  }
}

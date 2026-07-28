'use strict';
// Q3b: find an exhaust velocity where altitude is something the tank and thruster buy.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { baseline } = require('./inputs');
const P = require('./params');

const ALT = { bottom: 65000, middle: 115000, top: 215000 };

function reach(dry, fuel, thrust, burn) {
  const p = JSON.parse(JSON.stringify(P));
  p.flight = { ...p.flight, dry_mass_kg: dry, fuel_capacity_kg: fuel, thrust_n: thrust, fuel_burn_kgs: burn };
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const out = {};
  for (const s of Object.keys(ALT)) {
    const arc = sim.simulateAscent(world, cfg, ALT[s] * 1.15,
      { circularise: false, hangAltitude: ALT[s] });
    const orb = sim.simulateAscent(world, cfg, ALT[s]);
    out[s] = { ok: !!(arc.reached || orb.reached), eva: arc.timeAbove || 0,
               fuel: ((arc.fuelRemaining || 0) / fuel) * 100, apex: arc.apoapsisAlt || 0,
               orb: orb.reached, heat: arc.peakHeat || 0 };
  }
  return out;
}

const DRY = 108;
console.log('  ve fuel thrust | bottom eva/fuel%/orb | middle              | top');
for (const burn of [1.7, 2.5, 3.5, 4.5, 5.5, 7]) {
  for (const fuel of [300, 440, 620]) {
    const r = reach(DRY, fuel, 6000, burn);
    const c = (s) => r[s].ok
      ? `${r[s].eva.toFixed(0).padStart(4)}s ${r[s].fuel.toFixed(0).padStart(3)}% ${r[s].orb ? 'orb' : 'arc'}`
      : `  no @${r[s].apex.toFixed(0).padStart(6)}`;
    console.log(`${(6000 / burn).toFixed(0).padStart(4)} ${String(fuel).padStart(4)} ` +
      `  6000 | ${c('bottom')} | ${c('middle')} | ${c('top')}   climb ${r.bottom.heat.toFixed(0)}`);
  }
}

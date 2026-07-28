'use strict';
// Q1: what flight numbers get the base ship to the band floor (65,000 m) on an arc?
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

const base = {
  agent: 'economy-balancer',
  flight: { dry_mass_kg: 100, fuel_capacity_kg: 260, thrust_n: 5200, fuel_burn_kgs: 1.7 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 215, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: 8000, unstaged_heat_multiplier: 3 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 65,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.6 },
};

const hold = fullHoldMass(catalog, base, baseline);
console.log(`per slot ${hold.perSlot.toFixed(2)} kg; full hold (6) ${hold.fullHold.toFixed(1)} kg`);
for (const s of [6, 8, 10]) console.log(`  ${s} slots -> ${(hold.perSlot * s).toFixed(1)} kg`);

const FLOOR = 65000;

function fly(dry, fuel, thrust, burn, target = FLOOR) {
  const p = JSON.parse(JSON.stringify(base));
  p.flight = { dry_mass_kg: dry, fuel_capacity_kg: fuel, thrust_n: thrust, fuel_burn_kgs: burn };
  const { world, cfg } = sim.buildConfig(baseline, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const arc = sim.simulateAscent(world, cfg, target * 1.15,
    { circularise: false, hangAltitude: target });
  const orb = sim.simulateAscent(world, cfg, target);
  return { arc, orb, cfg, world };
}

const dv = (dry, fuel, thrust, burn) => (thrust / burn) * Math.log((dry + fuel) / dry);

console.log('\n dry  fuel thrust  burn |   dv  TWR |  apex   eva  fuel%  climbHeat | orbit');
const rows = [];
for (const dry of [100, 110, 120]) {
  for (const fuel of [200, 300, 420, 600]) {
    for (const thrust of [5200, 12000, 25000, 45000, 80000]) {
      for (const burn of [thrust / 2400, thrust / 3000]) {
        const { arc, orb, cfg } = fly(dry, fuel, thrust, burn);
        rows.push({
          dry, fuel, thrust, burn,
          dv: dv(dry, fuel, thrust, burn),
          twr: thrust / ((dry + fuel) * 9),
          apex: arc.apoapsisAlt || 0,
          eva: arc.timeAbove || 0,
          fuelPct: ((arc.fuelRemaining || 0) / fuel) * 100,
          heat: arc.peakHeat || 0,
          orbit: !!orb.reached,
          orbFuel: orb.reached ? (orb.fuelRemaining / fuel) * 100 : null,
        });
      }
    }
  }
}
rows.sort((a, b) => b.apex - a.apex);
for (const r of rows.slice(0, 28)) {
  console.log(
    `${String(r.dry).padStart(4)} ${String(r.fuel).padStart(5)} ${String(r.thrust).padStart(6)} ` +
    `${r.burn.toFixed(2).padStart(6)} | ${r.dv.toFixed(0).padStart(4)} ${r.twr.toFixed(2).padStart(4)} | ` +
    `${r.apex.toFixed(0).padStart(6)} ${r.eva.toFixed(0).padStart(5)} ${r.fuelPct.toFixed(1).padStart(5)} ` +
    `${r.heat.toFixed(1).padStart(9)} | ${r.orbit ? 'yes ' + r.orbFuel.toFixed(1) + '%' : 'no'}`);
}

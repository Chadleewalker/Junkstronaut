#!/usr/bin/env node
'use strict';
// The two ends of the game, which are the two that decide whether it works.
//
//   FIRST LAUNCH   Base ship, no upgrades, no money. Can it get up among the junk at all,
//                  and stay long enough to tether anything? If not there is no game.
//   FINAL REENTRY  Armstrong's satellite aboard a fully upgraded ship. It must come home,
//                  and it must need at least one skim to do it.
//
// Everything between those two is tuning. These are the ones that are either possible or
// not, and the crew has measured neither properly: `simulateAscent` used to circularise
// unconditionally, so the ballistic arc GDD §1 offers was never flown, and no load set ever
// contained the satellite.

const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));

const BASE = require(path.join(CREW, 'out/params/baseline.json'));
const PARAMS = require(path.join(CREW, 'out/config/game_params.json'));
const catalog = require('./legacy-catalog').migrate(
  require(path.join(CREW, 'out/data/debris_catalog.json')), BASE);

const clone = (o) => JSON.parse(JSON.stringify(o));
const bandAlt = (b, n) => {
  const x = b.bands.find((y) => y.name === n);
  return (x.altitude_min_m + x.altitude_max_m) / 2;
};
const FLOOR = BASE.bands.find((b) => b.name === 'suborbital').altitude_min_m;
const SAT = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const HOLD = fullHoldMass(catalog, PARAMS).fullHold;

// The shop, as the twelve-purchase path defines it.
const up = (part, tier) => {
  const u = PARAMS.upgrades.find((x) => x.part === part && x.tier === tier);
  return u ? u.value : null;
};
const SHIPS = [
  { name: 'base (first launch)', fuel: null, thrust: null },
  { name: 'tank 1', fuel: up('fuel_tank', 1), thrust: null },
  { name: 'tank 1 + thruster 1', fuel: up('fuel_tank', 1), thrust: up('thruster', 1) },
  { name: 'tank 2 + thruster 1', fuel: up('fuel_tank', 2), thrust: up('thruster', 1) },
  { name: 'tank 2 + thruster 2 (maxed)', fuel: up('fuel_tank', 2), thrust: up('thruster', 2) },
];

function rig(ship) {
  const p = clone(PARAMS);
  if (ship.fuel) p.flight.fuel_capacity_kg = ship.fuel;
  if (ship.thrust) p.flight.thrust_n = ship.thrust;
  const { world, cfg } = sim.buildConfig(BASE, p);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt(BASE, 'suborbital'));
  return { world, cfg };
}

const f0 = (x) => (Number.isFinite(x) ? Number(x).toFixed(0) : 'n/a');
const f1 = (x) => (Number.isFinite(x) ? Number(x).toFixed(1) : 'n/a');

// ------------------------------------------------------------------ extreme 1
console.log('='.repeat(78));
console.log('FIRST LAUNCH — can the base ship reach the junk, and stay long enough to take any?');
console.log('='.repeat(78));
console.log(`band floor ${f0(FLOOR)} m | the arc is judged on seconds spent at or above it\n`);
console.log('ship                        | arc apex | EVA window | fuel left | orbit?');
console.log('----------------------------|----------|------------|-----------|------------------------');
for (const ship of SHIPS) {
  const { world, cfg } = rig(ship);
  // The arc: burn to apoapsis and come back. No circularisation, which is the whole saving.
  const arc = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, FLOOR * 1.15,
    { circularise: false, hangAltitude: FLOOR });
  // The orbit: the same climb, plus the burn to stay up there.
  const orb = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, FLOOR);
  const orbTxt = orb.reached
    ? `yes, ${f0((orb.fuelRemaining / cfg.fuel) * 100)}% fuel left`
    : `no — ${orb.why}`;
  console.log(
    `${ship.name.padEnd(27)} | ${(f0(arc.apoapsisAlt) + ' m').padStart(8)} | ` +
    `${(arc.reached ? f0(arc.timeAbove) + ' s' : '—').padStart(10)} | ` +
    `${(arc.reached ? f0((arc.fuelRemaining / cfg.fuel) * 100) + '%' : '—').padStart(9)} | ${orbTxt}`);
}

// ------------------------------------------------------------------ extreme 2
console.log('\n' + '='.repeat(78));
console.log(`FINAL REENTRY — ${SAT.display_name}, ${SAT.mass_kg} kg, from the top of the band`);
console.log('='.repeat(78));
console.log('Peak heat on the coolest legal descent. A commit floor is the rule under test:');
console.log('the player may not commit to an entry above it.\n');

const { world, cfg } = rig(SHIPS[SHIPS.length - 1]);
const TOP = bandAlt(BASE, 'high');
const N_SKIMALT = 25;

function bestAt(cargoMass, floor, k) {
  let best = Infinity;
  const alts = k === 0 ? [world.atmTop * 0.5]
    : Array.from({ length: N_SKIMALT }, (_, j) =>
        world.atmTop * (0.35 + 0.62 * (j / (N_SKIMALT - 1))));
  for (const sa of alts) {
    if (k > 0 && sa <= floor) continue;
    try {
      const r = sim.simulateDescent(world, { ...cfg, cargoMass }, TOP, sa, 0,
        { skims: k, entryPeriapsis: floor });
      if (r.landed && r.passes.length) {
        const p = Math.max(...r.passes.map((x) => x.peakHeat));
        if (p < best) best = p;
      }
    } catch (e) { /* that depth does not fly */ }
  }
  return best;
}

console.log('commit floor | load      | plunge | 1 skim | 2 skims | verdict at capacity 235');
console.log('-------------|-----------|--------|--------|---------|------------------------');
for (const floor of [0, 8000, 12000]) {
  for (const [n, m] of [['empty', 0], ['full hold', HOLD], ['satellite', SAT.mass_kg]]) {
    const p0 = bestAt(m, floor, 0), p1 = bestAt(m, floor, 1), p2 = bestAt(m, floor, 2);
    const CAP = 235;
    const verdict = p0 <= CAP ? 'plunge works'
      : (Math.min(p1, p2) <= CAP ? 'MUST SKIM' : 'cannot come home');
    console.log(`${String(floor).padStart(12)} | ${n.padEnd(9)} | ${f1(p0).padStart(6)} | ` +
      `${f1(p1).padStart(6)} | ${f1(p2).padStart(7)} | ${verdict}`);
  }
  console.log('');
}

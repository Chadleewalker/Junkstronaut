'use strict';
// Q4: THE ACTUAL BLOCKER. `pass_counts_reachable` is read off descentScan, whose scan is
// bounded by commit_floor_m — periapsis runs 0..floor. At floor 8000 m the density is
// 0.114 kg/m3 and EVERY legal entry lands in one pass, at any ballistic coefficient. So the
// audit's "two passes are not flyable" is a property of the floor, not of dry_mass.
//
// This sweeps the floor and reports both things at once: the pass counts descentScan can
// reach, and the capacity window (full-hold plunge, endgame plunge) that the floor leaves.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

const DRY = Number(process.env.DRY) || 1146;
const mk = (floor) => ({
  flight: { dry_mass_kg: DRY, fuel_capacity_kg: 3820, thrust_n: 74200, fuel_burn_kgs: 21.2 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 208, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: floor, unstaged_heat_multiplier: 3 },
  ablation: { cycle_toll_base_pct: 5, cycle_toll_growth: 1.9,
              heat_cost_coefficient: 0.000007, heat_cost_exponent: 3, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 870,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.59 },
});

const hold = fullHoldMass(catalog, mk(8000), baseline);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const LOADS = [['empty', 0], ['half', hold.fullHold / 2], ['full', hold.fullHold], ['endgame', heaviest.mass_kg]];
const FLOORS = (process.env.FLOORS || '8000,14000,20000,24000,28000,31000,34000,37000,40000')
  .split(',').map(Number);

console.log(`dry ${DRY} kg, full hold ${hold.fullHold.toFixed(1)} kg, endgame ${heaviest.mass_kg} kg`);
console.log('floor | rho@floor | pass counts reachable (top band)          | coolest 1-pass peak, top band');
console.log('      |           | empty      half       full       endgame  | empty  half   full   endgame  window');
for (const floor of FLOORS) {
  const P = mk(floor);
  const { world, cfg } = sim.buildConfig(baseline, P);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
  const rho = world.rhoAt(floor);
  const counts = [], peaks = [];
  for (const [, m] of LOADS) {
    const scan = sim.descentScan(world, { ...cfg, cargoMass: m }, ALT.top, P, 'top', 200);
    const byN = sim.ablationByPassCount(scan);
    counts.push(byN.map((r) => r.passes));
    const one = byN.find((r) => r.passes === 1);
    // coolest single pass across all legal depths
    const onePeak = scan.filter((r) => r.passes === 1).reduce((a, r) => Math.min(a, r.peakHeat), Infinity);
    peaks.push(Number.isFinite(onePeak) ? onePeak : (one ? one.peakHeat : NaN));
  }
  const win = peaks[3] - peaks[2];
  console.log(`${String(floor).padStart(5)} | ${rho.toExponential(2)}  | ` +
    counts.map((c) => JSON.stringify(c).padEnd(10)).join(' ') + ' | ' +
    peaks.map((p) => p.toFixed(1).padStart(6)).join(' ') +
    ` ${win.toFixed(1).padStart(6)} (${((peaks[3] / peaks[2] - 1) * 100).toFixed(1)}%)`);
}

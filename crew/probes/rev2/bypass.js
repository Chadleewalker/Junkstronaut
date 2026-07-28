'use strict';
// Q5: coolest PEAK by pass count (not by ablation), per band x load, at a given commit floor.
// The audit's rule is about the heat bar, so the peak is the quantity that decides it.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

const DRY = Number(process.env.DRY) || 1146;
const FLOOR = Number(process.env.FLOOR) || 31000;
const N = Number(process.env.N_ENTRY) || 400;
const P = {
  flight: { dry_mass_kg: DRY, fuel_capacity_kg: 3820, thrust_n: 74200, fuel_burn_kgs: 21.2 },
  cargo: { base_slots: 6, compactor_tier: 1 },
  reentry: { heat_capacity: 96, heat_dissipation_s: 5, cargo_damage_interval_s: 3,
             commit_floor_m: FLOOR, unstaged_heat_multiplier: 3 },
  ablation: { cycle_toll_base_pct: 5, cycle_toll_growth: 1.9,
              heat_cost_coefficient: 0.000007, heat_cost_exponent: 3, plate_capacity_pct: 100 },
  landing: { soft_landing_ms: 5, damage_per_ms_over: 6, no_gear_multiplier: 2,
             fragile_multiplier: 2, parachute_area_m2: 870,
             parachute_drag_coefficient: 1.5, descent_speed_full_hold_ms: 4.59 },
};

const hold = fullHoldMass(catalog, P, baseline);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
const { world, cfg } = sim.buildConfig(baseline, P);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
const ALT = { bottom: 65000, middle: 115000, top: 215000 };
const LOADS = [['empty', 0], ['half hold', hold.fullHold / 2], ['full hold', hold.fullHold],
               ['endgame', heaviest.mass_kg]];

console.log(`dry ${DRY} kg, floor ${FLOOR} m, ${N} depths, full hold ${hold.fullHold.toFixed(1)} kg`);
console.log('band    load        | coolest PEAK at n passes (n=1,2,3,...)  | touchdown@best-1pass');
for (const s of ['bottom', 'middle', 'top']) {
  for (const [name, m] of LOADS) {
    const scan = sim.descentScan(world, { ...cfg, cargoMass: m }, ALT[s], P, s, N);
    const byPeak = new Map();
    for (const r of scan) {
      const cur = byPeak.get(r.passes);
      if (!cur || r.peakHeat < cur.peakHeat) byPeak.set(r.passes, r);
    }
    const keys = [...byPeak.keys()].sort((a, b) => a - b).slice(0, 6);
    const row = keys.map((k) => `${k}:${byPeak.get(k).peakHeat.toFixed(1)}`).join('  ');
    const one = byPeak.get(1);
    console.log(`${s.padEnd(7)} ${name.padEnd(11)} | ${row.padEnd(40)} | ${one ? one.touchdownSpeed.toFixed(2) : 'n/a'}`);
  }
}

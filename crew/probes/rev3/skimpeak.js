'use strict';
// What does the SKIM pass itself deposit on the bar? The skim study reports skim_peak_heat
// as 0.0, which the last audit flagged as an unsupported constant. Fly the committed
// descent directly and read every pass's own peak.

const sim = require('../../lib/sim');
const baseline = require('../../out/params/baseline.json');

const params = {
  reentry: { unstaged_heat_multiplier: 3, heat_capacity: 185, commit_floor_m: 8000,
             heat_dissipation_s: 5, cargo_damage_interval_s: 3, off_retrograde_penalty: 1 },
  landing: { parachute_area_m2: 630, parachute_drag_coefficient: 1.8, soft_landing_ms: 5 },
  flight: { dry_mass_kg: 1400, fuel_capacity_kg: 860, thrust_n: 57000, fuel_burn_kgs: 13 },
  ablation: { cycle_toll_base_pct: 3.1, cycle_toll_growth: 1.17, heat_cost_coefficient: 0.0009,
              heat_cost_exponent: 2, skim_peak: 46.7, plate_capacity_pct: 100 },
};

const { world, cfg } = sim.buildConfig(baseline, params);
cfg.heatScale = sim.calibrateHeatScale(world, cfg, 65000);
console.log('heatScale', cfg.heatScale);

const floorM = 8000;
const loads = [['empty', 0], ['full hold', 104.1], ['module', 3600]];
const alts = { bottom: 65000, middle: 115000, top: 215000 };

for (const [bandName, alt] of Object.entries(alts)) {
  for (const [name, cargo] of loads) {
    for (const k of [1, 2, 3]) {
      let best = null;
      for (let j = 0; j < 24; j++) {
        const sa = world.atmTop * (0.25 + 0.74 * (j / 23));
        if (sa <= floorM) continue;
        let r;
        try {
          r = sim.simulateDescent(world, { ...cfg, cargoMass: cargo }, alt, sa, 0,
            { skims: k, entryPeriapsis: floorM });
        } catch (e) { continue; }
        if (!r.landed || r.passes.length < k + 1) continue;
        const p = Math.max(...r.passes.map((x) => x.peakHeat));
        if (!best || p < best.p) best = { p, sa, passes: r.passes.map((x) => Number(x.peakHeat.toFixed(1))) };
      }
      if (best) {
        console.log(`${bandName.padEnd(7)} ${name.padEnd(10)} k=${k} skimAlt=${best.sa.toFixed(0).padStart(6)} ` +
          `worst=${best.p.toFixed(1).padStart(6)} perPass=${JSON.stringify(best.passes)}`);
      } else {
        console.log(`${bandName.padEnd(7)} ${name.padEnd(10)} k=${k} -- none`);
      }
    }
  }
}

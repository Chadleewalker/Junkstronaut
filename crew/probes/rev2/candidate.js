'use strict';
// Q6: fly the whole candidate through the crew's own verificationSweep and print the blocks
// the Spec Auditor reads. Also evaluate the ablation cost model arithmetically so cost_curve
// is a report of the model rather than an assertion.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const { verificationSweep } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');
const P = require('./params');

const v = verificationSweep(baseline, P, catalog);

console.log('ballistic coefficient:', JSON.stringify(v.ballistic_coefficient));
console.log('cargo:', JSON.stringify(v.cargo));
console.log('parachute:', JSON.stringify(v.parachute, null, 1));
console.log('\nascents:');
for (const a of v.ascents) console.log(' ', JSON.stringify(a));
console.log('\ndescents:');
for (const d of v.descents) {
  console.log(`  ${d.band.padEnd(7)} ${d.load.padEnd(11)} cargo ${String(d.cargo_kg).padStart(7)} ` +
    `passes ${JSON.stringify(d.pass_counts_reachable)} peak ${String(d.peak_heat).padStart(4)} ` +
    `abl ${String(d.cheapest_ablation_pct).padStart(5)}% td ${d.touchdown_ms} soft ${d.soft_landing} ` +
    `plate ${d.plate_survives} | bar ${d.peak_heat < P.reentry.heat_capacity ? 'under' : 'OVER'}`);
}
console.log('\nunstaged braking:', JSON.stringify(v.unstaged_braking));
console.log('\nskims (empty):');
for (const b of ['bottom', 'middle', 'top']) {
  const s = v.skims[b];
  if (!s) continue;
  console.log(` ${b}:`, JSON.stringify({ alt: s.skim_altitude_m, mult: s.entry_peak_multiplier || s.multiplier,
    series: (s.series || []).map((x) => `${x.skims}:${x.entry_peak_heat}`) }));
}

// --- the ablation model, evaluated
const a = P.ablation;
console.log('\ncost model, evaluated:');
for (const b of ['bottom', 'middle', 'top']) {
  const row = [0, 1, 2, 3].map((k) => {
    let toll = 0;
    for (let i = 0; i <= k; i++) toll += a.cycle_toll_base_pct * Math.pow(a.cycle_toll_growth, i);
    const entry = a.heat_cost_coefficient *
      Math.pow(a.heat_index[b] * a.skim_heat_multiplier[k], a.heat_cost_exponent);
    const skim = k * a.heat_cost_coefficient * Math.pow(a.skim_peak, a.heat_cost_exponent);
    return toll + entry + skim;
  });
  const argmin = row.indexOf(Math.min(...row));
  console.log(`  ${b.padEnd(7)} [${row.map((x) => x.toFixed(2)).join(', ')}]  argmin ${argmin}` +
    `  (declared ${a.optimal_skims[b]}${argmin === a.optimal_skims[b] ? '' : '  <-- MISMATCH'})` +
    `  curve says [${a.cost_curve[b].join(', ')}]`);
}

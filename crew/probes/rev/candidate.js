'use strict';
// The revision candidate, flown through the crew's own verification sweep.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const sweep = require(path.join(CREW, 'lib/sweep'));
const { validate } = require(path.join(CREW, 'lib/schema'));
const { baseline, catalog } = require('./inputs');
const P = require('./params');

const schema = require(path.join(CREW, 'schemas/game-params.schema.json'));
const errs = validate(P, schema);
console.log('schema:', errs && errs.length ? errs : 'ok');

// ---- the ablation model, evaluated exactly as the charter and schema state it
const a = P.ablation;
const cost = (s, k) => {
  let t = 0;
  for (let i = 0; i <= k; i++) t += a.cycle_toll_base_pct * Math.pow(a.cycle_toll_growth, i);
  t += a.heat_cost_coefficient * Math.pow(a.heat_index[s] * a.skim_heat_multiplier[k], a.heat_cost_exponent);
  t += k * a.heat_cost_coefficient * Math.pow(a.skim_peak, a.heat_cost_exponent);
  return t;
};
console.log('\ncost_curve, recomputed from the model:');
for (const s of ['bottom', 'middle', 'top']) {
  const row = [0, 1, 2, 3].map((k) => Number(cost(s, k).toFixed(2)));
  const argmin = row.indexOf(Math.min(...row));
  console.log(`  ${s.padEnd(7)} [${row.join(', ')}]  argmin ${argmin} ` +
    `(emitted ${JSON.stringify(a.cost_curve[s])} / ${a.optimal_skims[s]})`);
}

// ---- parachute arithmetic
const g = baseline.planet.surface_gravity_ms2, rho = baseline.planet.sea_level_density_kgm3;
const hold = sweep.fullHoldMass(catalog, P, baseline);
const vFor = (m, A) => Math.sqrt((2 * m * g) / (rho * P.landing.parachute_drag_coefficient * A));
const A0 = P.landing.parachute_area_m2;
const chuteT = (t) => P.upgrades.find((u) => u.part === 'parachute' && u.tier === t).value;
console.log(`\nper slot ${hold.perSlot.toFixed(2)} kg, full hold ${hold.fullHold.toFixed(1)} kg, ` +
  `ratio ${((P.flight.dry_mass_kg + hold.fullHold) / P.flight.dry_mass_kg).toFixed(3)}`);
for (const slots of [6, 8, 10]) {
  const m = P.flight.dry_mass_kg + hold.perSlot * slots;
  console.log(`  ${slots} slots: ${m.toFixed(1)} kg -> base ${vFor(m, A0).toFixed(2)} | ` +
    `chute1 ${vFor(m, chuteT(1)).toFixed(2)} | chute2 ${vFor(m, chuteT(2)).toFixed(2)} m/s`);
}

// ---- the whole verification sweep
const v = sweep.verificationSweep(baseline, P, catalog);
console.log('\ninferred:', v.inferred);
console.log('ballistic:', v.ballistic_coefficient.staged_kg_m2, '/', v.ballistic_coefficient.unstaged_kg_m2);
console.log('cargo:', JSON.stringify(v.cargo));
console.log('parachute:', JSON.stringify(v.parachute, null, 1));
console.log('\nascents:');
for (const x of v.ascents) {
  console.log(`  ${x.band.padEnd(7)} reached ${x.reached} via ${x.route} apex ${x.arc_apex_m} ` +
    `eva ${x.arc_eva_window_s}s arcfuel ${x.arc_fuel_margin_pct}% orbfuel ${x.fuel_margin_pct}% ` +
    `climbheat ${x.climb_peak_heat} (${x.climb_survivable})`);
}
console.log('\ndescents (cheapest row):');
for (const d of v.descents) {
  console.log(`  ${d.band.padEnd(7)} ${String(d.load).padEnd(10)} ${String(d.cargo_kg).padStart(6)}kg ` +
    `passes ${d.cheapest_pass_count} peak ${d.peak_heat} abl ${d.cheapest_ablation_pct}% ` +
    `td ${d.touchdown_ms} soft ${d.soft_landing}`);
}
console.log('\nskims:');
for (const s of Object.keys(v.skims)) {
  console.log(`  ${s}: ${JSON.stringify(v.skims[s].skim_heat_multiplier_measured)} ` +
    `at entry ${v.skims[s].measured_at_entry_depth_m} m`);
}
console.log('\nunstaged:', JSON.stringify(v.unstaged_braking));

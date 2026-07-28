'use strict';
// Q4: the economy arithmetic the audit checks — cheap-piece values, break-even, tow fee.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const { baseline, catalog } = require('./inputs');
const P = require('./params');

const band = baseline.bands[0];
const span = band.altitude_max_m - band.altitude_min_m;
const g = P.economy.value_gradient;
const mult = (a) => g.at_bottom + (g.at_top - g.at_bottom) *
  Math.min(1, Math.max(0, (a - band.altitude_min_m) / span));
const val = (d) => P.economy.size_class_base_value[d.size_class] * mult(d.altitude_m) *
  (d.fragile ? P.economy.fragile_value_premium : 1);

console.log('piece                        alt   mult   value  slots');
for (const d of catalog.debris.slice(0, 10)) {
  const cls = catalog.size_classes[d.size_class];
  console.log(`${d.id.padEnd(26)} ${String(d.altitude_m).padStart(6)} ${mult(d.altitude_m).toFixed(3)} ` +
    `${val(d).toFixed(1).padStart(7)}  ${d.fragile ? cls.slots_uncrushed : cls.slots_crushed}`);
}
const cheap = catalog.debris.filter((d) => !d.fragile && d.altitude_m < 80000)
  .sort((a, b) => val(a) - val(b));
console.log(`\nthree cheapest non-fragile near the floor: ` +
  cheap.slice(0, 3).map((d) => val(d).toFixed(1)).join(' + ') +
  ` = ${cheap.slice(0, 3).reduce((s, d) => s + val(d), 0).toFixed(1)}`);
console.log(`launch_cost ${P.economy.launch_cost}`);

// A lazy bottom-band run: fill six crushed slots off the floor.
const lazy = [cheap[0], cheap[0], catalog.debris.find((d) => d.id === 'dented_fuel_bladder'),
  catalog.debris.find((d) => d.id === 'foil_insulation_bale'),
  catalog.debris.find((d) => d.id === 'bent_truss_section')];
const gross = lazy.reduce((s, d) => s + val(d), 0);
const replate = 24.5 * P.economy.replate_cost_per_pct;   // bottom full-hold plunge, flown
console.log(`lazy six-slot haul gross ${gross.toFixed(1)}, turnaround ` +
  `${P.economy.launch_cost} + ${replate.toFixed(1)} replate = ` +
  `${(P.economy.launch_cost + replate).toFixed(1)}, net ${(gross - P.economy.launch_cost - replate).toFixed(1)}`);
const bare = 3 * val(cheap[0]);
const bareReplate = 11.1 * P.economy.replate_cost_per_pct;
console.log(`laziest three-panel haul gross ${bare.toFixed(1)}, turnaround ` +
  `${(P.economy.launch_cost + bareReplate).toFixed(1)}, net ` +
  `${(bare - P.economy.launch_cost - bareReplate).toFixed(1)}`);

// Tow fee
const half = Math.PI * baseline.planet.radius_m;
console.log(`\nhalf circumference ${half.toFixed(0)} m; fee at 0 m = 0, at ` +
  `${P.tow_fee.free_radius_m} m = 0, at ${half.toFixed(0)} m = ${P.tow_fee.max_fee_fraction}`);

// Shear
const tether = catalog.debris.filter((d) => catalog.size_classes[d.size_class].hand_tetherable)
  .sort((a, b) => b.mass_kg - a.mass_kg).slice(0, 2);
const M = tether.reduce((s, d) => s + d.mass_kg, 0);
const a = P.eva.jetpack_thrust_n / (P.eva.suit_mass_kg + M);
console.log(`\nheaviest legal two-piece tow: ${tether.map((d) => `${d.id} ${d.mass_kg}kg`).join(' + ')}` +
  ` = ${M} kg; a = ${a.toFixed(4)} m/s2; worst cable tension ` +
  `${(tether[0].mass_kg * a).toFixed(1)} N against hold force ${P.eva.magnet_hold_force_n} N`);
const mid = catalog.debris.filter((d) => d.altitude_m > 126667 && d.altitude_m < 203333 &&
  catalog.size_classes[d.size_class].hand_tetherable).sort((x, y) => y.mass_kg - x.mass_kg).slice(0, 2);
const Mm = mid.reduce((s, d) => s + d.mass_kg, 0);
console.log(`two mid-band pieces ${Mm} kg: a = ${(P.eva.jetpack_thrust_n / (P.eva.suit_mass_kg + Mm)).toFixed(3)}` +
  ` m/s2 against bare-suit ${(P.eva.jetpack_thrust_n / P.eva.suit_mass_kg).toFixed(3)} m/s2`);

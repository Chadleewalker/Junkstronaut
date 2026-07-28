'use strict';
// Q8: EVA towing at the rescaled catalog, and the lazy-run break-even.
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const { baseline, catalog } = require('./inputs');
const P = require('./params');

const band = baseline.bands[0];
const span = band.altitude_max_m - band.altitude_min_m;
const mult = (alt) => P.economy.value_gradient.at_bottom +
  (P.economy.value_gradient.at_top - P.economy.value_gradient.at_bottom) *
  Math.min(1, Math.max(0, (alt - band.altitude_min_m) / span));
const value = (d) => P.economy.size_class_base_value[d.size_class] * mult(d.altitude_m) *
  (d.fragile ? P.economy.fragile_value_premium : 1);

const third = (alt) => {
  const f = (alt - band.altitude_min_m) / span;
  return f < 1 / 3 ? 'bottom' : f < 2 / 3 ? 'middle' : 'top';
};

// --- EVA
const T = P.eva.jetpack_thrust_n, S = P.eva.suit_mass_kg;
const mid = catalog.debris.filter((d) => third(d.altitude_m) === 'middle' &&
  catalog.size_classes[d.size_class].hand_tetherable);
const midMean = mid.reduce((a, d) => a + d.mass_kg * d.spawn_weight, 0) /
  mid.reduce((a, d) => a + d.spawn_weight, 0);
const bot = catalog.debris.filter((d) => third(d.altitude_m) === 'bottom' &&
  catalog.size_classes[d.size_class].hand_tetherable);
const botMean = bot.reduce((a, d) => a + d.mass_kg * d.spawn_weight, 0) /
  bot.reduce((a, d) => a + d.spawn_weight, 0);
const tether = catalog.debris.filter((d) => catalog.size_classes[d.size_class].hand_tetherable)
  .sort((a, b) => b.mass_kg - a.mass_kg);
console.log(`jetpack ${T} N, suit ${S} kg. bare suit a = ${(T / S).toFixed(2)} m/s2`);
console.log(`bottom-third mean piece ${botMean.toFixed(1)} kg, middle-third mean ${midMean.toFixed(1)} kg`);
for (const [nm, M] of [['one bottom piece', botMean], ['two bottom pieces', 2 * botMean],
                        ['one mid piece', midMean], ['two mid pieces', 2 * midMean],
                        ['two heaviest tetherable', tether[0].mass_kg + tether[1].mass_kg]]) {
  const acc = T / (S + M);
  const worst = Math.max(...[M / 2, M].map((x) => x)) * acc;
  console.log(`  ${nm.padEnd(24)} towed ${M.toFixed(1).padStart(7)} kg  a ${acc.toFixed(3)} m/s2  ` +
    `worst cable ${(Math.min(M, tether[0].mass_kg) * acc).toFixed(1)} N  (hold ${P.eva.magnet_hold_force_n} N)`);
}
console.log(`  heaviest tetherable is ${tether[0].id} ${tether[0].mass_kg} kg; steady tension < jetpack thrust ${T} N always`);

// --- economy
console.log('\ncheapest pieces near the band floor:');
const cheap = catalog.debris.filter((d) => third(d.altitude_m) === 'bottom' &&
  catalog.size_classes[d.size_class].hand_tetherable && !d.fragile)
  .map((d) => ({ id: d.id, v: value(d) })).sort((a, b) => a.v - b.v);
for (const c of cheap.slice(0, 4)) console.log(`  ${c.id.padEnd(24)} ${c.v.toFixed(1)}`);
console.log(`  launch_cost ${P.economy.launch_cost} vs two cheapest ${(cheap[0].v + cheap[1].v).toFixed(1)}, ` +
  `three cheapest ${(cheap[0].v + cheap[1].v + cheap[2].v).toFixed(1)}`);

const lazy = ['scorched_hull_panel', 'scorched_hull_panel', 'bent_truss_section',
              'dented_fuel_bladder', 'foil_insulation_bale', 'snapped_boom_arm']
  .map((id) => catalog.debris.find((d) => d.id === id));
const gross = lazy.reduce((a, d) => a + value(d), 0);
const mass = lazy.reduce((a, d) => a + d.mass_kg, 0);
// bottom-band full-hold direct entry burned 21.5% of plate (flown)
const replate = 21.5 * P.economy.replate_cost_per_pct;
console.log(`\nlazy six-slot bottom run: gross ${gross.toFixed(1)}, hold mass ${mass.toFixed(1)} kg`);
console.log(`  out = launch ${P.economy.launch_cost} + replate 21.5% x ${P.economy.replate_cost_per_pct} = ` +
  `${(P.economy.launch_cost + replate).toFixed(1)};  net ${(gross - P.economy.launch_cost - replate).toFixed(1)}`);
const frag = catalog.debris.find((d) => d.id === 'cracked_solar_array');
console.log(`  one intact ${frag.id} is worth ${value(frag).toFixed(1)} on its own`);
console.log(`\ntow fee: free inside ${P.tow_fee.free_radius_m} m, linear to ` +
  `${P.tow_fee.max_fee_fraction} at half-circumference ${(Math.PI * baseline.planet.radius_m).toFixed(0)} m`);

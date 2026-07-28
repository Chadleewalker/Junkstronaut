'use strict';
// Q0: what does the crew's own full-hold arithmetic read against the rescaled catalog, and
// what dry mass does the doubling rule then allow?
const path = require('path');
const CREW = path.join(__dirname, '..', '..');
const { fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { baseline, catalog } = require('./inputs');

for (const slots of [6, 8, 10]) {
  const P = { cargo: { base_slots: slots, compactor_tier: 1 } };
  const h = fullHoldMass(catalog, P, baseline);
  console.log(`slots ${slots}: perSlot ${h.perSlot.toFixed(2)} kg, full hold ${h.fullHold.toFixed(1)} kg`);
}
const h6 = fullHoldMass(catalog, { cargo: { base_slots: 6, compactor_tier: 1 } }, baseline);
console.log(`\ndoubling rule (ratio 1.75-2.25) allows dry_mass ${(h6.fullHold / 1.25).toFixed(1)} .. ${(h6.fullHold / 0.75).toFixed(1)} kg`);
const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
console.log(`endgame haul (heaviest piece) = ${heaviest.id} ${heaviest.mass_kg} kg`);
for (const dry of [1000, 1146, 1250]) {
  console.log(`dry ${dry}: ratio ${((dry + h6.fullHold) / dry).toFixed(3)}, ` +
    `beta empty ${(dry / (1.4 * 3.5)).toFixed(0)}, beta full ${((dry + h6.fullHold) / (1.4 * 3.5)).toFixed(0)}, ` +
    `beta endgame ${((dry + heaviest.mass_kg) / (1.4 * 3.5)).toFixed(0)} kg/m2`);
}

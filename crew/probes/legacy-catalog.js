'use strict';
// Map a pre-one-band catalog onto altitudes so the probes can still fly the recorded run.
//
// The artifacts in out/ were produced under the three-band contract: pieces carry a band
// name, not an altitude_m. fullHoldMass now refuses those outright rather than guessing —
// it used to silently read every piece as 'bottom' and return a hold 63% too heavy. This
// shim does the conversion explicitly, placing each piece at the altitude its band's sample
// point sits at, so a probe result is comparable with the recorded run rather than being a
// different measurement wearing the same name.
//
// Delete this once the crew has been re-recorded. It exists to read the past, not to write.

const LEGACY_BAND_TO_SAMPLE = { suborbital: 'bottom', low: 'middle', high: 'top' };

function migrate(catalog, baseline) {
  if (catalog.debris.every((d) => Number.isFinite(d.altitude_m))) return catalog;
  const band = baseline.bands[0];
  const altFor = (name) => {
    if (band.samples) {
      const s = band.samples.find((x) => x.name === LEGACY_BAND_TO_SAMPLE[name]);
      if (s) return s.altitude_m;
    }
    // The baseline is itself legacy: three bands, each with its own min/max.
    const b = baseline.bands.find((x) => x.name === name);
    if (!b) throw new Error(`no altitude available for legacy band "${name}"`);
    return (b.altitude_min_m + b.altitude_max_m) / 2;
  };
  return {
    ...catalog,
    debris: catalog.debris.map((d) => ({ ...d, altitude_m: altFor(d.band) })),
  };
}

module.exports = { migrate };

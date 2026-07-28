'use strict';
// The skim study — and a regression guard on the constant that produced a false finding.
//
// `skimAlt` was hardcoded at `atmTop * 0.87`, which on a realistic planet is twelve scale
// heights up, in effective vacuum. Skims flown there shed nothing, so the crew measured
// "skimming cools the entry by 3%", the Balancer priced a mechanic the simulator had told it
// was worthless, and the audit reported an impossible design. Scanned instead, one skim cuts
// the committed entry roughly in half.
//
// These tests exist so that constant cannot come back, and so the invariant that makes the
// scan legitimate — that the baseline it is measured against does not move — is checked
// rather than argued.

const test = require('node:test');
const assert = require('node:assert');

const sim = require('../lib/sim');
const { skimStudy, parachuteCheck, fullHoldMass } = require('../lib/sweep');
const { BASELINE, PARAMS, bandAlt } = require('./fixtures/world');

function rig() {
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt('suborbital'));
  return { world, cfg };
}

const study = (opts) => {
  const { world, cfg } = rig();
  return skimStudy(world, cfg, bandAlt('high'), PARAMS, 'high', 0, opts);
};

test('the skim altitude is scanned, not assumed', () => {
  const s = study();
  assert.equal(s.skim_altitude_was_scanned, true);
  assert.ok(s.measured_at_skim_altitude_m > 0);
  for (const d of s.by_entry_depth) {
    assert.ok(d.skim_altitude_m > d.entry_depth_m,
      'you cannot skim below the entry you are committing to');
    assert.ok(d.skim_altitude_density_kgm3 > 0);
  }
});

test('the scanned optimum beats the old hardcoded 0.87x badly', () => {
  // The regression guard. If someone reintroduces a fixed high skim altitude, this fails.
  const { world, cfg } = rig();
  const alt = bandAlt('high');
  const direct = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, alt,
    world.atmTop * 0.87, 0, { skims: 0, entryPeriapsis: 0 });
  const old = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, alt,
    world.atmTop * 0.87, 0, { skims: 3, entryPeriapsis: 0 });
  const base = direct.passes[direct.passes.length - 1].peakHeat;
  const oldRatio = old.passes[old.passes.length - 1].peakHeat / base;

  const scanned = study().skim_heat_multiplier_measured;
  assert.ok(oldRatio > 0.9,
    `the old constant should barely cool the entry, got ${oldRatio.toFixed(3)}`);
  assert.ok(scanned[3] < 0.75,
    `a scanned skim should cool the entry substantially, got ${scanned[3]}`);
  assert.ok(oldRatio - scanned[3] > 0.2,
    'the scan must find something the fixed altitude could not');
});

test('the baseline the ratios are measured against does not move with skim altitude', () => {
  // This is what makes scanning the altitude legitimate rather than a fourth version of the
  // confound this file has fallen into three times. At k = 0 the ship commits immediately and
  // never visits the skim altitude, so the denominator is identical everywhere.
  const { world, cfg } = rig();
  const alt = bandAlt('high');
  const peaks = [0.4, 0.6, 0.87].map((f) => {
    const r = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, alt,
      world.atmTop * f, 0, { skims: 0, entryPeriapsis: 0 });
    return r.passes[r.passes.length - 1].peakHeat;
  });
  assert.equal(peaks[0], peaks[1]);
  assert.equal(peaks[1], peaks[2]);
});

test('within a series only the skim count varies', () => {
  // The rule the file states three times. Every row of a series must come from one altitude
  // and one entry depth; picking the best altitude per skim count is the confound.
  const s = study();
  for (const d of s.by_entry_depth) {
    assert.deepEqual(d.series.map((x) => x.skims), [0, 1, 2, 3].slice(0, d.series.length));
    assert.ok(typeof d.skim_altitude_m === 'number',
      'the altitude is a property of the series, not of a row');
  }
});

test('the multiplier starts at 1 and never rises', () => {
  const m = study().skim_heat_multiplier_measured;
  assert.equal(m[0], 1);
  for (let i = 1; i < m.length; i++) {
    assert.ok(m[i] <= m[i - 1] + 1e-9, `multiplier rose at index ${i}: ${m.join(', ')}`);
  }
});

test('the benefit saturates, which is what lets fatigue price a third skim', () => {
  // Once the orbit is grazing there is no speed left to shed. A curve that keeps falling is
  // claiming a physics that was measured not to exist.
  const m = study().skim_heat_multiplier_measured;
  assert.ok(m[3] >= m[2] - 0.12 && m[3] <= m[2] + 1e-9,
    `expected saturation by index 3, got ${m.join(', ')}`);
});

test('a finer scan is never worse than a coarser one', () => {
  const coarse = study({ altSamples: 3 }).skim_heat_multiplier_measured[3];
  const fine = study({ altSamples: 21 }).skim_heat_multiplier_measured[3];
  assert.ok(fine <= coarse + 1e-9,
    `a finer scan found a worse optimum: fine ${fine} vs coarse ${coarse}`);
});

test('skimming helps more from higher bands, which is the way the design wants it', () => {
  // The old fixed-altitude measurement said the opposite, and the Balancer's charter still
  // carries that as guidance. Worth pinning: if this flips, the charter needs revisiting.
  const { world, cfg } = rig();
  const at = (band) => skimStudy(world, cfg, bandAlt(band), PARAMS, band, 0)
    .skim_heat_multiplier_measured[3];
  const sub = at('suborbital'), high = at('high');
  assert.ok(high < sub,
    `expected the high band to cool more, got high ${high} against suborbital ${sub}`);
});

test('a degenerate world reports nothing rather than a multiplier of nulls', () => {
  // A baseline that never heated makes every ratio 0/0, and NaN serialises to null in JSON —
  // which reads downstream as a measurement rather than as its absence. The caller must get
  // null, not [null, null, null, null].
  const { world, cfg } = rig();
  const s = skimStudy(world, cfg, -1000, PARAMS, 'high', 0);
  if (s !== null) {
    for (const m of s.skim_heat_multiplier_measured) {
      assert.ok(Number.isFinite(m), `multiplier contains a non-number: ${JSON.stringify(s.skim_heat_multiplier_measured)}`);
    }
  }
});

test('a real world never produces a non-finite multiplier', () => {
  for (const band of ['suborbital', 'low', 'high']) {
    const { world, cfg } = rig();
    const s = skimStudy(world, cfg, bandAlt(band), PARAMS, band, 0);
    assert.ok(s, `${band} produced no study`);
    for (const m of s.skim_heat_multiplier_measured) assert.ok(Number.isFinite(m));
  }
});

// ---------------------------------------------------------------- the parachute block

test('a stated canopy makes the parachute check independent', () => {
  const { world, cfg } = rig();
  const hold = fullHoldMass({
    size_classes: { small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true } },
    debris: [{ band: 'low', size_class: 'small', fragile: false, mass_kg: 150, spawn_weight: 1 }],
  }, PARAMS);
  const p = parachuteCheck(world, cfg, PARAMS, hold,
    [{ load: 'full hold', landed: true, touchdown_ms: 4.6 }]);
  assert.equal(p.independent, true);
  assert.match(p.note, /independent measurement/);
});

test('a missing canopy marks the check as proving nothing', () => {
  const { world, cfg } = rig();
  const params = JSON.parse(JSON.stringify(PARAMS));
  delete params.landing.parachute_area_m2;
  const { cfg: cfg2 } = sim.buildConfig(BASELINE, params);
  const p = parachuteCheck(world, cfg2, params, { perSlot: 100, fullHold: 900 },
    [{ load: 'full hold', landed: true, touchdown_ms: 4.6 }]);
  assert.equal(p.independent, false);
  assert.match(p.note, /zero by construction and proves nothing/);
});

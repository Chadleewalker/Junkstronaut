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
const { BASELINE, PARAMS, sampleAlt } = require('./fixtures/world');

function rig() {
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, sampleAlt('bottom'));
  return { world, cfg };
}

// A skim study costs ~355 ms and this file used to run the default one at the top of the band
// SEVEN times — 2.5 s of identical work in a 4.4 s suite. Memoised by the only inputs that
// vary between calls.
//
// This is only sound because `skimStudy` is pure and `rig()` is deterministic: both are built
// from the same frozen BASELINE and PARAMS every time, so two calls with the same key are
// flying the identical world. `rig()` itself stays per-call — it costs 4.4 ms, and keeping it
// fresh means a study that somehow depended on world identity would still be caught.
//
// Each caller gets its own copy, so a test that mutates a result cannot poison the next one.
// If you add a test that varies anything beyond band and altSamples, extend the key or it
// will silently receive the wrong study.
const studyCache = new Map();
function studyAt(band, opts) {
  const key = `${band}|${opts && opts.altSamples !== undefined ? opts.altSamples : 'default'}`;
  if (!studyCache.has(key)) {
    const { world, cfg } = rig();
    studyCache.set(key, skimStudy(world, cfg, sampleAlt(band), PARAMS, band, 0, opts));
  }
  return structuredClone(studyCache.get(key));
}

const study = (opts) => studyAt('top', opts);

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
  const alt = sampleAlt('top');
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
  const alt = sampleAlt('top');
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

test('skimming helps more from higher up the band, which is the way the design wants it', () => {
  // The old fixed-altitude measurement said the opposite, and the Balancer's charter still
  // carries that as guidance. Worth pinning: if this flips, the charter needs revisiting.
  const at = (band) => studyAt(band).skim_heat_multiplier_measured[3];
  const sub = at('bottom'), high = at('top');
  assert.ok(high < sub,
    `expected the top of the band to cool more, got top ${high} against bottom ${sub}`);
});

test('a degenerate world reports nothing rather than a multiplier of nulls', () => {
  // A baseline that never heated makes every ratio 0/0, and NaN serialises to null in JSON —
  // which reads downstream as a measurement rather than as its absence. The caller must get
  // null, not [null, null, null, null].
  const { world, cfg } = rig();
  const s = skimStudy(world, cfg, -1000, PARAMS, 'top', 0);
  if (s !== null) {
    for (const m of s.skim_heat_multiplier_measured) {
      assert.ok(Number.isFinite(m), `multiplier contains a non-number: ${JSON.stringify(s.skim_heat_multiplier_measured)}`);
    }
  }
});

test('a real world never produces a non-finite multiplier', () => {
  for (const band of ['bottom', 'middle', 'top']) {
    const s = studyAt(band);
    assert.ok(s, `${band} produced no study`);
    for (const m of s.skim_heat_multiplier_measured) assert.ok(Number.isFinite(m));
  }
});

// ---------------------------------------------------------------- the parachute block

test('a stated canopy makes the parachute check independent', () => {
  const { world, cfg } = rig();
  const hold = fullHoldMass({
    size_classes: { small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true } },
    debris: [{ altitude_m: 180000, size_class: 'small', fragile: false, mass_kg: 150, spawn_weight: 1 }],
  }, PARAMS, BASELINE);
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

// ---------------------------------------------------------------- the one band

// GDD §2.6 is a single envelope with a value gradient, not three tiers. These cover the
// helpers that replaced the band lookups — none of which `--stub` executes.

const { sampleAlt: libSampleAlt, sampleFor, valueMultiplier, SAMPLES, SLICE_SAMPLES } =
  require('../lib/sweep');

test('there is one band, and the sample points sit inside it', () => {
  assert.equal(BASELINE.bands.length, 1, 'a second band is a design change, not a config edit');
  const band = BASELINE.bands[0];
  for (const name of SAMPLES) {
    const alt = libSampleAlt(BASELINE, name);
    assert.ok(alt >= band.altitude_min_m && alt <= band.altitude_max_m,
      `sample ${name} at ${alt} is outside the band`);
  }
  assert.deepEqual(SAMPLES, ['bottom', 'middle', 'top']);
});

test('the sample points are ordered bottom to top', () => {
  const alts = SAMPLES.map((n) => libSampleAlt(BASELINE, n));
  assert.deepEqual(alts, [...alts].sort((a, b) => a - b), `not ascending: ${alts}`);
});

test('an unknown sample name reports its absence rather than guessing', () => {
  assert.equal(libSampleAlt(BASELINE, 'stratosphere'), null);
});

test('a piece falls in the third of the envelope its altitude puts it in', () => {
  const band = BASELINE.bands[0];
  const span = band.altitude_max_m - band.altitude_min_m;
  assert.equal(sampleFor(BASELINE, band.altitude_min_m), 'bottom');
  assert.equal(sampleFor(BASELINE, band.altitude_min_m + span * 0.5), 'middle');
  assert.equal(sampleFor(BASELINE, band.altitude_max_m), 'top');
  // The endgame's altitude is above the shipping slice, which is what §4.1 means by a slice.
  assert.ok(!SLICE_SAMPLES.includes(sampleFor(BASELINE, band.altitude_max_m)));
});

test('value rises continuously with altitude, not in three steps', () => {
  const band = BASELINE.bands[0];
  const params = { economy: { value_gradient: { at_bottom: 1, at_top: 5.5 } } };
  const v = (alt) => valueMultiplier(BASELINE, params, alt);
  assert.equal(v(band.altitude_min_m), 1);
  assert.equal(v(band.altitude_max_m), 5.5);
  // Halfway up is halfway between — a gradient, not a tier lookup.
  assert.ok(Math.abs(v((band.altitude_min_m + band.altitude_max_m) / 2) - 3.25) < 1e-9);
  // Strictly increasing across the whole envelope: height is where the money is.
  let prev = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const alt = band.altitude_min_m + (band.altitude_max_m - band.altitude_min_m) * (i / 20);
    const cur = v(alt);
    assert.ok(cur > prev, `value did not rise at ${alt}`);
    prev = cur;
  }
});

test('an altitude outside the envelope clamps rather than extrapolating', () => {
  const band = BASELINE.bands[0];
  const params = { economy: { value_gradient: { at_bottom: 1, at_top: 5.5 } } };
  assert.equal(valueMultiplier(BASELINE, params, band.altitude_min_m - 50000), 1);
  assert.equal(valueMultiplier(BASELINE, params, band.altitude_max_m + 50000), 5.5);
});

test('a legacy catalog is refused, not silently mis-counted', () => {
  // The regression guard for a real defect. Pieces written against the old three-band
  // contract have no altitude_m, so every altitude arrived undefined, the envelope came out
  // NaN, the span was not greater than zero, the fraction fell back to 0, every piece read
  // as 'bottom', and the shipping-slice filter stopped excluding anything. It returned
  // 2,277.7 kg where the truth was 1,397.8 — plausible, silently 63% wrong, and feeding the
  // hold mass into every descent the sweep flies.
  const legacy = {
    size_classes: { small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true } },
    debris: [{ band: 'low', size_class: 'small', fragile: false, mass_kg: 150, spawn_weight: 1 }],
  };
  assert.throws(() => fullHoldMass(legacy, PARAMS, BASELINE), /without a finite altitude_m/);
});

test('a band with no altitude span is refused rather than collapsing to one point', () => {
  const flat = { bands: [{ altitude_min_m: 100000, altitude_max_m: 100000 }] };
  const catalog = {
    size_classes: { small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true } },
    debris: [{ altitude_m: 100000, size_class: 'small', fragile: false, mass_kg: 150, spawn_weight: 1 }],
  };
  assert.throws(() => fullHoldMass(catalog, PARAMS, flat), /no altitude span/);
});

test('a skim that lands on its own is not a committed descent', () => {
  // The invariant behind `committed_descents`, tested on the flight model directly rather
  // than through a full verification sweep — that sweep is a genuinely multi-second operation
  // and this is a 50 ms property. The sweep's own wiring is covered by
  // probes/smoke-pipeline.js, which is the pre-flight check before a live run.
  //
  // Why it matters. With skims >= 1 the ship starts on an ellipse whose periapsis is the SKIM
  // altitude, not entryPeriapsis. A skim low enough to bring the ship down lands on that first
  // passage and never commits — so the commit floor is never used, and the descent is the
  // shallow plunge the floor exists to forbid, wearing a skim's name. It reported the endgame
  // haul coming home at 131.3 when every genuinely committed skimmed descent read 196.5.
  const { world, cfg } = rig();
  const alt = sampleAlt('top');
  const FLOOR = world.atmTop * 0.2;

  let evading = 0, committing = 0;
  for (let j = 0; j < 16; j++) {
    const skimAlt = world.atmTop * (0.25 + 0.7 * (j / 15));
    if (skimAlt <= FLOOR) continue;
    const r = sim.simulateDescent(world, { ...cfg, cargoMass: 900 }, alt, skimAlt, 0,
      { skims: 1, entryPeriapsis: FLOOR });
    if (!r.landed) continue;
    if (r.passes.length < 2) {
      evading++;
      assert.equal(r.commitDv, 0,
        'a descent that lands on its skim cannot have paid for a commit burn');
    } else {
      committing++;
      assert.ok(r.commitDv > 0, 'a committed descent spends delta-v dropping to its entry');
    }
  }
  assert.ok(evading > 0,
    'no evading descent found — this test proves nothing unless the loophole is reachable');
  assert.ok(committing > 0, 'no committed descent found, so the manoeuvre is unflyable here');
});

'use strict';
// The flight model and the rules applied on top of it.
//
// This file exists because `--stub` never runs any of it. A replay reads its sweep straight
// out of stubs/, so every line below — the physics, the ablation rule, the hold arithmetic —
// is invisible to the one check the crew ships. A regression here would sail through a
// replay and come out the other side looking like a measurement.
//
// The world is synthetic rather than loaded from out/, so these tests keep working when the
// recorded run is regenerated or deleted.

const test = require('node:test');
const assert = require('node:assert');

const sim = require('../lib/sim');
const { fullHoldMass } = require('../lib/sweep');

const { BASELINE, PARAMS, bandAlt } = require('./fixtures/world');

const suborbitalAlt = bandAlt('suborbital');   // mid-band, the way lib/sweep.js picks it

// ---------------------------------------------------------------- the ablation rule

test('the thermal toll escalates per heat cycle, as the Balancer\'s model says', () => {
  // heat_cost_coefficient is zeroed here so the toll term stands alone. Cycle i costs
  // base * growth^i: 2, 3, 4.5.
  const params = { ablation: { ...PARAMS.ablation, heat_cost_coefficient: 0 } };
  const passes = [{ peakHeat: 10 }, { peakHeat: 10 }, { peakHeat: 10 }];
  const r = sim.ablationFor(passes, params, 'low');
  assert.deepEqual(r.perPass.map((p) => p.toll), [2, 3, 4.5]);
  assert.equal(r.total, 9.5);
});

test('an escalating toll is what makes feathering unaffordable', () => {
  // This is the whole reason cycle_toll_growth must exceed 1. Charging every pass at the
  // first cycle's rate made a 25-pass descent cost about the same as a 4-pass one, which
  // priced the exploit the parameter exists to close at roughly nothing.
  const params = { ablation: { ...PARAMS.ablation, heat_cost_coefficient: 0 } };
  const many = Array.from({ length: 25 }, () => ({ peakHeat: 10 }));
  const escalating = sim.ablationFor(many, params, 'low').total;
  const flat = sim.ablationFor(many, { ablation: { ...params.ablation, cycle_toll_growth: 1 } },
    'low').total;
  assert.equal(flat, 50);
  assert.ok(escalating > flat * 100,
    `feathering should be ruinous, not ${escalating.toFixed(0)} against ${flat}`);
});

test('a one-pass descent pays the same either way, which is why the fix moved no verdict', () => {
  const params = { ablation: { ...PARAMS.ablation, heat_cost_coefficient: 0 } };
  const one = [{ peakHeat: 42 }];
  assert.equal(
    sim.ablationFor(one, params, 'low').total,
    sim.ablationFor(one, { ablation: { ...params.ablation, cycle_toll_growth: 1 } }, 'low').total
  );
});

test('params without cycle_toll_growth fall back to a flat toll rather than crashing', () => {
  const params = { ablation: { cycle_toll_base_pct: 3, heat_cost_coefficient: 0, heat_cost_exponent: 3 } };
  const r = sim.ablationFor([{ peakHeat: 1 }, { peakHeat: 1 }], params, 'low');
  assert.equal(r.total, 6);
});

test('the heat term rises steeply with peak heat', () => {
  const params = { ablation: { ...PARAMS.ablation, cycle_toll_base_pct: 0 } };
  const cheap = sim.ablationFor([{ peakHeat: 50 }], params, 'low').total;
  const dear = sim.ablationFor([{ peakHeat: 100 }], params, 'low').total;
  // exponent 3, so doubling the peak is eight times the cost.
  assert.ok(Math.abs(dear / cheap - 8) < 1e-9);
});

// ---------------------------------------------------------------- the hold

test('a full hold counts only what the slice can actually carry', () => {
  const catalog = {
    size_classes: {
      small: { slots_crushed: 1, slots_uncrushed: 2, hand_tetherable: true },
      oversized: { slots_crushed: 6, slots_uncrushed: 12, hand_tetherable: false },
    },
    debris: [
      // crushable: 1 slot each, 100 kg, weight 3  -> 300 kg over 3 slots
      { band: 'suborbital', size_class: 'small', fragile: false, mass_kg: 100, spawn_weight: 3 },
      // fragile never crushes: 2 slots, 200 kg, weight 1 -> 200 kg over 2 slots
      { band: 'low', size_class: 'small', fragile: true, mass_kg: 200, spawn_weight: 1 },
      // excluded: outside the shipping slice
      { band: 'high', size_class: 'small', fragile: false, mass_kg: 9999, spawn_weight: 5 },
      // excluded: the slice has no crane, so oversized junk cannot be taken
      { band: 'low', size_class: 'oversized', fragile: false, mass_kg: 9999, spawn_weight: 5 },
    ],
  };
  const hold = fullHoldMass(catalog, { cargo: { base_slots: 6, compactor_tier: 1 } });
  assert.equal(hold.perSlot, 100);   // 500 kg over 5 slot-weights
  assert.equal(hold.fullHold, 600);  // times 6 base slots
});

// ---------------------------------------------------------------- skims are not passes

test('a skim and a pass are different manoeuvres, and the model keeps them apart', () => {
  // The distinction the audit now checks on two separate axes. A plain descent picks one
  // periapsis and repeats it until it falls out of the sky — a decay, with no commit burn.
  // A skim descent brakes high, then spends thrust to drop into a deeper committed entry.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const decay = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, suborbitalAlt,
    world.atmTop * 0.8);
  const skimmed = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, suborbitalAlt,
    world.atmTop * 0.87, 0, { skims: 2, entryPeriapsis: 0 });

  assert.equal(decay.commitDv, 0, 'a decay never commits, so it spends no delta-v');
  assert.ok(skimmed.commitDv > 0, 'a skim descent pays for the entry it commits to');
  assert.ok(decay.passes.length > 1, 'a shallow decay takes several passes to come down');
});

test('zero skims commits immediately instead of coasting a spare orbit first', () => {
  // The ship starts AT apoapsis with no radial velocity, so it cannot trigger its own
  // apoapsis detector until a full orbit has passed. Without the special case, "0 skims"
  // burned one orbit late and measured identically to "1 skim" — which quietly flattened
  // every skim curve the crew ever produced.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const c = { ...cfg, cargoMass: 0 };
  const zero = sim.simulateDescent(world, c, suborbitalAlt, world.atmTop * 0.87, 0,
    { skims: 0, entryPeriapsis: 0 });
  const one = sim.simulateDescent(world, c, suborbitalAlt, world.atmTop * 0.87, 0,
    { skims: 1, entryPeriapsis: 0 });
  assert.ok(zero.landed && one.landed);
  assert.notEqual(zero.passes.length, one.passes.length);
});

// ---------------------------------------------------------------- determinism and calibration

test('the same config always produces the same trajectory', () => {
  // The only reason a sweep of thousands of flights means anything.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const fly = () => sim.simulateDescent(world, { ...cfg, cargoMass: 250 }, suborbitalAlt, 0);
  const a = fly();
  const b = fly();
  assert.equal(a.touchdownSpeed, b.touchdownSpeed);
  assert.equal(a.time, b.time);
  assert.deepEqual(a.passes, b.passes);
});

test('the heat scale is calibrated so the crew\'s reference descent reads 100', () => {
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, suborbitalAlt);
  const probe = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, suborbitalAlt, 0);
  const peak = Math.max(...probe.passes.map((p) => p.peakHeat));
  assert.ok(Math.abs(peak - 100) < 0.5, `reference peak should be 100, got ${peak.toFixed(2)}`);
});

test('a heavier ship lands faster, roughly with the square root of mass', () => {
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const speed = (cargoMass) =>
    sim.simulateDescent(world, { ...cfg, cargoMass }, suborbitalAlt, 0).touchdownSpeed;
  const empty = speed(0);
  const doubled = speed(PARAMS.flight.dry_mass_kg);
  assert.ok(doubled > empty);
  assert.ok(Math.abs(doubled / empty - Math.SQRT2) < 0.05,
    `expected about sqrt(2), got ${(doubled / empty).toFixed(3)}`);
});

// ---------------------------------------------------------------- the parachute contract

test('a stated canopy is flown as given', () => {
  const { cfg, inferred } = sim.buildConfig(BASELINE, PARAMS);
  assert.equal(cfg.chuteArea, 630);
  assert.equal(cfg.chuteCd, 1.8);
  assert.deepEqual(inferred, [], 'nothing should need inferring when the params are complete');
});

test('a missing canopy is solved backwards and says so loudly', () => {
  // This is the circularity the schema now forbids: solve the area out of the claimed speed,
  // then measure that speed back. The value is usable; the check built on it is not, and the
  // `inferred` note is what stops a later reader mistaking one for the other.
  const params = JSON.parse(JSON.stringify(PARAMS));
  delete params.landing.parachute_area_m2;
  const { inferred } = sim.buildConfig(BASELINE, params);
  assert.equal(inferred.length, 1);
  assert.match(inferred[0], /parachute_area_m2 is not in the params/);
  assert.match(inferred[0], /not a measurement on this run/);
});

test('descentScan finds every reachable pass count instead of bisecting past them', () => {
  // Pass count is a step function of braking depth, so a bisection converges on a boundary
  // and can skip whole values. It once reported "2 passes is impossible from the suborbital
  // band", which was an artefact of the sampling and not a fact about the world.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, suborbitalAlt);
  const scan = sim.descentScan(world, { ...cfg, cargoMass: 0 }, suborbitalAlt, PARAMS,
    'suborbital', 60);
  const byN = sim.ablationByPassCount(scan);
  assert.ok(byN.length >= 3, `expected several distinct pass counts, got ${byN.length}`);
  assert.deepEqual(byN.map((r) => r.passes), [...byN.map((r) => r.passes)].sort((a, b) => a - b));
  // Each entry is the cheapest depth that achieves that pass count.
  for (const row of byN) {
    const same = scan.filter((s) => s.passes === row.passes);
    assert.equal(row.totalAblation, Math.min(...same.map((s) => s.totalAblation)));
  }
});

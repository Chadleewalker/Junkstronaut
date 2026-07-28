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

const { BASELINE, PARAMS, sampleAlt } = require('./fixtures/world');

const suborbitalAlt = sampleAlt('bottom');   // mid-band, the way lib/sweep.js picks it

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
    // One band spanning 0..300,000 m, so the shipping slice is everything below 200,000 m
    // — the bottom two thirds. Pieces carry an altitude, not a band name.
    debris: [
      // crushable: 1 slot each, 100 kg, weight 3  -> 300 kg over 3 slots
      { altitude_m: 30000, size_class: 'small', fragile: false, mass_kg: 100, spawn_weight: 3 },
      // fragile never crushes: 2 slots, 200 kg, weight 1 -> 200 kg over 2 slots
      { altitude_m: 150000, size_class: 'small', fragile: true, mass_kg: 200, spawn_weight: 1 },
      // excluded: in the top third, above the shipping slice
      { altitude_m: 280000, size_class: 'small', fragile: false, mass_kg: 9999, spawn_weight: 5 },
      // excluded: the slice has no crane, so oversized junk cannot be taken
      { altitude_m: 150000, size_class: 'oversized', fragile: false, mass_kg: 9999, spawn_weight: 5 },
    ],
  };
  const baseline = { bands: [{ altitude_min_m: 0, altitude_max_m: 300000 }] };
  const hold = fullHoldMass(catalog, { cargo: { base_slots: 6, compactor_tier: 1 } }, baseline);
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

// ---------------------------------------------------------------- the two routes up

test('the ballistic arc reaches altitude the circularised route cannot afford', () => {
  // GDD §1 offers "a suborbital arc or orbit" and both are legal play. simulateAscent used to
  // circularise unconditionally, so a ship that could throw a perfectly good arc reported
  // `reached: false` — which is what shipping_slice_bands_reachable failed on for every run
  // this crew has ever produced.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const floor = BASELINE.bands[0].altitude_min_m;
  const arc = sim.simulateAscent(world, cfg, floor * 1.15,
    { circularise: false, hangAltitude: floor });
  assert.equal(arc.reached, true, `the arc should reach the floor: ${arc.why}`);
  assert.equal(arc.mode, 'arc');
  assert.ok(arc.apoapsisAlt > floor, 'the apex must clear the altitude being reached for');
  assert.ok(arc.timeAbove > 0, 'an arc with no time above the floor is not an EVA window');
  assert.ok(arc.fuelRemaining > 0, 'the arc must leave fuel — it never paid to circularise');
});

test('the arc is cheaper than the orbit, which is the whole reason to offer both', () => {
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const floor = BASELINE.bands[0].altitude_min_m;
  const arc = sim.simulateAscent(world, cfg, floor * 1.15,
    { circularise: false, hangAltitude: floor });
  const orbit = sim.simulateAscent(world, cfg, floor);
  if (orbit.reached) {
    assert.ok(arc.fuelRemaining > orbit.fuelRemaining,
      `the arc should be the cheaper route: arc left ${arc.fuelRemaining.toFixed(0)} kg, ` +
      `orbit left ${orbit.fuelRemaining.toFixed(0)} kg`);
  }
});

test('circularising is still the default, so nothing silently changed route', () => {
  // The arc is opt-in. A caller that does not ask for it must get exactly the old behaviour.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const floor = BASELINE.bands[0].altitude_min_m;
  const a = sim.simulateAscent(world, cfg, floor);
  const b = sim.simulateAscent(world, cfg, floor, {});
  assert.deepEqual(a, b);
  if (a.reached) assert.equal(a.mode, 'orbit');
});

test('the climb reports its own heat, because a ship can burn up on the way up', () => {
  // step() has always accumulated the bar during ascent — the unstaged 3x multiplier
  // included, since the ship has not staged — and simulateAscent never looked at it. On the
  // shipped numbers the climb peaks at 142 against a capacity of 100, so "reachable" was
  // being reported for a launch that would not survive itself. Reporting it is not the same
  // as enforcing it; that is a design decision (see gdd-change-proposal.md §13). This test
  // only pins that the number reaches the caller.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const floor = BASELINE.bands[0].altitude_min_m;
  const arc = sim.simulateAscent(world, cfg, floor * 1.15,
    { circularise: false, hangAltitude: floor });
  assert.ok(Number.isFinite(arc.peakHeat), 'the arc must report the heat it took getting up');
  assert.ok(arc.peakHeat > 0, 'a climb through real air cannot be perfectly cool');
});

test('the climb does not pay the unstaged heat penalty, but a braking pass still does', () => {
  // §2.2 puts the shield behind the thruster and tank, so an unstaged ship taking a braking
  // pass has only hull between it and the airflow and pays the 3x. A climbing rocket is
  // unstaged too and used to pay the same, which had the base ship peaking at 142.5 against a
  // capacity of 100 — it burned up before reaching the junk, and nothing looked.
  //
  // The exemption is a PHASE rule, not a change to unstaged_heat_multiplier. Turning that
  // param down would have taken the penalty off braking passes as well, which is the one
  // place the design wants it. This pins both halves.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const mid = sampleAlt('bottom');
  // The bar is meaningless uncalibrated — raw heat runs to 1e8 — so anchor it the way the
  // sweep does before comparing anything to a capacity.
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, mid);
  const floor = BASELINE.bands[0].altitude_min_m;

  // The invariant is that the ascent IGNORES the multiplier, and that is world-independent.
  // "The launch survives" is not: it is a property of the shipped planet's numbers (47.5 on
  // a 100 bar), and on this synthetic fixture world the exempt climb still reads 157. Testing
  // survival here would be pinning the fixture's planet, not the rule.
  const opts = { circularise: false, hangAltitude: floor };
  const arcHot = sim.simulateAscent(world, cfg, floor * 1.15, opts);
  const arcCool = sim.simulateAscent(world, { ...cfg, unstagedHeatMultiplier: 1 },
    floor * 1.15, opts);
  assert.equal(arcHot.peakHeat, arcCool.peakHeat,
    'the climb must not feel the unstaged penalty at all, whatever it is set to');

  // The braking half, isolated properly. Comparing an unstaged descent against a staged one
  // does NOT work: staging changes the drag coefficient too, so the two fly different
  // trajectories and take a different number of passes — the peaks are not comparable and
  // the ratio comes out below 1. Vary only the multiplier instead. Drag is untouched by it,
  // so the trajectory is identical and the difference is purely the penalty.
  const hot = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, mid, world.atmTop * 0.72, 3);
  const cool = sim.simulateDescent(world,
    { ...cfg, cargoMass: 0, unstagedHeatMultiplier: 1 }, mid, world.atmTop * 0.72, 3);
  assert.equal(hot.passes.length, cool.passes.length,
    'the multiplier must not change the trajectory, only the heat');
  const ratio = hot.passes[0].peakHeat / cool.passes[0].peakHeat;
  assert.ok(ratio > 1.5,
    `an unstaged braking pass must still pay the penalty, got ${ratio.toFixed(2)}x`);
});

test('the commit floor does NOT bound the descent scan, and this cost a live run', () => {
  // An earlier version of this test asserted the opposite, and the code obeyed it. That was
  // the bug.
  //
  // descentScan flies ONE periapsis for the whole descent — a decay. That single periapsis is
  // both where the ship brakes and where it comes down, and the commit floor constrains only
  // the second. Capping the scan at the floor therefore forbids the shallow braking altitudes
  // that are the only way this model reaches a second pass at all, so every cell came back
  // `pass_counts_reachable [1]`. The audit read that as "no two-pass descent is reachable at
  // any load or altitude", failed heavy_descent_requires_multi_pass as unsatisfiable by any
  // numbers, and burned a 100-minute live run — while the real manoeuvre was working: the
  // endgame haul plunged at 222.2 and came home on one skim at 134.9.
  //
  // The floor belongs where the entry is a separate variable: skimStudy, and the committed
  // descents in verificationSweep.
  const { world, cfg } = sim.buildConfig(BASELINE, PARAMS);
  const alt = sampleAlt('top');
  const floored = { ...PARAMS, reentry: { ...PARAMS.reentry, commit_floor_m: 8000 } };

  const free = sim.descentScan(world, { ...cfg, cargoMass: 0 }, alt, PARAMS, 'top', 60);
  const bounded = sim.descentScan(world, { ...cfg, cargoMass: 0 }, alt, floored, 'top', 60);

  assert.ok(free.length && bounded.length, 'both scans must produce landings');
  assert.deepEqual(bounded.map((r) => r.periapsisAlt), free.map((r) => r.periapsisAlt),
    'a commit floor in the params must not change which depths this scan visits');
  assert.ok(Math.max(...bounded.map((r) => r.periapsisAlt)) > 8000,
    'the scan must still reach past the floor — those depths are braking, not committing');
});

'use strict';
// Two sweeps over the flight model.
//
//   1. VERIFICATION — fly the crew's actual config across every scenario that matters and
//      report what happened. This is what turns "the algebra says 4.6 m/s" into "it
//      touched down at 4.43 m/s".
//   2. EXPLORATION — vary the world and the ship over a grid, score each combination
//      against the design's own targets, and report which regions work. This is the
//      question a single config can never answer: not "is this config good" but "where in
//      parameter space is there a good config at all".
//
// The exploration is recomputed every revision round, and it has to be. Re-flying the grid
// against each round's own params and catalog moves 73% of cells' scores, and the top twenty
// share not one cell between round 0 and round 1 — every round reports "best 7/8" and they
// are different sevens. The grid overrides the planet and the ship but inherits the ablation
// curve, the landing rules and the catalog's full-hold mass, so a Designer revision moves
// every target that reads a hold. Caching this across rounds was measured and abandoned.
//
// Both are deterministic. No model runs here; the Playtester agent reads the results.

const sim = require('./sim');
const simDescent = sim.simulateDescent;

// There is ONE band (GDD §2.6) — a single envelope with a value gradient. These are the
// three altitudes the sweep flies to measure that gradient, bottom to top. They are sample
// points, not tiers: nothing in the game may branch on them, and moving one changes what was
// measured rather than what the game is.
const SAMPLES = ['bottom', 'middle', 'top'];
// The part of the envelope that ships this semester (§4.1) — the top of the band is the
// endgame's altitude and is not part of the shipping slice.
const SLICE_SAMPLES = ['bottom', 'middle'];

// How many braking depths a scored world's descent is scanned at. Three of these scans are
// 98.5% of what it costs to score a cell — 1412 ms of 1433 ms — so this number, and not the
// grid size, is what decides whether a sweep takes minutes or hours.
//
// It was 70. The targets only ever read the cheapest row out of a scan, so the question is
// not whether a coarse scan finds the same minimum but whether it finds the same VERDICTS.
// Measured against 70 over 472 cells spread across the whole grid:
//
//   50 samples   0 verdicts changed of 3776      <- this
//   40 samples  11 changed (0.29%)
//   32 samples  10 changed (0.27%)
//   24 samples  16 changed (0.42%)
//
// Nearly every flip is difficulty_rises_with_altitude, which compares two scans' cheapest
// ablation against a 1.1x threshold — a coarse scan misses one minimum by a hair and the
// ratio crosses. That target is already one of the scarce ones and is load-bearing for a live
// design finding, so corrupting it to save a few minutes would be a bad trade.
//
// An earlier version of this comment claimed 24 was safe, on the strength of eight worlds.
// Eight worlds could not see a 0.4% effect. If this is lowered again, measure it against a
// few hundred cells spread across the grid, not against a handful of interesting ones.
const SCAN_SAMPLES = Number(process.env.JUNK_SCAN_SAMPLES) || 50;

// Skim altitudes tried per committed-descent cell. Twelve cells x four skim counts, so this
// is the cost driver of the whole verification sweep. The tests turn it down: they check the
// SHAPE of the result — that a skimmed row flew more passes than its skim count — which does
// not need a fine search.
const COMMIT_SKIM_SAMPLES = Number(process.env.JUNK_COMMIT_SKIM_SAMPLES) || 24;

// ---------------------------------------------------------------- helpers

// The altitude of a named sample point inside the one band.
function sampleAlt(baseline, name) {
  const band = baseline.bands[0];
  if (!band || !band.samples) return null;
  const s = band.samples.find((x) => x.name === name);
  return s ? s.altitude_m : null;
}

// Which third of the envelope a piece sits in. Used only for reporting and for the shipping
// slice — a piece's value comes from its altitude on the gradient, never from its third.
function sampleFor(baseline, altitude_m) {
  const band = baseline.bands[0];
  const span = band.altitude_max_m - band.altitude_min_m;
  const f = span > 0 ? (altitude_m - band.altitude_min_m) / span : 0;
  return f < 1 / 3 ? 'bottom' : f < 2 / 3 ? 'middle' : 'top';
}

// GDD §2.6's value gradient: a piece's multiplier interpolates on its altitude between the
// floor and the ceiling of the band. This replaces the old band_value_multiplier map, and
// with it the assumption that value came in three steps.
function valueMultiplier(baseline, params, altitude_m) {
  const band = baseline.bands[0];
  const g = params.economy.value_gradient;
  const span = band.altitude_max_m - band.altitude_min_m;
  const f = span > 0
    ? Math.min(1, Math.max(0, (altitude_m - band.altitude_min_m) / span))
    : 0;
  return g.at_bottom + (g.at_top - g.at_bottom) * f;
}

// Spawn-weighted mass of a full hold, from the catalog the crew actually authored. Only
// hand-tetherable classes count: the slice has no crane, so oversized junk cannot be taken.
// `baseline` is optional so existing callers keep working. Without it the envelope is taken
// from the catalog's own spread of altitudes, which is the same cut whenever the catalog
// actually populates the band it was authored against.
function fullHoldMass(catalog, params, baseline) {
  const slots = params.cargo.base_slots;
  const tier = params.cargo.compactor_tier;
  const alts = catalog.debris.map((d) => d.altitude_m);
  // REFUSE A LEGACY CATALOG RATHER THAN GUESSING AT IT. A catalog written against the old
  // three-band contract has no altitudes, and every altitude arrives undefined. An earlier
  // version of this function let that through: the envelope came out NaN, the span was not
  // greater than zero, the fraction fell back to 0, every piece read as 'bottom', and the
  // shipping-slice filter stopped excluding anything. It returned 2,277.7 kg where the
  // truth was 1,397.8 — a plausible number, silently 63% wrong, feeding the hold mass into
  // every descent the sweep flies. Loud is the only safe behaviour here.
  const missing = alts.filter((a) => !Number.isFinite(a)).length;
  if (missing) {
    throw new Error(
      `debris catalog has ${missing} of ${alts.length} pieces without a finite altitude_m. ` +
      `This is the pre-one-band contract, where pieces carried a band name instead. ` +
      `Re-record the crew, or map band names to altitudes before calling this.`
    );
  }
  const envelope = baseline && baseline.bands && baseline.bands[0]
    ? baseline.bands[0]
    : { altitude_min_m: Math.min(...alts), altitude_max_m: Math.max(...alts) };
  const span = envelope.altitude_max_m - envelope.altitude_min_m;
  if (!(span > 0)) throw new Error('the band has no altitude span, so no piece can be placed in it');
  const thirdOf = (alt) => {
    const f = (alt - envelope.altitude_min_m) / span;
    return f < 1 / 3 ? 'bottom' : f < 2 / 3 ? 'middle' : 'top';
  };
  let wMass = 0, wSlots = 0;
  for (const d of catalog.debris) {
    const cls = catalog.size_classes[d.size_class];
    if (!cls.hand_tetherable) continue;
    if (!SLICE_SAMPLES.includes(thirdOf(d.altitude_m))) continue;
    // Fragile pieces never crush; everything else crushes at or below the compactor tier.
    const crushable = !d.fragile && (tier >= 1);
    const cost = crushable ? cls.slots_crushed : cls.slots_uncrushed;
    wMass += d.mass_kg * d.spawn_weight;
    wSlots += cost * d.spawn_weight;
  }
  const perSlot = wSlots > 0 ? wMass / wSlots : 0;
  return { perSlot, fullHold: perSlot * slots };
}

// A descent is k shallow skims then a committed entry — two depths, with a burn between.
// Scanning one shared depth conflates "how many skims" with "how deep the entry", which is
// how an earlier version of this sweep concluded that skimming never cools an entry: both
// effects moved together and cancelled. Here the skim altitude is held high and fixed, the
// entry depth is scanned, and the skim count is varied independently.
// HOLD THE ENTRY DEPTH FIXED. This is the third time the same confound has been made here,
// each time in a new disguise, so it is worth stating as a rule: to measure what skimming
// does, ONLY the skim count may vary. Letting the entry depth float and taking the best
// descent at each skim count silently compares a shallow direct entry against a deep
// skimmed one — two effects moving at once, cancelling into "skimming does nothing".
//
// The three earlier versions: one periapsis for the whole descent (skims were really a
// decay); a per-band heat normalisation (every row scaled to itself); and this one, picking
// the coolest entry available per skim count. All three produced confident, wrong flat lines.
// WHERE the skims are flown, and the constant that cost this crew three runs.
//
// The skim altitude used to be fixed at `atmTop * 0.87`, on the reasoning that a skim should
// be high and thin. On the shipped planet that is twelve scale heights up — rho 8.6e-6 kg/m3,
// which is vacuum with extra steps. Skims flown there shed no measurable velocity, the
// measured multiplier came back at 0.97, and the Balancer faithfully priced a mechanic the
// simulator had just told it was worthless. Scanned instead, ONE skim at 0.60 * atmTop takes
// the high band's committed entry from 159.9 to 78.0 on the bar — a 51% cut, which is the
// effect the design always claimed.
//
// That also settles a contradiction the change proposal has carried for three runs: its
// section 1 measured skims cooling an entry by 22-50% and its section 7 measured 2.8% and
// concluded one of them had to be wrong. Neither was. Section 1 flew skims deep enough to
// bite; section 7 flew them in vacuum.
//
// The general lesson is the one the tank, the engine and the band altitudes each taught
// separately: a constant the sweep never questions is not a measurement. It is an assumption
// wearing a measurement's clothes, and it gets reported as a property of the design.
const SKIM_ALT_MIN_FRAC = 0.35;
const SKIM_ALT_MAX_FRAC = 0.95;
const SKIM_ALT_SAMPLES = Number(process.env.JUNK_SKIM_ALT_SAMPLES) || 13;
// The exploration grid pays this per cell. It is set to the same 13, and the reason is worth
// writing down because it is NOT the reason SCAN_SAMPLES is 50.
//
// Measured against a 41-sample reference over 91 cells spread across the whole grid, scoring
// the two targets that read this study (skimming_cools_the_entry, skim_benefit_saturates):
//
//   samples   verdicts changed   worst multiplier deviation
//      31          4.40%                  0.048
//      25          6.04%                  0.064
//      21          2.75%                  0.110
//      17          5.49%                  0.117
//      13          4.40%                  0.120
//
// The measured VALUE converges — deviation falls steadily with resolution. The VERDICTS do
// not: the flip rate bounces between 2.75% and 6.04% with no trend, and 31 samples is no
// more stable than 13 while costing 2.4x as much. That is the signature of threshold
// sensitivity rather than scan noise. `skimming_cools_the_entry` asks whether the multiplier
// is at or below 0.85, and a few percent of cells sit within 0.05 of that line, so they flip
// on any perturbation at all. No achievable resolution fixes them, because the instability
// is in the question, not in the answer.
//
// So resolution is chosen for accuracy of the number rather than stability of the boolean.
//
// The cost is real and was initially mis-measured, which is worth recording because it is the
// same mistake the SCAN_SAMPLES note warns about two paragraphs up. A 32-cell sample put this
// at 1330 ms per cell and the conclusion drawn was "costs nothing measurable". Flying the
// actual grid gives 3.38 s per cell against 2.17 s before the scan existed — the whole
// 5,184-world round went from 704 s to 1095 s, up 56%. Cost varies enormously with planet
// radius, which is the outermost axis, so a small sample lands on a badly unrepresentative
// mix. Measure this against the full grid or not at all.
//
// 56% for a measurement that was previously wrong is worth paying. Going to 31 samples would
// roughly double it again and buys no verdict stability.
//
// The residual ~4% is a real limit on what a satisfaction rate from this grid means, and it
// is the same lesson section 8 of the change proposal reaches from the other direction. The
// honest fix is not more samples — it is for these targets to report their margin alongside
// the boolean, so a cell on the fence is visibly on the fence. That is not done yet.
const SKIM_ALT_SAMPLES_GRID = Number(process.env.JUNK_SKIM_ALT_SAMPLES_GRID) || 13;

// One skim series at one altitude and one entry depth, varying ONLY the skim count.
function flySkimSeries(world, cfg, startAlt, params, cargoMass, skimAlt, entry, counts) {
  const series = [];
  for (const skims of counts) {
    let r;
    try {
      r = simDescent(world, { ...cfg, cargoMass }, startAlt, skimAlt, 0,
        { skims, entryPeriapsis: entry });
    } catch (e) { continue; }
    if (!r.landed || !r.passes.length) continue;
    const final = r.passes[r.passes.length - 1];
    series.push({
      skims,
      entry_peak_rate: final.peakRate,
      entry_peak_heat: Number(final.peakHeat.toFixed(1)),
      skim_peak_heat: r.passes.length > 1
        ? Number(Math.max(...r.passes.slice(0, -1).map((p) => p.peakHeat)).toFixed(1)) : 0,
      touchdown_ms: Number(r.touchdownSpeed.toFixed(2)),
      soft_landing: r.touchdownSpeed <= params.landing.soft_landing_ms,
      commit_dv_ms: Number((r.commitDv || 0).toFixed(0)),
      hours: Number((r.time / 3600).toFixed(2)),
    });
  }
  return series;
}

// A descent is k shallow skims then a committed entry — two depths, with a burn between.
// Scanning one shared depth conflates "how many skims" with "how deep the entry", which is
// how an earlier version of this sweep concluded that skimming never cools an entry: both
// effects moved together and cancelled.
//
// HOLD THE ENTRY DEPTH FIXED. This is the third time the same confound has been made here,
// each time in a new disguise, so it is worth stating as a rule: to measure what skimming
// does, ONLY the skim count may vary. Letting the entry depth float and taking the best
// descent at each skim count silently compares a shallow direct entry against a deep
// skimmed one — two effects moving at once, cancelling into "skimming does nothing".
//
// The three earlier versions: one periapsis for the whole descent (skims were really a
// decay); a per-band heat normalisation (every row scaled to itself); and one picking the
// coolest entry available per skim count. All three produced confident, wrong flat lines.
//
// WHY SCANNING THE SKIM ALTITUDE IS NOT A FOURTH VERSION OF THAT MISTAKE. The altitude is
// chosen ONCE per entry depth — by which altitude cools the entry most at the largest skim
// count that flew — and then held fixed while the whole series is flown. Within a series only
// the skim count varies, which is the rule. And the denominator cannot move: at k = 0 the
// ship commits immediately and never visits the skim altitude at all, so the direct-entry
// baseline every ratio is measured against is identical at every altitude. Verified: k = 0
// reads 159.9 on the bar at both 0.87x and 0.60x.
function skimStudy(world, cfg, startAlt, params, band, cargoMass, opts = {}) {
  const altSamples = Math.max(2, opts.altSamples || SKIM_ALT_SAMPLES);
  // Entry depths are capped at the commit floor for the same reason descentScan is: a study
  // that lets the entry float above the floor is measuring a manoeuvre the player cannot fly.
  const floor = params.reentry && params.reentry.commit_floor_m;
  const cap = Number.isFinite(floor) && floor > 0 ? Math.min(floor, world.atmTop) : world.atmTop;
  const entryDepths = [0, 0.25, 0.5].map((f) => f * cap);
  const byDepth = [];

  for (const entry of entryDepths) {
    // k = 0 ignores the skim altitude entirely, so it is flown once rather than per altitude.
    const base = flySkimSeries(world, cfg, startAlt, params, cargoMass, world.atmTop * 0.5, entry, [0]);
    if (!base.length) continue;

    let bestAlt = null;
    for (let i = 0; i < altSamples; i++) {
      const frac = SKIM_ALT_MIN_FRAC +
        (SKIM_ALT_MAX_FRAC - SKIM_ALT_MIN_FRAC) * (i / (altSamples - 1));
      const skimAlt = world.atmTop * frac;
      if (skimAlt <= entry) continue;   // cannot skim below the entry you are committing to
      const tail = flySkimSeries(world, cfg, startAlt, params, cargoMass, skimAlt, entry, [1, 2, 3]);
      if (!tail.length) continue;
      // Judged at the deepest skim count that flew: that is the strategy the mechanic is
      // asking a player to invest in, and the one the design prices.
      const score = tail[tail.length - 1].entry_peak_rate;
      if (!bestAlt || score < bestAlt.score) bestAlt = { score, skimAlt, frac, tail };
    }
    if (!bestAlt) continue;

    const series = base.concat(bestAlt.tail);
    const direct = series[0].entry_peak_rate;
    // Every figure below is a ratio against the direct entry. If that baseline did not heat
    // at all the ratios are 0/0, and NaN serialises to null in JSON — which reads downstream
    // as a measurement rather than as its absence. Drop the depth instead.
    if (!(direct > 0) || !(series[0].entry_peak_heat > 0)) continue;
    byDepth.push({
      entry_depth_m: Number(entry.toFixed(0)),
      skim_altitude_m: Number(bestAlt.skimAlt.toFixed(0)),
      skim_altitude_fraction_of_atm: Number(bestAlt.frac.toFixed(3)),
      skim_altitude_density_kgm3: Number(world.rhoAt(bestAlt.skimAlt).toExponential(2)),
      series: series.map((s) => ({
        ...s,
        entry_peak_rate: Number(s.entry_peak_rate.toExponential(3)),
        // Ratio of peak heating RATES. The Balancer's model multiplies this against
        // heat_index, which the schema defines in 0-100 bar units — strictly a different
        // quantity. Measured, they agree to within 2.7% at the extreme (bar 0.488 against
        // rate 0.475), so the mismatch is recorded rather than acted on here; changing the
        // measure and the altitude in the same pass would make the effect uninterpretable.
        heat_vs_direct: Number((s.entry_peak_rate / direct).toFixed(3)),
        bar_vs_direct: Number((s.entry_peak_heat / series[0].entry_peak_heat).toFixed(3)),
      })),
    });
  }
  if (!byDepth.length) return null;

  // The headline multiplier comes from the DEEPEST entry that flew — the committed plunge
  // the design is trying to make survivable, and the case where skimming has the most to
  // give. Shallower entries are reported alongside so the trend is visible.
  const deepest = byDepth[0];
  return {
    measured_at_entry_depth_m: deepest.entry_depth_m,
    measured_at_skim_altitude_m: deepest.skim_altitude_m,
    skim_altitude_was_scanned: true,
    skim_heat_multiplier_measured: deepest.series.map((s) => s.heat_vs_direct),
    by_entry_depth: byDepth,
  };
}

// Claimed against flown, for the one rule the crew could previously only check against
// itself. The params now state a canopy — area and drag coefficient — so the descent under
// the chute is a PREDICTION: the simulator integrates the fall rather than being handed the
// answer, and `claimed_full_hold_ms` can be wrong.
//
// `independent` is the field the Auditor keys off, and it matters more than the numbers
// beside it. When the area is missing the model solves it backwards out of the claimed speed
// and then measures that speed back, so `delta_ms` comes out at zero no matter what the
// design says — a tautology wearing the clothes of a measurement. That is how this rule
// passed every audit it ever faced. False here means: do not read the agreement below as
// evidence of anything.
function parachuteCheck(world, cfg, params, hold, descents) {
  const claimed = params.landing.descent_speed_full_hold_ms;
  const flown = descents
    .filter((d) => d.load === 'full hold' && d.landed)
    .map((d) => d.touchdown_ms);
  const measured = flown.length ? flown.reduce((a, b) => a + b, 0) / flown.length : null;
  const fullMass = cfg.dryMass + hold.fullHold;
  // Closed-form terminal velocity, reported alongside the integrated result. The two
  // disagreeing would mean the ship is still decelerating at touchdown rather than riding
  // the canopy down, which is a different finding from the claim being wrong.
  const terminal = Math.sqrt(
    (2 * fullMass * world.g0) / (world.rho0 * cfg.chuteCd * cfg.chuteArea)
  );
  const independent = params.landing.parachute_area_m2 != null;
  return {
    independent,
    area_m2: Number(cfg.chuteArea.toFixed(1)),
    drag_coefficient: cfg.chuteCd,
    full_hold_mass_kg: Number(fullMass.toFixed(1)),
    claimed_full_hold_ms: claimed === undefined ? null : claimed,
    measured_full_hold_ms: measured === null ? null : Number(measured.toFixed(2)),
    terminal_velocity_ms: Number(terminal.toFixed(2)),
    delta_ms: measured === null || claimed === undefined
      ? null : Number(Math.abs(measured - claimed).toFixed(2)),
    spread_across_bands_ms: flown.length
      ? Number((Math.max(...flown) - Math.min(...flown)).toFixed(3)) : null,
    note: independent
      ? 'The area is stated in the params, so measured_full_hold_ms is an independent ' +
        'measurement and delta_ms is a real disagreement.'
      : 'The area was NOT stated and had to be solved out of claimed_full_hold_ms, so ' +
        'delta_ms is zero by construction and proves nothing. Fail the Balancer for the ' +
        'missing field rather than passing the rule.',
  };
}

// ---------------------------------------------------------------- 1 · verification

function verificationSweep(baseline, params, catalog) {
  const { world, cfg, inferred } = sim.buildConfig(baseline, params);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, sampleAlt(baseline, 'bottom'));

  const hold = fullHoldMass(catalog, params, baseline);
  // THE ENDGAME HAUL IS A LOAD, and it was missing for the whole life of this crew. Loads
  // ran empty / half / full hold, so the heaviest object in the game — the win condition,
  // which roughly doubles a fully upgraded ship on its own — was never flown. That is why
  // "the satellite cannot come home at any pass count" took a hand-written probe to find.
  // The rule `heavy_descent_requires_multi_pass` is about exactly this piece, so the audit
  // cannot judge it unless the sweep flies it.
  const heaviest = catalog.debris.reduce((a, d) => (d.mass_kg > a.mass_kg ? d : a));
  const loads = [
    { name: 'empty', cargoMass: 0 },
    { name: 'half hold', cargoMass: hold.fullHold / 2 },
    { name: 'full hold', cargoMass: hold.fullHold },
    { name: 'endgame haul', cargoMass: heaviest.mass_kg, piece: heaviest.id },
  ];

  // -- ascent: can the ship reach each band, and with what margin
  // BOTH ROUTES UP. GDD §1 offers "a suborbital arc or orbit" and both are legal play, so
  // both are flown and reported. Only the circularised one used to exist, which is why every
  // run failed reachability: a ship that could throw a perfectly good arc to the junk read as
  // unable to get there, because it could not afford a burn the arc never pays.
  //
  // The arc is judged on its EVA window — seconds at or above the target — because an apex
  // that clears the altitude for two seconds is not a place you can salvage from.
  //
  // The climb's own peak heat is reported too. It was accumulated all along and nobody looked;
  // with the unstaged penalty applied to the ascent the base ship peaked at 1.4x the heat
  // capacity, i.e. it burned up on the way to its first pickup and still passed reachability.
  const ascents = [];
  const bandFloor = baseline.bands[0].altitude_min_m;
  for (const band of SAMPLES) {
    const alt = sampleAlt(baseline, band);
    const orb = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt);
    const arc = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt * 1.15,
      { circularise: false, hangAltitude: alt });
    ascents.push({
      band,
      altitude_m: alt,
      // Reaching the altitude by EITHER route counts as reaching it.
      reached: !!(orb.reached || arc.reached),
      route: orb.reached ? 'orbit' : (arc.reached ? 'arc' : null),
      orbit_reached: !!orb.reached,
      arc_reached: !!arc.reached,
      why: orb.reached ? null : (orb.why || null),
      arc_apex_m: Number((arc.apoapsisAlt || 0).toFixed(0)),
      arc_eva_window_s: Number((arc.timeAbove || 0).toFixed(1)),
      arc_fuel_margin_pct: Number((((arc.fuelRemaining || 0) / cfg.fuel) * 100).toFixed(1)),
      climb_peak_heat: Number((arc.peakHeat || orb.peakHeat || 0).toFixed(1)),
      climb_survivable: (arc.peakHeat || orb.peakHeat || 0) < params.reentry.heat_capacity,
      fuel_remaining_kg: Number((orb.fuelRemaining || 0).toFixed(2)),
      fuel_margin_pct: Number((((orb.fuelRemaining || 0) / cfg.fuel) * 100).toFixed(1)),
    });
  }

  // -- descent: every band x load, scanned across braking depths
  const descents = [];
  for (const band of SAMPLES) {
    const alt = sampleAlt(baseline, band);
    for (const load of loads) {
      const c = { ...cfg, cargoMass: load.cargoMass };
      const scan = sim.descentScan(world, c, alt, params, band, 200);
      const byN = sim.ablationByPassCount(scan);
      if (!byN.length) {
        descents.push({ band, load: load.name, cargo_kg: Number(load.cargoMass.toFixed(1)),
                        landed: false, why: 'no braking depth produced a landing' });
        continue;
      }
      const best = byN.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a));
      descents.push({
        band,
        load: load.name,
        cargo_kg: Number(load.cargoMass.toFixed(1)),
        landed: true,
        pass_counts_reachable: byN.map((r) => r.passes),
        cheapest_pass_count: best.passes,
        cheapest_ablation_pct: Number(best.totalAblation.toFixed(1)),
        peak_heat: Number(best.peakHeat.toFixed(0)),
        touchdown_ms: Number(best.touchdownSpeed.toFixed(2)),
        soft_landing: best.touchdownSpeed <= params.landing.soft_landing_ms,
        plate_survives: best.totalAblation <= params.ablation.plate_capacity_pct,
        ablation_by_pass_count: byN.map((r) => ({
          passes: r.passes,
          ablation_pct: Number(r.totalAblation.toFixed(1)),
          peak_heat: Number(r.peakHeat.toFixed(0)),
          braking_altitude_m: Number(r.periapsisAlt.toFixed(1)),
        })),
      });
    }
  }

  // -- skims: does bleeding speed high up cool the committed entry, and where does it stop
  const skims = {};
  for (const band of SAMPLES) {
    const st = skimStudy(world, cfg, sampleAlt(baseline, band), params, band, 0);
    if (st) skims[band] = st;
  }

  // -- the unstaged braking pass the GDD's descent depends on
  const unstaged = [];
  for (const band of SLICE_SAMPLES) {
    const alt = sampleAlt(baseline, band);
    // A deliberately shallow braking pass, flown unstaged as §2.3.1 describes.
    const r = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, alt, world.atmTop * 0.72, 3);
    const peak = r.passes.length ? r.passes[0].peakHeat : null;
    unstaged.push({
      band,
      shallow_pass_peak_heat: peak === null ? null : Number(peak.toFixed(0)),
      survivable: peak !== null && peak < params.reentry.heat_capacity,
    });
  }

  // COMMITTED DESCENTS — the manoeuvre the design actually rests on, and the one the audit
  // could not see. descentScan flies a single periapsis for the whole descent, so it cannot
  // express 'skim high, then commit below the commit floor' at all; a rule about that
  // manoeuvre judged on its output failed as unsatisfiable while the manoeuvre worked — the
  // endgame haul plunges at 222.2 and comes home on one skim at 134.9.
  //
  // Here the two depths are separate: the entry is pinned at the floor (the shallowest the
  // rule allows, and therefore the coolest legal commit) and the skim altitude is searched
  // above it. A descent only counts if it flew all its skims AND a committed entry — a skim
  // shallow enough to land on its own never uses the entry depth, so it evades the floor and
  // is the very plunge the floor exists to forbid.
  const committed = [];
  const floorM = (params.reentry && params.reentry.commit_floor_m) || 0;
  for (const band of SAMPLES) {
    const alt = sampleAlt(baseline, band);
    for (const load of loads) {
      const row = { band, load: load.name, cargo_kg: Number(load.cargoMass.toFixed(1)),
                    commit_floor_m: floorM, by_skims: [] };
      for (const k of [0, 1, 2, 3]) {
        let best = Infinity, bestAlt = null, bestPasses = null, bestTd = null;
        const alts = k === 0 ? [world.atmTop * 0.5]
          : Array.from({ length: COMMIT_SKIM_SAMPLES }, (_, j) =>
              world.atmTop * (0.25 + 0.74 * (j / (COMMIT_SKIM_SAMPLES - 1))));
        for (const sa of alts) {
          if (k > 0 && sa <= floorM) continue;
          let r;
          try {
            r = simDescent(world, { ...cfg, cargoMass: load.cargoMass }, alt, sa, 0,
              { skims: k, entryPeriapsis: floorM });
          } catch (e) { continue; }
          if (!r.landed || r.passes.length < k + 1) continue;
          const p = Math.max(...r.passes.map((x) => x.peakHeat));
          if (p < best) { best = p; bestAlt = sa; bestPasses = r.passes.length; bestTd = r.touchdownSpeed; }
        }
        row.by_skims.push(Number.isFinite(best)
          ? { skims: k, passes: bestPasses, peak_heat: Number(best.toFixed(1)),
              skim_altitude_m: Number(bestAlt.toFixed(0)),
              touchdown_ms: Number(bestTd.toFixed(2)),
              survives: best < params.reentry.heat_capacity }
          : { skims: k, passes: null, peak_heat: null, why: 'no legal descent at this skim count' });
      }
      const plunge = row.by_skims[0];
      const skimmed = row.by_skims.slice(1).filter((x) => x.peak_heat !== null);
      row.plunge_peak_heat = plunge.peak_heat;
      row.best_skimmed_peak_heat = skimmed.length ? Math.min(...skimmed.map((x) => x.peak_heat)) : null;
      row.must_skim = plunge.peak_heat !== null && plunge.peak_heat >= params.reentry.heat_capacity;
      row.skim_saves_it = row.best_skimmed_peak_heat !== null &&
        row.best_skimmed_peak_heat < params.reentry.heat_capacity;
      committed.push(row);
    }
  }

  return {
    inferred,
    heat_scale_calibration:
      'Heat is reported on the 0-100 bar. The scale is fixed once so that an empty ship ' +
      'making a single-pass descent from the bottom sample altitude peaks at 100, which is the ' +
      "crew's own normalisation. Every other figure is measured relative to that.",
    ballistic_coefficient: {
      staged_kg_m2: Number((cfg.dryMass / (cfg.cdShield * cfg.area)).toFixed(1)),
      unstaged_kg_m2: Number((cfg.dryMass / (cfg.cdHull * cfg.area)).toFixed(1)),
      note: 'mass / (drag coefficient x reference area). Real reentry capsules run 300-500; ' +
            'below roughly 50 the atmosphere stops the ship rather than braking it, so ' +
            'multi-pass aerobraking cannot exist however the other numbers are tuned.',
    },
    cargo: {
      kg_per_slot: Number(hold.perSlot.toFixed(2)),
      full_hold_kg: Number(hold.fullHold.toFixed(1)),
      full_hold_mass_ratio: Number(((cfg.dryMass + hold.fullHold) / cfg.dryMass).toFixed(2)),
    },
    parachute: parachuteCheck(world, cfg, params, hold, descents),
    ascents,
    descents,
    committed_descents: committed,
    skims,
    unstaged_braking: unstaged,
  };
}

// ---------------------------------------------------------------- 2 · exploration

// The design's own targets, turned into measurable pass/fail. This is the closest thing the
// crew has to an objective function, and it is deliberately written out rather than folded
// into one number, so a config that scores 5/7 says WHICH two it missed.
function scoreWorld(baseline, params, catalog, opts = {}) {
  const skimAltSamples = opts.skimAltSamples || SKIM_ALT_SAMPLES_GRID;
  const { world, cfg } = sim.buildConfig(baseline, params);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, sampleAlt(baseline, 'bottom'));
  const hold = fullHoldMass(catalog, params);

  const targets = {};

  // 1. Every shipping-slice band is reachable, with margin but not a silly amount.
  let allReached = true, minMargin = 1, maxMargin = 0;
  for (const band of SLICE_SAMPLES) {
    const r = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, sampleAlt(baseline, band));
    if (!r.reached) { allReached = false; break; }
    const m = r.fuelRemaining / cfg.fuel;
    minMargin = Math.min(minMargin, m);
    maxMargin = Math.max(maxMargin, m);
  }
  targets.bands_reachable = allReached && minMargin > 0.08;

  // 1b. The launch survives itself. The climb heats the ship on the way up as surely as the
  //     return heats it on the way down, and nothing used to read it — a config whose first
  //     flight burned up passed reachability without comment.
  const climbs = [];
  for (const band of SLICE_SAMPLES) {
    const a = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, sampleAlt(baseline, band) * 1.15,
      { circularise: false, hangAltitude: sampleAlt(baseline, band) });
    climbs.push(a.peakHeat || 0);
  }
  const hottestClimb = climbs.length ? Math.max(...climbs) : 0;
  targets.launch_survives_itself = hottestClimb > 0 && hottestClimb < params.reentry.heat_capacity;
  targets.fuel_margin_sane = allReached && minMargin > 0.08 && maxMargin < 0.6;

  // 2 & 3. Skimming: does bleeding speed high up actually cool the committed entry, and does
  //        the benefit saturate? Both are properties of the world, and both have to hold for
  //        the design's descent to be a decision rather than a formality. Measured from the
  //        high band, where skims are supposed to matter most.
  const skimStudyHigh = skimStudy(world, cfg, sampleAlt(baseline, 'top'), params, 'top', 0,
    { altSamples: skimAltSamples });
  const mults = skimStudyHigh ? skimStudyHigh.skim_heat_multiplier_measured : [];
  // A skim is worth flying if two of them cut the entry's peak by at least 15%.
  targets.skimming_cools_the_entry = mults.length >= 3 && mults[2] <= 0.85;
  // ...and worth stopping if the third adds little over the second, so fatigue can price it.
  targets.skim_benefit_saturates = mults.length >= 4
    && mults[3] >= mults[2] - 0.12 && mults[3] <= mults[2];

  // 4. An unstaged shallow braking pass is survivable — the GDD's descent begins with them.
  const un = sim.simulateDescent(world, { ...cfg, cargoMass: 0 },
    sampleAlt(baseline, 'bottom'), world.atmTop * 0.72, 3);
  const unPeak = un.passes.length ? un.passes[0].peakHeat : Infinity;
  targets.unstaged_pass_survivable = unPeak < params.reentry.heat_capacity;

  // 5. A full hold lands soft, but only just — the margin is what the Parachute upgrade buys.
  const fullScan = sim.descentScan(world, { ...cfg, cargoMass: hold.fullHold },
    sampleAlt(baseline, 'middle'), params, 'middle', SCAN_SAMPLES);
  const fullBest = fullScan.length
    ? fullScan.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.full_hold_lands_soft = !!fullBest
    && fullBest.touchdownSpeed <= params.landing.soft_landing_ms
    && fullBest.touchdownSpeed >= params.landing.soft_landing_ms * 0.6;

  // 6. Greed costs something: a full hold is measurably harder to bring home than an empty one.
  const emptyLow = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    sampleAlt(baseline, 'middle'), params, 'middle', SCAN_SAMPLES);
  const emptyBest = emptyLow.length
    ? emptyLow.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.greed_costs_something = !!(fullBest && emptyBest)
    && fullBest.totalAblation > emptyBest.totalAblation * 1.15;

  // 7. The return leg gets harder with altitude.
  const highScan = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    sampleAlt(baseline, 'top'), params, 'top', SCAN_SAMPLES);
  const highBest = highScan.length
    ? highScan.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.difficulty_rises_with_altitude = !!(highBest && emptyBest)
    && highBest.totalAblation > emptyBest.totalAblation * 1.1;

  const met = Object.values(targets).filter(Boolean).length;
  return {
    targets,
    score: met,
    max_score: Object.keys(targets).length,
    measured: {
      skim_heat_multipliers: mults,
      unstaged_peak_heat: Number.isFinite(unPeak) ? Number(unPeak.toFixed(0)) : null,
      full_hold_touchdown_ms: fullBest ? Number(fullBest.touchdownSpeed.toFixed(2)) : null,
      hottest_climb_peak_heat: Number(hottestClimb.toFixed(1)),
      commit_floor_m: (params.reentry && params.reentry.commit_floor_m) || null,
      ballistic_coefficient_staged: Number((cfg.dryMass / (cfg.cdShield * cfg.area)).toFixed(1)),
    },
  };
}

// Vary the world and the ship over a grid. These are the seven things the design can still
// freely choose — everything else in the params follows from them.
// Planet radius is the first axis because it is the one that decides whether aerobraking
// exists at all: an 800 m world can only carry a shell of air a ship cannot fly through,
// and no combination of the others rescues it. Orbital period is not a constraint —
// the game ships a time warp — so the range runs up to roughly 1/20 of Earth's diameter.
// Atmosphere depth and scale height are derived from the radius rather than swept
// independently, because a planet's air column scales with the planet.
//
// The last two axes are the tank and the engine. They were fixed before — every cell flew
// the params' own 620 kg of fuel, and thrust was pinned to a 1.8 liftoff TWR — which meant
// the grid scored 324 worlds using a ship that could not reach orbit in any of them, and
// reported the result as a property of the worlds. They are swept as RATIOS for the same
// reason thrust always was: a fixed 620 kg tank is enormous on a 200 kg hull and negligible
// on a 2400 kg one, so absolute values would mostly measure which cells happen to be able
// to take off rather than which worlds make a good game.
const GRID = {
  radius_m: [800, 60000, 160000, 320000],
  surface_gravity_ms2: [3, 6, 9.81],
  sea_level_density_kgm3: [0.1, 0.5, 1.2],
  reference_area_m2: [1.2, 4, 12],
  dry_mass_kg: [200, 800, 2400],
  // Both of these were truncated on their first outing: every cell that scored 7 sat at
  // fuel_fraction 1.5 and mean score rose monotonically to the top of both ranges, which
  // means the optimum was outside the grid and the top row was a wall, not a peak. The
  // ranges now run well past where the frontier was, so a best cell in the interior is
  // evidence and a best cell at the edge is still a warning. Radius needed no widening —
  // its best is interior at 60-160 km, with 800 m and 320 km both scoring worse.
  fuel_fraction: [0.5, 1.5, 2.5, 4.0],   // tank size as a multiple of dry mass
  // Liftoff TWR, and exhaust velocity with it: ve is thrust/burn_rate and the burn rate is
  // not swept, so a cell at 6.0 is not a bigger engine but a far more efficient one — about
  // 700 s of specific impulse where 2.6 is about 300. Read the high end as "the design is
  // asking for a better engine", and check the Isp before believing a cell that wins there.
  twr_at_liftoff: [1.4, 2.6, 4.0, 6.0],
};

// Every cell of the grid, in one fixed order. Flattened rather than left nested because the
// work gets handed out in pieces: a worker has to be told "cells 7, 23, 39", which a seven-
// deep loop cannot express. The order here is the order the nested loops used, so a row's
// position is unchanged from when this ran on one thread.
function enumerateCells() {
  const cells = [];
  for (const R of GRID.radius_m)
    for (const g of GRID.surface_gravity_ms2)
      for (const rho of GRID.sea_level_density_kgm3)
        for (const area of GRID.reference_area_m2)
          for (const dry of GRID.dry_mass_kg)
            for (const fuelFrac of GRID.fuel_fraction)
              for (const twr of GRID.twr_at_liftoff)
                cells.push({ R, g, rho, area, dry, fuelFrac, twr });
  return cells;
}

// One cell, flown. Returns null for a world the model cannot integrate at all, which is not
// an error — some corners of the grid are genuinely unflyable and that is a finding.
function scoreCell(baseline, params, catalog, cell) {
  const { R, g, rho, area, dry, fuelFrac, twr } = cell;

  const b = JSON.parse(JSON.stringify(baseline));
  const mu = g * R * R;
  // The air column scales with the planet: a shallow shell on a big world and a
  // deep one on a small world are both incoherent. Bands sit above the air.
  const atmTop = R * 0.28;
  b.planet.radius_m = R;
  b.planet.surface_gravity_ms2 = g;
  b.planet.sea_level_density_kgm3 = rho;
  b.planet.atmosphere_top_m = atmTop;
  b.planet.scale_height_m = atmTop * 0.1;
  b.reentry.reference_area_m2 = area;
  // STILL HARDCODED, AND STILL THE OUTSTANDING ONE. These multiples of the atmosphere's
  // depth place the three sample altitudes, and the spread between them is what decides
  // whether multi-pass aerobraking can ever be optimal — measured at roughly apoapsis 9.5x
  // periapsis before it wins unaided. Every false finding this crew has produced came from a
  // constant the grid never varied (the tank, the engine, the skim altitude); this is the
  // last one, and it is not swept. Read any multi-pass result from the grid with that in mind.
  const sampleAlts = [atmTop * 1.6, atmTop * 2.6, atmTop * 4.2];
  const band = b.bands[0];
  band.altitude_min_m = sampleAlts[0] * 0.9;
  band.altitude_max_m = sampleAlts[2] * 1.1;
  band.samples.forEach((s, i) => {
    s.altitude_m = sampleAlts[i];
    const r = R + sampleAlts[i];
    s.orbital_speed_ms = Math.sqrt(mu / r);
    s.period_s = (2 * Math.PI * r) / s.orbital_speed_ms;
  });

  const p = JSON.parse(JSON.stringify(params));
  p.flight.dry_mass_kg = dry;
  const fuel = dry * fuelFrac;
  p.flight.fuel_capacity_kg = fuel;
  // Thrust scales with weight so every config has a comparable liftoff TWR;
  // otherwise the grid just measures which cells happen to be able to take off.
  p.flight.thrust_n = (dry + fuel) * g * twr;

  let s;
  try { s = scoreWorld(b, p, catalog); }
  catch (e) { return null; }

  return {
    radius_m: R,
    surface_gravity_ms2: g,
    sea_level_density_kgm3: rho,
    atmosphere_top_m: Number(b.planet.atmosphere_top_m.toFixed(0)),
    scale_height_m: Number(b.planet.scale_height_m.toFixed(1)),
    reference_area_m2: area,
    dry_mass_kg: dry,
    fuel_capacity_kg: Number(fuel.toFixed(0)),
    fuel_fraction: fuelFrac,
    thrust_n: Number(p.flight.thrust_n.toFixed(0)),
    twr_at_liftoff: twr,
    exhaust_velocity_ms: Number((p.flight.thrust_n / p.flight.fuel_burn_kgs).toFixed(0)),
    score: s.score,
    max_score: s.max_score,
    targets: s.targets,
    measured: s.measured,
  };
}

// Score a named set of cells, keeping each row's grid index so the caller can put the pieces
// back in order. This is what runs inside a worker, and what runs on the main thread when
// there is only one.
function sweepIndices(baseline, params, catalog, indices) {
  const cells = enumerateCells();
  const out = [];
  for (const i of indices) {
    const row = scoreCell(baseline, params, catalog, cells[i]);
    if (row) out.push({ i, row });
  }
  return out;
}

// How many threads to fly the grid on. Two cores are left for the OS and for whatever else
// the machine is doing, and the cap is 16 because that is what was actually measured: 16
// workers on a 32-core machine returned about 8.6x, and the curve was already flattening.
// Override with JUNK_SWEEP_WORKERS, and set it to 1 to run everything on this thread.
function defaultWorkers() {
  const env = Number(process.env.JUNK_SWEEP_WORKERS);
  if (Number.isFinite(env) && env >= 1) return Math.floor(env);
  const cores = require('os').cpus().length;
  return Math.max(1, Math.min(cores - 2, 16));
}

// Cells are dealt round-robin, not in contiguous blocks. Cost varies almost entirely with
// planet radius, which is the outermost axis, so contiguous slices would hand one worker
// every 800 m world and another every 320 km world and then wait for the second. Dealing
// them out one at a time gives every worker the same mix.
function sweepParallel(baseline, params, catalog, count, workers) {
  const { Worker } = require('worker_threads');
  const path = require('path');
  const file = path.join(__dirname, 'sweep-worker.js');

  const buckets = Array.from({ length: workers }, () => []);
  for (let i = 0; i < count; i++) buckets[i % workers].push(i);

  return Promise.all(buckets.map((indices) => new Promise((resolve, reject) => {
    if (!indices.length) return resolve([]);
    const w = new Worker(file, { workerData: { baseline, params, catalog, indices } });
    w.on('message', resolve);
    w.on('error', reject);
    w.on('exit', (code) => { if (code !== 0) reject(new Error(`sweep worker exited ${code}`)); });
  }))).then((parts) => {
    // Back into grid order before anything reads them, so a parallel run and a single-
    // threaded run produce byte-identical output. The sort below is stable, so ties between
    // equal scores also resolve the same way in both.
    const merged = [].concat(...parts).sort((a, b) => a.i - b.i);
    return merged.map((x) => x.row);
  });
}

// Returns a promise: the grid is flown on several threads by default. Pass {workers: 1} for
// the single-threaded path, which is the same code and the same answer, only slower.
async function explorationSweep(baseline, params, catalog, opts = {}) {
  const cells = enumerateCells();
  const count = Math.min(opts.limit || Infinity, cells.length);
  const workers = opts.workers !== undefined ? opts.workers : defaultWorkers();

  const rows = workers > 1
    ? await sweepParallel(baseline, params, catalog, count, workers)
    : sweepIndices(baseline, params, catalog, Array.from({ length: count }, (_, i) => i))
        .map((x) => x.row);

  rows.sort((a, b) => b.score - a.score);
  return {
    grid: GRID,
    total_configs: rows.length,
    best_score: rows.length ? rows[0].score : 0,
    max_score: rows.length ? rows[0].max_score : 0,
    // Which targets are hard to hit at all, across the whole space — a target nothing
    // satisfies is a statement about the design, not about any one config.
    target_satisfaction_rate: rows.length
      ? Object.keys(rows[0].targets).reduce((acc, k) => {
          acc[k] = Number((rows.filter((r) => r.targets[k]).length / rows.length).toFixed(3));
          return acc;
        }, {})
      : {},
    top: rows.slice(0, 20),
    rows,
  };
}

module.exports = {
  verificationSweep, explorationSweep, scoreWorld, fullHoldMass, GRID,
  sampleAlt, sampleFor, valueMultiplier, SAMPLES, SLICE_SAMPLES,
  enumerateCells, scoreCell, sweepIndices, skimStudy, parachuteCheck,
  SKIM_ALT_SAMPLES, SKIM_ALT_SAMPLES_GRID,
};

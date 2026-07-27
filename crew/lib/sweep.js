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
// Both are deterministic. No model runs here; the Playtester agent reads the results.

const sim = require('./sim');
const simDescent = sim.simulateDescent;

const BANDS = ['suborbital', 'low', 'high'];
const SLICE_BANDS = ['suborbital', 'low'];   // what actually ships this semester (§4.1)

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
// Nearly every flip is difficulty_rises_with_band, which compares two scans' cheapest
// ablation against a 1.1x threshold — a coarse scan misses one minimum by a hair and the
// ratio crosses. That target is already one of the scarce ones and is load-bearing for a live
// design finding, so corrupting it to save a few minutes would be a bad trade.
//
// An earlier version of this comment claimed 24 was safe, on the strength of eight worlds.
// Eight worlds could not see a 0.4% effect. If this is lowered again, measure it against a
// few hundred cells spread across the grid, not against a handful of interesting ones.
const SCAN_SAMPLES = Number(process.env.JUNK_SCAN_SAMPLES) || 50;

// ---------------------------------------------------------------- helpers

function bandAlt(baseline, name) {
  const b = baseline.bands.find((x) => x.name === name);
  return b ? (b.altitude_min_m + b.altitude_max_m) / 2 : null;
}

// Spawn-weighted mass of a full hold, from the catalog the crew actually authored. Only
// hand-tetherable classes count: the slice has no crane, so oversized junk cannot be taken.
function fullHoldMass(catalog, params) {
  const slots = params.cargo.base_slots;
  const tier = params.cargo.compactor_tier;
  let wMass = 0, wSlots = 0;
  for (const d of catalog.debris) {
    const cls = catalog.size_classes[d.size_class];
    if (!cls.hand_tetherable) continue;
    if (!SLICE_BANDS.includes(d.band)) continue;
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
function skimStudy(world, cfg, startAlt, params, band, cargoMass) {
  const skimAlt = world.atmTop * 0.87;          // high and thin: a real skim, not a decay
  const entryDepths = [0, 0.25, 0.5].map((f) => f * world.atmTop);
  const byDepth = [];

  for (const entry of entryDepths) {
    const series = [];
    for (const skims of [0, 1, 2, 3]) {
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
    // A series is only meaningful if the 0-skim baseline flew, since every ratio is against it.
    if (series.length >= 2 && series[0].skims === 0) {
      const direct = series[0].entry_peak_rate;
      byDepth.push({
        entry_depth_m: Number(entry.toFixed(0)),
        series: series.map((s) => ({
          ...s,
          entry_peak_rate: Number(s.entry_peak_rate.toExponential(3)),
          heat_vs_direct: Number((s.entry_peak_rate / direct).toFixed(3)),
        })),
      });
    }
  }
  if (!byDepth.length) return null;

  // The headline multiplier comes from the DEEPEST entry that flew — the committed plunge
  // the design is trying to make survivable, and the case where skimming has the most to
  // give. Shallower entries are reported alongside so the trend is visible.
  const deepest = byDepth[0];
  return {
    measured_at_entry_depth_m: deepest.entry_depth_m,
    skim_heat_multiplier_measured: deepest.series.map((s) => s.heat_vs_direct),
    by_entry_depth: byDepth,
  };
}

// ---------------------------------------------------------------- 1 · verification

function verificationSweep(baseline, params, catalog) {
  const { world, cfg, inferred } = sim.buildConfig(baseline, params);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt(baseline, 'suborbital'));

  const hold = fullHoldMass(catalog, params);
  const loads = [
    { name: 'empty', cargoMass: 0 },
    { name: 'half hold', cargoMass: hold.fullHold / 2 },
    { name: 'full hold', cargoMass: hold.fullHold },
  ];

  // -- ascent: can the ship reach each band, and with what margin
  const ascents = [];
  for (const band of BANDS) {
    const alt = bandAlt(baseline, band);
    const r = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt);
    ascents.push({
      band,
      altitude_m: alt,
      reached: !!r.reached,
      why: r.why || null,
      fuel_remaining_kg: Number((r.fuelRemaining || 0).toFixed(2)),
      fuel_margin_pct: Number((((r.fuelRemaining || 0) / cfg.fuel) * 100).toFixed(1)),
    });
  }

  // -- descent: every band x load, scanned across braking depths
  const descents = [];
  for (const band of BANDS) {
    const alt = bandAlt(baseline, band);
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
  for (const band of BANDS) {
    const st = skimStudy(world, cfg, bandAlt(baseline, band), params, band, 0);
    if (st) skims[band] = st;
  }

  // -- the unstaged braking pass the GDD's descent depends on
  const unstaged = [];
  for (const band of SLICE_BANDS) {
    const alt = bandAlt(baseline, band);
    // A deliberately shallow braking pass, flown unstaged as §2.3.1 describes.
    const r = sim.simulateDescent(world, { ...cfg, cargoMass: 0 }, alt, world.atmTop * 0.72, 3);
    const peak = r.passes.length ? r.passes[0].peakHeat : null;
    unstaged.push({
      band,
      shallow_pass_peak_heat: peak === null ? null : Number(peak.toFixed(0)),
      survivable: peak !== null && peak < params.reentry.heat_capacity,
    });
  }

  return {
    inferred,
    heat_scale_calibration:
      'Heat is reported on the 0-100 bar. The scale is fixed once so that an empty ship ' +
      'making a single-pass descent from the suborbital band peaks at 100, which is the ' +
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
    ascents,
    descents,
    skims,
    unstaged_braking: unstaged,
  };
}

// ---------------------------------------------------------------- 2 · exploration

// The design's own targets, turned into measurable pass/fail. This is the closest thing the
// crew has to an objective function, and it is deliberately written out rather than folded
// into one number, so a config that scores 5/7 says WHICH two it missed.
function scoreWorld(baseline, params, catalog) {
  const { world, cfg } = sim.buildConfig(baseline, params);
  cfg.heatScale = sim.calibrateHeatScale(world, cfg, bandAlt(baseline, 'suborbital'));
  const hold = fullHoldMass(catalog, params);

  const targets = {};

  // 1. Every shipping-slice band is reachable, with margin but not a silly amount.
  let allReached = true, minMargin = 1, maxMargin = 0;
  for (const band of SLICE_BANDS) {
    const r = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, bandAlt(baseline, band));
    if (!r.reached) { allReached = false; break; }
    const m = r.fuelRemaining / cfg.fuel;
    minMargin = Math.min(minMargin, m);
    maxMargin = Math.max(maxMargin, m);
  }
  targets.bands_reachable = allReached && minMargin > 0.08;
  targets.fuel_margin_sane = allReached && minMargin > 0.08 && maxMargin < 0.6;

  // 2 & 3. Skimming: does bleeding speed high up actually cool the committed entry, and does
  //        the benefit saturate? Both are properties of the world, and both have to hold for
  //        the design's descent to be a decision rather than a formality. Measured from the
  //        high band, where skims are supposed to matter most.
  const skimStudyHigh = skimStudy(world, cfg, bandAlt(baseline, 'high'), params, 'high', 0);
  const mults = skimStudyHigh ? skimStudyHigh.skim_heat_multiplier_measured : [];
  // A skim is worth flying if two of them cut the entry's peak by at least 15%.
  targets.skimming_cools_the_entry = mults.length >= 3 && mults[2] <= 0.85;
  // ...and worth stopping if the third adds little over the second, so fatigue can price it.
  targets.skim_benefit_saturates = mults.length >= 4
    && mults[3] >= mults[2] - 0.12 && mults[3] <= mults[2];

  // 4. An unstaged shallow braking pass is survivable — the GDD's descent begins with them.
  const un = sim.simulateDescent(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'suborbital'), world.atmTop * 0.72, 3);
  const unPeak = un.passes.length ? un.passes[0].peakHeat : Infinity;
  targets.unstaged_pass_survivable = unPeak < params.reentry.heat_capacity;

  // 5. A full hold lands soft, but only just — the margin is what the Parachute upgrade buys.
  const fullScan = sim.descentScan(world, { ...cfg, cargoMass: hold.fullHold },
    bandAlt(baseline, 'low'), params, 'low', SCAN_SAMPLES);
  const fullBest = fullScan.length
    ? fullScan.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.full_hold_lands_soft = !!fullBest
    && fullBest.touchdownSpeed <= params.landing.soft_landing_ms
    && fullBest.touchdownSpeed >= params.landing.soft_landing_ms * 0.6;

  // 6. Greed costs something: a full hold is measurably harder to bring home than an empty one.
  const emptyLow = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'low'), params, 'low', SCAN_SAMPLES);
  const emptyBest = emptyLow.length
    ? emptyLow.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.greed_costs_something = !!(fullBest && emptyBest)
    && fullBest.totalAblation > emptyBest.totalAblation * 1.15;

  // 7. The return leg gets harder with altitude.
  const highScan = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'high'), params, 'high', SCAN_SAMPLES);
  const highBest = highScan.length
    ? highScan.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.difficulty_rises_with_band = !!(highBest && emptyBest)
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
  const bandAlts = [atmTop * 1.6, atmTop * 2.6, atmTop * 4.2];
  b.bands.forEach((band, i) => {
    band.altitude_min_m = bandAlts[i] * 0.9;
    band.altitude_max_m = bandAlts[i] * 1.1;
    const r = R + bandAlts[i];
    band.orbital_speed_ms = Math.sqrt(mu / r);
    band.period_s = (2 * Math.PI * r) / band.orbital_speed_ms;
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
  enumerateCells, scoreCell, sweepIndices,
};

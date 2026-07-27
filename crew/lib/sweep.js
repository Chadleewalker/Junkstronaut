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

const BANDS = ['suborbital', 'low', 'high'];
const SLICE_BANDS = ['suborbital', 'low'];   // what actually ships this semester (§4.1)

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

  // 2. Aerobraking exists at all: more than one pass count is achievable, so the player has
  //    a decision rather than a single forced descent.
  const subScan = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'suborbital'), params, 'suborbital', 70);
  const subByN = sim.ablationByPassCount(subScan);
  targets.aerobraking_exists = subByN.length >= 3;

  // 3. The cheapest descent sits in the 2-4 window the GDD asks for.
  const cheapest = subByN.length
    ? subByN.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)).passes
    : null;
  targets.optimum_in_window = cheapest !== null && cheapest >= 2 && cheapest <= 4;

  // 4. An unstaged shallow braking pass is survivable — the GDD's descent begins with them.
  const un = sim.simulateDescent(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'suborbital'), world.atmTop * 0.72, 3);
  const unPeak = un.passes.length ? un.passes[0].peakHeat : Infinity;
  targets.unstaged_pass_survivable = unPeak < params.reentry.heat_capacity;

  // 5. A full hold lands soft, but only just — the margin is what the Parachute upgrade buys.
  const fullScan = sim.descentScan(world, { ...cfg, cargoMass: hold.fullHold },
    bandAlt(baseline, 'low'), params, 'low', 70);
  const fullBest = fullScan.length
    ? fullScan.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.full_hold_lands_soft = !!fullBest
    && fullBest.touchdownSpeed <= params.landing.soft_landing_ms
    && fullBest.touchdownSpeed >= params.landing.soft_landing_ms * 0.6;

  // 6. Greed costs something: a full hold is measurably harder to bring home than an empty one.
  const emptyLow = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'low'), params, 'low', 70);
  const emptyBest = emptyLow.length
    ? emptyLow.reduce((a, x) => (x.totalAblation < a.totalAblation ? x : a)) : null;
  targets.greed_costs_something = !!(fullBest && emptyBest)
    && fullBest.totalAblation > emptyBest.totalAblation * 1.15;

  // 7. The return leg gets harder with altitude.
  const highScan = sim.descentScan(world, { ...cfg, cargoMass: 0 },
    bandAlt(baseline, 'high'), params, 'high', 70);
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
      cheapest_pass_count: cheapest,
      pass_counts_reachable: subByN.length,
      unstaged_peak_heat: Number.isFinite(unPeak) ? Number(unPeak.toFixed(0)) : null,
      full_hold_touchdown_ms: fullBest ? Number(fullBest.touchdownSpeed.toFixed(2)) : null,
      ballistic_coefficient_staged: Number((cfg.dryMass / (cfg.cdShield * cfg.area)).toFixed(1)),
    },
  };
}

// Vary the world and the ship over a grid. These are the five things the design can still
// freely choose — everything else in the params follows from them.
const GRID = {
  surface_gravity_ms2: [10, 20, 30],
  sea_level_density_kgm3: [0.02, 0.1, 0.5, 3],
  scale_height_frac: [0.08, 0.15, 0.3],      // as a fraction of atmosphere thickness
  reference_area_m2: [0.4, 1.2, 3.5],
  dry_mass_kg: [60, 180, 500],
};

function explorationSweep(baseline, params, catalog, opts = {}) {
  const limit = opts.limit || Infinity;
  const rows = [];
  let n = 0;

  for (const g of GRID.surface_gravity_ms2) {
    for (const rho of GRID.sea_level_density_kgm3) {
      for (const shFrac of GRID.scale_height_frac) {
        for (const area of GRID.reference_area_m2) {
          for (const dry of GRID.dry_mass_kg) {
            if (n++ >= limit) break;

            const b = JSON.parse(JSON.stringify(baseline));
            b.planet.surface_gravity_ms2 = g;
            b.planet.sea_level_density_kgm3 = rho;
            b.planet.scale_height_m = b.planet.atmosphere_top_m * shFrac;
            b.reentry.reference_area_m2 = area;
            // Orbital speeds follow from gravity; keep the baseline internally consistent.
            const R = b.planet.radius_m, mu = g * R * R;
            for (const band of b.bands) {
              const r = R + (band.altitude_min_m + band.altitude_max_m) / 2;
              band.orbital_speed_ms = Math.sqrt(mu / r);
              band.period_s = (2 * Math.PI * r) / band.orbital_speed_ms;
            }

            const p = JSON.parse(JSON.stringify(params));
            p.flight.dry_mass_kg = dry;
            // Thrust scales with weight so every config has a comparable liftoff TWR;
            // otherwise the grid just measures which cells happen to be able to take off.
            p.flight.thrust_n = (dry + p.flight.fuel_capacity_kg) * g * 1.8;

            let s;
            try { s = scoreWorld(b, p, catalog); }
            catch (e) { continue; }

            rows.push({
              surface_gravity_ms2: g,
              sea_level_density_kgm3: rho,
              scale_height_m: Number(b.planet.scale_height_m.toFixed(1)),
              reference_area_m2: area,
              dry_mass_kg: dry,
              score: s.score,
              max_score: s.max_score,
              targets: s.targets,
              measured: s.measured,
            });
          }
        }
      }
    }
  }

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

module.exports = { verificationSweep, explorationSweep, scoreWorld, fullHoldMass, GRID };

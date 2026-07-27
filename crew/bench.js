#!/usr/bin/env node
'use strict';
// The design bench — score candidate configurations against the eight design targets.
//
// The exploration sweep answers "where in the whole space is there a good config". This
// answers the other question, the one a designer actually asks twenty times an hour: "what
// happens to the targets if I make the planet smaller and the tank bigger". A candidate takes
// about two and a half seconds, so the loop is you and the numbers rather than you and a
// batch job — a dozen ideas in half a minute.
//
// Nearly all of that is scanning braking depths. For a rough first pass over many candidates,
// JUNK_SCAN_SAMPLES=24 is about three times quicker and flips roughly one verdict in 250 —
// almost always difficulty_rises_with_band. Sort with it, then confirm anything you like at
// the default. See the note on SCAN_SAMPLES in lib/sweep.js for the measurements.
//
// It reads the crew's own output as the starting point — the Researcher's planet, the
// Balancer's params, the Designer's catalog — and each candidate states only what it changes.
//
//   node bench.js                        score the crew's shipped config alone
//   node bench.js candidates.json        score a file of named candidates
//   node bench.js --demo                 score a spread of candidates, to see the shape
//   node bench.js --out results.json     also write the full results as JSON
//   node bench.js --targets              explain what the eight targets mean, and exit
//
// A candidates file is a JSON array. Every field is optional; anything omitted keeps the
// crew's value, so a candidate is a diff and not a whole world:
//
//   [
//     { "name": "smaller planet",   "radius_m": 60000, "fuel_capacity_kg": 1200 },
//     { "name": "punchier engine",  "twr": 4.0 },
//     { "name": "both",             "radius_m": 60000, "twr": 4.0, "fuel_fraction": 1.5 }
//   ]
//
// Planet fields:  radius_m, surface_gravity_ms2, sea_level_density_kgm3,
//                 atmosphere_top_m, scale_height_m, reference_area_m2
// Ship fields:    dry_mass_kg, fuel_capacity_kg, fuel_fraction (tank as a multiple of dry
//                 mass), thrust_n, twr (sets thrust from weight), fuel_burn_kgs
//
// Setting radius_m rescales the atmosphere and the bands the way the exploration grid does,
// unless you also state atmosphere_top_m or scale_height_m yourself.

const fs = require('fs');
const path = require('path');
const { scoreWorld } = require('./lib/sweep');
const sim = require('./lib/sim');

const ROOT = __dirname;

const TARGETS = {
  bands_reachable: 'Both shipping-slice bands are reachable, with more than 8% fuel left.',
  fuel_margin_sane: 'That spare fuel is between 8% and 60% — enough to matter, not so much\n' +
    '    that the trip has no decision in it.',
  skimming_cools_the_entry: 'Two skims cut the committed entry\'s peak heat by at least 15%.',
  skim_benefit_saturates: 'A third skim adds little over the second, so fatigue can price it.',
  unstaged_pass_survivable: 'The first coarse braking pass, flown on the naked hull, stays\n' +
    '    under the heat capacity.',
  full_hold_lands_soft: 'A full hold lands soft — but only just, which is what the Parachute\n' +
    '    upgrade is for.',
  greed_costs_something: 'A full hold is at least 15% more expensive to bring home than an\n' +
    '    empty one.',
  difficulty_rises_with_band: 'The return leg gets harder with altitude.',
};
const SHORT = {
  bands_reachable: 'reach', fuel_margin_sane: 'margin',
  skimming_cools_the_entry: 'skimCool', skim_benefit_saturates: 'skimSat',
  unstaged_pass_survivable: 'unstaged', full_hold_lands_soft: 'softLand',
  greed_costs_something: 'greed', difficulty_rises_with_band: 'altRisk',
};

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function loadCrewOutput(outDir) {
  const need = {
    baseline: path.join(outDir, 'params', 'baseline.json'),
    params: path.join(outDir, 'config', 'game_params.json'),
    catalog: path.join(outDir, 'data', 'debris_catalog.json'),
  };
  for (const [what, file] of Object.entries(need)) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `no ${what} at ${path.relative(process.cwd(), file)}.\n` +
        'The bench scores candidates against a run the crew has already produced. Run\n' +
        '`node run-crew.js --stub` first — it replays a recorded run in about a second.'
      );
    }
  }
  return { baseline: read(need.baseline), params: read(need.params), catalog: read(need.catalog) };
}

// A candidate is a diff against the crew's output. Anything it does not mention is inherited,
// which is what keeps a candidate readable: "radius 60 km" rather than a whole planet.
function applyCandidate(base, cand) {
  const b = JSON.parse(JSON.stringify(base.baseline));
  const p = JSON.parse(JSON.stringify(base.params));

  for (const k of ['surface_gravity_ms2', 'sea_level_density_kgm3', 'atmosphere_top_m', 'scale_height_m']) {
    if (cand[k] !== undefined) b.planet[k] = cand[k];
  }
  if (cand.reference_area_m2 !== undefined) b.reentry.reference_area_m2 = cand.reference_area_m2;

  // Changing the radius without restating the air column and the bands would leave a planet
  // whose atmosphere belongs to a different world. Same scaling the exploration grid uses,
  // and skipped for any piece the candidate states for itself.
  if (cand.radius_m !== undefined) {
    const R = cand.radius_m;
    b.planet.radius_m = R;
    const atmTop = cand.atmosphere_top_m !== undefined ? cand.atmosphere_top_m : R * 0.28;
    b.planet.atmosphere_top_m = atmTop;
    if (cand.scale_height_m === undefined) b.planet.scale_height_m = atmTop * 0.1;
    const mu = b.planet.surface_gravity_ms2 * R * R;
    const alts = [atmTop * 1.6, atmTop * 2.6, atmTop * 4.2];
    b.bands.forEach((band, i) => {
      band.altitude_min_m = alts[i] * 0.9;
      band.altitude_max_m = alts[i] * 1.1;
      const r = R + alts[i];
      band.orbital_speed_ms = Math.sqrt(mu / r);
      band.period_s = (2 * Math.PI * r) / band.orbital_speed_ms;
    });
  }

  for (const k of ['dry_mass_kg', 'fuel_capacity_kg', 'thrust_n', 'fuel_burn_kgs']) {
    if (cand[k] !== undefined) p.flight[k] = cand[k];
  }
  // Ratios are applied after absolutes, so a candidate can say "this dry mass, and a tank
  // one and a half times it" and have both land the way it reads.
  if (cand.fuel_fraction !== undefined) p.flight.fuel_capacity_kg = p.flight.dry_mass_kg * cand.fuel_fraction;
  if (cand.twr !== undefined) {
    p.flight.thrust_n = (p.flight.dry_mass_kg + p.flight.fuel_capacity_kg) * b.planet.surface_gravity_ms2 * cand.twr;
  }
  return { b, p };
}

function measure(b, p, catalog) {
  const s = scoreWorld(b, p, catalog);
  const { world, cfg } = sim.buildConfig(b, p);
  const wet = cfg.dryMass + cfg.fuel;
  const ve = cfg.thrust / cfg.burnRate;
  const alt = (n) => { const x = b.bands.find((z) => z.name === n); return (x.altitude_min_m + x.altitude_max_m) / 2; };
  const margins = ['suborbital', 'low', 'high'].map((n) => {
    const r = sim.simulateAscent(world, { ...cfg, cargoMass: 0 }, alt(n));
    return r.reached ? r.fuelRemaining / cfg.fuel : null;
  });
  return {
    score: s.score, max_score: s.max_score, targets: s.targets, measured: s.measured,
    ship: {
      dry_mass_kg: cfg.dryMass, fuel_capacity_kg: Number(cfg.fuel.toFixed(0)),
      thrust_n: Number(cfg.thrust.toFixed(0)),
      twr_at_liftoff: Number((cfg.thrust / (wet * b.planet.surface_gravity_ms2)).toFixed(2)),
      exhaust_velocity_ms: Number(ve.toFixed(0)),
      specific_impulse_s: Number((ve / 9.81).toFixed(0)),
      delta_v_ms: Number((ve * Math.log(wet / cfg.dryMass)).toFixed(0)),
    },
    planet: {
      radius_m: b.planet.radius_m, surface_gravity_ms2: b.planet.surface_gravity_ms2,
      sea_level_density_kgm3: b.planet.sea_level_density_kgm3,
      atmosphere_top_m: Number(b.planet.atmosphere_top_m.toFixed(0)),
    },
    fuel_margins: margins.map((m) => (m === null ? null : Number((m * 100).toFixed(1)))),
  };
}

// Named by what they actually are rather than by intent — the crew ships a 1900 kg tank on a
// 900 kg hull, so "fuel_fraction 1.5" is a SMALLER tank than the shipped one, and calling it
// "bigger" would make it read as a finding that a bigger tank scores worse.
const DEMO = [
  { name: 'crew as shipped' },
  { name: 'tank 1.5x dry (1350 kg)', fuel_fraction: 1.5 },
  { name: 'tank 2.5x dry (2250 kg)', fuel_fraction: 2.5 },
  { name: 'engine at TWR 4', twr: 4.0 },
  { name: '60 km planet', radius_m: 60000 },
  { name: '60 km + thin air', radius_m: 60000, sea_level_density_kgm3: 0.1 },
  { name: '160 km + light hull', radius_m: 160000, dry_mass_kg: 800, fuel_fraction: 1.5 },
  { name: '160 km + thin air', radius_m: 160000, sea_level_density_kgm3: 0.1, dry_mass_kg: 800, fuel_fraction: 1.5 },
];

function main(argv) {
  const args = { file: null, out: null, demo: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') args.demo = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--targets') {
      console.log('\nThe eight design targets, as the simulator measures them:\n');
      for (const [k, v] of Object.entries(TARGETS)) console.log(`  ${SHORT[k].padEnd(9)} ${k}\n    ${v}\n`);
      return 0;
    } else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n')
        .filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
      return 0;
    } else if (a.startsWith('-')) { console.error(`unknown argument: ${a}`); return 2; }
    else args.file = a;
  }

  const base = loadCrewOutput(path.join(ROOT, 'out'));
  const candidates = args.demo ? DEMO
    : args.file ? read(args.file)
    : [{ name: 'crew as shipped' }];

  const keys = Object.keys(TARGETS);
  const results = [];
  const t0 = Date.now();
  for (const cand of candidates) {
    const { b, p } = applyCandidate(base, cand);
    let m;
    try { m = measure(b, p, base.catalog); }
    catch (e) { results.push({ name: cand.name || '(unnamed)', error: e.message }); continue; }
    results.push({ name: cand.name || '(unnamed)', candidate: cand, ...m });
  }

  const w = Math.max(20, ...results.map((r) => r.name.length)) + 2;
  console.log('');
  console.log('  ' + 'candidate'.padEnd(w) + 'score  ' + keys.map((k) => SHORT[k].padEnd(9)).join('') + 'margins sub/low/high');
  console.log('  ' + '-'.repeat(w + 7 + keys.length * 9 + 20));
  for (const r of results) {
    if (r.error) { console.log('  ' + r.name.padEnd(w) + '  error: ' + r.error.split('\n')[0]); continue; }
    const marks = keys.map((k) => (r.targets[k] ? '   yes   ' : '   --    ')).join('');
    const marg = r.fuel_margins.map((m) => (m === null ? '  --  ' : (m.toFixed(0) + '%').padStart(5) + ' ')).join('');
    console.log('  ' + r.name.padEnd(w) + (r.score + '/' + r.max_score).padEnd(7) + marks + marg);
  }
  console.log('');
  for (const r of results) {
    if (r.error) continue;
    console.log('  ' + r.name.padEnd(w) +
      `dv ${String(r.ship.delta_v_ms).padStart(5)} m/s   TWR ${String(r.ship.twr_at_liftoff).padStart(5)}   ` +
      `Isp ${String(r.ship.specific_impulse_s).padStart(4)} s   tank ${String(r.ship.fuel_capacity_kg).padStart(5)} kg   ` +
      `planet ${(r.planet.radius_m / 1000).toFixed(0)} km`);
  }
  console.log('');
  console.log(`  ${results.length} candidate(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s.` +
    '  "--" means the target is not met; run --targets to see what each one asks for.');
  console.log('');

  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(results, null, 2) + '\n');
    console.log(`  wrote ${args.out}\n`);
  }
  return 0;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (err) { console.error(`\nbench failed: ${err.message}\n`); process.exit(1); }
}

module.exports = { applyCandidate, measure, TARGETS };

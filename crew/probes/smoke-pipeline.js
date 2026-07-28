#!/usr/bin/env node
'use strict';
// Pre-flight for a live run: drive every deterministic stage against the NEW contracts,
// with no model calls.
//
// A live run costs 40 minutes and real tokens, and the parts most likely to be broken after
// a contract change are the ones no test covers end to end — the verification sweep, the
// Godot emitter and the dashboard renderer, each of which reads fields that only exist in
// the new shape. `--stub` cannot check this: its recorded agent outputs are all pre-contract,
// so it would fail at the schema gate before reaching any of them.
//
// Builds a synthetic but contract-valid input set from the locked planet and the recorded
// catalog, then runs the pipeline. Writes nothing into out/.

const path = require('path');
const CREW = path.join(__dirname, '..');
const sim = require(path.join(CREW, 'lib/sim'));
const { verificationSweep, fullHoldMass } = require(path.join(CREW, 'lib/sweep'));
const { emitResource, emitScript } = require(path.join(CREW, 'lib/godot'));
const { renderDashboard } = require(path.join(CREW, 'lib/charts'));

const lock = require(path.join(CREW, 'planet.lock.json'));
const P0 = require(path.join(CREW, 'out/config/game_params.json'));
const rawCatalog = require(path.join(CREW, 'out/data/debris_catalog.json'));

// ---- baseline in the new shape, straight off the lock
const R = lock.planet.radius_m;
const mu = lock.planet.surface_gravity_ms2 * R * R;
const samples = ['bottom', 'middle', 'top'].map((name) => {
  const alt = lock.band.sample_altitudes_m[name];
  const r = R + alt;
  const v = Math.sqrt(mu / r);
  return { name, altitude_m: alt, orbital_speed_ms: Number(v.toFixed(1)),
           period_s: Number(((2 * Math.PI * r) / v).toFixed(1)) };
});
const baseline = {
  agent: 'researcher',
  planet: lock.planet,
  bands: [{ name: lock.band.name, altitude_min_m: lock.band.altitude_min_m,
            altitude_max_m: lock.band.altitude_max_m, samples }],
  reentry: require(path.join(CREW, 'out/params/baseline.json')).reentry,
  derivation: ['synthetic input for the pipeline smoke test'],
  sources: [{ claim: 'smoke', reference: 'planet.lock.json' }],
};

// ---- catalog in the new shape: pieces carry altitudes, summary is thirds
const band = baseline.bands[0];
const span = band.altitude_max_m - band.altitude_min_m;
const legacyAlt = { suborbital: 'bottom', low: 'middle', high: 'top' };
const catalog = {
  ...rawCatalog,
  debris: rawCatalog.debris.map((d) => ({
    ...d,
    altitude_m: d.altitude_m !== undefined ? d.altitude_m
      : samples.find((s) => s.name === legacyAlt[d.band]).altitude_m,
  })),
};
const thirdOf = (alt) => {
  const f = (alt - band.altitude_min_m) / span;
  return f < 1 / 3 ? 'bottom' : f < 2 / 3 ? 'middle' : 'top';
};
catalog.band_summary = ['bottom', 'middle', 'top'].map((name) => {
  const group = catalog.debris.filter((d) => thirdOf(d.altitude_m) === name);
  const wTotal = group.reduce((a, d) => a + d.spawn_weight, 0) || 1;
  return {
    sample: name,
    altitude_m: samples.find((s) => s.name === name).altitude_m,
    piece_count: group.length || 1,
    fragile_fraction: group.filter((d) => d.fragile).reduce((a, d) => a + d.spawn_weight, 0) / wTotal,
    mean_mass_kg: group.length ? group.reduce((a, d) => a + d.mass_kg, 0) / group.length : 1,
  };
});

// ---- params in the new shape
const params = JSON.parse(JSON.stringify(P0));
params.reentry.commit_floor_m = 8000;
params.reentry.heat_capacity = 235;
// MIGRATE ONLY IF IT IS LEGACY. This has to be idempotent: out/ now holds a run that is
// already in the new shape, and rekeying it unconditionally set every ablation map to
// {bottom: undefined, middle: undefined, top: undefined} — which the sweep swallowed and the
// dashboard renderer died on, three stages later and nowhere near the cause.
if (params.economy.band_value_multiplier) {
  delete params.economy.band_value_multiplier;
  params.economy.value_gradient = { at_bottom: 1.0, at_top: 5.5 };
}
for (const key of ['heat_index', 'cost_curve', 'optimal_skims']) {
  const old = params.ablation[key];
  if (old && old.suborbital !== undefined) {
    params.ablation[key] = { bottom: old.suborbital, middle: old.low, top: old.high };
  }
}
// The shield tiers buy bar capacity now, per the decision.
for (const u of params.upgrades) {
  if (u.part === 'heat_shield') { u.effect = 'heat_capacity'; u.value = u.tier === 1 ? 260 : 285; }
}

const step = (name, fn) => {
  try {
    const out = fn();
    console.log(`ok    ${name}`);
    return out;
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
    return null;
  }
};

console.log('pipeline smoke test — new contracts, no model calls\n');

const hold = step('fullHoldMass reads altitudes', () => fullHoldMass(catalog, params, baseline));
if (hold) console.log(`      full hold ${hold.fullHold.toFixed(1)} kg`);

const verification = step('verificationSweep flies both routes and the new loads',
  () => verificationSweep(baseline, params, catalog));
if (verification) {
  const a = verification.ascents[0];
  console.log(`      ascent: route ${a.route}, arc apex ${a.arc_apex_m} m, ` +
              `EVA ${a.arc_eva_window_s}s, climb heat ${a.climb_peak_heat} ` +
              `(survivable: ${a.climb_survivable})`);
  const loads = [...new Set(verification.descents.map((d) => d.load))];
  console.log(`      descent loads flown: ${loads.join(', ')}`);
}

step('emitScript', () => emitScript());
step('emitResource carries the band', () => {
  const tres = emitResource(params, catalog, baseline);
  if (!/^band = /m.test(tres)) throw new Error('band block missing from the .tres');
  if (!/altitude_m/.test(tres)) throw new Error('debris altitudes missing from the .tres');
  return tres;
});

step('renderDashboard', () => {
  const html = renderDashboard({
    baseline, catalog, params,
    audit: { verdict: 'pass', checks: [], observations: [] },
    manifest: { crew: 'smoke', mode: 'smoke', finished_at: '', duration_s: 0, agents: [] },
    playtest: { verdict: 'ok', findings: [], candidate: {} },
    sweeps: { verification, exploration: null },
  });
  if (html.length < 5000) throw new Error(`dashboard is suspiciously short: ${html.length} bytes`);
  return html;
});

console.log(process.exitCode ? '\nsomething is broken — do not start a live run yet.'
                             : '\nall stages clean. A live run has somewhere to land.');

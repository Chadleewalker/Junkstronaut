'use strict';
// A deterministic 2D flight model for Junkstronaut.
//
// Everything else in this crew reasons about the numbers. This flies them. It is the
// difference between "the algebra says a full hold lands at 4.6 m/s" and "we launched it,
// aerobraked it and it touched down at 4.6 m/s" — and the two disagree more often than you
// would like.
//
// It is deterministic scaffolding, not an agent: fixed timestep, no randomness, no model in
// the loop. The same config always produces the same trajectory, which is the only reason
// a sweep of thousands of runs means anything (GDD §4.4, "headless determinism").
//
// WHAT IS PHYSICS AND WHAT IS A GAME RULE. The distinction matters and is kept sharp:
//   * Physics, simulated here: gravity, atmospheric density, drag, heating, orbital
//     mechanics, terminal velocity under a canopy.
//   * Game rules, taken from the crew's params and NOT re-derived: how peak heat converts
//     to shield ablation, what counts as a soft landing, the tow fee.
// Simulating the physics and applying the crew's rules is what lets the sweep answer "is
// the cheapest descent really 2-4 passes" by measurement, rather than by restating the
// formula that claimed it.
//
// SIMPLIFICATIONS, stated plainly because they bound what the results are worth:
//   * Point mass. No rotation, no attitude error — the pilot is assumed to hold retrograde
//     perfectly, so measured heat is a best case and a real player will do slightly worse.
//   * Impulsive burns for orbit changes; the fuel cost is charged from the rocket equation.
//     Ascent is integrated properly because its fuel cost is the thing being measured.
//   * Aerobraking takes two depths — a braking periapsis for the skims and a separate one
//     for the committed entry — with an impulsive burn between them. That is the manoeuvre
//     §2.3.1 describes. A single shared depth cannot express it, and modelling it that way
//     conflates skimming with decaying.
//   * Cargo is a mass. Slot accounting lives in the catalog, not here.

// ---------------------------------------------------------------- world

function makeWorld(baseline) {
  const p = baseline.planet;
  const R = p.radius_m;
  const g0 = p.surface_gravity_ms2;
  return {
    R,
    g0,
    mu: g0 * R * R,
    rho0: p.sea_level_density_kgm3,
    H: p.scale_height_m,
    atmTop: p.atmosphere_top_m,
    // Exponential atmosphere, hard-cut at the stated top so orbits above it are drag-free.
    rhoAt(h) {
      if (h >= this.atmTop || h < 0) return h < 0 ? this.rho0 : 0;
      return this.rho0 * Math.exp(-h / this.H);
    },
  };
}

// Classical elements from a state vector. Only what the descent logic needs.
function orbit(world, x, y, vx, vy) {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const energy = v2 / 2 - world.mu / r;
  const h = x * vy - y * vx;                       // specific angular momentum, 2D scalar
  const a = -world.mu / (2 * energy);              // negative energy -> bound
  const e2 = 1 + (2 * energy * h * h) / (world.mu * world.mu);
  const e = Math.sqrt(Math.max(e2, 0));
  return {
    r, a, e,
    apoapsis: energy < 0 ? a * (1 + e) : Infinity,
    periapsis: a * (1 - e),
    bound: energy < 0,
  };
}

// Velocity at radius ra on an ellipse whose apoapsis is ra and periapsis is rp.
function velocityForPeriapsis(world, ra, rp) {
  return Math.sqrt((2 * world.mu * rp) / (ra * (ra + rp)));
}

// ---------------------------------------------------------------- forces

// Instantaneous heating rate, unnormalised. Convective heating scales with the square root
// of density and a high power of velocity (Sutton-Graves); the exponent comes from the
// Researcher rather than being hardcoded here.
function heatRate(world, h, speed, exponent) {
  const rho = world.rhoAt(h);
  if (rho <= 0) return 0;
  return Math.sqrt(rho / world.rho0) * Math.pow(speed, exponent);
}

// One integration step, semi-implicit Euler. Small fixed dt inside the atmosphere where
// the interesting things happen, larger outside where nothing does.
function step(world, s, dt, cfg) {
  const r = Math.hypot(s.x, s.y);
  const h = r - world.R;

  // gravity
  const gm = world.mu / (r * r * r);
  let ax = -gm * s.x;
  let ay = -gm * s.y;

  // Drag, opposing velocity. Which coefficient applies depends on the configuration, and
  // GDD §2.3.1 makes that a real decision rather than a detail: braking passes are flown
  // UNSTAGED — slender naked hull, low drag, and no shield between the airflow and the
  // ship, so heat builds far faster. Staging exposes the blunt shield: much more drag, much
  // better protection, and no thrust ever again. Modelling both phases with the shield's
  // numbers would quietly make aerobraking three times more effective than the design says.
  const speed = Math.hypot(s.vx, s.vy);
  const rho = world.rhoAt(h);
  const cd = s.chuteOpen ? cfg.chuteCd : (s.staged ? cfg.cdShield : cfg.cdHull);
  const area = s.chuteOpen ? cfg.chuteArea : cfg.area;
  if (rho > 0 && speed > 0) {
    const q = 0.5 * rho * speed * speed;
    const aDrag = (q * cd * area) / s.mass;
    ax -= aDrag * (s.vx / speed);
    ay -= aDrag * (s.vy / speed);
  }

  s.vx += ax * dt;
  s.vy += ay * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  // Heat is a bar that fills and bleeds off, exactly as GDD §2.3.1 describes it, rather
  // than a running total — which is why a shallow pass can be long and still stay cool.
  // The unstaged penalty is about ORIENTATION, not about the stage being attached. §2.2 puts
  // the heat shield behind the thruster and tank, exposed only by staging — so an unstaged
  // ship taking a braking pass has nothing but hull between it and the airflow, and pays 3x.
  //
  // A climbing rocket is unstaged too, and used to pay the same 3x. It should not: it is
  // flying pointy end first, under thrust, in the configuration it was built for. With the
  // penalty applied the base ship's launch peaked at 142.5 against a capacity of 100 — it
  // burned up before it ever reached the junk, and nothing checked. Exempting the ascent
  // brings it to 47.5, about half the bar: the player feels the mechanic on their first
  // flight and learns to read it, and reentry stays the place it is dangerous.
  //
  // `s.ascending` is set only by simulateAscent, and for its whole duration including the
  // unpowered coast to apoapsis — the ship is still nose-first up there. Descent never sets
  // it, so every braking-pass number is unchanged.
  const shielding = (s.staged || s.ascending) ? 1 : cfg.unstagedHeatMultiplier;
  const qdot = heatRate(world, h, speed, cfg.heatExponent) * cfg.heatScale * shielding;
  s.heat += (qdot - s.heat / cfg.heatDissipation) * dt;
  if (s.heat < 0) s.heat = 0;
  if (s.heat > s.peakHeat) s.peakHeat = s.heat;

  // Total energy absorbed, with no drain term. Tracked alongside the bar because the two
  // rank descents in OPPOSITE orders, and which one ablation keys off is a design decision
  // rather than a physical fact:
  //   * the BAR rewards brevity — a plunge ends before it fills, a long shallow pass lets
  //     it reach equilibrium, so gentle flying reads as hotter;
  //   * the LOAD rewards gentleness — thin air for a long time absorbs less total energy
  //     than thick air at orbital speed, which is the intuition aerobraking runs on.
  // §2.3.1 as written keys ablation off peak heat, i.e. the bar.
  s.heatLoad += qdot * dt;

  // Peak instantaneous heating RATE — the third candidate, and the one real spacecraft are
  // designed against. It is not the same as the peak of the bar: the bar has a 5 s drain
  // constant, so a plunge's enormous but brief spike never fills it, while a long shallow
  // pass lets it equilibrate. Keying ablation off the rate is what makes a plunge the
  // dangerous option and multi-pass braking the cheap one — which is the design's intent.
  if (qdot > (s.peakRate || 0)) s.peakRate = qdot;

  s.t += dt;
  return { r, h, speed };
}

const DT_ATM_REF = 0.002;   // tuned against an 800 m world
const DT_VAC_REF = 0.05;

// ---------------------------------------------------------------- ascent

// Integrated gravity turn: vertical off the pad, pitch over on a fixed program, burn until
// apoapsis reaches the target, coast, then circularise. Fuel is measured, not assumed —
// "can this ship even get there" is the first thing a sweep should answer.
//
// TWO ROUTES UP, AND ONLY ONE OF THEM USED TO EXIST HERE. GDD §1 offers "a suborbital arc or
// orbit" and both are legal play. This function circularised unconditionally and reported
// `reached: false` when it could not afford to — so a ship perfectly able to throw a
// ballistic arc up to the junk, hang there long enough to EVA, and fall back read as unable
// to reach the band at all. That is what `shipping_slice_bands_reachable` has been failing
// on: not the altitude, the circularisation burn, which the arc never pays.
//
// opts.circularise  false flies the arc: burn to apoapsis, coast, come back down. Default
//                   true, which is the old behaviour exactly.
// opts.hangAltitude the altitude that counts as "up among the junk". The result carries
//                   `timeAbove`, the seconds spent at or above it — on an arc that is the
//                   entire EVA window, and it is the number that decides whether the first
//                   launch is a game or a formality. Defaults to 90% of the target.
function simulateAscent(world, cfg, targetAlt, opts = {}) {
  const circularise = opts.circularise !== false;
  const hangAlt = opts.hangAltitude === undefined ? targetAlt * 0.9 : opts.hangAltitude;
  let timeAbove = 0;
  let apexAlt = 0;
  // opts.traceEvery samples the climb every N seconds into `trace`. Off by default and free
  // when off. It exists because "the ship overheats on the way up" is not answerable from a
  // single peak — you have to see where the speed, the dynamic pressure and the bar each top
  // out, and they do not top out together.
  const traceEvery = opts.traceEvery || 0;
  const trace = [];
  let nextTrace = 0;
  let maxQ = 0, maxQalt = 0, maxQspeed = 0, maxSpeed = 0, maxSpeedAlt = 0;
  let peakHeatAlt = 0, peakHeatSpeed = 0, lastPeak = 0;
  const s = {
    x: 0, y: world.R, vx: 0, vy: 0,
    mass: cfg.dryMass + cfg.fuel, fuel: cfg.fuel,
    heat: 0, peakHeat: 0, heatLoad: 0, peakRate: 0, t: 0, chuteOpen: false,
    // Marks the whole climb, powered and coasting, as nose-first flight. See step().
    ascending: true,
  };
  const targetR = world.R + targetAlt;
  let burning = true;

  while (s.t < cfg.maxAscentTime) {
    const r = Math.hypot(s.x, s.y);
    const h = r - world.R;
    const dt = h < world.atmTop ? cfg.dtAtm : cfg.dtVac;

    if (burning && s.fuel > 0) {
      const o = orbit(world, s.x, s.y, s.vx, s.vy);
      if (o.bound && o.apoapsis >= targetR) burning = false;
      else {
        // Pitch program: straight up until 12% of the way to the target, then lean over
        // smoothly to horizontal. Crude, but it is the same program for every config in a
        // sweep, so configs stay comparable.
        const frac = Math.min(Math.max(h / (targetAlt * 0.55), 0), 1);
        const pitch = (1 - frac) * (Math.PI / 2);        // from vertical to horizontal
        const up = [s.x / r, s.y / r];
        const east = [-up[1], up[0]];
        const dirX = Math.sin(pitch) * up[0] + Math.cos(pitch) * east[0];
        const dirY = Math.sin(pitch) * up[1] + Math.cos(pitch) * east[1];
        const a = cfg.thrust / s.mass;
        s.vx += dirX * a * dt;
        s.vy += dirY * a * dt;
        const burn = Math.min(cfg.burnRate * dt, s.fuel);
        s.fuel -= burn;
        s.mass -= burn;
      }
    }

    step(world, s, dt, cfg);

    const rr = Math.hypot(s.x, s.y);
    const hh = rr - world.R;

    // Where each quantity actually peaks. Sampled after the step so speed and altitude are
    // the post-step state the heat term was integrated with.
    {
      const sp = Math.hypot(s.vx, s.vy);
      const rho = world.rhoAt(hh);
      const q = 0.5 * rho * sp * sp;
      if (q > maxQ) { maxQ = q; maxQalt = hh; maxQspeed = sp; }
      if (sp > maxSpeed) { maxSpeed = sp; maxSpeedAlt = hh; }
      if (s.peakHeat > lastPeak) { lastPeak = s.peakHeat; peakHeatAlt = hh; peakHeatSpeed = sp; }
      if (traceEvery && s.t >= nextTrace) {
        trace.push({ t: s.t, alt: hh, speed: sp, rho, q, heat: s.heat, mass: s.mass, fuel: s.fuel });
        nextTrace = s.t + traceEvery;
      }
    }
    if (hh > apexAlt) apexAlt = hh;
    if (hh >= hangAlt) timeAbove += dt;
    if (rr <= world.R) {
      // On an arc, coming back to the ground is the expected end of the flight, not a crash.
      if (!circularise && apexAlt >= hangAlt) {
        return { reached: true, mode: 'arc', apoapsisAlt: apexAlt, timeAbove,
                 fuelRemaining: s.fuel, fuelUsed: cfg.fuel - s.fuel, ascentTime: s.t,
                 peakHeat: s.peakHeat, maxQ_pa: maxQ, maxQ_alt_m: maxQalt, maxQ_speed_ms: maxQspeed,
                 maxSpeed_ms: maxSpeed, maxSpeed_alt_m: maxSpeedAlt,
                 peakHeat_alt_m: peakHeatAlt, peakHeat_speed_ms: peakHeatSpeed, trace };
      }
      return { reached: false, why: 'crashed on ascent', fuelRemaining: s.fuel, apoapsisAlt: apexAlt };
    }

    const o = orbit(world, s.x, s.y, s.vx, s.vy);

    // The arc never circularises: it is finished once it has been up and come back down
    // through the hang altitude, and what it is judged on is how long it spent above it.
    if (!circularise && !burning && hh < hangAlt && apexAlt >= hangAlt && timeAbove > 0) {
      return { reached: true, mode: 'arc', apoapsisAlt: apexAlt, timeAbove,
               fuelRemaining: s.fuel, fuelUsed: cfg.fuel - s.fuel, ascentTime: s.t,
               peakHeat: s.peakHeat, maxQ_pa: maxQ, maxQ_alt_m: maxQalt, maxQ_speed_ms: maxQspeed,
               maxSpeed_ms: maxSpeed, maxSpeed_alt_m: maxSpeedAlt,
               peakHeat_alt_m: peakHeatAlt, peakHeat_speed_ms: peakHeatSpeed, trace };
    }

    if (circularise && !burning && o.bound && Math.abs(rr - o.apoapsis) < 1.5 && rr > world.R + world.atmTop) {
      // At apoapsis above the atmosphere: circularise with an impulsive prograde burn and
      // charge the fuel it would have cost.
      const vCirc = Math.sqrt(world.mu / rr);
      const vNow = Math.hypot(s.vx, s.vy);
      const dv = Math.abs(vCirc - vNow);
      const fuelNeeded = dv * (s.mass / cfg.exhaustVelocity);
      if (fuelNeeded > s.fuel) {
        return { reached: false, why: 'out of fuel before circularising', fuelRemaining: s.fuel,
                 apoapsisAlt: o.apoapsis - world.R, shortfallDv: dv };
      }
      s.fuel -= fuelNeeded;
      return {
        reached: true,
        mode: 'orbit',
        apoapsisAlt: rr - world.R,
        timeAbove,
        fuelRemaining: s.fuel,
        fuelUsed: cfg.fuel - s.fuel,
        ascentTime: s.t,
        // The climb heats the ship too, and nothing used to look. Reported so a config that
        // burns through on the way UP cannot pass as reachable.
        peakHeat: s.peakHeat,
        maxQ_pa: maxQ, maxQ_alt_m: maxQalt, maxQ_speed_ms: maxQspeed,
        maxSpeed_ms: maxSpeed, maxSpeed_alt_m: maxSpeedAlt,
        peakHeat_alt_m: peakHeatAlt, peakHeat_speed_ms: peakHeatSpeed,
        trace,
      };
    }
    if (!burning && !o.bound) return { reached: false, why: 'escaped', fuelRemaining: s.fuel };
    if (circularise && !burning && s.fuel <= 0 && o.apoapsis < targetR) {
      return { reached: false, why: 'out of fuel below target altitude', fuelRemaining: 0,
               apoapsisAlt: o.apoapsis - world.R };
    }
  }
  return { reached: false, why: 'ascent timed out', fuelRemaining: s.fuel };
}

// ---------------------------------------------------------------- descent

// Fly a descent: shallow braking passes at `periapsisAlt`, then a committed entry.
//
// TWO DEPTHS, AND THAT IS THE WHOLE POINT. An earlier version of this function took one
// periapsis and used it for the entire descent, which cannot express the manoeuvre §2.3.1
// actually describes — the player keeps thrust during braking precisely so they can "raise
// or lower the periapsis between passes" and then commit to a different, deeper entry.
//
// With a single depth the only descents available are "pick a braking altitude and repeat
// until you fall out of the sky", and a shallow choice there does not skim: it decays,
// drifting into dense air under its own drag. Measuring those and concluding that skimming
// does not cool an entry answered a question nobody asked. The shallow runs were not
// skimming — they were slowly crashing.
//
// opts.skims          how many braking passes before committing (default: unlimited, which
//                     reproduces the old behaviour exactly)
// opts.entryPeriapsis the periapsis for the committed entry (default: same as braking)
// `stageAfter` is how many unstaged braking passes are flown before staging. The ship stages
// at the apoapsis following that pass — the one-way decision in §2.3.1, after which there is
// no thrust and the rest is drag, chute and gear.
function simulateDescent(world, cfg, startAlt, periapsisAlt, stageAfter = 0, opts = {}) {
  const maxSkims = opts.skims === undefined ? Infinity : opts.skims;
  const entryRp = world.R + (opts.entryPeriapsis === undefined ? periapsisAlt : opts.entryPeriapsis);

  const ra = world.R + startAlt;
  // A zero-skim descent commits straight away, so it starts on the entry trajectory rather
  // than the braking one. Without this the ship — which begins AT apoapsis with no radial
  // velocity — cannot trigger its own apoapsis detector until a full orbit has passed, so
  // the commit burn fired one orbit late and "1 skim" measured identically to "0 skims".
  const rp = world.R + (maxSkims === 0 ? (opts.entryPeriapsis === undefined
    ? periapsisAlt : opts.entryPeriapsis) : periapsisAlt);
  const v = velocityForPeriapsis(world, ra, rp);

  const s = {
    x: 0, y: ra, vx: v, vy: 0,
    mass: cfg.dryMass + cfg.cargoMass, fuel: 0,
    heat: 0, peakHeat: 0, heatLoad: 0, peakRate: 0, t: 0, chuteOpen: false,
    staged: stageAfter === 0,
  };

  // opts.traceEvery samples the flight path every N seconds into `trace` as {x, y, h, speed,
  // heat, staged}. Off by default and free when off. The numbers say a skim cuts the entry
  // peak by half; the trail is what shows you WHY — the shallow graze that clips the top of
  // the air, exits, and comes back round on a smaller ellipse.
  const traceEvery = opts.traceEvery || 0;
  const trace = [];
  let nextTrace = 0;

  const passes = [];
  let inAtm = false;
  let passPeak = 0;
  let passLoadStart = 0;
  let passRate = 0;
  let maxSpeed = 0;
  let prevVr = 0;
  let chuteShredded = false;
  // Infinity = never commit (the old single-depth behaviour); 0 = already committed above.
  let committed = maxSkims === Infinity || maxSkims === 0;
  let commitDv = 0;

  while (s.t < cfg.maxDescentTime) {
    const r0 = Math.hypot(s.x, s.y);
    const h0 = r0 - world.R;
    const dt = h0 < world.atmTop ? cfg.dtAtm : cfg.dtVac;

    // Chute logic, per GDD §2.3.1: safe once plasma has cleared. Plasma is a speed cue, so
    // the model deploys below the Researcher's plasma-onset speed and inside the air.
    if (!s.chuteOpen && h0 < world.atmTop * 0.85) {
      const speed = Math.hypot(s.vx, s.vy);
      if (speed < cfg.plasmaOnset) s.chuteOpen = true;
    }

    const { h, speed } = step(world, s, dt, cfg);
    if (speed > maxSpeed) maxSpeed = speed;
    if (traceEvery && s.t >= nextTrace) {
      trace.push({ x: s.x, y: s.y, h, speed, heat: s.heat, staged: !!s.staged });
      nextTrace = s.t + traceEvery;
    }

    const inside = h < world.atmTop;
    if (inside && !inAtm) { inAtm = true; passPeak = 0; passLoadStart = s.heatLoad; passRate = 0; s.peakRate = 0; }
    if (inside) { passPeak = Math.max(passPeak, s.heat); passRate = Math.max(passRate, s.peakRate); }
    // Cargo and hull start taking damage once the bar is pegged (§2.3.1). Tracked so the
    // sweep can distinguish "survived the plate budget" from "arrived with the hold wrecked".
    if (s.heat >= 100) s.overheatTime = (s.overheatTime || 0) + dt;

    const r = Math.hypot(s.x, s.y);
    const vr = (s.x * s.vx + s.y * s.vy) / r;         // radial velocity

    if (r <= world.R) {
      // Touchdown. Vertical speed is what the landing grade is scored on.
      if (inAtm) passes.push({ peakHeat: passPeak, heatLoad: s.heatLoad - passLoadStart, peakRate: passRate, staged: s.staged });
      return {
        landed: true,
        trace,
        passes,
        touchdownSpeed: Math.abs(vr),
        touchdownTotalSpeed: Math.hypot(s.vx, s.vy),
        overheatTime: s.overheatTime || 0,
        heatLoad: s.heatLoad,
        commitDv,
        chuteOpen: s.chuteOpen,
        chuteShredded,
        maxSpeed,
        time: s.t,
      };
    }

    if (!inside && inAtm) {
      // Left the atmosphere — the pass is over.
      inAtm = false;
      passes.push({ peakHeat: passPeak, heatLoad: s.heatLoad - passLoadStart, peakRate: passRate,
                    staged: s.staged, skim: passes.length < maxSkims });
      // Stage at the apoapsis after the last braking pass. One-way, per §2.3.1.
      if (!s.staged && passes.length >= stageAfter) s.staged = true;
      if (passes.length > (cfg.maxPasses || 25)) return { landed: false, why: 'did not converge', passes };
    }

    // Apoapsis crossing outside the air.
    if (!inside && prevVr > 0 && vr <= 0) {
      const o = orbit(world, s.x, s.y, s.vx, s.vy);
      if (!o.bound) return { landed: false, why: 'escaped', passes };

      // The commit burn. Once the planned skims are flown, drop periapsis to the entry
      // depth — this is the manoeuvre the player makes with their remaining thrust, and
      // modelling it is the difference between "skim then enter" and "decay".
      if (!committed && passes.length >= maxSkims && entryRp < o.periapsis - 1) {
        const rNow = Math.hypot(s.x, s.y);
        const vNew = velocityForPeriapsis(world, rNow, entryRp);
        const vNow = Math.hypot(s.vx, s.vy);
        if (vNow > 0 && Number.isFinite(vNew)) {
          const k = vNew / vNow;
          s.vx *= k;
          s.vy *= k;
          commitDv += Math.abs(vNow - vNew);
        }
        committed = true;
      }
    }
    prevVr = vr;
  }
  return { landed: false, why: 'descent timed out', passes };
}

// ---------------------------------------------------------------- calibration

// Heat is reported on the 0-100 bar the GDD uses, and the crew's own convention is that a
// single-pass descent from the bottom sample altitude with an empty hold reads about 100. So the
// scale factor is measured once against exactly that case and then held fixed for every
// other run — which makes every cross-band and cross-load comparison a genuine measurement
// rather than a restatement of the normalisation.
function calibrateHeatScale(world, baseCfg, referenceAlt) {
  const cfg = { ...baseCfg, heatScale: 1, cargoMass: 0 };
  // A single pass means committing straight in: periapsis at the surface.
  const probe = simulateDescent(world, cfg, referenceAlt, 0);
  const peak = probe.passes.length ? Math.max(...probe.passes.map((p) => p.peakHeat)) : 0;
  return peak > 0 ? 100 / peak : 1;
}

// ---------------------------------------------------------------- configuration

// Build the simulator's config from the crew's artifacts. Anything the params do not state
// is derived here and reported in `inferred`, so a gap in the contract shows up as a
// finding instead of a silent default.
function buildConfig(baseline, params, overrides = {}) {
  const world = makeWorld(baseline);
  const inferred = [];

  const dryMass = overrides.dryMass ?? params.flight.dry_mass_kg;
  const fuel = overrides.fuel ?? params.flight.fuel_capacity_kg;
  const thrust = overrides.thrust ?? params.flight.thrust_n;
  const burnRate = overrides.burnRate ?? params.flight.fuel_burn_kgs;

  // Effective exhaust velocity, for charging impulsive burns.
  const exhaustVelocity = thrust / burnRate;

  // The canopy comes from the params. Both fields are required by the schema, so a params
  // object reaching here without them is either older than that contract or came in through
  // --gdd; the fallback below keeps those runs flyable rather than crashing them.
  //
  // The fallback is the circularity it exists to replace, so it announces itself. Solving
  // the area out of the claimed speed and then measuring that speed back is a check of a
  // claim against itself, and it passed every audit it ever faced for exactly that reason.
  let chuteArea = params.landing.parachute_area_m2;
  if (!chuteArea) {
    const claimed = params.landing.descent_speed_full_hold_ms || params.landing.soft_landing_ms;
    const fullMass = dryMass * 2;
    chuteArea = (2 * fullMass * world.g0) /
      (world.rho0 * (params.landing.parachute_drag_coefficient || 1.5) * claimed * claimed);
    inferred.push(
      `landing.parachute_area_m2 is not in the params, so the model solved for the area ` +
      `implied by descent_speed_full_hold_ms ${claimed} m/s at twice dry mass: ` +
      `${chuteArea.toFixed(1)} m2. Measured descent speeds are therefore anchored to that ` +
      `claim rather than independent of it, and the parachute check is not a measurement ` +
      `on this run. The schema requires the area — these params predate it.`
    );
  }

  // One reference orbit sets every time constant below, so the same code is honest on an
  // 800 m rock and on a 300 km moon.
  const refAlt = baseline.bands && baseline.bands.length
    ? (baseline.bands[0].altitude_min_m + baseline.bands[0].altitude_max_m) / 2 : world.atmTop * 2;
  const refR = world.R + refAlt;
  const refPeriod = 2 * Math.PI * refR / Math.sqrt(world.mu / refR);

  return {
    world,
    inferred,
    cfg: {
      // ~2000 steps per orbit in vacuum, and an atmospheric step fine enough to resolve
      // the pass; both floor at the original constants so small worlds are unchanged.
      dtVac: Math.max(DT_VAC_REF, refPeriod / 2000),
      dtAtm: Math.max(DT_ATM_REF, refPeriod / 40000),
      maxDescentTime: Math.max(3000, refPeriod * 60),
      maxAscentTime: Math.max(400, refPeriod * 3),
      dryMass,
      fuel,
      cargoMass: overrides.cargoMass ?? 0,
      thrust,
      burnRate,
      exhaustVelocity,
      cdShield: baseline.reentry.drag_coefficient_shield,
      cdHull: baseline.reentry.drag_coefficient_hull,
      unstagedHeatMultiplier: params.reentry.unstaged_heat_multiplier || 1,
      area: baseline.reentry.reference_area_m2,
      chuteCd: params.landing.parachute_drag_coefficient || 1.5,
      chuteArea,
      heatExponent: baseline.reentry.heating_velocity_exponent,
      heatDissipation: params.reentry.heat_dissipation_s,
      plasmaOnset: baseline.reentry.plasma_onset_speed_ms,
      heatScale: 1,
    },
  };
}

// ---------------------------------------------------------------- the questions

// Sweep the braking depth from "straight in" to "barely grazing" and fly every one.
//
// Bisecting for a target pass count was the obvious approach and it was wrong: pass count
// is a step function of depth, so a bisection converges on a boundary and can skip whole
// values entirely. It reported "2 passes is impossible from the bottom of the band", which is
// not a physical fact — it is what happens when the only depths you sample land either side
// of the step. Scanning is a few hundred more integrations and cannot miss a step.
function descentScan(world, cfg, startAlt, params, band, samples = 240) {
  // THE COMMIT FLOOR MUST NOT BOUND THIS SCAN, and an earlier version of this line bounding
  // it cost a live run.
  //
  // This function flies ONE periapsis for the whole descent — a decay, not a skim-then-commit.
  // That single periapsis is doing two jobs at once: it is where the ship brakes AND where it
  // finally comes down. The commit floor constrains only the second of those. Capping the scan
  // at the floor therefore forbids the shallow braking altitudes that are the only way this
  // model reaches a second pass at all, and every cell comes back `pass_counts_reachable [1]`.
  //
  // The audit then read that as "no two-pass descent is reachable at any load or altitude" and
  // failed `heavy_descent_requires_multi_pass` as unsatisfiable — while the real manoeuvre,
  // skim high then commit below the floor, was sitting there working: the endgame haul plunges
  // at 222.2 and comes home on one skim at 134.9. The rule was fine, the config was fine, and
  // the instrument was blind.
  //
  // The floor belongs where the entry is a SEPARATE variable — skimStudy, and the committed
  // descents in verificationSweep. Not here.
  const maxDepth = world.atmTop * 0.999;
  const out = [];
  for (let i = 0; i < samples; i++) {
    const periapsisAlt = (i / (samples - 1)) * maxDepth;
    const r = simulateDescent(world, cfg, startAlt, periapsisAlt);
    if (!r.landed || !r.passes.length) continue;
    const abl = ablationFor(r.passes, params, band);
    out.push({
      periapsisAlt,
      passes: r.passes.length,
      peakHeat: Math.max(...r.passes.map((p) => p.peakHeat)),
      totalAblation: abl.total,
      touchdownSpeed: r.touchdownSpeed,
      chuteOpen: r.chuteOpen,
      time: r.time,
    });
  }
  return out;
}

// The cheapest achievable descent at each pass count: for every pass count the scan
// reached, the depth that burned the least plate.
function ablationByPassCount(scan) {
  const best = new Map();
  for (const row of scan) {
    const cur = best.get(row.passes);
    if (!cur || row.totalAblation < cur.totalAblation) best.set(row.passes, row);
  }
  return [...best.entries()].sort((a, b) => a[0] - b[0]).map(([passes, row]) => ({ passes, ...row }));
}

// Ablation is a GAME RULE, not physics, so it is applied from the crew's params rather than
// re-derived: a thermal-cycling toll per heat cycle plus a cost that rises steeply with the
// peak heat of that pass. The peak heats are measured; the rule converting them is theirs.
//
// The toll ESCALATES, because thermal fatigue does: cycle i costs
// cycle_toll_base_pct * cycle_toll_growth^i, which is the model stated in the Balancer's
// charter and in the game-params schema. This helper used to charge every pass at the first
// cycle's rate — a floor rather than the cost — which quietly meant the "measured flight
// results" handed to the Auditor priced multi-pass descents under a rule the game does not
// use. It survived because the bias ran the safe way: under-charging extra passes and
// finding them expensive anyway is a conclusion that only gets stronger when they are
// charged properly. That is luck, not design, and it inverts the moment a rule rewards
// multi-pass flying.
//
// Fixing it moved no verdict. The argmin of every scan already sat at one pass, and a
// one-pass descent pays cycle 0 either way, so cheapest_pass_count, cheapest_ablation_pct
// and every target that reads the cheapest row are unchanged; only the n >= 2 rows of
// ablation_by_pass_count move, and they move upward.
//
// The `fixed_toll_per_pass_pct_by_band` fallback covers params written against the contract
// that predates cycle_toll_base_pct.
function ablationFor(passes, params, band) {
  const a = params.ablation;
  const base = a.cycle_toll_base_pct
    ?? (a.fixed_toll_per_pass_pct_by_band ? a.fixed_toll_per_pass_pct_by_band[band] : 0)
    ?? 0;
  // Absent growth means the older flat contract, where 1 reproduces it exactly.
  const growth = a.cycle_toll_growth ?? 1;
  let total = 0;
  const perPass = passes.map((p, i) => {
    const toll = base * Math.pow(growth, i);
    const cost = toll + a.heat_cost_coefficient * Math.pow(p.peakHeat, a.heat_cost_exponent);
    total += cost;
    return { peakHeat: p.peakHeat, toll, ablation: cost };
  });
  return { perPass, total };
}

module.exports = {
  makeWorld, orbit, simulateAscent, simulateDescent,
  calibrateHeatScale, buildConfig, descentScan, ablationByPassCount, ablationFor,
};

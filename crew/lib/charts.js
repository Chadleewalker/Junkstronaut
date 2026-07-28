'use strict';
// Renders the crew's artifacts as one self-contained HTML page.
//
// This is deterministic scaffolding, not a fifth agent — it plots numbers the crew already
// produced and makes no judgement about them. Adding a "charts agent" would weaken the
// crew, because an agent that can be removed without breaking the chain is not a crew
// member. It is also zero-dependency and offline: no CDN, no fonts, no fetch. Every mark
// is hand-rolled SVG.
//
// GDD §3.1 asks the Playtester for "sweep reports (CSV plus graphs)". This is the same
// idea one stage earlier: the graphs show what the *proposed* values imply, before anyone
// spends machine-hours flying them.

// ---------------------------------------------------------------- palette
// Three bands, three categorical slots. Scatter plots compare every pair at once, and only
// the first three slots of this palette clear the colour-blind separation floors under an
// all-pairs comparison — which is exactly how many altitude bands the game has.
const SAMPLES = ['bottom', 'middle', 'top'];
const BAND_LABEL = { bottom: 'Lower band', middle: 'Mid band', top: 'Upper band' };

// GDD 2.6 is ONE band with a value gradient. These three are where the sweep measures it,
// and the charts group by the third of the envelope a piece falls in — a reporting cut, not
// a tier. Nothing here may be read as the game having three bands again.
function thirdOf(altitude_m, baseline) {
  const b = baseline.bands[0];
  const span = b.altitude_max_m - b.altitude_min_m;
  const fr = span > 0 ? (altitude_m - b.altitude_min_m) / span : 0;
  return fr < 1 / 3 ? 'bottom' : fr < 2 / 3 ? 'middle' : 'top';
}

function gradientMultiplier(altitude_m, baseline, params) {
  const b = baseline.bands[0];
  const g = params.economy.value_gradient;
  const span = b.altitude_max_m - b.altitude_min_m;
  const fr = span > 0 ? Math.min(1, Math.max(0, (altitude_m - b.altitude_min_m) / span)) : 0;
  return g.at_bottom + (g.at_top - g.at_bottom) * fr;
}
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
  '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

// ---------------------------------------------------------------- tiny helpers

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (n, dp = 0) => {
  if (!Number.isFinite(n)) return '—';
  const v = Number(n.toFixed(dp));
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

function linear(d0, d1, r0, r1) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

function logScale(d0, d1, r0, r1) {
  const l0 = Math.log10(Math.max(d0, 1e-6));
  const l1 = Math.log10(Math.max(d1, 1e-6));
  const span = l1 - l0 || 1;
  return (v) => r0 + ((Math.log10(Math.max(v, 1e-6)) - l0) / span) * (r1 - r0);
}

// Decade ticks that actually fall inside the domain — 1, 2, 5, 10, 20, 50, …
function logTicks(min, max) {
  const out = [];
  let e = Math.floor(Math.log10(Math.max(min, 1e-6)));
  while (Math.pow(10, e) <= max * 10) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= min * 0.9 && v <= max * 1.1) out.push(v);
    }
    e++;
  }
  return out;
}

function niceTicks(min, max, count = 5) {
  const span = (max - min) || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

// ---------------------------------------------------------------- the game's own models
//
// Both of these are the rules as §2.3 states them, evaluated at the crew's numbers. They
// are not new design decisions — if one disagrees with the shipped GDScript, the GDScript
// is what the player meets and this page is what needs fixing.

// Value of one piece: size-class base, scaled by where it sits on the altitude gradient,
// with the fragile premium on top. The multiplier is decorated onto each piece once in
// renderDashboard, because every chart below wants it and only the top level has the band.
function pieceValue(entry, params) {
  const base = params.economy.size_class_base_value[entry.size_class] || 0;
  const mult = entry.value_multiplier || 1;
  const prem = entry.fragile ? (params.economy.fragile_value_premium || 1) : 1;
  return base * mult * prem;
}

// GDD §2.3.1, as the Economy Balancer's charter states it and as the schema requires it to
// be emitted:
//
//   cost(band, k) = SUM(i=0..k) cycle_toll_base · growth^i
//                 + coeff · (heat_index[band] · skim_heat_multiplier[k]) ^ exponent
//                 + k · coeff · skim_peak ^ exponent
//
// for k shallow skims then one committed entry. Skims cool the entry, saturating after
// about two; escalating thermal fatigue is what stops a player skimming indefinitely. An
// earlier model divided peak heat by pass count instead, and flying it showed a committed
// entry's peak is set by its own depth and by the ballistic coefficient, not by what came
// before — so one plunge always won and the U-curve never existed.
//
// This renderer does NOT reconstruct that model from the physics. An earlier version did,
// guessed a different heat reference, and drew a curve whose minimum contradicted the
// audit printed beside it — a chart that argues with its own caption is worse than no
// chart. The 2D curve below is the Balancer's own `cost_curve` array, plotted verbatim.
// The closed form below is used only where the continuous surface needs values between the
// three bands, and it is the same formula the Balancer was told to use — so the two charts
// agree by construction. A mismatch between them is a real finding about the params, which
// is exactly what the Auditor's ablation check exists to catch.
function ablationClosedForm(params) {
  const a = params.ablation;
  const mult = a.skim_heat_multiplier || [1, 1, 1, 1];
  return (heatIndex, skims) => {
    const k = Math.max(0, Math.min(mult.length - 1, Math.round(skims)));
    let tolls = 0;
    for (let i = 0; i <= k; i++) tolls += a.cycle_toll_base_pct * Math.pow(a.cycle_toll_growth, i);
    const entry = a.heat_cost_coefficient * Math.pow(heatIndex * mult[k], a.heat_cost_exponent);
    const skimHeat = k * a.heat_cost_coefficient * Math.pow(a.skim_peak || 0, a.heat_cost_exponent);
    return tolls + entry + skimHeat;
  };
}

// ---------------------------------------------------------------- chart 1 · debris scatter

function chartDebris(catalog, params) {
  const W = 720, H = 420, M = { t: 16, r: 20, b: 52, l: 64 };
  const pts = catalog.debris.map((d) => ({ ...d, value: pieceValue(d, params) }));
  const xs = pts.map((p) => p.mass_kg), ys = pts.map((p) => p.value);
  const x = logScale(Math.min(...xs) * 0.8, Math.max(...xs) * 1.25, M.l, W - M.r);
  const y = logScale(Math.min(...ys) * 0.8, Math.max(...ys) * 1.25, H - M.b, M.t);

  const grid = [];
  for (const t of logTicks(Math.min(...ys), Math.max(...ys))) {
    grid.push(`<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`);
    grid.push(`<text class="tick" x="${M.l - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`);
  }
  for (const t of logTicks(Math.min(...xs), Math.max(...xs))) {
    grid.push(`<text class="tick" x="${x(t).toFixed(1)}" y="${H - M.b + 20}" text-anchor="middle">${fmt(t)}</text>`);
  }

  // Solid pieces read as filled dots; fragile pieces as hollow rings. Fragility is the
  // property that changes how a piece must be flown, so it gets a shape and not a shade —
  // shape survives greyscale, print and every kind of colour blindness.
  const marks = SAMPLES.map((band) => pts.filter((p) => p.band === band).map((p) => {
    const cx = x(p.mass_kg).toFixed(1), cy = y(p.value).toFixed(1);
    const tip = `${p.display_name} · ${BAND_LABEL[band]} · ${p.size_class}${p.fragile ? ' · fragile' : ''} · ${fmt(p.mass_kg, 1)} kg · ${fmt(p.value)} credits`;
    return p.fragile
      ? `<circle class="mark ring" cx="${cx}" cy="${cy}" r="6.5" fill="none" stroke="var(--band-${band})" stroke-width="2.5" data-tip="${esc(tip)}"/>`
      : `<circle class="mark" cx="${cx}" cy="${cy}" r="5" fill="var(--band-${band})" stroke="var(--surface-1)" stroke-width="2" data-tip="${esc(tip)}"/>`;
  }).join('')).join('');

  return `
<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Debris mass against value, by altitude band">
  ${grid.join('')}
  <line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>
  <line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/>
  ${marks}
  <text class="axis-label" x="${(M.l + W - M.r) / 2}" y="${H - 10}" text-anchor="middle">piece mass (kg, log scale)</text>
  <text class="axis-label" transform="translate(16,${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">value in credits (log scale)</text>
</svg>`;
}

// ---------------------------------------------------------------- chart 2 · ablation curve

function chartAblation(params) {
  const W = 720, H = 420, M = { t: 20, r: 92, b: 52, l: 68 };
  const passes = [0, 1, 2, 3];   // skim counts, not pass counts

  // The Balancer's own arithmetic, plotted as given. The x axis is SKIM COUNT — how many
  // shallow passes precede the committed entry — not a pass count. An earlier version of
  // this chart plotted passes, from a model that assumed peak heat divides across them;
  // flying it showed a committed entry's peak is set by its own depth and by the ballistic
  // coefficient, so pass count was the wrong variable entirely.
  const series = SAMPLES.map((band) => {
    const curve = params.ablation.cost_curve[band];
    const pts = passes.map((n) => ({ n, cost: curve[n] })).filter((p) => p.cost !== undefined);
    const best = pts.reduce((a, b) => (b.cost < a.cost ? b : a));
    return { band, pts, best, claimed: params.ablation.optimal_skims[band] };
  });

  const all = series.flatMap((s) => s.pts.map((p) => p.cost));
  const yMax = Math.min(Math.max(...all), Math.min(...all) * 6); // clip a runaway endpoint
  const x = linear(0, 3, M.l, W - M.r);
  const y = linear(0, yMax, H - M.b, M.t);
  const clamp = (v) => Math.max(M.t - 4, Math.min(H - M.b, y(v)));

  const grid = niceTicks(0, yMax, 5).map((t) =>
    `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>` +
    `<text class="tick" x="${M.l - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`).join('');

  const xticks = passes.map((n) =>
    `<text class="tick" x="${x(n).toFixed(1)}" y="${H - M.b + 20}" text-anchor="middle">${n}</text>`).join('');

  // No target window. The rule that put one here — "the cheapest descent should sit at 1-2
  // skims" — was retired once it was measured to be unsatisfiable at every altitude and
  // load. The curve is now a report of what the model does, and the design takes its
  // multi-pass requirement from the heat capacity instead. See gdd-change-proposal.md 11.
  const bandRect = '';

  // Direct labels sit at each line's right-hand end, so two lines that finish close
  // together produce overlapping text. Push them apart to a minimum spacing, working from
  // the bottom up — the alternative is a legend-only chart, and direct labels are what the
  // light-mode contrast relief rule requires.
  const LABEL_GAP = 15;
  const ends = series
    .map((s, i) => ({ i, y: clamp(s.pts[s.pts.length - 1].cost) }))
    .sort((a, b) => b.y - a.y);
  for (let k = 1; k < ends.length; k++) {
    if (ends[k - 1].y - ends[k].y < LABEL_GAP) ends[k].y = ends[k - 1].y - LABEL_GAP;
  }
  const labelY = [];
  ends.forEach((e) => { labelY[e.i] = e.y; });

  const lines = series.map((s, si) => {
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.n).toFixed(1)},${clamp(p.cost).toFixed(1)}`).join('');
    const dots = s.pts.map((p) =>
      `<circle class="mark" cx="${x(p.n).toFixed(1)}" cy="${clamp(p.cost).toFixed(1)}" r="4.5"
        fill="var(--band-${s.band})" stroke="var(--surface-1)" stroke-width="2"
        data-tip="${esc(`${BAND_LABEL[s.band]} · ${p.n} skim${p.n === 1 ? '' : 's'} then commit · ${fmt(p.cost, 1)}% plate burned`)}"/>`).join('');
    const marker = `<circle cx="${x(s.best.n).toFixed(1)}" cy="${clamp(s.best.cost).toFixed(1)}" r="9"
        fill="none" stroke="var(--band-${s.band})" stroke-width="2.5"/>`;
    // A leader line when the label has been nudged off its series' actual end, so the text
    // never appears to belong to a neighbouring curve.
    const endY = clamp(s.pts[s.pts.length - 1].cost);
    const ly = labelY[si];
    const leader = Math.abs(ly - endY) > 2
      ? `<line x1="${(W - M.r).toFixed(1)}" y1="${endY.toFixed(1)}" x2="${(W - M.r + 5).toFixed(1)}" y2="${ly.toFixed(1)}"
          stroke="var(--band-${s.band})" stroke-width="1"/>`
      : '';
    const label = `${leader}<text class="series-label" x="${W - M.r + 8}" y="${(ly + 4).toFixed(1)}">${BAND_LABEL[s.band]}</text>`;
    return `<path d="${d}" fill="none" stroke="var(--band-${s.band})" stroke-width="2" stroke-linejoin="round"/>${dots}${marker}${label}`;
  }).join('');

  const verdicts = series.map((s) => {
    // Every minimum is admissible now; the chart reports where each curve bottoms out.
    const inWindow = true;
    const agrees = s.best.n === s.claimed;
    const note = !agrees
      ? `<span class="verdict bad">curve bottoms at ${s.best.n}, params claim ${s.claimed}</span>`
      : '<span class="verdict good">curve agrees with params</span>';
    return `<li><span class="swatch" style="background:var(--band-${s.band})"></span>
      <b>${BAND_LABEL[s.band]}</b> — cheapest at <b>${s.best.n} skim${s.best.n === 1 ? '' : 's'}</b> ${note}</li>`;
  }).join('');

  return `
<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Heat shield plate burned against the number of shallow skims before the committed entry, per band">
  ${bandRect}${grid}
  <line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>
  <line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/>
  ${lines}${xticks}
  <text class="axis-label" x="${(M.l + W - M.r) / 2}" y="${H - 10}" text-anchor="middle">shallow skims before the committed entry</text>
  <text class="axis-label" transform="translate(16,${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">heat shield plate burned (%)</text>
</svg>
<ul class="findings">${verdicts}</ul>`;
}

// ---------------------------------------------------------------- chart 3 · value per slot

function chartValuePerSlot(catalog, params) {
  const W = 720, H = 380, M = { t: 20, r: 20, b: 64, l: 68 };
  const classes = ['small', 'medium', 'oversized'];

  const cells = [];
  for (const cls of classes) {
    for (const band of SAMPLES) {
      const group = catalog.debris.filter((d) => d.size_class === cls && d.band === band);
      if (!group.length) { cells.push({ cls, band, v: 0, n: 0 }); continue; }
      const slots = catalog.size_classes[cls].slots_crushed || 1;
      const mean = group.reduce((s, d) => s + pieceValue(d, params), 0) / group.length;
      cells.push({ cls, band, v: mean / slots, n: group.length });
    }
  }

  const yMax = Math.max(...cells.map((c) => c.v)) * 1.12 || 1;
  const y = linear(0, yMax, H - M.b, M.t);
  const groupW = (W - M.l - M.r) / classes.length;
  const barW = Math.min(46, (groupW - 28) / SAMPLES.length - 2); // 2px surface gap between bars

  const grid = niceTicks(0, yMax, 5).map((t) =>
    `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>` +
    `<text class="tick" x="${M.l - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`).join('');

  const bars = classes.map((cls, gi) => {
    const gx = M.l + gi * groupW + (groupW - (barW + 2) * SAMPLES.length) / 2;
    const inner = SAMPLES.map((band, bi) => {
      const c = cells.find((k) => k.cls === cls && k.band === band);
      if (!c.n) return '';
      const bx = gx + bi * (barW + 2);
      const by = y(c.v), h = Math.max(H - M.b - by, 0.5);
      const tip = `${BAND_LABEL[band]} · ${cls} · ${fmt(c.v)} credits per cargo slot · ${c.n} piece${c.n > 1 ? 's' : ''}`;
      return `<path class="mark" d="M${bx.toFixed(1)},${(H - M.b).toFixed(1)} L${bx.toFixed(1)},${(by + 4).toFixed(1)}
        Q${bx.toFixed(1)},${by.toFixed(1)} ${(bx + 4).toFixed(1)},${by.toFixed(1)}
        L${(bx + barW - 4).toFixed(1)},${by.toFixed(1)} Q${(bx + barW).toFixed(1)},${by.toFixed(1)} ${(bx + barW).toFixed(1)},${(by + 4).toFixed(1)}
        L${(bx + barW).toFixed(1)},${(H - M.b).toFixed(1)} Z"
        fill="var(--band-${band})" data-tip="${esc(tip)}"/>`;
    }).join('');
    const label = `<text class="tick" x="${(gx + ((barW + 2) * SAMPLES.length) / 2).toFixed(1)}" y="${H - M.b + 22}" text-anchor="middle">${cls}</text>`;
    return inner + label;
  }).join('');

  return `
<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Average value per cargo slot, by size class and band">
  ${grid}
  <line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>
  ${bars}
  <text class="axis-label" x="${(M.l + W - M.r) / 2}" y="${H - 12}" text-anchor="middle">size class</text>
  <text class="axis-label" transform="translate(16,${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">credits per cargo slot</text>
</svg>`;
}

// ---------------------------------------------------------------- chart 4 · the 3D surface

function chartSurface(params) {
  const W = 760, H = 460;
  const a = params.ablation;

  // The horizontal axis is the heat index — the peak heat of a single-pass descent — which
  // is the quantity the model is actually written in terms of. Interpolating between the
  // three bands' own values keeps every point on this surface a value the crew's formula
  // produces, rather than one the renderer invented.
  const idx = SAMPLES.map((b) => a.heat_index[b]);
  const hMin = Math.min(...idx) * 0.85, hMax = Math.max(...idx) * 1.15;
  const NI = 16, NJ = 4;                       // heat steps, skim counts 0..3
  const hAt = (i) => hMin + (hMax - hMin) * (i / (NI - 1));

  // The toll is now per heat cycle and escalates, so it is one pair of numbers rather than
  // a per-band value to interpolate. Cost of k skims then a committed entry:
  //   sum of the k+1 cycle tolls, plus the heat cost of an entry cooled by skim_heat_multiplier.
  const closed = ablationClosedForm(params);
  const cost = (h, k) => closed(h, k);

  const z = [];
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < NI; i++) {
    z.push([]);
    for (let j = 0; j < NJ; j++) {
      const c = cost(hAt(i), j);
      z[i].push(c);
      if (c < zMin) zMin = c;
      if (c > zMax) zMax = c;
    }
  }
  // The single-pass plunge costs several times what the valley does, so a linear height
  // scale spends most of its range on one spike and presses everything else flat — which
  // is precisely the part worth seeing. A log scale keeps the whole range on screen and
  // still gives the valley real relief. Height is ordinal here (higher = worse), so the
  // transform costs nothing: nobody reads absolute plate off a 3D surface, and the numbers
  // are in the line chart above and the tooltips here.
  const lz = Math.log(zMin), lzMax = Math.log(zMax);
  const norm = (v) => Math.max(0, Math.min(1, (Math.log(v) - lz) / ((lzMax - lz) || 1)));

  // Oblique projection. Larger (i+j) draws nearer the viewer, so painting in ascending
  // (i+j) order is a correct painter's algorithm for this camera.
  const ox = 300, oy = 322, sx = 22, sy = 11, zh = 205;
  const px = (i, j) => ox + (i - j * 1.35) * sx;
  const py = (i, j) => oy + (i * 0.42 + j * 1.05) * sy - norm(z[i][j]) * zh;

  const quads = [];
  for (let i = 0; i < NI - 1; i++) {
    for (let j = 0; j < NJ - 1; j++) {
      const mean = (norm(z[i][j]) + norm(z[i + 1][j]) + norm(z[i][j + 1]) + norm(z[i + 1][j + 1])) / 4;
      const fill = SEQ[Math.round(mean * (SEQ.length - 1))];
      quads.push({
        depth: i + j,
        d: `M${px(i, j).toFixed(1)},${py(i, j).toFixed(1)} L${px(i + 1, j).toFixed(1)},${py(i + 1, j).toFixed(1)}` +
           ` L${px(i + 1, j + 1).toFixed(1)},${py(i + 1, j + 1).toFixed(1)} L${px(i, j + 1).toFixed(1)},${py(i, j + 1).toFixed(1)} Z`,
        fill,
      });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);
  const mesh = quads.map((q) =>
    `<path d="${q.d}" fill="${q.fill}" stroke="var(--surface-1)" stroke-width="0.6" stroke-opacity="0.55"/>`).join('');

  // The valley floor: for each entry speed, the pass count that burns least plate. This
  // line is the design question made visible.
  const floor = [];
  for (let i = 0; i < NI; i++) {
    let bj = 0;
    for (let j = 1; j < NJ; j++) if (z[i][j] < z[i][bj]) bj = j;
    floor.push({ i, j: bj, n: bj + 1, h: hAt(i) });
  }
  const floorPath = floor.map((p, k) => `${k ? 'L' : 'M'}${px(p.i, p.j).toFixed(1)},${(py(p.i, p.j) - 3).toFixed(1)}`).join('');
  const floorDots = floor.filter((_, k) => k % 3 === 0).map((p) =>
    `<circle class="mark" cx="${px(p.i, p.j).toFixed(1)}" cy="${(py(p.i, p.j) - 3).toFixed(1)}" r="4.5"
      fill="var(--text-primary)" stroke="var(--surface-1)" stroke-width="2"
      data-tip="${esc(`heat index ${fmt(p.h)} → cheapest at ${p.n} skim${p.n === 1 ? '' : 's'} (${fmt(z[p.i][p.j], 1)}% plate)`)}"/>`).join('');

  // Where each real band lands on the surface. The three can sit close together on the
  // heat axis, so the callout stems are staggered in length rather than all drawn at once
  // — three labels at the same height overlap exactly when the bands are most similar,
  // which is the case a reader most wants to distinguish.
  const marks = SAMPLES.map((band, k) => {
    const i = Math.round(((a.heat_index[band] - hMin) / ((hMax - hMin) || 1)) * (NI - 1));
    const ii = Math.max(0, Math.min(NI - 1, i));
    let bj = 0;
    for (let j = 1; j < NJ; j++) if (z[ii][j] < z[ii][bj]) bj = j;
    return { band, x: px(ii, bj), y: py(ii, bj), stem: 30 + k * 20 };
  });
  const bandMarks = marks.map((m) => {
    const top = m.y - m.stem;
    return `<g><line x1="${m.x.toFixed(1)}" y1="${(m.y - 6).toFixed(1)}"
        x2="${m.x.toFixed(1)}" y2="${top.toFixed(1)}" stroke="var(--band-${m.band})" stroke-width="2"/>
      <circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="4" fill="var(--band-${m.band})"
        stroke="var(--surface-1)" stroke-width="1.5"/>
      <text class="series-label" x="${m.x.toFixed(1)}" y="${(top - 6).toFixed(1)}" text-anchor="middle">${BAND_LABEL[m.band]}</text></g>`;
  }).join('');

  const legend = SEQ.map((c, k) =>
    `<rect x="${W - 150 + k * 10}" y="26" width="10" height="12" fill="${c}"/>`).join('');

  return `
<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Three-dimensional surface of plate burned over entry speed and pass count">
  ${mesh}
  <path d="${floorPath}" fill="none" stroke="var(--text-primary)" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="1 0"/>
  ${floorDots}${bandMarks}
  ${legend}
  <text class="tick" x="${W - 152}" y="22" text-anchor="start">less plate burned</text>
  <text class="tick" x="${W - 20}" y="52" text-anchor="end">more</text>
  <text class="axis-label" x="150" y="${H - 34}" text-anchor="middle">single-pass heat index →</text>
  <text class="axis-label" x="${W - 250}" y="${H - 12}" text-anchor="middle">← skims before commit</text>
</svg>
<p class="caption">The dark line is the valley floor — the cheapest pass count at every entry
speed. It is the answer to the hardest question in §2.3.1, and it should stay inside 2–4
across the whole span. Where it climbs toward the back, higher altitudes are demanding more
passes; where it runs flat, a single strategy covers every altitude.</p>`;
}

// ---------------------------------------------------------------- chart 5 · the sweep

// How often each design target is satisfiable anywhere in the parameter space. Magnitude,
// one measure, ranked — so it is a single-hue bar chart, not a categorical one. A bar near
// zero is the important reading: it means no amount of tuning reaches that target, and the
// rule itself is what has to change.
function chartTargets(exploration) {
  const rates = Object.entries(exploration.target_satisfaction_rate || {})
    .sort((a, b) => a[1] - b[1]);
  if (!rates.length) return '';

  const rowH = 34, W = 720, M = { t: 8, r: 64, l: 236, b: 34 };
  const H = M.t + rates.length * rowH + M.b;
  const x = linear(0, 1, M.l, W - M.r);

  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    `<line class="grid" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${M.t}" y2="${H - M.b}"/>` +
    `<text class="tick" x="${x(t).toFixed(1)}" y="${H - M.b + 18}" text-anchor="middle">${Math.round(t * 100)}%</text>`).join('');

  const bars = rates.map(([key, v], i) => {
    const y = M.t + i * rowH + 7;
    const w = Math.max(x(v) - M.l, 1);
    // Sequential ramp: a rarely-satisfiable target reads pale, a common one reads solid.
    const fill = SEQ[Math.min(SEQ.length - 1, Math.max(2, Math.round(v * (SEQ.length - 1))))];
    const label = key.replace(/_/g, ' ');
    return `<text class="tick" x="${M.l - 12}" y="${(y + 14).toFixed(1)}" text-anchor="end">${esc(label)}</text>
      <path class="mark" d="M${M.l},${y} L${(M.l + w - 4).toFixed(1)},${y}
        Q${(M.l + w).toFixed(1)},${y} ${(M.l + w).toFixed(1)},${(y + 4).toFixed(1)}
        L${(M.l + w).toFixed(1)},${(y + 16).toFixed(1)} Q${(M.l + w).toFixed(1)},${(y + 20).toFixed(1)} ${(M.l + w - 4).toFixed(1)},${(y + 20).toFixed(1)}
        L${M.l},${(y + 20).toFixed(1)} Z" fill="${fill}"
        data-tip="${esc(`${label}: satisfied by ${(v * 100).toFixed(1)}% of ${exploration.total_configs} worlds`)}"/>
      <text class="series-label" x="${(M.l + w + 8).toFixed(1)}" y="${(y + 15).toFixed(1)}">${(v * 100).toFixed(0)}%</text>`;
  }).join('');

  return `
<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="How often each design target is satisfied across the swept parameter space">
  ${grid}${bars}
  <line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/>
  <text class="axis-label" x="${(M.l + W - M.r) / 2}" y="${H - 6}" text-anchor="middle">share of ${exploration.total_configs} swept worlds that satisfy the target</text>
</svg>`;
}

// Claim against measurement, side by side. This table is the entire argument for having a
// simulator: every row is something an agent asserted and the flight model then checked.
// Split from its renderer so the read-first banner can count how many claims the flights
// disagreed with. One source of truth for that number: the summary at the top and the table
// below it cannot drift apart, because they are the same array.
function claimRows(verification, params) {
  const rows = [];
  const num = (n, dp = 1) => (Number.isFinite(n) ? n.toFixed(dp) : '—');

  // Does skimming cool the committed entry, and by how much? This is the row the whole
  // simulator exists for: the params claim a multiplier, the flights measure one.
  for (const band of SAMPLES) {
    // Each band is an object, not the flat series array this used to index. A descent is
    // flown at more than one periapsis depth now, so the per-skim numbers live under
    // by_entry_depth and the headline row is the deepest entry that flew — which is what
    // skim_heat_multiplier_measured already holds. The old `st[2]` read undefined off the
    // object instead of throwing, and `st.length < 3` never caught it because
    // `undefined < 3` is false, so the miss surfaced as a crash in the artifact writer
    // after the entire crew had finished running.
    const st = verification.skims && verification.skims[band];
    const measuredBySkims = (st && st.skim_heat_multiplier_measured) || [];
    if (measuredBySkims.length < 3) continue;
    const claimed = (params.ablation.skim_heat_multiplier || [])[2];
    const measured = measuredBySkims[2];
    rows.push({
      what: `Entry heat after 2 skims, ${BAND_LABEL[band].toLowerCase()}`,
      claimed: claimed === undefined ? 'not stated' : `${(claimed * 100).toFixed(0)}% of a direct entry`,
      measured: `${(measured * 100).toFixed(0)}% of a direct entry`,
      ok: claimed !== undefined && Math.abs(measured - claimed) <= 0.15,
    });
  }

  const full = verification.descents.find((x) => x.band === 'middle' && x.load === 'full hold');
  if (full && full.landed) {
    rows.push({
      what: 'Full-hold touchdown speed',
      claimed: `${num(params.landing.descent_speed_full_hold_ms, 2)} m/s`,
      measured: `${num(full.touchdown_ms, 2)} m/s`,
      ok: full.soft_landing,
    });
  }

  rows.push({
    what: 'Full hold mass ratio',
    claimed: 'about 2x dry mass',
    measured: `${num(verification.cargo.full_hold_mass_ratio, 2)}x (${num(verification.cargo.full_hold_kg)} kg)`,
    ok: verification.cargo.full_hold_mass_ratio >= 1.75 && verification.cargo.full_hold_mass_ratio <= 2.25,
  });

  for (const u of verification.unstaged_braking || []) {
    rows.push({
      what: `Unstaged braking pass, ${BAND_LABEL[u.band].toLowerCase()}`,
      claimed: `under ${params.reentry.heat_capacity} heat`,
      measured: `peaks at ${u.shallow_pass_peak_heat}`,
      ok: u.survivable,
    });
  }

  const bc = verification.ballistic_coefficient;
  rows.push({
    what: 'Ballistic coefficient (staged)',
    claimed: 'not stated',
    measured: `${num(bc.staged_kg_m2)} kg/m2`,
    ok: bc.staged_kg_m2 >= 50,
  });

  return rows;
}

function claimedVsMeasured(verification, params) {
  const rows = claimRows(verification, params);
  return `<table class="data">
    <thead><tr><th>Quantity</th><th>What the params claim</th><th>What the flights measured</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.what)}</td>
      <td>${esc(r.claimed)}</td>
      <td class="num" style="text-align:left">${esc(r.measured)}</td>
      <td><span class="verdict ${r.ok ? 'good' : 'bad'}">${r.ok ? 'holds' : 'does not hold'}</span></td>
    </tr>`).join('')}</tbody></table>`;
}

function playtestCard(playtest, verification, exploration, params, t) {
  if (!playtest || !verification || !exploration) return '';
  const sev = { blocking: 'bad', significant: 'bad', minor: '' };
  const findings = playtest.findings.map((f) => `<li>
      <span class="verdict ${sev[f.severity] || ''}">${esc(f.severity)}</span>
      <span><b>${esc(f.id.replace(/_/g, ' '))}</b> (§${esc(f.gdd_ref)}, ${esc(f.kind)}) — ${esc(f.measured)}</span>
    </li>`).join('');

  const proposals = (playtest.proposed_changes || []).length
    ? `<details open><summary>Candidate value set — what the Playtester would fly instead</summary>
        <table class="data"><thead><tr><th>Parameter</th><th class="num">Current</th><th class="num">Proposed</th><th>Why</th></tr></thead>
        <tbody>${playtest.proposed_changes.map((c) => `<tr>
          <td><code>${esc(c.path)}</code></td>
          <td class="num">${esc(String(c.current ?? '—'))}</td>
          <td class="num">${esc(String(c.proposed))}</td>
          <td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table></details>`
    : '';

  const best = exploration.top && exploration.top[0];
  // Only fields the exploration scorer actually measures belong in here. It reports four,
  // and a cheapest pass count is not among them — that lives on the verification descents,
  // and asking these rows for it rendered "cheapest descent undefined passes" into the
  // shipped page. touchdown is null when no full hold landed, so it is stated only when flown.
  const touchdown = best && best.measured.full_hold_touchdown_ms != null
    ? `, full hold touching down at ${best.measured.full_hold_touchdown_ms} m/s`
    : '';
  const bestLine = best
    ? `<p class="caption">Best world found: <b>${best.score}/${best.max_score}</b> targets —
       gravity ${best.surface_gravity_ms2} m/s2, air density ${best.sea_level_density_kgm3} kg/m3,
       scale height ${best.scale_height_m} m, frontal area ${best.reference_area_m2} m2,
       dry mass ${best.dry_mass_kg} kg (ballistic coefficient
       ${best.measured.ballistic_coefficient_staged} kg/m2${touchdown}).</p>`
    : '';

  return `
  ${card('flights', 'What the flights measured', t && t.flights,
    `Every other agent reasons about these numbers. The simulator flew them — launch, aerobrake,
     land — across every sample altitude and cargo load. Where a row says <i>does not hold</i>, an agent
     asserted something the physics disagreed with.`,
    claimedVsMeasured(verification, params))}

  ${card('targets', "Where the design's targets are reachable at all", t && t.targets,
    `${esc(String(exploration.total_configs))} worlds, varying planet radius, gravity, air density,
     ship frontal area, dry mass, tank size and engine. Each scored against
     ${esc(String(Object.keys(exploration.target_satisfaction_rate || {}).length))} targets taken
     from the design document. A short bar means almost no configuration anywhere satisfies that
     target — which is a fact about the rule, not about the current numbers.`,
    chartTargets(exploration) + bestLine)}

  <div class="card" id="playtest">
    <h2>Playtest — ${esc(playtest.verdict.replace(/_/g, ' '))}</h2>
    ${t && t.playtest ? `<p class="takeaway"><span class="chip ${t.playtest.state}">${esc(t.playtest.label)}</span><span>${esc(t.playtest.text)}</span></p>` : ''}
    <details class="explain"><summary>What am I looking at?</summary>
      <p class="lede">${esc(playtest.summary)}</p></details>
    <ul class="findings">${findings}</ul>
    ${proposals}
    <details><summary>What the simulator cannot tell you</summary>
      <ul class="findings">${(playtest.confidence_notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </details>
  </div>`;
}

// ---------------------------------------------------------------- the page

function statTiles({ catalog, params, audit, manifest }) {
  const passed = audit.checks.filter((c) => c.result === 'pass').length;
  const fragile = catalog.debris.filter((d) => d.fragile).length;
  const tiles = [
    { label: 'Debris types', value: catalog.debris.length, sub: `${fragile} fragile` },
    { label: 'Upgrades priced', value: params.upgrades.length, sub: '6 parts × 2 tiers' },
    { label: 'Spec checks passed', value: `${passed}/${audit.checks.length}`, sub: audit.verdict.toUpperCase(), state: audit.verdict === 'pass' ? 'good' : 'bad' },
    { label: 'Balancer revisions', value: manifest ? (manifest.agents.find((a) => a.name === 'economy-balancer') || {}).revisions ?? 0 : 0, sub: 'audit feedback loop' },
  ];
  return `<div class="tiles">${tiles.map((t) => `
    <div class="tile">
      <div class="tile-label">${esc(t.label)}</div>
      <div class="tile-value">${esc(String(t.value))}</div>
      <div class="tile-sub ${t.state || ''}">${esc(t.sub)}</div>
    </div>`).join('')}</div>`;
}

function debrisTable(catalog, params) {
  const rows = catalog.debris
    .map((d) => ({ ...d, value: pieceValue(d, params) }))
    .sort((a, b) => SAMPLES.indexOf(a.band) - SAMPLES.indexOf(b.band) || b.value - a.value)
    .map((d) => `<tr>
      <td>${esc(d.display_name)}</td>
      <td><span class="swatch" style="background:var(--band-${d.band})"></span>${BAND_LABEL[d.band]}</td>
      <td>${esc(d.size_class)}</td>
      <td>${d.fragile ? 'fragile' : '—'}</td>
      <td class="num">${fmt(d.mass_kg, 1)}</td>
      <td class="num">${fmt(d.value)}</td>
      <td class="num">${fmt(d.value / d.mass_kg, 1)}</td>
    </tr>`).join('');

  return `<table class="data">
    <thead><tr><th>Piece</th><th>Band</th><th>Class</th><th>Flag</th>
      <th class="num">Mass (kg)</th><th class="num">Value</th><th class="num">Value/kg</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function legend() {
  return `<div class="legend">
    ${SAMPLES.map((b) => `<span class="key"><span class="swatch" style="background:var(--band-${b})"></span>${BAND_LABEL[b]}</span>`).join('')}
    <span class="key"><span class="swatch ring"></span>fragile (hollow)</span>
  </div>`;
}

// ---------------------------------------------------------------- reading the page
//
// Everything below computes ONE SENTENCE per card from the data on that card, and a
// five-second summary for the top. None of it is written prose: if a takeaway states a
// number, that number came out of the same array the chart beside it plots. The page used to
// open every card with three sentences of explanation and no verdict, which made a long
// report where nothing looked more important than anything else.

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

// Value per cargo slot, per band, per size class — the number behind "is one class best".
function valuePerSlotByBand(catalog, params) {
  const tier = params.cargo.compactor_tier;
  const out = {};
  for (const band of SAMPLES) {
    const byClass = {};
    for (const d of catalog.debris) {
      if (d.band !== band) continue;
      const cls = catalog.size_classes[d.size_class];
      if (!cls || !cls.hand_tetherable) continue;
      const slots = (!d.fragile && tier >= 1) ? cls.slots_crushed : cls.slots_uncrushed;
      if (!(slots > 0)) continue;
      (byClass[d.size_class] = byClass[d.size_class] || []).push(pieceValue(d, params) / slots);
    }
    const means = Object.entries(byClass)
      .map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])
      .sort((a, b) => b[1] - a[1]);
    if (means.length) out[band] = means;
  }
  return out;
}

function takeaways({ catalog, params, audit, playtest, sweeps }) {
  const t = {};
  const v = sweeps && sweeps.verification;
  const e = sweeps && sweeps.exploration;

  // --- the audit
  const failed = audit.checks.filter((c) => c.result === 'fail');
  t.audit = failed.length
    ? { state: 'bad', label: `${failed.length} failed`,
        text: `${audit.checks.length - failed.length} of ${audit.checks.length} rules hold. Failing: ` +
              failed.map((c) => c.rule_id).join(', ') + '.' }
    : { state: 'good', label: 'all pass',
        text: `All ${audit.checks.length} rules in the design document hold at these numbers.` };

  // --- claims against flights
  if (v) {
    const rows = claimRows(v, params);
    const bad = rows.filter((r) => !r.ok);
    t.flights = bad.length
      ? { state: 'bad', label: `${bad.length} disagree`,
          text: `${bad.length} of ${rows.length} things the params claim are contradicted by the flights: ` +
                bad.map((r) => r.what.toLowerCase()).join('; ') + '.' }
      : { state: 'good', label: 'all hold',
          text: `All ${rows.length} claims the params make survived being flown.` };
  }

  // --- exploration targets
  if (e && e.target_satisfaction_rate) {
    const rates = Object.entries(e.target_satisfaction_rate).sort((a, b) => a[1] - b[1]);
    const [scarce, rate] = rates[0];
    t.targets = {
      state: rate < 0.15 ? 'bad' : rate < 0.4 ? 'warn' : 'good',
      label: `${(rate * 100).toFixed(0)}% scarcest`,
      text: `Hardest target to satisfy anywhere is ${scarce.replace(/_/g, ' ')}, met by ` +
            `${(rate * 100).toFixed(1)}% of ${e.total_configs} worlds. A target almost nothing ` +
            `satisfies is a statement about the rule, not about these numbers.`,
    };
  }

  // --- the design's central bet
  const priced = catalog.debris.map((d) => ({ m: d.mass_kg, v: pieceValue(d, params) }));
  const r = pearson(priced.map((x) => x.m), priced.map((x) => x.v));
  t.debris = r === null
    ? { state: 'info', label: 'n/a', text: 'Not enough pieces to test the relationship.' }
    : { state: r >= 0.5 ? 'good' : r >= 0.2 ? 'warn' : 'bad',
        label: `r = ${r.toFixed(2)}`,
        text: r >= 0.5
          ? `Value rises with mass (r = ${r.toFixed(2)}), so the valuable haul really is the heavy one — the design's central bet holds.`
          : `Value barely tracks mass (r = ${r.toFixed(2)}). The heavy pieces are not the valuable ones, so upgrades will outrun difficulty.` };

  // --- the ablation optimum
  // The skim optimum is a REPORT, not a target. The rule that made it one — "the cheapest
  // descent should sit at 1-2 skims" — was retired after it was measured to be unsatisfiable
  // at every altitude and load: a player free to choose entry depth buys the same speed
  // reduction a skim gives, for one heat cycle instead of two. The design now takes its
  // multi-pass requirement from the heat capacity, which is a feasibility question and lives
  // on the pass axis. See gdd-change-proposal.md §11.
  const os = params.ablation.optimal_skims || {};
  const feasRule = audit.checks.find((c) => c.rule_id === 'heavy_descent_requires_multi_pass');
  const feasFailed = feasRule && feasRule.result === 'fail';
  t.ablation = {
    state: feasFailed ? 'warn' : 'info',
    label: feasFailed ? 'curve ok, requirement fails' : 'where the curve bottoms out',
    text: `Cheapest descent is ${SAMPLES.map((b) => `${os[b]} skim${os[b] === 1 ? '' : 's'} from the ${BAND_LABEL[b].toLowerCase()}`).join(', ')}. ` +
      'A single-pass optimum here is expected and is not a defect — the plunge is always the ' +
      'cheapest way down, and the design does not try to out-price it. ' +
      (feasFailed
        ? 'What fails is the separate rule that a heavy haul from high up must be UNABLE to ' +
          'plunge — see the audit. That is a question about survivable peak heat, not about ' +
          'cost, and this chart is not evidence either way.'
        : 'The requirement that a heavy haul cannot plunge is checked on the pass axis, ' +
          'against the heat capacity, and it holds.'),
  };
  t.surface = {
    state: 'info', label: 'read the valley',
    text: 'The dark line along the floor is the cheapest strategy at every entry speed. ' +
      `It reports where the model bottoms out; here it sits at ${os.top} from the upper band.`,
  };

  // --- is any size class strictly best
  const vps = valuePerSlotByBand(catalog, params);
  const winners = Object.values(vps).map((m) => m[0][0]);
  const dominant = winners.length && winners.every((w) => w === winners[0]);
  t.slots = winners.length
    ? { state: dominant ? 'warn' : 'good',
        label: dominant ? `${winners[0]} always wins` : 'it depends',
        text: dominant
          ? `${winners[0]} pays best per slot in every band, so what to grab stops being a choice — the player learns the rule once.`
          : `The best class per slot changes by band (${Object.entries(vps).map(([b, m]) => `${BAND_LABEL[b].toLowerCase()}: ${m[0][0]}`).join(', ')}), so the greed decision survives.` }
    : { state: 'info', label: 'n/a', text: 'No hand-tetherable pieces to compare.' };

  // --- the playtest
  if (playtest) {
    const blocking = (playtest.findings || []).filter((f) => f.severity === 'blocking').length;
    t.playtest = {
      state: blocking ? 'bad' : playtest.verdict === 'pass' ? 'good' : 'warn',
      label: playtest.verdict.replace(/_/g, ' '),
      text: `${(playtest.findings || []).length} findings, ${blocking} blocking, ` +
            `${(playtest.proposed_changes || []).length} proposed value changes.`,
    };
  }

  t.catalog = {
    state: 'info', label: `${catalog.debris.length} pieces`,
    text: `${catalog.debris.length} debris types, ${catalog.debris.filter((d) => d.fragile).length} fragile, priced across one band with a value gradient.`,
  };
  return t;
}

// The five-second version. Ordered by what would change a decision, not by page order.
function readFirst({ params, audit, playtest, sweeps, t }) {
  const items = [];
  const failed = audit.checks.filter((c) => c.result === 'fail');

  if (failed.length) {
    items.push(`<b>${failed.length} design rule${failed.length === 1 ? '' : 's'} could not be satisfied.</b> ` +
      failed.map((c) => `<code>${esc(c.rule_id)}</code>`).join(', ') +
      ` — <a href="#audit">the audit</a> shows the arithmetic. A rule that fails after two revision ` +
      `rounds is a finding about the design, not a number waiting to be tuned.`);
  }

  const v = sweeps && sweeps.verification;
  if (v) {
    const bad = claimRows(v, params).filter((r) => !r.ok);
    if (bad.length) {
      items.push(`<b>${bad.length} claim${bad.length === 1 ? '' : 's'} the params make ${bad.length === 1 ? 'is' : 'are'} contradicted by the flights.</b> ` +
        esc(bad.map((r) => r.what.toLowerCase()).join('; ')) +
        ` — <a href="#flights">claimed against measured</a>.`);
    }
  }

  const e = sweeps && sweeps.exploration;
  if (e && e.target_satisfaction_rate) {
    const [scarce, rate] = Object.entries(e.target_satisfaction_rate).sort((a, b) => a[1] - b[1])[0];
    items.push(`<b>${esc(scarce.replace(/_/g, ' '))}</b> is satisfied by only ` +
      `${(rate * 100).toFixed(1)}% of ${e.total_configs} worlds — <a href="#targets">the target scan</a>. ` +
      `Almost nowhere in the whole parameter space works for that rule.`);
  }

  const blocking = playtest ? (playtest.findings || []).filter((f) => f.severity === 'blocking') : [];
  if (blocking.length) {
    items.push(`<b>${blocking.length} blocking playtest finding${blocking.length === 1 ? '' : 's'}</b> — ` +
      `<a href="#playtest">what the flights actually did</a>.`);
  }

  if (!items.length) {
    items.push('<b>Nothing is failing.</b> Every rule holds, every claim survived being flown, ' +
      'and no target is unreachable. Read the observations before flying it anyway.');
  }

  const verdict = audit.verdict === 'pass'
    ? 'The numbers obey every rule in the design document.'
    : `The numbers obey ${audit.checks.length - failed.length} of ${audit.checks.length} rules in the design document.`;

  return `<div class="readfirst" id="top">
    <h2>Read this first</h2>
    <p class="headline">${esc(verdict)} ${esc(audit.summary || '')}</p>
    <ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>
  </div>`;
}

// title + one computed verdict line + the chart, with the explanation tucked behind a
// disclosure. `explain` is trusted HTML from this file; everything else is escaped.
function card(id, title, take, explain, body) {
  return `<div class="card" id="${esc(id)}">
    <h2>${esc(title)}</h2>
    ${take ? `<p class="takeaway"><span class="chip ${take.state}">${esc(take.label)}</span><span>${esc(take.text)}</span></p>` : ''}
    ${explain ? `<details class="explain"><summary>What am I looking at?</summary><p class="lede">${explain}</p></details>` : ''}
    ${body}
  </div>`;
}

function renderDashboard({ baseline, catalog, params, audit, manifest, playtest, sweeps }) {
  const failed = audit.checks.filter((c) => c.result === 'fail');

  // Decorate every piece once, here, with the two things derived from the one band: which
  // third of the envelope it falls in (for grouping and colour) and its value multiplier off
  // the gradient. Only this function is handed the baseline, and threading it through nine
  // chart functions to recompute the same two numbers would be worse than doing it once.
  catalog = {
    ...catalog,
    debris: catalog.debris.map((d) => ({
      ...d,
      band: thirdOf(d.altitude_m, baseline),
      value_multiplier: gradientMultiplier(d.altitude_m, baseline, params),
    })),
  };

  const t = takeaways({ catalog, params, audit, playtest, sweeps });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Junkstronaut — tuning crew report</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;background:var(--plane);color:var(--text-primary);
    font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  .viz-root{
    --plane:#f9f9f7; --surface-1:#fcfcfb;
    --text-primary:#0b0b0b; --text-secondary:#52514e; --muted:#898781;
    --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
    --band-bottom:#2a78d6; --band-middle:#eb6834; --band-top:#1baf7a;
    --accent:#2a78d6;
    --good:#0ca30c; --bad:#d03b3b; --warn:#fab219; --serious:#ec835a;
    --target:rgba(42,120,214,.07);
  }
  @media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{
    --plane:#0d0d0d; --surface-1:#1a1a19;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
    --band-bottom:#3987e5; --band-middle:#d95926; --band-top:#199e70;
    --accent:#3987e5;
    --target:rgba(57,135,229,.10);
  }}
  :root[data-theme="dark"] .viz-root{
    --plane:#0d0d0d; --surface-1:#1a1a19;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
    --band-bottom:#3987e5; --band-middle:#d95926; --band-top:#199e70;
    --accent:#3987e5;
    --target:rgba(57,135,229,.10);
  }
  .viz-root{background:var(--plane);min-height:100vh;padding:32px 20px 64px}
  .wrap{max-width:840px;margin:0 auto}
  h1{font-size:26px;margin:0 0 4px;letter-spacing:-.01em}
  .sub{color:var(--text-secondary);margin:0 0 6px}
  .meta{color:var(--muted);font-size:13px;margin:0 0 28px}
  h2{font-size:17px;margin:0 0 4px;letter-spacing:-.005em}
  .lede{color:var(--text-secondary);font-size:14px;margin:0 0 16px}
  .card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;
    padding:20px;margin:0 0 20px;overflow-x:auto}
  .chart{width:100%;height:auto;display:block;min-width:520px}
  .grid{stroke:var(--grid);stroke-width:1}
  .axis{stroke:var(--axis);stroke-width:1}
  .tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
  .axis-label{fill:var(--text-secondary);font-size:12px}
  .series-label{fill:var(--text-secondary);font-size:12px;font-weight:600}
  .target{fill:var(--target)}
  .target-label{fill:var(--muted);font-size:11px}
  .mark{cursor:pointer}
  .mark:hover,.ring:hover{filter:brightness(1.12)}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 28px}
  .tile{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
  .tile-label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .tile-value{font-size:28px;font-weight:600;line-height:1.15;margin:4px 0 2px}
  .tile-sub{color:var(--text-secondary);font-size:13px}
  .tile-sub.good{color:var(--good);font-weight:600}
  .tile-sub.bad{color:var(--bad);font-weight:600}
  .legend{display:flex;flex-wrap:wrap;gap:16px;margin:14px 0 0;font-size:13px;color:var(--text-secondary)}
  .key{display:inline-flex;align-items:center;gap:7px}
  .swatch{width:11px;height:11px;border-radius:3px;display:inline-block;flex:none}
  .swatch.ring{border:2.5px solid var(--muted);background:none;border-radius:50%}
  .findings{list-style:none;padding:0;margin:16px 0 0;font-size:14px;color:var(--text-secondary)}
  .findings li{display:flex;align-items:center;gap:8px;padding:5px 0}
  .verdict{font-weight:600}
  .verdict.good{color:var(--good)} .verdict.bad{color:var(--bad)}

  /* Read-first banner. The page is long and everything in it used to look equally
     important; this is the five-second version, and every line points at a card. */
  .readfirst{background:var(--surface-1);border:1px solid var(--border);
    border-left:4px solid var(--accent);border-radius:12px;padding:18px 20px;margin:0 0 20px}
  .readfirst h2{margin:0 0 6px;font-size:17px}
  .readfirst .headline{font-size:15px;color:var(--text-primary);margin:0 0 12px}
  .readfirst ol{margin:0;padding-left:20px}
  .readfirst li{margin:7px 0;font-size:14px;color:var(--text-secondary)}
  .readfirst a{color:inherit;text-decoration:underline;text-underline-offset:2px}
  .readfirst b{color:var(--text-primary)}

  /* One computed sentence per card, sitting above the chart. Never hand-written prose:
     if it says a number, that number came out of the data on this page. */
  .takeaway{display:flex;gap:9px;align-items:baseline;margin:2px 0 12px;font-size:14px;
    color:var(--text-primary);line-height:1.5}
  .chip{flex:none;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
    border-radius:20px;padding:2px 9px;border:1px solid currentColor}
  .chip.good{color:var(--good)} .chip.bad{color:var(--bad)}
  .chip.warn{color:#8a6200} .chip.info{color:var(--text-secondary)}
  @media (prefers-color-scheme:dark){ .chip.warn{color:var(--warn)} }

  /* The explanation is still here, just not shouting. Collapsed by default so the page
     reads as chart-then-verdict rather than three paragraphs then a chart. */
  .explain{margin:0 0 12px}
  .explain summary{cursor:pointer;color:var(--text-secondary);font-size:13px;
    list-style:none;display:inline-block;border-bottom:1px dotted var(--muted)}
  .explain summary::-webkit-details-marker{display:none}
  .explain summary:hover{color:var(--accent)}
  .explain .lede{margin:8px 0 0}
  .caption{color:var(--text-secondary);font-size:13.5px;margin:14px 0 0}
  table.data{width:100%;border-collapse:collapse;font-size:13.5px}
  table.data th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;
    text-transform:uppercase;letter-spacing:.03em;padding:0 10px 8px;border-bottom:1px solid var(--border)}
  table.data td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-secondary)}
  table.data td:first-child{color:var(--text-primary);font-weight:500}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  details{margin:0 0 20px}
  summary{cursor:pointer;color:var(--text-secondary);font-size:14px;padding:6px 0}
  .fail{border-left:3px solid var(--bad);padding-left:14px;margin:12px 0}
  .fail b{color:var(--text-primary)}
  #tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;
    background:var(--text-primary);color:var(--surface-1);padding:6px 10px;border-radius:7px;
    font-size:12.5px;max-width:300px;z-index:9;line-height:1.4}
</style></head>
<body><div class="viz-root"><div class="wrap">

  <h1>Junkstronaut — tuning crew report</h1>
  <p class="sub">What the crew's proposed numbers imply, before anyone flies them.</p>
  <p class="meta">${esc(manifest ? `${manifest.mode} run · ${manifest.duration_s}s · ${(manifest.models || []).join(', ') || 'no model recorded'} · ${manifest.finished_at}` : 'no run manifest')}</p>

  ${statTiles({ catalog, params, audit, manifest })}

  ${readFirst({ params, audit, playtest, sweeps, t })}

  ${card('debris', 'Value costs mass', t.debris,
    `The design's central bet (§2.3.7): the better the haul, the harder the ride home. If this
     cloud trends up and to the right, the bet holds — the valuable pieces are the heavy ones.
     A flat cloud means upgrades will outrun difficulty.`,
    chartDebris(catalog, params) + legend())}

  ${card('ablation', 'The ablation curve', t.ablation,
    `The hardest constraint in the document (§2.3.1). One screaming plunge is expensive; a dozen
     feather-light passes are expensive; the cheapest descent should be a planned 2–4 committed
     passes. Each ring marks where that band's curve bottoms out. These are the Balancer's own
     numbers plotted verbatim, not the renderer's arithmetic — so the curve and the audit
     beneath it can never disagree.`,
    chartAblation(params))}

  ${card('slots', 'Is any size class strictly best?', t.slots,
    `Value per cargo slot. If one class towers over the others at every band, the greed decision
     collapses — the player just learns the rule and stops choosing.`,
    chartValuePerSlot(catalog, params) + legend())}

  ${card('surface', 'The ablation surface', t.surface,
    `Plate burned as a function of both inputs at once — how fast you are coming in, and how many
     passes you split it into. Two independent variables and one output, so this is the one place
     a surface beats a line chart.`,
    chartSurface(params))}

  ${playtestCard(playtest, sweeps && sweeps.verification, sweeps && sweeps.exploration, params, t)}

  <div class="card" id="audit">
    <h2>Spec audit — ${esc(audit.verdict.toUpperCase())}</h2>
    ${t.audit ? `<p class="takeaway"><span class="chip ${t.audit.state}">${esc(t.audit.label)}</span><span>${esc(t.audit.text)}</span></p>` : ''}
    <details class="explain"><summary>What am I looking at?</summary>
      <p class="lede">${esc(audit.summary)}</p></details>
    ${failed.length ? failed.map((c) => `<div class="fail">
        <b>${esc(c.rule_id)}</b> — GDD §${esc(c.gdd_ref)}<br>${esc(c.statement)}<br>
        <span style="color:var(--text-secondary)">Found: ${esc(c.evidence)}</span></div>`).join('')
      : '<p class="caption">Every rule the auditor checked holds at these numbers.</p>'}
    ${(audit.observations || []).length ? `<details open><summary>Observations — pass the spec, worth a human's eye</summary>
      <ul class="findings">${audit.observations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></details>` : ''}
    ${(params.catalog_concerns || []).length ? `<details open><summary>Catalog concerns raised by the Economy Balancer</summary>
      <p class="caption">Not audit findings. These are problems the Balancer hit while pricing the
      catalog and could not fix, because it does not own that data. On a failing run they are
      routed to the Debris Designer; on a passing run they land here.</p>
      <ul class="findings">${params.catalog_concerns.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
  </div>

  ${card('catalog', 'The catalog', t.catalog,
    'Every piece the crew authored and priced. Sorted by altitude, then by value.',
    debrisTable(catalog, params))}

</div></div>
<div id="tip"></div>
<script>
  var tip = document.getElementById('tip');
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-tip]');
    if (!t) return;
    tip.textContent = t.getAttribute('data-tip');
    tip.style.opacity = '1';
  });
  document.addEventListener('mousemove', function (e) {
    if (tip.style.opacity !== '1') return;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - w - 10) + 'px';
    tip.style.top = Math.max(e.clientY - h - 12, 8) + 'px';
  });
  document.addEventListener('mouseout', function (e) {
    if (e.target.closest('[data-tip]')) tip.style.opacity = '0';
  });
</script>
</body></html>`;
}

module.exports = { renderDashboard, pieceValue, ablationClosedForm };

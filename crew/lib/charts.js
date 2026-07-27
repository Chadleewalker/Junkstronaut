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
const BANDS = ['suborbital', 'low', 'high'];
const BAND_LABEL = { suborbital: 'Suborbital', low: 'Low orbit', high: 'High orbit' };
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

// Value of one piece: size-class base, scaled by band, with the fragile premium on top.
function pieceValue(entry, params) {
  const base = params.economy.size_class_base_value[entry.size_class] || 0;
  const mult = params.economy.band_value_multiplier[entry.band] || 1;
  const prem = entry.fragile ? (params.economy.fragile_value_premium || 1) : 1;
  return base * mult * prem;
}

// GDD §2.3.1, as the Economy Balancer's charter states it and as the schema requires it to
// be emitted:
//
//   cost(band, n) = n · toll[band] + coeff · n · (heat_index[band] / n) ^ exponent
//
// The first term punishes feathering, the second punishes a single plunge, and with
// exponent > 1 the sum is U-shaped. Where its floor sits is the whole design question.
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
  return (toll, heatIndex, passes) =>
    passes * toll + a.heat_cost_coefficient * passes * Math.pow(heatIndex / passes, a.heat_cost_exponent);
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
  const marks = BANDS.map((band) => pts.filter((p) => p.band === band).map((p) => {
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
  const passes = [1, 2, 3, 4, 5, 6, 7, 8];

  // The Balancer's own arithmetic, plotted as given.
  const series = BANDS.map((band) => {
    const curve = params.ablation.cost_curve[band];
    const pts = passes.map((n) => ({ n, cost: curve[n - 1] }));
    const best = pts.reduce((a, b) => (b.cost < a.cost ? b : a));
    return { band, pts, best, claimed: params.ablation.optimal_pass_count[band] };
  });

  const all = series.flatMap((s) => s.pts.map((p) => p.cost));
  const yMax = Math.min(Math.max(...all), Math.min(...all) * 6); // clip the 1-pass spike
  const x = linear(1, 8, M.l, W - M.r);
  const y = linear(0, yMax, H - M.b, M.t);
  const clamp = (v) => Math.max(M.t - 4, Math.min(H - M.b, y(v)));

  const grid = niceTicks(0, yMax, 5).map((t) =>
    `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>` +
    `<text class="tick" x="${M.l - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`).join('');

  const xticks = passes.map((n) =>
    `<text class="tick" x="${x(n).toFixed(1)}" y="${H - M.b + 20}" text-anchor="middle">${n}</text>`).join('');

  // The GDD's target window: the cheapest descent should sit at 2–4 passes from every band.
  const bandRect = `<rect class="target" x="${x(2)}" y="${M.t}" width="${x(4) - x(2)}" height="${H - M.b - M.t}"/>
    <text class="target-label" x="${(x(2) + x(4)) / 2}" y="${M.t + 14}" text-anchor="middle">GDD target: 2–4 passes</text>`;

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
        data-tip="${esc(`${BAND_LABEL[s.band]} · ${p.n} pass${p.n > 1 ? 'es' : ''} · ${fmt(p.cost, 1)}% plate burned`)}"/>`).join('');
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
    const inWindow = s.best.n >= 2 && s.best.n <= 4;
    const agrees = s.best.n === s.claimed;
    const note = !agrees
      ? `<span class="verdict bad">curve bottoms at ${s.best.n}, params claim ${s.claimed}</span>`
      : `<span class="verdict ${inWindow ? 'good' : 'bad'}">${inWindow ? 'in the 2–4 window' : 'outside the 2–4 window'}</span>`;
    return `<li><span class="swatch" style="background:var(--band-${s.band})"></span>
      <b>${BAND_LABEL[s.band]}</b> — cheapest at <b>${s.best.n} pass${s.best.n > 1 ? 'es' : ''}</b> ${note}</li>`;
  }).join('');

  return `
<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Heat shield plate burned against number of aerobraking passes, per band">
  ${bandRect}${grid}
  <line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/>
  <line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/>
  ${lines}${xticks}
  <text class="axis-label" x="${(M.l + W - M.r) / 2}" y="${H - 10}" text-anchor="middle">aerobraking passes</text>
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
    for (const band of BANDS) {
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
  const barW = Math.min(46, (groupW - 28) / BANDS.length - 2); // 2px surface gap between bars

  const grid = niceTicks(0, yMax, 5).map((t) =>
    `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>` +
    `<text class="tick" x="${M.l - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`).join('');

  const bars = classes.map((cls, gi) => {
    const gx = M.l + gi * groupW + (groupW - (barW + 2) * BANDS.length) / 2;
    const inner = BANDS.map((band, bi) => {
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
    const label = `<text class="tick" x="${(gx + ((barW + 2) * BANDS.length) / 2).toFixed(1)}" y="${H - M.b + 22}" text-anchor="middle">${cls}</text>`;
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
  const idx = BANDS.map((b) => a.heat_index[b]);
  const hMin = Math.min(...idx) * 0.85, hMax = Math.max(...idx) * 1.15;
  const NI = 16, NJ = 8;                       // heat steps, pass counts 1..8
  const hAt = (i) => hMin + (hMax - hMin) * (i / (NI - 1));

  // Toll is band-specific, so interpolate it across the same axis rather than picking one.
  const knots = BANDS.map((b) => ({ h: a.heat_index[b], toll: a.fixed_toll_per_pass_pct_by_band[b] }))
    .sort((p, q) => p.h - q.h);
  const tollAt = (h) => {
    if (h <= knots[0].h) return knots[0].toll;
    if (h >= knots[knots.length - 1].h) return knots[knots.length - 1].toll;
    for (let k = 0; k < knots.length - 1; k++) {
      if (h <= knots[k + 1].h) {
        const t = (h - knots[k].h) / ((knots[k + 1].h - knots[k].h) || 1);
        return knots[k].toll + t * (knots[k + 1].toll - knots[k].toll);
      }
    }
    return knots[knots.length - 1].toll;
  };
  const closed = ablationClosedForm(params);
  const cost = (h, n) => closed(tollAt(h), h, n);

  const z = [];
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < NI; i++) {
    z.push([]);
    for (let j = 0; j < NJ; j++) {
      const c = cost(hAt(i), j + 1);
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
      data-tip="${esc(`heat index ${fmt(p.h)} → cheapest at ${p.n} pass${p.n > 1 ? 'es' : ''} (${fmt(z[p.i][p.j], 1)}% plate)`)}"/>`).join('');

  // Where each real band lands on the surface. The three can sit close together on the
  // heat axis, so the callout stems are staggered in length rather than all drawn at once
  // — three labels at the same height overlap exactly when the bands are most similar,
  // which is the case a reader most wants to distinguish.
  const marks = BANDS.map((band, k) => {
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
  <text class="axis-label" x="${W - 250}" y="${H - 12}" text-anchor="middle">← aerobraking passes</text>
</svg>
<p class="caption">The dark line is the valley floor — the cheapest pass count at every entry
speed. It is the answer to the hardest question in §2.3.1, and it should stay inside 2–4
across the whole span. Where it climbs toward the back, higher bands are demanding more
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
function claimedVsMeasured(verification, params) {
  const rows = [];
  const num = (n, dp = 1) => (Number.isFinite(n) ? n.toFixed(dp) : '—');

  for (const band of BANDS) {
    const d = verification.descents.find((x) => x.band === band && x.load === 'empty');
    if (!d || !d.landed) continue;
    rows.push({
      what: `Cheapest descent, ${BAND_LABEL[band].toLowerCase()}`,
      claimed: `${params.ablation.optimal_pass_count[band]} passes`,
      measured: `${d.cheapest_pass_count} pass${d.cheapest_pass_count > 1 ? 'es' : ''}`,
      ok: d.cheapest_pass_count === params.ablation.optimal_pass_count[band],
    });
  }

  const full = verification.descents.find((x) => x.band === 'low' && x.load === 'full hold');
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

  return `<table class="data">
    <thead><tr><th>Quantity</th><th>What the params claim</th><th>What the flights measured</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td>${esc(r.what)}</td>
      <td>${esc(r.claimed)}</td>
      <td class="num" style="text-align:left">${esc(r.measured)}</td>
      <td><span class="verdict ${r.ok ? 'good' : 'bad'}">${r.ok ? 'holds' : 'does not hold'}</span></td>
    </tr>`).join('')}</tbody></table>`;
}

function playtestCard(playtest, verification, exploration, params) {
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
  const bestLine = best
    ? `<p class="caption">Best world found: <b>${best.score}/${best.max_score}</b> targets —
       gravity ${best.surface_gravity_ms2} m/s2, air density ${best.sea_level_density_kgm3} kg/m3,
       scale height ${best.scale_height_m} m, frontal area ${best.reference_area_m2} m2,
       dry mass ${best.dry_mass_kg} kg (ballistic coefficient
       ${best.measured.ballistic_coefficient_staged} kg/m2, cheapest descent
       ${best.measured.cheapest_pass_count} passes).</p>`
    : '';

  return `
  <div class="card">
    <h2>What the flights measured</h2>
    <p class="lede">Every other agent reasons about these numbers. The simulator flew them —
      launch, aerobrake, land — across every band and cargo load. Where a row below says
      <i>does not hold</i>, an agent asserted something the physics disagreed with.</p>
    ${claimedVsMeasured(verification, params)}
  </div>

  <div class="card">
    <h2>Where the design's targets are reachable at all</h2>
    <p class="lede">${esc(String(exploration.total_configs))} worlds, varying gravity, air density,
      atmosphere thickness, ship frontal area and dry mass. Each scored against seven targets
      taken from the design document. A short bar means almost no configuration anywhere
      satisfies that target — which is a fact about the rule, not about the current numbers.</p>
    ${chartTargets(exploration)}
    ${bestLine}
  </div>

  <div class="card">
    <h2>Playtest — ${esc(playtest.verdict.replace(/_/g, ' '))}</h2>
    <p class="lede">${esc(playtest.summary)}</p>
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
    .sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || b.value - a.value)
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
    ${BANDS.map((b) => `<span class="key"><span class="swatch" style="background:var(--band-${b})"></span>${BAND_LABEL[b]}</span>`).join('')}
    <span class="key"><span class="swatch ring"></span>fragile (hollow)</span>
  </div>`;
}

function renderDashboard({ baseline, catalog, params, audit, manifest, playtest, sweeps }) {
  const failed = audit.checks.filter((c) => c.result === 'fail');

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
    --band-suborbital:#2a78d6; --band-low:#eb6834; --band-high:#1baf7a;
    --good:#0ca30c; --bad:#d03b3b; --target:rgba(42,120,214,.07);
  }
  @media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz-root{
    --plane:#0d0d0d; --surface-1:#1a1a19;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
    --band-suborbital:#3987e5; --band-low:#d95926; --band-high:#199e70;
    --target:rgba(57,135,229,.10);
  }}
  :root[data-theme="dark"] .viz-root{
    --plane:#0d0d0d; --surface-1:#1a1a19;
    --text-primary:#fff; --text-secondary:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
    --band-suborbital:#3987e5; --band-low:#d95926; --band-high:#199e70;
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

  <div class="card">
    <h2>Value costs mass</h2>
    <p class="lede">The design's central bet (§2.3.7): the better the haul, the harder the ride
      home. If this cloud trends up and to the right, the bet holds — the valuable pieces are
      the heavy ones. A flat cloud means upgrades will outrun difficulty.</p>
    ${chartDebris(catalog, params)}
    ${legend()}
  </div>

  <div class="card">
    <h2>The ablation curve</h2>
    <p class="lede">The hardest constraint in the document (§2.3.1). One screaming plunge is
      expensive; a dozen feather-light passes are expensive; the cheapest descent should be a
      planned 2–4 committed passes. Each ring marks where that band's curve bottoms out.</p>
    ${chartAblation(params)}
  </div>

  <div class="card">
    <h2>Is any size class strictly best?</h2>
    <p class="lede">Value per cargo slot. If one class towers over the others at every band,
      the greed decision collapses — the player just learns the rule and stops choosing.</p>
    ${chartValuePerSlot(catalog, params)}
    ${legend()}
  </div>

  <div class="card">
    <h2>The ablation surface</h2>
    <p class="lede">Plate burned as a function of both inputs at once — how fast you are coming
      in, and how many passes you split it into. Two independent variables and one output, so
      this is the one place a surface beats a line chart.</p>
    ${chartSurface(params)}
  </div>

  ${playtestCard(playtest, sweeps && sweeps.verification, sweeps && sweeps.exploration, params)}

  <div class="card">
    <h2>Spec audit — ${esc(audit.verdict.toUpperCase())}</h2>
    <p class="lede">${esc(audit.summary)}</p>
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

  <div class="card">
    <h2>The catalog</h2>
    <p class="lede">Every piece the crew authored and priced. Sorted by band, then by value.</p>
    ${debrisTable(catalog, params)}
  </div>

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

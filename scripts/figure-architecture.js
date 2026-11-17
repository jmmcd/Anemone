#!/usr/bin/env node
/**
 * figure-architecture.js — the paper's system-architecture figure, generated.
 *
 * Draws the four layers left → right (browser front-end, framework + EA, the
 * Individual API, the PTO representation) as an SVG, and converts it to PDF with
 * `rsvg-convert`. The thumbnails are not illustrations: they are real individuals,
 * rendered headlessly through the test harness (the same generators, meshes and
 * visualize() calls as the app), under a seeded Math.random so a rerun reproduces
 * the same figure. The trace entries and phenotype shown in the PTO column are
 * read off the population's actual parent.
 *
 * Usage:
 *   node scripts/figure-architecture.js [out.pdf] [--png] [--seed 7]
 *     out.pdf  default figure-architecture.pdf; the .svg is written beside it
 *     --png    also write a 2x PNG preview beside it (for eyeballing)
 *     --seed   change the RNG seed (re-rolls every thumbnail)
 *
 * Needs `rsvg-convert` (librsvg) on PATH for the PDF/PNG; the SVG needs nothing.
 *
 * DESIGN NOTES (decisions agreed with jmmcd, Nov 2026 — read before changing)
 *
 * Purpose and emphasis
 *   - Full-page-width figure (W×H = 1000×640 user units) for the main Anemone paper.
 *   - The subject is the ARCHITECTURE: what the framework knows vs. what an
 *     Individual supplies vs. what PTO supplies. The EA's admission filters and
 *     UI interaction are deliberately secondary — one line each, not boxes.
 *   - The SIT inverse-import loop (SITAnalysis → fromCode) is EXCLUDED on
 *     purpose: it is kept for a future SIT-focused paper.
 *
 * Style: "cute but restrained"
 *   - Not UML, not xkcd/hand-drawn. Straight orthogonal lines, rounded corners,
 *     thick friendly strokes, soft card fills, a few small stickers (heart = like,
 *     padlock = lock, die = rnd, toggles = capability flags).
 *   - Fonts: Avenir Next for prose, Menlo for code names. Note: rsvg embeds some
 *     glyphs (→, ✎, subscripts) as Type 3 fonts — may trip IEEE PDF eXpress; if
 *     so, swap them for drawn shapes / plain ASCII.
 *
 * Layout: four columns, left → right (COL), rows aligned across columns (ROW)
 *   1. Front-end: the population grid. It must be ONE type (a population is
 *      single-typed; a mixed grid would mislead). We chose Petal Sphere 3D
 *      (more striking than Polar Curve). Tiles show liked (heart) and locked
 *      (padlock) states; chips below are the Code editor and Grid edit entry points.
 *   2. Framework: EA card (4 compact steps: locks carried over, parents from
 *      likes, crossover + mutate, admit if new & valid); Capability-flags card
 *      (toggles read off the Individual); Shared outputs (2D canvas, Three.js,
 *      MIDI, Web Audio) and Shared services (Palette, Photo, AudioClip,
 *      Transport, Save / load, Share link).
 *   3. Individual: the API rows (editableSections / setGene·mutate·crossover /
 *      this.phenotype / flags / visualize·describe). Variety across types lives
 *      HERE, as a fan of thumbnails of different types with "extends" arrows into
 *      the base class — not in the grid. Caption "38 types" = registry entries
 *      minus hidden ones (update if the registry changes). Column kept narrow
 *      (w 182) so the thin code/edit arrows have visible shafts before their heads.
 *   4. PTO: generator (+ die sticker) → "record" → trace (= genome) → "replay" →
 *      phenotype ("opaque to the framework"). Rows are aligned with the
 *      Individual's ops/phenotype rows so the connecting arrows run straight.
 *      Caption wording is jmmcd's: "PTO implicitly designs the operators per
 *      problem with structural alignment". No "+N more" under the trace.
 *
 * Arrows (the figure's three stories)
 *   - Bold red: the evolution loop — tiles → EA (likes) → breed via the trace →
 *     phenotype → visualize → shared outputs → tiles (draw).
 *   - Dotted amber: the framework READS capability flags (no per-type registration).
 *   - Thin magenta / teal: user interventions — code editor → editableSections →
 *     generator; grid edit → setGene → trace. They run in dedicated lanes
 *     (LANE_CODE / LANE_EDIT) under the column titles, and drop at codeDown /
 *     editDown left of the Individual column, so nothing crosses.
 *
 * Real data, reproducible
 *   - Everything drawn is real: thumbnails come from the actual generators and
 *     visualize()/generate3DPoints(); the trace rows are real entries of the
 *     parent, centred on a real mutation found in a child (shown as val→to);
 *     the phenotype shown is the parent's actual r₁/r₂ expressions.
 *   - Fully seeded (mulberry32 over Math.random; each fan type reseeded from
 *     SEED). Parent choice is filtered for a readable expression length and
 *     sin/cos in both parts; mutants are deduped, valid and not plain spheres.
 *   - 2D types render through MiniContext (putImageData patched to blit); 3D
 *     types through a small z-buffered Gouraud rasteriser here (render3D).
 *
 * If you change the layout: keep rows aligned across columns, keep arrows
 * orthogonal with a visible shaft, and regenerate with --png to eyeball for
 * text overflow (the usual failure: long Menlo names in chips/cards).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Raster, writePNG } = require('./lib/png');
const { MiniContext, downsample } = require('./lib/canvas2d');

// ---------------------------------------------------------------------------
// args
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const OUT = path.resolve((args[0] && !args[0].startsWith('--')) ? args[0] : 'figure-architecture.pdf');
const SEED = parseInt(flag('--seed', '7'), 10);
const WANT_PNG = args.includes('--png');

// ---------------------------------------------------------------------------
// Deterministic randomness. PTO and every generator draw from Math.random, and
// the harness sandbox shares the host's Math, so seeding here seeds everything.
function mulberry32(a) {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const reseed = (s) => { Math.random = mulberry32(s); };
reseed(SEED);

const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));
const { classes, sandbox } = load();

// A real palette in place of the harness's flat stub (hand-sampled d3 ramps).
const PALETTES = {
    viridis: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'],
    plasma: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'],
    sunset: ['#3d2c8d', '#7c3aa6', '#c84b9e', '#f07b7b', '#f9b26b', '#fbe3a1'],
    teal: ['#0b3954', '#087e8b', '#3fb8af', '#a8e0d1', '#f2f7f2'],
    petal: ['#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
};
let palette = PALETTES.viridis;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
sandbox.window.Palette.color = function (t) {
    const s = palette;
    t = Math.max(0, Math.min(1, Number(t) || 0)) * (s.length - 1);
    const i = Math.min(s.length - 2, Math.floor(t)), f = t - i;
    const a = hex(s[i]), b = hex(s[i + 1]);
    const [r, g, bb] = a.map((v, k) => Math.round(v + (b[k] - v) * f));
    return { r, g, b: bb, hex: '#' + [r, g, bb].map(v => v.toString(16).padStart(2, '0')).join(''), css: `rgb(${r},${g},${bb})` };
};

// The mini canvas ignores ImageData; most pixel-based types draw through it.
MiniContext.prototype.putImageData = function (img, dx = 0, dy = 0) {
    const k = this.k;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const s = (y * img.width + x) * 4, c = [img.data[s], img.data[s + 1], img.data[s + 2]], a = img.data[s + 3] / 255;
        if (a === 0) continue;
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) this.raster.setPixel(this.ox + (dx + x) * k + i, this.oy + (dy + y) * k + j, c, a);
    }
};

// ---------------------------------------------------------------------------
// Thumbnail rendering → PNG data URIs
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'anemone-fig-'));
let tmpN = 0;
function dataURI(raster) {
    const f = path.join(TMP, `t${tmpN++}.png`);
    writePNG(f, raster.width, raster.height, raster.buf);
    return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
}

const TILE_BG = [247, 248, 251];

/** A 2D individual through its real visualize(), supersampled. */
function render2D(ind, size = 160, ss = 3) {
    const big = new Raster(size * ss, size * ss, 255);
    const ctx = new MiniContext(big, ss, 0, 0);
    ind.visualize({ width: size, height: size, getContext: () => ctx });
    return dataURI(downsample(big, ss, Raster));
}

/** A 3D individual's real mesh (generate3DPoints), z-buffered + Gouraud, supersampled. */
function render3D(ind, size = 200, ss = 3, { rx = 0.55, ry = 0.5, fill = 0.84 } = {}) {
    const S = size * ss;
    const img = new Raster(S, S, 0);
    for (let i = 0; i < img.buf.length; i += 3) img.buf.set(TILE_BG, i);
    const { vertices, indices, colors } = ind.generate3DPoints();
    const cX = Math.cos(rx), sX = Math.sin(rx), cY = Math.cos(ry), sY = Math.sin(ry);
    const rv = [];
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
        const x1 = x * cY - z * sY, z1 = x * sY + z * cY;
        const p = [x1, y * cX - z1 * sX, y * sX + z1 * cX];
        rv.push(p);
        mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]);
    }
    const nv = rv.length, nrm = new Float32Array(nv * 3);
    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const A = rv[a], B = rv[b], C = rv[c];
        if (!A || !B || !C) continue;
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        for (const i of [a, b, c]) { nrm[i * 3] += n[0]; nrm[i * 3 + 1] += n[1]; nrm[i * 3 + 2] += n[2]; }
    }
    const L = [0.35, 0.6, 0.72], Ln = Math.hypot(...L);
    const inten = new Float32Array(nv);
    for (let i = 0; i < nv; i++) {
        const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
        const d = Math.abs((nrm[i * 3] * L[0] + nrm[i * 3 + 1] * L[1] + nrm[i * 3 + 2] * L[2]) / (l * Ln));
        inten[i] = 0.55 + 0.5 * d;
    }
    const span = Math.max(mxx - mnx, mxy - mny) || 1, sc = S * fill / span;
    const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    const P = rv.map(p => [S / 2 + (p[0] - cx) * sc, S / 2 - (p[1] - cy) * sc, p[2]]);
    const zbuf = new Float32Array(S * S).fill(-Infinity);
    for (let t = 0; t < indices.length; t += 3) {
        const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
        const A = P[ia], B = P[ib], C = P[ic];
        if (!A || !B || !C) continue;
        const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(S - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
        const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(S - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
        for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
            const w0 = ((B[0] - px) * (C[1] - py) - (B[1] - py) * (C[0] - px)) / area;
            const w1 = ((C[0] - px) * (A[1] - py) - (C[1] - py) * (A[0] - px)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
            const z = w0 * A[2] + w1 * B[2] + w2 * C[2], zi = py * S + px;
            if (z <= zbuf[zi]) continue;
            zbuf[zi] = z;
            const sh = w0 * inten[ia] + w1 * inten[ib] + w2 * inten[ic];
            const col = k => Math.min(255, (w0 * colors[ia * 3 + k] + w1 * colors[ib * 3 + k] + w2 * colors[ic * 3 + k]) * 255 * sh);
            const i3 = zi * 3;
            img.buf[i3] = col(0); img.buf[i3 + 1] = col(1); img.buf[i3 + 2] = col(2);
        }
    }
    return dataURI(downsample(img, ss, Raster));
}

/** A valid individual of a type, as the EA's createValid would give. */
function valid(Cls, accept = () => true) {
    for (let i = 0; i < 500; i++) {
        const ind = new Cls();
        if ((!ind.validate || ind.validate()) && accept(ind)) return ind;
    }
    throw new Error(`no valid ${Cls.name}`);
}

// --- the population: one Petal Sphere parent plus mutants of it -------------
const Petal = classes.PetalSphere3DIndividual;
const exprLen = p => p.phenotype.meridianExpr.length + p.phenotype.crossExpr.length;
const parent = valid(Petal, p => exprLen(p) > 26 && exprLen(p) < 56
    && /sin|cos/.test(p.phenotype.meridianExpr) && /sin|cos/.test(p.phenotype.crossExpr));
const pop = [parent];
const seen = new Set([JSON.stringify(parent.phenotype)]);
for (let tries = 0; pop.length < 9 && tries < 2000; tries++) {
    const child = pop[Math.floor(Math.random() * Math.min(pop.length, 3))].clone();
    child.mutate(0.12);
    const key = JSON.stringify(child.phenotype);
    if (seen.has(key) || (child.validate && !child.validate())) continue;
    if (!/a\)/.test(child.phenotype.meridianExpr) || !/a\)/.test(child.phenotype.crossExpr)) continue;   // skip plain spheres
    seen.add(key);
    pop.push(child);
}
// Shuffle so the parent isn't conspicuously top-left; remember where it went.
const order = [4, 0, 7, 2, 5, 8, 1, 6, 3];
const grid = order.map(i => pop[i]);
palette = PALETTES.petal;
const gridImgs = grid.map(ind => render3D(ind, 150));
const LIKED = new Set([grid.indexOf(parent), 6]);
const LOCKED = new Set([2]);

// --- the type fan: other types that extend Individual ----------------------
const FAN = [
    { cls: 'PetalSphere3DIndividual', is3D: true, pal: 'petal', use: parent },
    { cls: 'EndlessFormsIndividual', is3D: true, pal: 'sunset' },
    { cls: 'RobotIndividual', pal: 'sunset' },
    { cls: 'DrumMachineIndividual', pal: 'sunset' },
    { cls: 'CatIndividual', pal: 'teal' },
    { cls: 'CartoonFaceIndividual', pal: 'viridis' },
    { cls: 'HoxCreatureIndividual', pal: 'sunset' },
    { cls: 'SITCodeIndividual', pal: 'plasma' },
];
const fanImgs = FAN.map((f, i) => {
    reseed(SEED * 1000 + i * 17 + 3);
    palette = PALETTES[f.pal];
    const ind = f.use || valid(classes[f.cls]);
    return f.is3D ? render3D(ind, 150) : render2D(ind, 150);
});

// --- real trace entries + phenotype from the parent ------------------------
const traceKeys = Object.keys(parent.genome);
// A structural name is a call-site path; shown as the loop-counter address it
// encodes (e.g. root/generator/expand/for:0/expand/for:2/… → "0.2").
// Shown as its loop counters plus the call, e.g. "for:0/for:2/randint".
const shortName = k => [...(k.match(/for@[\d.]+:\d+/g) || []).map(m => 'for:' + m.split(':')[1]), parent.genome[k].funName].join('/');
// The highlighted entry is a real mutation: the first trace position at which
// some child in the grid differs from the parent.
let mutKey = null, mutVal = null;
for (const ch of pop.slice(1)) {
    // (not the first or last entry, so it can sit mid-window, level with mutate())
    const k = traceKeys.slice(1, -1).find(k => ch.genome[k] && ch.genome[k].val !== parent.genome[k].val);
    if (k) { mutKey = k; mutVal = ch.genome[k].val; break; }
}
const mi = Math.max(1, Math.min(traceKeys.length - 2, mutKey ? traceKeys.indexOf(mutKey) : 1));
const TRACE = [mi - 1, mi, mi + 1].map(i => traceKeys[i]).map(k => ({
    name: shortName(k), val: parent.genome[k].val, to: k === mutKey ? mutVal : null }));
const PHENO = parent.phenotype;
console.log(`parent: ${JSON.stringify(PHENO)}  (${traceKeys.length} trace entries)`);

// ---------------------------------------------------------------------------
// SVG drawing helpers
const W = 1000, H = 640;
const FONT = "'Avenir Next', Avenir, 'Helvetica Neue', Helvetica, sans-serif";
const MONO = "Menlo, 'DejaVu Sans Mono', monospace";
const C = {
    ink: '#2b2f3a', muted: '#6b7280',
    front: { fill: '#eaf2fc', stroke: '#3b7dd8', ink: '#1f5bb0' },
    frame: { fill: '#fff4e2', stroke: '#e3962b', ink: '#a8620b' },
    indiv: { fill: '#e7f6ec', stroke: '#2e9e5b', ink: '#1d7343' },
    pto: { fill: '#f1ebfb', stroke: '#7a4fc9', ink: '#5a35a0' },
    evo: '#e5484d', edit: '#0e9aa7', code: '#c0398c', minor: '#9aa1ad',
};
const SW = 5;          // the one "friendly" stroke weight for panels
const out = [];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const rect = (x, y, w, h, { r = 14, fill = 'none', stroke = 'none', sw = SW, dash = '', extra = '' } = {}) =>
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''} ${extra}/>`);
const text = (x, y, s, { size = 14, weight = 500, fill = C.ink, anchor = 'start', font = FONT, italic = false } = {}) =>
    out.push(`<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''} fill="${fill}" text-anchor="${anchor}">${s}</text>`);
const image = (x, y, w, h, href, r = 8) => {
    const id = `clip${out.length}`;
    out.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>`);
    out.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${href}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`);
};

/**
 * Orthogonal arrow through waypoints with rounded corners and a solid head.
 * `pts` = [[x,y], ...]; the head sits on the last point.
 */
function arrow(pts, color, { w = 4, r = 12, head = 1, dash = '', start = false } = {}) {
    const hl = 6 + w * 2.2 * head, hw = 4 + w * 1.6 * head;
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const dx = last[0] - prev[0], dy = last[1] - prev[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const P = pts.map(p => p.slice());
    P[P.length - 1] = [last[0] - ux * hl * 0.8, last[1] - uy * hl * 0.8];
    let d = `M ${P[0][0]} ${P[0][1]}`;
    for (let i = 1; i < P.length - 1; i++) {
        const a = P[i - 1], b = P[i], c = P[i + 1];
        const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
        const rr = Math.min(r, l1 / 2, l2 / 2);
        const p1 = [b[0] - (b[0] - a[0]) / l1 * rr, b[1] - (b[1] - a[1]) / l1 * rr];
        const p2 = [b[0] + (c[0] - b[0]) / l2 * rr, b[1] + (c[1] - b[1]) / l2 * rr];
        d += ` L ${p1[0]} ${p1[1]} Q ${b[0]} ${b[1]} ${p2[0]} ${p2[1]}`;
    }
    d += ` L ${P[P.length - 1][0]} ${P[P.length - 1][1]}`;
    out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
    const tip = last, bx = last[0] - ux * hl, by = last[1] - uy * hl;
    out.push(`<path d="M ${tip[0]} ${tip[1]} L ${bx - uy * hw} ${by + ux * hw} L ${bx + uy * hw} ${by - ux * hw} Z" fill="${color}" stroke="${color}" stroke-width="${Math.max(1.5, w / 2)}" stroke-linejoin="round"/>`);
    if (start) out.push(`<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="${w * 0.9 + 1.5}" fill="${color}"/>`);
}

/** A label sitting on a white pill, so it reads over lines. */
function pill(x, y, s, { color = C.ink, size = 13, weight = 600, font = FONT, bg = '#ffffff', anchor = 'middle', charW = 0.56 } = {}) {
    const w = s.replace(/&[a-z]+;/g, 'x').length * size * charW + 14, h = size + 9;
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    rect(x0, y - h / 2, w, h, { r: h / 2, fill: bg, stroke: color, sw: 1.6 });
    text(x0 + w / 2, y + size * 0.36, s, { size, weight, fill: color, anchor: 'middle', font });
}

// --- icons ---
const heart = (cx, cy, s, fill) => out.push(`<path transform="translate(${cx},${cy}) scale(${s / 24})" d="M0 8 C -14 -2 -10 -14 -3 -12 C -1 -11.4 0 -9.5 0 -8.5 C 0 -9.5 1 -11.4 3 -12 C 10 -14 14 -2 0 8 Z" fill="${fill}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>`);
const padlock = (cx, cy, s, fill) => {
    out.push(`<g transform="translate(${cx},${cy}) scale(${s / 24})">`
        + `<path d="M -6 -2 V -7 A 6 6 0 0 1 6 -7 V -2" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>`
        + `<path d="M -6 -2 V -7 A 6 6 0 0 1 6 -7 V -2" fill="none" stroke="${fill}" stroke-width="3.6" stroke-linecap="round"/>`
        + `<rect x="-10" y="-3" width="20" height="15" rx="4" fill="${fill}" stroke="#ffffff" stroke-width="2.5"/>`
        + `<circle cx="0" cy="4" r="2.2" fill="#ffffff"/></g>`);
};
const die = (x, y, s, color) => {
    out.push(`<g transform="translate(${x},${y}) rotate(-12)"><rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.22}" fill="#ffffff" stroke="${color}" stroke-width="3"/>`
        + [[-1, -1], [1, 1], [0, 0], [1, -1], [-1, 1]].map(([i, j]) => `<circle cx="${i * s * 0.25}" cy="${j * s * 0.25}" r="${s * 0.085}" fill="${color}"/>`).join('') + '</g>');
};
const toggle = (x, y, on, color) => {
    rect(x, y - 8, 28, 16, { r: 8, fill: on ? color : '#ffffff', stroke: on ? color : C.minor, sw: 2 });
    out.push(`<circle cx="${on ? x + 20 : x + 8}" cy="${y}" r="5" fill="${on ? '#ffffff' : C.minor}"/>`);
};

// ---------------------------------------------------------------------------
// Layout. Rows of the Individual column line up with the boxes they talk to on
// either side, so the arrows between the columns are straight wherever possible.
const TOP = 82;                                  // panels' top edge
const BOT = 626;                                 // panels' bottom edge
const LANE_CODE = 54, LANE_EDIT = 66;            // the two thin lanes over the panels
const COL = {
    front: { x: 16, w: 240 },
    frame: { x: 300, w: 214 },
    indiv: { x: 578, w: 182 },
    pto: { x: 806, w: 178 },
};
const gapX = (a, b) => (a.x + a.w + b.x) / 2;
// Individual rows (y offsets from TOP) — the spine everything else aligns to.
const ROW = {
    code: { y: 16, h: 34, lines: ['editableSections()'], color: C.code },
    ops: { y: 84, h: 84, lines: ['setGene(name, v)', 'mutate(rate)', 'crossover(other)'], color: C.evo },
    pheno: { y: 184, h: 34, lines: ['this.phenotype'], color: C.evo },
    flags: { y: 232, h: 34, lines: ['is3D() · uses…()'], color: C.frame.stroke },
    vis: { y: 280, h: 52, lines: ['visualize(canvas)', 'describe()'], color: C.evo },
};
const lineY = (r, j) => TOP + r.y + (r.lines.length === 1 ? r.h / 2 + 4.5 : 22 + j * 21);   // text baseline
const lineMid = (r, j) => lineY(r, j) - 4.5;                                                    // arrow height for a line
const IND_H = 346;

const panelTitle = (c, title, sub, col) => {
    text(c.x + c.w / 2, 24, title, { size: 19, weight: 700, fill: col.ink, anchor: 'middle' });
    text(c.x + c.w / 2, 41, sub, { size: 11.5, weight: 500, fill: C.muted, anchor: 'middle', font: MONO });
};

// ===== 1. Browser front-end ==================================================
{
    const c = COL.front;
    panelTitle(c, 'Browser front-end', 'index.html · ui/', C.front);
    rect(c.x, TOP, c.w, BOT - TOP, { fill: C.front.fill, stroke: C.front.stroke });
    for (let i = 0; i < 3; i++) out.push(`<circle cx="${c.x + 20 + i * 15}" cy="${TOP + 18}" r="4.5" fill="${C.front.stroke}" opacity="${0.35 + i * 0.2}"/>`);
    // toolbar: the two interactions that bypass selection
    c.codeChip = [c.x + 62, TOP + 50];
    c.editChip = [c.x + 172, TOP + 50];
    // population grid
    const g = { x: c.x + 15, y: TOP + 84, t: 66, gap: 6 };
    grid.forEach((_, i) => {
        const x = g.x + (i % 3) * (g.t + g.gap), y = g.y + Math.floor(i / 3) * (g.t + g.gap);
        image(x, y, g.t, g.t, gridImgs[i], 9);
        const sel = LIKED.has(i) ? C.evo : LOCKED.has(i) ? C.front.ink : null;
        rect(x, y, g.t, g.t, { r: 9, stroke: sel || '#c9d6ea', sw: sel ? 3.5 : 1.5 });
        if (LIKED.has(i)) heart(x + g.t - 13, y + 14, 22, C.evo);
        if (LOCKED.has(i)) padlock(x + g.t - 13, y + 15, 19, C.front.ink);
    });
    g.w = 3 * g.t + 2 * g.gap;
    g.bottom = g.y + g.w;
    c.grid = g;
    text(g.x + g.w / 2, g.bottom + 24, 'a population of one type', { size: 13, weight: 600, fill: C.front.ink, anchor: 'middle' });
    // badges
    const ly = g.bottom + 54;
    heart(c.x + 28, ly - 2, 18, C.evo); text(c.x + 44, ly + 4, 'click: like', { size: 12.5 });
    padlock(c.x + 28, ly + 24, 16, C.front.ink); text(c.x + 44, ly + 30, 'shift-click: lock', { size: 12.5 });
    // arrow legend
    const ky = BOT - 78;
    rect(c.x + 12, ky - 20, c.w - 24, 86, { r: 10, fill: '#ffffff', stroke: 'none' });
    [[C.evo, 5, 'evolution loop'], [C.edit, 3, 'direct edit (heritable)'], [C.code, 3, 'code edit (search space)']].forEach(([col, w, s], i) => {
        const y = ky + i * 24;
        out.push(`<line x1="${c.x + 24}" y1="${y}" x2="${c.x + 54}" y2="${y}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`);
        text(c.x + 64, y + 4.5, s, { size: 12.5 });
    });
}

// ===== 2. Framework ==========================================================
{
    const c = COL.frame;
    panelTitle(c, 'Framework', 'framework/ · modalities/', C.frame);
    rect(c.x, TOP, c.w, BOT - TOP, { fill: C.frame.fill, stroke: C.frame.stroke });
    // EA card
    const e = { x: c.x + 13, y: TOP + 14, w: c.w - 26, h: 166 };
    rect(e.x, e.y, e.w, e.h, { r: 12, fill: '#ffffff', stroke: C.frame.stroke, sw: 2.5 });
    text(e.x + 12, e.y + 25, 'Evolutionary algorithm', { size: 14, weight: 700, fill: C.frame.ink });
    ['carry over locked tiles', 'parents from liked tiles', 'crossover + mutate', 'admit if new &amp; valid'].forEach((s, i) => {
        const y = e.y + 54 + i * 28;
        out.push(`<circle cx="${e.x + 21}" cy="${y - 4}" r="9.5" fill="${C.frame.fill}" stroke="${C.frame.stroke}" stroke-width="2"/>`);
        text(e.x + 21, y + 0.5, String(i + 1), { size: 11, weight: 700, fill: C.frame.ink, anchor: 'middle' });
        text(e.x + 38, y + 0.5, s, { size: 13 });
    });
    c.ea = e;
    // capability flags card — the Individual's flags row points into it
    const f = { x: c.x + 13, y: TOP + 192, w: c.w - 26, h: 128 };
    rect(f.x, f.y, f.w, f.h, { r: 12, fill: '#ffffff', stroke: C.frame.stroke, sw: 2.5 });
    text(f.x + 12, f.y + 25, 'Capability flags', { size: 14, weight: 700, fill: C.frame.ink });
    [['is3D', true], ['usesColorPalette', true], ['usesPhoto', false], ['animatesContinuously', false]].forEach(([n, on], i) => {
        const y = f.y + 46 + i * 21;
        toggle(f.x + 12, y, on, C.frame.stroke);
        text(f.x + 48, y + 4.5, n, { size: 11, font: MONO, fill: on ? C.ink : C.muted });
    });
    c.flags = f;
    // shared outputs + services
    const m = { x: c.x + 13, y: f.y + f.h + 10, w: c.w - 26 };
    m.h = BOT - 13 - m.y;
    rect(m.x, m.y, m.w, m.h, { r: 12, fill: '#ffffff', stroke: C.frame.stroke, sw: 2.5 });
    text(m.x + 12, m.y + 25, 'Shared outputs', { size: 14, weight: 700, fill: C.frame.ink });
    const chip = (x, y, s, w = 80) => {
        rect(x, y, w, 22, { r: 11, fill: C.frame.fill, stroke: 'none' });
        text(x + w / 2, y + 15.5, s, { size: 12, weight: 600, fill: C.frame.ink, anchor: 'middle' });
    };
    ['2D canvas', 'Three.js', 'MIDI', 'Web Audio'].forEach((s, i) => chip(m.x + 12 + (i % 2) * 86, m.y + 34 + Math.floor(i / 2) * 27, s));
    text(m.x + 12, m.y + 106, 'Shared services', { size: 14, weight: 700, fill: C.frame.ink });
    ['Palette', 'Photo', 'AudioClip', 'Transport', 'Save / load', 'Share link'].forEach((s, i) => chip(m.x + 12 + (i % 2) * 86, m.y + 116 + Math.floor(i / 2) * 27, s));
    c.mod = m;
}

// ===== 3. The Individual API =================================================
{
    const c = COL.indiv;
    panelTitle(c, 'Individual', 'framework/Individual.js', C.indiv);
    const b = { x: c.x, y: TOP, w: c.w, h: IND_H };
    rect(b.x, b.y, b.w, b.h, { fill: C.indiv.fill, stroke: C.indiv.stroke });
    for (const r of Object.values(ROW)) {
        const y = TOP + r.y;
        rect(b.x + 12, y, b.w - 24, r.h, { r: 9, fill: '#ffffff', stroke: 'none' });
        out.push(`<rect x="${b.x + 12}" y="${y}" width="5" height="${r.h}" rx="2.5" fill="${r.color}"/>`);
        r.lines.forEach((l, j) => text(b.x + 27, lineY(r, j), esc(l), {
            size: 12.5, font: MONO, fill: (r === ROW.ops && j === 0) ? C.edit : C.ink,
        }));
    }
    // the fan of concrete types, converging up into the base class
    const tz = 40, gap = 8, fx = c.x + (c.w - (4 * tz + 3 * gap)) / 2, fy = b.y + b.h + 62;
    const waist = [b.x + b.w / 2, b.y + b.h];
    for (let i = 0; i < 4; i++) {
        const x = fx + i * (tz + gap) + tz / 2;
        out.push(`<path d="M ${x} ${fy} C ${x} ${fy - 26}, ${waist[0]} ${waist[1] + 40}, ${waist[0]} ${waist[1] + 18}" fill="none" stroke="${C.indiv.stroke}" stroke-width="2.2" opacity="0.6"/>`);
    }
    out.push(`<path d="M ${waist[0]} ${waist[1] + 2} L ${waist[0] + 11} ${waist[1] + 19} L ${waist[0] - 11} ${waist[1] + 19} Z" fill="#ffffff" stroke="${C.indiv.stroke}" stroke-width="3" stroke-linejoin="round"/>`);
    text(waist[0] + 20, waist[1] + 32, 'extends', { size: 12, weight: 600, fill: C.indiv.ink, italic: true });
    FAN.forEach((f, i) => {
        const x = fx + (i % 4) * (tz + gap), y = fy + Math.floor(i / 4) * (tz + gap);
        image(x, y, tz, tz, fanImgs[i], 7);
        rect(x, y, tz, tz, { r: 7, stroke: i === 0 ? C.front.stroke : '#c9d3cc', sw: i === 0 ? 3.5 : 1.3 });
    });
    const fb = fy + 2 * tz + gap;
    text(c.x + c.w / 2, fb + 20, '38 types, each supplying', { size: 12.5, weight: 600, fill: C.indiv.ink, anchor: 'middle' });
    text(c.x + c.w / 2, fb + 37, 'a generator + visualize()', { size: 12.5, weight: 600, fill: C.indiv.ink, anchor: 'middle' });
}

// ===== 4. PTO =================================================================
{
    const c = COL.pto;
    panelTitle(c, 'PTO', 'representations/', C.pto);
    rect(c.x, TOP, c.w, BOT - TOP, { fill: C.pto.fill, stroke: C.pto.stroke });
    const ix = c.x + 12, iw = c.w - 24;
    // generator card, level with editableSections()
    const g = { x: ix, y: TOP + ROW.code.y - 6, w: iw, h: 46 };
    rect(g.x, g.y, g.w, g.h, { r: 12, fill: '#ffffff', stroke: C.pto.stroke, sw: 2.5 });
    text(g.x + 12, g.y + 20, 'generator(rnd)', { size: 13.5, weight: 700, font: MONO, fill: C.pto.ink });
    text(g.x + 12, g.y + 37, 'randint · choice · …', { size: 11, font: MONO, fill: C.muted });
    die(g.x + g.w - 4, g.y + 2, 24, C.pto.stroke);
    c.gen = g;
    // run → record
    arrow([[c.x + c.w / 2, g.y + g.h + 3], [c.x + c.w / 2, TOP + ROW.ops.y - 4]], C.pto.stroke, { w: 2.5 });
    text(c.x + c.w / 2 + 9, g.y + g.h + 20, 'record', { size: 11.5, weight: 600, fill: C.pto.ink, italic: true });
    // trace tape, one entry level with each of setGene / mutate / crossover
    const t = { x: ix, y: TOP + ROW.ops.y, w: iw, h: ROW.ops.h };
    rect(t.x, t.y, t.w, t.h, { r: 10, fill: '#ffffff', stroke: C.pto.stroke, sw: 2.5 });
    TRACE.forEach((e, i) => {
        const y = lineMid(ROW.ops, i), mut = e.to !== null;
        if (mut) rect(t.x + 4, y - 9.5, t.w - 8, 19, { r: 6, fill: '#fde7e8', stroke: 'none' });   // the mutated entry
        const room = mut ? 14 : 17;
        let nm = e.name; if (nm.length > room) nm = '…' + nm.slice(-(room - 1));
        text(t.x + 10, y + 4, esc(nm), { size: 10.5, font: MONO, fill: C.muted });
        text(t.x + t.w - 11, y + 4.5, mut ? `${e.val}→${e.to}` : String(e.val), { size: 12.5, weight: 700, font: MONO, fill: mut ? C.evo : C.pto.ink, anchor: 'end' });
    });
    text(t.x + 2, t.y + t.h + 18, 'trace = genome', { size: 12.5, weight: 700, fill: C.pto.ink });
    c.trace = t;
    // replay → phenotype
    const p = { x: ix, y: TOP + ROW.flags.y - 6, w: iw, h: 92 };
    arrow([[c.x + c.w / 2, t.y + t.h + 26], [c.x + c.w / 2, p.y - 3]], C.pto.stroke, { w: 2.5 });
    text(c.x + c.w / 2 + 9, t.y + t.h + 42, 'replay', { size: 11.5, weight: 600, fill: C.pto.ink, italic: true });
    rect(p.x, p.y, p.w, p.h, { r: 12, fill: '#ffffff', stroke: C.pto.stroke, sw: 2.5 });
    text(p.x + 12, p.y + 22, 'phenotype', { size: 13.5, weight: 700, fill: C.pto.ink });
    const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
    text(p.x + 12, p.y + 44, esc('r₁ = ' + clip(PHENO.meridianExpr, 16)), { size: 11, font: MONO });
    text(p.x + 12, p.y + 62, esc('r₂ = ' + clip(PHENO.crossExpr, 16)), { size: 11, font: MONO });
    text(p.x + 12, p.y + 80, 'opaque to the framework', { size: 10.5, fill: C.muted, italic: true });
    c.pheno = p;
    // the generic-operators note
    const ny = p.y + p.h + 40;
    ['PTO implicitly designs', 'the operators per problem', 'with structural alignment'].forEach((s, i) =>
        text(c.x + c.w / 2, ny + i * 18, s, { size: 12.5, weight: 600, fill: C.pto.ink, anchor: 'middle' }));
}

// ===== Arrows ==================================================================
{
    const F = COL.front, R = COL.frame, I = COL.indiv, P = COL.pto;
    const ops = ROW.ops;
    // --- the evolution loop (bold) ---
    const eaY = R.ea.y + 74;
    arrow([[F.x + F.w - 2, eaY], [R.x + 2, eaY]], C.evo, { w: 5 });                                  // tiles → EA
    pill(gapX(F, R), eaY - 22, 'likes', { color: C.evo, size: 11.5 });
    const breedY = (lineMid(ops, 1) + lineMid(ops, 2)) / 2;
    arrow([[R.x + R.w - 2, breedY], [I.x + 2, breedY]], C.evo, { w: 5 });                             // EA → mutate/crossover
    arrow([[I.x + I.w - 2, breedY], [P.trace.x + 2, breedY]], C.evo, { w: 5 });                       // → act on the trace
    const phY = TOP + ROW.pheno.y + ROW.pheno.h / 2, gx = gapX(I, P);
    arrow([[P.pheno.x + 2, P.pheno.y + 28], [gx, P.pheno.y + 28], [gx, phY], [I.x + I.w - 2, phY]], C.evo, { w: 5 });   // phenotype → Individual
    const visY = TOP + ROW.vis.y + ROW.vis.h / 2, gl = gapX(R, I) + 4;
    arrow([[I.x + 2, visY], [gl, visY], [gl, R.mod.y + 30], [R.mod.x + R.mod.w - 2, R.mod.y + 30]], C.evo, { w: 5 });   // visualize → outputs
    const tilesY = F.grid.y + F.grid.t * 2.5 + F.grid.gap * 2, gf = gapX(F, R);
    arrow([[R.mod.x + 2, R.mod.y + 50], [gf, R.mod.y + 50], [gf, tilesY], [F.grid.x + F.grid.w + 4, tilesY]], C.evo, { w: 5 });   // outputs → tiles
    pill(gf, (R.mod.y + 50 + tilesY) / 2, 'draw', { color: C.evo, size: 11.5 });

    // --- capability flags, read by the framework ---
    const flY = TOP + ROW.flags.y + ROW.flags.h / 2;
    arrow([[I.x + 2, flY], [R.flags.x + R.flags.w + 3, flY]], C.frame.stroke, { w: 2.5, dash: '0.5 6' });

    // --- direct edit and code edit: thin, over the top ---
    const [cx, cy] = F.codeChip, [ex, ey] = F.editChip;
    const codeDown = I.x - 30, editDown = I.x - 46;
    arrow([[cx, cy - 12], [cx, LANE_CODE], [codeDown, LANE_CODE], [codeDown, lineMid(ROW.code, 0)], [I.x + 2, lineMid(ROW.code, 0)]], C.code, { w: 3, r: 10 });
    arrow([[ex, ey - 12], [ex, LANE_EDIT], [editDown, LANE_EDIT], [editDown, lineMid(ops, 0)], [I.x + 2, lineMid(ops, 0)]], C.edit, { w: 3, r: 10 });
    arrow([[I.x + I.w - 2, lineMid(ROW.code, 0)], [P.gen.x + 2, lineMid(ROW.code, 0)]], C.code, { w: 3 });
    arrow([[I.x + I.w - 2, lineMid(ops, 0)], [P.trace.x + 2, lineMid(ops, 0)]], C.edit, { w: 3 });
    // chips last, so the lanes start under them
    pill(cx, cy, '{ } code editor', { color: C.code, size: 12.5 });
    pill(ex, ey, '✎ zoom &amp; edit', { color: C.edit, size: 12.5 });
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${out.join('\n')}
</svg>`;

const svgPath = OUT.replace(/\.pdf$/i, '') + '.svg';
fs.writeFileSync(svgPath, svg);
console.log(`wrote ${svgPath}`);
try {
    execFileSync('rsvg-convert', ['-f', 'pdf', '-o', OUT, svgPath]);
    console.log(`wrote ${OUT}`);
    if (WANT_PNG) {
        const pngPath = OUT.replace(/\.pdf$/i, '') + '.png';
        execFileSync('rsvg-convert', ['-z', '2', '-o', pngPath, svgPath]);
        console.log(`wrote ${pngPath}`);
    }
} catch (e) {
    console.error('rsvg-convert failed (is librsvg installed?):', e.message);
    process.exitCode = 1;
}
fs.rmSync(TMP, { recursive: true, force: true });

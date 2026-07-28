#!/usr/bin/env node
/**
 * jenn-preview.js — render a JennPolytope shape's stereographic projection to a PNG,
 * headless (no browser). Dev tool for eyeballing the 4D geometry — e.g. checking the
 * concentric-ring / zig-zag look of the duoprisms and grand antiprism against Jenn3d.
 *
 * It reuses the app's *real* geometry (`jennGeometry`, loaded via the test harness's
 * vm sandbox) and the same SLERP-on-S³ + stereographic projection the individual uses,
 * so what you see is the actual 1-skeleton — just drawn as flat edge-only lines
 * (orthographic, viewed down z) instead of the 3D tube/glass render, which is exactly
 * the Jenn3d "wireframe" idiom.
 *
 * Usage:
 *   node scripts/jenn-preview.js <shape> [outfile.png] [--rot a,b,c,d,e,f] [--scale s]
 * Shapes: the_5_cell the_8_cell the_16_cell the_24_cell the_600_cell
 *         the_grand_antiprism  duoprism:PxQ   (e.g. duoprism:10x4)
 *
 * Examples:
 *   node scripts/jenn-preview.js duoprism:10x4 /tmp/duo.png --rot 0,0,0.5,0,0,0
 *   node scripts/jenn-preview.js the_grand_antiprism /tmp/ga.png --scale 0.8
 *
 * Depth cueing is on: each edge segment is shaded by its camera-facing depth (near
 * = dark/opaque, far = pale) and drawn back-to-front, so overlapping structure reads
 * the way the real 3D render does — essential for busy shapes (600-cell, grand
 * antiprism) where a flat single-tone wireframe just tangles. `--flat` disables it.
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const { jennGeometry } = load();

// --- args ---
const args = process.argv.slice(2);
if (!args.length || args[0] === '-h' || args[0] === '--help') {
    console.log('usage: node scripts/jenn-preview.js <shape> [out.png] [--rot a,..,f] [--scale s]');
    console.log('shapes: the_5_cell the_8_cell the_16_cell the_24_cell the_600_cell');
    console.log('        the_grand_antiprism  duoprism:PxQ');
    process.exit(0);
}
const shapeArg = args[0];
const out = (args[1] && !args[1].startsWith('--')) ? args[1] : `${shapeArg.replace(':', '_')}.png`;
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const rot = flag('--rot', '0,0,0.5,0,0,0').split(',').map(Number);
const scale = Number(flag('--scale', '1.0'));

// --- resolve shape (+ duoprism p,q) ---
let shape = shapeArg, p, q;
const duo = shapeArg.match(/^duoprism:(\d+)x(\d+)$/);
if (duo) { shape = 'the_duoprism'; p = +duo[1]; q = +duo[2]; }
const { verts, edges } = jennGeometry(shape, p, q);

// --- S³ helpers (same math as the individual) ---
const norm4 = v => { const n = Math.hypot(v[0], v[1], v[2], v[3]) || 1; return [v[0] / n, v[1] / n, v[2] / n, v[3] / n]; };
function slerp(a, b, t) {
    let d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
    const om = Math.acos(d); if (om < 1e-6) return a.slice();
    const so = Math.sin(om), c0 = Math.sin((1 - t) * om) / so, c1 = Math.sin(t * om) / so;
    return norm4([c0 * a[0] + c1 * b[0], c0 * a[1] + c1 * b[1], c0 * a[2] + c1 * b[2], c0 * a[3] + c1 * b[3]]);
}
function project(v, s) { const d = Math.max(1 - v[3], 1e-4); return [v[0] / d * s, v[1] / d * s, v[2] / d * s]; }
function rotate4(v, r) {
    const planes = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    const o = v.slice();
    for (let k = 0; k < 6; k++) {
        const [a, b] = planes[k], c = Math.cos(r[k] || 0), s = Math.sin(r[k] || 0);
        const va = o[a], vb = o[b]; o[a] = va * c - vb * s; o[b] = va * s + vb * c;
    }
    return o;
}

// --- render edge-only, orthographic down z, depth-cued back-to-front ---
const W = 500, H = 500;
const img = new Raster(W, H);
const rv = verts.map(v => rotate4(v, rot));
const cx = W / 2, cy = H / 2, sc = Math.min(W, H) / (2 * 3.4);
const flat = args.includes('--flat');

// Collect every edge sub-segment with its mid-depth (projected z: +toward camera),
// then paint far → near so nearer rods sit on top. Depth maps to grey + alpha, so
// the front structure reads dark and the back recedes — the cue the flat wireframe
// throws away (and what lets the antiprism zig-zag bands separate from the tangle).
const segs = [];
let zmin = Infinity, zmax = -Infinity;
for (const [i, j] of edges) {
    const a = rv[i], b = rv[j];
    const K = 24;
    let prev = null;
    for (let s = 0; s <= K; s++) {
        const p3 = project(slerp(a, b, s / K), scale);
        const cur = { X: cx + p3[0] * sc, Y: cy - p3[1] * sc, z: p3[2] };
        if (prev) {
            const z = (prev.z + cur.z) / 2;
            segs.push({ x0: prev.X, y0: prev.Y, x1: cur.X, y1: cur.Y, z });
            if (z < zmin) zmin = z; if (z > zmax) zmax = z;
        }
        prev = cur;
    }
}
segs.sort((p, q) => p.z - q.z);   // far first
const span = (zmax - zmin) || 1;
for (const s of segs) {
    const t = flat ? 0.5 : (s.z - zmin) / span;   // 0 far … 1 near
    const grey = flat ? 30 : Math.round(200 - 185 * t);   // far pale → near dark
    const alpha = flat ? 0.55 : 0.35 + 0.6 * t;
    img.line(s.x0, s.y0, s.x1, s.y1, [grey, grey, grey], alpha);
    if (!flat && t > 0.6) img.line(s.x0, s.y0 + 1, s.x1, s.y1 + 1, [grey, grey, grey], alpha * 0.7); // thicken near rods
}
img.save(out);
console.log(`wrote ${out}  (${shapeArg}: ${verts.length} verts, ${edges.length} edges)`);

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

// --- render edge-only, orthographic down z ---
const W = 500, H = 500;
const img = new Raster(W, H);
const rv = verts.map(v => rotate4(v, rot));
const cx = W / 2, cy = H / 2, sc = Math.min(W, H) / (2 * 3.4);
for (const [i, j] of edges) {
    const a = rv[i], b = rv[j];
    const K = 24;
    let prev = null;
    for (let s = 0; s <= K; s++) {
        const pt = project(slerp(a, b, s / K), scale);
        const X = cx + pt[0] * sc, Y = cy - pt[1] * sc;
        if (prev) img.line(prev[0], prev[1], X, Y, [30, 30, 30], 0.55);
        prev = [X, Y];
    }
}
img.save(out);
console.log(`wrote ${out}  (${shapeArg}: ${verts.length} verts, ${edges.length} edges)`);

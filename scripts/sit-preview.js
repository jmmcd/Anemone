#!/usr/bin/env node
/**
 * sit-preview.js — render a grid of random Leeuwenberg-code figures to one PNG,
 * headless (no browser). Dev tool for eyeballing what the generator in
 * `SITCodeIndividual` / `SITCode3DIndividual` actually draws, and for sanity-
 * checking a generator edit before opening the app.
 *
 * It uses the app's *real* code, loaded through the test harness's vm sandbox:
 * the same PTO generator, the same `SITLanguage` evaluator, the same turtle. 2D
 * figures are drawn directly; 3D figures use the individual's own orthographic
 * fallback projection, which is enough to judge whether a code went spatial.
 *
 * Usage:
 *   node scripts/sit-preview.js [2d|3d] [out.png] [--n 16] [--size 240] [--seed]
 *
 * Examples:
 *   node scripts/sit-preview.js 2d /tmp/sit2d.png --n 25 --size 200
 *   node scripts/sit-preview.js 3d /tmp/sit3d.png
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('usage: node scripts/sit-preview.js [2d|3d] [out.png] [--n 16] [--size 240]');
    process.exit(0);
}
const mode = (args[0] === '3d') ? '3d' : '2d';
const out = (args[1] && !args[1].startsWith('--')) ? args[1] : `sit-${mode}.png`;
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
const n = flag('--n', 16);
const size = flag('--size', 240);

const { classes } = load();
const Type = mode === '3d' ? classes.SITCode3DIndividual : classes.SITCodeIndividual;

const cols = Math.ceil(Math.sqrt(n));
const rows = Math.ceil(n / cols);
const raster = new Raster(cols * size, rows * size);

// Palette stand-in: the harness's Palette stub is a flat orange ramp, so colour
// here by position instead — enough to read a contour's direction of travel.
const ramp = (t) => [Math.round(30 + 200 * t), Math.round(90 + 120 * (1 - t)), Math.round(200 - 120 * t)];

for (let i = 0; i < n; i++) {
    // Mirror EvolutionaryAlgorithm.createValidIndividual: the app only ever
    // shows figures that pass validate(), so the preview must too.
    let ind = new Type();
    for (let attempt = 0; attempt < 100 && !ind.validate(); attempt++) ind = new Type();
    const ox = (i % cols) * size, oy = Math.floor(i / cols) * size;
    let segs;
    if (mode === '3d') {
        // Orthographic view of the 3D contour (same projection as the fallback).
        const cY = Math.cos(0.6), sY = Math.sin(0.6), cX = Math.cos(0.4), sX = Math.sin(0.4);
        const pr = (p) => [p[0] * cY - p[2] * sY, p[1] * cX - (p[0] * sY + p[2] * cY) * sX];
        segs = [];
        for (const l of ind.polylines()) {
            for (let j = 0; j < l.pts.length - 1; j++) {
                const a = pr(l.pts[j]), b = pr(l.pts[j + 1]);
                segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], t: l.ts[Math.min(j, l.ts.length - 1)] });
            }
        }
    } else {
        segs = ind.marks();
    }
    const load_ = ind.getPhenotype();
    console.log(`#${i}  ${load_}`);
    if (!segs.length) continue;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of segs) {
        minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2);
        minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2);
    }
    const m = 10, dw = maxX - minX, dh = maxY - minY;
    const sc = Math.min(dw > 0 ? (size - 2 * m) / dw : 1, dh > 0 ? (size - 2 * m) / dh : 1);
    const px = ox + (size - dw * sc) / 2 - minX * sc;
    const py = oy + (size - dh * sc) / 2 - minY * sc;
    for (const s of segs) {
        raster.line(s.x1 * sc + px, s.y1 * sc + py, s.x2 * sc + px, s.y2 * sc + py, ramp(s.t), 0.85);
    }
    // Tile border.
    for (let x = 0; x < size; x++) { raster.setPixel(ox + x, oy, [220, 220, 220]); raster.setPixel(ox + x, oy + size - 1, [220, 220, 220]); }
    for (let y = 0; y < size; y++) { raster.setPixel(ox, oy + y, [220, 220, 220]); raster.setPixel(ox + size - 1, oy + y, [220, 220, 220]); }
}

raster.save(out);
console.log(`wrote ${out}`);

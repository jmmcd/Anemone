#!/usr/bin/env node
/**
 * face-preview.js — render CartoonFaceIndividual to a PNG contact sheet, headless.
 *
 * The test harness's canvas context draws nothing, so this is the only way to see
 * a 2D type offline. It builds the *real* individuals through the harness sandbox
 * and calls their real visualize(), against the mini Canvas2D in ./lib/canvas2d.js.
 *
 * Usage:
 *   node scripts/face-preview.js [out.png] [--n 9] [--size 220] [--type Name]
 *   node scripts/face-preview.js out.png --lookalike [--rate 0.15]
 *
 *     --n          number of faces in the grid (default 9)
 *     --size       per-face pixel size before supersampling (default 220)
 *     --ss         supersampling factor (default 3)
 *     --seed       ignored; faces are random each run
 *     --type       any Canvas2D individual class name (default CartoonFaceIndividual)
 *     --lookalike  the Mii Channel's step: parent top-left, then mutants of it
 *     --rate       mutation rate for --lookalike (default 0.15)
 *
 * Examples:
 *   node scripts/face-preview.js /tmp/faces.png --n 16
 *   node scripts/face-preview.js /tmp/lookalike.png --lookalike --rate 0.2
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { MiniContext, downsample } = require('./lib/canvas2d');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('usage: node scripts/face-preview.js [out.png] [--n 9] [--size 220] [--ss 3] [--type Name] [--lookalike [--rate 0.15]]');
    process.exit(0);
}
const out = (args[0] && !args[0].startsWith('--')) ? args[0] : 'faces.png';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const N = Math.max(1, parseInt(flag('--n', '9'), 10));
const SIZE = parseInt(flag('--size', '220'), 10);
const SS = Math.max(1, parseInt(flag('--ss', '3'), 10));
const TYPE = flag('--type', 'CartoonFaceIndividual');
const LOOKALIKE = args.includes('--lookalike');
const RATE = parseFloat(flag('--rate', '0.15'));

const { classes } = load();
const Cls = classes[TYPE];
if (!Cls) {
    console.error(`unknown individual type: ${TYPE}`);
    process.exit(1);
}

// --- the population to draw -------------------------------------------------
const faces = [];
if (LOOKALIKE) {
    // The Mii Channel's second screen: one parent, then mutants of it. With PTO's
    // fine operators a small rate creeps the placement genes and occasionally
    // resamples a part type — which is exactly what "choose a look-alike" showed.
    const parent = new Cls();
    faces.push(parent);
    for (let i = 1; i < N; i++) {
        const child = parent.clone();   // mutate() is in-place, so clone first
        child.mutate(RATE);
        faces.push(child);
    }
} else {
    for (let i = 0; i < N; i++) faces.push(new Cls());
}

// --- contact sheet ----------------------------------------------------------
const cols = Math.ceil(Math.sqrt(faces.length));
const rows = Math.ceil(faces.length / cols);
const big = new Raster(cols * SIZE * SS, rows * SIZE * SS, 255);

// One context for the whole sheet, repositioned per cell: its coverage mask is a
// full-raster buffer, so one per cell would be a lot of memory for nothing.
const ctx = new MiniContext(big, SS, 0, 0);
const canvas = { width: SIZE, height: SIZE, getContext: () => ctx };

faces.forEach((ind, i) => {
    ctx.ox = (i % cols) * SIZE * SS;
    ctx.oy = Math.floor(i / cols) * SIZE * SS;
    ctx.m = [1, 0, 0, 1, 0, 0];
    ctx.globalAlpha = 1;
    ind.visualize(canvas);
});

const img = downsample(big, SS, Raster);

// Hairlines between cells, so the grid reads as a grid.
for (let c = 1; c < cols; c++) {
    for (let y = 0; y < img.height; y++) img.setPixel(c * SIZE, y, [140, 148, 156], 1);
}
for (let r = 1; r < rows; r++) {
    for (let x = 0; x < img.width; x++) img.setPixel(x, r * SIZE, [140, 148, 156], 1);
}

img.save(out);
console.log(`${out}  (${faces.length} x ${TYPE}${LOOKALIKE ? `, look-alike of #1 at rate ${RATE}` : ''})`);
faces.forEach((f, i) => console.log(`  ${i + 1}. ${f.getPhenotype()}`));

#!/usr/bin/env node
/**
 * sketch-preview.js — render a contact sheet of random ReflectiveSketch drawings
 * to one PNG, headless (no browser). Uses the app's real generator, construction
 * and rasteriser, loaded through the test harness's vm sandbox.
 *
 * Usage:
 *   node scripts/sketch-preview.js [out.png] [--n 16] [--size 256] [--mutants]
 *
 * --mutants: the first tile is a random parent and the rest are its mutants
 * (at the app's default mutation rate) — a quick look at heritability.
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
const out = (args[0] && !args[0].startsWith('--')) ? args[0] : 'sketch.png';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
const n = flag('--n', 16);
const size = flag('--size', 256);
const mutants = args.includes('--mutants');

const { classes } = load();
const Type = classes.ReflectiveSketchIndividual;

const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), gap = 4;
const raster = new Raster(cols * (size + gap) + gap, rows * (size + gap) + gap, 200);

let parent = null;
for (let i = 0; i < n; i++) {
    let ind;
    if (!mutants) { do { ind = new Type(); } while (!ind.validate()); }
    else if (i === 0) { do { ind = new Type(); } while (!ind.validate()); parent = ind; }
    else { ind = parent.clone(); ind.mutate(0.1); }
    const img = { data: new Uint8ClampedArray(size * size * 4), width: size, height: size };
    Type.paint(img, ind.drawing(), ind.phenotype);
    const ox = gap + (i % cols) * (size + gap), oy = gap + Math.floor(i / cols) * (size + gap);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const s = (y * size + x) * 4, d = ((oy + y) * raster.width + ox + x) * 3;
            raster.buf[d] = img.data[s]; raster.buf[d + 1] = img.data[s + 1]; raster.buf[d + 2] = img.data[s + 2];
        }
    }
    console.log(`${String(i + 1).padStart(2)}. ${ind.getPhenotype()}`);
}
raster.save(out);
console.log(`wrote ${out}`);

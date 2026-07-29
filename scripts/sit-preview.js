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
 *   node scripts/sit-preview.js [2d|3d|solid] [out.png] [--n 16] [--size 240]
 *
 * `solid` renders the real mesh from generate3DPoints() — lofted surfaces and
 * tubes — with flat Lambert shading and a painter's-algorithm depth sort. It is
 * the only way to check the skinned parallel structures (the paper's
 * generalised cylinders and vases) without opening a browser; the wireframe
 * `3d` mode cannot show whether a branch family became a surface.
 *
 * Examples:
 *   node scripts/sit-preview.js 2d /tmp/sit2d.png --n 25 --size 200
 *   node scripts/sit-preview.js solid /tmp/sit3d.png
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('usage: node scripts/sit-preview.js [2d|3d] [out.png] [--n 16] [--size 240]');
    process.exit(0);
}
const mode = (args[0] === '3d' || args[0] === 'solid') ? args[0] : '2d';
const out = (args[1] && !args[1].startsWith('--')) ? args[1] : `sit-${mode}.png`;
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : def; };
const n = flag('--n', 16);
const size = flag('--size', 240);

const { classes } = load();
const Type = mode === '2d' ? classes.SITCodeIndividual : classes.SITCode3DIndividual;

// Camera shared by the 3D modes: a fixed three-quarter orthographic view.
const cY = Math.cos(0.6), sY = Math.sin(0.6), cX = Math.cos(0.4), sX = Math.sin(0.4);
const view = (p) => {
    const x = p[0] * cY - p[2] * sY, z1 = p[0] * sY + p[2] * cY;
    return [x, p[1] * cX - z1 * sX, p[1] * sX + z1 * cX];   // [x, y, depth]
};

/** Flat-shaded, depth-sorted triangle soup into a tile of the raster. */
function drawSolid(raster, mesh, ox, oy, size) {
    const V = mesh.vertices, I = mesh.indices;
    if (!I.length) return;
    const p = [];
    for (let i = 0; i < V.length; i += 3) p.push(view([V[i], V[i + 1], V[i + 2]]));
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const q of p) {
        mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]);
        mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]);
    }
    const m = 8, dw = mxx - mnx || 1, dh = mxy - mny || 1;
    const sc = Math.min((size - 2 * m) / dw, (size - 2 * m) / dh);
    const px = ox + (size - dw * sc) / 2 - mnx * sc, py = oy + (size - dh * sc) / 2 - mny * sc;
    // Depth is scaled like x and y, so screen-space face normals are meaningful.
    const S = p.map(q => [q[0] * sc + px, q[1] * sc + py, q[2] * sc]);

    const tris = [];
    for (let i = 0; i < I.length; i += 3) {
        const a = S[I[i]], b = S[I[i + 1]], c = S[I[i + 2]];
        if (!a || !b || !c) continue;
        tris.push({ a, b, c, z: (a[2] + b[2] + c[2]) / 3 });
    }
    tris.sort((u, v) => u.z - v.z);   // painter's: far first

    for (const t of tris) {
        // Screen-space normal gives a cheap Lambert term; z-extent shades depth.
        const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], uz = t.b[2] - t.a[2];
        const vx = t.c[0] - t.a[0], vy = t.c[1] - t.a[1], vz = t.c[2] - t.a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        const lambert = Math.abs((nx * 0.4 + ny * -0.5 + nz * 0.75) / len);
        const shade = 0.25 + 0.75 * lambert;
        const col = [Math.round(40 + 150 * shade), Math.round(70 + 140 * shade), Math.round(120 + 120 * shade)];
        fillTri(raster, t.a, t.b, t.c, col, ox, oy, size);
    }
}

function fillTri(raster, a, b, c, col, ox, oy, size) {
    const lo = (i) => Math.max(i === 0 ? ox : oy, Math.floor(Math.min(a[i], b[i], c[i])));
    const hi = (i) => Math.min((i === 0 ? ox : oy) + size - 1, Math.ceil(Math.max(a[i], b[i], c[i])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = lo(1); y <= hi(1); y++) {
        for (let x = lo(0); x <= hi(0); x++) {
            const w0 = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / area;
            const w1 = ((c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0])) / area;
            const w2 = ((a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0])) / area;
            if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) raster.setPixel(x, y, col);
        }
    }
}

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
    console.log(`#${i}  ${ind.getPhenotype()}`);
    if (mode === 'solid') {
        drawSolid(raster, ind.generate3DPoints(), ox, oy, size);
        for (let x = 0; x < size; x++) { raster.setPixel(ox + x, oy, [220, 220, 220]); raster.setPixel(ox + x, oy + size - 1, [220, 220, 220]); }
        for (let y = 0; y < size; y++) { raster.setPixel(ox, oy + y, [220, 220, 220]); raster.setPixel(ox + size - 1, oy + y, [220, 220, 220]); }
        continue;
    }
    let segs;
    if (mode === '3d') {
        const pr = (p) => view(p);
        segs = [];
        for (const l of ind.polylines(true)) {
            for (let j = 0; j < l.pts.length - 1; j++) {
                const a = pr(l.pts[j]), b = pr(l.pts[j + 1]);
                segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], t: l.ts[Math.min(j, l.ts.length - 1)] });
            }
        }
    } else {
        segs = ind.marks();
    }
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

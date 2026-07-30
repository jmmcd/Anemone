#!/usr/bin/env node
/**
 * endlessforms-preview.js — render an EndlessFormsIndividual's voxel sculpture to a
 * PNG, headless (no browser). Dev tool for eyeballing the CPPN-evolved 3D forms the
 * shared Three.js pipeline draws in the app — the only way to see one offline.
 *
 * It reuses the app's *real* geometry: it constructs the actual individual via the
 * test-harness vm sandbox and calls its generate3DPoints() (the same voxel mesh the
 * browser renders), then flat-shades it with a tiny z-buffered triangle rasteriser
 * (orthographic, one directional light) onto the shared PNG raster. So what you see
 * is the true occupancy mesh, just software-rendered instead of via WebGL.
 *
 * Usage:
 *   node scripts/endlessforms-preview.js [out.png] [--n 6] [--rot rx,ry] [--size 500]
 *     --n     render the first N valid forms into an N-up contact sheet (default 6)
 *     --rot   view rotation in radians, "x,y" (default 0.5,0.7)
 *     --size  per-cell pixel size (default 320)
 *
 * Examples:
 *   node scripts/endlessforms-preview.js /tmp/ef.png --n 9
 *   node scripts/endlessforms-preview.js /tmp/one.png --n 1 --rot 0.3,1.2
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const { classes } = load();
const EF = classes.EndlessFormsIndividual;

// --- args ---
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('usage: node scripts/endlessforms-preview.js [out.png] [--n 6] [--rot rx,ry] [--size 320]');
    process.exit(0);
}
const out = (args[0] && !args[0].startsWith('--')) ? args[0] : 'endlessforms.png';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const N = Math.max(1, parseInt(flag('--n', '6'), 10));
const [rx, ry] = flag('--rot', '0.5,0.7').split(',').map(Number);
const S = parseInt(flag('--size', '320'), 10);

// --- collect N valid forms ---
const forms = [];
for (let a = 0; a < 4000 && forms.length < N; a++) {
    const ind = new EF();
    if (ind.validate()) forms.push(ind);
}
if (!forms.length) { console.error('no valid forms produced'); process.exit(1); }

// --- contact-sheet layout ---
const cols = Math.ceil(Math.sqrt(forms.length));
const rows = Math.ceil(forms.length / cols);
const img = new Raster(cols * S, rows * S, 20);

// --- flat-shaded, z-buffered rasteriser (orthographic down -z) ---
const cosX = Math.cos(rx), sinX = Math.sin(rx), cosY = Math.cos(ry), sinY = Math.sin(ry);
const rotate = (x, y, z) => {
    // Y then X.
    let x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
    let y2 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
    return [x1, y2, z2];
};
const LIGHT = (() => { const l = [0.4, 0.7, 0.6]; const n = Math.hypot(...l); return l.map(v => v / n); })();

function drawForm(ind, ox, oy) {
    const { vertices, indices, colors } = ind.generate3DPoints();
    const zbuf = new Float32Array(S * S).fill(-Infinity);
    // Rotate + find extent for a fit-to-cell scale.
    const nv = vertices.length / 3;
    const rv = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
        const p = rotate(vertices[i], vertices[i + 1], vertices[i + 2]);
        rv.push(p);
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    // Smooth per-vertex normals (accumulate adjacent face normals), mirroring the
    // app's computeVertexNormals(): shared surface-nets vertices → smooth shading;
    // blocky mode's unshared vertices stay flat (the Minecraft facets).
    const nrm = new Float32Array(nv * 3);
    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        const A = rv[a], B = rv[b], C = rv[c];
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
        const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (const i of [a, b, c]) { nrm[i * 3] += nx; nrm[i * 3 + 1] += ny; nrm[i * 3 + 2] += nz; }
    }
    const inten = new Float32Array(nv);
    for (let i = 0; i < nv; i++) {
        let nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        inten[i] = 0.25 + 0.75 * Math.abs(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]); // two-sided
    }

    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const sc = (S * 0.86) / span;
    const cxp = (minX + maxX) / 2, cyp = (minY + maxY) / 2;
    const toPix = p => [ox + S / 2 + (p[0] - cxp) * sc, oy + S / 2 - (p[1] - cyp) * sc];

    for (let t = 0; t < indices.length; t += 3) {
        const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
        const A = rv[ia], B = rv[ib], C = rv[ic];
        const [ax, ay] = toPix(A), [bx, by] = toPix(B), [cxp2, cyp2] = toPix(C);
        const x0 = Math.max(ox, Math.floor(Math.min(ax, bx, cxp2)));
        const x1 = Math.min(ox + S - 1, Math.ceil(Math.max(ax, bx, cxp2)));
        const y0 = Math.max(oy, Math.floor(Math.min(ay, by, cyp2)));
        const y1 = Math.min(oy + S - 1, Math.ceil(Math.max(ay, by, cyp2)));
        const area = (bx - ax) * (cyp2 - ay) - (by - ay) * (cxp2 - ax);
        if (Math.abs(area) < 1e-6) continue;
        for (let py = y0; py <= y1; py++) {
            for (let px = x0; px <= x1; px++) {
                const w0 = ((bx - px) * (cyp2 - py) - (by - py) * (cxp2 - px)) / area;
                const w1 = ((cxp2 - px) * (ay - py) - (cyp2 - py) * (ax - px)) / area;
                const w2 = 1 - w0 - w1;
                if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
                const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
                const zi = (py - oy) * S + (px - ox);
                if (z <= zbuf[zi]) continue;
                zbuf[zi] = z;
                // Smoothly interpolate shade + colour across the triangle (Gouraud).
                const sh = w0 * inten[ia] + w1 * inten[ib] + w2 * inten[ic];
                const r = (w0 * colors[ia * 3] + w1 * colors[ib * 3] + w2 * colors[ic * 3]) * 255 * sh;
                const gg = (w0 * colors[ia * 3 + 1] + w1 * colors[ib * 3 + 1] + w2 * colors[ic * 3 + 1]) * 255 * sh;
                const bb = (w0 * colors[ia * 3 + 2] + w1 * colors[ib * 3 + 2] + w2 * colors[ic * 3 + 2]) * 255 * sh;
                img.setPixel(px, py, [r, gg, bb]);
            }
        }
    }
    console.log(`  cell: ${ind.getPhenotype()}`);
}

forms.forEach((ind, i) => {
    const ox = (i % cols) * S, oy = Math.floor(i / cols) * S;
    drawForm(ind, ox, oy);
});
img.save(out);
console.log(`wrote ${out}  (${forms.length} form(s), ${cols}x${rows})`);

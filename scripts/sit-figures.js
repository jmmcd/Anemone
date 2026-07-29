#!/usr/bin/env node
/**
 * sit-figures.js — render the PAPER'S OWN FIGURES from hand-written Leeuwenberg
 * codes, headless, as one labelled PNG contact sheet.
 *
 * `tests/run.js` asserts the paper's worked examples at the level of the
 * *algebra* — every rule's value sequence, quoted verbatim. This is the
 * companion check at the level of the *figures*: the codes below are
 * transcriptions of the shapes Leeuwenberg (1971) draws, evaluated and
 * interpreted by the real `SITLanguage` engine. If the language is faithful,
 * the pictures come out looking like the paper's pictures — which is something
 * a value-sequence assertion cannot tell you.
 *
 * Angles here are written in degrees, so every code uses family 360 (unit = 1°)
 * except where the shape wants a coarser grid.
 *
 * Usage:  node scripts/sit-figures.js [out.png] [--size 300]
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
const out = (args[0] && !args[0].startsWith('--')) ? args[0] : 'sit-figures.png';
const sizeFlag = args.indexOf('--size');
const size = sizeFlag >= 0 ? Number(args[sizeFlag + 1]) : 300;

const { classes } = load();

// The figures themselves live in tests/paper-figures.js, shared with the test
// suite so the sheet and the assertions can never drift apart.
const { FIGURES } = require(path.join(__dirname, '..', 'tests', 'paper-figures.js'));

// --- a 3x5 bitmap font, so the sheet is self-labelling -----------------------
const GLYPHS = {
    '0': '###,#.#,#.#,#.#,###', '1': '..#,..#,..#,..#,..#', '2': '###,..#,###,#..,###',
    '3': '###,..#,###,..#,###', '4': '#.#,#.#,###,..#,..#', '5': '###,#..,###,..#,###',
    '6': '###,#..,###,#.#,###', '7': '###,..#,..#,..#,..#', '8': '###,#.#,###,#.#,###',
    '9': '###,#.#,###,..#,###',
    A: '.#.,#.#,###,#.#,#.#', B: '##.,#.#,##.,#.#,##.', C: '###,#..,#..,#..,###',
    D: '##.,#.#,#.#,#.#,##.', E: '###,#..,##.,#..,###', F: '###,#..,##.,#..,#..',
    G: '###,#..,#.#,#.#,###', H: '#.#,#.#,###,#.#,#.#', I: '###,.#.,.#.,.#.,###',
    J: '..#,..#,..#,#.#,###', K: '#.#,#.#,##.,#.#,#.#', L: '#..,#..,#..,#..,###',
    M: '#.#,###,###,#.#,#.#', N: '#.#,###,###,###,#.#', O: '###,#.#,#.#,#.#,###',
    P: '###,#.#,###,#..,#..', Q: '###,#.#,###,..#,..#', R: '###,#.#,##.,#.#,#.#',
    S: '###,#..,###,..#,###', T: '###,.#.,.#.,.#.,.#.', U: '#.#,#.#,#.#,#.#,###',
    V: '#.#,#.#,#.#,#.#,.#.', W: '#.#,#.#,###,###,#.#', X: '#.#,#.#,.#.,#.#,#.#',
    Y: '#.#,#.#,.#.,.#.,.#.', Z: '###,..#,.#.,#..,###',
    '-': '...,...,###,...,...', ' ': '...,...,...,...,...',
};

function text(raster, str, x, y, scale, col) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
        const g = GLYPHS[ch];
        if (g) {
            const rows = g.split(',');
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 3; c++) {
                    if (rows[r][c] !== '#') continue;
                    for (let dy = 0; dy < scale; dy++) {
                        for (let dx = 0; dx < scale; dx++) {
                            raster.setPixel(cx + c * scale + dx, y + r * scale + dy, col);
                        }
                    }
                }
            }
        }
        cx += 4 * scale;
    }
}

// --- the 3D camera and a flat-shaded painter's-algorithm fill ---------------
const cY = Math.cos(0.6), sY = Math.sin(0.6), cX = Math.cos(0.4), sX = Math.sin(0.4);
const project = (p) => {
    const x = p[0] * cY - p[2] * sY, z1 = p[0] * sY + p[2] * cY;
    return [x, p[1] * cX - z1 * sX, p[1] * sX + z1 * cX];
};

function frame(pts, ox, oy, box, top) {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const q of pts) {
        mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]);
        mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]);
    }
    const m = 12, dw = mxx - mnx || 1, dh = mxy - mny || 1;
    const inner = box - top - m;
    const sc = Math.min((box - 2 * m) / dw, inner / dh);
    return { sc, px: ox + (box - dw * sc) / 2 - mnx * sc, py: oy + top + (inner - dh * sc) / 2 - mny * sc };
}

function drawSolid(raster, mesh, ox, oy, box, top) {
    const V = mesh.vertices, I = mesh.indices;
    if (!I.length) return;
    const p = [];
    for (let i = 0; i < V.length; i += 3) p.push(project([V[i], V[i + 1], V[i + 2]]));
    const f = frame(p, ox, oy, box, top);
    const S = p.map(q => [q[0] * f.sc + f.px, q[1] * f.sc + f.py, q[2] * f.sc]);
    const tris = [];
    for (let i = 0; i < I.length; i += 3) {
        const a = S[I[i]], b = S[I[i + 1]], c = S[I[i + 2]];
        if (a && b && c) tris.push({ a, b, c, z: (a[2] + b[2] + c[2]) / 3 });
    }
    tris.sort((u, v) => u.z - v.z);
    for (const t of tris) {
        const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], uz = t.b[2] - t.a[2];
        const vx = t.c[0] - t.a[0], vy = t.c[1] - t.a[1], vz = t.c[2] - t.a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        const sh = 0.25 + 0.75 * Math.abs((nx * 0.4 + ny * -0.5 + nz * 0.75) / len);
        fillTri(raster, t.a, t.b, t.c,
            [Math.round(40 + 150 * sh), Math.round(70 + 140 * sh), Math.round(120 + 120 * sh)],
            ox, oy, box);
    }
}

function fillTri(raster, a, b, c, col, ox, oy, box) {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(ox, Math.floor(Math.min(a[0], b[0], c[0])));
    const x1 = Math.min(ox + box - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(oy, Math.floor(Math.min(a[1], b[1], c[1])));
    const y1 = Math.min(oy + box - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const w0 = ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) / area;
            const w1 = ((c[0] - b[0]) * (y - b[1]) - (c[1] - b[1]) * (x - b[0])) / area;
            const w2 = ((a[0] - c[0]) * (y - c[1]) - (a[1] - c[1]) * (x - c[0])) / area;
            if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) raster.setPixel(x, y, col);
        }
    }
}

// --- render the sheet -------------------------------------------------------
const cols = 5;
const rows = Math.ceil(FIGURES.length / cols);
const TOP = Math.round(size * 0.09);
const raster = new Raster(cols * size, rows * size);
const INK = [35, 55, 110];

FIGURES.forEach((fig, i) => {
    const ox = (i % cols) * size, oy = Math.floor(i / cols) * size;
    // Force the phenotype: these are hand-written codes, not evolved ones.
    const Type = fig.mode === '2d' ? classes.SITCodeIndividual : classes.SITCode3DIndividual;
    const ind = new Type();
    Object.defineProperty(ind, 'phenotype', { value: { family: fig.family, root: fig.code } });

    text(raster, fig.label, ox + 10, oy + Math.round(TOP * 0.3), Math.max(1, Math.round(size / 150)), [90, 90, 90]);

    if (fig.mode === 'solid') {
        const mesh = ind.generate3DPoints();
        console.log(`${fig.label.padEnd(14)} ${ind.getPhenotype()}`);
        drawSolid(raster, mesh, ox, oy, size, TOP);
    } else {
        const marks = ind.marks();
        console.log(`${fig.label.padEnd(14)} ${ind.getPhenotype()}`);
        const pts = [];
        for (const m of marks) { pts.push([m.x1, -m.y1]); pts.push([m.x2, -m.y2]); }
        if (!pts.length) return;
        const f = frame(pts, ox, oy, size, TOP);
        // Same relative rule as the app: a lone grain reads as a point only when
        // the figure spans many grains (see SITCodeIndividual.visualize).
        const asDots = (size / Math.max(1e-6, f.sc)) > 8;
        const dotR = Math.max(1.5, size / 110);
        for (const m of marks) {
            if (m.dot && asDots) {
                const cx = m.x2 * f.sc + f.px, cy = -m.y2 * f.sc + f.py;
                for (let dy = -dotR; dy <= dotR; dy++) {
                    for (let dx = -dotR; dx <= dotR; dx++) {
                        if (dx * dx + dy * dy <= dotR * dotR) raster.setPixel(Math.round(cx + dx), Math.round(cy + dy), INK);
                    }
                }
                continue;
            }
            raster.line(m.x1 * f.sc + f.px, -m.y1 * f.sc + f.py,
                m.x2 * f.sc + f.px, -m.y2 * f.sc + f.py, INK, 0.9);
        }
    }
    for (let x = 0; x < size; x++) { raster.setPixel(ox + x, oy, [215, 215, 215]); raster.setPixel(ox + x, oy + size - 1, [215, 215, 215]); }
    for (let y = 0; y < size; y++) { raster.setPixel(ox, oy + y, [215, 215, 215]); raster.setPixel(ox + size - 1, oy + y, [215, 215, 215]); }
});

raster.save(out);
console.log(`wrote ${out}`);

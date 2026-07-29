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

// --- code-building shorthand, close to the paper's notation ------------------
const n = (a) => ({ k: 'num', a });
const seq = (...items) => ({ k: 'seq', items });
const chunk = (child) => ({ k: 'chunk', child });
const cont = (child) => ({ k: 'cont', child });                    // ⦃ … ⦄
const iter = (count, child) => ({ k: 'iter', ns: [count], child }); // n·( )
const rep = (count, child) => iter(count, chunk(child));            // n·{ } whole
const rev = (child) => ({ k: 'rev', child });                       // R
const integ = (child) => ({ k: 'int', child });                     // ∫
const abs = (child) => ({ k: 'abs', child });                       // | |
const hide = (child) => ({ k: 'hide', child });                     // ‾ ‾
const outer = (child) => ({ k: 'out', child });                     // ⟨ ⟩
const comb = (a, b) => ({ k: 'comb', a, b });                       // (a)(b)
const par = (rows, opts = {}) => ({
    k: 'par', rows,
    indep: opts.indep || rows.map(() => false),
    every: opts.every || rows.map(() => false),
    skin: opts.skin || rows.map(() => false),
});
// A straight edge of n grains is n·(0) — length is never a primitive.
const run = (len) => iter(len, n(0));
const edge = (angle, len) => seq(n(angle), run(len));

// --- the figures ------------------------------------------------------------
// Each entry: label, family, code, and '2d' | 'solid'.
const FIGURES = [
    // The paper's opening worked example (pp. 310-311), derived step by step
    // from a 64-dot figure down to five information units. Angles are absolute
    // after the ∫, which is what makes the shape a smooth closed blob.
    {
        label: 'FIG 3', mode: '2d', family: 360,
        code: iter(4, integ(seq(n(46), iter(4, rev(seq(n(-23), n(23))))))),
    },
    // Fig. 10a / Table 1 B: a continuation closes the contour into a polygon.
    { label: '10A HEXAGON', mode: '2d', family: 360, code: cont(edge(60, 4)) },
    { label: 'B PENTAGON', mode: '2d', family: 360, code: cont(edge(72, 5)) },
    // Fig. 10c: the same hexagon with its straight runs vanished. The corners
    // still draw, so a dot pattern falls out of one unbroken contour trace.
    { label: '10C DOTS', mode: '2d', family: 360, code: cont(seq(n(60), hide(run(4)))) },
    // Fig. 10f: alternating visible and vanished arcs — a dashed circle.
    { label: '10F DASHES', mode: '2d', family: 360, code: cont(seq(edge(15, 2), hide(edge(15, 2)))) },
    // Fig. 10e: parallel structure. A ring carrying a spoke at every element —
    // "take an element (angle) of the polygon and attach to it a straight line".
    {
        label: '10E HATCH', mode: '2d', family: 360,
        code: par([cont(edge(20, 2)), edge(90, 4)], { every: [false, true] }),
    },
    // Fig. 10i: the castellated line. Combination interleaves the two operands,
    // (0,180)(90) = 0,90,180,90, read as absolute angles.
    {
        label: '10I WAVE', mode: '2d', family: 360,
        code: rep(6, iter(3, abs(comb(seq(n(0), n(180)), seq(n(90)))))),
    },
    // Reversal: the motif then its reverse. SIT's symmetry regularity.
    { label: 'R REVERSAL', mode: '2d', family: 360, code: rep(5, rev(seq(edge(40, 3), edge(-70, 2), edge(30, 4)))) },
    // Table 1 shape S, the cube: a square carrying, at each of its nodes, a
    // square tipped a quarter turn out of the plane.
    {
        label: 'S CUBE', mode: 'solid', family: 4,
        code: par([cont(seq(run(3), n(1))), seq(outer(n(1)), cont(seq(run(3), n(1))))]),
    },
    // Table 1 S-2: the same construction with everything vanished but the
    // corners — a three-dimensional dot pattern.
    {
        label: 'S-2 3D DOTS', mode: 'solid', family: 4,
        code: par([cont(seq(n(1), hide(run(3)))), seq(outer(n(1)), cont(seq(n(1), hide(run(3)))))]),
    },
    // Fig. 10m: the generalised cylinder. A ring carrying a straight profile at
    // every node, the family of profiles lofted into a skin.
    {
        label: '10M CYLINDER', mode: 'solid', family: 360,
        code: par([cont(n(30)), seq(iter(2, outer(n(90))), edge(-90, 6))],
            { every: [false, true], skin: [false, true] }),
    },
    // Table 1 S-3 and U-1…W: a vase. Same construction, but the profile now has
    // a shape, so the sweep is a solid of revolution with a waist.
    {
        label: 'S-3 VASE', mode: 'solid', family: 360,
        code: par([cont(n(30)), seq(iter(2, outer(n(90))),
            edge(-90, 3), edge(35, 2), edge(-45, 3), edge(55, 2), edge(-30, 2))],
            { every: [false, true], skin: [false, true] }),
    },
];

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
const cols = 4;
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
        for (const m of marks) {
            raster.line(m.x1 * f.sc + f.px, -m.y1 * f.sc + f.py,
                m.x2 * f.sc + f.px, -m.y2 * f.sc + f.py, INK, 0.9);
        }
    }
    for (let x = 0; x < size; x++) { raster.setPixel(ox + x, oy, [215, 215, 215]); raster.setPixel(ox + x, oy + size - 1, [215, 215, 215]); }
    for (let y = 0; y < size; y++) { raster.setPixel(ox, oy + y, [215, 215, 215]); raster.setPixel(ox + size - 1, oy + y, [215, 215, 215]); }
});

raster.save(out);
console.log(`wrote ${out}`);

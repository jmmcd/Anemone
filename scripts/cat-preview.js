#!/usr/bin/env node
/**
 * cat-preview.js — render CatIndividual gait cycles to a PNG contact sheet,
 * headless (no browser). The offline QA tool for the animated types.
 *
 * A still frame tells you almost nothing about a walk cycle: the questions that
 * matter are whether the feet stay planted, whether the four legs are actually
 * out of phase, and whether the tail trails the body — all of which are only
 * visible *across* time. So this renders a filmstrip: one row per cat, one
 * column per frame through a single stride, plus the traced path of the near
 * fore foot so foot-slip and swing height are visible at a glance.
 *
 * It calls the individual's real `poseAt(t)` through the test-harness sandbox,
 * so what you see is the app's actual animation, drawn as a skeleton rather than
 * through the canvas draw function (Raster has lines, not filled ellipses — and
 * for checking motion the skeleton is the more informative picture anyway).
 *
 * Usage:
 *   node scripts/cat-preview.js [out.png] [--n 4] [--frames 8] [--gait walk] [--size 190]
 *     --n       how many cats (rows), default 4
 *     --frames  frames per stride (columns), default 8
 *     --gait    force every cat to one gait: walk | trot | pace | bound
 *     --size    per-cell pixel size, default 190
 *
 * Examples:
 *   node scripts/cat-preview.js /tmp/cats.png
 *   node scripts/cat-preview.js /tmp/trot.png --gait trot --n 3 --frames 10
 */
const path = require('path');
const { Raster } = require('./lib/png');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('usage: node scripts/cat-preview.js [out.png] [--n 4] [--frames 8] [--gait walk] [--size 190]');
    process.exit(0);
}
const out = (args[0] && !args[0].startsWith('--')) ? args[0] : 'cats.png';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const ROWS = Math.max(1, parseInt(flag('--n', '4'), 10));
const COLS = Math.max(2, parseInt(flag('--frames', '8'), 10));
const SIZE = Math.max(80, parseInt(flag('--size', '190'), 10));
const GAIT = flag('--gait', null);

const { classes } = load();

const INK = [40, 40, 46];
const FUR = [120, 108, 96];
const FOOT = [200, 70, 60];
const TRACE = [150, 180, 210];
const GROUND = [170, 170, 176];

const raster = new Raster(COLS * SIZE, ROWS * SIZE, 250);

// Raster gives us pixels and lines; everything else is a few lines of polyline.
const thick = (x0, y0, x1, y1, colour, w, a = 1) => {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(1e-6, Math.hypot(dx, dy));
    const nx = -dy / len, ny = dx / len;
    for (let o = -w / 2; o <= w / 2; o += 0.5) {
        raster.line(x0 + nx * o, y0 + ny * o, x1 + nx * o, y1 + ny * o, colour, a);
    }
};
const ellipse = (cx, cy, rx, ry, colour, a = 1) => {
    const N = 48;
    for (let i = 0; i < N; i++) {
        const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
        raster.line(cx + rx * Math.cos(t0), cy + ry * Math.sin(t0),
                    cx + rx * Math.cos(t1), cy + ry * Math.sin(t1), colour, a);
    }
};
const dot = (cx, cy, r, colour, a = 1) => {
    for (let y = -r; y <= r; y += 0.5) for (let x = -r; x <= r; x += 0.5) {
        if (x * x + y * y <= r * r) raster.setPixel(cx + x, cy + y, colour, a);
    }
};

// Build the requested cats, forcing the gait if one was asked for.
const cats = [];
while (cats.length < ROWS) {
    const ind = new classes.CatIndividual();
    if (GAIT) {
        const p = Object.assign({}, ind.phenotype, { gait: GAIT });
        Object.defineProperty(ind, 'phenotype', { value: p, configurable: true });
    }
    if (ind.validate()) cats.push(ind);
}

cats.forEach((ind, row) => {
    const P = ind.getParameters();
    const period = 1 / P.stride;                 // seconds for one full stride

    // The near fore foot's path over the whole cycle, drawn faintly behind every
    // frame — the single most informative overlay for judging a gait.
    const trace = [];
    for (let k = 0; k <= 120; k++) {
        const pose = ind.poseAt((k / 120) * period);
        trace.push(pose.legs[0].foot);
    }

    for (let col = 0; col < COLS; col++) {
        const ox = col * SIZE, oy = row * SIZE;
        const X = (u) => ox + SIZE / 2 + u * SIZE;
        const Y = (v) => oy + SIZE * 0.55 + v * SIZE;

        // cell border
        for (let x = 0; x < SIZE; x++) raster.setPixel(ox + x, oy, [225, 225, 230]);
        for (let y = 0; y < SIZE; y++) raster.setPixel(ox, oy + y, [225, 225, 230]);

        const pose = ind.poseAt((col / COLS) * period);
        raster.line(ox + 4, Y(pose.groundY), ox + SIZE - 4, Y(pose.groundY), GROUND, 0.8);

        for (let i = 1; i < trace.length; i++) {
            raster.line(X(trace[i - 1][0]), Y(trace[i - 1][1]),
                        X(trace[i][0]), Y(trace[i][1]), TRACE, 0.9);
        }

        const B = pose.body;
        ellipse(X(B.x), Y(B.y), (B.len / 2) * SIZE / B.squash, (B.depth / 2) * SIZE * B.squash, FUR);

        for (const leg of pose.legs) {
            const c = leg.near ? INK : [150, 150, 158];
            thick(X(leg.hip[0]), Y(leg.hip[1]), X(leg.knee[0]), Y(leg.knee[1]), c, 2.5);
            thick(X(leg.knee[0]), Y(leg.knee[1]), X(leg.foot[0]), Y(leg.foot[1]), c, 2.5);
            // A planted foot is filled, a swinging one hollow: foot-slip and
            // duty cycle both become readable straight off the strip.
            dot(X(leg.foot[0]), Y(leg.foot[1]), 2.6, leg.planted ? FOOT : [255, 255, 255]);
            if (!leg.planted) ellipse(X(leg.foot[0]), Y(leg.foot[1]), 2.6, 2.6, FOOT);
        }

        for (let i = 1; i < pose.tail.length; i++) {
            thick(X(pose.tail[i - 1][0]), Y(pose.tail[i - 1][1]),
                  X(pose.tail[i][0]), Y(pose.tail[i][1]), FUR, 2);
        }

        const H = pose.head;
        ellipse(X(H.x), Y(H.y), H.r * SIZE, H.r * SIZE * 0.92, INK);
        dot(X(H.x + H.r * 0.42), Y(H.y - H.r * 0.15), Math.max(1, H.r * SIZE * 0.16 * H.eyeOpen), INK);
    }

    console.log(`row ${row}: ${P.gait} @ ${P.stride.toFixed(2)} Hz, step ${P.step.toFixed(3)}, ` +
                `duty ${P.duty.toFixed(2)}, ${P.tailSegs}-segment tail`);
});

raster.save(out);
console.log(`wrote ${out} (${COLS * SIZE}x${ROWS * SIZE})`);

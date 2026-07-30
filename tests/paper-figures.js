/**
 * paper-figures.js — Leeuwenberg's own figures, transcribed as codes.
 *
 * These are hand-written transcriptions of the shapes in Leeuwenberg (1971):
 * figure 10 (p. 317, codes given pp. 318-320) and Table 1 (pp. 321-329). They
 * are the *figure-level* specification of `SITLanguage.js`, complementing the
 * algebra assertions in run.js — a value-sequence test cannot tell you whether
 * the language draws the paper's pictures.
 *
 * Shared deliberately by two consumers so they can never drift apart:
 *   - tests/run.js          asserts each figure's `checks`
 *   - scripts/sit-figures.js renders them all to a labelled contact sheet
 *
 * Angles are written in degrees, so codes use family 360 (one unit = 1°) unless
 * a shape wants a coarser grid.
 *
 * `checks` is an optional { marks(marks), skins(families) } of predicates given
 * the interpreted figure; each returns a string on failure, nothing on success.
 * `status` is 'match' for figures we believe reproduce the paper, or a short
 * note naming the discrepancy — kept honest rather than quietly omitted.
 */

// --- notation shorthand -----------------------------------------------------
const n = (a) => ({ k: 'num', a });
const seq = (...items) => ({ k: 'seq', items });                    // ( )
const chunk = (child) => ({ k: 'chunk', child });                   // { }
const brk = (child) => ({ k: 'brk', child });                       // [ ]
const brkall = (child) => ({ k: 'brkall', child });                 // ⟦ ⟧
const cont = (child) => ({ k: 'cont', child });                     // ⦃ ⦄ serial
const parcont = (child, opts = {}) => ({ k: 'parcont', child, ...opts }); // vertical ⦃ ⦄
const iter = (count, child) => ({ k: 'iter', ns: [count], child }); // n·( )
const rep = (count, child) => iter(count, chunk(child));            // n·{ }
const rev = (child) => ({ k: 'rev', child });                       // R
const integ = (child) => ({ k: 'int', child });                     // ∫
const pm = (child) => ({ k: 'pm', child });                         // ±
const abs = (child) => ({ k: 'abs', child });                       // | |
const hide = (child) => ({ k: 'hide', child });                     // ‾ ‾
const outer = (child) => ({ k: 'out', child });                     // ⟨ ⟩
const comb = (a, b) => ({ k: 'comb', a, b });                       // (a)(b)
const op = (o, a, b) => ({ k: 'op', op: o, a, b });                 // + × * ⊛
const par = (rows, o = {}) => ({
    k: 'par', rows,
    indep: o.indep || rows.map(() => false),
    every: o.every || rows.map(() => false),
    skin: o.skin || rows.map(() => false),
});
// Length is never a primitive: a straight edge of n grains is n·(0).
const run = (len) => iter(len, n(0));
const edge = (angle, len) => seq(n(angle), run(len));

// --- small check helpers ----------------------------------------------------
const bounds = (marks) => {
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const m of marks) {
        lo[0] = Math.min(lo[0], m.x1, m.x2); hi[0] = Math.max(hi[0], m.x1, m.x2);
        lo[1] = Math.min(lo[1], m.y1, m.y2); hi[1] = Math.max(hi[1], m.y1, m.y2);
    }
    return { lo, hi, w: hi[0] - lo[0], h: hi[1] - lo[1] };
};
const closes = (marks, tol = 1e-6) => {
    if (!marks.length) return 'no marks';
    const a = marks[0], z = marks[marks.length - 1];
    if (Math.hypot(z.x2 - a.x1, z.y2 - a.y1) > tol) return 'contour does not close';
};
// Dots are counted by DISTINCT POSITION, which is what "the paper shows k dots"
// means: a parallel continuation's copies all leave the same point, so their
// leading grains stack there and read as one (Table 1 J is five dots, drawn by
// eight coincident marks).
const dotCount = (marks) => new Set(
    marks.filter(m => m.dot).map(m => `${m.x1.toFixed(3)},${m.y1.toFixed(3)}`)).size;
const lineCount = (marks) => marks.filter(m => !m.dot).length;
const wantDots = (k) => (marks) => {
    const d = dotCount(marks);
    if (d !== k) return `expected ${k} dots, got ${d} (and ${lineCount(marks)} strokes)`;
};
// Greedy spatial clustering of the dots, for the hierarchical figures (P, Q):
// returns groups of dot positions within `tol` of one another.
const clusters = (marks, tol) => {
    const pts = [...new Set(marks.filter(m => m.dot).map(m => `${m.x1.toFixed(2)},${m.y1.toFixed(2)}`))]
        .map(k => k.split(',').map(Number));
    const out = [];
    for (const p of pts) {
        const hit = out.find(c => c.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol));
        if (hit) hit.push(p); else out.push([p]);
    }
    return out;
};
// Distinct segment directions, rounded to the degree.
const dirs = (marks) => new Set(marks.filter(m => !m.dot)
    .map(m => Math.round(Math.atan2(m.y2 - m.y1, m.x2 - m.x1) * 180 / Math.PI)));

const FIGURES = [

    // =======================================================================
    // Figure 10 (p. 317); codes from pp. 318-320.
    // =======================================================================
    {
        id: '10a', label: '10A HEXAGON', page: 318, family: 360, mode: '2d',
        note: '⦃a,n·(0)⦄ — a serial continuation closes the contour',
        code: cont(edge(60, 4)),
        status: 'match',
        checks: { marks: (m) => closes(m) || (dirs(m).size === 6 ? undefined : `expected 6 edge directions, got ${dirs(m).size}`) },
    },
    {
        id: '10b', label: '10B ASTERISK', page: 318, family: 360, mode: '2d',
        note: 'the SAME code under vertical (parallel) continuation — a rosette about one point',
        code: parcont(edge(45, 4)),
        status: 'match',
        checks: {
            marks: (m) => {
                // Eight spokes, all radiating from the common origin.
                const d = dirs(m);
                if (d.size !== 8) return `expected 8 spoke directions, got ${d.size}`;
                const b = bounds(m);
                const cx = (b.lo[0] + b.hi[0]) / 2, cy = (b.lo[1] + b.hi[1]) / 2;
                // Every spoke's inner end sits at the shared centre.
                const inner = m.filter(k => Math.hypot(k.x1 - cx, k.y1 - cy) < 0.5);
                if (inner.length !== 8) return `expected 8 spokes from a common point, got ${inner.length}`;
            },
        },
    },
    {
        id: '10c', label: '10C DOTS', page: 318, family: 360, mode: '2d',
        note: '⦃a,‾n·(0)‾⦄ — the hexagon with its runs vanished: six dots',
        code: cont(seq(n(60), hide(run(6)))),
        status: 'match',
        checks: { marks: wantDots(6) },
    },
    {
        id: '10d', label: '10D SEGMENTS', page: 318, family: 360, mode: '2d',
        note: '10c carrying b,p·(0) at each surviving node — dots plus short strokes',
        code: par([cont(seq(n(60), hide(run(6)))), edge(50, 3)]),
        status: 'match',
        checks: {
            marks: (m) => {
                if (dotCount(m) !== 6) return `expected 6 vertex dots, got ${dotCount(m)}`;
                if (lineCount(m) !== 6 * 4) return `expected 6 strokes of 4 grains, got ${lineCount(m)}`;
            },
        },
    },
    {
        id: '10e', label: '10E HATCH', page: 318, family: 360, mode: '2d',
        note: '⦃a,n·(0)⦄ over b,p·(0) — the paper\'s literal code: a spoke at EVERY element',
        // Every element of the polygon carries a branch, so in the trace every
        // trunk grain is left alone between two excursions — and a lone grain is
        // a dot. The polygon therefore never draws as an outline: 10e is a ring
        // of dots, each with a stroke radiating outward, which is precisely the
        // figure. No vanishing sign is needed, and none is written.
        code: par([cont(edge(60, 6)), edge(-90, 3)], { every: [false, true] }),
        status: 'match',
        checks: {
            marks: (m) => {
                // 6 sides × 7 elements: a dot each, and a 4-grain stroke each.
                if (dotCount(m) !== 42) return `expected a dot at every element, got ${dotCount(m)}`;
                if (lineCount(m) !== 42 * 4) return `expected ${42 * 4} stroke grains, got ${lineCount(m)}`;
                // The strokes radiate OUTWARD from the implicit polygon.
                const b = bounds(m);
                const cx = (b.lo[0] + b.hi[0]) / 2, cy = (b.lo[1] + b.hi[1]) / 2;
                for (const k of m) {
                    if (k.dot) continue;
                    if (Math.hypot(k.x2 - cx, k.y2 - cy) <= Math.hypot(k.x1 - cx, k.y1 - cy)) {
                        return 'strokes should radiate outward from the implicit polygon';
                    }
                }
            },
        },
    },
    {
        id: '10f', label: '10F PARALLEL', page: 319, family: 360, mode: '2d',
        note: '10c ‖ b,p·(0) — the ‖ makes every stroke parallel, independent of the polygon',
        code: par([cont(seq(n(60), hide(run(6)))), edge(30, 3)], { indep: [false, true] }),
        status: 'match',
        checks: {
            marks: (m) => {
                if (dotCount(m) !== 6) return `expected 6 dots, got ${dotCount(m)}`;
                // Independence of angles: all six strokes point the same way.
                if (dirs(m).size !== 1) return `strokes should be parallel, got ${dirs(m).size} directions`;
            },
        },
    },
    {
        id: '10g', label: '10G STAR+SPIRAL', page: 319, family: 360, mode: '2d',
        note: '⟦≈a,n·(0)≈⟧ ⊛ ⟦|k·(70)|⟧ — a line holding a constant 70° to a star\'s radials',
        code: op('@', parcont(edge(15, 3)), brkall(abs(iter(60, n(70))))),
        status: 'match',
        checks: {
            marks: (m) => {
                // The star (24 radials × 4 grains) plus the 60-grain line.
                if (m.length !== 24 * 4 + 60) return `expected star + line, got ${m.length} marks`;
                const line = m.slice(24 * 4);
                const r0 = Math.hypot(line[0].x2, line[0].y2);
                const r1 = Math.hypot(line[line.length - 1].x2, line[line.length - 1].y2);
                if (r1 <= r0 * 3) return `the line should spiral outward (r ${r0.toFixed(1)} → ${r1.toFixed(1)})`;
            },
        },
    },
    {
        id: '10h', label: '10H SPIRAL', page: 319, family: 360, mode: '2d',
        note: 'as 10g with the star vanished — "once the star pattern has transferred its '
            + 'directional function on the line, the star as such can vanish"',
        code: op('@', hide(parcont(edge(15, 3))), brkall(abs(iter(60, n(70))))),
        status: 'match',
        checks: {
            marks: (m) => {
                if (m.length !== 60) return `the star should not draw; got ${m.length} marks`;
                const r = m.map(k => Math.hypot(k.x2, k.y2));
                for (let i = 1; i < r.length; i++) {
                    if (r[i] <= r[i - 1]) return `radius should grow monotonically (step ${i})`;
                }
                // A curve holding a constant angle to the radius vector is the
                // equiangular spiral, whose defining property is dr/ds = cos(angle).
                // The spread comes from the field being quantised to the nearest
                // radial (24 of them, so ±7.5°), and shrinks as the star densifies.
                const d = [];
                for (let i = 6; i < r.length; i++) d.push(r[i] - r[i - 1]);
                const mean = d.reduce((x, y) => x + y, 0) / d.length;
                const want = Math.cos(70 * Math.PI / 180);
                if (Math.abs(mean - want) > 0.08) {
                    return `dr/ds should be cos(70°) = ${want.toFixed(3)}, got ${mean.toFixed(3)}`;
                }
            },
        },
    },
    {
        id: '10i', label: '10I SQUARE WAVE', page: 320, family: 360, mode: '2d',
        note: 'm·⟦(|0,180|)(|90|)⟧ — combination interleaves to 0,90,180,90, read absolutely',
        code: rep(4, iter(3, abs(comb(seq(n(0), n(180)), seq(n(90)))))),
        status: 'match',
        checks: {
            marks: (m) => {
                const d = [...dirs(m)].map(x => Math.abs(x) === 180 ? 180 : x).sort((a, b) => a - b);
                if (d.length !== 3) return `a square wave uses 3 directions, got ${d.join(',')}`;
            },
        },
    },

    // =======================================================================
    // Table 1, the two-dimensional shapes (pp. 321-323).
    // =======================================================================
    {
        id: 'A', label: 'A GRAIN', page: 321, family: 360, mode: '2d',
        note: '(0) — the elementary length. I = 0: no information at all',
        code: n(0), status: 'match',
        checks: { marks: (m) => (m.length === 1 ? undefined : `a grain is one mark, got ${m.length}`) },
    },
    {
        id: 'B', label: 'B LINE', page: 321, family: 360, mode: '2d',
        note: 'n·(0), n = 5 — a straight line. I = 1',
        code: run(5), status: 'match',
        checks: { marks: (m) => (dirs(m).size === 1 ? undefined : 'a line has one direction') },
    },
    {
        id: 'C', label: 'C DOT ROW', page: 321, family: 360, mode: '2d',
        note: '(n·(0)){‾n·(0)‾} — five dots in a row, from one trace whose runs vanished',
        code: comb(run(5), chunk(hide(run(5)))),
        status: 'match',
        checks: { marks: wantDots(5) },
    },
    {
        id: 'D', label: 'D CIRCLE', page: 321, family: 360, mode: '2d',
        note: '⦃a⦄{n·(0)} — a continuation of the angle alone, each combined with a side',
        code: comb(cont(n(24)), chunk(run(3))),
        status: 'match',
        checks: { marks: (m) => closes(m, 1e-6) },
    },
    {
        id: 'E', label: 'E SQUARE', page: 322, family: 360, mode: '2d',
        note: 'same as D with a = 90 deg',
        code: comb(cont(n(90)), chunk(run(4))),
        status: 'match',
        checks: {
            marks: (m) => closes(m) || (dirs(m).size === 4 ? undefined : `a square has 4 directions, got ${dirs(m).size}`),
        },
    },
    {
        id: 'F', label: 'F RECTANGLE', page: 322, family: 360, mode: '2d',
        note: '⦃a⦄({n·(0)},{m·(0)}) — alternating side lengths. I = 3',
        code: comb(cont(n(90)), seq(chunk(run(5)), chunk(run(2)))),
        status: 'match',
        checks: {
            marks: (m) => {
                const b = bounds(m);
                if (Math.abs(b.w - b.h) < 1) return `a rectangle should not be square (${b.w}×${b.h})`;
                return closes(m);
            },
        },
    },
    {
        id: 'G', label: 'G DOT CIRCLE', page: 322, family: 360, mode: '2d',
        note: '⦃a⦄{‾n·(0)‾} — D with the sides vanished: a circle OF DOTS (not a dashed circle)',
        code: comb(cont(n(24)), chunk(hide(run(3)))),
        status: 'match',
        checks: { marks: wantDots(15) },
    },
    {
        id: 'H', label: 'H FOUR DOTS', page: 322, family: 360, mode: '2d',
        note: 'same as G with a = 90 deg — the four corners of a square',
        code: comb(cont(n(90)), chunk(hide(run(9)))),
        status: 'match',
        checks: { marks: wantDots(4) },
    },
    {
        id: 'I', label: 'I ASTERISK', page: 322, family: 360, mode: '2d',
        note: '≈a≈ — a bare angle under parallel continuation. I = 1',
        code: parcont(n(45)),
        status: 'match',
        checks: { marks: (m) => (m.length === 8 ? undefined : `expected 8 spokes, got ${m.length}`) },
    },
    {
        id: 'J', label: 'J DOT CROSS', page: 322, family: 360, mode: '2d',
        note: '≈a,‾n·(0)‾,0≈ — a fan of vanished arms leaving a dot at each end. I = 2',
        code: parcont(seq(n(90), hide(run(4)), n(0))),
        status: 'match',
        checks: {
            marks: (m) => {
                // Four arms: their leading grains coincide at the hub, so five dots.
                if (dotCount(m) !== 5) return `J is a centre plus four arms, got ${dotCount(m)} dots`;
            },
        },
    },
    {
        id: 'K', label: 'K SPIRAL', page: 322, family: 360, mode: '2d',
        note: '⟦m·{(a),{n·(0)}}⟧∫ — the ∫ turns a repeated turn into a growing one. I = 4',
        code: integ(brkall(rep(14, comb(seq(n(6)), chunk(run(2)))))),
        status: 'DIFFERS: comes out an arc, not a spiral. The paper\'s ∫ here integrates over the *chunks* left by [ ], which would grow the turn per side; we integrate over the flattened values, which holds it constant.',
    },
    {
        id: 'L', label: 'L ZIGZAG', page: 322, family: 360, mode: '2d',
        note: '6·{±}(a), a = 90 — left-right variation makes the wave. I = 3',
        code: iter(6, chunk(pm(n(90)))),
        status: 'match (structure): ±90 alternation gives a staircase; the paper prints L as a schematic smooth wave',
        checks: {
            marks: (m) => {
                const d = dirs(m);
                if (d.size !== 2) return `a 90° zigzag alternates 2 directions, got ${d.size}`;
            },
        },
    },
    {
        id: 'M', label: 'M STAR POLYGON', page: 323, family: 360, mode: '2d',
        note: '((a)+⟦6·{±}(90)⟧){n·(0)} — a turn added to a zigzag, giving a star. I = 5',
        code: comb(op('+', seq(n(40)), brkall(iter(6, chunk(pm(n(90)))))), chunk(run(2))),
        status: 'match',
    },
    {
        id: 'N', label: 'N WAVY LINE', page: 323, family: 360, mode: '2d',
        note: '3{(n·(±)(a)){n·(0)}} — a run of alternating turns, chunked and repeated. I = 5',
        code: rep(3, comb(iter(4, pm(n(25))), chunk(run(2)))),
        status: 'match',
    },
    {
        id: 'P', label: 'P DOTS OF DOTS', page: 323, family: 360, mode: '2d',
        note: 'G ‖ J — a circle of dots in which every dot is itself a dot-cross. I = 4',
        // The printed formula carries a DOUBLE LINE between its two rows: the ‖
        // independence-of-angles indicator. It is why all six crosses in the
        // figure point the same way instead of rotating with the circle.
        code: par([comb(cont(n(60)), chunk(hide(run(12)))),
        parcont(seq(n(90), hide(run(2)), n(0)))], { indep: [false, true] }),
        status: 'match',
        checks: {
            marks: (m) => {
                if (lineCount(m) !== 0) return `P is all dots, got ${lineCount(m)} strokes`;
                if (dotCount(m) !== 30) return `expected 6 crosses of 5 dots, got ${dotCount(m)}`;
                if (clusters(m, 4).length !== 6) return `expected 6 clusters, got ${clusters(m, 4).length}`;
            },
        },
    },
    {
        id: 'Q', label: 'Q DOTS OF DOTS 2', page: 323, family: 360, mode: '2d',
        note: 'J ‖ G — the same two shapes with the hierarchy inverted. I = 4',
        // Q's printed formula does NOT show the double line that P's carries,
        // but its figure needs it twice over: every cluster is drawn at the same
        // orientation (they would rotate with the trunk's 90° copies), and the
        // centre shows ONE hexagon where four rotated copies would pile up into
        // a 24-dot rosette. Read with ‖, as P is.
        code: par([parcont(seq(n(90), hide(run(14)), n(0))),
        comb(cont(n(60)), chunk(hide(run(1))))], { indep: [false, true] }),
        status: 'match',
        checks: {
            marks: (m) => {
                if (lineCount(m) !== 0) return `Q is all dots, got ${lineCount(m)} strokes`;
                if (dotCount(m) !== 30) return `expected 5 rings of 6 dots, got ${dotCount(m)}`;
                if (clusters(m, 4).length !== 5) return `expected 5 clusters, got ${clusters(m, 4).length}`;
            },
        },
    },
    {
        id: 'R', label: 'R HEX + DIAGONALS', page: 324, family: 360, mode: '2d',
        note: '≈⦃60,n·(0)⦄≈ — the hexagon of 10a under parallel continuation. I = 2',
        code: parcont(cont(edge(60, 4)), { n: 6 }),
        status: 'CLOSE: six hexagons fanned about a shared corner, reading as a hexagon subdivided into rhombi. The paper\'s R is a hexagon with its three long diagonals (six triangles).',
    },

    // =======================================================================
    // Table 1, the three-dimensional shapes (pp. 324-325).
    // =======================================================================
    {
        id: 'S', label: 'S CUBE', page: 324, family: 4, mode: 'solid',
        note: '⦃n·(0),90⦄ over ⟨90⟩,⦃n·(0),90⦄ — a square carrying a tipped square at each node',
        code: par([cont(seq(run(3), n(1))), seq(outer(n(1)), cont(seq(run(3), n(1))))]),
        status: 'match (literal reading: the paper prints an idealised cube)',
    },
    {
        id: 'S-2', label: 'S-2 3D DOTS', page: 324, family: 360, mode: 'solid',
        note: 'J and its outerproduct twin from the same point — a centre and six axis arms, all vanished but their tips',
        // The table writes this "J over ⟨J⟩". We spell the two out-of-plane arms
        // out because our parallel continuation fans WITHIN a plane, so it
        // cannot produce the ±z pair on its own; everything else is J's code
        // unchanged, once with a plain leading angle and once with ⟨ ⟩.
        code: seq(
            parcont(seq(n(90), hide(run(6)), n(0))),
            parcont(seq(outer(n(90)), hide(run(6)), n(0)), { n: 1 }),
            parcont(seq(outer(n(-90)), hide(run(6)), n(0)), { n: 1 })),
        status: 'match',
        checks: {
            segments: (segs) => {
                const pts = [...new Set(segs.map(g => g.a.map(v => v.toFixed(2)).join(',')))]
                    .map(k => k.split(',').map(Number));
                if (pts.length !== 7) return `expected a centre and six arms, got ${pts.length} dots`;
                // One at the origin, six on the axes at equal distance.
                const r = pts.map(p => Math.hypot(p[0], p[1], p[2])).sort((a, b) => a - b);
                if (r[0] > 1e-6) return 'expected a dot at the centre';
                for (let i = 1; i < 7; i++) {
                    if (Math.abs(r[i] - r[1]) > 1e-6) return 'the six arms should be the same length';
                    // Axis-aligned: exactly one coordinate non-zero.
                    const nz = pts[i].filter(v => Math.abs(v) > 1e-6).length;
                    if (nz > 1) return 'each arm should run along one axis';
                }
            },
        },
    },
    {
        id: '10m', label: '10M CYLINDER', page: 320, family: 360, mode: 'solid',
        note: 'a ring carrying a vertical profile at every node, lofted — a generalised cylinder',
        code: par([cont(n(30)), seq(iter(2, outer(n(90))), edge(-90, 6))],
            { every: [false, true], skin: [false, true] }),
        status: 'match',
        checks: {
            skins: (fams) => {
                if (fams.length !== 1) return `expected one lofted surface, got ${fams.length}`;
                if (fams[0].strands.length !== 12) return `expected 12 profiles, got ${fams[0].strands.length}`;
            },
        },
    },
    {
        id: 'S-3', label: 'S-3 VASE', page: 324, family: 360, mode: 'solid',
        note: 'the same, with a shaped profile — a solid of revolution with a waist',
        code: par([cont(n(30)), seq(iter(2, outer(n(90))),
            edge(-90, 3), edge(35, 2), edge(-45, 3), edge(55, 2), edge(-30, 2))],
            { every: [false, true], skin: [false, true] }),
        status: 'match',
    },
];

module.exports = { FIGURES };

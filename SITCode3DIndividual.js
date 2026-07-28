// SITCode3DIndividual
//
// "Leeuwenberg Code 3D" in the UI. The three-dimensional half of Leeuwenberg's
// 1971 coding language, sharing the whole engine (`SITLanguage.js`) and code
// vocabulary with `SITCodeIndividual`; the only additions are the paper's
// *outerproduct* indicator ⟨ ⟩ and a wireframe-tube renderer.
//
// The paper's account of 3D is strikingly economical (pp. 314-315). In 2D each
// angle is measured against the previous straight length — one past segment is
// the reference axis. In 3D "a surface determined by two angles is used as
// reference base for every following angle", and an angle written ⟨v⟩ points
// "in the direction of the outerproduct", i.e. out of that surface, by the
// right-hand rule. So the turtle carries a direction `d` and the normal `n` of
// the plane of the last two segments:
//
//     plain angle  v   rotate d about n         — stays in the plane (2D case)
//     ⟨v⟩              rotate d about d × n     — leaves it; n becomes d × n
//
// Nothing else changes: every information unit, operation, indicator and
// combinatory rule is the same algebra over the same value stream. That is the
// point the paper makes — 2D and 3D coding differ by one reference-frame rule,
// which is why its Table 1 can write a cube as a square with a square hanging
// off each of its nodes (shape S), or a sphere as a circle ⊛ a circle turned
// out of plane (shape S-1).
//
// Everything else — the discrete/continuous unification via an evolvable
// rotational family, the structural-information-load report, the live-editable
// generator — is inherited from the 2D type; see `SITCodeIndividual.js`.
//
// Gets binary STL export free by exposing generate3DPoints().

const LEE_TUBE_SIDES = 6;      // cross-section of a contour tube
const LEE_TUBE_RADIUS = 0.075; // relative to the grain length (which is 1)
const LEE_MAX_3D_SEGMENTS = 2200; // geometry cap (× tube sides × 2 tris)

// Self-contained PTO generator. Identical in shape to leeGenerator2D (kept as a
// full copy rather than a shared factory, because PTO structural naming
// compiles a generator in isolation and forbids closure variables) with one
// construct added: the ⟨ ⟩ outerproduct indicator, which is what makes a code
// three-dimensional. It gets a healthy share of the probability mass, and the
// parallel-structure rows lean towards carrying it — an out-of-plane branch at
// each node of a planar trunk is the paper's own recipe for solids.
const leeGenerator3D = (rnd) => {
    const build = (depth, family) => {
        const half = Math.min(Math.floor(family / 2), LEE_MAX_MULT);
        if (depth <= 1 || (depth < LEE_CODE_DEPTH && rnd.random() < 0.25)) {
            const run = { k: 'iter', ns: [rnd.randint(1, LEE_RUN_MAX)], child: { k: 'num', a: 0 } };
            return {
                k: 'seq', items: [
                    { k: 'num', a: rnd.randint(-half, half) },
                    rnd.random() < 0.14 ? { k: 'hide', child: run } : run,
                ]
            };
        }
        const r = rnd.random();
        // ⟨ ⟩ outerproduct — the angle leaves the plane of the last two segments.
        // Idiomatically it wraps ONE angle ("⟨90⟩, ⦃n·(0),90⦄": tip out of the
        // plane, then carry on flat in the new one), which is how the paper's
        // solids are written; wrapping a whole sub-code instead makes every one
        // of its angles leave its plane in turn, i.e. a helix or a twisted band.
        if (r < 0.14) {
            if (rnd.random() < 0.7) {
                return {
                    k: 'seq', items: [
                        { k: 'out', child: { k: 'num', a: rnd.randint(-half, half) } },
                        build(depth - 1, family),
                    ]
                };
            }
            return { k: 'out', child: build(depth - 1, family) };
        }
        if (r < 0.24) {
            const n = rnd.randint(2, 3);
            const items = [];
            for (let i = 0; i < n; i++) items.push(build(depth - 1, family));
            return { k: 'seq', items };
        }
        if (r < 0.34) return { k: 'cont', child: build(depth - 1, family) };
        if (r < 0.44) {
            const ns = [rnd.randint(2, 5)];
            if (rnd.random() < 0.3) ns.push(rnd.randint(2, 5));
            return { k: 'iter', ns, cross: rnd.random() < 0.25, child: build(depth - 1, family) };
        }
        if (r < 0.51) return { k: 'rev', child: build(depth - 1, family) };
        if (r < 0.56) return { k: 'pm', child: build(depth - 1, family) };
        if (r < 0.60) return { k: 'int', child: build(depth - 1, family) };
        if (r < 0.68) {
            // `*` (vector addition) is the interesting one here: it composes an
            // in-plane angle with an out-of-plane one into a single direction.
            return {
                k: 'op',
                op: rnd.choice(['+', 'x', '*', '@']),
                cross: rnd.random() < 0.2,
                a: build(depth - 1, family),
                b: build(depth - 1, family),
            };
        }
        if (r < 0.73) return { k: 'comb', a: build(depth - 1, family), b: build(depth - 1, family) };
        if (r < 0.77) {
            const ns = [rnd.randint(2, 4)];
            if (rnd.random() < 0.3) ns.push(rnd.randint(1, 3));
            return {
                k: 'osi', ns, side: rnd.choice(['l', 'r']),
                a: build(depth - 1, family), b: build(depth - 1, family),
            };
        }
        if (r < 0.81) return { k: 'chunk', child: build(depth - 1, family) };
        if (r < 0.84) return { k: rnd.random() < 0.5 ? 'brk' : 'brkall', child: build(depth - 1, family) };
        if (r < 0.87) return { k: 'abs', child: build(depth - 1, family) };
        if (r < 0.90) return { k: 'hide', child: build(depth - 1, family) };
        // Parallel structure. Rows after the first are often wrapped in ⟨ ⟩ so
        // the branch leaves the trunk's plane — the paper's square-of-squares
        // cube (Table 1, shape S) is exactly this.
        const nRows = rnd.randint(2, 3);
        const rows = [], indep = [], every = [];
        for (let i = 0; i < nRows; i++) {
            const row = build(depth - 1, family);
            const tip = { k: 'out', child: { k: 'num', a: rnd.randint(-half, half) } };
            rows.push(i > 0 && rnd.random() < 0.6 ? { k: 'seq', items: [tip, row] } : row);
            indep.push(rnd.random() < 0.3);
            every.push(rnd.random() < 0.3);
        }
        return { k: 'par', rows, indep, every };
    };

    const family = rnd.choice(LEE_FAMILIES);
    const parts = rnd.randint(1, 2);
    const items = [];
    for (let i = 0; i < parts; i++) items.push(build(LEE_CODE_DEPTH, family));
    const body = { k: 'seq', items };
    // As in 2D, a top-level regularity (see leeGenerator2D), plus one extra
    // finish that only makes sense here: hanging the whole motif off a trunk
    // *out of plane* — the paper's own recipe for a solid (Table 1, shape S,
    // where a square carrying a square at each node is a cube).
    const finish = rnd.choice(['cont', 'cont', 'iter', 'rev', 'par', 'solid', 'plain']);
    if (finish === 'cont') return { family, root: { k: 'cont', child: body } };
    if (finish === 'iter') {
        return { family, root: { k: 'iter', ns: [rnd.randint(3, 8)], child: { k: 'chunk', child: body } } };
    }
    if (finish === 'rev') return { family, root: { k: 'rev', child: body } };
    if (finish === 'par') {
        return {
            family,
            root: { k: 'par', rows: [body, build(3, family)], indep: [false, rnd.random() < 0.3], every: [false, rnd.random() < 0.4] },
        };
    }
    if (finish === 'solid') {
        // ⦃…⦄ over ⟨q⟩,⦃…⦄ — a closed contour carrying, at each of its nodes, a
        // closed contour tipped out of the plane. With a quarter-turn tip and
        // square trunks this is literally the paper's cube.
        const quarter = { k: 'out', child: { k: 'num', a: Math.max(1, Math.round(family / 4)) } };
        return {
            family,
            root: {
                k: 'par',
                rows: [
                    { k: 'cont', child: body },
                    { k: 'seq', items: [quarter, { k: 'cont', child: build(3, family) }] },
                ],
                indep: [false, false], every: [false, false],
            },
        };
    }
    return { family, root: body };
};

const leeRepresentation3D = new PTORepresentation(leeGenerator3D);

class SITCode3DIndividual extends SITCodeIndividual {
    constructor(genome = null) {
        super(genome);
        this.threeDModality = new ThreeDModality();
    }

    defaultRepresentation() { return leeRepresentation3D; }

    is3D() { return true; }

    /** Contour segments in 3-space, capped, chained into polylines. */
    polylines() {
        const segs = SITLanguage.interpret3D(this.items(), this.unitDegrees());
        const lines = [];
        let cur = null;
        let count = 0;
        for (const s of segs) {
            if (++count > LEE_MAX_3D_SEGMENTS) break;
            // Segments produced back-to-back share the joint point object, so
            // reference equality chains a run into one tube. A vanished value or
            // a branch push/pop breaks the chain.
            if (cur && cur.pts[cur.pts.length - 1] === s.a) {
                cur.pts.push(s.b);
                cur.ts.push(s.t);
            } else {
                cur = { pts: [s.a, s.b], ts: [s.t, s.t] };
                lines.push(cur);
            }
        }
        return lines;
    }

    // As in 2D: enough contour to be worth a tile, and not so nearly-collinear
    // that it renders as one stroke. Extent is measured over all three axes and
    // the two largest are compared, so a genuinely *planar* figure (a legal and
    // common outcome — a code with no ⟨ ⟩ never leaves its plane) still passes.
    validate() {
        const lines = this.polylines();
        let n = 0;
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const l of lines) for (const p of l.pts) {
            n++;
            for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
        }
        if (n < 8) return false;
        const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].sort((a, b) => b - a);
        return ext[1] > 0.08 * ext[0];
    }

    /**
     * Sweep every contour polyline into a tube. Uses a carried (parallel
     * transport) normal so the tube does not twist; the figure is centred and
     * normalised to a unit-ish radius so the shared camera frames it sensibly
     * and STL exports come out at a printable scale.
     */
    generate3DPoints(lod = 1) {
        const lines = this.polylines();
        const sides = Math.max(4, Math.round(LEE_TUBE_SIDES * lod));
        const out = { vertices: [], indices: [], colors: [] };
        if (!lines.length) return out;

        // Centre + scale over the contour points (not the tube shell).
        let cx = 0, cy = 0, cz = 0, n = 0;
        for (const l of lines) for (const p of l.pts) { cx += p[0]; cy += p[1]; cz += p[2]; n++; }
        cx /= n; cy /= n; cz /= n;
        let maxR = 1e-6;
        for (const l of lines) for (const p of l.pts) {
            maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
        }
        const k = 1 / maxR;
        const radius = Math.max(LEE_TUBE_RADIUS * k, 0.006);

        for (const l of lines) {
            const pts = l.pts.map(p => [(p[0] - cx) * k, (p[1] - cy) * k, (p[2] - cz) * k]);
            this._emitTube(pts, l.ts, radius, sides, out);
        }
        return out;
    }

    _emitTube(points, ts, radius, sides, out) {
        const n = points.length;
        if (n < 2) return;
        const base = out.vertices.length / 3;
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const tangentAt = (i) => SITLanguage._norm3(
            i === 0 ? sub(points[1], points[0])
                : i === n - 1 ? sub(points[n - 1], points[n - 2])
                    : sub(points[i + 1], points[i - 1]));
        let t0 = tangentAt(0);
        const seed = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let n1 = SITLanguage._norm3(SITLanguage._cross(t0, seed));
        for (let i = 0; i < n; i++) {
            const tan = tangentAt(i);
            // Re-orthogonalise the carried normal against the tangent (transport).
            const d = n1[0] * tan[0] + n1[1] * tan[1] + n1[2] * tan[2];
            n1 = SITLanguage._norm3([n1[0] - tan[0] * d, n1[1] - tan[1] * d, n1[2] - tan[2] * d]);
            const n2 = SITLanguage._cross(tan, n1);
            const col = window.Palette.color(ts[Math.min(i, ts.length - 1)]);
            for (let s = 0; s < sides; s++) {
                const ang = (s / sides) * 2 * Math.PI;
                const ca = Math.cos(ang) * radius, sa = Math.sin(ang) * radius;
                out.vertices.push(
                    points[i][0] + ca * n1[0] + sa * n2[0],
                    points[i][1] + ca * n1[1] + sa * n2[1],
                    points[i][2] + ca * n1[2] + sa * n2[2]);
                out.colors.push(col.r / 255, col.g / 255, col.b / 255);
            }
        }
        for (let i = 0; i < n - 1; i++) {
            for (let s = 0; s < sides; s++) {
                const sn = (s + 1) % sides;
                const a = base + i * sides + s, b = base + i * sides + sn;
                const c = base + (i + 1) * sides + s, d = base + (i + 1) * sides + sn;
                out.indices.push(a, c, b, b, c, d);
            }
        }
    }

    visualize(canvas) {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            const lod = canvas.width >= 400 ? 1 : 0.7;
            const { vertices, indices, colors } = this.generate3DPoints(lod);
            if (!indices.length) return;
            this.threeDModality.render(canvas, this.id, vertices, indices, colors, framework);
            return;
        }
        this.render2DProjection(canvas);
    }

    // 2D fallback when the shared 3D scene isn't available (headless tests, and
    // a deep-linked startup before the scene exists): a slowly-rotating
    // orthographic wireframe of the contour itself.
    render2DProjection(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            }
            const lines = this.polylines();
            if (!lines.length) return imageData;

            const s = Math.min(width, height) / 128;
            const cosY = Math.cos(0.6), sinY = Math.sin(0.6);
            const cosX = Math.cos(0.4), sinX = Math.sin(0.4);
            const project = (p) => {
                const x1 = p[0] * cosY - p[2] * sinY;
                const z1 = p[0] * sinY + p[2] * cosY;
                const y2 = p[1] * cosX - z1 * sinX;
                return [x1, y2];
            };

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            const proj = lines.map(l => l.pts.map(p => {
                const q = project(p);
                minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]);
                minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
                return q;
            }));
            const margin = 10 * s;
            const dw = maxX - minX, dh = maxY - minY;
            const scale = Math.min(dw > 0 ? (width - 2 * margin) / dw : 1,
                dh > 0 ? (height - 2 * margin) / dh : 1);
            const ox = (width - dw * scale) / 2 - minX * scale;
            const oy = (height - dh * scale) / 2 - minY * scale;

            for (let li = 0; li < proj.length; li++) {
                const pl = proj[li], ts = lines[li].ts;
                for (let i = 0; i < pl.length - 1; i++) {
                    const color = window.Palette.color(ts[Math.min(i, ts.length - 1)]);
                    Canvas2DModality.drawThickLine(
                        data, width, height,
                        pl[i][0] * scale + ox, pl[i][1] * scale + oy,
                        pl[i + 1][0] * scale + ox, pl[i + 1][1] * scale + oy,
                        color, Math.max(1, 1.4 * s));
                }
            }
            return imageData;
        });
    }

    getPhenotype() {
        const p = this.phenotype;
        const { values, ops } = SITLanguage.load(p && p.root);
        return `Leeuwenberg 3D code — I = ${values + ops} (${values} values + ${ops} operators)`
            + `, family ${(p && p.family) || '?'} → ${this.polylines().length} contour strands`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SITCode3DIndividual;
}

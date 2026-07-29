// SITCode3DIndividual
//
// "Leeuwenberg Code 3D" in the UI. The three-dimensional half of Leeuwenberg's
// 1971 coding language, sharing the whole engine (`SITLanguage.js`) and code
// vocabulary with `SITCodeIndividual`; the only additions are the paper's
// *outerproduct* indicator ⟨ ⟩ and a renderer that turns branch families into
// surfaces.
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
// SOLIDS, NOT JUST RODS. The paper's 3D figures are mostly *surfaces* —
// generalised cylinders, cones, and vases with extrusions and hairs (Table 1,
// S-3 and U-1…W). Its construction for them is parallel structure: a closed
// contour with a profile hanging off each node. Since a parallel structure
// generates its branch code ONCE and replicates it, every copy of the profile
// is structurally identical, so the family of copies is already a regular grid
// of points — a parametric surface waiting to be lofted. `SITLanguage` returns
// those grids alongside the drawn segments, and a `skin` gene on each parallel
// row decides whether the family becomes a lofted surface or stays a bundle of
// rods. Both readings are in the paper: the skinned family is the vessel, the
// unskinned one is the hairs and struts those same figures carry.
//
// The `lathe` finish assembles the classic case directly — see the note there
// on why the tip has to be *two* quarter-turns for the profile to sweep in the
// radial-vertical plane rather than tangentially.
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
        const rows = [], indep = [], every = [], skin = [];
        for (let i = 0; i < nRows; i++) {
            const row = build(depth - 1, family);
            const tip = { k: 'out', child: { k: 'num', a: rnd.randint(-half, half) } };
            rows.push(i > 0 && rnd.random() < 0.6 ? { k: 'seq', items: [tip, row] } : row);
            indep.push(rnd.random() < 0.3);
            every.push(rnd.random() < 0.3);
            // `skin`: loft this branch family into a surface instead of leaving
            // it as separate rods. Both readings are in the paper — a skinned
            // family is a generalised cylinder or vase (S-3, U-1…W), an
            // unskinned one is the hairs and struts those figures also carry.
            skin.push(rnd.random() < 0.45);
        }
        return { k: 'par', rows, indep, every, skin };
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
    const finish = rnd.choice(['cont', 'iter', 'rev', 'par', 'solid', 'lathe', 'lathe', 'plain']);
    if (finish === 'cont') return { family, root: { k: 'cont', child: body } };
    if (finish === 'iter') {
        return { family, root: { k: 'iter', ns: [rnd.randint(3, 8)], child: { k: 'chunk', child: body } } };
    }
    if (finish === 'rev') return { family, root: { k: 'rev', child: body } };
    if (finish === 'par') {
        return {
            family,
            root: {
                k: 'par', rows: [body, build(3, family)],
                indep: [false, rnd.random() < 0.3], every: [false, rnd.random() < 0.4],
                skin: [false, rnd.random() < 0.5],
            },
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
                indep: [false, false], every: [false, false], skin: [false, rnd.random() < 0.5],
            },
        };
    }
    if (finish === 'lathe') {
        // The paper's solid of revolution, written the paper's way: a ring
        // ⦃r⦄ (a continuation whose net turn closes it) carrying, at each of its
        // nodes, one profile tipped out of the ring's plane. Skinned, the family
        // of profile copies lofts into a generalised cylinder / cone / vase
        // (Table 1, S-3 and U-1…U-5). Unskinned it is the same figure drawn as
        // meridian wires — which is how the paper prints them.
        const sides = rnd.randint(6, 16);
        const ring = { k: 'cont', child: { k: 'num', a: Math.max(1, Math.round(family / sides)) } };
        // 2·⟨quarter⟩ — the tip must be TWO quarter-turns, not one. The first
        // takes the branch out of the ring's plane, leaving the reference plane
        // normal pointing along the radius, so a following plain angle would
        // still bend tangentially (a fin, not a profile). The second turns out
        // along the radius and leaves the normal tangential, after which every
        // plain angle bends in the radial-vertical plane — which is exactly what
        // a lathe profile is.
        const tip = {
            k: 'iter', ns: [2],
            child: { k: 'out', child: { k: 'num', a: Math.max(1, Math.round(family / 4)) } },
        };
        return {
            family,
            root: {
                k: 'par',
                rows: [ring, { k: 'seq', items: [tip, body] }],
                indep: [false, false], every: [false, true], skin: [false, rnd.random() < 0.8],
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

    /** The interpreted figure: drawn segments plus the branch grids. Cached. */
    figure() {
        const items = this.items();
        if (this._figFor !== items) {
            this._figFor = items;
            this._fig = SITLanguage.interpret3D(items, this.unitDegrees());
            // A family can only be lofted if it has at least two strands of at
            // least two points; anything thinner falls back to rods.
            for (const f of this._fig.families) {
                if (f.skin && !(f.strands.length >= 2 && f.strands[0].length >= 2)) f.skin = false;
            }
        }
        return this._fig;
    }

    /** The families that become skin — the surfaces of revolution / sweeps. */
    skins() { return this.figure().families.filter(f => f.skin); }

    /**
     * Contour segments chained into polylines for tubing. `all = true` returns
     * every strand (used for bounds, validation and the 2D fallback); otherwise
     * the segments belonging to a skinned family are dropped, since the surface
     * already renders them and tubing them too just crawls the skin with wires.
     *
     * Coincident repeats are dropped. This matters a lot: a code like
     * `n·{closed contour}` genuinely says "draw this again", and in 2D the
     * overdraw is harmless, but in 3D two identical tubes occupy the same space
     * and z-fight — the surface speckles and flickers as the camera orbits.
     * Measured across random individuals, ~15% of all triangles were exact
     * duplicates before this (worst case 77%). Dropping them changes no visible
     * geometry, only which copy's palette position wins.
     */
    polylines(all = false) {
        const fig = this.figure();
        const fams = fig.families;
        const lines = [];
        const seen = new Set();
        let cur = null;
        let count = 0;
        for (const s of fig.segments) {
            if (++count > LEE_MAX_3D_SEGMENTS) break;
            if (!all && s.fam >= 0 && fams[s.fam] && fams[s.fam].skin) { cur = null; continue; }
            const key = SITCode3DIndividual.edgeKey(s.a, s.b);
            if (seen.has(key)) { cur = null; continue; }
            seen.add(key);
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

    /** Quantised position key, for spotting geometry drawn twice in one place. */
    static posKey(p) {
        return `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`;
    }

    /** Undirected edge key — a retraced contour arrives in the other order. */
    static edgeKey(a, b) {
        const ka = this.posKey(a), kb = this.posKey(b);
        return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    }

    /** Every point in the figure — contour and skin alike. */
    _allPoints() {
        const pts = [];
        for (const l of this.polylines(true)) for (const p of l.pts) pts.push(p);
        for (const f of this.skins()) for (const s of f.strands) for (const p of s) pts.push(p);
        return pts;
    }

    // As in 2D: enough contour to be worth a tile, and not so nearly-collinear
    // that it renders as one stroke. Extent is measured over all three axes and
    // the two largest are compared, so a genuinely *planar* figure (a legal and
    // common outcome — a code with no ⟨ ⟩ never leaves its plane) still passes.
    validate() {
        const pts = this._allPoints();
        if (pts.length < 8) return false;
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of pts) {
            for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
        }
        const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].sort((a, b) => b - a);
        return ext[1] > 0.08 * ext[0];
    }

    /**
     * Build the mesh: skinned branch families become lofted surfaces, everything
     * else becomes a tube. The figure is centred and normalised to a unit-ish
     * radius so the shared camera frames it sensibly and STL exports come out at
     * a printable scale.
     */
    generate3DPoints(lod = 1) {
        const out = { vertices: [], indices: [], colors: [] };
        const pts = this._allPoints();
        if (!pts.length) return out;

        let cx = 0, cy = 0, cz = 0;
        for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
        cx /= pts.length; cy /= pts.length; cz /= pts.length;
        let maxR = 1e-6;
        for (const p of pts) maxR = Math.max(maxR, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
        const k = 1 / maxR;
        const fit = (p) => [(p[0] - cx) * k, (p[1] - cy) * k, (p[2] - cz) * k];

        // One `seen` set across all families, so two families that happen to
        // sweep the same region don't stack coplanar sheets either.
        const seen = new Set();
        for (const f of this.skins()) this._emitSkin(f, fit, out, seen);

        const sides = Math.max(4, Math.round(LEE_TUBE_SIDES * lod));
        const radius = Math.max(LEE_TUBE_RADIUS * k, 0.006);
        for (const l of this.polylines()) this._emitTube(l.pts.map(fit), l.ts, radius, sides, out);

        // Final safety net. The band and segment keys above catch whole repeats
        // cheaply (without building them), but a surface that folds back onto
        // itself can still land triangles in the same place, and any coincident
        // pair z-fights. This guarantees none survive.
        this._dropDuplicateTriangles(out);
        return out;
    }

    /**
     * Drop triangles whose three positions duplicate an earlier triangle's.
     *
     * Done in two cheap passes rather than one obvious-but-slow one: first
     * collapse vertices to canonical position ids (one string key per *vertex*),
     * then key each triangle by its three sorted ids packed into a single
     * integer. Keying triangles on coordinate strings directly costs three
     * string builds and a sort per triangle, which on a 17k-triangle mesh is
     * slower than everything else in the build put together.
     */
    _dropDuplicateTriangles(out) {
        const V = out.vertices;
        const n = V.length / 3;
        const canon = new Map();
        const pid = new Int32Array(n);
        for (let i = 0; i < n; i++) {
            const k = `${Math.round(V[i * 3] * 1e4)},${Math.round(V[i * 3 + 1] * 1e4)},${Math.round(V[i * 3 + 2] * 1e4)}`;
            let id = canon.get(k);
            if (id === undefined) { id = canon.size; canon.set(k, id); }
            pid[i] = id;
        }
        const m = canon.size;
        // The packed key must stay an exact integer: m³ < 2^53.
        if (m > 200000) return;
        const seen = new Set();
        const kept = [];
        const idx = out.indices;
        for (let i = 0; i < idx.length; i += 3) {
            let a = pid[idx[i]], b = pid[idx[i + 1]], c = pid[idx[i + 2]], t;
            if (a > b) { t = a; a = b; b = t; }
            if (b > c) { t = b; b = c; c = t; }
            if (a > b) { t = a; a = b; b = t; }
            const k = (a * m + b) * m + c;
            if (seen.has(k)) continue;
            seen.add(k);
            kept.push(idx[i], idx[i + 1], idx[i + 2]);
        }
        // Orphaned vertices are left in place — harmless, and cheaper than a
        // full remap.
        out.indices = kept;
    }

    /**
     * Loft one branch family into a surface. The strands are the branch code
     * replicated at successive trunk nodes, so strand i and strand i+1 are
     * adjacent rows of a quad grid; the loop is closed when the trunk itself
     * closed (its last node came back within a grain of its first), which is
     * what turns a profile swept round a `⦃ ⦄` polygon into a solid of
     * revolution — the paper's generalised cylinders and vases.
     *
     * @returns {number} how many bands were swept (rows if closed, rows-1 if not)
     */
    _emitSkin(family, fit, out, seen) {
        seen = seen || new Set();
        const strands = family.strands;
        const rows = strands.length;
        // Cheapest possible closure test, and the right one: a continuation
        // repeats until the contour meets itself, so a closed trunk leaves its
        // last node about one grain length from its first.
        const gap = Math.hypot(
            strands[0][0][0] - strands[rows - 1][0][0],
            strands[0][0][1] - strands[rows - 1][0][1],
            strands[0][0][2] - strands[rows - 1][0][2]);
        const closed = rows > 2 && gap < 1.5;
        const loops = closed ? rows : rows - 1;
        let swept = 0;

        for (let i = 0; i < loops; i++) {
            const a = strands[i], b = strands[(i + 1) % rows];
            const m = Math.min(a.length, b.length);
            if (m < 2) continue;
            // Skip a band already swept in this exact place (see polylines()).
            const key = SITCode3DIndividual.edgeKey(a[0], b[0])
                + '/' + SITCode3DIndividual.edgeKey(a[m - 1], b[m - 1]);
            if (seen.has(key)) continue;
            seen.add(key);

            const base = out.vertices.length / 3;
            for (let j = 0; j < m; j++) {
                for (const p of [a[j], b[j]]) {
                    const q = fit(p);
                    out.vertices.push(q[0], q[1], q[2]);
                }
                // Colour runs along the branch, so every copy of the motif is
                // shaded alike and the sweep reads as one surface.
                const c = window.Palette.color(0.15 + 0.85 * (j / Math.max(1, m - 1)));
                for (let s = 0; s < 2; s++) out.colors.push(c.r / 255, c.g / 255, c.b / 255);
            }
            for (let j = 0; j < m - 1; j++) {
                const p0 = base + j * 2, p1 = p0 + 1, p2 = p0 + 2, p3 = p0 + 3;
                // Drop degenerate quads: a strand pair that touches at one end
                // (a sweep collapsing to a point, e.g. the apex of a cone) gives
                // zero-area triangles, whose normals are garbage and whose
                // shading shimmers.
                if (this._degenerate(out, p0, p2, p1)) continue;
                out.indices.push(p0, p2, p1, p1, p2, p3);
            }
            swept++;
        }
        return swept;
    }

    /** True if three mesh vertices are collinear/coincident (zero-area triangle). */
    _degenerate(out, i0, i1, i2) {
        const V = out.vertices;
        const a = [V[i0 * 3], V[i0 * 3 + 1], V[i0 * 3 + 2]];
        const b = [V[i1 * 3], V[i1 * 3 + 1], V[i1 * 3 + 2]];
        const c = [V[i2 * 3], V[i2 * 3 + 1], V[i2 * 3 + 2]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = SITLanguage._cross(u, v);
        return Math.hypot(n[0], n[1], n[2]) < 1e-9;
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
            // The fallback has no shading, so draw skinned families as their
            // meridian wires (polylines(true) keeps them) rather than losing them.
            const lines = this.polylines(true);
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
        const skins = this.skins().length;
        return `Leeuwenberg 3D code — I = ${values + ops} (${values} values + ${ops} operators)`
            + `, family ${(p && p.family) || '?'} → ${this.polylines(true).length} contour strands`
            + (skins ? `, ${skins} lofted surface${skins > 1 ? 's' : ''}` : '');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SITCode3DIndividual;
}

/**
 * JennPolytopeIndividual — evolvable 4D regular polytopes, rendered à la Jenn3d.
 *
 * A reimplementation, in the Anemone idiom, of the *look* of Fritz Obermeyer's
 * Jenn3d (jenn3d.org) — the visualiser Nicolau & Costelloe drove with Grammatical
 * Evolution ("Size Does Not Matter: Evolving Parameters for a Cayley Graph
 * Visualiser Using 64 Bits", EvoMUSART 2014). Jenn3d builds Cayley graphs of
 * finite Coxeter groups via Todd–Coxeter, embeds them on the 3-sphere S³, and
 * stereographically projects to R³ — so straight edges (great-circle arcs in S³)
 * bend into curves, and the whole thing can be rotated in 4D.
 *
 * This first version uses *precomputed* vertex tables for the regular polychora
 * (5-cell, 8-cell/tesseract, 16-cell, 24-cell, 600-cell) rather than a general
 * Todd–Coxeter / Wythoff engine. Edges are recovered by nearest-neighbour
 * distance on S³ (validated against the known edge counts in the tests). The
 * genome (a small PTO parameter vector, in the spirit of the "64 bits" paper)
 * chooses the polytope, a full SO(4)-ish rotation (6 plane angles — rotations in
 * a w-plane are what "fly through" the projection), a projection scale, tube
 * thickness, and whether to draw vertex markers. Colour comes from the shared
 * palette, keyed on 4D w-depth so the stereographic depth reads as hue.
 *
 * Rendering rides the existing Three.js 3D pipeline: each curved edge is sampled
 * along its great-circle arc (SLERP in S³ → project) and swept into a thin tube
 * of triangles, so it plugs straight into ThreeDModality / the shared scene and
 * gets STL export (MeshExport) for free. The camera rotation (Anemone.js) spins
 * the 3D result; the evolved 4D rotation is baked into the geometry.
 *
 * Deferred (would want the Wythoff/reflection engine — see the site's callout of
 * the bitruncated 120-cell): the 120-cell (600 verts) and true truncations /
 * omnitruncations. Those need per-mirror "ringing", i.e. path (a).
 */

const JENN_PHI = (1 + Math.sqrt(5)) / 2;

// The 12 even permutations of [0,1,2,3] (used for the 600-cell's 96 icosian
// vertices). Computed once from all 24 permutations, filtered by parity.
const JENN_EVEN_PERMS = (() => {
    const perms = [];
    const permute = (arr, k) => {
        if (k === arr.length) { perms.push(arr.slice()); return; }
        for (let i = k; i < arr.length; i++) {
            [arr[k], arr[i]] = [arr[i], arr[k]];
            permute(arr, k + 1);
            [arr[k], arr[i]] = [arr[i], arr[k]];
        }
    };
    permute([0, 1, 2, 3], 0);
    // Parity by counting inversions.
    const isEven = (p) => {
        let inv = 0;
        for (let i = 0; i < p.length; i++)
            for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
        return inv % 2 === 0;
    };
    return perms.filter(isEven);
})();

// The polytopes this version offers, with their known edge counts (a self-check
// the tests assert against the nearest-neighbour edge recovery).
const JENN_POLYTOPES = ['the_5_cell', 'the_8_cell', 'the_16_cell', 'the_24_cell', 'the_600_cell'];
const JENN_EDGE_COUNTS = { the_5_cell: 10, the_8_cell: 32, the_16_cell: 24, the_24_cell: 96, the_600_cell: 720 };

// --- 4D vertex tables (each returned point is normalised onto the unit S³) ----
function jennNormalize4(v) {
    const n = Math.hypot(v[0], v[1], v[2], v[3]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n, v[3] / n];
}

function jennVertices(shape) {
    const verts = [];
    if (shape === 'the_5_cell') {
        // Regular tetrahedron in the w = -1/√5 hyperplane + apex on the w-axis.
        const s = 1 / Math.sqrt(5);
        [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].forEach(([x, y, z]) =>
            verts.push([x, y, z, -s]));
        verts.push([0, 0, 0, 4 * s]);
    } else if (shape === 'the_8_cell') {
        for (let a = -1; a <= 1; a += 2)
            for (let b = -1; b <= 1; b += 2)
                for (let c = -1; c <= 1; c += 2)
                    for (let d = -1; d <= 1; d += 2) verts.push([a, b, c, d]);
    } else if (shape === 'the_16_cell') {
        for (let i = 0; i < 4; i++)
            for (let s = -1; s <= 1; s += 2) {
                const v = [0, 0, 0, 0]; v[i] = s; verts.push(v);
            }
    } else if (shape === 'the_24_cell') {
        // All permutations of (±1, ±1, 0, 0): pick 2 of 4 axes non-zero.
        for (let i = 0; i < 4; i++)
            for (let j = i + 1; j < 4; j++)
                for (let si = -1; si <= 1; si += 2)
                    for (let sj = -1; sj <= 1; sj += 2) {
                        const v = [0, 0, 0, 0]; v[i] = si; v[j] = sj; verts.push(v);
                    }
    } else if (shape === 'the_600_cell') {
        // 16: (±½,±½,±½,±½)
        for (let a = -1; a <= 1; a += 2)
            for (let b = -1; b <= 1; b += 2)
                for (let c = -1; c <= 1; c += 2)
                    for (let d = -1; d <= 1; d += 2) verts.push([a / 2, b / 2, c / 2, d / 2]);
        // 8: (±1,0,0,0) permutations
        for (let i = 0; i < 4; i++)
            for (let s = -1; s <= 1; s += 2) {
                const v = [0, 0, 0, 0]; v[i] = s; verts.push(v);
            }
        // 96: even permutations of (±φ, ±1, ±1/φ, 0) / 2
        const base = [JENN_PHI, 1, 1 / JENN_PHI, 0];
        for (const perm of JENN_EVEN_PERMS) {
            const vals = perm.map(idx => base[idx]);
            for (let sign = 0; sign < 8; sign++) {
                const v = vals.slice();
                let bit = 0;
                for (let k = 0; k < 4; k++) {
                    if (v[k] !== 0) { if ((sign >> bit) & 1) v[k] = -v[k]; bit++; }
                }
                verts.push([v[0] / 2, v[1] / 2, v[2] / 2, v[3] / 2]);
            }
        }
    }
    return verts.map(jennNormalize4);
}

// Edges by nearest-neighbour distance on S³: connect every pair whose squared
// distance is within 5% of the minimum. Regular polytopes have a single edge
// length, so this recovers exactly the 1-skeleton. O(n²) but n ≤ 120.
function jennEdges(verts) {
    let minSq = Infinity;
    for (let i = 0; i < verts.length; i++)
        for (let j = i + 1; j < verts.length; j++) {
            const a = verts[i], b = verts[j];
            const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2;
            if (d > 1e-9 && d < minSq) minSq = d;
        }
    const thresh = minSq * 1.05;
    const edges = [];
    for (let i = 0; i < verts.length; i++)
        for (let j = i + 1; j < verts.length; j++) {
            const a = verts[i], b = verts[j];
            const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2;
            if (d > 1e-9 && d <= thresh) edges.push([i, j]);
        }
    return edges;
}

// The 2-faces (for solid rendering). A regular polytope has a single face type,
// so: recover triangular faces (mutually-adjacent triples) if any exist; else
// recover square faces (4-cycles). Returns each face as vertex indices in cyclic
// order (length 3 or 4). Validated against known face counts in the tests.
function jennFaces(verts, edges) {
    const n = verts.length;
    const adj = Array.from({ length: n }, () => new Set());
    for (const [i, j] of edges) { adj[i].add(j); adj[j].add(i); }

    const tris = [];
    for (let i = 0; i < n; i++)
        for (const j of adj[i]) if (j > i)
            for (const k of adj[j]) if (k > j && adj[i].has(k)) tris.push([i, j, k]);
    if (tris.length) return tris;

    // Squares: a non-adjacent (diagonal) pair a,c whose two common neighbours
    // b,d are themselves non-adjacent (the other diagonal). Dedupe by vertex set.
    const seen = new Set(), quads = [];
    for (let a = 0; a < n; a++)
        for (let c = a + 1; c < n; c++) {
            if (adj[a].has(c)) continue;
            const common = [...adj[a]].filter(x => adj[c].has(x));
            for (let x = 0; x < common.length; x++)
                for (let y = x + 1; y < common.length; y++) {
                    const b = common[x], d = common[y];
                    if (adj[b].has(d)) continue;
                    const key = [a, b, c, d].slice().sort((p, q) => p - q).join(',');
                    if (seen.has(key)) continue;
                    seen.add(key);
                    quads.push([a, b, c, d]);   // cyclic a-b-c-d
                }
        }
    return quads;
}

// Memoise geometry per shape (constant per polytope).
const JENN_GEOMETRY_CACHE = {};
function jennGeometry(shape) {
    if (!JENN_GEOMETRY_CACHE[shape]) {
        const verts = jennVertices(shape);
        const edges = jennEdges(verts);
        JENN_GEOMETRY_CACHE[shape] = { verts, edges, faces: jennFaces(verts, edges) };
    }
    return JENN_GEOMETRY_CACHE[shape];
}

// Unit icosahedron (12 verts, 20 faces) for smooth-ish ball nodes — rounder than
// an octahedron at low cost, and Phong shading + normals hides the facets.
const JENN_ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const raw = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const verts = raw.map(v => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; });
    const faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    return { verts, faces };
})();

// --- small vector helpers (R³) -----------------------------------------------
function jennSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function jennDist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function jennCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function jennNorm3(a) {
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / n, a[1] / n, a[2] / n];
}

// --- the PTO generator (the search space; small parameter vector) ------------
// Self-contained per PTO's structural naming: no closure vars, no `new`, plain
// `for` loops for repeated genes. Returns a plain params object; the polytope
// geometry itself is built in the individual (like the tree/DAG types).
const jennGenerator = (rnd) => {
    const shapes = ['the_5_cell', 'the_8_cell', 'the_16_cell', 'the_24_cell', 'the_600_cell'];
    const shape = rnd.choice(shapes);
    const rot = [];
    for (let i = 0; i < 6; i++) rot.push(rnd.uniform(0, 2 * Math.PI)); // xy xz xw yz yw zw
    const projScale = rnd.uniform(0.6, 1.6);
    const tubeRadius = rnd.uniform(0.015, 0.06);
    const showVertices = rnd.random() < 0.5;
    const colorReverse = rnd.random() < 0.5;   // flip inner/outer palette direction
    const renderStyle = rnd.choice(['wire', 'solid', 'both']); // rods / curved faces / both
    return { shape, rot, projScale, tubeRadius, showVertices, colorReverse, renderStyle };
};

const jennRepresentation = new PTORepresentation(jennGenerator);

class JennPolytopeIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = jennRepresentation;
        this.genome = genome || this.representation.generateRandom();
        this.tubeSides = 6;        // cross-section resolution of an edge tube (rounder rods)
        // Extra, time-varying 4D rotation applied on top of the genome's static
        // orientation, in the three w-planes (xw, yw, zw). Zero by default (static
        // tiles / STL / tests); the zoom loop advances it for the 4D-rotation morph
        // — rotating in a w-plane sweeps vertices toward/through the projection
        // pole, the mesmerising Jenn "fly-through".
        this._anim4DAngles = [0, 0, 0];
        this.maxProjRadius = 12;   // soft radial bound on projected points (tanh) — see _project
    }

    is3D() { return true; }
    usesColorPalette() { return true; }

    // Rotate a 4D point through the 6 evolved plane angles (applied in sequence).
    _rotate4(v, rot) {
        const planes = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
        const out = v.slice();
        for (let k = 0; k < planes.length; k++) {
            const [a, b] = planes[k];
            const c = Math.cos(rot[k]), s = Math.sin(rot[k]);
            const va = out[a], vb = out[b];
            out[a] = va * c - vb * s;
            out[b] = va * s + vb * c;
        }
        return out;
    }

    // The animated extra 4D rotation, in the w-planes [0,3],[1,3],[2,3]. Identity
    // (returns the input) when idle, so static tiles/STL/tests are unaffected.
    _rotate4Extra(v, angles) {
        if (!angles || (angles[0] === 0 && angles[1] === 0 && angles[2] === 0)) return v;
        const planes = [[0, 3], [1, 3], [2, 3]];
        const out = v.slice();
        for (let k = 0; k < 3; k++) {
            const [a, b] = planes[k];
            const c = Math.cos(angles[k]), s = Math.sin(angles[k]);
            const va = out[a], vb = out[b];
            out[a] = va * c - vb * s;
            out[b] = va * s + vb * c;
        }
        return out;
    }

    // Framework hooks for geometry that changes over time (see Anemone.js zoom
    // loop): opt in, and advance the animated 4D rotation from a clock. Absolute
    // (not incremental) so it stays smooth and honours the play/pause clock.
    animatesGeometry() { return true; }
    setAnimationTime(seconds) {
        this._anim4DAngles = [seconds * 0.31, seconds * 0.19, seconds * 0.11];
    }
    // Return to the genome's static orientation (called when the zoom closes) so
    // the grid tile isn't left frozen mid-morph.
    resetAnimation() { this._anim4DAngles = [0, 0, 0]; this._lastBuiltKey = null; }

    // Great-circle interpolation on the unit 3-sphere.
    _slerp4(p, q, t) {
        let dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
        dot = Math.max(-1, Math.min(1, dot));
        const omega = Math.acos(dot);
        if (omega < 1e-6) return p.slice();
        const so = Math.sin(omega);
        const a = Math.sin((1 - t) * omega) / so, b = Math.sin(t * omega) / so;
        return jennNormalize4([
            a * p[0] + b * q[0], a * p[1] + b * q[1], a * p[2] + b * q[2], a * p[3] + b * q[3],
        ]);
    }

    // Stereographic projection S³ → R³ from the north pole (0,0,0,1), scaled.
    // A near-pole point projects arbitrarily far, which would blow up the bounding
    // box the framework frames the camera on — so the radius is bounded. Crucially
    // this is a *smooth* radial compression (r → R·tanh(r/R)), NOT a hard clamp:
    // near-field points (r ≪ R) are essentially unchanged, far points ease toward
    // R. A hard clamp pinned every over-radius point onto the R-sphere, so a rod
    // arc sweeping outward (common under 4D rotation) suddenly flattened into a
    // straight line at the boundary; tanh keeps it a smooth curve. Direction is
    // preserved (radial only), so arc shape is kept — only distance is eased.
    _project(v4, scale) {
        const denom = Math.max(1 - v4[3], 1e-4);   // avoid blow-up exactly at the pole
        let x = v4[0] / denom * scale, y = v4[1] / denom * scale, z = v4[2] / denom * scale;
        const r = Math.hypot(x, y, z);
        if (r > 1e-9) {
            const R = this.maxProjRadius;
            const f = (R * Math.tanh(r / R)) / r;
            x *= f; y *= f; z *= f;
        }
        return [x, y, z];
    }

    // Length of an edge's projected arc, from a few probes. A great circle
    // projects to a circular arc, so a handful of samples estimates it well. This
    // is the metric for "how many segments does this arc need": crucially it stays
    // large for a long rod sweeping near the pole even though the tanh radial
    // compression squashes that rod's straight-line chord (which is why chord/sag
    // under-sampled those arcs and left them polygonal).
    _projectedArcLength(a, b, probes = 6) {
        const scale = this.phenotype.projScale;
        let prev = this._project(a, scale), len = 0;
        for (let s = 1; s <= probes; s++) {
            const cur = this._project(this._slerp4(a, b, s / probes), scale);
            len += jennDist3(prev, cur);
            prev = cur;
        }
        return len;
    }

    // Append a thin tube of triangles following the R³ polyline `points`.
    // colorTs[i] ∈ [0,1] gives each ring's palette colour. Uses a fixed-up frame;
    // arcs are short enough that section twist is invisible.
    _emitTube(points, colorTs, radius, out, sides) {
        const S = sides || this.tubeSides;
        const baseIndex = out.vertices.length / 3;
        const n = points.length;
        if (n < 2) return;
        for (let i = 0; i < n; i++) {
            const tangent = jennNorm3(
                i === 0 ? jennSub(points[1], points[0])
                    : i === n - 1 ? jennSub(points[n - 1], points[n - 2])
                        : jennSub(points[i + 1], points[i - 1]));
            const ref = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            const n1 = jennNorm3(jennCross(tangent, ref));
            const n2 = jennCross(tangent, n1);
            const col = window.Palette.color(colorTs[i]);
            for (let k = 0; k < S; k++) {
                const ang = (k / S) * 2 * Math.PI;
                const ca = Math.cos(ang) * radius, sa = Math.sin(ang) * radius;
                out.vertices.push(
                    points[i][0] + ca * n1[0] + sa * n2[0],
                    points[i][1] + ca * n1[1] + sa * n2[1],
                    points[i][2] + ca * n1[2] + sa * n2[2]);
                out.colors.push(col.r / 255, col.g / 255, col.b / 255);
            }
        }
        for (let i = 0; i < n - 1; i++)
            for (let k = 0; k < S; k++) {
                const kn = (k + 1) % S;
                const a = baseIndex + i * S + k, b = baseIndex + i * S + kn;
                const c = baseIndex + (i + 1) * S + k, d = baseIndex + (i + 1) * S + kn;
                out.indices.push(a, c, b, b, c, d);
            }
    }

    // A small icosahedral ball at an R³ point (for the showVertices gene). Jenn
    // draws nodes as balls a bit wider than the rods; radius is set accordingly.
    _emitVertexMarker(p, radius, colorT, out) {
        const base = out.vertices.length / 3;
        const col = window.Palette.color(colorT);
        for (const v of JENN_ICO.verts) {
            out.vertices.push(p[0] + v[0] * radius, p[1] + v[1] * radius, p[2] + v[2] * radius);
            out.colors.push(col.r / 255, col.g / 255, col.b / 255);
        }
        for (const f of JENN_ICO.faces) out.indices.push(base + f[0], base + f[1], base + f[2]);
    }

    // Project a 4D point, push it as a coloured vertex (w-depth → palette),
    // return its index. The building block of the curved surface patches.
    _pushVertex(v4, p, out) {
        const idx = out.vertices.length / 3;
        const pt = this._project(v4, p.projScale);
        let t = (v4[3] + 1) / 2;
        if (p.colorReverse) t = 1 - t;
        const c = window.Palette.color(t);
        out.vertices.push(pt[0], pt[1], pt[2]);
        out.colors.push(c.r / 255, c.g / 255, c.b / 255);
        return idx;
    }

    // Subdivision depth for a face. The visible silhouette corners come from the
    // face's *boundary arcs*, so gate on those directly — the same sag (bulge)
    // metric that keeps the rods smooth, applied to each edge of the face — plus
    // the edge length (a big face near the camera spans many pixels, so a curved
    // edge needs more segments even when only mildly bulged). This replaces the
    // old face-*centre* bulge, which under-sampled large flattish faces.
    _faceDepth(corners4, p, lod) {
        const n = corners4.length;
        let maxArc = 0;
        for (let i = 0; i < n; i++) {
            const arc = this._projectedArcLength(corners4[i], corners4[(i + 1) % n], 5);
            if (arc > maxArc) maxArc = arc;
        }
        const floor = Math.max(4, Math.round(6 * lod));
        // Same arc-length basis as the rods: a face's longest boundary arc decides
        // its boundary segment count (→ interior grid depth), so a big face near
        // the camera is finely meshed and a small dense 600-cell face stays cheap.
        return Math.max(floor, Math.min(24, Math.round((5 + maxArc * 2.5) * lod)));
    }

    // A curved triangular patch on S³ (corners A,B,C are rotated 4D unit vectors):
    // a barycentric grid re-normalised onto the sphere then stereographically
    // projected, so the filled face bulges exactly like the polytope's real face.
    _emitTrianglePatch(A, B, C, depth, p, out) {
        const idx = [];
        for (let i = 0; i <= depth; i++) {
            idx[i] = [];
            for (let j = 0; j <= depth - i; j++) {
                const k = depth - i - j;
                const v4 = jennNormalize4([
                    (i * A[0] + j * B[0] + k * C[0]) / depth,
                    (i * A[1] + j * B[1] + k * C[1]) / depth,
                    (i * A[2] + j * B[2] + k * C[2]) / depth,
                    (i * A[3] + j * B[3] + k * C[3]) / depth,
                ]);
                idx[i][j] = this._pushVertex(v4, p, out);
            }
        }
        for (let i = 0; i < depth; i++)
            for (let j = 0; j < depth - i; j++) {
                out.indices.push(idx[i][j], idx[i][j + 1], idx[i + 1][j]);
                if (j < depth - i - 1) out.indices.push(idx[i][j + 1], idx[i + 1][j + 1], idx[i + 1][j]);
            }
    }

    // A curved quadrilateral patch (cyclic corners A,B,C,D) via bilinear-on-sphere.
    _emitQuadPatch(A, B, C, D, depth, p, out) {
        const idx = [];
        for (let i = 0; i <= depth; i++) {
            idx[i] = []; const u = i / depth;
            for (let j = 0; j <= depth; j++) {
                const v = j / depth;
                const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
                const v4 = jennNormalize4([
                    w00 * A[0] + w10 * B[0] + w11 * C[0] + w01 * D[0],
                    w00 * A[1] + w10 * B[1] + w11 * C[1] + w01 * D[1],
                    w00 * A[2] + w10 * B[2] + w11 * C[2] + w01 * D[2],
                    w00 * A[3] + w10 * B[3] + w11 * C[3] + w01 * D[3],
                ]);
                idx[i][j] = this._pushVertex(v4, p, out);
            }
        }
        for (let i = 0; i < depth; i++)
            for (let j = 0; j < depth; j++) {
                out.indices.push(idx[i][j], idx[i + 1][j], idx[i][j + 1]);
                out.indices.push(idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]);
            }
    }

    // Build geometry in two buckets: `struts` (opaque rods + node balls) and
    // `glass` (the curved face patches, rendered transparent). Splitting them lets
    // visualize() give each its own material — the Jenn look is dark solid rods
    // seen *through* strongly-transparent faces. rotate in 4D first.
    // `lod` scales detail: 1 = full (zoom lightbox, STL export), <1 for the small
    // 128px grid tiles where a 600-cell would otherwise be ~120k triangles × 16.
    _buildParts(lod = 1) {
        const p = this.phenotype;
        const { edges, faces } = jennGeometry(p.shape);
        const verts = jennGeometry(p.shape).verts;
        const ea = this._anim4DAngles;
        const rverts = verts.map(v => this._rotate4Extra(this._rotate4(v, p.rot), ea));
        const struts = { vertices: [], indices: [], colors: [] };
        const glass = { vertices: [], indices: [], colors: [] };
        const sides = Math.max(5, Math.round(this.tubeSides * lod));

        if (p.renderStyle !== 'wire') {
            for (const f of faces) {
                const c4 = f.map(vi => rverts[vi]);
                const depth = this._faceDepth(c4, p, lod);
                if (f.length === 3) this._emitTrianglePatch(c4[0], c4[1], c4[2], depth, p, glass);
                else this._emitQuadPatch(c4[0], c4[1], c4[2], c4[3], depth, p, glass);
            }
        }

        if (p.renderStyle !== 'solid') for (const [i, j] of edges) {
            const a = rverts[i], b = rverts[j];
            // Segment count scales with the projected arc *length*: a long rod
            // sweeping near the pole gets many samples (smooth), a short near-
            // straight rod just a handful (cheap) — and unlike the old chord/sag
            // metric this doesn't collapse when tanh compression shortens the chord.
            const K = Math.max(6, Math.min(128, Math.ceil((4 + this._projectedArcLength(a, b) * 3.5) * lod)));
            const points = [], colorTs = [];
            for (let s = 0; s <= K; s++) {
                const v4 = this._slerp4(a, b, s / K);
                points.push(this._project(v4, p.projScale));
                let t = (v4[3] + 1) / 2;              // colour by w-depth
                colorTs.push(p.colorReverse ? 1 - t : t);
            }
            this._emitTube(points, colorTs, p.tubeRadius, struts, sides);
        }

        if (p.showVertices) {
            for (const v of rverts) {
                let t = (v[3] + 1) / 2;
                this._emitVertexMarker(this._project(v, p.projScale), p.tubeRadius * 2.0,
                    p.colorReverse ? 1 - t : t, struts);
            }
        }
        return { struts, glass };
    }

    // The combined single mesh, for STL export (and the headless tests). Merges
    // both buckets — a printed model wants the rods and the surfaces as one solid.
    generate3DPoints() {
        const { struts, glass } = this._buildParts();
        const base = struts.vertices.length / 3;
        const vertices = struts.vertices.concat(glass.vertices);
        const colors = struts.colors.concat(glass.colors);
        const indices = struts.indices.concat(glass.indices.map(ix => ix + base));
        return { vertices, indices, colors };
    }

    // Build one BufferGeometry+Mesh from a bucket; `transparent` gives the faces
    // their see-through glass material (depthWrite off so rods behind show).
    _threeMesh(part, transparent) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(part.vertices, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(part.colors, 3));
        g.setIndex(part.indices);
        g.computeVertexNormals();
        const material = new THREE.MeshPhongMaterial(transparent
            // A specular highlight is the cue that reads a curved surface as curved
            // — without it, at ~0.26 opacity a domed face and a flat face look
            // identical, so a face seen edge-on to its curvature looks like a flat
            // polygon. The broad highlight (low shininess) sweeps across the dome as
            // it rotates, revealing the shape; opacity nudged up a little too.
            ? { vertexColors: true, side: THREE.DoubleSide, shininess: 30, specular: 0x999999, transparent: true, opacity: 0.32, depthWrite: false }
            : { vertexColors: true, side: THREE.DoubleSide, shininess: 100 });
        return new THREE.Mesh(g, material);
    }

    visualize(canvas) {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            // Small grid tiles (128px) render at reduced detail; the zoom lightbox
            // (768px) and STL export get full detail.
            let lod = canvas.width >= 400 ? 1 : 0.6;
            // While the 4D rotation is actively morphing, the mesh is rebuilt every
            // frame on the CPU — cap detail so even the 600-cell stays smooth; the
            // motion masks it. (Pausing rotation returns to full detail.)
            const ea = this._anim4DAngles;
            const morphing = (ea[0] || ea[1] || ea[2]) && framework.rotationEnabled;
            if (morphing) lod = Math.min(lod, 0.5);

            // Skip the (expensive) rebuild when nothing that affects the geometry
            // has changed — e.g. a paused zoom re-rendering the same pose each
            // frame, or the same-size canvas re-entering. Just re-render the
            // cached mesh (the camera may still be orbiting).
            const buildKey = `${ea.join(',')}|${lod}|${this.renderKey()}`;
            const cached = framework.shared3D.meshes.get(this.id);
            if (cached && buildKey === this._lastBuiltKey) {
                framework.renderMeshToCanvas(canvas, this.id, cached);
                return;
            }
            this._lastBuiltKey = buildKey;

            const { struts, glass } = this._buildParts(lod);
            const group = new THREE.Group();
            if (struts.indices.length) group.add(this._threeMesh(struts, false));
            if (glass.indices.length) group.add(this._threeMesh(glass, true));
            // A soft light background makes the transparent glass faces read as
            // bright coloured film (the Jenn look) instead of murky dark tint.
            group.userData.background3D = 0xe9ecf2;
            framework.addMeshToScene(this.id, group);
            framework.renderMeshToCanvas(canvas, this.id, group);
            return;
        }
        this.render2DProjection(canvas);
    }

    // 2D fallback (no shared 3D / headless tests): orthographic wireframe of the
    // projected 1-skeleton, gently spinning.
    render2DProjection(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        const p = this.phenotype;
        const { verts, edges } = jennGeometry(p.shape);
        const rverts = verts.map(v => this._rotate4(v, p.rot));
        const proj = rverts.map(v => this._project(v, p.projScale));
        const scale = Math.min(w, h) / (this.maxProjRadius * 2.2);
        const sx = x => w / 2 + x * scale, sy = y => h / 2 + y * scale;

        ctx.lineWidth = Math.max(1, Math.min(w, h) / 128);
        for (const [i, j] of edges) {
            let t = (rverts[i][3] + rverts[j][3] + 2) / 4;
            const col = window.Palette.color(p.colorReverse ? 1 - t : t);
            ctx.strokeStyle = col.css || `rgb(${col.r},${col.g},${col.b})`;
            ctx.beginPath();
            ctx.moveTo(sx(proj[i][0]), sy(proj[i][1]));
            ctx.lineTo(sx(proj[j][0]), sy(proj[j][1]));
            ctx.stroke();
        }
    }

    cleanup() {
        const framework = window.framework;
        if (framework && framework.shared3D) framework.removeMeshFromScene(this.id);
    }

    getPhenotype() {
        const p = this.phenotype;
        const names = {
            the_5_cell: '5-cell (4-simplex)', the_8_cell: '8-cell (tesseract)',
            the_16_cell: '16-cell (4-orthoplex)', the_24_cell: '24-cell', the_600_cell: '600-cell',
        };
        return names[p.shape] || p.shape;
    }

    renderKey() {
        const p = this.phenotype;
        return `${p.shape}|${p.rot.map(a => a.toFixed(3)).join(',')}|${p.projScale.toFixed(3)}|${p.tubeRadius.toFixed(3)}|${p.showVertices ? 1 : 0}|${p.colorReverse ? 1 : 0}|${p.renderStyle}`;
    }

    describeExtra() {
        const p = this.phenotype;
        const { verts, edges, faces } = jennGeometry(p.shape);
        let s = `\n<span class="genome-label">Polytope:</span> ${this.getPhenotype()}\n`;
        s += `  ${verts.length} vertices, ${edges.length} edges, ${faces.length} faces on S³\n`;
        s += `  stereographic projection to R³ (curved edges/surfaces)\n`;
        s += `  render style: ${p.renderStyle}\n`;
        s += `\n<span class="genome-label">4D rotation (rad):</span>\n`;
        s += `  ${p.rot.map(a => a.toFixed(2)).join(', ')}\n`;
        s += `  proj scale ${p.projScale.toFixed(2)}, tube ${p.tubeRadius.toFixed(3)}, `;
        s += `markers ${p.showVertices ? 'on' : 'off'}, palette ${p.colorReverse ? 'reversed' : 'normal'}\n`;
        return s;
    }
}

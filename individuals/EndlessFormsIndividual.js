/**
 * EndlessFormsIndividual — CPPN-evolved 3D voxel forms.
 *
 * A homage to EndlessForms.com (Clune, Yosinski, Lipson et al., Cornell), which
 * let users collaboratively evolve 3D shapes on the web. Each voxel of a cubic
 * grid is turned ON or OFF by the output of a single CPPN (Compositional Pattern
 * Producing Network) whose inputs are the voxel's coordinates. A CPPN is just a
 * small network/DAG of heterogeneous activation functions (sin, cos, gaussian,
 * sigmoid, …); because the same network is queried across the whole grid, its
 * regularities (symmetry, repetition, gradients) become the regularities of the
 * shape — which is why random networks already look organism-like.
 *
 * Representation & shape of the phenotype (same plain-data / index-based / acyclic
 * DAG pattern as PhotoFilterIndividual — a pure stateless function, so it's
 * evaluated by a direct memoised walk here rather than instantiated into stateful
 * node objects, i.e. it does NOT use DAGRepresentation.js/buildDAG):
 *   inputs (fixed):  0=x  1=y  2=z  3=d(=|(x,y,z)|)  4=bias(=1)
 *   procs[i]  →  global node index 5+i, reads earlier nodes only (acyclic):
 *                { act, inputs:[idx,…], weights:[w,…], bias }  (out = act(Σ wᵢ·nodeᵢ + bias))
 *   symX:        fold x→|x| before feeding the net → bilateral symmetry (very
 *                common in the EndlessForms gallery — animals, faces, symmetric plants)
 *   outputIndex: which proc node decides occupancy; threshold: voxel ON iff value > threshold
 * The generator is self-contained (top-level consts only, no closure vars, no
 * `new`, `for` loops not `Array.from`) as PTO structural naming requires; the
 * trace is the genotype, this.phenotype is the plain-data network.
 *
 * Meshing (two modes off one cached signed scalar field, _field()):
 *   EF_SMOOTH true  → _smoothMesh(): a smooth iso-surface via Naive Surface Nets
 *                     (the dual of marching cubes — one shared vertex per cell that
 *                     straddles the surface, at the mean of its edge crossings, so
 *                     computeVertexNormals() shades it smooth: the EndlessForms look;
 *                     compact and table-free).
 *   EF_SMOOTH false → _blockyMesh(): "Minecraft" unit cubes with exposed-face culling.
 * The grid is non-cubic — EF_GRID (x/z) × EF_GRID_Y (taller, matching the gallery's
 * portrait forms); the query y-domain scales by EF_GRID_Y/EF_GRID so voxels stay
 * cubic. Height (y) drives the palette colour. Rides the shared Three.js pipeline
 * like the other 3D types, so it gets STL export for free.
 */

// Activation library for the CPPN nodes. A mix of periodic (sin/cos), bounded
// (gauss/sigmoid/tanh), and unbounded-but-clamped (abs/identity/square) functions
// — the classic CPPN palette that yields symmetry, repetition, and smooth
// gradients. Top-level so the isolated generator may reference it.
const EF_ACTIVATIONS = ['sin', 'cos', 'gauss', 'sigmoid', 'tanh', 'abs', 'identity', 'square'];

// Fixed input count: x, y, z, d (radial distance), bias.
const EF_NUM_INPUTS = 5;
// Grid resolution. EF_GRID is the x/z (width/depth) sample count; EF_GRID_Y is the
// vertical one — the EndlessForms gallery is mostly portrait (skulls, lamps, faces
// taller than wide), so raise EF_GRID_Y for taller forms. The query domain's y
// range scales with the ratio (yspan = EF_GRID_Y/EF_GRID) so voxels stay cubic and
// the CPPN pattern isn't vertically stretched — it just gets more room to grow up.
const EF_GRID = 16;
const EF_GRID_Y = 24;
// Render mode: true = smooth iso-surface (Naive Surface Nets, the EndlessForms
// look); false = blocky "Minecraft" voxels (one exposed-face-culled cube per cell).
const EF_SMOOTH = true;
// Spatial frequency the coordinates are fed in at (see _query). It's an evolvable
// GENE per individual (fine Gaussian creep): low ≈ big smooth blobs, high ≈ fine
// ridged detail — evolution tunes it per form. EF_COORD_SCALE_RANGE is the initial
// span; EF_COORD_SCALE is only the fallback for a genome/edit that lacks the gene.
const EF_COORD_SCALE = 3.2;
const EF_COORD_SCALE_RANGE = [1.0, 2.0];

const endlessFormsGenerator = (rnd) => {
    const numProc = rnd.randint(6, 20);
    // Bilateral symmetry: fold x → |x|. Biased ON — most EndlessForms shapes are
    // left-right symmetric, and it reliably produces coherent (non-noisy) forms.
    const symX = rnd.random() < 0.65;

    const procs = [];
    for (let i = 0; i < numProc; i++) {
        const act = rnd.choice(EF_ACTIVATIONS);
        const arity = rnd.randint(1, 3);
        const available = EF_NUM_INPUTS + i; // inputs + earlier procs (keeps it acyclic)
        const inputs = [];
        const weights = [];
        for (let j = 0; j < arity; j++) {
            inputs.push(rnd.randint(0, available - 1));
            weights.push(rnd.uniform(-2.5, 2.5));
        }
        procs.push({ act, inputs, weights, bias: rnd.uniform(-1, 1) });
    }

    // Output reads one of the last few proc nodes (never a bare input), so the
    // evolved network structure actually shows in the form.
    const lastGlobal = EF_NUM_INPUTS + numProc - 1;
    const outputIndex = rnd.randint(EF_NUM_INPUTS + Math.max(0, numProc - 5), lastGlobal);
    // Positive-biased threshold → sparser, more sculptural forms (thresholding a
    // CPPN field is bimodal — mostly all-on/all-off — so a higher cut raises the
    // yield of interesting partial-fill shapes that validate() keeps).
    const threshold = rnd.uniform(0.1, 0.9);
    // Coordinate frequency gene (see EF_COORD_SCALE_RANGE): tunes blobby ↔ intricate.
    const coordScale = rnd.uniform(EF_COORD_SCALE_RANGE[0], EF_COORD_SCALE_RANGE[1]);

    return { procs, symX, outputIndex, threshold, coordScale };
};

const endlessFormsRepresentation = new PTORepresentation(endlessFormsGenerator);

class EndlessFormsIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = endlessFormsRepresentation;
        this.genome = genome || this.representation.generateRandom();
        this.threeDModality = new ThreeDModality();
        this.gx = EF_GRID;
        this.gz = EF_GRID;
        this.gy = EF_GRID_Y;
        this.yspan = EF_GRID_Y / EF_GRID; // taller query domain, cubic voxels
    }

    is3D()             { return true; }
    usesColorPalette() { return true; }

    // Reject degenerate forms so the grid shows interesting sculptures:
    //   1. an output depending on <2 spatial inputs is always a slab (one axis),
    //      a sphere (just d) or a constant — never interesting;
    //   2. empty / near-solid occupancy. (Check 1 first — it's cheap and skips the
    //      field computation for the ones it rejects.) Loose bounds — the search
    //      still finds a valid form within a few tries.
    validate() {
        if (this._outputSpatialDeps() < 2) return false;
        const frac = this._field().count / (this.gx * this.gy * this.gz);
        return frac >= 0.02 && frac <= 0.55;
    }

    // How many distinct SPATIAL inputs (x,y,z,d — inputs 0..3, excluding the
    // constant bias at index 4) the output node transitively depends on through the
    // DAG. Walks the acyclic graph from the output, memoising each node's input set.
    _outputSpatialDeps() {
        const p = this.phenotype;
        const NI = EF_NUM_INPUTS;
        const memo = new Map();
        const deps = (globalIdx) => {
            if (globalIdx < NI) return new Set([globalIdx]);      // a base input node
            if (memo.has(globalIdx)) return memo.get(globalIdx);
            const proc = p.procs[globalIdx - NI];
            const s = new Set();
            if (proc) for (const inIdx of proc.inputs) for (const b of deps(inIdx)) s.add(b);
            memo.set(globalIdx, s);
            return s;
        };
        let spatial = 0;
        for (const b of deps(p.outputIndex)) if (b < NI - 1) spatial++; // exclude bias (index 4)
        return spatial;
    }

    // --- CPPN evaluation ---------------------------------------------------
    _act(name, v) {
        switch (name) {
            case 'sin':      return Math.sin(v);
            case 'cos':      return Math.cos(v);
            case 'gauss':    return Math.exp(-v * v);
            case 'sigmoid':  return 1 / (1 + Math.exp(-v)) * 2 - 1; // → (-1,1) for a symmetric range
            case 'tanh':     return Math.tanh(v);
            case 'abs':      return Math.abs(v);
            case 'square':   return v * v;
            case 'identity':
            default:         return v;
        }
    }

    // Query the CPPN at one point. `values` holds node outputs indexed globally
    // (0..4 inputs, 5+i procs); the graph is acyclic and pre-ordered, so a single
    // forward pass suffices. Node outputs are clamped to keep unbounded activations
    // (identity/square/abs) from exploding.
    _query(x, y, z) {
        const p = this.phenotype;
        const d = Math.sqrt(x * x + y * y + z * z);
        // Feed coordinates at a spatial frequency so the periodic activations
        // (sin/cos) complete multiple periods across the grid — that oscillation is
        // what turns a smooth monotone field (which thresholds to a dull half-space
        // slab) into intricate ridged / repeated / organism-like structure.
        const f = (typeof p.coordScale === 'number') ? p.coordScale : EF_COORD_SCALE;
        const values = [x * f, y * f, z * f, d * f, 1]; // inputs
        const procs = p.procs;
        for (let i = 0; i < procs.length; i++) {
            const node = procs[i];
            let sum = node.bias;
            const inp = node.inputs, w = node.weights;
            for (let j = 0; j < inp.length; j++) {
                const idx = inp[j];
                sum += w[j] * (values[idx >= 0 && idx < values.length ? idx : 0] || 0);
            }
            let out = this._act(node.act, sum);
            out = out < -4 ? -4 : out > 4 ? 4 : out;
            values.push(out);
        }
        const oi = p.outputIndex;
        return values[oi >= 0 && oi < values.length ? oi : values.length - 1] || 0;
    }

    // Scalar field (cached per phenotype). data[i + gx*(j + gy*k)] holds the SIGNED
    // value (threshold − CPPN output), so <0 means "inside/occupied". Sampled at cell
    // centres over the query domain: x,z ∈ [-1,1], y ∈ [-yspan,yspan]; symX folds x→|x|.
    _field() {
        const p = this.phenotype;
        if (this._fieldCache && this._fieldCache.key === p) return this._fieldCache;

        const { gx, gy, gz, yspan } = this;
        const data = new Float32Array(gx * gy * gz);
        const thr = p.threshold;
        let count = 0;
        for (let k = 0; k < gz; k++) {
            const z = ((k + 0.5) / gz) * 2 - 1;
            for (let j = 0; j < gy; j++) {
                const y = (((j + 0.5) / gy) * 2 - 1) * yspan;
                for (let i = 0; i < gx; i++) {
                    let x = ((i + 0.5) / gx) * 2 - 1;
                    if (p.symX) x = Math.abs(x);
                    const v = this._query(x, y, z);
                    data[i + gx * (j + gy * k)] = thr - v; // <0 ⇔ occupied
                    if (v > thr) count++;
                }
            }
        }
        this._fieldCache = { key: p, data, count };
        return this._fieldCache;
    }

    generate3DPoints() {
        return EF_SMOOTH ? this._smoothMesh() : this._blockyMesh();
    }

    // --- Blocky voxels (exposed-face culling → cube surface) ---------------
    // A "Minecraft" surface: one unit cube per occupied cell, emitting only faces
    // whose neighbour is empty. Winding is not managed — the shared MeshPhong
    // material is DoubleSide, so back-facing normals are flipped for shading.
    _blockyMesh() {
        const { gx, gy, gz } = this;
        const { data } = this._field();
        const on = (i, j, k) =>
            i >= 0 && i < gx && j >= 0 && j < gy && k >= 0 && k < gz &&
            data[i + gx * (j + gy * k)] < 0;

        const vertices = [], indices = [], colors = [];
        const CORNERS = [
            [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
            [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
        ];
        const FACES = [
            { d: [1, 0, 0], q: [1, 2, 6, 5] },  { d: [-1, 0, 0], q: [0, 3, 7, 4] },
            { d: [0, 1, 0], q: [3, 2, 6, 7] },  { d: [0, -1, 0], q: [0, 1, 5, 4] },
            { d: [0, 0, 1], q: [4, 5, 6, 7] },  { d: [0, 0, -1], q: [0, 1, 2, 3] },
        ];
        const hx = gx / 2, hy = gy / 2, hz = gz / 2;

        for (let k = 0; k < gz; k++)
            for (let j = 0; j < gy; j++)
                for (let i = 0; i < gx; i++) {
                    if (data[i + gx * (j + gy * k)] >= 0) continue;
                    const col = window.Palette.color(j / (gy - 1)); // height strata
                    const cr = col.r / 255, cg = col.g / 255, cb = col.b / 255;
                    for (const f of FACES) {
                        if (on(i + f.d[0], j + f.d[1], k + f.d[2])) continue; // interior — cull
                        const base = vertices.length / 3;
                        for (const ci of f.q) {
                            const c = CORNERS[ci];
                            vertices.push(i + c[0] - hx, j + c[1] - hy, k + c[2] - hz);
                            colors.push(cr, cg, cb);
                        }
                        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
                    }
                }
        return { vertices, indices, colors };
    }

    // --- Smooth surface (Naive Surface Nets) -------------------------------
    // The dual of marching cubes: place ONE vertex per cell that straddles the
    // isosurface (at the mean of its edge crossings), then stitch adjacent cells'
    // vertices into quads. Vertices are shared between faces, so the shared
    // material's computeVertexNormals() gives smooth (non-faceted) shading — the
    // rounded EndlessForms look. Compact and table-free (unlike marching cubes).
    _smoothMesh() {
        const { gx, gy, gz } = this;
        const { data } = this._field();
        const at = (i, j, k) => data[i + gx * (j + gy * k)];

        const cx = gx - 1, cy = gy - 1, cz = gz - 1;        // cell counts
        const cellVert = new Int32Array(cx * cy * cz).fill(-1);
        const cellIdx = (i, j, k) => i + cx * (j + cy * k);
        const CORNER = [
            [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
            [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
        ];
        // 12 cube edges as corner-index pairs. The first three (0-1, 0-2, 0-4) are
        // the axis edges from corner0 — reused for face generation.
        const EDGE = [
            [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
            [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
        ];
        const AXIS_CORNER = [1, 2, 4];          // corner opposite corner0 per axis
        const STRIDE = [1, cx, cx * cy];        // cell-index stride per axis
        const hx = gx / 2, hy = gy / 2, hz = gz / 2;

        const vertices = [], indices = [], colors = [];
        const g = new Float32Array(8);

        for (let k = 0; k < cz; k++)
            for (let j = 0; j < cy; j++)
                for (let i = 0; i < cx; i++) {
                    let mask = 0;
                    for (let c = 0; c < 8; c++) {
                        const v = at(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2]);
                        g[c] = v;
                        if (v < 0) mask |= 1 << c;
                    }
                    if (mask === 0 || mask === 0xff) continue; // no sign change → no surface

                    // Vertex = mean of the 12 edge crossings (cell-local [0,1] coords).
                    let vx = 0, vy = 0, vz = 0, e = 0;
                    for (let ei = 0; ei < 12; ei++) {
                        const a = EDGE[ei][0], b = EDGE[ei][1], ga = g[a], gb = g[b];
                        if ((ga < 0) === (gb < 0)) continue;
                        const t = ga / (ga - gb);
                        vx += CORNER[a][0] + t * (CORNER[b][0] - CORNER[a][0]);
                        vy += CORNER[a][1] + t * (CORNER[b][1] - CORNER[a][1]);
                        vz += CORNER[a][2] + t * (CORNER[b][2] - CORNER[a][2]);
                        e++;
                    }
                    const s = 1 / e, wy = j + vy * s;
                    cellVert[cellIdx(i, j, k)] = vertices.length / 3;
                    vertices.push(i + vx * s - hx, wy - hy, k + vz * s - hz);
                    const col = window.Palette.color(Math.max(0, Math.min(1, wy / (gy - 1))));
                    colors.push(col.r / 255, col.g / 255, col.b / 255);

                    // For each axis edge from corner0 that changes sign, connect the
                    // four cells sharing it into a quad (needs both perpendicular
                    // neighbours to exist — they share the edge so their vertex is set).
                    const coord = [i, j, k];
                    for (let axis = 0; axis < 3; axis++) {
                        if ((g[0] < 0) === (g[AXIS_CORNER[axis]] < 0)) continue;
                        const iu = (axis + 1) % 3, iv = (axis + 2) % 3;
                        if (coord[iu] === 0 || coord[iv] === 0) continue;
                        const base = cellIdx(i, j, k), du = STRIDE[iu], dv = STRIDE[iv];
                        const A = cellVert[base], B = cellVert[base - du],
                              C = cellVert[base - du - dv], D = cellVert[base - dv];
                        if (A < 0 || B < 0 || C < 0 || D < 0) continue;
                        if (g[0] < 0) indices.push(A, B, C, A, C, D);
                        else          indices.push(A, D, C, A, C, B);
                    }
                }
        return { vertices, indices, colors };
    }

    visualize(canvas) {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            const { vertices, indices, colors } = this.generate3DPoints();
            this.threeDModality.render(canvas, this.id, vertices, indices, colors, framework);
        } else {
            this._render2DFallback(canvas);
        }
    }

    // Minimal 2D fallback (no WebGL / headless): a rotating point cloud of the
    // surface vertices, so the type still renders (and never throws) off the
    // shared 3D scene.
    _render2DFallback(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width, height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const { vertices, colors } = this.generate3DPoints();
        const time = Date.now() * 0.001, rotY = time * 0.5;
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        const scale = Math.min(width, height) / (Math.max(this.gx, this.gy) * 1.6);
        const pts = [];
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
            const x1 = x * cosY - z * sinY;
            const z1 = x * sinY + z * cosY;
            pts.push({
                x: x1 * scale + width / 2,
                y: -y * scale + height / 2,
                z: z1,
                r: colors[i], g: colors[i + 1], b: colors[i + 2],
            });
        }
        pts.sort((a, b) => a.z - b.z);
        for (const pt of pts) {
            ctx.fillStyle = `rgb(${Math.round(pt.r * 255)},${Math.round(pt.g * 255)},${Math.round(pt.b * 255)})`;
            ctx.fillRect(pt.x, pt.y, 2, 2);
        }
    }

    cleanup() {
        const framework = window.framework;
        if (framework && framework.shared3D) framework.removeMeshFromScene(this.id);
    }

    renderKey() {
        return JSON.stringify(this.phenotype) + '|' + window.Palette.name();
    }

    getPhenotype() {
        const p = this.phenotype;
        const frac = (this._field().count / (this.gx * this.gy * this.gz) * 100).toFixed(1);
        const style = EF_SMOOTH ? 'smooth' : 'voxels';
        const f = (typeof p.coordScale === 'number') ? p.coordScale : EF_COORD_SCALE;
        return `CPPN: ${p.procs.length} nodes${p.symX ? ', bilateral' : ''}, freq ${f.toFixed(1)}, ${this.gx}×${this.gy}×${this.gz} ${style}, ${frac}% filled`;
    }

    describeExtra() {
        const p = this.phenotype;
        if (!p || !Array.isArray(p.procs)) return '';
        const name = idx => idx < EF_NUM_INPUTS ? ['x', 'y', 'z', 'd', '1'][idx] : 'n' + (idx - EF_NUM_INPUTS + 1);
        let s = '<span class="genome-label">CPPN (voxel ON iff output &gt; threshold):</span>\n';
        p.procs.forEach((d, i) => {
            const terms = d.inputs.map((idx, j) => `${d.weights[j].toFixed(2)}·${name(idx)}`).join(' + ');
            s += `  n${i + 1} = ${d.act}(${terms}${d.bias >= 0 ? ' + ' : ' - '}${Math.abs(d.bias).toFixed(2)})\n`;
        });
        s += `  output = ${name(p.outputIndex)}, threshold = ${p.threshold.toFixed(3)}\n`;
        const f = (typeof p.coordScale === 'number') ? p.coordScale : EF_COORD_SCALE;
        s += `  symmetry: ${p.symX ? 'bilateral (x→|x|)' : 'none'}, coord frequency: ${f.toFixed(2)}\n`;
        return s;
    }
}

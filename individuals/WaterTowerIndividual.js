/**
 * WaterTowerIndividual — parametric "water towers": layered ring graphs in 3D.
 *
 * The original is a short, non-deterministic Python program (`water_tower.py`)
 * modelling the UCD water tower: rings of nodes stacked in layers, each ring
 * joined into a loop and wired to the ring below, with the rings' radii, twist
 * and heights driven by a handful of random numbers and a small random arithmetic
 * function r(t). Run it twice and you get two towers — the program *implies* a
 * search space without ever writing one down. This is the example from:
 *
 *   McDermott and Carroll, Program Optimisation with Dependency Injection, in
 *   Proceedings of EuroGP 2013, Vienna, Austria, Springer.
 *
 * PODI searched that space by injecting the random-number source into the
 * program and evolving the stream of numbers it consumed. Moraglio's Program
 * Trace Optimisation (PTO) is the refinement of the same idea — record the
 * *trace* of named random decisions and evolve that — and it is the
 * representation every Anemone type already rides. So the port is direct: the
 * generator below is `WaterTower.run()` with `rng` renamed `rnd`, and the type
 * is named for the original paper.
 *
 * Fidelity to the Python, and the few places it departs:
 *   - Same genes, same ranges, same order of draws. `rng.random() * k` becomes
 *     `rnd.uniform(0, k)` so PTO's fine mutation creeps and clamps it in range.
 *   - `grow()` keeps the full-depth-2 grammar (sin, +, -, * over t, 1/π, 1, π),
 *     but chooses the operator *before* expanding it. The Python builds every
 *     alternative and then picks one (`rng.choice([... grow() ...])` evaluates
 *     all seven sub-calls eagerly), which wastes draws but yields the same
 *     distribution; under PTO the eager form would fill the trace with dead genes.
 *     It also emits plain data rather than a string to `eval`.
 *   - `uniform` was drawn but never read, and `join_entire_layer` was hard-wired
 *     True, so neither is a gene here.
 *   - Python 2 integer division (`i/2`, `nnodes/2`) is written out as floor.
 *   - Duplicate edges (possible for small rings) are dropped: overdraw is harmless
 *     in a 2D plot but z-fights in 3D.
 *
 * Geometry: layer i sits at z = height·i + const + rad·sin(freq·i); node k of a
 * ring of size L is at angle 2π(φᵢ + k)/L with radius r(i / nlayers), where φᵢ
 * accumulates the per-layer `offsets` (0 or ½ a node) — which is what twists
 * a stack of rings into an antiprism-like lattice. With `doublep` = 2 the ring
 * sizes alternate n, 2n and the inter-layer wiring fans accordingly.
 *
 * Rendering is rods and balls through the shared Three.js scene (the tower's z
 * is the scene's y, the camera's orbit axis), coloured by height through the
 * palette; ThreeDModality.emitTube/emitBall do the meshing, and STL export is free
 * via generate3DPoints().
 */

const WATER_TOWER_LEAVES = ['t', '1/pi', '1', 'pi'];
const WATER_TOWER_OPS = ['sin', '+', '-', '*'];
const WATER_TOWER_CONNECTIONS = ['self', 'prev+self', 'prev+next', 'self+next'];

// --- the PTO generator: WaterTower.run(), self-contained ---------------------
const waterTowerGenerator = (rnd) => {
    const rad = rnd.uniform(0, 3.0);
    const freq = rnd.uniform(0, 2 * Math.PI);
    const constant = rnd.uniform(0, 1.5);
    const varyHeightAmount = rnd.uniform(0, 0.5);
    const nnodes = rnd.randint(3, 9);
    const nlayers = rnd.randint(2, 9);
    const possibleOffsets = [1, nnodes];
    if (nnodes % 2 === 0) possibleOffsets.push(nnodes / 2);
    if (nnodes % 3 === 0) possibleOffsets.push(nnodes / 3);
    const noffsets = rnd.choice(possibleOffsets);
    const offsets = [];
    for (let i = 0; i < noffsets; i++) offsets.push(rnd.randint(0, 1) * 0.5);
    const connections = rnd.choice(WATER_TOWER_CONNECTIONS);
    const height = rnd.uniform(0, 3.0);
    const varyHeightWithinLayer = rnd.randint(0, 1) === 1;
    const doublep = rnd.randint(1, 2);   // 2: every second ring has twice the nodes
    const phi = rnd.uniform(0, Math.PI);
    // make_arithmetic_fn(rng, 2): a full depth-2 expression in t.
    const grow = (depth) => {
        if (depth === 0) return rnd.choice(WATER_TOWER_LEAVES);
        const op = rnd.choice(WATER_TOWER_OPS);
        if (op === 'sin') return [op, grow(depth - 1)];
        return [op, grow(depth - 1), grow(depth - 1)];
    };
    const radius = grow(2);
    return {
        rad, freq, constant, varyHeightAmount, nnodes, nlayers, offsets, connections,
        height, varyHeightWithinLayer, doublep, phi, radius,
    };
};

const waterTowerRepresentation = new PTORepresentation(waterTowerGenerator);

function waterTowerEval(e, t) {
    if (typeof e === 'string') {
        return e === 't' ? t : e === 'pi' ? Math.PI : e === '1/pi' ? 1 / Math.PI : 1;
    }
    const a = waterTowerEval(e[1], t);
    if (e[0] === 'sin') return Math.sin(a);
    const b = waterTowerEval(e[2], t);
    return e[0] === '+' ? a + b : e[0] === '-' ? a - b : a * b;
}

function waterTowerExprString(e) {
    if (typeof e === 'string') return e === '1/pi' ? '(1/π)' : e === 'pi' ? 'π' : e;
    if (e[0] === 'sin') return `sin(${waterTowerExprString(e[1])})`;
    return `(${waterTowerExprString(e[1])} ${e[0]} ${waterTowerExprString(e[2])})`;
}

class WaterTowerIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = waterTowerRepresentation;
        this.genome = genome || this.representation.generateRandom();
        this.tubeSides = 6;
    }

    is3D() { return true; }
    usesColorPalette() { return true; }

    // The graph: { nodes: [{ xyz, layer, idx }], edges: [[a, b]], layers: [[ids]] }.
    // A pure function of the phenotype, memoised on it (phenotypes are cached
    // per trace, so identity is a sound key).
    graph() {
        const p = this.phenotype;
        if (this._graphFor === p) return this._graph;
        const nodes = [], layers = [], edges = [], seen = new Set();
        const addEdge = (a, b) => {
            if (a === b) return;
            const key = a < b ? `${a},${b}` : `${b},${a}`;
            if (seen.has(key)) return;
            seen.add(key);
            edges.push([a, b]);
        };
        const toSelf = p.connections.includes('self');
        const toPrev = p.connections.includes('prev');
        const toNext = p.connections.includes('next');
        const n = p.nnodes;

        // add_layer()
        for (let j = 0; j < p.nlayers; j++) {
            const lenLayer = p.doublep === 2 ? (j % 2 === 0 ? n : 2 * n) : n;
            const lenPrev = p.doublep === 2 ? (j % 2 === 0 ? 2 * n : n) : n;
            const start = nodes.length;
            const layer = [];
            for (let i = 0; i < lenLayer; i++) layer.push(start + i);
            const prev = j > 0 ? layers[j - 1] : null;
            layers.push(layer);
            for (let i = 0; i < lenLayer; i++) {
                nodes.push({ layer: j, idx: i, xyz: null });
                addEdge(layer[i], layer[(i + 1) % lenLayer]);
                if (!prev) continue;
                if (p.doublep === 1) {
                    if (toSelf) addEdge(layer[i], prev[i]);
                    if (toPrev) addEdge(layer[i], prev[(i - 1 + n) % n]);
                    if (toNext) addEdge(layer[i], prev[(i + 1) % n]);
                } else if (j % 2 === 0) {
                    if (toSelf) addEdge(layer[i], prev[(2 * i) % lenPrev]);
                    if (toPrev) addEdge(layer[i], prev[(lenPrev + 2 * i - 1) % lenPrev]);
                    if (toNext) addEdge(layer[i], prev[(2 * i + 1) % lenPrev]);
                } else {
                    const h = Math.floor(i / 2);
                    if (toSelf) addEdge(layer[i], prev[h]);
                    if (toPrev) addEdge(layer[i], prev[(lenPrev + h - 1) % lenPrev]);
                    if (toNext) addEdge(layer[i], prev[(h + 1) % lenPrev]);
                }
            }
        }

        // run(): place the nodes.
        let phi = p.phi;
        for (let i = 0; i < p.nlayers; i++) {
            phi += p.offsets[i % p.offsets.length];
            const r = waterTowerEval(p.radius, i / p.nlayers);
            const L = layers[i].length;
            for (const id of layers[i]) {
                const idx = nodes[id].idx;
                const theta = (phi + idx) / L;
                let z = p.height * i + p.constant + p.rad * Math.sin(p.freq * i);
                if (L % 2 === 0 && p.varyHeightWithinLayer && idx % 2 === 1) z += p.varyHeightAmount;
                nodes[id].xyz = [r * Math.cos(2 * Math.PI * theta), r * Math.sin(2 * Math.PI * theta), z];
            }
        }
        this._graphFor = p;
        this._graph = { nodes, edges, layers };
        return this._graph;
    }

    // Layer radii r(i / nlayers), the one place the arithmetic function shows.
    radii() {
        const p = this.phenotype;
        const out = [];
        for (let i = 0; i < p.nlayers; i++) out.push(waterTowerEval(p.radius, i / p.nlayers));
        return out;
    }

    // A tower whose every ring has collapsed onto the axis is a vertical line of
    // overlapping balls, not a tower (e.g. r(t) = (t - t)).
    validate() {
        return this.radii().some(r => Math.abs(r) > 0.05);
    }

    // Scene coordinates: the tower's z-up becomes three.js y-up (the camera's
    // orbit axis); y → -z keeps the handedness. Plus each node's palette position
    // (height, normalised) and the overall extent, which sets the rod thickness.
    _sceneNodes() {
        const { nodes } = this.graph();
        const pts = nodes.map(nd => [nd.xyz[0], nd.xyz[2], -nd.xyz[1]]);
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const q of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
        const extent = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
        const span = hi[1] - lo[1] || 1;
        // Kept off the palette's bottom fifth: most palettes start near black,
        // which would lose the tower's base against the black background.
        const ts = pts.map(q => 0.2 + 0.8 * (q[1] - lo[1]) / span);
        return { pts, ts, extent };
    }

    generate3DPoints() {
        const { edges } = this.graph();
        const { pts, ts, extent } = this._sceneNodes();
        const rod = extent * 0.012;
        const out = { vertices: [], indices: [], colors: [] };
        for (const [a, b] of edges) {
            const A = pts[a], B = pts[b];
            if (Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) < 1e-6) continue;
            ThreeDModality.emitTube([A, B], [ts[a], ts[b]], rod, this.tubeSides, out);
        }
        for (let i = 0; i < pts.length; i++) ThreeDModality.emitBall(pts[i], rod * 2.4, ts[i], out);
        return out;
    }

    visualize(canvas) {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            const key = JSON.stringify(this.renderKey());
            const cached = framework.shared3D.meshes.get(this.id);
            if (cached && key === this._lastBuiltKey) {
                framework.renderMeshToCanvas(canvas, this.id, cached);
                return;
            }
            this._lastBuiltKey = key;
            const { vertices, indices, colors } = this.generate3DPoints();
            if (!this.threeDModality) this.threeDModality = new ThreeDModality();
            this.threeDModality.render(canvas, this.id, vertices, indices, colors, framework);
            return;
        }
        this.render2DProjection(canvas);
    }

    // 2D fallback (no shared 3D / headless tests): the graph seen from slightly
    // above, as lines coloured by height.
    render2DProjection(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        const { edges } = this.graph();
        const { pts, ts } = this._sceneNodes();
        const tilt = 0.35, c = Math.cos(tilt), s = Math.sin(tilt);
        const proj = pts.map(q => [q[0], q[1] * c + q[2] * s]);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [x, y] of proj) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const scale = 0.85 * Math.min(w, h) / (Math.max(x1 - x0, y1 - y0) || 1);
        const sx = x => w / 2 + (x - (x0 + x1) / 2) * scale;
        const sy = y => h / 2 - (y - (y0 + y1) / 2) * scale;
        ctx.lineWidth = Math.max(1, Math.min(w, h) / 128);
        for (const [a, b] of edges) {
            const col = window.Palette.color((ts[a] + ts[b]) / 2);
            ctx.strokeStyle = `rgb(${col.r},${col.g},${col.b})`;
            ctx.beginPath();
            ctx.moveTo(sx(proj[a][0]), sy(proj[a][1]));
            ctx.lineTo(sx(proj[b][0]), sy(proj[b][1]));
            ctx.stroke();
        }
    }

    cleanup() {
        const framework = window.framework;
        if (framework && framework.shared3D) framework.removeMeshFromScene(this.id);
    }

    getPhenotype() {
        const p = this.phenotype;
        return `${p.nlayers} rings of ${p.doublep === 2 ? `${p.nnodes}/${2 * p.nnodes}` : p.nnodes}, r(t) = ${waterTowerExprString(p.radius)}`;
    }

    describeExtra() {
        const p = this.phenotype;
        const { nodes, edges } = this.graph();
        let s = `\n<span class="genome-label">Tower:</span> ${nodes.length} nodes, ${edges.length} edges\n`;
        s += `  ${p.nlayers} layers, ring size ${p.doublep === 2 ? `alternating ${p.nnodes} / ${2 * p.nnodes}` : p.nnodes}\n`;
        s += `  wiring to the ring below: ${p.connections}\n`;
        s += `  layer twist offsets: ${p.offsets.join(', ')}\n`;
        s += `\n<span class="genome-label">Radius:</span> r(t) = ${waterTowerExprString(p.radius)}\n`;
        s += `  per layer: ${this.radii().map(r => r.toFixed(2)).join(', ')}\n`;
        s += `\n<span class="genome-label">Height:</span> z(i) = ${p.height.toFixed(2)}·i + ${p.constant.toFixed(2)} + ${p.rad.toFixed(2)}·sin(${p.freq.toFixed(2)}·i)`;
        if (p.varyHeightWithinLayer) s += `, odd nodes +${p.varyHeightAmount.toFixed(2)}`;
        s += `\n\n<span class="genome-label">Reference:</span> McDermott and Carroll, Program Optimisation with Dependency Injection, in Proceedings of EuroGP 2013, Vienna, Austria, Springer.\n`;
        return s;
    }
}

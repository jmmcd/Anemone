/**
 * PSystemIndividual — a membrane-computing (P-system, Gh. Paun) individual.
 *
 * The generator emits a plain-data P-system *specification*: a rooted tree of
 * membranes, each holding an initial multiset of objects (symbols 0..K-1) and a
 * set of non-cooperative rewrite rules (single-symbol lhs -> rhs, each product
 * carrying a target `here`/`out`/`in_j`, the rule optionally dissolving its own
 * membrane). The individual then *simulates* that spec (_simulate: multiset
 * rewriting under maximal parallelism, for `spec.steps` steps, capped/bounded so
 * it always terminates) to get a final configuration, and renders it as a
 * nested luminous cell — membranes are translucent blobs (radius ~ population),
 * objects are palette-coloured particles scattered inside their membrane, dark
 * background + bloom for the bioluminescent look shared with AnemoneIndividual.
 * Like every DAG/tree-structured individual (BranchIndividual, the DAG types),
 * the generator's output is plain data and the individual owns interpretation
 * (here, simulation rather than a direct render), so PTO can compile the
 * generator in isolation — see representations/PTORepresentation.js for the
 * structural-naming constraints this generator has to obey (no closures, no
 * `new`, explicit `for` loops for repeated genes).
 *
 * Layout (_layout): each membrane gets a center + radius (radius ∝
 * sqrt(1+population)), children packed inside their parent on a golden-angle
 * spiral. Deterministic from the simulated population counts, not the PRNG, so
 * it's stable across re-renders of the same phenotype.
 *
 * Membrane shape (_membraneProfile) — NOT a circle: each membrane's outline is a
 * metaball union of its own "body" blob (centred on the membrane) and one blob
 * per child (centred on the child). Where blobs overlap, the boundary bulges
 * outward; where two children are pulled apart, the field between them falls
 * back to the body blob alone and the boundary pinches into a waist — a peanut
 * / figure-eight silhouette, as if the membrane were about to divide. Sampled
 * as a small (angle -> radius) lookup table per membrane — refined past the
 * coarse radial-marching step grid by linear-interpolating the field's
 * threshold crossing, then lightly smoothed (both needed to avoid a jagged,
 * faceted-looking rim) — then rasterized as a filled polygon via scanline fill
 * (cheap, no per-pixel atan2/trig; an earlier per-pixel version of this took
 * ~800ms/render at the 768px zoom size). Particle jitter reads the boundary at
 * the particle's own angle (`profile(ang)`), not a flat circle, so particles
 * stay inside a pinched waist instead of spilling outside it.
 *
 * Tunable "how wobbly" knobs, if you want to push the shape further (all in
 * _membraneProfile / _layout unless noted):
 *   - body-blob radius (currently `0.05 * baseR`) — the membrane's own size
 *     where no child is nearby; smaller = children dominate the shape more.
 *   - child-blob inflate factor (currently `c.r * 1.6`) — how far each child
 *     pulls the boundary outward; bigger = bigger, more separate-looking lobes.
 *   - PS_WOBBLE_MAX_MULT (module const, 2.4) — hard cap on how far any lobe can
 *     reach, as a multiple of the membrane's base radius; also feeds the
 *     canvas-fit shrink below, so raising it can shrink the whole composition a
 *     touch when something pushes close to the cap.
 *   - the smoothing pass (2 rounds of a 3-tap circular box blur, right after
 *     the table is built) trades rim crispness for roundness; fewer passes =
 *     sharper/more dramatic shapes but more visible faceting.
 *   - _layout's `availR`/`spiralR` control how far children sit from the parent
 *     center — two metaball seeds close together just fuse into one bigger
 *     blob, so *separation* (not blob size) is really what drives a
 *     figure-eight vs. a fat circle. Not yet tuned; a promising next lever.
 *   - childCount is `rnd.randint(0, PS_MAX_CHILDREN)` in the generator, so
 *     roughly 1 in 4 membranes at each depth have no children at all (profile
 *     is then `null`, drawn as a plain circle by design) — biasing this toward
 *     >=1 would cut down on "boring circle" individuals in the grid.
 *
 * Canvas fit (_maxReachFromCenter / _scaleTree, called from visualize): the
 * wobble can swell ANY membrane's boundary well past its nominal radius,
 * including a deeply-nested one bulging further out on top of its own offset
 * from center — checking only the root's own wobble isn't enough. Both walk
 * the whole tree; the rescale is a uniform similarity transform about the
 * canvas center, which is safe because every ratio the wobble math reads
 * (child radius / parent radius, distances) is scale-invariant, so it doesn't
 * need to redo the layout or resample the field.
 *
 * Known gotcha, not a bug in this file: Canvas2DModality.bloom's separable
 * Gaussian blur breaks (produces NaN, which the Uint8ClampedArray clamps to 0,
 * wiping the render) when given a non-integer radius. This never fires in the
 * app itself because tile/zoom canvases are always 128 or 768 — both integer
 * multiples of the `res = min(w,h)/128` unit every 2D type scales pixel-sized
 * params by — but an ad-hoc test canvas of an odd size (e.g. 300x300) will
 * trip it. Use a multiple of 128 when exercising bloom-using types headlessly.
 *
 * Out of scope / not implemented (revisit if wanted):
 *   - Evolvable membrane *placement* — the golden-angle spiral is deterministic
 *     from population counts, not a gene, so selection can only push toward
 *     more/less separated children indirectly (via population sizes). Flagged
 *     by jmmcd as a nice follow-on; postponed for now.
 *   - Membrane division/creation mid-run (dissolve only, no split) — the
 *     original design's "future flourish"; the wobble/metaball shape already
 *     gestures at this visually without the drawn tree diverging from the
 *     genome tree.
 *   - Cooperative rules (multi-symbol lhs) — more expressive, easier to make
 *     non-terminating; skipped for the same reason the original design did.
 */

// Bounds live at module scope so they can be referenced from inside the
// generator (structural naming forbids closure variables, but top-level
// consts are fine).
const PS_MAX_DEPTH = 3;     // membrane nesting depth cap (structure bound)
const PS_MAX_CHILDREN = 3;  // max child membranes per membrane
const PS_CAP = 300;         // per-membrane per-symbol object cap (simulation)
const PS_CAP_DOTS = 60;     // max particles drawn per symbol per membrane
const PS_MAX_PARTICLES = 4000; // total drawn-particle guard (runaway safety)
const PS_WOBBLE_MAX_MULT = 2.4; // cap on a membrane's wobbled radius, as a multiple of its base radius

// this.phenotype (generator output):
//   { symbolCount: K, steps: S, seed: int, root: MembraneNode }
// MembraneNode: { objects: [int,...] (length K), rules: [Rule,...], children: [MembraneNode,...] }
// Rule: { lhs: symIndex, rhs: [{ sym, target }, ...], dissolve: bool }
// Target: { kind: 'here' } | { kind: 'out' } | { kind: 'in', child: childIndex }
//
// Non-cooperative rules (single-symbol LHS) plus the per-membrane and
// per-step caps below keep the simulation finite and deterministic.
const pSystemGenerator = (rnd) => {
    // --- global genes ---
    const symbolCount = rnd.randint(3, 6);      // K
    const steps       = rnd.randint(3, 12);
    const seed        = rnd.randint(1, 1000000000);

    // Recursive membrane builder — declared INSIDE the generator (structural
    // naming needs this; it may read symbolCount and the module consts, but
    // must not be a closure over anything outside the generator). No `new`.
    // `for` loops only (see PTORepresentation).
    const buildMembrane = (depth) => {
        // childCount first, so rules can legally target `in_j`.
        const maxKids    = depth < PS_MAX_DEPTH ? PS_MAX_CHILDREN : 0;
        const childCount = maxKids > 0 ? rnd.randint(0, maxKids) : 0;

        // initial multiset (length K)
        const objects = [];
        for (let s = 0; s < symbolCount; s++) objects.push(rnd.randint(0, 6));

        // rules
        const rules = [];
        const numRules = rnd.randint(1, 4);
        for (let r = 0; r < numRules; r++) {
            const lhs = rnd.randint(0, symbolCount - 1);
            const rhsLen = rnd.randint(1, 3);
            const rhs = [];
            for (let p = 0; p < rhsLen; p++) {
                const sym = rnd.randint(0, symbolCount - 1);
                // target: bias to 'here'; 'in' only when children exist
                const roll = rnd.random();
                let target;
                if (childCount > 0 && roll < 0.20) {
                    target = { kind: 'in', child: rnd.randint(0, childCount - 1) };
                } else if (depth > 0 && roll < 0.35) {
                    target = { kind: 'out' };
                } else {
                    target = { kind: 'here' };
                }
                rhs.push({ sym, target });
            }
            // dissolve only for non-root membranes, rarely
            const dissolve = depth > 0 && rnd.random() < 0.12;
            rules.push({ lhs, rhs, dissolve });
        }

        // children (recurse) — explicit for-loop
        const children = [];
        for (let c = 0; c < childCount; c++) children.push(buildMembrane(depth + 1));

        return { objects, rules, children };
    };

    return { symbolCount, steps, seed, root: buildMembrane(0) };
};

// One shared, stateless representation for all individuals of this type.
const pSystemRepresentation = new PTORepresentation(pSystemGenerator);

class PSystemIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = pSystemRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    validate() {
        return this._simulate().list.length > 0;
    }

    // The base renderKey() returns this.phenotype, a plain object, which
    // stringifies as "[object Object]" and would collide across every
    // individual of this type (see PhotoFilterIndividual/PolarCurveIndividual
    // for the same fix). Fold the whole spec into the cache key by hand.
    renderKey() {
        return JSON.stringify(this.phenotype);
    }

    /**
     * Deterministic multiset-rewriting simulation of the phenotype spec, under
     * maximal parallelism. A pure function of this.phenotype (never mutates
     * spec — builds a fresh mutable tree and slice()s the objects arrays), so
     * clones stay isolated and the memo below is safe. Returns
     * { root, list, totalObjects } where `list` is every surviving membrane
     * (dfs order) and `root` is the mutable simulated tree (with .cx/.cy/.r
     * filled in later by _layout).
     */
    _simulate() {
        const spec = this.phenotype;
        if (this._simSpec === spec && this._sim) return this._sim;

        const K = spec.symbolCount;
        let st = (spec.seed >>> 0) || 1;
        const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

        // Build a mutable tree with parent pointers from the (read-only) spec.
        const makeNode = (node, parent) => {
            const m = {
                counts: node.objects.slice(0, K),
                rules: node.rules, parent, children: [], alive: true, dissolve: false
            };
            while (m.counts.length < K) m.counts.push(0);
            for (const ch of node.children) m.children.push(makeNode(ch, m));
            return m;
        };
        const root = makeNode(spec.root, null);

        const dfs = (m, list) => { if (m.alive) { list.push(m); m.children.forEach(c => dfs(c, list)); } };

        for (let step = 0; step < spec.steps; step++) {
            const membranes = []; dfs(root, membranes);
            const adds = [];                 // {m, sym, n} scheduled for after the step
            let applied = false;

            for (const m of membranes) {
                for (let s = 0; s < K; s++) {
                    const n = m.counts[s];
                    if (n <= 0) continue;
                    const matching = m.rules.filter(r => r.lhs === s);
                    if (matching.length === 0) continue;      // no rule -> objects persist
                    applied = true;
                    m.counts[s] = 0;                          // all n consumed (max parallelism)

                    // deterministic split of n across matching rules
                    const base = Math.floor(n / matching.length);
                    let rem = n - base * matching.length;
                    for (const r of matching) {
                        let k = base;
                        if (rem > 0 && rand() < 0.5) { k++; rem--; }   // scatter remainder
                        if (k === 0) continue;
                        if (r.dissolve && m.parent) m.dissolve = true;
                        for (const prod of r.rhs) {
                            let dest = m;
                            if (prod.target.kind === 'out') dest = m.parent || null;   // null = environment (discard)
                            else if (prod.target.kind === 'in') {
                                const c = m.children[prod.target.child];
                                dest = (c && c.alive) ? c : m;
                            }
                            if (dest) adds.push({ m: dest, sym: prod.sym, n: k });
                        }
                    }
                    if (rem > 0) m.counts[s] += rem;   // hand leftover back so nothing is lost
                }
            }

            // apply additions with caps
            for (const a of adds) a.m.counts[a.sym] = Math.min(PS_CAP, a.m.counts[a.sym] + a.n);

            // dissolve marked membranes (deepest-first): merge counts up, reparent children
            const collectDeep = (m, out) => { m.children.forEach(c => collectDeep(c, out)); out.push(m); };
            const order = []; collectDeep(root, order);
            for (const m of order) {
                if (!m.dissolve || !m.parent) continue;
                for (let s = 0; s < K; s++)
                    m.parent.counts[s] = Math.min(PS_CAP, m.parent.counts[s] + m.counts[s]);
                const p = m.parent, idx = p.children.indexOf(m);
                p.children.splice(idx, 1, ...m.children);
                m.children.forEach(c => c.parent = p);
                m.alive = false;
            }

            if (!applied) break;   // halted
        }

        const list = []; dfs(root, list);
        list.forEach(m => m.total = m.counts.reduce((a, b) => a + b, 0));
        this._simSpec = spec;
        this._sim = { root, list, totalObjects: list.reduce((a, m) => a + m.total, 0) };
        return this._sim;
    }

    /**
     * Assign each membrane a center and radius (in place on the simulated
     * tree), packing children inside their parent on a golden-angle spiral.
     * Deterministic from the sim's object counts, not the PRNG.
     */
    _layout(node, cx, cy, r) {
        node.cx = cx; node.cy = cy; node.r = r;
        const kids = node.children;
        if (!kids || kids.length === 0) return;

        const golden = Math.PI * (3 - Math.sqrt(5)); // golden angle in radians
        const n = kids.length;
        const rawR = kids.map(k => Math.sqrt(1 + k.total));
        const maxRaw = Math.max(...rawR);
        const availR = 0.9 * r;
        const childScale = availR / (maxRaw * (1 + 0.6 * Math.sqrt(n)));

        for (let i = 0; i < n; i++) {
            const child = kids[i];
            const childR = Math.max(2, rawR[i] * childScale);
            const spiralR = availR * Math.sqrt((i + 0.5) / n) - childR;
            const dist = Math.max(0, Math.min(spiralR, availR - childR));
            const angle = i * golden;
            this._layout(child, cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, childR);
        }
    }

    /**
     * A membrane's outline as a function of angle: a metaball union of the
     * membrane's own "body" blob (centred on the membrane) and one blob per
     * child (centred on the child). Where blobs overlap they bulge outward
     * together; where they don't (e.g. two children pulled apart), the field
     * between them falls back to the body blob alone, pinching the boundary
     * into a waist — a peanut / figure-eight silhouette, as if the membrane
     * were about to divide. Precomputed as a small lookup table (cheap to
     * build once per membrane, O(1) to sample per pixel). Returns null for a
     * childless membrane (drawn as a plain circle).
     */
    _membraneProfile(node) {
        const kids = node.children;
        if (!kids || kids.length === 0) return null;
        const baseR = node.r;

        // Seeds in node-local coordinates: the body, plus one per child (its
        // own center, inflated a bit so the child sits comfortably inside its
        // lobe rather than right at the edge).
        const seeds = [{ x: 0, y: 0, r: 0.05 * baseR }];
        for (const c of kids) {
            seeds.push({ x: c.cx - node.cx, y: c.cy - node.cy, r: c.r * 1.6 });
        }
        const field = (x, y) => {
            let f = 0;
            for (const s of seeds) {
                const dx = x - s.x, dy = y - s.y;
                f += (s.r * s.r) / (dx * dx + dy * dy + 1);
            }
            return f;
        };

        // Sample the r>=1 isosurface at N angles by marching outward in coarse
        // steps, then refining the last inside/outside pair by linear
        // interpolation of the field (a plain "largest step with f>=1" boundary
        // snaps to the step grid, which reads as a jagged/staircased rim).
        const N = 80, STEPS = 40;
        const maxR = baseR * PS_WOBBLE_MAX_MULT;
        const stepSize = maxR / STEPS;
        const table = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            const theta = (i / N) * Math.PI * 2;
            const ct = Math.cos(theta), st = Math.sin(theta);
            let rIn = 0, fIn = Infinity;
            for (let s = 1; s <= STEPS; s++) {
                const r = s * stepSize;
                const f = field(r * ct, r * st);
                if (f >= 1) { rIn = r; fIn = f; }
            }
            let boundary = Math.max(baseR * 0.3, rIn); // floor: never collapse a lobe/waist to nothing
            if (rIn > 0 && rIn < maxR) {
                const rOut = rIn + stepSize;
                const fOut = field(rOut * ct, rOut * st);
                if (fOut < fIn) {
                    const t = Math.max(0, Math.min(1, (fIn - 1) / (fIn - fOut)));
                    boundary = rIn + t * stepSize;
                }
            }
            table[i] = boundary;
        }
        // A light circular smoothing pass: the field/seed geometry can still
        // leave small per-angle kinks even after the refinement above, which a
        // straight-edged polygon fill renders as visible facets.
        for (let pass = 0; pass < 2; pass++) {
            const prev = table.slice();
            for (let i = 0; i < N; i++) {
                table[i] = (prev[(i - 1 + N) % N] + prev[i] + prev[(i + 1) % N]) / 3;
            }
        }

        const profile = (theta) => {
            const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
            const f = (t / (Math.PI * 2)) * N;
            const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N;
            const frac = f - Math.floor(f);
            return table[i0] * (1 - frac) + table[i1] * frac;
        };
        // The theoretical worst case (baseR * PS_WOBBLE_MAX_MULT) is far bigger
        // than what most shapes actually reach; a fill loop bounded by it would
        // scan a mostly-empty box (and for a large membrane, most of the
        // canvas). Expose the table's real maximum so callers can bound their
        // scan by what was actually drawn instead.
        let maxTableR = 0;
        for (let i = 0; i < N; i++) if (table[i] > maxTableR) maxTableR = table[i];
        profile.maxR = maxTableR;
        // Raw samples, for rasterizing the outline as a polygon (cheap: N
        // trig calls total) instead of evaluating profile(theta) — with an
        // atan2 — at every pixel in the fill loop.
        profile.table = table;
        profile.N = N;
        return profile;
    }

    /** Uniformly rescale a simulated (post-layout) tree about (cx0, cy0). Ratios
     * between a node's radius/position and its children are scale-invariant, so
     * this can be applied after the fact to shrink a wobble-swollen tree to fit
     * the canvas without redoing the layout or the wobble math. */
    _scaleTree(node, cx0, cy0, scale) {
        node.r *= scale;
        node.cx = cx0 + (node.cx - cx0) * scale;
        node.cy = cy0 + (node.cy - cy0) * scale;
        node.children.forEach(c => this._scaleTree(c, cx0, cy0, scale));
    }

    /**
     * How far this node's (wobbled) boundary reaches from the canvas center,
     * at worst, over the whole subtree. A deeply-nested child can bulge
     * outward *on top of* its own offset from center, so checking only the
     * root's wobble isn't enough — a grandchild near the packing edge can
     * push past the root's boundary (and off the canvas) even after the root
     * alone would appear to fit.
     */
    _maxReachFromCenter(node, cx0, cy0) {
        const profile = this._membraneProfile(node);
        const localMax = profile ? profile.maxR : node.r;
        let reach = Math.hypot(node.cx - cx0, node.cy - cy0) + localMax;
        for (const c of node.children) reach = Math.max(reach, this._maxReachFromCenter(c, cx0, cy0));
        return reach;
    }

    /**
     * Alpha-blend a filled disc (or, with a `profile` from _membraneProfile, a
     * wobbled blob) into an ImageData buffer — translucent membranes.
     * `inset` shrinks the boundary uniformly (used to paint the cytoplasm
     * inside the rim, following the same wobbled contour).
     */
    _fillDiscBlend(data, width, height, cx, cy, radius, color, alpha, profile = null, inset = 0) {
        if (radius <= 0) return;
        if (profile) {
            // Rasterize the wobbled outline as a polygon: N trig calls total
            // (one per vertex) instead of evaluating profile(theta) — an
            // atan2 plus a table lookup — at every pixel in the fill box,
            // which for a large membrane is most of the canvas.
            const { table, N } = profile;
            const pts = new Array(N);
            for (let i = 0; i < N; i++) {
                const theta = (i / N) * Math.PI * 2;
                const r = Math.max(0, table[i] - inset);
                pts[i] = { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
            }
            this._fillPolygonBlend(data, width, height, pts, color, alpha);
            return;
        }
        const a = alpha / 255;
        const r2 = radius * radius;
        const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width, Math.ceil(cx + radius));
        const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height, Math.ceil(cy + radius));
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const dx = x - cx, dy = y - cy;
                const dist2 = dx * dx + dy * dy;
                if (dist2 > r2) continue;
                if (inset > 0 && dist2 > (radius - inset) * (radius - inset)) continue;
                const i = (y * width + x) * 4;
                data[i] = data[i] * (1 - a) + color.r * a;
                data[i + 1] = data[i + 1] * (1 - a) + color.g * a;
                data[i + 2] = data[i + 2] * (1 - a) + color.b * a;
                data[i + 3] = 255;
            }
        }
    }

    /** Alpha-blend a filled (possibly concave) polygon via scanline fill —
     * cheap per pixel (no trig), used for wobbled membrane outlines. */
    _fillPolygonBlend(data, width, height, points, color, alpha) {
        const a = alpha / 255;
        const n = points.length;
        let minY = Infinity, maxY = -Infinity;
        for (const p of points) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
        const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(height, Math.ceil(maxY));
        const xs = [];
        for (let y = y0; y < y1; y++) {
            const yc = y + 0.5;
            xs.length = 0;
            for (let i = 0; i < n; i++) {
                const p1 = points[i], p2 = points[(i + 1) % n];
                if ((p1.y <= yc && p2.y > yc) || (p2.y <= yc && p1.y > yc)) {
                    xs.push(p1.x + (yc - p1.y) / (p2.y - p1.y) * (p2.x - p1.x));
                }
            }
            xs.sort((u, v) => u - v);
            for (let i = 0; i + 1 < xs.length; i += 2) {
                const xa = Math.max(0, Math.round(xs[i])), xb = Math.min(width, Math.round(xs[i + 1]));
                for (let x = xa; x < xb; x++) {
                    const idx = (y * width + x) * 4;
                    data[idx] = data[idx] * (1 - a) + color.r * a;
                    data[idx + 1] = data[idx + 1] * (1 - a) + color.g * a;
                    data[idx + 2] = data[idx + 2] * (1 - a) + color.b * a;
                    data[idx + 3] = 255;
                }
            }
        }
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }

            const res = Math.min(width, height) / 128;
            const spec = this.phenotype;
            const K = spec.symbolCount;
            const sim = this._simulate();
            const cx0 = width / 2, cy0 = height / 2;
            this._layout(sim.root, cx0, cy0, 0.46 * Math.min(width, height));

            // The wobble can swell any membrane's drawn boundary well past its
            // nominal radius — including a deeply-nested one bulging further
            // out on top of its own offset from center. Find the true worst
            // case over the whole tree and, if it would spill off the canvas
            // (or into the bloom halo), shrink everything uniformly to fit.
            // Ratios are scale-invariant, so this doesn't need to redo layout
            // or the wobble math.
            const maxReach = this._maxReachFromCenter(sim.root, cx0, cy0);
            const safeR = 0.5 * Math.min(width, height) - 3 * res;
            if (maxReach > safeR) this._scaleTree(sim.root, cx0, cy0, safeR / maxReach);

            // Particle jitter PRNG re-seeded from spec.seed; the draw walk below
            // visits nodes/symbols/dots in a fixed order for a given phenotype,
            // so placement is stable across renders.
            let st = (spec.seed >>> 0) || 1;
            const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
            let budget = PS_MAX_PARTICLES;

            const drawMembrane = (node, depth) => {
                const depthT = Math.min(1, depth / (PS_MAX_DEPTH + 1));
                const rimColor = window.Palette.color(0.5 + 0.15 * depthT);
                const cytoColor = window.Palette.color(0.12 + 0.06 * depthT);
                const rimWidth = Math.max(1, Math.round(1.5 * res));
                const profile = this._membraneProfile(node);
                this._fillDiscBlend(data, width, height, node.cx, node.cy, node.r, rimColor, 55, profile, 0);
                this._fillDiscBlend(data, width, height, node.cx, node.cy, node.r, cytoColor, 65, profile, rimWidth);

                for (let s = 0; s < K && budget > 0; s++) {
                    const c = node.counts[s];
                    if (c <= 0) continue;
                    const color = window.Palette.color(s / Math.max(1, K - 1));
                    const dotCount = Math.min(c, PS_CAP_DOTS, budget);
                    const dotR = Math.max(0.4, 0.5 * res) * (1 + Math.min(0.6, c / PS_CAP_DOTS));
                    for (let d = 0; d < dotCount; d++) {
                        const ang = rand() * Math.PI * 2;
                        // Jitter within the membrane's actual (possibly
                        // wobbled/pinched) boundary at this angle, not a plain
                        // circle of radius node.r — otherwise particles land
                        // outside a narrow waist.
                        const boundR = profile ? profile(ang) : node.r;
                        const rad = Math.sqrt(rand()) * 0.8 * boundR;
                        Canvas2DModality.drawCircle(
                            data, width, height,
                            node.cx + Math.cos(ang) * rad, node.cy + Math.sin(ang) * rad,
                            dotR, color
                        );
                        budget--;
                    }
                }

                node.children.forEach(child => drawMembrane(child, depth + 1));
            };
            drawMembrane(sim.root, 0);

            Canvas2DModality.bloom(imageData, { radius: 2 * res, strength: 1.0, background: { r: 0, g: 0, b: 0 } });
            return imageData;
        });
    }

    // Concise genome-panel phenotype (the raw spec is verbose and doubles as
    // trace context via _formatGenomeSection).
    getPhenotype() {
        const s = this.phenotype, sim = this._simulate();
        return `${sim.list.length} membranes, ${s.symbolCount} symbols, `
             + `${sim.totalObjects} objects after ${s.steps} steps`;
    }

    // Type-specific detail: rule count, and final population per membrane/depth.
    describeExtra() {
        const s = this.phenotype, sim = this._simulate();
        let totalRules = 0;
        const countRules = (n) => { totalRules += n.rules.length; n.children.forEach(countRules); };
        countRules(s.root);

        const depthOf = (m) => { let d = 0, p = m.parent; while (p) { d++; p = p.parent; } return d; };

        let out = `<span class="genome-label">P-System:</span>\n`;
        out += `  ${totalRules} rules across ${sim.list.length} membranes\n`;
        sim.list.forEach((m, i) => {
            out += `  membrane ${i} (depth ${depthOf(m)}): ${m.total} objects\n`;
        });
        return out;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PSystemIndividual;
}

// StructuralInformationIndividual
//
// An evolvable, generative reading of Emanuel Leeuwenberg's Structural
// Information Theory (SIT). SIT is normally an *analysis* theory of visual
// perception: given a figure, find the shortest code in a little language of
// regularities — the minimum-information-load code is the preferred percept
// (a formalised descendant of Gestalt Prägnanz). Here we run it *backwards*:
// we generate codes and decode them to figures. The minimum principle then
// stops being a search objective and becomes a *prior baked into the
// representation* — short SIT codes decode to regular, symmetric, repetitive
// (i.e. Prägnant) figures, so random codes already look like ornaments.
//
// The code language. A code is a tree over a turtle alphabet, built from
// primitives and the three "holographic" regularities SIT is grounded on:
//
//   prim  {turn, len, draw}   one contour step: turn, then move `len` (drawing
//                             unless draw=false — a pen-up move, which is how
//                             SIT gets *multi-part* figures without branching:
//                             a single traversal visits every part, hidden
//                             moves connecting them).
//   seq   [c1 c2 …]           concatenation (grouping).
//   iter  n*(c)              ITERATION: the chunk repeated n times. Because the
//                             chunk carries a net turn, iteration closes into
//                             polygons / rosettes on its own.
//   sym   S[c]               SYMMETRY: the chunk, then the chunk again reversed
//                             with its turns negated. In a continuing turtle
//                             this is a clean *point (2-fold rotational)*
//                             symmetry (verified: reverse+negate = rotation by
//                             180° about the join). True mirror-across-an-axis
//                             needs first-class geometric loci (reflect the
//                             accumulated points about an axis), which is the
//                             salient-points / group-operation extension we
//                             deliberately deferred — it can't be done with pure
//                             relative turtle commands.
//   alt   A[k : s1 s2 …]     ALTERNATION: a constant chunk k distributed before
//                             each element of a series (k s1 k s2 … k sn).
//
// The whole thing is what makes it SIT and not "turtle-with-random-mirrors":
// each operator generates its child chunk *once* and replicates it, so the
// replicated structure is genuinely reused and a mutation to a chunk propagates
// to all its copies (the regularity is heritable). Everything is one linear
// contour, faithful to SIT's contour-trace ontology — which is exactly what a
// turtle is, so "draw from the previous endpoint" is the native semantics, not
// an imposed choice.
//
// Alphabet (metric, discrete). One commensurable "45° family" so figures
// actually close: turns are multiples of 45°, lengths ∈ {1, √2, 2} (√2 present
// so a right-isosceles diagonal closes). A single angle family keeps a figure
// tied to one rotational symmetry, which is what makes iterated motifs coherent.
//
// Structural information load (SIL). SIT's load is the number of elements you
// must *independently specify* in the compact (un-expanded) code — reuse is
// free (n*(chunk) costs the chunk once plus the count n, not n chunks). Since
// our genome *is* the compact tree, we report it directly: primitives + operator
// parameters. Honest caveat: this is the load of *this* code, not the true
// minimal load of the figure it draws (we generate codes, we don't solve the
// minimisation), so it over-states load for a redundantly-written figure.
//
// Like every type it is PTO-backed (default fine/structural operators): the
// generator emits the code as *plain data* (no `new`, self-contained, for-loops
// not Array.from — the structural-naming rules in PTORepresentation), and the
// individual decodes it. See CLAUDE.md for the composition pattern.

// --- Alphabet, as top-level consts so the structural-naming compiler can
// resolve them when it compiles sitGenerator in isolation. ---
const SIT_TURNS = [-135, -90, -45, 45, 90, 135, 180];
const SIT_LENS = [1, Math.SQRT2, 2];
// Weighted pool for a primitive's mode: mostly strokes, some dots, a few pen-up
// moves. A weighted array (rather than probabilities) so PTO's 'fine' mutation
// resamples it like any other categorical gene.
const SIT_MODES = ['stroke', 'stroke', 'stroke', 'dot', 'move'];
const SIT_MAX_DEPTH = 4;         // code-tree recursion depth
const SIT_MAX_COMMANDS = 8000;   // expansion guard (nested iter/alt can multiply)

// Self-contained PTO generator: builds a random SIT code as a plain-data tree.
// Single recursion (like treeGenerator); children built with explicit for-loops.
// The trace of decisions is the genotype; this tree is the phenotype.
const sitGenerator = (rnd) => {
    const build = (depth) => {
        // A primitive contour step: a turn from the discrete family, a length
        // from the commensurable set, and a pen-down/up flag (pen-up = a hidden
        // connecting move → multi-part figures). Leaves only at the bottom, else
        // a modest leaf chance so operators dominate the upper tree (richer,
        // more regular figures rather than a few loose strokes).
        if (depth <= 1 || rnd.random() < 0.25) {
            return {
                kind: 'prim',
                turn: rnd.choice(SIT_TURNS),
                len: rnd.choice(SIT_LENS),
                // Three contour modes: draw a stroke, stamp a dot (SIT's point
                // primitive `0`, for dot patterns), or move without marking
                // (pen-up → multi-part figures). Weighted stroke-dominant.
                mode: rnd.choice(SIT_MODES),
            };
        }
        const r = rnd.random();
        if (r < 0.30) {
            // seq: a group of 2-3 sub-chunks concatenated.
            const n = rnd.randint(2, 3);
            const children = [];
            for (let i = 0; i < n; i++) children.push(build(depth - 1));
            return { kind: 'seq', children };
        } else if (r < 0.62) {
            // iter: repeat one chunk n times. `anchored` (via internal push/pop)
            // replicates the chunk about a fixed reference point instead of
            // chaining it — a rosette (transform 'turn' = rotate between copies)
            // or a row/grid ('move' = translate), decoupled from the chunk's own
            // displacement. Chained (anchored=false) is the original contour form.
            const anchored = rnd.random() < 0.5;
            const tKind = anchored ? rnd.choice(['turn', 'move']) : 'turn';
            const tVal = !anchored ? 0
                : (tKind === 'turn' ? rnd.choice(SIT_TURNS) : rnd.choice(SIT_LENS));
            return { kind: 'iter', n: rnd.randint(3, 7), child: build(depth - 1), anchored, tKind, tVal };
        } else if (r < 0.85) {
            // sym: mirror=false → point (2-fold rotational) symmetry (reverse +
            // negate); mirror=true → true bilateral reflection (via the flip flag).
            return { kind: 'sym', child: build(depth - 1), mirror: rnd.random() < 0.5 };
        }
        // alt: a constant chunk distributed across a series of chunks.
        const n = rnd.randint(2, 4);
        const series = [];
        for (let i = 0; i < n; i++) series.push(build(depth - 1));
        return { kind: 'alt', constant: build(depth - 1), series };
    };
    // The root is always a multi-part group, so a figure has several related
    // sub-codes rather than collapsing to one small stroke (SIT's superstructure
    // over subordinate parts).
    const parts = rnd.randint(2, 3);
    const roots = [];
    for (let i = 0; i < parts; i++) roots.push(build(SIT_MAX_DEPTH));
    return { kind: 'seq', children: roots };
};

// One shared, stateless representation for all individuals of this type
// (swappable live via the Generator code editor).
const sitRepresentation = new PTORepresentation(sitGenerator);

class StructuralInformationIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = this.defaultRepresentation();
        this.genome = genome || this.representation.generateRandom();
    }

    // The shared representation for this type. A subclass can swap the generator
    // (discrete vs continuous alphabet) by overriding just this — no constructor
    // or other code needed. See StructuralInformationContinuousIndividual.
    defaultRepresentation() { return sitRepresentation; }

    usesColorPalette() { return true; }

    validate() {
        return this.buildPaths().length > 0;
    }

    // The object phenotype would stringify to "[object Object]" and collide in
    // Canvas2DModality.renderCached's key, so key on a precise serialisation of
    // the code tree (precise, not the rounded display string, so a tiny
    // continuous-gene creep still re-renders).
    renderKey() {
        return JSON.stringify(this.phenotype);
    }

    // --- Decoding: code tree → flat list of contour commands {turn,len,draw} ---
    // Each operator expands its child ONCE and replicates the result, which is
    // what realises the reuse/regularity. A shared counter caps runaway nesting.
    expandCode() {
        const root = this.phenotype;
        const out = [];
        const state = { count: 0 };
        StructuralInformationIndividual._expand(root, out, state);
        return out;
    }

    static _expand(node, out, state) {
        if (!node || state.count > SIT_MAX_COMMANDS) return;
        switch (node.kind) {
            case 'prim':
                out.push({ turn: node.turn, len: node.len, mode: node.mode || 'stroke' });
                state.count++;
                break;
            case 'seq':
                for (const c of node.children) this._expand(c, out, state);
                break;
            case 'iter': {
                const child = [];
                this._expand(node.child, child, state);
                // Between-copy transform (anchored only): a pure rotation
                // ({turn:θ,len:0}) or a pen-up translation ({len:d}), applied at
                // the shared anchor between copies.
                const xform = node.tKind === 'move'
                    ? { turn: 0, len: node.tVal, mode: 'move' }
                    : { turn: node.tVal, len: 0, mode: 'move' };
                for (let i = 0; i < node.n && state.count <= SIT_MAX_COMMANDS; i++) {
                    if (node.anchored) {
                        // push/pop each copy so it is drawn from the shared anchor
                        // (its displacement is discarded), then advance the anchor.
                        out.push({ ctrl: 'push' });
                        for (const cmd of child) out.push(cmd);
                        out.push({ ctrl: 'pop' });
                        if (i < node.n - 1) out.push(xform);
                    } else {
                        for (const cmd of child) out.push(cmd);
                    }
                    state.count += child.length + 3;
                }
                break;
            }
            case 'sym': {
                const child = [];
                this._expand(node.child, child, state);
                const hasControl = child.some(c => c.ctrl);
                if (node.mirror) {
                    // True bilateral reflection: draw the chunk, return to the
                    // anchor, flip handedness, draw it again (all turns negated →
                    // mirror across the anchor's heading axis), then flip back.
                    out.push({ ctrl: 'push' });
                    for (const cmd of child) out.push(cmd);
                    out.push({ ctrl: 'pop' });
                    out.push({ ctrl: 'flip' });
                    for (const cmd of child) out.push(cmd);
                    out.push({ ctrl: 'flip' });
                } else if (!hasControl) {
                    // Point (2-fold rotational) symmetry as a connected contour:
                    // the chunk, then the chunk reversed with negated turns. Only
                    // valid for a pure-step chunk (reversing push/pop would break
                    // the stack), hence the hasControl guard.
                    for (const cmd of child) out.push(cmd);
                    for (let i = child.length - 1; i >= 0; i--) {
                        out.push({ turn: -child[i].turn, len: child[i].len, mode: child[i].mode });
                    }
                } else {
                    // Chunk contains control ops: point symmetry the safe way —
                    // the chunk, then a 180°-rotated copy about the anchor.
                    out.push({ ctrl: 'push' });
                    for (const cmd of child) out.push(cmd);
                    out.push({ ctrl: 'pop' });
                    out.push({ turn: 180, len: 0, mode: 'move' });
                    for (const cmd of child) out.push(cmd);
                }
                state.count += child.length * 2 + 4;
                break;
            }
            case 'alt': {
                const constant = [];
                this._expand(node.constant, constant, state);
                for (const el of node.series) {
                    if (state.count > SIT_MAX_COMMANDS) break;
                    for (const cmd of constant) out.push(cmd);
                    state.count += constant.length;
                    this._expand(el, out, state);
                }
                break;
            }
        }
    }

    // Turtle-interpret the expanded commands → a list of visible marks. Each
    // command turns, then moves `len`, and depending on its mode draws a stroke
    // over that move ({type:'line',…}), stamps a dot at the new position
    // ({type:'dot',…}), or marks nothing (pen-up 'move'). colorIndex walks the
    // palette along the path. Pen-up moves contribute no mark (so they don't
    // inflate the fit-to-canvas bounds), only reposition the turtle.
    buildPaths() {
        const commands = this.expandCode();
        if (commands.length === 0) return [];

        const marks = [];
        let x = 0, y = 0, heading = 0, hand = 1; // hand = ±1 handedness (flip → mirror)
        const stack = [];
        const total = commands.length;

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            if (cmd.ctrl) {
                if (cmd.ctrl === 'push') stack.push({ x, y, heading, hand });
                else if (cmd.ctrl === 'pop') {
                    if (stack.length) { const s = stack.pop(); x = s.x; y = s.y; heading = s.heading; hand = s.hand; }
                } else if (cmd.ctrl === 'flip') hand = -hand;
                continue;
            }
            heading = (heading + hand * cmd.turn) % 360; // flip negates turns → reflection
            const rad = (heading * Math.PI) / 180;
            const nx = x + Math.cos(rad) * cmd.len;
            const ny = y + Math.sin(rad) * cmd.len;
            const colorIndex = 0.2 + 0.8 * (i / total); // off near-black at t≈0
            if (cmd.mode === 'dot') {
                marks.push({ type: 'dot', x: nx, y: ny, colorIndex });
            } else if (cmd.mode !== 'move') {
                marks.push({ type: 'line', x1: x, y1: y, x2: nx, y2: ny, colorIndex });
            }
            x = nx;
            y = ny;
        }
        return marks;
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            }

            const marks = this.buildPaths();
            if (marks.length === 0) return imageData;

            // Resolution-independent pixel units (tiles 128px, zoom 768px).
            const s = Math.min(width, height) / 128;

            // Fit the visible marks (line endpoints + dot centres) to the canvas.
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            marks.forEach(p => {
                if (p.type === 'dot') {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                } else {
                    minX = Math.min(minX, p.x1, p.x2); maxX = Math.max(maxX, p.x1, p.x2);
                    minY = Math.min(minY, p.y1, p.y2); maxY = Math.max(maxY, p.y1, p.y2);
                }
            });
            const margin = 12 * s;
            const drawW = maxX - minX, drawH = maxY - minY;
            let scale = 1;
            if (drawW > 0 && drawH > 0) {
                scale = Math.min((width - 2 * margin) / drawW, (height - 2 * margin) / drawH);
            } else if (drawW > 0) {
                scale = (width - 2 * margin) / drawW;
            } else if (drawH > 0) {
                scale = (height - 2 * margin) / drawH;
            }
            const offsetX = (width - drawW * scale) / 2 - minX * scale;
            const offsetY = (height - drawH * scale) / 2 - minY * scale;

            const lineWidth = Math.max(1, 1.6 * s);
            const dotRadius = Math.max(1.5, 2.2 * s);
            marks.forEach(p => {
                const color = window.Palette.color(p.colorIndex);
                if (p.type === 'dot') {
                    Canvas2DModality.drawCircle(
                        data, width, height,
                        p.x * scale + offsetX, p.y * scale + offsetY,
                        dotRadius, color
                    );
                } else {
                    Canvas2DModality.drawThickLine(
                        data, width, height,
                        p.x1 * scale + offsetX, p.y1 * scale + offsetY,
                        p.x2 * scale + offsetX, p.y2 * scale + offsetY,
                        color, lineWidth
                    );
                }
            });

            // A soft palette-coloured glow, to read as luminous line-art.
            Canvas2DModality.bloom(imageData, { radius: Math.round(2 * s), strength: 0.5, background: 0 });
            return imageData;
        });
    }

    // --- SIT notation + structural information load ---

    // Render a code tree in SIT-ish notation, e.g. 4*(90/1 45/√2), S[…], A[k : …].
    static codeToString(node) {
        if (!node) return '';
        // Integers plain, √2 labelled, other reals (continuous alphabet) to 2dp.
        const fmt = (v) => {
            if (Math.abs(v - Math.SQRT2) < 1e-6) return '√2';
            return Number.isInteger(v) ? String(v) : v.toFixed(2);
        };
        switch (node.kind) {
            case 'prim': {
                const step = `${fmt(node.turn)}/${fmt(node.len)}`;
                // Mode prefix: • dot (point primitive), ~ pen-up move, none stroke.
                if (node.mode === 'dot') return `•${step}`;
                if (node.mode === 'move') return `~${step}`;
                return step;
            }
            case 'seq':
                return `(${node.children.map(c => this.codeToString(c)).join(' ')})`;
            case 'iter': {
                // n*(…) chained; n⟳θ(…) anchored rosette; n⇉d(…) anchored row.
                const op = node.anchored
                    ? (node.tKind === 'move' ? `${node.n}⇉${fmt(node.tVal)}` : `${node.n}⟳${fmt(node.tVal)}`)
                    : `${node.n}*`;
                return `${op}(${this.codeToString(node.child)})`;
            }
            case 'sym':
                // S[…] point symmetry; M[…] bilateral mirror.
                return `${node.mirror ? 'M' : 'S'}[${this.codeToString(node.child)}]`;
            case 'alt':
                return `A[${this.codeToString(node.constant)} : ${node.series.map(s => this.codeToString(s)).join(' ')}]`;
            default:
                return '';
        }
    }

    // Count primitives and operators in the compact tree (the SIL ingredients).
    static countLoad(node, acc = { prims: 0, ops: 0 }) {
        if (!node) return acc;
        switch (node.kind) {
            case 'prim': acc.prims++; break;
            case 'seq': node.children.forEach(c => this.countLoad(c, acc)); break;
            case 'iter': acc.ops++; this.countLoad(node.child, acc); break;
            case 'sym': acc.ops++; this.countLoad(node.child, acc); break;
            case 'alt':
                acc.ops++;
                this.countLoad(node.constant, acc);
                node.series.forEach(s => this.countLoad(s, acc));
                break;
        }
        return acc;
    }

    getPhenotype() {
        const { prims, ops } = StructuralInformationIndividual.countLoad(this.phenotype);
        const expanded = this.expandCode().length;
        return `SIT code — load ${prims + ops} (${prims} primitives + ${ops} operators) → ${expanded} contour steps`;
    }

    describeExtra() {
        const { prims, ops } = StructuralInformationIndividual.countLoad(this.phenotype);
        const load = prims + ops;
        const expanded = this.expandCode().length;
        const ratio = load > 0 ? (expanded / load).toFixed(1) : '—';
        const code = StructuralInformationIndividual.codeToString(this.phenotype);
        let s = '\n<span class="genome-label">Structural information load:</span>\n';
        s += `  ${load} elements (${prims} primitives + ${ops} operators)\n`;
        s += `  → ${expanded} contour steps expanded  (compression ×${ratio})\n`;
        s += '\n<span class="genome-label">Code:</span>\n';
        s += `  ${this._escapeHtml(code)}\n`;
        return s;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StructuralInformationIndividual;
}

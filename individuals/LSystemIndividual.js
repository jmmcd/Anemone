// LSystemIndividual
//
// A reimplementation of the L-system evolver from ponyge (an old GE system by
// jmmcd): lsystem.py + drawing.py + lsystem.bnf. It evolves a Lindenmayer
// system — an axiom plus a set of rewrite rules — and renders the expanded
// string with a turtle. This is faithful to the ponyge design, including the
// *unusual* turtle commands from drawing.py's `Drawing` class (the attract /
// repulse "force field" feature is deliberately dropped, as requested).
//
// Pipeline: generator → L-system spec (plain data) → expand() rewrites the
// axiom `depth` times → a command string → turtle interpretation → primitives
// (lines / dots / filled polygons) → pixels. The generator only produces plain
// data (no turtle, no `new`), matching how BranchIndividual / RobotIndividual
// stay within PTO's structural-naming constraints; expansion and drawing live
// in the individual (as Tree → buildTreeNode, DAG → buildDAG do).
//
// The turtle alphabet (from drawing.py):
//   F   forward, drawing a line          f   forward, no drawing
//   +   turn right by the current angle  -   turn left by the current angle
//   [   push state    ]   pop state      (branches; save/restore pos+heading+colour+width+step)
//   C   draw a circular arc (radius = step, sweep = circleAngle)
//   D   draw a dot
//   S / s   grow / shrink the step size (clamped)      A / a   cycle the angle up / down a fixed table
//   {   begin a filled polygon   }   end and fill it
//   n / m   walk the PEN colour  + / -   along a circular palette   (the distinctive ponyge feature)
//   N / M   walk the FILL colour + / -   along the same palette
//   w / W   thin / thicken the pen
//   X / Y   no-op "variables" (exist only to be rewritten by rules)
//
// In ponyge the whole `Drawing(LSystem(...), depth, angle, step, ...)` call was
// itself GE-generated from lsystem.bnf; here the equivalent search space is the
// self-contained generator below, editable live via the Generator Code editor.

// --- Turtle / L-system vocabulary (top-level consts so the generator, compiled
// --- in isolation for structural naming, may reference them). ---

// Angle table cycled through by A / a and indexed by the evolved `angleIndex`
// (the ponyge set_angles, including its 360/11 and 360/7 oddities).
const LSYS_SET_ANGLES = [10, 12, 15, 20, 24, 27.5, 30, 360 / 11, 36, 40, 45, 360 / 7, 60, 72, 90];

// Symbols a rule may rewrite (and that may appear in axioms / right-hand sides).
// F is both a drawing command AND a rewrite variable (as in classic L-systems);
// X and Y are pure variables that only carry structure.
const LSYS_VARIABLES = ['F', 'X', 'Y'];

// Right-hand-side building blocks, grouped so the generator can bias the mix
// toward things that actually draw. F is repeated to weight it up.
const LSYS_MOVES = ['F', 'F', 'F', 'f', 'C'];
const LSYS_TURNS = ['+', '-'];
const LSYS_MODIFIERS = ['n', 'm', 'N', 'M', 'S', 's', 'A', 'a', 'w', 'W', 'D'];

// Self-contained generator (no closure vars, no `new`, explicit for-loops; the
// one recursive helper is declared *inside* the generator — all per the
// structural-naming rules in PTORepresentation). It emits a plain-data L-system
// specification; the individual expands and draws it.
const lsystemGenerator = (rnd) => {
    // Build a right-hand-side string of turtle symbols, occasionally nesting a
    // balanced branch `[ ... ]`, so brackets stay matched and the result reads
    // like a plant. `depth` bounds the branch nesting so recursion terminates.
    const buildRhs = (rnd, depth) => {
        let s = '';
        const n = rnd.randint(3, 7);
        for (let i = 0; i < n; i++) {
            const r = rnd.random();
            if (r < 0.05 && depth > 0) {
                s += '[' + buildRhs(rnd, depth - 1) + ']';
            } else if (r < 0.30) {
                s += rnd.choice(LSYS_TURNS);
            } else if (r < 0.42) {
                s += rnd.choice(LSYS_MODIFIERS);
            } else if (r < 0.62) {
                s += rnd.choice(LSYS_VARIABLES);
            } else {
                s += rnd.choice(LSYS_MOVES);
            }
        }
        return s;
    };

    // 1..3 rewrite rules with distinct left-hand sides (F, then X, then Y), so a
    // later rule is never shadowed by an earlier one on the same symbol.
    const numRules = rnd.randint(1, 3);
    const rules = [];
    for (let i = 0; i < numRules; i++) {
        rules.push({ lhs: LSYS_VARIABLES[i], rhs: buildRhs(rnd, 2) });
    }

    // Axiom starts from the first rule's variable so expansion always fires,
    // optionally seeded with an initial turn motif for a bit of gen-0 variety.
    const seed = rnd.choice(['', '+', '-', '[' + rules[0].lhs + ']']);
    const axiom = rules[0].lhs + seed + rules[0].lhs;

    return {
        axiom,
        rules,
        depth: rnd.randint(3, 6),          // rewrite generations
        angleIndex: rnd.randint(0, LSYS_SET_ANGLES.length - 1),
        step: rnd.uniform(6, 14),          // base forward step
        circleAngle: rnd.uniform(15, 90),  // arc sweep for C
        stepDelta: rnd.uniform(0.5, 3),    // how much S / s change the step
    };
};

// One shared, stateless representation (swappable live via the code editor).
const lsystemRepresentation = new PTORepresentation(lsystemGenerator);

// Bounds mirroring drawing.py's clamps.
const LSYS_MAX_EXPANDED = 40000;  // cap on the rewritten string length (ponyge's max_length)
const LSYS_MAX_PRIMITIVES = 24000;
const LSYS_COLOUR_GRANULARITY = 12; // steps of n/m/N/M before the palette walk wraps
const LSYS_STEP_MIN = 2, LSYS_STEP_MAX = 20;
const LSYS_WIDTH_MIN = 0.6, LSYS_WIDTH_MAX = 5;

class LSystemIndividual extends Individual {
    // this.genome is the PTO trace; this.phenotype (inherited) is the L-system
    // spec the generator produced. mutate/crossover/clone are inherited.
    constructor(genome = null) {
        super();
        this.representation = lsystemRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    // The spec stringifies to "[object Object]" (base renderKey would collide
    // across individuals), so fold the whole spec into a string key by hand.
    renderKey() {
        return JSON.stringify(this.phenotype);
    }

    validate() {
        // Reject "null drawings" (nothing that actually paints), mirroring
        // ponyge's null_drawing check.
        return this.buildPrimitives().some(p => p.type === 'line' || p.type === 'dot' || p.type === 'polygon');
    }

    // Deterministically rewrite the axiom `depth` times under the rules, in
    // parallel (standard L-system). Capped in length like ponyge's max_length.
    expand() {
        const spec = this.phenotype;
        if (!spec || typeof spec.axiom !== 'string') return '';

        const ruleMap = {};
        for (const rule of (spec.rules || [])) {
            if (rule && typeof rule.lhs === 'string' && !(rule.lhs in ruleMap)) {
                ruleMap[rule.lhs] = String(rule.rhs || '');
            }
        }

        let s = spec.axiom;
        const depth = Math.max(0, Math.min(8, spec.depth | 0));
        for (let g = 0; g < depth; g++) {
            let next = '';
            for (const ch of s) next += (ruleMap[ch] !== undefined ? ruleMap[ch] : ch);
            if (next === s) break; // fixed point: no rule fired
            s = next;
            if (s.length > LSYS_MAX_EXPANDED) break;
        }
        return s;
    }

    // Interpret the expanded command string with a turtle, returning a flat list
    // of drawing primitives in turtle space:
    //   { type:'line', x1,y1,x2,y2, width, pen }
    //   { type:'dot',  x,y, r, pen }
    //   { type:'polygon', points:[{x,y}...], fill }
    // where `pen`/`fill` are colour-walk counters resolved to palette colours at
    // draw time. Memoised per expanded string.
    buildPrimitives() {
        const commands = this.expand();
        if (this._primCacheKey === commands && this._primCache) return this._primCache;

        const spec = this.phenotype;
        const primitives = [];
        const stack = [];
        const angleTable = LSYS_SET_ANGLES;

        let st = {
            x: 0, y: 0, heading: 0,
            step: clampNum(spec.step, LSYS_STEP_MIN, LSYS_STEP_MAX, 10),
            angleIndex: ((spec.angleIndex | 0) % angleTable.length + angleTable.length) % angleTable.length,
            penWidth: 2,
            pen: 0, fill: 0,
        };
        const stepDelta = clampNum(spec.stepDelta, 0.25, 5, 1);
        const circleAngle = clampNum(spec.circleAngle, 5, 180, 20);

        let polygon = null; // vertices being collected between { and }

        const angleOf = () => angleTable[st.angleIndex];
        const forward = (draw) => {
            const rad = st.heading * Math.PI / 180;
            const nx = st.x + Math.cos(rad) * st.step;
            const ny = st.y + Math.sin(rad) * st.step;
            if (draw) {
                primitives.push({ type: 'line', x1: st.x, y1: st.y, x2: nx, y2: ny, width: st.penWidth, pen: st.pen });
            }
            st.x = nx; st.y = ny;
            if (polygon) polygon.points.push({ x: nx, y: ny });
        };
        // Arc as a chain of short forward+turn steps (turtle.circle in drawing.py).
        const arc = () => {
            const sub = Math.max(2, Math.ceil(Math.abs(circleAngle) / 12));
            const dTurn = circleAngle / sub;               // degrees per sub-step
            const chord = st.step * (Math.PI / 180) * Math.abs(dTurn); // ~arc length per step
            for (let i = 0; i < sub; i++) {
                const rad = st.heading * Math.PI / 180;
                const nx = st.x + Math.cos(rad) * chord;
                const ny = st.y + Math.sin(rad) * chord;
                primitives.push({ type: 'line', x1: st.x, y1: st.y, x2: nx, y2: ny, width: st.penWidth, pen: st.pen });
                st.x = nx; st.y = ny;
                if (polygon) polygon.points.push({ x: nx, y: ny });
                st.heading += dTurn;
            }
        };

        for (const ch of commands) {
            switch (ch) {
                case 'F': forward(true); break;
                case 'f': forward(false); break;
                case '+': st.heading += angleOf(); break;
                case '-': st.heading -= angleOf(); break;
                case '[': stack.push({ ...st }); break;
                case ']': if (stack.length) st = stack.pop(); break;
                case 'C': arc(); break;
                case 'D': primitives.push({ type: 'dot', x: st.x, y: st.y, r: Math.max(1, st.penWidth * 1.5), pen: st.pen }); break;
                case 'S': st.step = Math.min(LSYS_STEP_MAX, st.step + stepDelta); break;
                case 's': st.step = Math.max(LSYS_STEP_MIN, st.step - stepDelta); break;
                case 'A': st.angleIndex = (st.angleIndex + 1) % angleTable.length; break;
                case 'a': st.angleIndex = (st.angleIndex - 1 + angleTable.length) % angleTable.length; break;
                case 'n': st.pen += 1; break;
                case 'm': st.pen -= 1; break;
                case 'N': st.fill += 1; break;
                case 'M': st.fill -= 1; break;
                case 'w': st.penWidth = Math.max(LSYS_WIDTH_MIN, st.penWidth / 1.05); break;
                case 'W': st.penWidth = Math.min(LSYS_WIDTH_MAX, st.penWidth * 1.05); break;
                case '{': polygon = { points: [{ x: st.x, y: st.y }], fill: st.fill }; break;
                case '}':
                    if (polygon) {
                        if (polygon.points.length >= 3) primitives.push({ type: 'polygon', points: polygon.points, fill: polygon.fill });
                        polygon = null;
                    }
                    break;
                // X, Y and any stray symbol: no-op.
            }
            if (primitives.length > LSYS_MAX_PRIMITIVES) break;
        }

        this._primCacheKey = commands;
        this._primCache = primitives;
        return primitives;
    }

    // Resolve a colour-walk counter to a palette colour. The counter walks around
    // the palette circularly (ponyge's map_colour was likewise circular), so
    // n/m/N/M produce a moving gradient rather than a fixed set of colours.
    colourFor(counter) {
        const g = LSYS_COLOUR_GRANULARITY;
        const t = (((counter % g) + g) % g) / g;
        return window.Palette.color(t);
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            // Black background (the plant/curve glows against it, like Branch).
            const background = { r: 0, g: 0, b: 0 };
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            }

            const primitives = this.buildPrimitives();
            if (primitives.length === 0) return imageData;

            // Bounding box over every point → fit-to-canvas scale + offset.
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            const acc = (x, y) => {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            };
            for (const p of primitives) {
                if (p.type === 'line') { acc(p.x1, p.y1); acc(p.x2, p.y2); }
                else if (p.type === 'dot') { acc(p.x, p.y); }
                else if (p.type === 'polygon') { for (const pt of p.points) acc(pt.x, pt.y); }
            }
            if (!isFinite(minX)) return imageData;

            const margin = 16;
            const drawW = maxX - minX, drawH = maxY - minY;
            let scale = 1;
            if (drawW > 0 && drawH > 0) {
                scale = Math.min((width - 2 * margin) / drawW, (height - 2 * margin) / drawH);
            }
            const offX = (width - drawW * scale) / 2 - minX * scale;
            const offY = (height - drawH * scale) / 2 - minY * scale;
            const tx = (x) => x * scale + offX;
            const ty = (y) => y * scale + offY;

            // Resolution scale: absolute-pixel quantities (pen width, dot radius,
            // glow) are relative to the 128px tile, so scale up at zoom (768px)
            // for a faithful magnification. See CLAUDE.md > resolution-independent.
            const res = Math.min(width, height) / 128;

            for (const p of primitives) {
                if (p.type === 'line') {
                    Canvas2DModality.drawThickLine(data, width, height, tx(p.x1), ty(p.y1), tx(p.x2), ty(p.y2),
                        this.colourFor(p.pen), Math.max(1, Math.round(p.width * res)));
                } else if (p.type === 'dot') {
                    Canvas2DModality.drawCircle(data, width, height, tx(p.x), ty(p.y), Math.max(1, Math.round(p.r * res)), this.colourFor(p.pen));
                } else if (p.type === 'polygon') {
                    this.fillPolygon(data, width, height, p.points.map(pt => ({ x: tx(pt.x), y: ty(pt.y) })), this.colourFor(p.fill));
                }
            }

            // Soft palette-coloured bloom, matching the underwater/bioluminescent
            // look of Anemone/Branch on their black backgrounds.
            Canvas2DModality.bloom(imageData, { radius: 2 * res, strength: 1.4, background });

            return imageData;
        });
    }

    // Even-odd scanline fill for the { } polygons (Canvas2DModality only fills
    // circles, so the polygon fill lives here).
    fillPolygon(data, width, height, pts, color) {
        if (pts.length < 3) return;
        let minY = Infinity, maxY = -Infinity;
        for (const p of pts) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
        minY = Math.max(0, Math.floor(minY));
        maxY = Math.min(height - 1, Math.ceil(maxY));
        for (let y = minY; y <= maxY; y++) {
            const xs = [];
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
                    xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
                }
            }
            xs.sort((p, q) => p - q);
            for (let i = 0; i + 1 < xs.length; i += 2) {
                const x0 = Math.max(0, Math.ceil(xs[i]));
                const x1 = Math.min(width - 1, Math.floor(xs[i + 1]));
                for (let x = x0; x <= x1; x++) {
                    const idx = (y * width + x) * 4;
                    data[idx] = color.r; data[idx + 1] = color.g; data[idx + 2] = color.b; data[idx + 3] = 255;
                }
            }
        }
    }

    // Readable phenotype for the genome panel: the axiom, rules, and the size of
    // the expanded string (the actual thing drawn).
    getPhenotype() {
        const spec = this.phenotype;
        if (!spec) return '';
        const rules = (spec.rules || []).map(r => `${r.lhs}→${r.rhs}`).join('  ');
        return `axiom ${spec.axiom} | ${rules} | depth ${spec.depth} (${this.expand().length} chars)`;
    }

    // Type-specific detail in the genome panel.
    describeExtra() {
        const spec = this.phenotype;
        if (!spec) return '';
        const angle = LSYS_SET_ANGLES[((spec.angleIndex | 0) % LSYS_SET_ANGLES.length + LSYS_SET_ANGLES.length) % LSYS_SET_ANGLES.length];
        const rules = (spec.rules || []).map(r => `${r.lhs} → ${r.rhs}`).join('\n');
        return `<span class="genome-label">Axiom:</span> ${spec.axiom}\n` +
            `<span class="genome-label">Rules:</span>\n${rules}\n` +
            `<span class="genome-label">Depth:</span> ${spec.depth}   ` +
            `<span class="genome-label">Angle:</span> ${angle.toFixed(1)}°   ` +
            `<span class="genome-label">Step:</span> ${(+spec.step).toFixed(1)}\n`;
    }
}

// Clamp helper (top-level so buildPrimitives can use it without a per-call closure).
function clampNum(v, lo, hi, fallback) {
    if (typeof v !== 'number' || !isFinite(v)) return fallback;
    return Math.max(lo, Math.min(hi, v));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LSystemIndividual;
}

// SITCodeIndividual
//
// "Leeuwenberg Code 2D" in the UI. Evolves figures written in the *full* 1971
// perceptual coding language of Leeuwenberg's Structural Information Theory —
// 4 information units, 5 operations, ~10 indicators, and the combinatory /
// serial / parallel rules — rather than the three-regularity subset used by
// `StructuralInformationIndividual`. The language itself lives in
// `SITLanguage.js` (see that file's header for the full mapping from the
// paper's notation to this AST); this file only supplies the PTO generator
// that writes random codes, and the rendering.
//
// A code evaluates to a stream of ANGLES, one per elementary "grain" length of
// contour — that is the paper's own reduction, and it is why length never
// appears as a primitive here: a straight edge n grains long is `n·(0)`, n
// repetitions of the angle 0 (p. 332, "we assume that every angle is connected
// with the same ('grain', or elementary) lengths"). The basic leaf this
// generator emits is therefore the paper's basic contour element, `a, n·(0)`.
//
// DISCRETE vs CONTINUOUS, UNIFIED. Anemone's earlier SIT pair had to ship two
// types — one with turns locked to multiples of 45° (so figures close) and one
// with continuous turns (organic, but nothing ever meets up). Here that axis is
// a *gene*: a code carries a rotational family N, every angle literal is an
// integer multiple of 360/N, and N itself evolves over
// LEE_FAMILIES = 3…360. Small N gives crisp on-grid ornament whose contours
// close; N = 360 is 1°-resolution, i.e. continuous for all practical purposes.
// One representation spans both ends, angles stay commensurable *within* a
// figure (which is what makes iterated motifs cohere), and because literals are
// stored as the integer multiple, mutating N re-tunes every angle in the figure
// coherently instead of scrambling them.
//
// PTO-backed like every type: the generator emits plain data (self-contained,
// no `new`, explicit for-loops — see PTORepresentation), and the individual
// decodes it. Both the generator and, through it, the whole code language are
// live-editable via the Generator code editor.

// Rotational families: an angle literal is k·(360/N). N=3…12 give the closing,
// on-grid figures; 36–360 approach continuous angles. Kept as a top-level const
// so PTO's structural-naming compiler can resolve it in isolation.
const LEE_FAMILIES = [3, 4, 5, 6, 8, 10, 12, 16, 24, 36, 72, 360];
const LEE_CODE_DEPTH = 5;   // code-tree recursion depth
const LEE_RUN_MAX = 5;      // longest straight run n in the leaf's n·(0)
// Largest multiple of the family unit an angle literal may take. Capping the
// *multiple* rather than the angle is what gives the family gene its second,
// nicer meaning: a small family (3-12) is coarse and on-grid — its cap doesn't
// bite, so turns span the full circle and contours close crisply — while a
// large family is fine-grained *and* gentle (family 360 turns by at most 8°),
// so it draws smooth curves instead of an angular random walk. One gene thus
// slides the type continuously from crisp discrete ornament to organic line.
const LEE_MAX_MULT = 8;

// Self-contained PTO generator: a random code tree, as plain data. The single
// recursive `build` mirrors treeGenerator's shape; every construct of the
// language gets a slice of the probability mass, so codes really do range over
// the paper's vocabulary rather than a favourite corner of it.
const leeGenerator2D = (rnd) => {
    const build = (depth, family) => {
        const half = Math.min(Math.floor(family / 2), LEE_MAX_MULT);
        // Leaf: the paper's basic contour element — one angle, then a straight
        // run of n grains written the paper's way, as n repetitions of angle 0.
        // The run is sometimes vanished (‾): the corner still draws but the run
        // does not, which is how the paper gets its dot patterns (figs. 10c/10d)
        // out of a single unbroken contour trace. Never leaf at the root depth,
        // or a fifth of all figures would be a two-stroke scribble.
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
        // ( ) border / serial structure
        if (r < 0.12) {
            const n = rnd.randint(2, 3);
            const items = [];
            for (let i = 0; i < n; i++) items.push(build(depth - 1, family));
            return { k: 'seq', items };
        }
        // ⦃ ⦄ continuation — repeats until the contour closes, so this is what
        // turns a motif into a polygon, star or rosette.
        if (r < 0.24) return { k: 'cont', child: build(depth - 1, family) };
        // · iteration, occasionally with a count series or a / / reprisal
        if (r < 0.36) {
            const ns = [rnd.randint(2, 5)];
            if (rnd.random() < 0.3) ns.push(rnd.randint(2, 5));
            return { k: 'iter', ns, cross: rnd.random() < 0.25, child: build(depth - 1, family) };
        }
        // R reversal — the sequence then its reverse; SIT's symmetry regularity
        if (r < 0.45) return { k: 'rev', child: build(depth - 1, family) };
        // ± left-right variation
        if (r < 0.51) return { k: 'pm', child: build(depth - 1, family) };
        // ∫ integration — reads the values as differences, so the result is a
        // sequence of absolute angles (the paper's relative→absolute step)
        if (r < 0.56) return { k: 'int', child: build(depth - 1, family) };
        // + × * ⊛ operations
        if (r < 0.65) {
            return {
                k: 'op',
                op: rnd.choice(['+', 'x', '*', '@']),
                cross: rnd.random() < 0.2,
                a: build(depth - 1, family),
                b: build(depth - 1, family),
            };
        }
        // combination: (a,b)(c,d) = a,c,b,d
        if (r < 0.71) return { k: 'comb', a: build(depth - 1, family), b: build(depth - 1, family) };
        // one-sided iteration: n of one operand per 1 of the other
        if (r < 0.76) {
            const ns = [rnd.randint(2, 4)];
            if (rnd.random() < 0.3) ns.push(rnd.randint(1, 3));
            return {
                k: 'osi', ns, side: rnd.choice(['l', 'r']),
                a: build(depth - 1, family), b: build(depth - 1, family),
            };
        }
        // { } chunking — an unbroken unit, so iteration repeats it whole
        if (r < 0.81) return { k: 'chunk', child: build(depth - 1, family) };
        // [ ] / ⟦ ⟧ breakdown
        if (r < 0.85) {
            return { k: rnd.random() < 0.5 ? 'brk' : 'brkall', child: build(depth - 1, family) };
        }
        // | | absolute angles — measured from a fixed base axis, not the
        // previous segment, so the sub-figure keeps a constant orientation
        if (r < 0.89) return { k: 'abs', child: build(depth - 1, family) };
        // ‾ vanishing sign — the values still function, but draw nothing. This
        // is how the paper gets dot patterns and multi-part figures (figs. 10c,
        // 10d) out of one unbroken contour trace.
        if (r < 0.93) return { k: 'hide', child: build(depth - 1, family) };
        // Parallel structure: branches hanging off the nodes of the row above.
        const nRows = rnd.randint(2, 3);
        const rows = [], indep = [], every = [];
        for (let i = 0; i < nRows; i++) {
            rows.push(build(depth - 1, family));
            indep.push(rnd.random() < 0.3);   // ‖ independence of angles
            every.push(rnd.random() < 0.35);  // attach at every element, not just corners
        }
        return { k: 'par', rows, indep, every };
    };

    // The rotational family is the figure's angular "key": every literal is an
    // integer multiple of 360/family, so the whole figure stays commensurable.
    const family = rnd.choice(LEE_FAMILIES);
    const parts = rnd.randint(1, 2);
    const items = [];
    for (let i = 0; i < parts; i++) items.push(build(LEE_CODE_DEPTH, family));
    const body = { k: 'seq', items };
    // Almost every figure in the paper carries a regularity at top level — a
    // continuation that closes the contour, an iteration of the whole motif, a
    // reversal, or a branch structure. Imposing one here is what makes a random
    // code read as an ornament rather than a scribble: it is the minimum
    // principle acting as a prior, which is the whole point of running SIT
    // generatively.
    const finish = rnd.choice(['cont', 'cont', 'iter', 'rev', 'par', 'plain']);
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
    return { family, root: body };
};

// One shared, stateless representation per type (swappable live via the editor).
const leeRepresentation2D = new PTORepresentation(leeGenerator2D);

class SITCodeIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = this.defaultRepresentation();
        this.genome = genome || this.representation.generateRandom();
    }

    defaultRepresentation() { return leeRepresentation2D; }

    usesColorPalette() { return true; }

    // Degrees per angle unit: every literal in the code is an integer multiple
    // of this. See the header on the discrete/continuous unification.
    unitDegrees() {
        const p = this.phenotype;
        return 360 / ((p && p.family) || 12);
    }

    /** The evaluated item stream (cached per phenotype — evaluation is not cheap). */
    items() {
        const p = this.phenotype;
        if (this._itemsFor !== p) {
            this._itemsFor = p;
            this._items = SITLanguage.evaluate(p && p.root, this.unitDegrees());
        }
        return this._items;
    }

    marks() {
        return SITLanguage.interpret2D(this.items(), this.unitDegrees());
    }

    // The object phenotype stringifies to "[object Object]" and would collide in
    // renderCached's key, so key on a precise serialisation of the code.
    renderKey() { return JSON.stringify(this.phenotype); }

    /**
     * Reject figures that are not worth a tile: too few marks, or a contour so
     * nearly collinear that fit-to-canvas scaling blows it up into a single
     * stroke across the tile. (A straight line is a perfectly legal Leeuwenberg
     * code — `⦃0⦄` — it just isn't interesting to look at, and the framework
     * re-draws until validate() passes.)
     */
    validate() {
        const marks = this.marks();
        if (marks.length < 6) return false;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const m of marks) {
            minX = Math.min(minX, m.x1, m.x2); maxX = Math.max(maxX, m.x1, m.x2);
            minY = Math.min(minY, m.y1, m.y2); maxY = Math.max(maxY, m.y1, m.y2);
        }
        const w = maxX - minX, h = maxY - minY;
        return Math.min(w, h) > 0.08 * Math.max(w, h);
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            }

            const marks = this.marks();
            if (marks.length === 0) return imageData;

            // Resolution-independent pixel units (tiles 128px, zoom 768px).
            const s = Math.min(width, height) / 128;

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const m of marks) {
                minX = Math.min(minX, m.x1, m.x2); maxX = Math.max(maxX, m.x1, m.x2);
                minY = Math.min(minY, m.y1, m.y2); maxY = Math.max(maxY, m.y1, m.y2);
            }
            const margin = 10 * s;
            const drawW = maxX - minX, drawH = maxY - minY;
            let scale = 1;
            if (drawW > 0 && drawH > 0) scale = Math.min((width - 2 * margin) / drawW, (height - 2 * margin) / drawH);
            else if (drawW > 0) scale = (width - 2 * margin) / drawW;
            else if (drawH > 0) scale = (height - 2 * margin) / drawH;
            const offsetX = (width - drawW * scale) / 2 - minX * scale;
            const offsetY = (height - drawH * scale) / 2 - minY * scale;

            // Stroke width. Three bounds, smallest wins:
            //  * 2.2·s — the nominal weight, resolution-independent;
            //  * scale·0.6 — thin down when grain steps are short, so a dense
            //    rosette doesn't fill in solid (`scale` is px per grain);
            //  * an ink budget — drawThickLine stamps a disc per Bresenham
            //    pixel, so its cost is (contour length)×(width²). A code can
            //    legitimately retrace thousands of long segments over a small
            //    figure, and at the 768px zoom that combination costs tens of
            //    seconds at full weight. Capping total stamped pixels keeps the
            //    zoom responsive and only bites on the figures that would look
            //    like a solid blob at full weight anyway.
            const contourPx = Math.max(1, marks.length * scale);
            const lineWidth = Math.max(1, Math.min(2.2 * s, scale * 0.6, Math.sqrt(3e6 / contourPx)));
            for (const m of marks) {
                const color = window.Palette.color(m.t);
                Canvas2DModality.drawThickLine(
                    data, width, height,
                    m.x1 * scale + offsetX, m.y1 * scale + offsetY,
                    m.x2 * scale + offsetX, m.y2 * scale + offsetY,
                    color, lineWidth
                );
            }

            Canvas2DModality.bloom(imageData, { radius: Math.round(2 * s), strength: 0.45, background: 0 });
            return imageData;
        });
    }

    // --- Self-description ---------------------------------------------------

    getPhenotype() {
        const p = this.phenotype;
        const { values, ops } = SITLanguage.load(p && p.root);
        return `Leeuwenberg code — I = ${values + ops} (${values} values + ${ops} operators)`
            + `, family ${(p && p.family) || '?'} → ${this.marks().length} contour marks`;
    }

    describeExtra() {
        const p = this.phenotype;
        const { values, ops } = SITLanguage.load(p && p.root);
        const load = values + ops;
        const items = this.items().length;
        const ratio = load > 0 ? (items / load).toFixed(1) : '—';
        const vocab = SITLanguage.vocabulary(p && p.root);
        const used = Object.keys(vocab).sort((a, b) => vocab[b] - vocab[a]);

        let s = '\n<span class="genome-label">Structural information load (I):</span>\n';
        s += `  ${load} units — ${values} values + ${ops} operations\n`;
        s += `  → ${items} coded angles expanded  (compression ×${ratio})\n`;
        s += `  angular family: 360/${(p && p.family) || '?'} = ${this.unitDegrees().toFixed(2)}° per unit\n`;
        s += '\n<span class="genome-label">Language used:</span>\n';
        s += `  ${this._escapeHtml(used.join(', ') || 'none')}\n`;
        s += '\n<span class="genome-label">Code:</span>\n';
        s += `  ${this._escapeHtml(SITLanguage.notation(p && p.root))}\n`;
        return s;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SITCodeIndividual;
}

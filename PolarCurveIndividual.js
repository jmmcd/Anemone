/**
 * PolarCurveIndividual
 *
 * Grammatical evolution under PTO, the "real" way: the generator IS the
 * derivation. polarCurveGenerator recursively expands the polar grammar from the
 * start symbol, choosing a production by index at each non-terminal, and returns
 * the r(t) expression string directly — so the genome (PTO trace) records the
 * derivation choices and this.phenotype is the expression. No codon array. PTO's
 * generic operators handle mutation/crossover/clone; this individual compiles its
 * own single-parameter r(t) function below.
 */

// The BNF grammar this individual evolves over (a plain rules object; see
// PatternGrammarIndividual / Grammar.js). r(t) expressions in t, kept here so the
// individual is self-contained.
const polarDrawingGrammar = new Grammar({
    '<polar>': [['<expr>']],
    '<expr>': [
        ['<expr>', '<op>', '<expr>'],
        ['<func>', '(', '<expr>', ')'],
        ['<var>'],
        ['<const>']
    ],
    '<op>': [['+'], ['-'], ['*'], ['/']],
    '<func>': [['sin'], ['cos'], ['tan'], ['exp'], ['log'], ['sqrt'], ['abs']],
    '<var>': [['t'], ['(t*2)'], ['(t/2)'], ['(t*3)'], ['(t/3)']],
    '<const>': [['1.0'], ['2.0'], ['3.0'], ['0.5'], ['0.1'], ['5.0'], ['10.0'], ['3.14159'], ['6.28318']]
});
const POLAR_START = '<polar>';
const POLAR_MAX_DEPTH = 6; // derivation-tree depth bound (keeps expressions tractable)
const POLAR_MIN_TURNS = 1;  // fewest full 2π turns the curve is swept over
const POLAR_MAX_TURNS = 10; // most full turns (tMax = turns · 2π; old fixed value was 5)

// Self-contained derivation generator — see patternGrammarGenerator and
// PTORepresentation for why it's shaped this way (inline recursion + for-loop,
// top-level consts only, depth-bounded). Uses rnd.randint for production index
// (not rnd.choice) so the stored gene is a primitive that survives JSON round-tripping.
//
// The phenotype is { turns, expr }: the r(t) expression AND how many full 2π
// turns to sweep it over — both under evolutionary control. Keeping `turns` an
// integer count means tMax is always a multiple of 2π, so the first (t=0) and
// last (t=turns·2π) samples share angle 0, which the closure logic in
// drawPolarCurve relies on.
const polarCurveGenerator = (rnd) => {
    const expand = (symbol, depth) => {
        if (!polarDrawingGrammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0 ? polarDrawingGrammar.getProductions(symbol) : polarDrawingGrammar.shortestProductions(symbol);
        const idx = rnd.randint(0, choices.length - 1);
        const prod = choices[idx];
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    const turns = rnd.randint(POLAR_MIN_TURNS, POLAR_MAX_TURNS);
    const expr = expand(POLAR_START, POLAR_MAX_DEPTH);
    return { turns, expr };
};

const polarCurveRepresentation = new PTORepresentation(polarCurveGenerator);

class PolarCurveIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');

        this.representation = polarCurveRepresentation;
        this.genome = genome || this.representation.generateRandom();

        // Polar coordinate parameters. tMax is not fixed here: it comes from the
        // evolved turn count (see generatePolarPoints), tMax = turns · 2π. We
        // sample a constant number of points per turn so resolution stays even
        // regardless of how many turns a given individual sweeps.
        this.tMin = 0;
        this.pointsPerTurn = 600; // 3000 points over the old 5 turns → 600/turn
    }

    // The phenotype is { turns, expr }; the meaningful "phenotype" for display,
    // validation and evaluation is the r(t) expression string.
    getPhenotype() {
        return this.phenotype.expr;
    }

    // renderKey must fold in every input that changes the pixels. The base would
    // return the { turns, expr } object, which stringifies to "[object Object]"
    // and would collide across all individuals — so build a string key by hand.
    renderKey() {
        return `${this.phenotype.turns}:${this.phenotype.expr}`;
    }

    // Surface the evolved turn count next to the expression in the genome panel.
    describeExtra() {
        return `<span class="genome-label">Turns:</span> ${this.phenotype.turns} (tMax = ${this.phenotype.turns}·2π)\n`;
    }

    validate() {
        const phenotype = this.getPhenotype();
        if (typeof phenotype !== 'string' || phenotype.trim() === '') {
            return false;
        }

        return /(?:^|[^A-Za-z])t(?:$|[^A-Za-z])/.test(phenotype);
    }

    usesColorPalette() { return true; }

    // The interesting knob here is the grammar (the generator is boilerplate
    // derivation); expose both, grammar first.
    editableSections() {
        return [
            Individual.grammarSection(polarDrawingGrammar),
            Individual.generatorSection(this.representation),
        ];
    }

    // Override visualization for polar coordinate drawing
    visualize(canvas) {
        console.time(`visualize-${this.id}`);

        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            // Background color (first color in palette)
            const backgroundColor = window.Palette.color(0);

            // Fill background
            for (let i = 0; i < data.length; i += 4) {
                data[i] = backgroundColor.r;     // Red
                data[i + 1] = backgroundColor.g; // Green
                data[i + 2] = backgroundColor.b; // Blue
                data[i + 3] = 255;              // Alpha
            }

            // Resolution scale: everything in absolute pixels (line thickness,
            // glow radius) is multiplied by this so a zoomed render (768px) is a
            // faithful magnification of the 128px tile rather than the same
            // absolute marks on a 6× larger canvas (which made the glow look weak
            // and the curve a hairline). Reference is the 128px grid tile.
            const s = Math.min(width, height) / 128;

            // Generate polar coordinates
            const polarPoints = this.generatePolarPoints();

            if (polarPoints.length > 0) {
                // Convert to Cartesian and draw
                this.drawPolarCurve(data, width, height, polarPoints, s);
            }

            // Soften and add a palette-coloured glow over the finished render.
            Canvas2DModality.bloom(imageData, { radius: 2 * s, strength: 2.0, background: backgroundColor });

            return imageData;
        });
        
        console.timeEnd(`visualize-${this.id}`);
    }
    
    generatePolarPoints() {
        const points = [];
        const turns = this.phenotype.turns;
        const tMax = turns * 2 * Math.PI;       // always a multiple of 2π
        const numPoints = turns * this.pointsPerTurn;
        const tStep = (tMax - this.tMin) / numPoints;

        for (let i = 0; i <= numPoints; i++) {
            const t = this.tMin + i * tStep;
            const r = this.evaluateExpression(t, 0); // y parameter unused for polar
            points.push({ t, r });
        }

        return points;
    }
    
    drawPolarCurve(data, width, height, polarPoints, s = 1) {
        // Find min/max radius for scaling. (Per-point values are already finite:
        // the compiled expression maps Infinity/NaN to a safe number.)
        const radii = polarPoints.map(p => p.r);
        const minR = Math.min(...radii);
        const maxR = Math.max(...radii);
        const maxRadius = Math.max(Math.abs(minR), Math.abs(maxR));

        // Scale factor to fit in canvas with some padding
        const padding = 20;
        const maxDimension = Math.min(width, height) - 2 * padding;

        // Only bail to a placeholder when the curve is degenerate (essentially
        // r = 0 everywhere). A constant non-zero radius is a perfectly good
        // circle and is drawn by the normal path below — not the placeholder.
        if (!isFinite(maxRadius) || maxRadius < 1e-6) {
            this.drawCircleOutline(data, width, height, Math.min(width, height) / 4);
            return;
        }

        const scale = maxDimension / (2 * maxRadius);
        
        // Center point
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Foreground color (last color in palette). Smoothing/glow is applied
        // afterwards as a bloom post-filter (see visualize()).
        const foregroundColor = window.Palette.color(1);

        const toXY = (p) => ({
            x: centerX + p.r * scale * Math.cos(p.t),
            y: centerY + p.r * scale * Math.sin(p.t)
        });

        // Build the list of Cartesian segments to draw.
        const segments = [];
        for (let i = 0; i < polarPoints.length - 1; i++) {
            const a = toXY(polarPoints[i]);
            const b = toXY(polarPoints[i + 1]);
            if (isFinite(a.x) && isFinite(a.y) && isFinite(b.x) && isFinite(b.y)) {
                segments.push([a.x, a.y, b.x, b.y]);
            }
        }

        // Close the curve only if its ends actually meet. Samples run over
        // t ∈ [0, turns·2π] with turns an integer, so the first (t=0) and last
        // (t=turns·2π) points both sit on the +x axis (angle ≡ 0). When r differs
        // there — e.g. a spiral — a chord
        // back to the start is a spurious radial line. So add the closing segment
        // only when the endpoints nearly coincide (a genuinely closed, periodic
        // curve); otherwise leave the curve open. The small tolerance means a
        // near-closure shows at most a couple-pixel gap rather than a long chord.
        if (polarPoints.length > 2) {
            const a = toXY(polarPoints[polarPoints.length - 1]);
            const b = toXY(polarPoints[0]);
            const gap = Math.hypot(b.x - a.x, b.y - a.y);
            const closeTolerance = Math.max(2, 0.05 * maxDimension);
            if (gap <= closeTolerance && isFinite(a.x) && isFinite(a.y) && isFinite(b.x) && isFinite(b.y)) {
                segments.push([a.x, a.y, b.x, b.y]);
            }
        }

        const lineWidth = Math.max(1, Math.round(s));
        for (const [x1, y1, x2, y2] of segments) {
            Canvas2DModality.drawThickLine(data, width, height, x1, y1, x2, y2, foregroundColor, lineWidth);
        }
    }

    // Connected placeholder circle for degenerate (≈ zero-radius) curves.
    drawCircleOutline(data, width, height, radius) {
        const centerX = width / 2;
        const centerY = height / 2;
        const foregroundColor = window.Palette.color(1);
        const steps = 120;
        let prev = null;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            if (prev) Canvas2DModality.drawLine(data, width, height, prev.x, prev.y, x, y, foregroundColor);
            prev = { x, y };
        }
    }

    // Override expression evaluation to work with single parameter t
    evaluateExpression(t, unused) {
        const expression = this.getPhenotype();

        try {
            // Pre-compile the expression for faster evaluation. Cache keyed by the
            // expression string, so it auto-invalidates when the genome changes
            // (mutation/crossover produce a new genome → new expression).
            if (this._compiledExpression == null || this._compiledKey !== expression) {
                this._compiledExpression = this.compileExpressionForT(expression);
                this._compiledKey = expression;
            }

            const result = this._compiledExpression(t);
            
            // Clamp result to reasonable range to prevent extreme values
            return Math.max(-5000, Math.min(5000, result));
            
        } catch (error) {
            console.warn('Expression evaluation error:', error, 'Expression:', expression);
            return 1.0; // Default radius for errors
        }
    }
    
    compileExpressionForT(expression) {
        try {
            // Create a more efficient compiled function for t variable
            let jsExpression = expression
                .replace(/sin/g, 'Math.sin')
                .replace(/cos/g, 'Math.cos')
                .replace(/tan/g, 'Math.tan')
                .replace(/exp/g, 'Math.exp')
                .replace(/log/g, 'Math.log')
                .replace(/sqrt/g, 'Math.sqrt')
                .replace(/abs/g, 'Math.abs')
                .replace(/floor/g, 'Math.floor')
                .replace(/ceil/g, 'Math.ceil')
                .replace(/3\.14159/g, 'Math.PI')
                .replace(/6\.28318/g, '(2*Math.PI)');

            // Note: division/modulo by zero produces Infinity/NaN, which the
            // isFinite guard below maps to a safe value. We deliberately do NOT
            // rewrite '/' and '%' with a regex — that can't balance parentheses
            // and would mangle most expressions into uncompilable code.

            // Create function that takes t parameter
            const compiledFn = new Function('t', `
                try {
                    const result = ${jsExpression};
                    return isFinite(result) ? result : 1.0;
                } catch (e) {
                    return 1.0;
                }
            `);
            
            return compiledFn;
            
        } catch (error) {
            return () => 1.0;
        }
    }
    
}
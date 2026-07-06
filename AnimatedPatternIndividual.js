/**
 * AnimatedPatternIndividual
 *
 * Like PatternGrammarIndividual but the grammar includes time-based terminals
 * (t, sin(2πnt), cos(2πnt) for evolved integer n). visualize() runs a
 * requestAnimationFrame loop so each individual animates continuously.
 *
 * The PTO generator produces { expression, periodSeconds } — both the pattern
 * and the loop speed are evolved, so individuals in the grid animate at
 * different rates.
 *
 * A module-level canvas→rafId map ensures that when a new individual takes
 * over a canvas (on evolution), the previous RAF loop is cancelled first.
 */

const animatedPatternGrammar = new Grammar({
    '<pattern>': [['<expr>']],
    '<expr>': [
        ['<expr>', '<op>', '<expr>'],
        ['<func>', '(', '<expr>', ')'],
        ['ifpos', '(', '<expr>', ',', '<expr>', ',', '<expr>', ')'],
        ['<var>'],
        ['<tterm>'],
        ['<const>']
    ],
    '<op>':   [['+'], ['-'], ['*'], ['/'], ['%']],
    '<func>': [['sin'], ['cos'], ['tan'], ['exp'], ['log'], ['sqrt'], ['abs'], ['floor'], ['ceil']],
    '<var>':  [['x'], ['y'], ['r'], ['theta'], ['(x+y)'], ['(x-y)'], ['(x*y)']],
    '<tterm>': [
        ['t'],
        ['sin(6.28318*', '<int>', '*t)'],
        ['cos(6.28318*', '<int>', '*t)'],
    ],
    '<int>':   [['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8']],
    '<const>': [['0.1'], ['0.5'], ['1.0'], ['2.0'], ['3.0'], ['-1.0'], ['-0.5'], ['3.14159'], ['6.28318']]
});

const ANIM_PATTERN_START     = '<pattern>';
const ANIM_PATTERN_MAX_DEPTH = 6;

const animatedPatternGenerator = (rnd) => {
    const periodSeconds = rnd.uniform(6, 12);
    const expand = (symbol, depth) => {
        if (!animatedPatternGrammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0
            ? animatedPatternGrammar.getProductions(symbol)
            : animatedPatternGrammar.shortestProductions(symbol);
        const prod = rnd.choice(choices);
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    return { expression: expand(ANIM_PATTERN_START, ANIM_PATTERN_MAX_DEPTH), periodSeconds };
};

const animatedPatternRepresentation = new PTORepresentation(animatedPatternGenerator);

// Each animated individual stamps its id onto canvas._animOwner when it starts.
// Canvas2DModality.renderCached clears _animOwner to null when any static individual
// draws to the canvas, causing the step() closure to bail on the next frame.

// Global period multiplier, adjusted by the [ / ] hotkeys (like sequencer Length).
// Clamped to [0.25, 8.0]; 1.0 = use each individual's evolved period.
let _periodScale = 1.0;

// Global pause flag, toggled by the '.' hotkey.
let _paused = false;

class AnimatedPatternIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = animatedPatternRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    static adjustPeriodScale(factor) {
        _periodScale = Math.max(0.25, Math.min(8, _periodScale * factor));
    }
    static get periodScale() { return _periodScale; }

    static togglePause() { _paused = !_paused; }
    static get paused() { return _paused; }

    usesColorPalette() { return true; }

    editableSections() {
        return [
            Individual.grammarSection(animatedPatternGrammar),
            Individual.generatorSection(this.representation),
        ];
    }

    validate() {
        const p = this.phenotype;
        if (!p || typeof p.expression !== 'string' || p.expression.trim() === '') return false;
        const hasSpatial = /(?:^|[^A-Za-z])(x|y|r|theta)(?:$|[^A-Za-z])/.test(p.expression);
        const hasTime    = /(?:^|[^A-Za-z])t(?:$|[^A-Za-z])/.test(p.expression);
        return hasSpatial && hasTime;
    }

    getPhenotype() {
        return this.phenotype;
    }

    evaluateExpression(x, y, t) {
        const expression = this.phenotype.expression;
        if (this._compiledExpression == null || this._compiledKey !== expression) {
            this._compiledExpression = this._compileExpression(expression);
            this._compiledKey = expression;
        }
        return this._compiledExpression(x, y, t);
    }

    _compileExpression(expression) {
        try {
            let js = expression
                .replace(/sin/g,   'Math.sin')
                .replace(/cos/g,   'Math.cos')
                .replace(/tan/g,   'Math.tan')
                .replace(/exp/g,   'Math.exp')
                .replace(/log/g,   'Math.log')
                .replace(/sqrt/g,  'Math.sqrt')
                .replace(/abs/g,   'Math.abs')
                .replace(/floor/g, 'Math.floor')
                .replace(/ceil/g,  'Math.ceil')
                .replace(/ifpos\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
                    '(($1) > 0 ? ($2) : ($3))')
                .replace(/\br\b/g,     'Math.sqrt(x*x + y*y)')
                .replace(/\btheta\b/g, 'Math.atan2(y, x)')
                .replace(/3\.14159/g,  'Math.PI')
                .replace(/6\.28318/g,  '(2*Math.PI)');

            // Protected division and modulo
            js = js.replace(/\/([^\/]+)/g, (m, d) =>
                `/(Math.abs(${d}) > 1e-6 ? ${d} : 1.0)`);
            js = js.replace(/%([^%]+)/g, (m, d) =>
                `%(Math.abs(${d}) > 1e-6 ? ${d} : 1.0)`);

            return new Function('x', 'y', 't', `
                try {
                    const result = ${js};
                    return isFinite(result) ? result : 0.0;
                } catch (e) { return 0.0; }
            `);
        } catch (e) {
            return () => 0.0;
        }
    }

    _renderFrame(canvas, t) {
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const x = (px / width) * 2 - 1;
                const y = (py / height) * 2 - 1;
                const value = this.evaluateExpression(x, y, t);
                const nv = (Math.tanh(value) + 1) / 2;
                const color = window.Palette.color(nv);
                const idx = (py * width + px) * 4;
                data[idx]     = color.r;
                data[idx + 1] = color.g;
                data[idx + 2] = color.b;
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    visualize(canvas) {
        // In test environments (Node, no RAF), render a static frame at t=0.
        if (typeof requestAnimationFrame !== 'function') {
            this._renderFrame(canvas, 0);
            return;
        }

        const basePeriodMs = this.phenotype.periodSeconds * 1000;
        const startTime = performance.now();
        const self = this;
        const myId = this.id;
        canvas._animOwner = myId;

        // Target 20 fps — enough for smooth animation at much lower CPU cost than 60.
        const FRAME_MS = 1000 / 20;
        let lastRender = 0;

        const step = () => {
            // Canvas taken over by a static individual (Canvas2DModality.renderCached
            // sets _animOwner = null) or by another animated individual (new myId).
            if (canvas._animOwner !== myId) return;
            const now = performance.now();
            if (!_paused && now - lastRender >= FRAME_MS) {
                lastRender = now;
                // Read _periodScale every frame so [ / ] hotkeys take effect immediately.
                const effectivePeriodMs = basePeriodMs * _periodScale;
                self._renderFrame(canvas, ((now - startTime) / effectivePeriodMs) % 1);
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    describeExtra() {
        const p = this.phenotype;
        const expr = p.expression.length > 150 ? p.expression.slice(0, 150) + '…' : p.expression;
        const effective = (p.periodSeconds * _periodScale).toFixed(1);
        const scaleNote = _periodScale !== 1.0
            ? ` × ${_periodScale.toFixed(2)} = <b>${effective} s</b> (adjusted with [ / ])`
            : '';
        return `<div><b>Expression:</b> <code>${expr}</code></div>` +
               `<div><b>Period:</b> ${p.periodSeconds.toFixed(2)} s${scaleNote}</div>`;
    }
}

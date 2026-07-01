/**
 * PatternGrammarIndividual
 *
 * Grammatical evolution under PTO, the "real" way: the generator IS the
 * derivation. patternGrammarGenerator recursively expands the BNF grammar from
 * the start symbol, choosing a production by index at each non-terminal, and
 * returns the expression string directly — so the genome (PTO trace) records the
 * derivation choices and this.phenotype is the expression. No codon array. PTO's
 * generic operators handle mutation/crossover/clone.
 */

// The BNF grammar this individual evolves over. Kept here (not in Grammar.js) so
// the individual is self-contained; it's a plain rules object, the form a future
// "edit the grammar" text window would produce. A symbol is a non-terminal if it
// looks like <name>; everything else is a terminal emitted into the expression.
const imagePatternGrammar = new Grammar({
    '<pattern>': [['<expr>']],
    '<expr>': [
        ['<expr>', '<op>', '<expr>'],
        ['<func>', '(', '<expr>', ')'],
        ['ifpos', '(', '<expr>', ',', '<expr>', ',', '<expr>', ')'],
        ['<var>'],
        ['<const>']
    ],
    '<op>': [['+'], ['-'], ['*'], ['/'], ['%']],
    '<func>': [['sin'], ['cos'], ['tan'], ['exp'], ['log'], ['sqrt'], ['abs'], ['floor'], ['ceil']],
    '<var>': [['x'], ['y'], ['r'], ['theta'], ['(x+y)'], ['(x-y)'], ['(x*y)']],
    '<const>': [['0.1'], ['0.5'], ['1.0'], ['2.0'], ['3.0'], ['-1.0'], ['-0.5'], ['3.14159'], ['6.28318']]
});
const IMAGE_PATTERN_START = '<pattern>';
const IMAGE_PATTERN_MAX_DEPTH = 6; // derivation-tree depth bound (keeps expressions tractable)

// Self-contained derivation generator (inline recursion + for-loop so structural
// naming names each rule choice by its place in the derivation tree; references
// only top-level consts; see PTORepresentation). At the depth limit it restricts
// to the shortest (fewest-non-terminal) productions, so derivation terminates.
// rnd.choice over the productions is the idiomatic form: PTO's repair keeps the
// chosen value within the current symbol's productions across mutation/crossover.
const patternGrammarGenerator = (rnd) => {
    const expand = (symbol, depth) => {
        if (!imagePatternGrammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0 ? imagePatternGrammar.getProductions(symbol) : imagePatternGrammar.shortestProductions(symbol);
        const prod = rnd.choice(choices);
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    return expand(IMAGE_PATTERN_START, IMAGE_PATTERN_MAX_DEPTH);
};

const patternGrammarRepresentation = new PTORepresentation(patternGrammarGenerator);

class PatternGrammarIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = patternGrammarRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    // The interesting knob here is the grammar (the generator is boilerplate
    // derivation); expose both, grammar first.
    editableSections() {
        return [
            Individual.grammarSection(imagePatternGrammar),
            Individual.generatorSection(this.representation),
        ];
    }

    validate() {
        const phenotype = this.getPhenotype(); // the derived expression string
        if (typeof phenotype !== 'string' || phenotype.trim() === '') {
            return false;
        }

        const hasVariable = /(?:^|[^A-Za-z])(x|y|r|theta)(?:$|[^A-Za-z])/.test(phenotype);
        return hasVariable;
    }

    // this.phenotype is already the expression string the generator produced.
    getPhenotype() {
        return this.phenotype;
    }

    evaluateExpression(x, y) {
        const expression = this.phenotype;
        // Compile lazily; cache keyed by the expression so it auto-invalidates
        // when the genome changes (mutation/crossover → new expression).
        if (this._compiledExpression == null || this._compiledKey !== expression) {
            this._compiledExpression = this.compileExpression(expression);
            this._compiledKey = expression;
        }
        return this._compiledExpression(x, y);
    }

    // Compile a grammar-derived expression string into a JS function of (x, y),
    // with protected division/modulo. (Moved here from the former
    // GrammaticalRepresentation, which the derivation generator made redundant.)
    compileExpression(expression) {
        try {
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
                .replace(/ifpos\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($1) > 0 ? ($2) : ($3))')
                .replace(/\br\b/g, 'Math.sqrt(x*x + y*y)')
                .replace(/\btheta\b/g, 'Math.atan2(y, x)')
                .replace(/3\.14159/g, 'Math.PI')
                .replace(/6\.28318/g, '(2*Math.PI)');

            // Protected division and modulo
            jsExpression = jsExpression.replace(/\/([^\/]+)/g, (match, divisor) =>
                `/(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`);
            jsExpression = jsExpression.replace(/%([^%]+)/g, (match, divisor) =>
                `%(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`);

            return new Function('x', 'y', `
                try {
                    const result = ${jsExpression};
                    return isFinite(result) ? result : 0.0;
                } catch (e) {
                    return 0.0;
                }
            `);
        } catch (error) {
            return () => 0.0;
        }
    }

    visualize(canvas) {
        console.time(`visualize-${this.id}`);
        
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            for (let py = 0; py < height; py++) {
                for (let px = 0; px < width; px++) {
                    // Normalize coordinates to [-1, 1]
                    const x = (px / width) * 2 - 1;
                    const y = (py / height) * 2 - 1;

                    // Evaluate expression
                    const value = this.evaluateExpression(x, y);

                    // Normalize value to [0, 1] for palette lookup
                    const normalizedValue = (Math.tanh(value) + 1) / 2;

                    // Get color from palette
                    const color = window.Palette.color(normalizedValue);
                    
                    const index = (py * width + px) * 4;
                    data[index] = color.r;       // Red
                    data[index + 1] = color.g;   // Green
                    data[index + 2] = color.b;   // Blue
                    data[index + 3] = 255;      // Alpha
                }
            }
            
            return imageData;
        });
        
        console.timeEnd(`visualize-${this.id}`);
    }
    
    
    getExpressionString() {
        return this.getPhenotype();
    }
    
    // Helper method to get a more readable expression
    getReadableExpression() {
        const expr = this.getPhenotype();
        return expr.length > 100 ? expr.substring(0, 100) + '...' : expr;
    }
    
}
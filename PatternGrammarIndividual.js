/**
 * PatternGrammarIndividual
 *
 * Grammatical evolution under PTO. The genome (PTO trace) expresses to a codon
 * array (this.phenotype); a shared GrammaticalRepresentation maps that codon
 * array through the BNF grammar to an expression string and compiles it. PTO's
 * generic operators handle mutation/crossover/clone (standard GE codon mutation
 * is exactly PTO coarse mutation on the integer genes).
 */

const PATTERN_GRAMMAR_LENGTH = 100;

// Grammar mapper (codon array → expression → compiled fn). Reused for its
// derive/compile/evaluate helpers; its own generate/mutate/etc. are unused.
const patternGrammarMapper = new GrammaticalRepresentation({
    length: PATTERN_GRAMMAR_LENGTH,
    grammar: Grammar.createImagePatternGrammar(),
    startSymbol: '<pattern>',
    maxDerivations: 1000
});

// PTO operators over a fixed-length codon array (0-255).
const patternGrammarRepresentation = new PTORepresentation(
    (rnd) => Array.from({ length: PATTERN_GRAMMAR_LENGTH }, () => rnd.randint(0, 255))
);

class PatternGrammarIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = patternGrammarRepresentation;
        this.grammar = patternGrammarMapper;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    validate() {
        const phenotype = this.getPhenotype();
        if (typeof phenotype !== 'string' || phenotype.trim() === '') {
            return false;
        }

        const hasVariable = /(?:^|[^A-Za-z])(x|y|r|theta)(?:$|[^A-Za-z])/.test(phenotype);
        return hasVariable;
    }

    // The interpreted phenotype: the derived expression string (this.phenotype is
    // the raw codon array PTO produced).
    getPhenotype() {
        return this.grammar.derivePhenotype(this.phenotype);
    }

    evaluateExpression(x, y) {
        return this.grammar.evaluate(this.phenotype, x, y);
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
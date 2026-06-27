/**
 * PatternIndividual - Genetic Programming Pattern Generator
 *
 * Backed by PTORepresentation: a generator builds the GP expression tree directly
 * (see createTreeGenerator in TreeRepresentation.js). The genome is the PTO trace;
 * the built tree is this.phenotype. Output is 2D canvas rendering.
 */

// Coarse (default) mutation: a decision is re-sampled on mutation. We avoid
// 'fine' here because PTO's fine-mode repair for categorical (choice) genes
// assumes a like-typed counterpart, which breaks for a variable-structure tree
// whose trace realigns choice genes against differently-typed ones after
// crossover/mutation. Coarse repair handles the heterogeneous trace safely.
const patternTreeRepresentation = new PTORepresentation(
    createTreeGenerator({ maxDepth: 6 })
);

class PatternIndividual extends Individual {
    constructor(genome = null) {
        // Skip automatic genome generation
        super('SKIP_GENOME_GENERATION');

        this.representation = patternTreeRepresentation;

        // Configure 2D canvas renderer
        this.canvasRenderer = new Canvas2DModality({
            normalizer: (value) => (Math.tanh(value) + 1) / 2,
            coordinateMapper: (px, py, width, height) => ({
                x: (px / width) * 2 - 1,
                y: (py / height) * 2 - 1
            })
        });

        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    validate() {
        const tree = this.phenotype;
        if (!tree || typeof tree.getAllNodes !== 'function') {
            return false;
        }

        const nodes = tree.getAllNodes();
        return nodes.some(node => {
            const value = node && node.value;
            return typeof value === 'string' && ['x', 'y', 'r', 'theta'].includes(value);
        });
    }

    // Interpreted phenotype: the expression string (this.phenotype is the tree).
    getPhenotype() {
        return this.phenotype.toString();
    }

    describeExtra() {
        const tree = this.phenotype;
        return `\n<span class="genome-label">Expression Tree:</span>\n${tree.toString()}\n` +
            `  Depth: ${tree.depth()}  Size: ${tree.size()} nodes\n`;
    }

    /**
     * Visualize the GP expression as a 2D pattern
     */
    visualize(canvas) {
        const tree = this.phenotype;
        const evaluator = (x, y) => tree.evaluate(x, y);
        const colorMapper = (normalizedValue) => window.Palette.color(normalizedValue);
        this.canvasRenderer.render(canvas, evaluator, colorMapper);
    }
}

/**
 * PatternIndividual - Genetic Programming Pattern Generator
 *
 * REFACTORED: Uses composition pattern with separate representation and modality.
 * Genome: Expression tree (TreeRepresentation)
 * Output: 2D canvas rendering (Canvas2DModality)
 */

class PatternIndividual extends Individual {
    constructor(genome = null) {
        // Skip automatic genome generation
        super('SKIP_GENOME_GENERATION');

        // Configure tree representation
        this.representation = new TreeRepresentation({
            maxDepth: 6,
            binaryOps: ['+', '-', '*', '/', 'max', 'min', 'mod'],
            unaryOps: ['sin', 'cos', 'exp', 'log', 'sqrt', 'abs'],
            ternaryOps: ['ifpos'],
            terminals: ['x', 'y', 'r', 'theta'],
            numConstants: 10  // Add 10 random constants
        });

        // Configure 2D canvas renderer
        this.canvasRenderer = new Canvas2DModality({
            normalizer: (value) => (Math.tanh(value) + 1) / 2,
            coordinateMapper: (px, py, width, height) => ({
                x: (px / width) * 2 - 1,
                y: (py / height) * 2 - 1
            })
        });

        // Generate or set genome
        this.genome = genome || this.representation.generateRandom('grow');
    }

    usesColorPalette() { return true; }

    validate() {
        if (!this.genome || typeof this.genome.getAllNodes !== 'function') {
            return false;
        }

        const nodes = this.genome.getAllNodes();
        return nodes.some(node => {
            const value = node && node.value;
            return typeof value === 'string' && ['x', 'y', 'r', 'theta'].includes(value);
        });
    }

    /**
     * Visualize the GP expression as a 2D pattern
     */
    visualize(canvas) {
        const evaluator = (x, y) => this.representation.evaluate(this.genome, x, y);
        const colorMapper = (normalizedValue) => window.Palette.color(normalizedValue);
        this.canvasRenderer.render(canvas, evaluator, colorMapper);
    }
}

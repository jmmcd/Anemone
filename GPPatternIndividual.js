/**
 * GPPatternIndividual - Genetic Programming Pattern Generator
 *
 * REFACTORED: Uses composition pattern with separate representation and modality.
 * Genome: Expression tree (TreeRepresentation)
 * Output: 2D canvas rendering (Canvas2DModality)
 */

class GPPatternIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        // Skip automatic genome generation
        super('SKIP_GENOME_GENERATION');

        // Configure tree representation
        this.treeRep = new TreeRepresentation({
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
        this.genome = genome || this.treeRep.generateRandom('grow');
    }

    /**
     * Visualize the GP expression as a 2D pattern
     */
    visualize(canvas) {
        const evaluator = (x, y) => this.treeRep.evaluate(this.genome, x, y);

        const colorMapper = (normalizedValue) => {
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            const palette = this.getPaletteByName(paletteName);
            return this.interpolateColor(palette, normalizedValue);
        };

        this.canvasRenderer.render(canvas, evaluator, colorMapper);
    }

    /**
     * Get phenotype (tree structure and expression)
     */
    getPhenotype() {
        return this.genome;
    }

    /**
     * Mutate the tree genome
     */
    mutate(rate = 0.1) {
        this.treeRep.mutate(this.genome, rate);
        this.invalidateImageCache();
    }

    /**
     * Crossover with another GPPatternIndividual individual
     */
    crossover(other) {
        const [child1Genome, child2Genome] = this.treeRep.crossover(this.genome, other.genome);

        const child1 = new GPPatternIndividual(child1Genome);
        const child2 = new GPPatternIndividual(child2Genome);

        return [child1, child2];
    }

    /**
     * Clone this individual
     */
    clone() {
        const clone = new GPPatternIndividual(this.treeRep.clone(this.genome));
        clone.fitness = this.fitness;
        return clone;
    }
}

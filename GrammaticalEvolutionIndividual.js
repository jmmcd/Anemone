/**
 * GrammaticalEvolutionIndividual
 *
 * REFACTORED: Uses GrammaticalRepresentation + Canvas2DModality.
 * Evolves mathematical expressions using grammatical evolution.
 */

class GrammaticalEvolutionIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null, genomeLength = 100) {
        super('SKIP_GENOME_GENERATION');

        // Configure grammatical representation
        this.grammaticalRep = new GrammaticalRepresentation({
            length: genomeLength,
            grammar: Grammar.createImagePatternGrammar(),
            startSymbol: '<pattern>',
            maxDerivations: 1000
        });

        // Configure 2D canvas renderer
        this.canvasRenderer = new Canvas2DModality({
            normalizer: (value) => (Math.tanh(value) + 1) / 2
        });

        this.genome = genome || this.grammaticalRep.generateRandom();
    }

    getPhenotype() {
        return this.grammaticalRep.derivePhenotype(this.genome);
    }

    evaluateExpression(x, y) {
        return this.grammaticalRep.evaluate(this.genome, x, y);
    }
    
    visualize(canvas) {
        console.time(`visualize-${this.id}`);
        
        this.visualizeWithCache(canvas, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Get palette from framework settings
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            const palette = this.getPaletteByName(paletteName);
            
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
                    const color = this.interpolateColor(palette, normalizedValue);
                    
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
    
    
    mutate(rate = 0.1) {
        this.grammaticalRep.mutate(this.genome, rate);
        this.invalidateImageCache();
    }

    crossover(other) {
        const [child1Genome, child2Genome] = this.grammaticalRep.crossover(this.genome, other.genome);
        const length = this.genome.length;
        return [new GrammaticalEvolutionIndividual(child1Genome, length), new GrammaticalEvolutionIndividual(child2Genome, length)];
    }

    clone() {
        const clone = new GrammaticalEvolutionIndividual(this.grammaticalRep.clone(this.genome), this.genome.length);
        clone.fitness = this.fitness;
        return clone;
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
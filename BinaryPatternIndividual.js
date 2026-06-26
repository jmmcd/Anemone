/**
 * BinaryPatternIndividual
 *
 * REFACTORED: Uses composition pattern with BinaryRepresentation.
 * Displays a grid pattern based on binary genome values.
 */

class BinaryPatternIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');

        // Configure binary representation
        this.binaryRep = new BinaryRepresentation({
            length: 64  // 8x8 grid
        });

        this.genome = genome || this.binaryRep.generateRandom();
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const gridSize = 8;
        const cellWidth = width / gridSize;
        const cellHeight = height / gridSize;

        const phenotype = this.getPhenotype();

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const index = i * gridSize + j;
                const value = phenotype[index] || 0;

                ctx.fillStyle = value ? '#00ff88' : '#333';
                ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);

                ctx.strokeStyle = '#666';
                ctx.strokeRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            }
        }
    }

    getPhenotype() {
        return this.genome;
    }

    mutate(rate = 0.1) {
        this.binaryRep.mutate(this.genome, rate);
    }

    crossover(other) {
        const [child1Genome, child2Genome] = this.binaryRep.crossover(this.genome, other.genome);

        const child1 = new BinaryPatternIndividual(child1Genome);
        const child2 = new BinaryPatternIndividual(child2Genome);

        return [child1, child2];
    }

    clone() {
        const clone = new BinaryPatternIndividual(this.binaryRep.clone(this.genome));
        clone.fitness = this.fitness;
        return clone;
    }
}

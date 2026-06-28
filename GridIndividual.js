/**
 * GridIndividual
 *
 * Backed by PTORepresentation. The genome is a 64-bit array (8x8 grid); PTO's
 * generic operators handle mutation/crossover.
 */

// Explicit for-loop (not Array.from) so structural naming gives each cell its own
// counter-indexed gene name; see PTORepresentation.
const gridGenerator = (rnd) => { const cells = []; for (let i = 0; i < 64; i++) cells.push(rnd.randint(0, 1)); return cells; }; // 8x8 grid
const gridRepresentation = new PTORepresentation(gridGenerator);

class GridIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = gridRepresentation;
        this.genome = genome || this.representation.generateRandom();
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

}

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
        super();
        this.representation = gridRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const gridSize = 4;
        const cellWidth = width / gridSize;
        const cellHeight = height / gridSize;

        const phenotype = this.getPhenotype();

        // Palette colours: off cells take the palette's low end, on cells the high
        // end, borders a mid tone. rgb() strings from the {r,g,b} the service returns.
        const rgb = (t) => { const c = window.Palette.color(t); return `rgb(${c.r},${c.g},${c.b})`; };
        const offColor = rgb(0);
        const onColor = rgb(1);
        // Border width in absolute pixels, scaled so it stays a visible line at
        // the 768px zoom instead of a 1px hairline (reference is the 128px tile).
        ctx.strokeStyle = rgb(0.5);
        ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 128));

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const index = i * gridSize + j;
                const value = phenotype[index] || 0;

                ctx.fillStyle = value ? onColor : offColor;
                ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
                ctx.strokeRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            }
        }
    }

}

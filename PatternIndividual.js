/**
 * PatternIndividual - Genetic Programming Pattern Generator
 *
 * Backed by PTORepresentation: treeGenerator builds the GP expression tree as
 * plain data (see TreeRepresentation.js). The genome is the PTO trace; the
 * plain-data tree is this.phenotype; buildTreeNode() turns it into the evaluable
 * node tree (this.tree). Output is 2D canvas rendering.
 *
 * Uses the default fine/structural operators: structural naming aligns the
 * variable-structure trace by call-site, so 'fine' mutation is safe (under
 * 'linear' naming a realigned choice gene could crash fine repair).
 */
const patternTreeRepresentation = new PTORepresentation(treeGenerator);

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

    // The evaluable node tree, built (and cached per trace) from the plain-data
    // phenotype. this.phenotype stays the raw plain-data tree PTO produced.
    get tree() {
        if (this._treeKey !== this.phenotype) {
            this._tree = buildTreeNode(this.phenotype);
            this._treeKey = this.phenotype;
        }
        return this._tree;
    }

    validate() {
        const tree = this.tree;
        if (!tree || typeof tree.getAllNodes !== 'function') {
            return false;
        }

        const nodes = tree.getAllNodes();
        return nodes.some(node => {
            const value = node && node.value;
            return typeof value === 'string' && ['x', 'y', 'r', 'theta'].includes(value);
        });
    }

    // Interpreted phenotype: the expression string (this.phenotype is plain data).
    getPhenotype() {
        return this.tree.toString();
    }

    describeExtra() {
        const tree = this.tree;
        return `\n<span class="genome-label">Expression Tree:</span>\n${tree.toString()}\n` +
            `  Depth: ${tree.depth()}  Size: ${tree.size()} nodes\n`;
    }

    /**
     * Visualize the GP expression as a 2D pattern
     */
    visualize(canvas) {
        const tree = this.tree;
        const evaluator = (x, y) => tree.evaluate(x, y);
        const colorMapper = (normalizedValue) => window.Palette.color(normalizedValue);
        this.canvasRenderer.render(canvas, evaluator, colorMapper);
    }
}

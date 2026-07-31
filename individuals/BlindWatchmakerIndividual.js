// BlindWatchmakerIndividual
//
// Richard Dawkins' "biomorphs" from The Blind Watchmaker (1986) — the classic
// interactive-evolution demonstration, and a natural fit for Anemone (which is
// itself an IEC library). A biomorph is a recursively-drawn branching tree: a
// small set of "developmental" genes populates an 8-direction dx/dy table, and
// a depth/order gene drives a binary recursion that branches to one side
// (dir-1) and the other (dir+1) at every node. Because the dx table is built
// mirror-antisymmetric (dx[2-k] = -dx[2+k]) and dy mirror-symmetric, the two
// subtrees are reflections of each other — this is where the biomorphs' iconic
// bilateral symmetry (their "insect / creature" look) comes from.
//
// The genotype→phenotype map is highly indirect and pleiotropic: each shape
// gene appears in several directions at once, so a single point mutation can
// ripple through the whole body plan — exactly the "small genetic change, large
// developmental effect" Dawkins built the model to illustrate. That makes it a
// good companion to HoxCreatureIndividual (regulatory/segmented evo-devo) as a
// second, historically-important take on genotype→phenotype indirection.
//
// Like every individual it is PTO-backed. The generator returns *plain data*
// (an object of genes) — the phenotype — which this individual interprets with
// a recursive turtle to produce line segments. Keeping the generator's output
// as plain data (rather than recursing with a live drawing object) follows the
// same rule as the other structured types: PTO compiles the generator in
// isolation, so it must stay self-contained (no closures, no `new`, `for`
// loops not Array.from — see PTORepresentation).

// Genome:
//   genes: 8 integer "shape" genes (Dawkins' genes 1-8) that populate the
//          direction table below.
//   depth: the recursion order (Dawkins' gene 9). Bounded so the binary tree
//          (2^depth - 1 segments) stays cheap to draw.
const BW_NUM_GENES = 8;
const BW_GENE_MIN = -8;
const BW_GENE_MAX = 8;
const BW_DEPTH_MIN = 4;
const BW_DEPTH_MAX = 9; // 2^9 - 1 = 511 segments worst case

// Explicit for-loop (not Array.from) so structural naming gives each gene a
// counter-indexed name — see PTORepresentation.
const blindWatchmakerGenerator = (rnd) => {
    const genes = [];
    for (let i = 0; i < BW_NUM_GENES; i++) {
        genes.push(rnd.randint(BW_GENE_MIN, BW_GENE_MAX));
    }
    const depth = rnd.randint(BW_DEPTH_MIN, BW_DEPTH_MAX);
    return { genes, depth };
};

// One shared, stateless representation for all individuals of this type. The
// generator can be swapped at runtime by the code editor (setGenerator).
const blindWatchmakerRepresentation = new PTORepresentation(blindWatchmakerGenerator);

class BlindWatchmakerIndividual extends Individual {
    // this.genome is the PTO trace; this.phenotype (inherited) is the {genes,
    // depth} object the generator produced. mutate/crossover/clone are inherited.
    constructor(genome = null) {
        super();
        this.representation = blindWatchmakerRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    validate() {
        return this.buildPaths().length > 0;
    }

    // Dawkins' direction table. The 8 shape genes fill an 8-entry dx/dy pair,
    // one per compass direction. dx is built mirror-antisymmetric about the
    // vertical (dir 2 = straight up, dir 6 = straight down) and dy mirror-
    // symmetric, so the dir-1 / dir+1 branch recursion produces bilaterally
    // symmetric biomorphs. (Genes 1-7 are the classic mapping; gene 8 — often
    // vestigial in the original — is used here for the up/down centre column so
    // every gene is expressed.)
    _directionTable(genes) {
        const [a, b, c, d, e, f, g, h] = genes; // genes 1..8
        const dx = [-b, -c, 0, c, b, a, 0, -a];
        const dy = [e, d, h, d, e, f, g, f];
        return { dx, dy };
    }

    // Interpret the phenotype (the genes) with a recursive turtle, returning a
    // flat list of line segments {x1,y1,x2,y2,depthT} in an arbitrary coordinate
    // space (visualize() fits them to the canvas). Displacement is scaled by the
    // remaining recursion depth, so the trunk is longest and the twigs shortest
    // (a self-similar taper).
    buildPaths() {
        const p = this.phenotype;
        if (!p || !Array.isArray(p.genes) || p.genes.length < BW_NUM_GENES) return [];

        const depth = Math.max(1, Math.min(BW_DEPTH_MAX, p.depth | 0));
        const { dx, dy } = this._directionTable(p.genes);
        const paths = [];
        const MAX_SEGMENTS = 20000; // guard against a runaway edited generator

        // Iterative stack walk of the binary recursion (avoids deep call stacks
        // and lets us cap the segment count). Screen y grows downward, so we
        // subtract dy to make positive dy grow upward.
        const stack = [{ x: 0, y: 0, dir: 2, remaining: depth }];
        while (stack.length && paths.length < MAX_SEGMENTS) {
            const s = stack.pop();
            if (s.remaining <= 0) continue;
            const d = ((s.dir % 8) + 8) % 8;
            const nx = s.x + dx[d] * s.remaining;
            const ny = s.y - dy[d] * s.remaining;
            paths.push({
                x1: s.x, y1: s.y, x2: nx, y2: ny,
                depthT: (depth - s.remaining) / depth, // 0 at trunk → 1 at twigs
                remaining: s.remaining,
            });
            stack.push({ x: nx, y: ny, dir: s.dir - 1, remaining: s.remaining - 1 });
            stack.push({ x: nx, y: ny, dir: s.dir + 1, remaining: s.remaining - 1 });
        }
        return paths;
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            // Black background (biomorphs read as glowing creatures against it).
            const backgroundColor = { r: 0, g: 0, b: 0 };
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
            }

            const paths = this.buildPaths();
            if (paths.length === 0) return imageData;

            // Bounding box → fit-to-canvas scale and offset.
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            paths.forEach(p => {
                minX = Math.min(minX, p.x1, p.x2);
                maxX = Math.max(maxX, p.x1, p.x2);
                minY = Math.min(minY, p.y1, p.y2);
                maxY = Math.max(maxY, p.y1, p.y2);
            });

            const margin = 16;
            const drawWidth = maxX - minX;
            const drawHeight = maxY - minY;
            let scale = 1;
            if (drawWidth > 0 && drawHeight > 0) {
                scale = Math.min(
                    (width - 2 * margin) / drawWidth,
                    (height - 2 * margin) / drawHeight
                );
            }
            const offsetX = (width - drawWidth * scale) / 2 - minX * scale;
            const offsetY = (height - drawHeight * scale) / 2 - minY * scale;

            // Resolution scale (reference is the 128px tile): pen widths and the
            // glow radius are in absolute pixels, so scale them up so a zoomed
            // render is a faithful magnification. See CLAUDE.md.
            const res = Math.min(width, height) / 128;

            paths.forEach(p => {
                const color = window.Palette.color(p.depthT);
                const x1 = p.x1 * scale + offsetX;
                const y1 = p.y1 * scale + offsetY;
                const x2 = p.x2 * scale + offsetX;
                const y2 = p.y2 * scale + offsetY;
                // Thicker toward the trunk (more remaining depth), thinner twigs.
                const w = Math.max(1, Math.round((0.6 + 0.5 * p.remaining) * res));
                Canvas2DModality.drawThickLine(data, width, height, x1, y1, x2, y2, color, w);
            });

            // Bioluminescent glow, matching AnemoneIndividual's underwater style.
            Canvas2DModality.bloom(imageData, { radius: 2 * res, strength: 1.4, background: backgroundColor });

            return imageData;
        });
    }

    // Genome panel: the 8 shape genes + recursion depth, and the resulting
    // segment count — so a mutation's ripple through the direction table is
    // visible in the data next to the picture.
    describeExtra() {
        const p = this.phenotype;
        if (!p || !Array.isArray(p.genes)) return '';
        const genes = p.genes.map((g, i) => `g${i + 1}=${g}`).join(', ');
        return `\n<span class="genome-label">Biomorph genes:</span>\n  ${genes}\n  depth (order) = ${p.depth}\n  segments = ${this.buildPaths().length}\n`;
    }

    // Concise phenotype for the base describe() (the raw gene object is also the
    // genotype trace, so we summarise the drawn result instead).
    getPhenotype() {
        const p = this.phenotype;
        if (!p) return 'invalid biomorph';
        return `biomorph: order ${p.depth}, ${this.buildPaths().length} segments`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlindWatchmakerIndividual;
}

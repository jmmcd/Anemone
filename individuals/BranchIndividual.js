// BranchIndividual
//
// A free-form turtle-drawing individual with a branching, plant-like style. Its
// generator returns a flat array of
// plain-data *drawing commands* — the phenotype — which this individual
// interprets with a simple turtle to produce line segments. The command
// vocabulary mirrors the turtle commands of AnemoneIndividual:
//
//   {op:'forward', step?}            draw a line forward (step defaults to current step size)
//   {op:'turn', angle}               turn by `angle` degrees
//   {op:'color', index?}             advance palette colour, or set a specific index (0-7)
//   {op:'penWidth', delta?, width?}  thicken/thin the pen, or set an absolute width
//   {op:'step', delta?, size?}       change the forward step size
//   {op:'push'} / {op:'pop'}         save / restore turtle state (for branches)
//
// Like every individual it is PTO-backed, so the user can rewrite this
// generator live via the Generator Code editor (CodeEditorUI). It is a good
// type to experiment with because the command vocabulary above is the entire
// contract its visualize() depends on — change the generator however you like as
// long as it still returns those commands.
//
// Keeping the generator's output as plain data (rather than letting it call a
// live turtle) is exactly the pattern the other structured individuals use
// (Tree → buildTreeNode, DAG → buildDAG): PTO compiles the generator in
// isolation, so it must not reference the turtle class.

// A randomized branching plant: a `for` loop lays down forward segments,
// occasionally branching off with push/turn/forward/pop, and turning by a random
// amount each step. Every random decision goes through `rnd`, so PTO records it
// in the trace and can evolve it. (Self-contained, no closure vars, no `new`
// around rnd, explicit for-loop — the structural-naming rules in PTORepresentation.)
const branchGenerator = (rnd) => {
    // Return an array of drawing commands. The turtle starts at the origin
    // heading right (0 degrees). Available ops:
    //   {op:'forward', step?}   draw forward (step defaults to current step size)
    //   {op:'turn', angle}      turn by angle degrees
    //   {op:'color', index?}    next palette colour, or a specific index 0-7
    //   {op:'penWidth', delta?, width?}
    //   {op:'step', delta?, size?}
    //   {op:'push'} / {op:'pop'} save / restore turtle state (branching)
    const commands = [];
    const segments = rnd.randint(8, 16);
    const turnAmount = rnd.uniform(15, 35);
    const branchProb = rnd.uniform(0.3, 0.7);

    for (let i = 0; i < segments; i++) {
        commands.push({ op: 'forward', step: rnd.uniform(8, 16) });

        if (rnd.random() < branchProb) {
            // Sprout a short branch off to one side, in a new colour.
            commands.push({ op: 'push' });
            commands.push({ op: 'turn', angle: rnd.choice([-1, 1]) * turnAmount });
            commands.push({ op: 'color' });
            commands.push({ op: 'forward', step: rnd.uniform(5, 11) });
            commands.push({ op: 'pop' });
        }

        // Wander a little along the trunk.
        commands.push({ op: 'turn', angle: rnd.uniform(-turnAmount, turnAmount) });
    }

    return commands;
};

// One shared, stateless representation for all individuals of this type. The
// generator can be swapped at runtime by the code editor (setGenerator).
const branchRepresentation = new PTORepresentation(branchGenerator);

class BranchIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = branchRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    validate() {
        return this.buildPaths().length > 0;
    }

    /**
     * Interpret the phenotype (the generator's array of drawing commands) with a
     * turtle, returning a flat list of line segments {x1,y1,x2,y2,width,colorIndex}.
     */
    buildPaths() {
        const commands = this.phenotype;
        if (!Array.isArray(commands)) return [];

        const paths = [];
        let state = { x: 0, y: 0, heading: 0, penWidth: 2, colorIndex: 0, step: 10 };
        const stack = [];
        const MAX_PATHS = 20000; // guard against a runaway generator

        for (const cmd of commands) {
            if (!cmd || typeof cmd !== 'object') continue;
            switch (cmd.op) {
                case 'forward': {
                    const d = (typeof cmd.step === 'number') ? cmd.step : state.step;
                    const rad = (state.heading * Math.PI) / 180;
                    const nx = state.x + Math.cos(rad) * d;
                    const ny = state.y + Math.sin(rad) * d;
                    paths.push({
                        x1: state.x, y1: state.y, x2: nx, y2: ny,
                        width: state.penWidth, colorIndex: state.colorIndex
                    });
                    state.x = nx;
                    state.y = ny;
                    break;
                }
                case 'turn':
                    state.heading = (state.heading + (cmd.angle || 0)) % 360;
                    break;
                case 'color':
                    state.colorIndex = (typeof cmd.index === 'number')
                        ? ((cmd.index % 8) + 8) % 8
                        : (state.colorIndex + 1) % 8;
                    break;
                case 'penWidth':
                    state.penWidth = (typeof cmd.width === 'number')
                        ? Math.max(1, Math.min(8, cmd.width))
                        : Math.max(1, Math.min(8, state.penWidth + (cmd.delta || 0)));
                    break;
                case 'step':
                    state.step = (typeof cmd.size === 'number')
                        ? Math.max(1, cmd.size)
                        : Math.max(1, state.step + (cmd.delta || 0));
                    break;
                case 'push':
                    stack.push({ ...state });
                    break;
                case 'pop':
                    if (stack.length) state = stack.pop();
                    break;
            }
            if (paths.length > MAX_PATHS) break;
        }
        return paths;
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            // Black background.
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

            const margin = 20;
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

            paths.forEach(p => {
                const color = window.Palette.color(p.colorIndex / 7);
                const x1 = p.x1 * scale + offsetX;
                const y1 = p.y1 * scale + offsetY;
                const x2 = p.x2 * scale + offsetX;
                const y2 = p.y2 * scale + offsetY;
                Canvas2DModality.drawThickLine(data, width, height, x1, y1, x2, y2, color, p.width);
            });

            return imageData;
        });
    }

    // Concise, readable phenotype for the genome panel (the raw command array is
    // verbose and is also the genotype trace, so we summarise instead).
    getPhenotype() {
        const commands = Array.isArray(this.phenotype) ? this.phenotype : [];
        return `${commands.length} drawing commands, ${this.buildPaths().length} line segments`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BranchIndividual;
}

/**
 * MouseMusicIndividual
 *
 * Backed by PTORepresentation: mouseMusicGenerator emits a plain-data DAG
 * description (3 mouse inputs, 3 outputs); buildDAG (DAGRepresentation.js) turns
 * it into the runnable node graph (this.dag). The genome is the PTO trace, the
 * plain-data graph is this.phenotype. MIDIModality provides note output (with
 * Web Audio fallback).
 *
 * Mouse position feeds x1/x2; time variation feeds x3.
 * Output nodes accumulate energy and trigger notes at threshold.
 *
 * The generator is self-contained (no closure, no `new`) so PTORepresentation's
 * structural naming can compile it; connections are emitted as indices into the
 * earlier nodes. Processing nodes connect only to earlier nodes (acyclic).
 */
const mouseMusicGenerator = (rnd) => {
    const numInputs = 3, numOutputs = 3;
    const inputs = [];
    for (let i = 0; i < numInputs; i++) inputs.push({ baseValue: rnd.uniform(-1, 1) });

    const numProc = rnd.randint(2, 9); // 2..9 processing nodes
    const procs = [];
    for (let i = 0; i < numProc; i++) {
        const op = rnd.choice(DAG_OPERATIONS);
        const arity = DAG_ARITIES[op];
        const available = numInputs + i; // inputs + earlier procs
        const ins = [];
        for (let j = 0; j < arity; j++) ins.push(rnd.randint(0, available - 1));
        procs.push({ op, arity, inputs: ins });
    }

    const outputs = [];
    const upstream = numInputs + numProc;
    for (let i = 0; i < numOutputs; i++) {
        outputs.push({ threshold: rnd.uniform(0.5, 2.5), inputs: [rnd.randint(0, upstream - 1), rnd.randint(0, upstream - 1)] });
    }

    return { inputs, procs, outputs };
};

const mouseMusicRepresentation = new PTORepresentation(mouseMusicGenerator);

class MouseMusicIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');

        this.representation = this.makeRepresentation();

        // Use the framework's single shared MIDIModality (falls back to a local
        // one outside the app, e.g. in tests).
        this.midiModality = (typeof window !== 'undefined' && window.framework && window.framework.sharedMIDI) || new MIDIModality();

        this.genome = genome || this.representation.generateRandom();

        this.timeStep = 100;

        // Mouse tracking
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseListener = null;
        this.canvas = null;

        console.log(`🎵 DAG Individual ${this.id} created`);
    }

    // Which PTO representation this individual uses; overridden by subclasses
    // (e.g. EEG uses 5 inputs / 2 outputs). Called from the constructor.
    makeRepresentation() {
        return mouseMusicRepresentation;
    }

    // The runnable DAG, built once per trace from the plain-data phenotype and
    // cached (it carries runtime state: energy, mouse/EEG/time-driven values).
    // this.phenotype stays the plain-data description PTO produced.
    get dag() {
        if (this._dagKey !== this.phenotype) {
            this._dag = buildDAG(this.phenotype);
            this._dagKey = this.phenotype;
        }
        return this._dag;
    }

    // The built DAG with this individual's MIDI modality wired into its output
    // nodes (idempotent; the modality is the shared one).
    wiredDAG() {
        const dag = this.dag;
        dag.outputNodes.forEach(node => node.setMidiModality(this.midiModality));
        return dag;
    }

    setMidiOutput(midiOutput) {
        this.midiModality.setMidiOutput(midiOutput);
    }

    setupMouseTracking(canvas) {
        const dag = this.dag;
        this.mouseListener = (event) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = (event.clientX - rect.left) / rect.width * 2 - 1;
            this.mouseY = 1 - (event.clientY - rect.top) / rect.height * 2;

            if (dag.inputNodes.length >= 2) {
                dag.inputNodes[0].setValue(this.mouseX);
                dag.inputNodes[1].setValue(this.mouseY);
            }
        };
        canvas.addEventListener('mousemove', this.mouseListener);
        console.log(`🖱 Mouse tracking enabled for DAG ${this.id}`);
    }

    removeMouseTracking(canvas) {
        if (this.mouseListener && canvas) {
            canvas.removeEventListener('mousemove', this.mouseListener);
            this.mouseListener = null;
            console.log(`🖱 Mouse tracking disabled for DAG ${this.id}`);
        }
    }

    evaluateDAG() {
        const dag = this.dag;
        dag.allNodes.forEach(node => node.reset());

        if (dag.inputNodes.length >= 3) {
            const time = Date.now() / 1000;
            if (!this.mouseListener) {
                // Input base values come from the generator (node.baseValue); add
                // gentle time variation so a static individual still drifts.
                dag.inputNodes.forEach((node, i) => {
                    node.setValue(node.baseValue + Math.sin(time * (0.1 + i * 0.05)) * 0.3);
                });
            } else {
                // x1/x2 set by mouse; x3 gets time variation
                dag.inputNodes[2].setValue(dag.inputNodes[2].baseValue + Math.sin(time * 0.2) * 0.3);
            }
        }

        dag.outputNodes.forEach(node => node.evaluate());
    }

    // Interpreted phenotype: a plain description of the DAG read off the live,
    // stateful node graph (this.dag); this.phenotype is the raw plain-data graph.
    getPhenotype() {
        const dag = this.dag;
        return {
            inputNodes: dag.inputNodes.map(node => ({
                id: node.id, value: node.value, type: 'input'
            })),
            processingNodes: dag.processingNodes.map(node => ({
                id: node.id, operation: node.operation, arity: node.arity,
                inputs: node.inputs.map(n => n.id), type: 'processing'
            })),
            outputNodes: dag.outputNodes.map(node => ({
                id: node.id, threshold: node.threshold,
                energyAccumulator: node.energyAccumulator,
                inputs: node.inputs.map(n => n.id), type: 'output'
            }))
        };
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        this.canvas = canvas;

        const phenotype = this.getPhenotype();
        const inputX = 15, procX = width / 2, outputX = width - 15;

        phenotype.inputNodes.forEach((node, index) => {
            const y = 15 + index * 25;
            const label = index === 0 ? 'x1 (mouse-X)' : index === 1 ? 'x2 (mouse-Y)' : node.id;
            const color = index < 2 ? '#FF9800' : '#4CAF50';
            this.drawNode(ctx, inputX, y, label, color, node.value.toFixed(2));
        });

        phenotype.processingNodes.forEach((node, index) => {
            const y = 15 + index * 22;
            this.drawNode(ctx, procX, y, node.id, '#2196F3', node.operation);
        });

        phenotype.outputNodes.forEach((node, index) => {
            const y = 15 + index * 40;
            const color = node.energyAccumulator > node.threshold * 0.8 ? '#FF5722' : '#FF9800';
            this.drawNode(ctx, outputX, y, node.id, color,
                `E:${node.energyAccumulator.toFixed(1)}\nT:${node.threshold.toFixed(1)}`);
        });

        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.5;
        phenotype.processingNodes.forEach((node, index) => {
            const y = 15 + index * 22;
            ctx.beginPath();
            ctx.moveTo(inputX + 8, 15 + 12);
            ctx.lineTo(procX - 8, y);
            ctx.stroke();
        });
    }

    drawNode(ctx, x, y, label, color, detail) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 12);

        ctx.font = '7px monospace';
        detail.split('\n').forEach((line, i) => ctx.fillText(line, x, y + 14 + i * 8));
    }

    playMIDI() {
        if (this.midiModality.isRunning) {
            this.stopDAG();
        } else {
            this.startDAG();
        }
    }

    stopMIDI() { this.stopDAG(); }

    startDAG() {
        if (!this.midiModality.isRunning) {
            // Wire MIDI and clear any leftover energy before this play session.
            this.wiredDAG().outputNodes.forEach(node => { node.energyAccumulator = 0; });
            if (this.canvas) this.setupMouseTracking(this.canvas);
            console.log(`🔄 Starting DAG ${this.id}`);
            this.midiModality.start(() => this.evaluateDAG(), this.timeStep);
        }
    }

    stopDAG() {
        if (this.midiModality.isRunning) {
            console.log(`⏹ Stopping DAG ${this.id}`);
            this.midiModality.stop();
            if (this.canvas) this.removeMouseTracking(this.canvas);
        }
    }

}

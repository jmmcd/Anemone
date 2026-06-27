/**
 * DAG node classes + PTO generator
 *
 * The DAG node classes (InputNode/ProcessingNode/OutputNode) and a `createDAGGenerator`
 * factory: a PTO generator that builds a runnable DAG *directly* from `rnd`
 * decisions (rather than decoding an integer array). The trace of those decisions
 * is the genotype; the built DAG is the phenotype.
 *
 * `createDAGGenerator({ numInputs, numOutputs })` is configurable so it serves both
 * MouseMusicIndividual (3 mouse inputs, 3 outputs) and EEGSonificationIndividual
 * (5 EEG inputs, 2 outputs).
 *
 * OutputNode uses MIDIModality.sendNote() rather than calling midiOutput.send()
 * directly, so Web Audio fallback is available to all DAG individuals.
 */

// ---------------------------------------------------------------------------
// Node classes
// ---------------------------------------------------------------------------

class DAGNode {
    constructor(id, type) {
        this.id = id;
        this.type = type;
        this.inputs = [];
        this.output = null;
        this.evaluated = false;
    }

    addInput(node) { this.inputs.push(node); }

    evaluate() { throw new Error('evaluate() must be implemented'); }

    reset() {
        this.evaluated = false;
        this.output = null;
    }
}

class InputNode extends DAGNode {
    constructor(id, value = 0) {
        super(id, 'input');
        this.baseValue = value; // immutable initial value from the generator
        this.value = value;     // mutated each evaluation (mouse/EEG/time)
        this.output = value;
    }

    evaluate() {
        if (!this.evaluated) {
            this.output = this.value;
            this.evaluated = true;
        }
        return this.output;
    }

    setValue(value) {
        this.value = value;
        this.output = value;
        this.evaluated = false;
    }
}

class ProcessingNode extends DAGNode {
    constructor(id, operation, arity) {
        super(id, 'processing');
        this.operation = operation;
        this.arity = arity;
    }

    evaluate() {
        if (!this.evaluated) {
            const vals = this.inputs.slice(0, this.arity).map(n => n ? n.evaluate() : 0);
            this.output = this._apply(vals);
            this.evaluated = true;
        }
        return this.output;
    }

    _apply(inputs) {
        switch (this.operation) {
            case 'add':      return inputs.length >= 2 ? inputs[0] + inputs[1] : 0;
            case 'sub':      return inputs.length >= 2 ? inputs[0] - inputs[1] : 0;
            case 'mul':      return inputs.length >= 2 ? inputs[0] * inputs[1] : 0;
            case 'div':      return inputs.length >= 2 && inputs[1] !== 0 ? inputs[0] / inputs[1] : 0;
            case 'sin':      return inputs.length >= 1 ? Math.sin(inputs[0]) : 0;
            case 'cos':      return inputs.length >= 1 ? Math.cos(inputs[0]) : 0;
            case 'min':      return inputs.length >= 2 ? Math.min(inputs[0], inputs[1]) : 0;
            case 'max':      return inputs.length >= 2 ? Math.max(inputs[0], inputs[1]) : 0;
            case 'abs':      return inputs.length >= 1 ? Math.abs(inputs[0]) : 0;
            case 'if_gt_zero': return inputs.length >= 3 ? (inputs[0] > 0 ? inputs[1] : inputs[2]) : 0;
            default:         return 0;
        }
    }
}

class OutputNode extends DAGNode {
    constructor(id, threshold = 0.1) {
        super(id, 'output');
        this.threshold = threshold;
        this.energyAccumulator = 0;
        this.lastPitch = 60;
        this.midiModality = null;
        this.diatonicScale = [60, 62, 64, 65, 67, 69, 71, 72];
        this.lastNoteTime = 0;
        this.noteDuration = 200;
    }

    setMidiModality(modality) { this.midiModality = modality; }

    evaluate() {
        if (!this.evaluated && this.inputs.length >= 2) {
            const pitchValue = this.inputs[0] ? this.inputs[0].evaluate() : 0;
            const energyValue = this.inputs[1] ? this.inputs[1].evaluate() : 0;

            this.lastPitch = this._mapPitch(pitchValue);
            this.energyAccumulator += Math.abs(energyValue);

            if (this.energyAccumulator >= this.threshold) {
                this._triggerNote();
            }

            this.output = this.energyAccumulator;
            this.evaluated = true;
        }
        return this.output || 0;
    }

    _mapPitch(value) {
        const index = Math.floor(Math.abs(value * 10) % this.diatonicScale.length);
        return this.diatonicScale[index];
    }

    _triggerNote() {
        if (this.midiModality) {
            const velocity = Math.min(127, Math.max(40, Math.floor(this.energyAccumulator * 50)));
            this.lastNoteTime = Date.now();
            this.midiModality.sendNote(this.lastPitch, velocity, this.noteDuration);
        }
        this.energyAccumulator = 0;
    }
}

// ---------------------------------------------------------------------------
// createDAGGenerator — a PTO generator that builds a DAG directly from rnd
// ---------------------------------------------------------------------------

const DAG_OPERATIONS = ['add', 'sub', 'mul', 'sin', 'min', 'max', 'abs', 'if_gt_zero'];
const DAG_ARITIES = { add: 2, sub: 2, mul: 2, sin: 1, min: 2, max: 2, abs: 1, if_gt_zero: 3 };

/**
 * Build a PTO generator for a DAG with the given input/output counts. The
 * generator constructs the node graph directly using `rnd`, so PTO's trace of
 * those decisions is the genotype and the built DAG is the phenotype. Use it
 * with PTORepresentation; the individual reads the DAG via `this.phenotype`.
 *
 * @param {object} config
 * @param {number} config.numInputs
 * @param {number} config.numOutputs
 * @returns {(rnd) => {allNodes, inputNodes, outputNodes, processingNodes}}
 */
function createDAGGenerator({ numInputs, numOutputs }) {
    return (rnd) => {
        const allNodes = [], inputNodes = [], outputNodes = [], processingNodes = [];

        for (let i = 0; i < numInputs; i++) {
            const node = new InputNode(`x${i + 1}`, rnd.uniform(-1, 1));
            inputNodes.push(node);
            allNodes.push(node);
        }

        const numProc = rnd.randint(2, 9); // 2..9 processing nodes
        for (let i = 0; i < numProc; i++) {
            const op = rnd.choice(DAG_OPERATIONS);
            const node = new ProcessingNode(`p${i + 1}`, op, DAG_ARITIES[op]);
            processingNodes.push(node);
            allNodes.push(node);
        }

        for (let i = 0; i < numOutputs; i++) {
            const node = new OutputNode(`y${i + 1}`, rnd.uniform(0.5, 2.5));
            outputNodes.push(node);
            allNodes.push(node);
        }

        // Processing nodes connect to earlier nodes only (inputs + already-created
        // processing nodes), which keeps the graph acyclic.
        for (let i = 0; i < processingNodes.length; i++) {
            const node = processingNodes[i];
            const available = [...inputNodes, ...processingNodes.slice(0, i)];
            for (let j = 0; j < node.arity; j++) {
                node.addInput(rnd.choice(available));
            }
        }

        // Each output reads two upstream nodes (pitch source, energy source).
        const upstream = [...inputNodes, ...processingNodes];
        for (const node of outputNodes) {
            node.addInput(rnd.choice(upstream));
            node.addInput(rnd.choice(upstream));
        }

        return { allNodes, inputNodes, outputNodes, processingNodes };
    };
}

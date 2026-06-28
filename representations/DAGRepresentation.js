/**
 * DAG node classes + plain-data → DAG converter
 *
 * The DAG node classes (InputNode/ProcessingNode/OutputNode), the operation
 * tables, and `buildDAG`, which turns the plain-data graph description a PTO
 * generator produces into a runnable DAG of node instances.
 *
 * The generators themselves live in the individuals (mouseMusicGenerator in
 * MouseMusicIndividual, eegSonificationGenerator in EEGSonificationIndividual),
 * because PTORepresentation's structural naming requires each generator to be
 * self-contained (no factory/closure) and free of `new` — so they emit plain
 * data (connections as indices) and call buildDAG() here to instantiate nodes.
 * The trace of the generator's decisions is the genotype; the plain-data graph
 * is the phenotype; the built DAG is stateful runtime state held by the
 * individual.
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
// DAG operation tables + buildDAG (plain data → runnable node graph)
// ---------------------------------------------------------------------------

// Shared by the individuals' generators (a generator may reference these
// top-level consts; structural naming still resolves them).
const DAG_OPERATIONS = ['add', 'sub', 'mul', 'sin', 'min', 'max', 'abs', 'if_gt_zero'];
const DAG_ARITIES = { add: 2, sub: 2, mul: 2, sin: 1, min: 2, max: 2, abs: 1, if_gt_zero: 3 };

/**
 * Instantiate a runnable DAG from the plain-data description produced by a
 * generator. Shape of `plain`:
 *   {
 *     inputs:  [{ baseValue }],                       // → InputNode
 *     procs:   [{ op, arity, inputs:[idx,…] }],       // → ProcessingNode
 *     outputs: [{ threshold, inputs:[idx, idx] }],    // → OutputNode
 *   }
 * Connection indices reference earlier nodes: a proc at position i indexes into
 * [inputNodes … processingNodes[0..i-1]] (keeping the graph acyclic); an output
 * indexes into [inputNodes … all processingNodes]. Indices are clamped in case a
 * mutation/repair left one referencing a node that no longer exists.
 *
 * @returns {{allNodes, inputNodes, outputNodes, processingNodes}}
 */
function buildDAG(plain) {
    const inputNodes = plain.inputs.map((d, i) => new InputNode(`x${i + 1}`, d.baseValue));
    const processingNodes = plain.procs.map((d, i) => new ProcessingNode(`p${i + 1}`, d.op, d.arity));
    const outputNodes = plain.outputs.map((d, i) => new OutputNode(`y${i + 1}`, d.threshold));
    const allNodes = [...inputNodes, ...processingNodes, ...outputNodes];

    const pick = (pool, idx) => pool[Math.max(0, Math.min(idx, pool.length - 1))];

    // Processing nodes connect to earlier nodes only (inputs + already-created
    // processing nodes), which keeps the graph acyclic.
    plain.procs.forEach((d, i) => {
        const available = [...inputNodes, ...processingNodes.slice(0, i)];
        d.inputs.forEach(idx => processingNodes[i].addInput(pick(available, idx)));
    });

    // Each output reads two upstream nodes (pitch source, energy source).
    const upstream = [...inputNodes, ...processingNodes];
    plain.outputs.forEach((d, i) => {
        d.inputs.forEach(idx => outputNodes[i].addInput(pick(upstream, idx)));
    });

    return { allNodes, inputNodes, outputNodes, processingNodes };
}

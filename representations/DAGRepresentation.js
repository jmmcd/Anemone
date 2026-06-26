/**
 * DAGRepresentation
 *
 * Encapsulates the DAG genome representation: node classes and the logic
 * that builds a runnable DAG from an integer array genome.
 *
 * Configurable so the same class handles both DAGIndividual (3 mouse inputs,
 * 3 outputs) and EEGSonificationIndividual (5 EEG inputs, 2 outputs).
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
        this.value = value;
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
// DAGRepresentation — builds and manages a DAG from an integer genome
// ---------------------------------------------------------------------------

class DAGRepresentation {
    /**
     * @param {object} config
     * @param {number} config.genomeLength
     * @param {number} config.numInputs        - Number of input nodes
     * @param {number} config.numOutputs       - Number of output nodes
     * @param {number} config.numProcIndex     - Genome index that encodes numProcessingNodes
     * @param {number} config.procOpsStartIndex - Genome index where processing-node ops begin
     * @param {number} config.outputThresholdIndex - Genome index where output thresholds begin
     * @param {number} config.connectionStartIndex - Genome index where connection spec begins
     */
    constructor(config = {}) {
        this.genomeLength = config.genomeLength || 100;
        this.numInputs = config.numInputs || 3;
        this.numOutputs = config.numOutputs || 3;
        this.numProcIndex = config.numProcIndex !== undefined ? config.numProcIndex : this.numInputs;
        this.procOpsStartIndex = config.procOpsStartIndex !== undefined ? config.procOpsStartIndex : this.numInputs + 1;
        this.outputThresholdIndex = config.outputThresholdIndex !== undefined ? config.outputThresholdIndex : 20;
        this.connectionStartIndex = config.connectionStartIndex || 30;

        this.operations = ['add', 'sub', 'mul', 'sin', 'min', 'max', 'abs', 'if_gt_zero'];
        this.arities    = [2,     2,     2,     1,     2,     2,     1,     3           ];
    }

    generateRandom() {
        return Array.from({length: this.genomeLength}, () => Math.floor(Math.random() * 256));
    }

    /**
     * Build a DAG from the genome.
     * @returns {{allNodes, inputNodes, outputNodes, processingNodes}}
     */
    build(genome) {
        const allNodes = [], inputNodes = [], outputNodes = [], processingNodes = [];

        for (let i = 0; i < this.numInputs; i++) {
            const node = new InputNode(`x${i + 1}`, (genome[i] / 255) * 2 - 1);
            inputNodes.push(node);
            allNodes.push(node);
        }

        const numProc = (genome[this.numProcIndex] % 8) + 2;
        for (let i = 0; i < numProc; i++) {
            const opIndex = genome[this.procOpsStartIndex + i] % this.operations.length;
            const node = new ProcessingNode(`p${i + 1}`, this.operations[opIndex], this.arities[opIndex]);
            processingNodes.push(node);
            allNodes.push(node);
        }

        for (let i = 0; i < this.numOutputs; i++) {
            const threshold = (genome[this.outputThresholdIndex + i] / 255) * 2 + 0.5;
            const node = new OutputNode(`y${i + 1}`, threshold);
            outputNodes.push(node);
            allNodes.push(node);
        }

        this._createConnections(processingNodes, inputNodes, outputNodes, genome);

        return { allNodes, inputNodes, outputNodes, processingNodes };
    }

    _createConnections(processingNodes, inputNodes, outputNodes, genome) {
        let idx = this.connectionStartIndex;

        for (let i = 0; i < processingNodes.length; i++) {
            const node = processingNodes[i];
            const available = [...inputNodes, ...processingNodes.slice(0, i)];
            for (let j = 0; j < node.arity && j < available.length; j++) {
                if (idx < genome.length) {
                    node.addInput(available[genome[idx++] % available.length]);
                }
            }
        }

        const allPossible = [...inputNodes, ...processingNodes];
        for (const node of outputNodes) {
            if (idx < genome.length - 1 && allPossible.length > 0) {
                node.addInput(allPossible[genome[idx++] % allPossible.length]);
                node.addInput(allPossible[genome[idx++] % allPossible.length]);
            }
        }
    }

    mutate(genome, rate = 0.1) {
        for (let i = 0; i < genome.length; i++) {
            if (Math.random() < rate) {
                genome[i] = Math.floor(Math.random() * 256);
            }
        }
        return genome;
    }

    crossover(genome1, genome2) {
        const child1 = [...genome1];
        const child2 = [...genome2];
        const point = Math.floor(Math.random() * genome1.length);
        for (let i = point; i < genome1.length; i++) {
            [child1[i], child2[i]] = [child2[i], child1[i]];
        }
        return [child1, child2];
    }

    clone(genome) {
        return [...genome];
    }
}

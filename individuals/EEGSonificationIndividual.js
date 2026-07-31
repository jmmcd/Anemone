/**
 * EEGSonificationIndividual
 *
 * Extends MouseMusicIndividual, overriding makeRepresentation() to use a DAG
 * generator with 5 EEG feature inputs and 2 output nodes (vs the mouse variant's
 * 3 inputs / 3 outputs). MIDI output (with Web Audio fallback), buildDAG/this.dag
 * and the PTO operators are inherited.
 *
 * Same self-contained, plain-data form as mouseMusicGenerator (see that file and
 * DAGRepresentation.js), differing only in the input/output counts.
 *
 * Input comes live from window.OSCInput (OSC-over-WebSocket) — the 5 feature values
 * of the latest received /eeg message drive the DAG's input nodes. It reads that
 * app-level service directly (the way palette/photo individuals read window.Palette /
 * window.Photo); the OSC Input drawer panel (attached via usesOSCInput()) connects it.
 * Feed it by replaying an EEG CSV with scripts/eeg-osc-sender.js, or from any live
 * OSC source. (This replaced the earlier in-browser CSV loader / EEGDataStream.)
 */
const eegSonificationGenerator = (rnd) => {
    const numInputs = 5, numOutputs = 2;
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

const eegRepresentation = new PTORepresentation(eegSonificationGenerator);

class EEGSonificationIndividual extends MouseMusicIndividual {
    makeRepresentation() {
        return eegRepresentation;
    }

    // Attaches the OSC Input drawer panel (OSCInputUI), through which the user connects
    // window.OSCInput to an OSC-over-WebSocket sender feeding /eeg feature messages.
    usesOSCInput() { return true; }

    evaluateEEGDAG() {
        try {
            const dag = this.dag;
            if (!dag.allNodes.length) return;
            dag.allNodes.forEach(node => node.reset());

            // Latest EEG features from the live OSC stream (null until data arrives).
            const osc = (typeof window !== 'undefined') ? window.OSCInput : null;
            const sample = osc && osc.sample();
            if (sample && Array.isArray(sample.features)) {
                for (let i = 0; i < dag.inputNodes.length; i++) {
                    const val = sample.features[i] !== undefined ? sample.features[i] : 0;
                    dag.inputNodes[i].setValue(val);
                }
            }

            dag.outputNodes.forEach(node => node.evaluate());
        } catch (error) {
            // silent — EEG evaluation errors are transient (missing data, mid-stream)
        }
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.canvas = canvas;

        const phenotype = this.getPhenotype();
        const inputX = 15, procX = canvas.width / 2, outputX = canvas.width - 15;

        phenotype.inputNodes.forEach((node, index) => {
            const y = 15 + index * 25;
            this.drawNode(ctx, inputX, y, `eeg${index}`, '#9C27B0', node.value.toFixed(2));
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

    playMIDI() {
        if (this.midiModality.isRunning) { this.stopEEG(); } else { this.startEEG(); }
    }

    stopMIDI() { this.stopEEG(); }

    startEEG() {
        if (!this.midiModality.isRunning) {
            this.wiredDAG().outputNodes.forEach(node => { node.energyAccumulator = 0; });
            this.midiModality.start(() => {
                try { this.evaluateEEGDAG(); } catch (e) { /* transient */ }
            }, this.timeStep);
        }
    }

    stopEEG() {
        if (this.midiModality.isRunning) {
            this.midiModality.stop();
        }
    }
}

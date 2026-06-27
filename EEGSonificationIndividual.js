/**
 * EEGSonificationIndividual
 *
 * Extends MouseMusicIndividual, overriding makeRepresentation() to use a DAG
 * generator with 5 EEG feature inputs and 2 output nodes (vs the mouse variant's
 * 3 inputs / 3 outputs). MIDI output (with Web Audio fallback) and the PTO
 * operators are inherited.
 */

const eegRepresentation = new PTORepresentation(
    createDAGGenerator({ numInputs: 5, numOutputs: 2 })
);

class EEGSonificationIndividual extends MouseMusicIndividual {
    constructor(genome = null) {
        super(genome);
        this.eegStream = null;
        console.log(`🧠 EEG Sonification Individual ${this.id} created`);
    }

    makeRepresentation() {
        return eegRepresentation;
    }

    /**
     * Set the EEG data stream (called by framework).
     */
    setEEGDataStream(stream) {
        this.eegStream = stream;
        console.log(`🧠 EEG stream set for individual ${this.id}`);
    }

    evaluateEEGDAG() {
        try {
            const dag = this.phenotype;
            if (!dag.allNodes.length) return;
            dag.allNodes.forEach(node => node.reset());

            if (!this.eegStream || !this.eegStream.data || this.eegStream.data.length === 0) return;

            const sample = this.eegStream.getCurrentSample();
            if (sample && sample.features && Array.isArray(sample.features)) {
                for (let i = 0; i < dag.inputNodes.length; i++) {
                    const val = sample.features[i] !== undefined ? sample.features[i] : 0;
                    dag.inputNodes[i].setValue(val);
                }
            }

            dag.outputNodes.forEach(node => node.evaluate());
        } catch (error) {
            console.error(`Error in evaluateEEGDAG for ${this.id}:`, error);
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
            // Wire MIDI and clear any leftover energy before this play session.
            this.wiredDAG().outputNodes.forEach(node => { node.energyAccumulator = 0; });
            console.log(`🧠 Starting EEG sonification ${this.id}`);
            this.midiModality.start(() => {
                try { this.evaluateEEGDAG(); } catch (e) {
                    console.error(`❌ Error in EEG evaluation for ${this.id}:`, e);
                }
            }, this.timeStep);
        }
    }

    stopEEG() {
        if (this.midiModality.isRunning) {
            console.log(`⏹ Stopping EEG sonification ${this.id}`);
            this.midiModality.stop();
        }
    }
}

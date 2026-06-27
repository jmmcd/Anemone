/**
 * EEGSonificationIndividual
 *
 * REFACTORED: Extends DAGIndividual, overriding the DAGRepresentation config
 * to use 5 EEG feature inputs instead of 3 mouse/time inputs, and 2 output
 * nodes instead of 3.  MIDI output (with Web Audio fallback) is inherited
 * from DAGIndividual via MIDIModality.
 */
class EEGSonificationIndividual extends DAGIndividual {
    constructor(genome = null) {
        super(genome);

        // Override with EEG-specific DAG structure
        this.dagRep = new DAGRepresentation({
            genomeLength: 100,
            numInputs: 5,
            numOutputs: 2,
            numProcIndex: 5,
            procOpsStartIndex: 6,
            outputThresholdIndex: 25,
            connectionStartIndex: 30
        });

        // EEG stream data
        this.eegStream = null;

        console.log(`🧠 EEG Sonification Individual ${this.id} created`);

        // Rebuild with EEG config (overrides the mouse-DAG built by super())
        this.buildEEGDAGFromGenome();
    }

    /**
     * Set the EEG data stream (called by framework).
     */
    setEEGDataStream(stream) {
        this.eegStream = stream;
        console.log(`🧠 EEG stream set for individual ${this.id}`);
    }

    buildEEGDAGFromGenome() {
        const dag = this.dagRep.build(this.genome);
        this.allNodes = dag.allNodes;
        this.inputNodes = dag.inputNodes;
        this.outputNodes = dag.outputNodes;
        this.processingNodes = dag.processingNodes;
        this.outputNodes.forEach(node => node.setMidiModality(this.midiModality));
    }

    evaluateEEGDAG() {
        try {
            if (!this.allNodes || this.allNodes.length === 0) return;
            this.allNodes.forEach(node => node.reset());

            if (!this.eegStream || !this.eegStream.data || this.eegStream.data.length === 0) return;

            const sample = this.eegStream.getCurrentSample();
            if (sample && sample.features && Array.isArray(sample.features)) {
                for (let i = 0; i < 5; i++) {
                    const val = sample.features[i] !== undefined ? sample.features[i] : 0;
                    if (this.inputNodes[i]) this.inputNodes[i].setValue(val);
                }
            }

            this.outputNodes.forEach(node => node.evaluate());
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

    mutate(rate = 0.01) {
        this.representation.mutate(this.genome, rate);
        this.buildEEGDAGFromGenome();
    }

    crossover(other) {
        const [g1, g2] = this.representation.crossover(this.genome, other.genome);
        const child1 = new EEGSonificationIndividual(g1);
        const child2 = new EEGSonificationIndividual(g2);
        return [child1, child2];
    }
}

/**
 * EEGSonificationIndividual
 *
 * Extends DAGIndividual to map EEG data streams to MIDI notes.
 * Input nodes receive EEG features instead of mouse/time coordinates.
 * Designed for real-time streaming with optional CSV replay.
 */
class EEGSonificationIndividual extends DAGIndividual {
    constructor(genome = null) {
        // Initialize DAGIndividual properties (we override the build step)
        super(genome);

        // EEG stream data
        this.eegStream = null;
        this.currentEEGSample = null;

        console.log(`🧠 EEG Sonification Individual ${this.id} created`);

        // Build DAG with EEG inputs instead of mouse/time
        this.buildEEGDAGFromGenome();
    }

    /**
     * Set the EEG data stream (called by framework)
     * @param {EEGDataStream} stream - Stream object with getCurrentSample() method
     */
    setEEGDataStream(stream) {
        this.eegStream = stream;
        console.log(`🧠 EEG stream set for individual ${this.id}`);
    }

    /**
     * Build DAG with EEG input variables instead of mouse/time
     * Creates 5 EEG input nodes from genome values
     */
    buildEEGDAGFromGenome() {
        this.allNodes = [];
        this.inputNodes = [];
        this.outputNodes = [];
        this.processingNodes = [];

        // Create 5 EEG input nodes (features 0-4)
        // These will be updated from the EEG stream
        for (let i = 0; i < 5; i++) {
            const value = (this.genome[i] / 255) * 2 - 1; // Map to [-1, 1]
            const inputNode = new InputNode(`eeg${i}`, value);
            this.inputNodes.push(inputNode);
            this.allNodes.push(inputNode);
        }

        // Create processing nodes (same as DAGIndividual)
        const numProcessingNodes = (this.genome[5] % 8) + 2; // 2-9 processing nodes
        const operations = ['add', 'sub', 'mul', 'sin', 'min', 'max', 'abs', 'if_gt_zero'];
        const arities = [2, 2, 2, 1, 2, 2, 1, 3];

        for (let i = 0; i < numProcessingNodes; i++) {
            const opIndex = this.genome[6 + i] % operations.length;
            const operation = operations[opIndex];
            const arity = arities[opIndex];

            const procNode = new ProcessingNode(`p${i + 1}`, operation, arity);
            this.processingNodes.push(procNode);
            this.allNodes.push(procNode);
        }

        // Create output nodes (2 outputs for MIDI)
        for (let i = 0; i < 2; i++) {
            const threshold = (this.genome[25 + i] / 255) * 2 + 0.5; // Threshold 0.5-2.5
            const outputNode = new OutputNode(`y${i + 1}`, threshold);
            this.outputNodes.push(outputNode);
            this.allNodes.push(outputNode);
        }

        // Create connections
        this.createEEGConnections();
    }

    /**
     * Create connections for EEG DAG
     */
    createEEGConnections() {
        // Connect processing nodes to available inputs (EEG inputs + previous processing nodes)
        let connectionIndex = 30;

        for (let i = 0; i < this.processingNodes.length; i++) {
            const node = this.processingNodes[i];
            const availableInputs = [...this.inputNodes, ...this.processingNodes.slice(0, i)];

            for (let j = 0; j < node.arity && j < availableInputs.length; j++) {
                if (connectionIndex < this.genome.length) {
                    const inputIndex = this.genome[connectionIndex++] % availableInputs.length;
                    node.addInput(availableInputs[inputIndex]);
                }
            }
        }

        // Connect output nodes (each needs pitch and energy inputs)
        const allPossibleInputs = [...this.inputNodes, ...this.processingNodes];

        for (let i = 0; i < this.outputNodes.length; i++) {
            const node = this.outputNodes[i];

            if (connectionIndex < this.genome.length - 1 && allPossibleInputs.length > 0) {
                // Pitch input
                const pitchIndex = this.genome[connectionIndex++] % allPossibleInputs.length;
                node.addInput(allPossibleInputs[pitchIndex]);

                // Energy input
                const energyIndex = this.genome[connectionIndex++] % allPossibleInputs.length;
                node.addInput(allPossibleInputs[energyIndex]);
            }
        }
    }

    /**
     * Evaluate DAG with current EEG sample
     */
    evaluateEEGDAG() {
        try {
            // Reset all nodes
            if (!this.allNodes || this.allNodes.length === 0) {
                return;
            }
            this.allNodes.forEach(node => {
                if (node && typeof node.reset === 'function') {
                    node.reset();
                }
            });

            // Only evaluate if we have EEG data loaded
            if (!this.eegStream || !this.eegStream.data || this.eegStream.data.length === 0) {
                // No EEG data - don't generate MIDI, just return
                return;
            }

            // Update EEG input nodes from stream
            if (this.inputNodes && this.inputNodes.length >= 5) {
                const sample = this.eegStream.getCurrentSample();
                if (sample && sample.features && Array.isArray(sample.features)) {
                    // Update input nodes with EEG features
                    for (let i = 0; i < 5; i++) {
                        const eegValue = sample.features[i] !== undefined ? sample.features[i] : 0;
                        if (this.inputNodes[i] && typeof this.inputNodes[i].setValue === 'function') {
                            this.inputNodes[i].setValue(eegValue);
                        }
                    }
                }
            }

            // Evaluate all output nodes (cascades through DAG)
            if (this.outputNodes) {
                this.outputNodes.forEach(node => {
                    if (node && typeof node.evaluate === 'function') {
                        node.evaluate();
                    }
                });
            }
        } catch (error) {
            console.error(`Error in evaluateEEGDAG for ${this.id}:`, error);
            // Don't rethrow - continue running
        }
    }

    /**
     * Visualization: compact DAG with EEG input labels
     */
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        this.canvas = canvas;

        const phenotype = this.getPhenotype();

        // Compact layout for EEG DAG
        const inputX = 15;
        const procX = width / 2;
        const outputX = width - 15;

        // Draw EEG input nodes (purple)
        phenotype.inputNodes.forEach((node, index) => {
            const y = 15 + index * 25;
            const label = `eeg${index}`;
            const color = '#9C27B0'; // Purple for EEG inputs
            this.drawNode(ctx, inputX, y, label, color, node.value.toFixed(2));
        });

        // Draw processing nodes
        phenotype.processingNodes.forEach((node, index) => {
            const y = 15 + index * 22;
            this.drawNode(ctx, procX, y, node.id, '#2196F3', node.operation);
        });

        // Draw output nodes
        phenotype.outputNodes.forEach((node, index) => {
            const y = 15 + index * 40;
            const color = node.energyAccumulator > node.threshold * 0.8 ? '#FF5722' : '#FF9800';
            this.drawNode(ctx, outputX, y, node.id, color,
                `E:${node.energyAccumulator.toFixed(1)}\nT:${node.threshold.toFixed(1)}`);
        });

        // Draw connections
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
        const nodeRadius = 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, nodeRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw label
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 12);

        // Draw detail
        ctx.font = '7px monospace';
        const lines = detail.split('\n');
        lines.forEach((line, index) => {
            ctx.fillText(line, x, y + 14 + index * 8);
        });
    }

    /**
     * Start EEG stream processing
     */
    playMIDI() {
        if (this.isRunning) {
            this.stopEEG();
        } else {
            this.startEEG();
        }
    }

    stopMIDI() {
        this.stopEEG();
    }

    startEEG() {
        if (!this.isRunning) {
            this.isRunning = true;
            console.log(`🧠 Starting EEG sonification ${this.id}`);
            this.intervalId = setInterval(() => {
                try {
                    this.evaluateEEGDAG();
                } catch (error) {
                    console.error(`❌ Error in EEG evaluation for ${this.id}:`, error);
                    // Continue running despite errors
                }
            }, this.timeStep);
        }
    }

    stopEEG() {
        if (this.isRunning) {
            this.isRunning = false;
            console.log(`⏹ Stopping EEG sonification ${this.id}`);
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        }
    }

    // Mutation and crossover inherited from Individual
    mutate(rate = 0.01) {
        super.mutate(rate);
        this.buildEEGDAGFromGenome();
    }

    crossover(other) {
        const child = super.crossover(other);
        child.buildEEGDAGFromGenome();
        return child;
    }

    clone() {
        const cloned = super.clone();
        cloned.buildEEGDAGFromGenome();
        return cloned;
    }
}

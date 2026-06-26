/**
 * DAGIndividual
 *
 * REFACTORED: Uses IntegerRepresentation for genome operations,
 * DAGRepresentation for the DAG node structure, and MIDIModality
 * for note output (with Web Audio fallback).
 *
 * Mouse position feeds x1/x2; time variation feeds x3.
 * Output nodes accumulate energy and trigger notes at threshold.
 */

class DAGIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');

        this.integerRep = new IntegerRepresentation({ length: 100, min: 0, max: 255 });

        this.dagRep = new DAGRepresentation({
            genomeLength: 100,
            numInputs: 3,
            numOutputs: 3,
            numProcIndex: 3,
            procOpsStartIndex: 4,
            outputThresholdIndex: 20,
            connectionStartIndex: 30
        });

        this.midiModality = new MIDIModality();

        this.genome = genome || this.integerRep.generateRandom();

        this.timeStep = 100;

        // Mouse tracking
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseListener = null;
        this.canvas = null;

        console.log(`🎵 DAG Individual ${this.id} created`);

        this.buildDAGFromGenome();
    }

    buildDAGFromGenome() {
        const dag = this.dagRep.build(this.genome);
        this.allNodes = dag.allNodes;
        this.inputNodes = dag.inputNodes;
        this.outputNodes = dag.outputNodes;
        this.processingNodes = dag.processingNodes;

        // Wire MIDI modality into output nodes
        this.outputNodes.forEach(node => node.setMidiModality(this.midiModality));
    }

    setMidiOutput(midiOutput) {
        this.midiModality.setMidiOutput(midiOutput);
    }

    setupMouseTracking(canvas) {
        this.mouseListener = (event) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = (event.clientX - rect.left) / rect.width * 2 - 1;
            this.mouseY = 1 - (event.clientY - rect.top) / rect.height * 2;

            if (this.inputNodes.length >= 2) {
                this.inputNodes[0].setValue(this.mouseX);
                this.inputNodes[1].setValue(this.mouseY);
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
        this.allNodes.forEach(node => node.reset());

        if (this.inputNodes.length >= 3) {
            const time = Date.now() / 1000;
            if (!this.mouseListener) {
                this.inputNodes.forEach((node, i) => {
                    node.setValue((this.genome[i] / 255) * 2 - 1 + Math.sin(time * (0.1 + i * 0.05)) * 0.3);
                });
            } else {
                // x1/x2 set by mouse; x3 gets time variation
                const baseValue = (this.genome[2] / 255) * 2 - 1;
                this.inputNodes[2].setValue(baseValue + Math.sin(time * 0.2) * 0.3);
            }
        }

        this.outputNodes.forEach(node => node.evaluate());
    }

    getPhenotype() {
        return {
            inputNodes: this.inputNodes.map(node => ({
                id: node.id, value: node.value, type: 'input'
            })),
            processingNodes: this.processingNodes.map(node => ({
                id: node.id, operation: node.operation, arity: node.arity,
                inputs: node.inputs.map(n => n.id), type: 'processing'
            })),
            outputNodes: this.outputNodes.map(node => ({
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

    mutate(rate = 0.1) {
        this.integerRep.mutate(this.genome, rate);
        this.buildDAGFromGenome();
    }

    crossover(other) {
        const [g1, g2] = this.integerRep.crossover(this.genome, other.genome);
        const child1 = new DAGIndividual(g1);
        const child2 = new DAGIndividual(g2);
        return [child1, child2];
    }

    clone() {
        const clone = new DAGIndividual(this.integerRep.clone(this.genome));
        clone.fitness = this.fitness;
        clone.midiModality.setMidiOutput(this.midiModality.midiOutput);
        return clone;
    }
}

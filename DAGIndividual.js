// DAG Node Classes
class DAGNode {
    constructor(id, type) {
        this.id = id;
        this.type = type;
        this.inputs = [];
        this.output = null;
        this.evaluated = false;
    }
    
    addInput(node) {
        this.inputs.push(node);
    }
    
    evaluate() {
        throw new Error("evaluate() must be implemented by subclass");
    }
    
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
            // Evaluate inputs first
            const inputValues = this.inputs.slice(0, this.arity).map(input => {
                return input ? input.evaluate() : 0;
            });
            
            // Apply operation
            this.output = this.applyOperation(inputValues);
            this.evaluated = true;
        }
        return this.output;
    }
    
    applyOperation(inputs) {
        switch (this.operation) {
            case 'add':
                return inputs.length >= 2 ? inputs[0] + inputs[1] : 0;
            case 'sub':
                return inputs.length >= 2 ? inputs[0] - inputs[1] : 0;
            case 'mul':
                return inputs.length >= 2 ? inputs[0] * inputs[1] : 0;
            case 'div':
                return inputs.length >= 2 && inputs[1] !== 0 ? inputs[0] / inputs[1] : 0;
            case 'sin':
                return inputs.length >= 1 ? Math.sin(inputs[0]) : 0;
            case 'cos':
                return inputs.length >= 1 ? Math.cos(inputs[0]) : 0;
            case 'min':
                return inputs.length >= 2 ? Math.min(inputs[0], inputs[1]) : 0;
            case 'max':
                return inputs.length >= 2 ? Math.max(inputs[0], inputs[1]) : 0;
            case 'abs':
                return inputs.length >= 1 ? Math.abs(inputs[0]) : 0;
            case 'if_gt_zero':
                return inputs.length >= 3 ? (inputs[0] > 0 ? inputs[1] : inputs[2]) : 0;
            default:
                return 0;
        }
    }
}

class OutputNode extends DAGNode {
    constructor(id, threshold = 0.1) {
        super(id, 'output');
        this.threshold = threshold;
        this.energyAccumulator = 0;
        this.lastPitch = 60; // Default to middle C
        this.midiOutput = null;
        this.diatonicScale = [60, 62, 64, 65, 67, 69, 71, 72]; // C major scale
    }
    
    evaluate() {
        if (!this.evaluated && this.inputs.length >= 2) {
            // First input is pitch, second is energy
            const pitchValue = this.inputs[0] ? this.inputs[0].evaluate() : 0;
            const energyValue = this.inputs[1] ? this.inputs[1].evaluate() : 0;
            
            // Map pitch to diatonic scale
            this.lastPitch = this.mapPitchToDiatonic(pitchValue);
            
            // Add energy to accumulator
            this.energyAccumulator += Math.abs(energyValue);
            
            // Check if threshold exceeded
            // console.log(`node ${this.id} ${this.energyAccumulator}`)
            if (this.energyAccumulator >= this.threshold) {
                this.triggerNote();
            }
            
            this.output = this.energyAccumulator;
            this.evaluated = true;
        }
        return this.output || 0;
    }
    
    mapPitchToDiatonic(pitchValue) {
        // Map float to diatonic scale index
        const scaledValue = Math.abs(pitchValue * 10) % this.diatonicScale.length;
        const index = Math.floor(scaledValue);
        return this.diatonicScale[index];
    }
    
    triggerNote() {
        if (this.midiOutput) {
            // Calculate velocity based on energy level
            const velocity = Math.min(127, Math.max(40, Math.floor(this.energyAccumulator * 50)));
            
            // console.log(`🎵 DAG Output ${this.id}: Triggering note ${this.lastPitch} (velocity ${velocity})`);
            
            // Send MIDI note
            try {
                this.midiOutput.send([0x90, this.lastPitch, velocity]);
                setTimeout(() => {
                    this.midiOutput.send([0x80, this.lastPitch, 0]);
                }, 200); // Short note duration
            } catch (error) {
                console.error('MIDI send error:', error);
            }
        } else {
            // console.log(`No MIDI output`);
        }
        
        // Release energy after triggering
        this.energyAccumulator = 0;
    }
    
    setMidiOutput(midiOutput) {
        this.midiOutput = midiOutput;
    }
}

// Main DAG Individual Class
class DAGIndividual extends Individual {
    constructor(genome = null) {
        super(genome);
        this.dag = null;
        this.inputNodes = [];
        this.outputNodes = [];
        this.processingNodes = [];
        this.allNodes = [];
        this.timeStep = 100; // milliseconds between evaluations
        this.isRunning = false;
        this.intervalId = null;
        this.midiOutput = null;
        
        // Mouse tracking
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseListener = null;
        this.boundingRect = null;
        
        console.log(`🎵 DAG Individual ${this.id} created`);
        
        // Build DAG immediately
        this.buildDAGFromGenome();
    }
    
    generateRandomGenome() {
        // Genome encodes DAG structure and parameters
        // Format: [num_processing_nodes, processing_ops..., connections..., thresholds...]
        const length = 100;
        return Array.from({length}, () => Math.floor(Math.random() * 256));
    }
    
    buildDAGFromGenome() {
        this.allNodes = [];
        this.inputNodes = [];
        this.outputNodes = [];
        this.processingNodes = [];
        
        // Create input nodes (x1, x2, x3)
        for (let i = 0; i < 3; i++) {
            const value = (this.genome[i] / 255) * 2 - 1; // Map to [-1, 1]
            const inputNode = new InputNode(`x${i + 1}`, value);
            this.inputNodes.push(inputNode);
            this.allNodes.push(inputNode);
        }
        
        // Create processing nodes
        const numProcessingNodes = (this.genome[3] % 8) + 2; // 2-9 processing nodes
        const operations = ['add', 'sub', 'mul', 'sin', 'min', 'max', 'abs', 'if_gt_zero'];
        const arities = [2, 2, 2, 1, 2, 2, 1, 3];
        
        for (let i = 0; i < numProcessingNodes; i++) {
            const opIndex = this.genome[4 + i] % operations.length;
            const operation = operations[opIndex];
            const arity = arities[opIndex];
            
            const procNode = new ProcessingNode(`p${i + 1}`, operation, arity);
            this.processingNodes.push(procNode);
            this.allNodes.push(procNode);
        }
        
        // Create output nodes (y1, y2, y3)
        for (let i = 0; i < 3; i++) {
            const threshold = (this.genome[20 + i] / 255) * 2 + 0.5; // Threshold 0.5-2.5
            const outputNode = new OutputNode(`y${i + 1}`, threshold);
            this.outputNodes.push(outputNode);
            this.allNodes.push(outputNode);
        }
        
        // Create connections based on genome
        this.createConnections();
    }
    
    createConnections() {
        // Connect processing nodes to available inputs (input nodes + previous processing nodes)
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
    
    setMidiOutput(midiOutput) {
        this.midiOutput = midiOutput;
        // console.log(`🔧 DAGIndividual ${this.id} MIDI set to: ${midiOutput?.name || 'none'}`);
        this.updateOutputNodesMIDI();
    }
    
    updateOutputNodesMIDI() {
        if (this.outputNodes && this.outputNodes.length > 0) {
            this.outputNodes.forEach(node => {
                node.setMidiOutput(this.midiOutput);
            });
        }
    }
    
    setupMouseTracking(canvas) {
        this.boundingRect = canvas.getBoundingClientRect();
        
        this.mouseListener = (event) => {
            const rect = canvas.getBoundingClientRect();
            
            // Get mouse position relative to canvas
            const canvasX = event.clientX - rect.left;
            const canvasY = event.clientY - rect.top;
            
            // Normalize to [-1, 1] range
            this.mouseX = (canvasX / rect.width) * 2 - 1;
            this.mouseY = 1 - (canvasY / rect.height) * 2; // Invert Y so top is +1, bottom is -1
            
            // Update x1 and x2 input nodes
            if (this.inputNodes.length >= 2) {
                this.inputNodes[0].setValue(this.mouseX); // x1 = mouse X
                this.inputNodes[1].setValue(this.mouseY); // x2 = mouse Y
            }
        };
        
        // Add mouse listener to canvas
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
        // Reset all nodes
        this.allNodes.forEach(node => node.reset());
        
        // Update input nodes
        // x1 and x2 are controlled by mouse (if tracking is enabled)
        // x3 gets time-based variation
        if (this.inputNodes.length >= 3) {
            const time = Date.now() / 1000;
            
            // x1 and x2 are set by mouse tracking, only update if no mouse listener
            if (!this.mouseListener) {
                this.inputNodes.forEach((node, index) => {
                    const baseValue = (this.genome[index] / 255) * 2 - 1;
                    const variation = Math.sin(time * (0.1 + index * 0.05)) * 0.3;
                    node.setValue(baseValue + variation);
                });
            } else {
                // Only update x3 with time-based variation
                const baseValue = (this.genome[2] / 255) * 2 - 1;
                const variation = Math.sin(time * 0.2) * 0.3;
                this.inputNodes[2].setValue(baseValue + variation);
            }
        }
        
        // Evaluate all output nodes (this will cascade through the DAG)
        this.outputNodes.forEach(node => node.evaluate());
    }
    
    
    getPhenotype() {
        // Return DAG structure for visualization
        return {
            inputNodes: this.inputNodes.map(node => ({
                id: node.id,
                value: node.value,
                type: 'input'
            })),
            processingNodes: this.processingNodes.map(node => ({
                id: node.id,
                operation: node.operation,
                arity: node.arity,
                inputs: node.inputs.map(input => input.id),
                type: 'processing'
            })),
            outputNodes: this.outputNodes.map(node => ({
                id: node.id,
                threshold: node.threshold,
                energyAccumulator: node.energyAccumulator,
                inputs: node.inputs.map(input => input.id),
                type: 'output'
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
        
        // Store canvas reference for mouse tracking
        this.canvas = canvas;
        
        const phenotype = this.getPhenotype();
        
        // Layout nodes in columns
        const inputX = 50;
        const procX = width / 2;
        const outputX = width - 50;
        
        // Draw input nodes
        phenotype.inputNodes.forEach((node, index) => {
            const y = 50 + index * 60;
            let label = node.id;
            let color = '#4CAF50';
            
            // Highlight mouse-controlled inputs
            if (index === 0) {
                label = 'x1 (mouse-X)';
                color = '#FF9800';
            } else if (index === 1) {
                label = 'x2 (mouse-Y)';
                color = '#FF9800';
            }
            
            this.drawNode(ctx, inputX, y, label, color, node.value.toFixed(2));
        });
        
        // Draw processing nodes
        phenotype.processingNodes.forEach((node, index) => {
            const y = 50 + index * 40;
            this.drawNode(ctx, procX, y, node.id, '#2196F3', node.operation);
        });
        
        // Draw output nodes
        phenotype.outputNodes.forEach((node, index) => {
            const y = 50 + index * 80;
            const color = node.energyAccumulator > node.threshold * 0.8 ? '#FF5722' : '#FF9800';
            this.drawNode(ctx, outputX, y, node.id, color, 
                `E:${node.energyAccumulator.toFixed(1)}\nT:${node.threshold.toFixed(1)}`);
        });
        
        // Draw connections (simplified)
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        
        // Draw some sample connections
        phenotype.processingNodes.forEach((node, index) => {
            const y = 50 + index * 40;
            // Draw lines from inputs to this processing node
            ctx.beginPath();
            ctx.moveTo(inputX + 20, 50 + 30); // Approximate connection
            ctx.lineTo(procX - 20, y);
            ctx.stroke();
        });
    }
    
    drawNode(ctx, x, y, label, color, detail) {
        // Draw node circle
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw label
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y - 20);
        
        // Draw detail
        ctx.font = '10px monospace';
        const lines = detail.split('\n');
        lines.forEach((line, index) => {
            ctx.fillText(line, x, y + 25 + index * 12);
        });
    }
    
    playMIDI() {
        if (this.isRunning) {
            this.stopDAG();
        } else {
            this.startDAG();
        }
    }
    
    stopMIDI() {
        this.stopDAG();
    }
    
    startDAG() {
        if (!this.isRunning) {
            // Set up mouse tracking if canvas is available
            if (this.canvas) {
                this.setupMouseTracking(this.canvas);
            }
            
            this.isRunning = true;
            console.log(`🔄 Starting DAG ${this.id}`);
            this.intervalId = setInterval(() => {
                this.evaluateDAG();
            }, this.timeStep);
        }
    }
    
    stopDAG() {
        if (this.isRunning) {
            this.isRunning = false;
            console.log(`⏹ Stopping DAG ${this.id}`);
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            
            // Remove mouse tracking
            if (this.canvas) {
                this.removeMouseTracking(this.canvas);
            }
        }
    }
}
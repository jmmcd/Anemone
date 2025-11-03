class TreeNode {
    evaluate(x, y) {
        throw new Error("evaluate() must be implemented by subclass");
    }
    
    depth() {
        throw new Error("depth() must be implemented by subclass");
    }
    
    size() {
        throw new Error("size() must be implemented by subclass");
    }
    
    copy() {
        throw new Error("copy() must be implemented by subclass");
    }
    
    getAllNodes() {
        return [this];
    }
}

class TerminalNode extends TreeNode {
    constructor(value) {
        super();
        this.value = value;
    }
    
    evaluate(x, y) {
        if (this.value === 'x') return x;
        if (this.value === 'y') return y;
        if (this.value === 'r') return Math.sqrt(x * x + y * y);
        if (this.value === 'theta') return Math.atan2(x, -y); // Changed to measure from top, clockwise
        return this.value;
    }
    
    depth() {
        return 1;
    }
    
    size() {
        return 1;
    }
    
    copy() {
        return new TerminalNode(this.value);
    }
    
    toString() {
        return this.value.toString();
    }
}

class FunctionNode extends TreeNode {
    constructor(func, children) {
        super();
        this.func = func;
        this.children = children || [];
    }
    
    evaluate(x, y) {
        const childValues = this.children.map(child => child.evaluate(x, y));
        
        try {
            switch (this.func) {
                case '+':
                    return childValues[0] + childValues[1];
                case '-':
                    return childValues[0] - childValues[1];
                case '*':
                    return childValues[0] * childValues[1];
                case '/':
                    return Math.abs(childValues[1]) > 1e-6 ? childValues[0] / childValues[1] : 1.0;
                case 'sin':
                    return Math.sin(childValues[0]);
                case 'cos':
                    return Math.cos(childValues[0]);
                case 'exp':
                    const expVal = Math.min(childValues[0], 10);
                    const result = Math.exp(expVal);
                    return isFinite(result) ? result : 1.0;
                case 'log':
                    return Math.log(Math.abs(childValues[0]) + 1e-6);
                case 'sqrt':
                    return Math.sqrt(Math.abs(childValues[0]));
                case 'abs':
                    return Math.abs(childValues[0]);
                case 'max':
                    return Math.max(childValues[0], childValues[1]);
                case 'min':
                    return Math.min(childValues[0], childValues[1]);
                case 'mod':
                    return Math.abs(childValues[1]) > 1e-6 ? childValues[0] % childValues[1] : childValues[0];
                case 'ifpos':
                    return childValues[0] > 0 ? childValues[1] : childValues[2];
                default:
                    return childValues[0] || 0;
            }
        } catch (e) {
            return 1.0;
        }
    }
    
    depth() {
        if (this.children.length === 0) return 1;
        return 1 + Math.max(...this.children.map(child => child.depth()));
    }
    
    size() {
        return 1 + this.children.reduce((sum, child) => sum + child.size(), 0);
    }
    
    copy() {
        return new FunctionNode(this.func, this.children.map(child => child.copy()));
    }
    
    getAllNodes() {
        let nodes = [this];
        for (let child of this.children) {
            nodes = nodes.concat(child.getAllNodes());
        }
        return nodes;
    }
    
    toString() {
        if (this.children.length === 1) {
            return `${this.func}(${this.children[0]})`;
        } else if (this.children.length === 2) {
            return `(${this.children[0]} ${this.func} ${this.children[1]})`;
        }
        return `${this.func}(${this.children.join(', ')})`;
    }
}

class GPPatternIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        // Call super with special flag to prevent automatic genome generation
        super('SKIP_GENOME_GENERATION');
        
        this.maxDepth = 6;
        this.binaryFunctions = ['+', '-', '*', '/', 'max', 'min', 'mod'];
        this.unaryFunctions = ['sin', 'cos', 'exp', 'log', 'sqrt', 'abs'];
        this.ternaryFunctions = ['ifpos']; // if condition > 0 then arg1 else arg2
        this.terminals = ['x', 'y', 'r', 'theta'];
        
        // Add some random constants
        for (let i = 0; i < 10; i++) {
            this.terminals.push((Math.random() - 0.5) * 4);
        }
        
        // Now generate the genome after properties are set
        this.genome = genome || this.generateRandomGenome();
    }
    
    generateRandomGenome() {
        return this.createRandomTree(this.maxDepth, 'grow');
    }
    
    createRandomTree(maxDepth, method = 'grow') {
        if (maxDepth <= 1 || (method === 'grow' && Math.random() < 0.3)) {
            // Create terminal
            const terminalValue = this.terminals[Math.floor(Math.random() * this.terminals.length)];
            return new TerminalNode(terminalValue);
        } else {
            // Create function node
            const functionChoice = Math.random();
            if (functionChoice < 0.6) {
                // Binary function
                const func = this.binaryFunctions[Math.floor(Math.random() * this.binaryFunctions.length)];
                const leftChild = this.createRandomTree(maxDepth - 1, method);
                const rightChild = this.createRandomTree(maxDepth - 1, method);
                return new FunctionNode(func, [leftChild, rightChild]);
            } else if (functionChoice < 0.9) {
                // Unary function
                const func = this.unaryFunctions[Math.floor(Math.random() * this.unaryFunctions.length)];
                const child = this.createRandomTree(maxDepth - 1, method);
                return new FunctionNode(func, [child]);
            } else {
                // Ternary function
                const func = this.ternaryFunctions[Math.floor(Math.random() * this.ternaryFunctions.length)];
                const child1 = this.createRandomTree(maxDepth - 1, method);
                const child2 = this.createRandomTree(maxDepth - 1, method);
                const child3 = this.createRandomTree(maxDepth - 1, method);
                return new FunctionNode(func, [child1, child2, child3]);
            }
        }
    }
    
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        
        // Get palette from framework settings
        const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
        const palette = this.getPaletteByName(paletteName);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Normalize coordinates to [-1, 1]
                const normX = (x / width) * 2 - 1;
                const normY = (y / height) * 2 - 1;
                
                // Evaluate tree
                const value = this.genome.evaluate(normX, normY);
                
                // Normalize value to [0, 1] for palette lookup
                const normalizedValue = (Math.tanh(value) + 1) / 2;
                
                // Get color from palette
                const color = this.interpolateColor(palette, normalizedValue);
                
                const index = (y * width + x) * 4;
                data[index] = color.r;       // Red
                data[index + 1] = color.g;   // Green
                data[index + 2] = color.b;   // Blue
                data[index + 3] = 255;      // Alpha
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    getPhenotype() {
        return this.genome;
    }
    
    mutate(rate = 0.1) {
        if (Math.random() < rate) {
            const allNodes = this.genome.getAllNodes();
            if (allNodes.length > 1) {
                // Select random node for mutation
                const mutationPoint = allNodes[Math.floor(Math.random() * allNodes.length)];
                const newSubtree = this.createRandomTree(Math.floor(Math.random() * 3) + 1);
                
                // Replace the mutation point with new subtree
                this.replaceNode(this.genome, mutationPoint, newSubtree);
            }
        }
    }
    
    crossover(other) {
        const child1 = this.clone();
        const child2 = other.clone();
        
        // Get all nodes from both trees
        const nodes1 = child1.genome.getAllNodes();
        const nodes2 = child2.genome.getAllNodes();
        
        if (nodes1.length > 1 && nodes2.length > 1) {
            // Select crossover points (avoid root)
            const crossPoint1 = nodes1[Math.floor(Math.random() * (nodes1.length - 1)) + 1];
            const crossPoint2 = nodes2[Math.floor(Math.random() * (nodes2.length - 1)) + 1];
            
            // Swap subtrees
            const temp = crossPoint1.copy();
            this.replaceNode(child1.genome, crossPoint1, crossPoint2.copy());
            this.replaceNode(child2.genome, crossPoint2, temp);
        }
        
        return [child1, child2];
    }
    
    replaceNode(tree, oldNode, newNode) {
        if (tree === oldNode) {
            return newNode;
        }
        
        if (tree instanceof FunctionNode) {
            for (let i = 0; i < tree.children.length; i++) {
                if (tree.children[i] === oldNode) {
                    tree.children[i] = newNode;
                    return tree;
                } else {
                    const result = this.replaceNode(tree.children[i], oldNode, newNode);
                    if (result !== tree.children[i]) {
                        tree.children[i] = result;
                        return tree;
                    }
                }
            }
        }
        
        return tree;
    }
    
    clone() {
        const clone = new GPPatternIndividual();
        clone.genome = this.genome.copy();
        clone.fitness = this.fitness;
        clone.maxDepth = this.maxDepth;
        clone.binaryFunctions = [...this.binaryFunctions];
        clone.unaryFunctions = [...this.unaryFunctions];
        clone.terminals = [...this.terminals];
        return clone;
    }
    
    crossover(other) {
        const child1 = this.clone();
        const child2 = other.clone();
        
        // Get all nodes from both trees
        const nodes1 = child1.genome.getAllNodes();
        const nodes2 = child2.genome.getAllNodes();
        
        if (nodes1.length > 1 && nodes2.length > 1) {
            // Select crossover points (avoid root)
            const crossPoint1 = nodes1[Math.floor(Math.random() * (nodes1.length - 1)) + 1];
            const crossPoint2 = nodes2[Math.floor(Math.random() * (nodes2.length - 1)) + 1];
            
            // Swap subtrees
            const temp = crossPoint1.copy();
            this.replaceNode(child1.genome, crossPoint1, crossPoint2.copy());
            this.replaceNode(child2.genome, crossPoint2, temp);
        }
        
        return [child1, child2];
    }
}
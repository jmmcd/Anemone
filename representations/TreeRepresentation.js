/**
 * TreeRepresentation
 *
 * Handles tree-based genetic programming representation.
 * Provides genome generation, mutation, crossover, and evaluation for GP expression trees.
 */

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
        if (this.value === 'theta') return Math.atan2(x, -y);
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
        // Only the true arithmetic operators read naturally infix; named
        // binary functions (min, max, mod) are clearer in function-call form.
        const INFIX_OPS = ['+', '-', '*', '/'];
        if (this.children.length === 2 && INFIX_OPS.includes(this.func)) {
            return `(${this.children[0]} ${this.func} ${this.children[1]})`;
        }
        return `${this.func}(${this.children.join(', ')})`;
    }
}

/**
 * TreeRepresentation manages GP tree genomes
 */
class TreeRepresentation {
    constructor(config = {}) {
        this.maxDepth = config.maxDepth || 6;
        this.binaryFunctions = config.binaryOps || ['+', '-', '*', '/', 'max', 'min', 'mod'];
        this.unaryFunctions = config.unaryOps || ['sin', 'cos', 'exp', 'log', 'sqrt', 'abs'];
        this.ternaryFunctions = config.ternaryOps || ['ifpos'];
        this.terminals = config.terminals || ['x', 'y', 'r', 'theta'];

        // Add random constants if requested
        if (config.numConstants) {
            for (let i = 0; i < config.numConstants; i++) {
                this.terminals.push((Math.random() - 0.5) * 4);
            }
        }
    }

    /**
     * Generate a random tree genome
     */
    generateRandom(method = 'grow') {
        return this.createRandomTree(this.maxDepth, method);
    }

    /**
     * Create a random tree with specified depth and method
     */
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

    /**
     * Evaluate a tree genome at given coordinates
     */
    evaluate(genome, x, y) {
        return genome.evaluate(x, y);
    }

    /**
     * Mutate a tree genome (subtree replacement)
     */
    mutate(genome, rate = 0.1) {
        if (Math.random() < rate) {
            const allNodes = genome.getAllNodes();
            if (allNodes.length > 1) {
                // Select random node for mutation
                const mutationPoint = allNodes[Math.floor(Math.random() * allNodes.length)];
                const newSubtree = this.createRandomTree(Math.floor(Math.random() * 3) + 1);

                // Replace the mutation point with new subtree
                this.replaceNode(genome, mutationPoint, newSubtree);
            }
        }
        return genome;
    }

    /**
     * Crossover two tree genomes (subtree swapping)
     */
    crossover(genome1, genome2) {
        const child1 = genome1.copy();
        const child2 = genome2.copy();

        // Get all nodes from both trees
        const nodes1 = child1.getAllNodes();
        const nodes2 = child2.getAllNodes();

        if (nodes1.length > 1 && nodes2.length > 1) {
            // Select crossover points (avoid root)
            const crossPoint1 = nodes1[Math.floor(Math.random() * (nodes1.length - 1)) + 1];
            const crossPoint2 = nodes2[Math.floor(Math.random() * (nodes2.length - 1)) + 1];

            // Swap subtrees
            const temp = crossPoint1.copy();
            this.replaceNode(child1, crossPoint1, crossPoint2.copy());
            this.replaceNode(child2, crossPoint2, temp);
        }

        return [child1, child2];
    }

    /**
     * Clone a tree genome
     */
    clone(genome) {
        return genome.copy();
    }

    /**
     * Helper to replace a node in a tree
     */
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

    /**
     * Get phenotype information (tree structure)
     */
    getPhenotype(genome) {
        return {
            expression: genome.toString(),
            depth: genome.depth(),
            size: genome.size()
        };
    }
}

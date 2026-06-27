/**
 * GP tree node classes + PTO generator
 *
 * The expression-tree node classes (TerminalNode/FunctionNode) and a
 * `createTreeGenerator` factory: a PTO generator that builds a random expression
 * tree directly from `rnd` (the same shape as the old createRandomTree). The
 * trace of those decisions is the genotype; the built tree is the phenotype, and
 * PTO's generic operators provide mutation/crossover/clone.
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
 * Build a PTO generator that creates random GP expression trees, mirroring the
 * old TreeRepresentation.createRandomTree ("grow" method). Constants are drawn
 * with rnd.uniform (so they can evolve), preserving the old terminal mix of
 * ~10 constants : 4 variables. Use with PTORepresentation; the individual reads
 * the built tree via this.phenotype.
 *
 * @param {object} config
 * @param {number} config.maxDepth
 * @returns {(rnd) => TreeNode}
 */
function createTreeGenerator(config = {}) {
    const maxDepth = config.maxDepth || 6;
    const binaryFns = config.binaryOps || ['+', '-', '*', '/', 'max', 'min', 'mod'];
    const unaryFns = config.unaryOps || ['sin', 'cos', 'exp', 'log', 'sqrt', 'abs'];
    const ternaryFns = config.ternaryOps || ['ifpos'];
    const variables = config.terminals || ['x', 'y', 'r', 'theta'];
    // Old terminal list was 4 variables + 10 constants, picked uniformly.
    const constProb = config.constProb !== undefined ? config.constProb : 10 / 14;

    function build(rnd, depth) {
        if (depth <= 1 || rnd.random() < 0.3) {
            // Terminal: a constant or a coordinate variable.
            if (rnd.random() < constProb) {
                return new TerminalNode(rnd.uniform(-2, 2));
            }
            return new TerminalNode(rnd.choice(variables));
        }
        const kind = rnd.random();
        if (kind < 0.6) {
            const func = rnd.choice(binaryFns);
            return new FunctionNode(func, [build(rnd, depth - 1), build(rnd, depth - 1)]);
        } else if (kind < 0.9) {
            const func = rnd.choice(unaryFns);
            return new FunctionNode(func, [build(rnd, depth - 1)]);
        } else {
            const func = rnd.choice(ternaryFns);
            return new FunctionNode(func, [build(rnd, depth - 1), build(rnd, depth - 1), build(rnd, depth - 1)]);
        }
    }

    return (rnd) => build(rnd, maxDepth);
}

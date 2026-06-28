/**
 * GP tree node classes + PTO generator
 *
 * The expression-tree node classes (TerminalNode/FunctionNode) plus a
 * self-contained PTO generator (`treeGenerator`) that builds a random expression
 * tree as *plain data* from `rnd`, and a converter (`buildTreeNode`) that turns
 * that plain data into evaluable node instances. The trace of the generator's
 * decisions is the genotype; the plain-data tree is the phenotype.
 *
 * Why plain data rather than building nodes in the generator: PTORepresentation
 * uses structural naming, which compiles the generator in isolation and does not
 * instrument `rnd`/recursive calls nested inside a `new ClassName(...)`. So the
 * generator emits plain objects and the individual calls buildTreeNode() to get
 * the evaluable tree. (Structural naming is what lets the variable-structure
 * trace use 'fine' operators safely — see PTORepresentation.)
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

// Tree-shape configuration. Top-level consts (not closure variables), so the
// structural-naming compiler can still resolve them when it compiles
// treeGenerator in isolation. The terminal mix is ~10 constants : 4 variables,
// picked uniformly, mirroring the original "grow" method.
const TREE_MAX_DEPTH = 6;
const TREE_BINARY_OPS = ['+', '-', '*', '/', 'max', 'min', 'mod'];
const TREE_UNARY_OPS = ['sin', 'cos', 'exp', 'log', 'sqrt', 'abs'];
const TREE_TERNARY_OPS = ['ifpos'];
const TREE_VARIABLES = ['x', 'y', 'r', 'theta'];
const TREE_CONST_PROB = 10 / 14;

/**
 * Self-contained PTO generator: builds a random GP expression tree as plain
 * data. Constants are drawn with rnd.uniform so they can evolve. The recursive
 * helper is declared *inside* the generator (a closure-free, instrumentable
 * form) and emits plain objects: { kind:'fn', func, children } for functions and
 * { kind:'const'|'var', value } for terminals. Use with PTORepresentation; the
 * individual calls buildTreeNode(this.phenotype) for the evaluable tree.
 */
function treeGenerator(rnd) {
    const build = (depth) => {
        if (depth <= 1 || rnd.random() < 0.3) {
            // Terminal: a constant or a coordinate variable.
            if (rnd.random() < TREE_CONST_PROB) {
                return { kind: 'const', value: rnd.uniform(-2, 2) };
            }
            return { kind: 'var', value: rnd.choice(TREE_VARIABLES) };
        }
        const kind = rnd.random();
        if (kind < 0.6) {
            return { kind: 'fn', func: rnd.choice(TREE_BINARY_OPS), children: [build(depth - 1), build(depth - 1)] };
        } else if (kind < 0.9) {
            return { kind: 'fn', func: rnd.choice(TREE_UNARY_OPS), children: [build(depth - 1)] };
        }
        return { kind: 'fn', func: rnd.choice(TREE_TERNARY_OPS), children: [build(depth - 1), build(depth - 1), build(depth - 1)] };
    };
    return build(TREE_MAX_DEPTH);
}

/**
 * Convert the plain-data tree (the PTO phenotype) into evaluable TreeNode
 * instances. Done in the individual, not the generator, so the generator stays
 * free of `new` (see file header).
 */
function buildTreeNode(plain) {
    if (plain.kind === 'fn') {
        return new FunctionNode(plain.func, plain.children.map(buildTreeNode));
    }
    return new TerminalNode(plain.value);
}

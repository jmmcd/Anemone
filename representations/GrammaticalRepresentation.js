/**
 * GrammaticalRepresentation
 *
 * Handles grammatical evolution representation.
 * Uses integer array genome to derive expressions from BNF grammar.
 */

class GrammaticalRepresentation {
    constructor(config = {}) {
        this.length = config.length || 100;
        this.grammar = config.grammar; // Grammar object
        this.startSymbol = config.startSymbol || '<pattern>';
        this.maxDerivations = config.maxDerivations || 1000;
        this._phenotypeCache = new Map();
        this._compiledCache = new Map();
    }

    /**
     * Generate a random integer genome for GE
     */
    generateRandom() {
        return Array.from({length: this.length}, () => Math.floor(Math.random() * 256));
    }

    /**
     * Derive phenotype (expression string) from genome
     */
    derivePhenotype(genome) {
        const key = genome.join(',');
        if (this._phenotypeCache.has(key)) {
            return this._phenotypeCache.get(key);
        }

        const derivation = this.grammar.derive(this.startSymbol, genome, this.maxDerivations, 15);
        let expression = this.grammar.derivesToString(derivation);

        // If expression is too complex, simplify it
        if (expression.length > 200) {
            console.warn('Expression too complex, using fallback:', expression.substring(0, 50) + '...');
            expression = '1.0 + 0.5 * sin(t)';
        }

        this._phenotypeCache.set(key, expression);
        return expression;
    }

    /**
     * Compile expression to JavaScript function
     */
    compileExpression(expression) {
        if (this._compiledCache.has(expression)) {
            return this._compiledCache.get(expression);
        }

        try {
            let jsExpression = expression
                .replace(/sin/g, 'Math.sin')
                .replace(/cos/g, 'Math.cos')
                .replace(/tan/g, 'Math.tan')
                .replace(/exp/g, 'Math.exp')
                .replace(/log/g, 'Math.log')
                .replace(/sqrt/g, 'Math.sqrt')
                .replace(/abs/g, 'Math.abs')
                .replace(/floor/g, 'Math.floor')
                .replace(/ceil/g, 'Math.ceil')
                .replace(/ifpos\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($1) > 0 ? ($2) : ($3))')
                .replace(/\br\b/g, 'Math.sqrt(x*x + y*y)')
                .replace(/\btheta\b/g, 'Math.atan2(y, x)')
                .replace(/3\.14159/g, 'Math.PI')
                .replace(/6\.28318/g, '(2*Math.PI)');

            // Protected division and modulo
            jsExpression = jsExpression.replace(/\/([^\/]+)/g, (match, divisor) => {
                return `/(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`;
            });

            jsExpression = jsExpression.replace(/%([^%]+)/g, (match, divisor) => {
                return `%(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`;
            });

            const compiledFn = new Function('x', 'y', `
                try {
                    const result = ${jsExpression};
                    return isFinite(result) ? result : 0.0;
                } catch (e) {
                    return 0.0;
                }
            `);

            this._compiledCache.set(expression, compiledFn);
            return compiledFn;

        } catch (error) {
            const fallback = () => 0.0;
            this._compiledCache.set(expression, fallback);
            return fallback;
        }
    }

    /**
     * Evaluate expression at coordinates
     */
    evaluate(genome, x, y) {
        const expression = this.derivePhenotype(genome);
        const compiled = this.compileExpression(expression);
        return compiled(x, y);
    }

    /**
     * Mutate a GE genome
     */
    mutate(genome, rate = 0.1) {
        for (let i = 0; i < genome.length; i++) {
            if (Math.random() < rate) {
                genome[i] = Math.floor(Math.random() * 256);
            }
        }
        this._phenotypeCache.clear();
        return genome;
    }

    /**
     * Crossover two GE genomes
     */
    crossover(genome1, genome2) {
        const child1Genome = [];
        const child2Genome = [];

        for (let i = 0; i < genome1.length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(genome1[i]);
                child2Genome.push(genome2[i] || Math.floor(Math.random() * 256));
            } else {
                child1Genome.push(genome2[i] || Math.floor(Math.random() * 256));
                child2Genome.push(genome1[i]);
            }
        }

        return [child1Genome, child2Genome];
    }

    /**
     * Clone a GE genome
     */
    clone(genome) {
        return [...genome];
    }
}

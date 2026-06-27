/**
 * PTORepresentation
 *
 * A representation backed by Program Trace Optimisation (PTO). Instead of a
 * fixed genome shape (array of ints/floats/etc.), the search space is defined by
 * a *generator* function: `generator(rnd)` builds a phenotype using PTO's `rnd`
 * (rnd.random / uniform / randint / choice / sample). PTO records the sequence of
 * rnd decisions — the *trace* — and that trace is the genotype.
 *
 * Genotype / phenotype split (this is the whole point of PTO):
 *   - genome    = the trace: a dict of recorded random decisions. This is the
 *                 heritable material; mutate/crossover operate on it.
 *   - phenotype = whatever the generator returned (an array, matrix, tree,
 *                 object …). Derived from the genome by replaying the generator
 *                 (`express`). Opaque to this representation.
 *
 * So an individual using this representation sets `this.genome` to a trace and
 * reads `this.phenotype` (derived) for rendering. One representation can thus
 * emulate any structure; the individual only supplies a generator.
 *
 * Requires the PTO bundle (vendor/pto-bundle.js) to be loaded first.
 */
class PTORepresentation {
    /**
     * @param {Function} generator  generator(rnd) → phenotype
     * @param {Object}   [opts]     options forwarded to PTO.run. Notably
     *   distType: 'coarse' (mutation re-samples a gene — a jump; good for
     *   ints/categoricals) or 'fine' (Gaussian creep for reals — good for
     *   float genomes in interactive use).
     */
    constructor(generator, opts = {}) {
        this.generator = generator;
        this.opts = opts;
        this._op = null;           // built lazily so PTO need not be loaded at parse time (tests)
        this._pheno = new WeakMap(); // geno (trace) → phenotype, to avoid re-replaying
    }

    op() {
        if (!this._op) {
            if (typeof PTO === 'undefined') {
                throw new Error('PTO library not loaded; include vendor/pto-bundle.js before PTORepresentation.');
            }
            // Interactive EC has no fitness function — the user selects — so the
            // fitness passed to PTO is a dummy. We only use the search operators.
            this._op = PTO.run(this.generator, () => 0, { solver: 'searchOperators', ...this.opts });
        }
        return this._op;
    }

    // Cache a freshly produced solution's phenotype, keyed by its trace, and
    // return just the trace (the genome). `express` will then be a cache hit.
    _remember(sol) {
        this._pheno.set(sol.geno, sol.pheno);
        return sol.geno;
    }

    /** A fresh random genome (trace). */
    generateRandom() {
        return this._remember(this.op().createInd());
    }

    /** Express a genome (trace) into its phenotype by replaying the generator. */
    express(geno) {
        if (this._pheno.has(geno)) return this._pheno.get(geno);
        const sol = this.op().fixInd(geno);
        this._pheno.set(geno, sol.pheno);
        return sol.pheno;
    }

    /**
     * Position-wise mutation ("1/n type"): every trace entry mutates
     * independently with probability `rate`, then the generator is replayed
     * (fixInd) to produce a consistent solution. Returns the new genome (trace).
     *
     * We implement this directly rather than calling PTO's mutatePositionWiseInd
     * because that hardcodes the per-entry probability to 1/n; in interactive EC
     * we want the caller's `rate` to control the mutation strength.
     */
    mutate(geno, rate = 0.1) {
        const newGeno = {};
        for (const key of Object.keys(geno)) {
            newGeno[key] = Math.random() < rate ? geno[key].mutation() : geno[key];
        }
        return this._remember(this.op().fixInd(newGeno));
    }

    /** Uniform crossover over the two parents' traces → two child genomes. */
    crossover(geno1, geno2) {
        const op = this.op();
        return [
            this._remember(op.crossoverUniformInd({ geno: geno1 }, { geno: geno2 })),
            this._remember(op.crossoverUniformInd({ geno: geno2 }, { geno: geno1 }))
        ];
    }

    /**
     * Clone a genome. Our operators are non-mutating (they return new traces)
     * and individuals replace their genome wholesale rather than editing it in
     * place, so sharing the reference (and its cached phenotype) is safe.
     */
    clone(geno) {
        return geno;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PTORepresentation;
}

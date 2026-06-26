/**
 * FloatRepresentation
 *
 * Handles float array genome representation with constraints.
 * Used by individuals that encode their genome as arrays of floating-point numbers.
 */

class FloatRepresentation {
    constructor(config = {}) {
        this.length = config.length || 7;
        this.bounds = config.bounds || []; // Array of {min, max} objects per gene
        this.mutationStrength = config.mutationStrength || 0.5;
    }

    /**
     * Generate a random float genome
     */
    generateRandom() {
        const genome = [];
        for (let i = 0; i < this.length; i++) {
            const bounds = this.bounds[i] || {min: 0, max: 1};
            genome.push(Math.random() * (bounds.max - bounds.min) + bounds.min);
        }
        return genome;
    }

    /**
     * Mutate a float genome (Gaussian noise)
     */
    mutate(genome, rate = 0.1) {
        for (let i = 0; i < genome.length; i++) {
            if (Math.random() < rate) {
                const bounds = this.bounds[i] || {min: 0, max: 1};
                const noise = this.gaussianRandom(0, 1) * this.mutationStrength;
                genome[i] = Math.max(bounds.min, Math.min(bounds.max, genome[i] + noise));
            }
        }
        return genome;
    }

    /**
     * Crossover two float genomes (blend crossover)
     */
    crossover(genome1, genome2) {
        const child1Genome = [];
        const child2Genome = [];

        for (let i = 0; i < genome1.length; i++) {
            const bounds = this.bounds[i] || {min: 0, max: 1};
            const alpha = Math.random();

            const value1 = alpha * genome1[i] + (1 - alpha) * genome2[i];
            const value2 = (1 - alpha) * genome1[i] + alpha * genome2[i];

            child1Genome.push(Math.max(bounds.min, Math.min(bounds.max, value1)));
            child2Genome.push(Math.max(bounds.min, Math.min(bounds.max, value2)));
        }

        return [child1Genome, child2Genome];
    }

    /**
     * Clone a float genome
     */
    clone(genome) {
        return [...genome];
    }

    /**
     * Generate Gaussian random number using Box-Muller transformation
     */
    gaussianRandom(mean = 0, stdDev = 1) {
        if (this._spare !== undefined) {
            const spare = this._spare;
            delete this._spare;
            return spare * stdDev + mean;
        }

        const u = Math.random();
        const v = Math.random();
        const mag = stdDev * Math.sqrt(-2.0 * Math.log(u));
        const z0 = mag * Math.cos(2.0 * Math.PI * v) + mean;
        const z1 = mag * Math.sin(2.0 * Math.PI * v) + mean;

        this._spare = z1;
        return z0;
    }
}

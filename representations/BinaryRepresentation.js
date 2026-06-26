/**
 * BinaryRepresentation
 *
 * Handles binary array genome representation.
 * Used by individuals that encode their genome as arrays of 0s and 1s.
 */

class BinaryRepresentation {
    constructor(config = {}) {
        this.length = config.length || 64;
    }

    /**
     * Generate a random binary genome
     */
    generateRandom() {
        return Array.from({length: this.length}, () => Math.random() < 0.5 ? 1 : 0);
    }

    /**
     * Mutate a binary genome (bit flip)
     */
    mutate(genome, rate = 0.1) {
        for (let i = 0; i < genome.length; i++) {
            if (Math.random() < rate) {
                genome[i] = genome[i] === 1 ? 0 : 1;
            }
        }
        return genome;
    }

    /**
     * Crossover two binary genomes (uniform crossover)
     */
    crossover(genome1, genome2) {
        const child1Genome = [];
        const child2Genome = [];

        for (let i = 0; i < genome1.length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(genome1[i]);
                child2Genome.push(genome2[i]);
            } else {
                child1Genome.push(genome2[i]);
                child2Genome.push(genome1[i]);
            }
        }

        return [child1Genome, child2Genome];
    }

    /**
     * Clone a binary genome
     */
    clone(genome) {
        return [...genome];
    }
}

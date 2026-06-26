/**
 * IntegerRepresentation
 *
 * Handles integer array genome representation.
 * Used by individuals that encode their genome as arrays of integers.
 */

class IntegerRepresentation {
    constructor(config = {}) {
        this.length = config.length || 100;
        this.min = config.min !== undefined ? config.min : 0;
        this.max = config.max !== undefined ? config.max : 255;
    }

    /**
     * Generate a random integer array genome
     */
    generateRandom() {
        return Array.from({length: this.length}, () =>
            Math.floor(Math.random() * (this.max - this.min + 1)) + this.min
        );
    }

    /**
     * Mutate an integer genome (random replacement)
     */
    mutate(genome, rate = 0.1) {
        for (let i = 0; i < genome.length; i++) {
            if (Math.random() < rate) {
                genome[i] = Math.floor(Math.random() * (this.max - this.min + 1)) + this.min;
            }
        }
        return genome;
    }

    /**
     * Crossover two integer genomes (uniform crossover)
     */
    crossover(genome1, genome2) {
        const child1Genome = [];
        const child2Genome = [];

        const length = Math.max(genome1.length, genome2.length);

        for (let i = 0; i < length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(genome1[i] !== undefined ? genome1[i] : Math.floor(Math.random() * (this.max - this.min + 1)) + this.min);
                child2Genome.push(genome2[i] !== undefined ? genome2[i] : Math.floor(Math.random() * (this.max - this.min + 1)) + this.min);
            } else {
                child1Genome.push(genome2[i] !== undefined ? genome2[i] : Math.floor(Math.random() * (this.max - this.min + 1)) + this.min);
                child2Genome.push(genome1[i] !== undefined ? genome1[i] : Math.floor(Math.random() * (this.max - this.min + 1)) + this.min);
            }
        }

        return [child1Genome, child2Genome];
    }

    /**
     * Clone an integer genome
     */
    clone(genome) {
        return [...genome];
    }
}

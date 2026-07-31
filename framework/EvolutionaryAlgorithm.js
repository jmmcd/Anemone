class EvolutionaryAlgorithm {
    constructor(individualClass, populationSize = 16, midiOutput = null) {
        this.individualClass = individualClass;
        this.populationSize = populationSize;
        // Per-offspring mutation rate, passed to Individual.mutate(rate). With
        // PTO's position-wise ("1/n type") mutation this is the probability each
        // trace entry mutates, so the caller controls mutation strength — which
        // matters in interactive EC, where the user is the fitness function and
        // wants to say "explore harder" or "refine". Surfaced by the Evolution
        // drawer panel; takes effect on the next evolve.
        this.mutationRate = EvolutionaryAlgorithm.DEFAULT_MUTATION_RATE;
        this.midiOutput = midiOutput;
        this.population = [];
        this.generation = 0;
        this.history = [];
        this.selectedIndividuals = [];
        // Every individual liked at any point during the run (not just the
        // current generation). saveGeneration() clears selectedIndividuals each
        // evolve, so this is the only durable record of the whole run's likes —
        // it backs the "export all liked" feature. Deduped by id in toggleLike.
        this.likedArchive = [];

        this.initializePopulation();
    }
    
    initializePopulation(carried = []) {
        this.population = carried.slice(0, this.populationSize);
        while (this.population.length < this.populationSize) {
            const individual = this.createValidIndividual();
            this.population.push(individual);
        }
        this.saveGeneration();
    }

    // Resize the population, KEEPING the individuals the user has evolved: shrink
    // by truncation, grow by padding with fresh randoms. A full re-initialisation
    // would throw away the run, which is not what changing a grid size means.
    setPopulationSize(n) {
        const size = Math.max(1, Math.round(n));
        if (size === this.populationSize) return false;
        this.populationSize = size;
        if (this.population.length > size) {
            const dropped = this.population.slice(size);
            dropped.forEach(ind => { if (ind.stopMIDI) ind.stopMIDI(); });
            this.population = this.population.slice(0, size);
            // A dropped individual must not stay a parent for the next evolve.
            const kept = new Set(this.population.map(ind => ind.id));
            this.selectedIndividuals = this.selectedIndividuals.filter(ind => kept.has(ind.id));
        } else {
            while (this.population.length < size) this.population.push(this.createValidIndividual());
        }
        return true;
    }

    createValidIndividual() {
        const maxAttempts = 100;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const individual = new this.individualClass();
            if (individual.setMidiOutput && this.midiOutput) {
                individual.setMidiOutput(this.midiOutput);
            }
            if (individual.validate()) {
                return individual;
            }
        }

        console.warn(`Unable to generate a valid ${this.individualClass.name} after ${maxAttempts} attempts; using a fallback instance.`);
        const fallback = new this.individualClass();
        if (fallback.setMidiOutput && this.midiOutput) {
            fallback.setMidiOutput(this.midiOutput);
        }
        return fallback;
    }

    createValidChildren(parent1, parent2) {
        const maxAttempts = 100;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const [child1, child2] = parent1.crossover(parent2);
            child1.mutate(this.mutationRate);
            child2.mutate(this.mutationRate);

            if (child1.setMidiOutput && this.midiOutput) {
                child1.setMidiOutput(this.midiOutput);
            }
            if (child2.setMidiOutput && this.midiOutput) {
                child2.setMidiOutput(this.midiOutput);
            }

            if (child1.validate() && child2.validate()) {
                return [child1, child2];
            }
        }

        console.warn(`Unable to produce two valid children for ${this.individualClass.name} after ${maxAttempts} attempts; using fallback individuals.`);
        return [this.createValidIndividual(), this.createValidIndividual()];
    }

    // Produce a single mutated variant of one parent (no crossover). Used when
    // exactly one individual is liked, so the whole next generation is mutants
    // of that individual.
    createValidMutant(parent) {
        const maxAttempts = 100;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const child = parent.clone();
            child.mutate(this.mutationRate);

            if (child.setMidiOutput && this.midiOutput) {
                child.setMidiOutput(this.midiOutput);
            }

            if (child.validate()) {
                return child;
            }
        }

        console.warn(`Unable to produce a valid mutant for ${this.individualClass.name} after ${maxAttempts} attempts; using a fallback individual.`);
        return this.createValidIndividual();
    }

    stopAllPlayback() {
        this.population.forEach(individual => {
            if (individual.stopMIDI) {
                individual.stopMIDI();
            }
        });
    }
    
    evolve() {
        // Stop all playback before evolution
        this.stopAllPlayback();

        // Locked individuals are carried over first, unchanged, and take their
        // slots off the table before anything is bred — so they never crowd out
        // the liked parents' offspring, they just shrink the pool being filled.
        const carried = this.lockedIndividuals().map(ind => {
            const clone = ind.clone();
            clone.locked = true;
            if (clone.setMidiOutput && this.midiOutput) clone.setMidiOutput(this.midiOutput);
            return clone;
        });

        // No likes: nothing to breed from, so start a fresh random generation —
        // around whatever is locked.
        if (this.selectedIndividuals.length === 0) {
            console.log('No individuals liked — re-initialising the population');
            this.generation++;
            this.initializePopulation(carried);
            return;
        }

        console.log(`Evolving from ${this.selectedIndividuals.length} liked individuals`);
        console.log(`Individual class: ${this.individualClass.name}`);

        // One like → mutation only (every child is a mutant of that individual);
        // two or more → crossover + mutation between liked parents.
        const singleParent = this.selectedIndividuals.length === 1;

        const newPopulation = [...carried];

        const elite = this.selectedIndividuals.slice(0, 2);
        const eliteClones = elite.map(ind => {
            const clone = ind.clone();
            if (clone.setMidiOutput && this.midiOutput) {
                clone.setMidiOutput(this.midiOutput);
            }
            console.log(`Elite clone: ${ind.constructor.name} -> ${clone.constructor.name}`);
            return clone.validate() ? clone : this.createValidIndividual();
        });
        newPopulation.push(...eliteClones.slice(0, Math.max(0, this.populationSize - newPopulation.length)));

        while (newPopulation.length < this.populationSize) {
            if (singleParent) {
                newPopulation.push(this.createValidMutant(this.selectedIndividuals[0]));
                continue;
            }

            const parent1 = this.selectParent();
            const parent2 = this.selectParent();

            console.log(`Parents: ${parent1.constructor.name}, ${parent2.constructor.name}`);

            const [child1, child2] = this.createValidChildren(parent1, parent2);
            console.log(`Children: ${child1.constructor.name}, ${child2.constructor.name}`);

            newPopulation.push(child1);
            if (newPopulation.length < this.populationSize) {
                newPopulation.push(child2);
            }
        }

        console.log(`Final population types: ${newPopulation.map(ind => ind.constructor.name).join(', ')}`);
        
        this.population = newPopulation;
        this.generation++;
        // A freshly displayed generation starts with a clean slate: nothing is
        // selected yet, so reset all fitness/selection (elite clones otherwise
        // carry their parent's fitness through clone()).
        this.population.forEach(ind => {
            ind.fitness = 0;
            ind.selected = false;
            // ...but a carried-over lock stays locked: that is the whole point.
        });
        this.selectedIndividuals = [];
        this.saveGeneration();
    }
    
    // Direct ("truncation") selection: parents are drawn uniformly at random
    // from the individuals the user liked. Likes are binary, so there is no
    // fitness gradient — every liked individual is an equally likely parent.
    selectParent() {
        const liked = this.selectedIndividuals;
        return liked[Math.floor(Math.random() * liked.length)];
    }
    
    // Binary "like": a single tap/click toggles whether an individual is liked.
    // Fitness is 0 or 1; tournament selection then picks equal-weight among the
    // liked individuals (standard for interactive EC). Returns the new state.
    toggleLike(individual) {
        // A locked individual is preserved, not bred from — the plan's "excluded
        // from the parent pool". Liking it would put it back in that pool, so the
        // two states are mutually exclusive (toggleLock unlikes; this refuses).
        if (individual.locked) return false;
        if (individual.selected) {
            individual.selected = false;
            individual.fitness = 0;
            this.selectedIndividuals = this.selectedIndividuals.filter(ind => ind.id !== individual.id);
            // Unliking within the current generation withdraws it from the run
            // archive too (the user changed their mind); past-generation likes
            // can no longer be unliked, so they persist.
            this.likedArchive = this.likedArchive.filter(ind => ind.id !== individual.id);
        } else {
            individual.selected = true;
            individual.fitness = 1;
            this.selectedIndividuals.push(individual);
            if (!this.likedArchive.some(ind => ind.id === individual.id)) {
                this.likedArchive.push(individual);
            }
        }
        return individual.selected;
    }
    
    // "Lock" (protect) an individual: a third per-tile state alongside liked.
    // A locked individual is carried into the next generation UNCHANGED and is
    // excluded from breeding — it is not a parent, and it does not count towards
    // elitism. Where a like says "make more like this", a lock says "keep exactly
    // this", which is what lets a user bank a result and keep searching around it.
    toggleLock(individual) {
        const locking = !individual.locked;
        // Locking supersedes liking: a locked individual is preserved, not bred
        // from, so leaving it in the parent pool would be contradictory. Withdraw
        // the like BEFORE setting the flag — toggleLike refuses a locked one.
        if (locking && individual.selected) this.toggleLike(individual);
        individual.locked = locking;
        // Keep the current history entry truthful, so time-travelling back to
        // this generation restores the locks that were in effect for it.
        const current = this.history[this.history.length - 1];
        if (current) current.locked = this._lockMask();
        return individual.locked;
    }

    lockedIndividuals() { return this.population.filter(ind => ind.locked); }

    // Lock state as a positional mask. NOT ids: saveGeneration stores clones and
    // clone() mints a fresh id, so an id recorded here would match nothing on the
    // way back. Position is stable, since loadGeneration clones the stored
    // population in order.
    _lockMask() { return this.population.map(ind => !!ind.locked); }

    saveGeneration() {
        this.history.push({
            generation: this.generation,
            population: this.population.map(ind => ind.clone()),
            selected: [...this.selectedIndividuals],
            locked: this._lockMask(),
        });
    }
    
    loadGeneration(genIndex) {
        if (genIndex >= 0 && genIndex < this.history.length) {
            const savedGen = this.history[genIndex];
            this.generation = savedGen.generation;
            this.population = savedGen.population.map(ind => ind.clone());
            this.selectedIndividuals = savedGen.selected.map(ind => ind.clone());
            
            const lockMask = savedGen.locked || [];
            this.population.forEach((ind, i) => {
                ind.selected = this.selectedIndividuals.some(sel => sel.id === ind.id);
                ind.locked = !!lockMask[i];           // locks are part of the saved state
            });
        }
    }
    
    reset() {
        this.stopAllPlayback();
        this.generation = 0;
        this.history = [];
        this.selectedIndividuals = [];
        this.likedArchive = [];
        this.initializePopulation();
    }
    
    getAverageFitness() {
        const totalFitness = this.population.reduce((sum, ind) => sum + ind.fitness, 0);
        return totalFitness / this.population.length;
    }
}
// Evolution parameters the Evolution drawer panel exposes. The default mutation
// rate is the value the app has always used; the population sizes are perfect
// squares so the grid stays square (see --grid-cols in styles.css).
EvolutionaryAlgorithm.DEFAULT_MUTATION_RATE = 0.1;
EvolutionaryAlgorithm.POPULATION_SIZES = [9, 16, 25];

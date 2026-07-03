class EvolutionaryAlgorithm {
    constructor(individualClass, populationSize = 16, midiOutput = null) {
        this.individualClass = individualClass;
        this.populationSize = populationSize;
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
    
    initializePopulation() {
        this.population = [];
        while (this.population.length < this.populationSize) {
            const individual = this.createValidIndividual();
            this.population.push(individual);
        }
        this.saveGeneration();
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
            child1.mutate(0.1);
            child2.mutate(0.1);

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
            child.mutate(0.1);

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

        // No likes: nothing to breed from, so start a fresh random generation.
        if (this.selectedIndividuals.length === 0) {
            console.log('No individuals liked — re-initialising the population');
            this.generation++;
            this.initializePopulation();
            return;
        }

        console.log(`Evolving from ${this.selectedIndividuals.length} liked individuals`);
        console.log(`Individual class: ${this.individualClass.name}`);

        // One like → mutation only (every child is a mutant of that individual);
        // two or more → crossover + mutation between liked parents.
        const singleParent = this.selectedIndividuals.length === 1;

        const newPopulation = [];

        const elite = this.selectedIndividuals.slice(0, 2);
        const eliteClones = elite.map(ind => {
            const clone = ind.clone();
            if (clone.setMidiOutput && this.midiOutput) {
                clone.setMidiOutput(this.midiOutput);
            }
            console.log(`Elite clone: ${ind.constructor.name} -> ${clone.constructor.name}`);
            return clone.validate() ? clone : this.createValidIndividual();
        });
        newPopulation.push(...eliteClones);

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
    
    saveGeneration() {
        this.history.push({
            generation: this.generation,
            population: this.population.map(ind => ind.clone()),
            selected: [...this.selectedIndividuals]
        });
    }
    
    loadGeneration(genIndex) {
        if (genIndex >= 0 && genIndex < this.history.length) {
            const savedGen = this.history[genIndex];
            this.generation = savedGen.generation;
            this.population = savedGen.population.map(ind => ind.clone());
            this.selectedIndividuals = savedGen.selected.map(ind => ind.clone());
            
            this.population.forEach(ind => {
                ind.selected = this.selectedIndividuals.some(sel => sel.id === ind.id);
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
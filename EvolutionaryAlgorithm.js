class EvolutionaryAlgorithm {
    constructor(individualClass, populationSize = 16, midiOutput = null) {
        this.individualClass = individualClass;
        this.populationSize = populationSize;
        this.midiOutput = midiOutput;
        this.population = [];
        this.generation = 0;
        this.history = [];
        this.selectedIndividuals = [];
        
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
    
    stopAllPlayback() {
        this.population.forEach(individual => {
            if (individual.stopMIDI) {
                individual.stopMIDI();
            }
        });
    }
    
    evolve() {
        if (this.selectedIndividuals.length < 2) {
            alert("Please select at least 2 individuals for evolution");
            return;
        }
        
        console.log(`Evolving from ${this.selectedIndividuals.length} selected individuals`);
        console.log(`Individual class: ${this.individualClass.name}`);
        
        // Stop all playback before evolution
        this.stopAllPlayback();
        
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
            const parent1 = this.tournamentSelection(this.selectedIndividuals);
            const parent2 = this.tournamentSelection(this.selectedIndividuals);
            
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
    
    tournamentSelection(candidates, tournamentSize = 3) {
        const tournament = [];
        for (let i = 0; i < tournamentSize; i++) {
            tournament.push(candidates[Math.floor(Math.random() * candidates.length)]);
        }
        return tournament.reduce((best, current) => 
            current.fitness > best.fitness ? current : best
        );
    }
    
    incrementFitness(individual) {
        individual.fitness += 1;
        if (individual.fitness > 0 && !individual.selected) {
            individual.selected = true;
            this.selectedIndividuals.push(individual);
        }
    }
    
    decrementFitness(individual) {
        individual.fitness = Math.max(0, individual.fitness - 1);
        if (individual.fitness === 0 && individual.selected) {
            individual.selected = false;
            this.selectedIndividuals = this.selectedIndividuals.filter(ind => ind.id !== individual.id);
        }
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
        this.initializePopulation();
    }
    
    getAverageFitness() {
        const totalFitness = this.population.reduce((sum, ind) => sum + ind.fitness, 0);
        return totalFitness / this.population.length;
    }
}
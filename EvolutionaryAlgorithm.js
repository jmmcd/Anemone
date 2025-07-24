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
        for (let i = 0; i < this.populationSize; i++) {
            const individual = new this.individualClass();
            // Pass MIDI output to individual if it supports it
            if (individual.setMidiOutput && this.midiOutput) {
                individual.setMidiOutput(this.midiOutput);
            }
            this.population.push(individual);
        }
        this.saveGeneration();
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
            console.log(`Elite clone: ${ind.constructor.name} -> ${clone.constructor.name}`);
            return clone;
        });
        newPopulation.push(...eliteClones);
        
        while (newPopulation.length < this.populationSize) {
            const parent1 = this.tournamentSelection(this.selectedIndividuals);
            const parent2 = this.tournamentSelection(this.selectedIndividuals);
            
            console.log(`Parents: ${parent1.constructor.name}, ${parent2.constructor.name}`);
            
            const [child1, child2] = parent1.crossover(parent2);
            console.log(`Children: ${child1.constructor.name}, ${child2.constructor.name}`);
            
            child1.mutate(0.1);
            child2.mutate(0.1);
            
            // Pass MIDI output to new individuals
            if (child1.setMidiOutput && this.midiOutput) {
                child1.setMidiOutput(this.midiOutput);
            }
            if (child2.setMidiOutput && this.midiOutput) {
                child2.setMidiOutput(this.midiOutput);
            }
            
            newPopulation.push(child1);
            if (newPopulation.length < this.populationSize) {
                newPopulation.push(child2);
            }
        }
        
        console.log(`Final population types: ${newPopulation.map(ind => ind.constructor.name).join(', ')}`);
        
        this.population = newPopulation;
        this.generation++;
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
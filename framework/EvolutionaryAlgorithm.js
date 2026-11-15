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

        // Duplicate filtering. 'phenotype' (default) rejects a new candidate whose
        // expressed phenotype has already been shown in this run; 'genotype'
        // rejects only an identical trace; 'off' admits duplicates. Elite and
        // locked clones are deliberate copies and are never checked. A rejected
        // candidate is redrawn, exactly as an invalid one is — duplicates are
        // wasted user attention just as trivial individuals are.
        this.dedupe = EvolutionaryAlgorithm.DEFAULT_DEDUPE;
        this._resetBookkeeping();

        this.initializePopulation();
    }

    // Run-level bookkeeping: the identity keys of everything shown so far, and
    // the counters (EvolutionaryAlgorithm.emptyStats) that record what the
    // filters saved the user from. scripts/filter-stats.js reads `stats`.
    _resetBookkeeping() {
        this._seenGeno = new Set();
        this._seenPheno = new Set();
        this._batch = new Set();      // level keys of the generation being built
        this.stats = EvolutionaryAlgorithm.emptyStats();
    }

    initializePopulation(carried = []) {
        this._batch = new Set();
        carried.forEach(ind => this._register(ind));
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

    // ---- Candidate admission (validity + duplicate filters) ----------------
    //
    // Every newly bred or drawn candidate passes through _admit(). The duplicate
    // check runs FIRST because it is cheap (a hash of the phenotype) where some
    // validate()s build geometry; the order hardly changes the counts, because
    // everything already seen passed validate() and validate() is a function of
    // the phenotype — so a phenotype duplicate is (almost) never also invalid.

    // Identity keys of an individual, cached against its genome object (mutate
    // and crossover assign a new genome, so a stale cache cannot survive them).
    static identityKeys(ind) {
        if (ind._idKeys && ind._idKeys.genome === ind.genome) return ind._idKeys;
        const keys = {
            genome: ind.genome,
            geno: EvolutionaryAlgorithm._genotypeKey(ind.genome),
            pheno: EvolutionaryAlgorithm._phenotypeKey(ind),
        };
        ind._idKeys = keys;
        return keys;
    }

    // A PTO trace is a dict name → {funName, args, val, mode}; two traces are the
    // same genotype iff they record the same values under the same names. (args
    // and mode are fixed by the generator's call site, so they add nothing.)
    static _genotypeKey(genome) {
        let str;
        try {
            if (genome && typeof genome === 'object' && !Array.isArray(genome)) {
                str = Object.keys(genome).map(k => {
                    const e = genome[k];
                    return k + '=' + JSON.stringify(e && typeof e === 'object' && 'val' in e ? e.val : e);
                }).join('|');
            } else {
                str = JSON.stringify(genome);
            }
        } catch (e) { return null; }
        return str == null ? null : EvolutionaryAlgorithm._hash(str);
    }

    // The raw generator output (this.phenotype), not getPhenotype(): that is the
    // phenotype as the representation defines it, and some getPhenotype()
    // overrides do real work (executing a turtle program) we need not repeat.
    static _phenotypeKey(ind) {
        let str;
        try { str = JSON.stringify(ind.phenotype); } catch (e) { return null; }
        return str == null ? null : EvolutionaryAlgorithm._hash(str);
    }

    // cyrb53: a 53-bit string hash. 32 bits (FNV, as in the phenotype signature)
    // would give a ~1e-3 chance of a false duplicate somewhere in a long run;
    // 53 bits makes that negligible without storing whole phenotypes.
    static _hash(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
    }

    _levelKey(keys) {
        return this.dedupe === 'genotype' ? keys.geno : keys.pheno;
    }

    // Record an individual as shown (on screen in some generation of this run).
    _register(ind) {
        const keys = EvolutionaryAlgorithm.identityKeys(ind);
        if (keys.geno != null) this._seenGeno.add(keys.geno);
        if (keys.pheno != null) this._seenPheno.add(keys.pheno);
        const k = this._levelKey(keys);
        if (k != null) this._batch.add(k);
    }

    // Judge one candidate from `source` ('init' | 'mutation' | 'crossover'),
    // bred from `parents` (empty for a fresh random one). Records the outcome in
    // this.stats and, if admitted, registers it as shown. Returns true to admit.
    _admit(ind, source, parents = []) {
        const s = this.stats[source];
        s.candidates++;
        const keys = EvolutionaryAlgorithm.identityKeys(ind);
        // Measured regardless of the filter level, so one run reports both.
        const genoDup = keys.geno != null && this._seenGeno.has(keys.geno);
        const phenoDup = keys.pheno != null && this._seenPheno.has(keys.pheno);
        if (genoDup) s.genoDup++;
        if (phenoDup) s.phenoDup++;

        if (this.dedupe !== 'off' && (this.dedupe === 'genotype' ? genoDup : phenoDup)) {
            const k = this._levelKey(keys);
            if (parents.some(p => this._levelKey(EvolutionaryAlgorithm.identityKeys(p)) === k)) s.dupParent++;
            else if (this._batch.has(k)) s.dupSibling++;
            else s.dupEarlier++;
            return false;
        }
        if (!ind.validate()) { s.invalid++; return false; }
        s.accepted++;
        this._register(ind);
        return true;
    }

    createValidIndividual() {
        const maxAttempts = 100;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const individual = new this.individualClass();
            if (individual.setMidiOutput && this.midiOutput) individual.setMidiOutput(this.midiOutput);
            if (this._admit(individual, 'init')) return individual;
        }
        // Give up on novelty, not on validity: a valid repeat beats a broken tile.
        this.stats.init.fallbacks++;
        const fallback = EvolutionaryAlgorithm.createValid(this.individualClass, this.midiOutput);
        this._register(fallback);
        return fallback;
    }

    // A fresh random individual of `individualClass` that passes validate(). Static
    // so a caller with no EA of that type (the landing page, which shows one tile
    // per type) draws its individuals exactly as a population would.
    static createValid(individualClass, midiOutput = null) {
        const maxAttempts = 100;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const individual = new individualClass();
            if (individual.setMidiOutput && midiOutput) {
                individual.setMidiOutput(midiOutput);
            }
            if (individual.validate()) {
                return individual;
            }
        }

        console.warn(`Unable to generate a valid ${individualClass.name} after ${maxAttempts} attempts; using a fallback instance.`);
        const fallback = new individualClass();
        if (fallback.setMidiOutput && midiOutput) {
            fallback.setMidiOutput(midiOutput);
        }
        return fallback;
    }

    // Put an individual chosen elsewhere (the landing page's pick) into slot 0 of
    // a fresh generation 0, as if it had been drawn there. It is NOT liked: picking
    // a type is not a vote for that individual, so liking it stays the user's call.
    // The history entry is rewritten so time travel back to generation 0 sees it too.
    //
    // With `family`, the rest of the generation becomes mutants of it (a shared
    // link's arrival) instead of staying random: mutation strength rises across
    // the grid from half to four times the current rate, so the tiles nearest the
    // seed are close look-alikes and the far ones wander — the recipient's likely
    // "more like this, but…" is already on screen.
    seed(individual, { family = false } = {}) {
        const n = this.population.length;
        const replaced = family ? n : 1;
        for (let i = 0; i < replaced; i++) {
            const old = this.population[i];
            if (old && old.stopMIDI) old.stopMIDI();
        }
        this.population[0] = individual;
        this._register(individual);
        if (family) {
            for (let i = 1; i < n; i++) {
                const f = n > 2 ? (i - 1) / (n - 2) : 0;
                const rate = Math.min(1, this.mutationRate * Math.pow(2, -1 + 3 * f));
                this.population[i] = this.createValidMutant(individual, rate);
            }
        }
        this.history.pop();
        this.saveGeneration();
    }

    // Breed `needed` (1 or 2) admitted children from two parents. Children are
    // admitted individually: a crossover whose first child is fine and second a
    // duplicate keeps the first, rather than throwing the pair away.
    createValidChildren(parent1, parent2, needed = 2) {
        const maxAttempts = 100;
        const out = [];
        for (let attempt = 0; attempt < maxAttempts && out.length < needed; attempt++) {
            const children = parent1.crossover(parent2);
            for (const child of children) {
                if (out.length >= needed) break;
                child.mutate(this.mutationRate);
                if (child.setMidiOutput && this.midiOutput) child.setMidiOutput(this.midiOutput);
                if (this._admit(child, 'crossover', [parent1, parent2])) out.push(child);
            }
        }
        if (out.length < needed) {
            console.warn(`Unable to produce ${needed} valid, novel children for ${this.individualClass.name} after ${maxAttempts} attempts; using fallback individuals.`);
            this.stats.crossover.fallbacks++;
            while (out.length < needed) out.push(this.createValidIndividual());
        }
        return out;
    }

    // Produce a single mutated variant of one parent (no crossover). Used when
    // exactly one individual is liked, so the whole next generation is mutants
    // of that individual.
    createValidMutant(parent, rate = this.mutationRate) {
        const maxAttempts = 100;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const child = parent.clone();
            child.mutate(rate);

            if (child.setMidiOutput && this.midiOutput) {
                child.setMidiOutput(this.midiOutput);
            }

            if (this._admit(child, 'mutation', [parent])) {
                return child;
            }
        }

        console.warn(`Unable to produce a valid, novel mutant for ${this.individualClass.name} after ${maxAttempts} attempts; using a fallback individual.`);
        this.stats.mutation.fallbacks++;
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
        this._batch = new Set();
        carried.forEach(ind => this._register(ind));

        const elite = this.selectedIndividuals.slice(0, 2);
        const eliteClones = elite.map(ind => {
            const clone = ind.clone();
            if (clone.setMidiOutput && this.midiOutput) {
                clone.setMidiOutput(this.midiOutput);
            }
            console.log(`Elite clone: ${ind.constructor.name} -> ${clone.constructor.name}`);
            return clone.validate() ? clone : this.createValidIndividual();
        });
        const elitesKept = eliteClones.slice(0, Math.max(0, this.populationSize - newPopulation.length));
        elitesKept.forEach(ind => this._register(ind));
        newPopulation.push(...elitesKept);

        while (newPopulation.length < this.populationSize) {
            if (singleParent) {
                newPopulation.push(this.createValidMutant(this.selectedIndividuals[0]));
                continue;
            }

            const parent1 = this.selectParent();
            const parent2 = this.selectParent();

            console.log(`Parents: ${parent1.constructor.name}, ${parent2.constructor.name}`);

            const needed = Math.min(2, this.populationSize - newPopulation.length);
            newPopulation.push(...this.createValidChildren(parent1, parent2, needed));
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
        this._resetBookkeeping();
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
// Duplicate filter level: 'phenotype' | 'genotype' | 'off' (see the constructor).
EvolutionaryAlgorithm.DEDUPE_LEVELS = ['phenotype', 'genotype', 'off'];
EvolutionaryAlgorithm.DEFAULT_DEDUPE = 'phenotype';
// Per-source counters of what the filters did. Sources: 'init' (fresh random
// draws: generation 0, re-rolls with no likes, padding), 'mutation' (one like:
// a mutant of it), 'crossover' (two or more likes: crossover + mutation).
//   candidates  — individuals generated and judged
//   accepted    — admitted to the population (shown to the user)
//   invalid     — rejected by validate()
//   dupParent / dupSibling / dupEarlier — rejected as a duplicate (at the
//                 filter level) of one of its own parents / of another member
//                 of the generation being built / of anything shown earlier
//   genoDup, phenoDup — candidates that WERE a genotype / phenotype duplicate,
//                 counted whatever the filter level (phenoDup − genoDup is
//                 neutral variation: a new trace that expresses an old phenotype)
//   fallbacks   — times 100 attempts failed and a random valid one was used
EvolutionaryAlgorithm.emptyStats = () => {
    const blank = () => ({ candidates: 0, accepted: 0, invalid: 0,
        dupParent: 0, dupSibling: 0, dupEarlier: 0, genoDup: 0, phenoDup: 0, fallbacks: 0 });
    return { init: blank(), mutation: blank(), crossover: blank() };
};

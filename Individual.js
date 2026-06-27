/**
 * Individual — base class for all individual types.
 *
 * Holds a representation strategy object (this.representation) and delegates the
 * genetic operators to it. A typical subclass only needs to construct its
 * representation, set this.genome, and implement visualize(); mutate/crossover/
 * clone are inherited. Subclasses with non-standard genome semantics (variable
 * length, mixed int/float, MIDI re-wiring on clone, etc.) override as needed.
 */
class Individual {
    constructor(genome = null) {
        this.fitness = 0;
        this.selected = false;
        this.id = Math.random().toString(36).substr(2, 9);
        this._cachedImageData = null;
        this._cacheKey = null;

        // Subclasses pass 'SKIP_GENOME_GENERATION' and manage their own genome
        // (and this.representation) after super(). A concrete genome is stored
        // directly so the generic crossover/clone below can reconstruct.
        if (genome !== null && genome !== 'SKIP_GENOME_GENERATION') {
            this.genome = genome;
        }
    }

    // --- Capability flags (read by the framework) ---
    is3D()             { return false; }
    usesColorPalette() { return false; }

    // --- Required / overridable behaviour ---
    visualize(canvas) {
        throw new Error("visualize() must be implemented by subclass");
    }

    getPhenotype() {
        return this.genome;
    }

    // --- Self-description for the UI ---
    // An individual knows how to present itself. toString() is a concise one-line
    // summary (safe for logs); describe() is the rich multi-section HTML shown in
    // the genome panel. Subclasses can override either, or just describeExtra()
    // to add type-specific detail (e.g. a formula) to the default layout.

    toString() {
        const p = this.getPhenotype();
        const summary = (typeof p === 'string' && p !== this.genome)
            ? ` — ${p.length > 60 ? p.slice(0, 60) + '…' : p}`
            : '';
        return `${this.constructor.name} #${this.id} (fitness ${this.fitness})${summary}`;
    }

    /** Type-specific extra section inserted after the phenotype; '' by default. */
    describeExtra() {
        return '';
    }

    /** Full HTML description for the genome panel. */
    describe() {
        if (this.genome === undefined || this.genome === null) {
            return '<em>No genome available</em>';
        }

        let out = '';
        out += `<span class="genome-label">Type:</span> ${this.constructor.name}\n`;
        out += `<span class="genome-label">ID:</span> ${this.id}\n`;
        out += `<span class="genome-label">Fitness:</span> ${this.fitness}\n\n`;

        const phenotype = this.getPhenotype();
        const phenotypeString = this._formatPhenotype(phenotype);
        if (phenotypeString && this._isPhenotypeInformative(phenotype)) {
            out += `<span class="genome-label">Phenotype:</span>\n${phenotypeString}\n`;
            out += this.describeExtra();
            out += '\n';
        }

        out += this._formatGenomeSection();
        return out;
    }

    // Is the phenotype worth showing separately from the genome?
    _isPhenotypeInformative(phenotype) {
        const genome = this.genome;
        if (!phenotype) return false;
        if (phenotype === genome) return false;                                   // same object
        if (Array.isArray(genome) && phenotype === genome.toString()) return false; // just the array stringified
        if (genome && typeof genome.toString === 'function' && genome.getAllNodes) return false; // tree shown as genome
        if (typeof phenotype === 'string' && phenotype.length > 0 && phenotype.length < 2000) return true;
        if ((typeof phenotype === 'object' || Array.isArray(phenotype)) && phenotype !== genome) return true;
        return false;
    }

    _formatGenomeSection() {
        const genome = this.genome;

        // Tree genome (GP): expression + stats
        if (genome && typeof genome.toString === 'function' && genome.getAllNodes) {
            let s = `<span class="genome-label">Expression Tree:</span>\n${genome.toString()}\n\n`;
            s += `<span class="genome-label">Tree Stats:</span>\n`;
            s += `  Depth: ${genome.depth()}\n`;
            s += `  Size: ${genome.size()} nodes\n`;
            return s;
        }

        // Array genome: pick a formatter by content
        if (Array.isArray(genome)) {
            let s = `<span class="genome-label">Genome (${genome.length} elements):</span>\n`;
            if (genome.length > 0) {
                if (genome.every(g => g === 0 || g === 1)) s += this._formatBinaryGenome(genome);
                else if (genome.every(g => Number.isInteger(g))) s += this._formatIntegerGenome(genome);
                else s += this._formatFloatGenome(genome);
            }
            return s;
        }

        // String genome
        if (typeof genome === 'string') {
            return `<span class="genome-label">Genome String:</span>\n${genome}\n`;
        }

        // Fallback
        return `<span class="genome-label">Genome:</span>\n${JSON.stringify(genome, null, 2)}`;
    }

    _formatPhenotype(phenotype) {
        if (!phenotype) return null;

        if (typeof phenotype === 'string') {
            return phenotype.length > 1000 ? phenotype.substring(0, 1000) + '...\n(truncated)' : phenotype;
        }

        if (Array.isArray(phenotype)) {
            // Array of command-like objects: show the first few
            if (phenotype.length > 0 && typeof phenotype[0] === 'object') {
                let s = `${phenotype.length} commands:\n`;
                const showCount = Math.min(5, phenotype.length);
                for (let i = 0; i < showCount; i++) {
                    const cmd = phenotype[i];
                    if (cmd.type) {
                        s += `  ${i + 1}. ${cmd.type}`;
                        if (cmd.x !== undefined && cmd.y !== undefined) s += ` at (${cmd.x.toFixed(2)}, ${cmd.y.toFixed(2)})`;
                        if (cmd.radius !== undefined) s += ` r=${cmd.radius.toFixed(2)}`;
                        if (cmd.width !== undefined && cmd.height !== undefined) s += ` ${cmd.width.toFixed(2)}×${cmd.height.toFixed(2)}`;
                        s += '\n';
                    } else {
                        s += `  ${i + 1}. ${JSON.stringify(cmd)}\n`;
                    }
                }
                if (phenotype.length > showCount) s += `  ... (${phenotype.length - showCount} more)`;
                return s;
            }
            return phenotype.length < 50
                ? phenotype.join(', ')
                : `[${phenotype.slice(0, 50).join(', ')}, ... (${phenotype.length} elements total)]`;
        }

        if (typeof phenotype === 'object') {
            try {
                const jsonStr = JSON.stringify(phenotype, null, 2);
                return jsonStr.length > 1000 ? jsonStr.substring(0, 1000) + '\n...\n(truncated)' : jsonStr;
            } catch (e) {
                return String(phenotype);
            }
        }

        return String(phenotype);
    }

    _formatBinaryGenome(genome) {
        let s = '';
        for (let i = 0; i < genome.length; i += 8) {
            s += genome.slice(i, i + 8).join('').padEnd(8, ' ') + '  ';
            if ((i + 8) % 64 === 0) s += '\n';
        }
        return s;
    }

    _formatIntegerGenome(genome) {
        let s = '';
        const itemsPerLine = 16;
        for (let i = 0; i < genome.length; i++) {
            s += genome[i].toString().padStart(4, ' ');
            if ((i + 1) % itemsPerLine === 0 && i < genome.length - 1) s += '\n';
            else if (i < genome.length - 1) s += ' ';
        }
        return s;
    }

    _formatFloatGenome(genome) {
        let s = '';
        const itemsPerLine = 8;
        for (let i = 0; i < genome.length; i++) {
            const value = typeof genome[i] === 'number' ? genome[i].toFixed(4) : genome[i];
            s += value.toString().padStart(10, ' ');
            if ((i + 1) % itemsPerLine === 0 && i < genome.length - 1) s += '\n';
            else if (i < genome.length - 1) s += ' ';
        }
        return s;
    }

    // --- Generic genetic operators delegated to the representation ---
    mutate(rate = 0.1) {
        this.representation.mutate(this.genome, rate);
        this.invalidateImageCache();
    }

    crossover(other) {
        const [g1, g2] = this.representation.crossover(this.genome, other.genome);
        return [new this.constructor(g1), new this.constructor(g2)];
    }

    clone() {
        const clone = new this.constructor(this.representation.clone(this.genome));
        clone.fitness = this.fitness;
        return clone;
    }

    // --- Image caching for canvas-based visualization ---
    visualizeWithCache(canvas, renderFunction) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Create cache key based on genome, canvas size, and any additional params
        const additionalParams = this.getCacheParams ? this.getCacheParams() : '';
        const cacheKey = `${this.genome.join(',')}_${width}x${height}_${additionalParams}`;

        // Check if we have cached image data
        if (this._cacheKey === cacheKey && this._cachedImageData) {
            ctx.putImageData(this._cachedImageData, 0, 0);
            return;
        }

        ctx.clearRect(0, 0, width, height);

        // Call the provided render function
        const imageData = renderFunction(ctx, width, height);

        // Cache the image data
        this._cachedImageData = imageData;
        this._cacheKey = cacheKey;

        ctx.putImageData(imageData, 0, 0);
    }

    // Invalidate image cache (call after mutation/crossover)
    invalidateImageCache() {
        this._cachedImageData = null;
        this._cacheKey = null;
    }
}

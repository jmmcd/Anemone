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

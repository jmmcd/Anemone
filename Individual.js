class Individual {
    constructor(genome = null) {
        this.fitness = 0;
        this.selected = false;
        this.id = Math.random().toString(36).substr(2, 9);
        this._cachedImageData = null;
        this._cacheKey = null;
        
        // Only generate genome if it's not null and not explicitly set to prevent generation
        if (genome !== null) {
            this.genome = genome;
        } else if (genome !== 'SKIP_GENOME_GENERATION') {
            this.genome = this.generateRandomGenome();
        }
    }
    
    generateRandomGenome() {
        return Array.from({length: 64}, () => Math.random() < 0.5 ? 1 : 0);
    }
    
    visualize(canvas) {
        throw new Error("visualize() must be implemented by subclass");
    }
    
    getPhenotype() {
        return this.genome;
    }
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                this.genome[i] = this.genome[i] === 1 ? 0 : 1;
            }
        }
    }
    
    crossover(other) {
        const child1Genome = [];
        const child2Genome = [];
        
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(this.genome[i]);
                child2Genome.push(other.genome[i]);
            } else {
                child1Genome.push(other.genome[i]);
                child2Genome.push(this.genome[i]);
            }
        }
        
        const child1 = new this.constructor();
        const child2 = new this.constructor();
        child1.genome = child1Genome;
        child2.genome = child2Genome;
        
        return [child1, child2];
    }
    
    clone() {
        const clone = new this.constructor();
        clone.genome = [...this.genome];
        clone.fitness = this.fitness;
        clone._cachedImageData = null;
        clone._cacheKey = null;
        return clone;
    }
    
    // Generic image caching for canvas-based visualization
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
    
    // Color palette interpolation
    interpolateColor(palette, t) {
        // Clamp t to [0, 1]
        t = Math.max(0, Math.min(1, t));
        
        // Scale t to palette index range
        const scaledT = t * (palette.length - 1);
        const index = Math.floor(scaledT);
        const fraction = scaledT - index;
        
        // Handle edge case
        if (index >= palette.length - 1) {
            return palette[palette.length - 1];
        }
        
        const color1 = palette[index];
        const color2 = palette[index + 1];
        
        // Linear interpolation between colors
        return {
            r: Math.round(color1.r + (color2.r - color1.r) * fraction),
            g: Math.round(color1.g + (color2.g - color1.g) * fraction),
            b: Math.round(color1.b + (color2.b - color1.b) * fraction)
        };
    }
    
    // Create yellow-white-blue palette
    createYellowWhiteBluePalette() {
        return [
            {r: 255, g: 255, b: 0},   // Yellow
            {r: 255, g: 255, b: 128}, // Light yellow
            {r: 255, g: 255, b: 255}, // White
            {r: 128, g: 128, b: 255}, // Light blue
            {r: 0, g: 0, b: 255}      // Blue
        ];
    }
    
    // Create grayscale palette
    createGrayscalePalette() {
        return [
            {r: 0, g: 0, b: 0},       // Black
            {r: 128, g: 128, b: 128}, // Gray
            {r: 255, g: 255, b: 255}  // White
        ];
    }
    
    // Create sunset palette
    createSunsetPalette() {
        return [
            {r: 255, g: 0, b: 64},    // Pink
            {r: 255, g: 128, b: 0},   // Orange
            {r: 255, g: 255, b: 0},   // Yellow
            {r: 255, g: 64, b: 255},  // Magenta
            {r: 128, g: 0, b: 255}    // Purple
        ];
    }
    
    // Alternative color palettes
    createFirePalette() {
        return [
            {r: 0, g: 0, b: 0},       // Black
            {r: 128, g: 0, b: 0},     // Dark red
            {r: 255, g: 0, b: 0},     // Red
            {r: 255, g: 128, b: 0},   // Orange
            {r: 255, g: 255, b: 0},   // Yellow
            {r: 255, g: 255, b: 255}  // White
        ];
    }
    
    createOceanPalette() {
        return [
            {r: 0, g: 0, b: 64},      // Deep blue
            {r: 0, g: 64, b: 128},    // Ocean blue
            {r: 0, g: 128, b: 192},   // Light blue
            {r: 64, g: 192, b: 255},  // Sky blue
            {r: 128, g: 255, b: 255}, // Cyan
            {r: 255, g: 255, b: 255}  // White
        ];
    }
    
    // Get palette by name (for framework integration)
    getPaletteByName(paletteName) {
        switch (paletteName) {
            case 'yellowWhiteBlue':
                return this.createYellowWhiteBluePalette();
            case 'fire':
                return this.createFirePalette();
            case 'ocean':
                return this.createOceanPalette();
            case 'grayscale':
                return this.createGrayscalePalette();
            case 'sunset':
                return this.createSunsetPalette();
            default:
                return this.createYellowWhiteBluePalette();
        }
    }
}
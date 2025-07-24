class ContinuousPaletteSystem {
    constructor() {
        // Define available color schemes from d3-scale-chromatic
        this.availablePalettes = {
            // Sequential (Single Hue)
            'blues': { func: d3.interpolateBlues, type: 'sequential', description: 'Blues' },
            'greens': { func: d3.interpolateGreens, type: 'sequential', description: 'Greens' },
            'greys': { func: d3.interpolateGreys, type: 'sequential', description: 'Greys' },
            'oranges': { func: d3.interpolateOranges, type: 'sequential', description: 'Oranges' },
            'purples': { func: d3.interpolatePurples, type: 'sequential', description: 'Purples' },
            'reds': { func: d3.interpolateReds, type: 'sequential', description: 'Reds' },
            
            // Sequential (Multi-Hue)
            'viridis': { func: d3.interpolateViridis, type: 'sequential', description: 'Viridis' },
            'inferno': { func: d3.interpolateInferno, type: 'sequential', description: 'Inferno' },
            'magma': { func: d3.interpolateMagma, type: 'sequential', description: 'Magma' },
            'plasma': { func: d3.interpolatePlasma, type: 'sequential', description: 'Plasma' },
            'cividis': { func: d3.interpolateCividis, type: 'sequential', description: 'Cividis' },
            'warm': { func: d3.interpolateWarm, type: 'sequential', description: 'Warm' },
            'cool': { func: d3.interpolateCool, type: 'sequential', description: 'Cool' },
            'cubehelix': { func: d3.interpolateCubehelixDefault, type: 'sequential', description: 'Cubehelix' },
            'turbo': { func: d3.interpolateTurbo, type: 'sequential', description: 'Turbo' },
            'rainbow': { func: d3.interpolateRainbow, type: 'sequential', description: 'Rainbow' },
            'sinebow': { func: d3.interpolateSinebow, type: 'sequential', description: 'Sinebow' },
            
            // Diverging
            'brbg': { func: d3.interpolateBrBG, type: 'diverging', description: 'Brown-Blue-Green' },
            'prgn': { func: d3.interpolatePRGn, type: 'diverging', description: 'Purple-Green' },
            'piyg': { func: d3.interpolatePiYG, type: 'diverging', description: 'Pink-Yellow-Green' },
            'puor': { func: d3.interpolatePuOr, type: 'diverging', description: 'Purple-Orange' },
            'rdbu': { func: d3.interpolateRdBu, type: 'diverging', description: 'Red-Blue' },
            'rdgy': { func: d3.interpolateRdGy, type: 'diverging', description: 'Red-Grey' },
            'rdylbu': { func: d3.interpolateRdYlBu, type: 'diverging', description: 'Red-Yellow-Blue' },
            'rdylgn': { func: d3.interpolateRdYlGn, type: 'diverging', description: 'Red-Yellow-Green' },
            'spectral': { func: d3.interpolateSpectral, type: 'diverging', description: 'Spectral' },
            
            // Cyclical
            'sinebow': { func: d3.interpolateSinebow, type: 'cyclical', description: 'Sinebow' },
            'rainbow': { func: d3.interpolateRainbow, type: 'cyclical', description: 'Rainbow' },
            
            // Custom favorites
            'fire': { func: this.createFirePalette(), type: 'custom', description: 'Fire' },
            'ocean': { func: this.createOceanPalette(), type: 'custom', description: 'Ocean' },
            'sunset': { func: this.createSunsetPalette(), type: 'custom', description: 'Sunset' },
            'forest': { func: this.createForestPalette(), type: 'custom', description: 'Forest' }
        };
        
        // Default palette
        this.defaultPalette = 'viridis';
    }
    
    createFirePalette() {
        return t => {
            const colors = ['#000000', '#4A0E0E', '#8B0000', '#FF4500', '#FF8C00', '#FFD700', '#FFFFFF'];
            return this.interpolateColors(colors, t);
        };
    }
    
    createOceanPalette() {
        return t => {
            const colors = ['#000080', '#0000CD', '#0080FF', '#00BFFF', '#00FFFF', '#E0F6FF', '#FFFFFF'];
            return this.interpolateColors(colors, t);
        };
    }
    
    createSunsetPalette() {
        return t => {
            const colors = ['#1A1A2E', '#16213E', '#E94560', '#F39C12', '#F1C40F', '#F8C471', '#FFF3E0'];
            return this.interpolateColors(colors, t);
        };
    }
    
    createForestPalette() {
        return t => {
            const colors = ['#2C5F2D', '#5D8A5F', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFF9C4', '#F1F8E9'];
            return this.interpolateColors(colors, t);
        };
    }
    
    interpolateColors(colors, t) {
        t = Math.max(0, Math.min(1, t));
        
        if (t === 0) return colors[0];
        if (t === 1) return colors[colors.length - 1];
        
        const scaledT = t * (colors.length - 1);
        const index = Math.floor(scaledT);
        const fraction = scaledT - index;
        
        const color1 = d3.color(colors[index]);
        const color2 = d3.color(colors[index + 1]);
        
        return d3.interpolateRgb(color1, color2)(fraction);
    }
    
    // Get a color from a palette given a value from 0-1
    getColor(paletteName, value) {
        const palette = this.availablePalettes[paletteName];
        if (!palette) {
            console.warn(`Palette '${paletteName}' not found, using default`);
            return this.getColor(this.defaultPalette, value);
        }
        
        // Clamp value to [0, 1]
        value = Math.max(0, Math.min(1, value));
        
        const colorString = palette.func(value);
        const color = d3.color(colorString);
        
        return {
            r: Math.round(color.r),
            g: Math.round(color.g),
            b: Math.round(color.b),
            hex: color.formatHex(),
            css: colorString
        };
    }
    
    // Get multiple colors from a palette (for preview)
    getColorSwatch(paletteName, numColors = 8) {
        const colors = [];
        for (let i = 0; i < numColors; i++) {
            const t = i / (numColors - 1);
            colors.push(this.getColor(paletteName, t));
        }
        return colors;
    }
    
    // Get list of available palettes
    getPaletteList() {
        return Object.keys(this.availablePalettes);
    }
    
    // Get palette info
    getPaletteInfo(paletteName) {
        return this.availablePalettes[paletteName];
    }
    
    // Get palettes by type
    getPalettesByType(type) {
        const palettes = {};
        for (const [name, info] of Object.entries(this.availablePalettes)) {
            if (info.type === type) {
                palettes[name] = info;
            }
        }
        return palettes;
    }
    
    // Legacy compatibility: convert to old discrete format if needed
    convertToDiscrete(paletteName, numColors = 5) {
        const colors = [];
        for (let i = 0; i < numColors; i++) {
            const t = i / (numColors - 1);
            colors.push(this.getColor(paletteName, t));
        }
        return colors;
    }
}

// Create global instance
window.continuousPaletteSystem = new ContinuousPaletteSystem();
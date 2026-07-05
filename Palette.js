class Palette {
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

            // Perceptual (OKLCH) — generated in OKLCH so lightness/chroma stay
            // perceptually even across the hue sweep (unlike HSL). See oklchColor().
            'oklch-rainbow': { func: t => this.oklchColor(0.72, 0.15, t * 360), type: 'perceptual', description: 'OKLCH Rainbow' },
            'oklch-pastel':  { func: t => this.oklchColor(0.86, 0.07, t * 360), type: 'perceptual', description: 'OKLCH Pastel' },
            'oklch-neon':    { func: t => this.oklchColor(0.70, 0.26, t * 360), type: 'perceptual', description: 'OKLCH Neon' },
            'oklch-ember':   { func: t => this.oklchColor(0.28 + 0.64 * t, 0.14, 25 + 70 * t), type: 'perceptual', description: 'OKLCH Ember' },
            'oklch-ice':     { func: t => this.oklchColor(0.30 + 0.62 * t, 0.11, 265 - 45 * t), type: 'perceptual', description: 'OKLCH Ice' },
            'oklch-tealmag': { func: t => this.oklchDiverging(t), type: 'perceptual', description: 'OKLCH Teal-Magenta' },

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
    
    // --- OKLCH color engine (Björn Ottosson's OKLab) -----------------------
    // OKLCH is a perceptually-uniform polar space: L = lightness [0,1],
    // C = chroma (~0..0.37), H = hue in degrees. Sweeping H at fixed L,C gives
    // a rainbow whose bands look equally bright/saturated — much better for
    // generative art than HSL (whose yellows glare and blues go muddy).

    _oklabToLinearRgb(L, a, b) {
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
        return [
            +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        ];
    }

    _inGamut([r, g, b]) {
        const e = 1e-4;
        return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
    }

    _linearToSrgb(c) {
        c = Math.max(0, Math.min(1, c));
        return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }

    // OKLCH -> "rgb(r, g, b)" string. Chroma is reduced (binary search) until
    // the color fits in sRGB, so out-of-gamut hues desaturate rather than clip
    // (which would shift the hue). Returns a string so it drops into the same
    // `func: t => cssColor` slot as the d3 palettes.
    oklchColor(L, C, H) {
        const hr = H * Math.PI / 180, cos = Math.cos(hr), sin = Math.sin(hr);
        let rgb = this._oklabToLinearRgb(L, C * cos, C * sin);
        if (!this._inGamut(rgb)) {
            let lo = 0, hi = C;
            for (let i = 0; i < 18; i++) {
                const mid = (lo + hi) / 2;
                if (this._inGamut(this._oklabToLinearRgb(L, mid * cos, mid * sin))) lo = mid;
                else hi = mid;
            }
            rgb = this._oklabToLinearRgb(L, lo * cos, lo * sin);
        }
        const [r, g, b] = rgb.map(c => Math.round(this._linearToSrgb(c) * 255));
        return `rgb(${r}, ${g}, ${b})`;
    }

    // Diverging teal <-> magenta through a light neutral midpoint.
    oklchDiverging(t) {
        const k = Math.abs(2 * t - 1);           // 0 at centre, 1 at ends
        const L = 0.92 - 0.5 * k;                 // bright in the middle
        const C = 0.16 * k;                       // near-grey in the middle
        const H = t < 0.5 ? 200 : 350;            // teal side / magenta side
        return this.oklchColor(L, C, H);
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
    
    // Get the current palette name from the framework settings
    name() {
        const fw = window.framework;
        return (fw && fw.settings && fw.settings.colorPalette) || this.defaultPalette;
    }

    // Get a color from the current or named palette given a value from 0-1
    color(t, paletteName = this.name()) {
        return this.getColor(paletteName, t);
    }

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

// Create app-level palette instance
window.Palette = new Palette();
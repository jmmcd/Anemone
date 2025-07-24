// Mixin factory function to add palette extension support to any individual class
const withPaletteExtensions = (BaseClass) => {
    return class extends BaseClass {
        static getFrameworkExtensions() {
            return {
                ui: PaletteControlUI,
                settings: ['colorPalette'],
                hotkeys: {
                    'p': 'cyclePalette'
                }
            };
        }
        
        // Helper method to get framework settings
        getFrameworkSetting(key) {
            // Access the framework through the global variable (set by main.js)
            if (typeof framework !== 'undefined' && framework.settings) {
                return framework.settings[key];
            }
            return null;
        }
        
        // Additional parameters for cache key generation (includes palette)
        getCacheParams() {
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            return paletteName;
        }
        
        // Get available palettes from continuous palette system
        getAvailablePalettes() {
            if (!window.continuousPaletteSystem) {
                console.warn('ContinuousPaletteSystem not loaded, using fallback');
                return this.getFallbackPalettes();
            }
            
            const palettes = {};
            const paletteList = window.continuousPaletteSystem.getPaletteList();
            
            for (const paletteName of paletteList) {
                const info = window.continuousPaletteSystem.getPaletteInfo(paletteName);
                palettes[paletteName] = info.description;
            }
            
            return palettes;
        }
        
        // Get palette by name (now returns continuous function)
        getPaletteByName(name) {
            if (!window.continuousPaletteSystem) {
                console.warn('ContinuousPaletteSystem not loaded, using fallback');
                return this.getFallbackPalette(name);
            }
            
            return {
                name: name,
                getColor: (t) => window.continuousPaletteSystem.getColor(name, t),
                getSwatch: (numColors = 8) => window.continuousPaletteSystem.getColorSwatch(name, numColors)
            };
        }
        
        // Interpolate color using continuous palette
        interpolateColor(paletteOrName, t) {
            if (!window.continuousPaletteSystem) {
                return this.fallbackInterpolateColor(paletteOrName, t);
            }
            
            // If paletteOrName is a string, use it as palette name
            if (typeof paletteOrName === 'string') {
                return window.continuousPaletteSystem.getColor(paletteOrName, t);
            }
            
            // If it's a palette object with getColor method
            if (paletteOrName && typeof paletteOrName.getColor === 'function') {
                return paletteOrName.getColor(t);
            }
            
            // If it's an old-style discrete palette array, use fallback
            if (Array.isArray(paletteOrName)) {
                return this.fallbackInterpolateColor(paletteOrName, t);
            }
            
            // Default fallback
            return { r: 128, g: 128, b: 128 };
        }
        
        // Fallback methods for when continuous palette system isn't available
        getFallbackPalettes() {
            return {
                'viridis': 'Viridis',
                'plasma': 'Plasma',
                'inferno': 'Inferno',
                'blues': 'Blues',
                'reds': 'Reds'
            };
        }
        
        getFallbackPalette(name) {
            // Simple fallback to discrete colors
            const palettes = {
                'viridis': [
                    { r: 68, g: 1, b: 84 },
                    { r: 59, g: 82, b: 139 },
                    { r: 33, g: 144, b: 140 },
                    { r: 93, g: 201, b: 99 },
                    { r: 253, g: 231, b: 37 }
                ],
                'plasma': [
                    { r: 13, g: 8, b: 135 },
                    { r: 126, g: 3, b: 168 },
                    { r: 203, g: 70, b: 121 },
                    { r: 248, g: 149, b: 64 },
                    { r: 240, g: 249, b: 33 }
                ]
            };
            
            return palettes[name] || palettes['viridis'];
        }
        
        fallbackInterpolateColor(palette, t) {
            t = Math.max(0, Math.min(1, t));
            
            if (palette.length === 0) return { r: 0, g: 0, b: 0 };
            if (palette.length === 1) return palette[0];
            
            const scaledT = t * (palette.length - 1);
            const index = Math.floor(scaledT);
            const fraction = scaledT - index;
            
            if (index >= palette.length - 1) {
                return palette[palette.length - 1];
            }
            
            const color1 = palette[index];
            const color2 = palette[index + 1];
            
            return {
                r: Math.round(color1.r + (color2.r - color1.r) * fraction),
                g: Math.round(color1.g + (color2.g - color1.g) * fraction),
                b: Math.round(color1.b + (color2.b - color1.b) * fraction)
            };
        }
    };
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = withPaletteExtensions;
}
// Also make it available globally for browser usage
if (typeof window !== 'undefined') {
    window.withPaletteExtensions = withPaletteExtensions;
}
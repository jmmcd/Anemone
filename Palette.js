/**
 * Palette — app-level color service.
 *
 * Medium-agnostic: consumed by both 2D and 3D individuals. Wraps
 * window.continuousPaletteSystem and reads the current palette name from the
 * framework settings, with a small fallback for when the continuous system
 * hasn't loaded. Individuals call window.Palette.color(t) and get an {r,g,b}.
 */
window.Palette = {
    /** Current palette name from framework settings (default 'viridis'). */
    name() {
        const fw = window.framework;
        return (fw && fw.settings && fw.settings.colorPalette) || 'forest';
    },

    /**
     * Look up a color at position t in [0,1].
     * @param {number} t        position in the palette
     * @param {string} [name]   palette name; defaults to the current one
     * @returns {{r:number,g:number,b:number}}
     */
    color(t, name = this.name()) {
        if (window.continuousPaletteSystem) {
            return window.continuousPaletteSystem.getColor(name, t);
        }
        return this._fallbackColor(name, t);
    },

    // --- Fallback for when ContinuousPaletteSystem isn't available ---
    _fallbackPalettes: {
        viridis: [
            { r: 68, g: 1, b: 84 }, { r: 59, g: 82, b: 139 },
            { r: 33, g: 144, b: 140 }, { r: 93, g: 201, b: 99 },
            { r: 253, g: 231, b: 37 }
        ],
        plasma: [
            { r: 13, g: 8, b: 135 }, { r: 126, g: 3, b: 168 },
            { r: 203, g: 70, b: 121 }, { r: 248, g: 149, b: 64 },
            { r: 240, g: 249, b: 33 }
        ]
    },

    _fallbackColor(name, t) {
        const palette = this._fallbackPalettes[name] || this._fallbackPalettes.forest;
        t = Math.max(0, Math.min(1, t));
        if (palette.length === 1) return palette[0];

        const scaledT = t * (palette.length - 1);
        const index = Math.floor(scaledT);
        if (index >= palette.length - 1) return palette[palette.length - 1];

        const fraction = scaledT - index;
        const c1 = palette[index];
        const c2 = palette[index + 1];
        return {
            r: Math.round(c1.r + (c2.r - c1.r) * fraction),
            g: Math.round(c1.g + (c2.g - c1.g) * fraction),
            b: Math.round(c1.b + (c2.b - c1.b) * fraction)
        };
    }
};

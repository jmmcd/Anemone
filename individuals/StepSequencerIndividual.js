/**
 * StepSequencerIndividual — the shared base of the two step sequencers
 * (DrumMachineIndividual, MelodyIndividual). Abstract: not registered.
 *
 * What the two have in common is everything except the sound and the picture:
 * an 8-row × 16-step grid phenotype (`phenotype.grid[row][step]`, 0 = off, else
 * a velocity *seed* in [velFloor, 1]), a `length` gene the global Performance
 * panel can lock, per-cell editable genes (`hit_c_s`, `vel_c_s`) that the
 * default grid edit session (Individual._gridEditSession) writes through
 * setGene so an edit is heritable, and playback through the base's unified
 * live-MIDI-else-synth path (playSequenced).
 *
 * A subclass supplies its generator (static representation), the dials it
 * shows (performanceDials), visualize(), toMIDISequence() + renderToAudioBuffer(),
 * and — if a held note spans several cells — noteHead().
 */
class StepSequencerIndividual extends Individual {
    static capabilities = {
        usesColorPalette: true,        // rows are palette-coloured
        usesPerformanceControls: true, // attaches the global Performance panel
        usesMIDISync: true,            // attaches the MIDI Clock Sync panel
        // The tile is a real step sequencer: click/drag it in the zoom, and the
        // edit is written to the per-cell genes, so evolution continues from it.
        isGridEditable: true,
    };

    // The lowest seed a hit stores, so a hit is never fully silent. The grid
    // value is velFloor + (1 − velFloor)·vel_c_s.
    static velFloor = 0.35;

    // Effective bar length in steps: the genome's `length` gene, unless the
    // global "Length" override is locked (the default, forcing 16) — see
    // PerformanceControls. The [ and ] hotkeys drive it.
    _effectiveLength() {
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        return Math.max(1, Math.min(16, Math.round(p.length != null ? p.length : 16)));
    }

    // Grid geometry for a W×H canvas — the single source of truth shared by
    // visualize() (drawing) and cellAtCanvasXY() (hit-testing), so a click
    // always lands on the cell it appears to. Row 0 is drawn at the BOTTOM.
    _gridLayout(W, H) {
        const rows = 8, cols = 16;
        const pad = Math.max(2, Math.floor(W * 0.02));
        const cw = (W - 2 * pad) / cols;
        const gridH = H - 2 * pad;
        const chh = gridH / rows;
        return { rows, cols, pad, cw, chh, gridH, yTop: pad };
    }

    // --- Grid edit hooks (driven by Individual._gridEditSession) ---------------

    // A canvas pixel → { c, s }, or null outside the grid. Inverse of _gridLayout.
    cellAtCanvasXY(canvas, px, py) {
        const { rows, cols, pad, cw, chh, yTop } = this._gridLayout(canvas.width, canvas.height);
        const s = Math.floor((px - pad) / cw);
        const c = (rows - 1) - Math.floor((py - yTop) / chh);
        if (s < 0 || s >= cols || c < 0 || c >= rows) return null;
        return { c, s };
    }

    cellOn(c, s) {
        const p = this.phenotype;
        return !!(p && p.grid && p.grid[c][s] > 0);
    }

    // The cell whose velocity gene a cell's loudness comes from. A drum hit is
    // its own; a held melody note is sounded at its run's head.
    noteHead(c, s) { return s; }

    // Turn a cell on or off by forcing its hit gene. A freshly-turned-on cell
    // reuses its velocity gene (already in the trace), so it inherits a sensible
    // dynamic rather than a flat default.
    setCellHit(c, s, on) {
        this.genome = this.representation.setGene(this.genome, `hit_${c}_${s}`, on ? 1 : 0);
        this.invalidateImageCache();
    }

    // Per-cell velocity as the 0..1 `vel_c_s` gene — which is also the fraction
    // of the cell drawn filled, so the bar height is exactly what a drag edits.
    cellVel(c, s) {
        const p = this.phenotype, floor = this.constructor.velFloor;
        const seed = (p && p.grid && p.grid[c] && p.grid[c][this.noteHead(c, s)]) || 0;
        return seed > 0 ? Math.max(0, Math.min(1, (seed - floor) / (1 - floor))) : 0;
    }

    setCellVel(c, s, v) {
        const gene = Math.max(0, Math.min(1, v));
        this.genome = this.representation.setGene(this.genome, `vel_${c}_${this.noteHead(c, s)}`, gene);
        this.invalidateImageCache();
    }

    // --- Playback: the base's unified live-MIDI-else-synth path ---------------
    playMIDI() { this.playSequenced(); }
    stopMIDI() { this.stopSequenced(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StepSequencerIndividual;
}

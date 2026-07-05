/**
 * PerformanceControls — app-level service + drawer panel for GLOBAL performance dials,
 * shared by every step-sequencer individual (DrumMachineIndividual, MelodyIndividual).
 *
 * Mirrors window.Palette / window.Photo: one shared, instance-agnostic service that a
 * sound individual consults at RENDER time. It exposes render-stage "style dials"
 * (tempo, swing, humanize, drive) as global overrides so the user can drive the whole
 * population from one place — e.g. LOCK the tempo, then jam a bass line over evolving
 * loops that all stay at that BPM.
 *
 * (Renamed from the drum-only `DrumControls`: tempo/swing apply to any step sequencer;
 * humanize/drive are drum-specific. Each individual declares which dials it uses via
 * `performanceDials()`, and the panel shows only those — see Anemone.loadExtensions.)
 *
 * Why only these dials: they are read while turning the grid into sound (never baked
 * into the genome's grid), so overriding them is free — substitute the value at render,
 * genome untouched. Each dial's gene still lives in every genome (so variety and
 * inheritance survive in the latent); while a dial is LOCKED the global value shadows
 * it for playback, and unlocking hands control back to the genome.
 *
 * apply(pheno) returns an effective phenotype (a shallow copy with locked dials
 * substituted); a type's render/export reads from that. It only substitutes LOCKED
 * dials, so keys a given type doesn't have (a melody has no `drive`) are simply ignored.
 */

/**
 * Transport — the shared global clock, based on performance.now() (so it serves BOTH
 * the audio path, which converts phase→buffer offset, and the live-MIDI path, which
 * schedules in the performance.now() domain Web MIDI timestamps use). Only one
 * individual sounds at a time, so this is a single shared timeline: editing a cell
 * (re-render) or switching which individual plays resumes at the current spot instead
 * of snapping to the downbeat. Phase is time-based mod the bar length, so when loops
 * share a tempo it's a true shared beat grid, and across differing tempos it still
 * preserves time continuity (each loop enters at its own phase).
 */
window.Transport = {
    epoch: null, // performance.now()/1000 (seconds) at which the timeline began
    // Seconds into a barLenSec-long loop that playback should begin right now.
    phase(barLenSec) {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        if (this.epoch == null || !isFinite(this.epoch)) this.epoch = now;
        if (!(barLenSec > 0)) return 0;
        const t = (now - this.epoch) % barLenSec;
        return t < 0 ? t + barLenSec : t;
    },
    reset() { this.epoch = null; }, // start fresh from the next play
};

window.PerformanceControls = {
    // Each dial: on = is the global override engaged; value = the global value.
    // The gene of the same name in each genome is used when on === false.
    dials: {
        bpm:      { on: false, value: 120,  min: 60, max: 180, step: 1,    label: 'Tempo',    fmt: v => Math.round(v) + ' BPM' },
        swing:    { on: false, value: 0.15, min: 0,  max: 0.5, step: 0.01, label: 'Swing',    fmt: v => v.toFixed(2) },
        humanize: { on: false, value: 0.30, min: 0,  max: 1,   step: 0.01, label: 'Humanize', fmt: v => v.toFixed(2) },
        drive:    { on: false, value: 0.20, min: 0,  max: 1,   step: 0.01, label: 'Drive',    fmt: v => v.toFixed(2) },
        // Melody bar length (steps). LOCKED to 16 by DEFAULT (on: true) so most users
        // get uniform 4/4 16-step loops; unlock to let each genome's evolved `length`
        // gene (8–16) run free (odd/irregular bars, Angine-de-Poitrine style).
        length:   { on: true,  value: 16,   min: 8,  max: 16,  step: 1,    label: 'Length',   fmt: v => Math.round(v) + ' steps' },
    },

    // The shared transport clock (also reachable as window.Transport).
    transport: window.Transport,

    // Effective phenotype for rendering: the genome's phenotype with any LOCKED dials
    // overridden. Returns the input untouched when nothing is locked (no copy).
    apply(pheno) {
        if (!pheno) return pheno;
        let out = pheno;
        for (const k in this.dials) {
            const d = this.dials[k];
            if (d.on) {
                if (out === pheno) out = { ...pheno };
                out[k] = d.value;
            }
        }
        return out;
    },

    // True if any dial is currently overriding the genome (used for UI hints).
    anyLocked() { return Object.values(this.dials).some(d => d.on); },

    // Update a dial (lock state or value) and, if a loop is playing, re-render it so
    // the change is heard immediately. Called by the panel.
    update(name, patch) {
        Object.assign(this.dials[name], patch);
        this.refreshPlaying();
        // Most dials are render-stage audio only, but `length` also changes the melody
        // piano-roll VISUAL (which steps are active/dimmed) — so redraw the tiles.
        if (name === 'length') {
            const fw = window.framework;
            if (fw && typeof fw.invalidateAndRender === 'function') fw.invalidateAndRender();
        }
    },

    // Re-trigger the currently-playing loop, if any, so a dial change takes effect
    // without the user re-triggering play. playMIDI() reselects MIDI/synth and
    // reschedules with the effective phenotype (see Individual.playSequenced).
    refreshPlaying() {
        const fw = window.framework;
        const cur = fw && fw.currentlyPlaying;
        if (cur && cur.isPlaying && typeof cur.playMIDI === 'function') cur.playMIDI();
    },
};

/**
 * PerformanceControlsUI — the drawer panel. One row per dial (Lock checkbox, slider,
 * live readout). Attached by the framework (loadExtensions) for individuals returning
 * true from usesPerformanceControls(); it renders only the dials the type declares via
 * performanceDials() (passed in as `dialNames`).
 */
class PerformanceControlsUI {
    constructor(framework, dialNames) {
        this.framework = framework;
        this.dialNames = dialNames && dialNames.length ? dialNames : Object.keys(window.PerformanceControls.dials);
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Performance</h3>' +
            '<div class="hotkey-hint">Lock a dial to drive every loop from here (e.g. hold a tempo to jam over). Unlocked dials come from each genome and keep evolving.</div>';

        const dials = window.PerformanceControls.dials;
        this.dialNames.forEach((name) => { if (dials[name]) section.appendChild(this._row(name, dials[name])); });

        container.appendChild(section);
    }

    _row(name, d) {
        const row = document.createElement('div');
        row.className = 'drum-dial';

        const lock = document.createElement('input');
        lock.type = 'checkbox';
        lock.checked = d.on;
        lock.id = 'perf-dial-' + name;

        const label = document.createElement('label');
        label.htmlFor = lock.id;
        label.className = 'drum-dial-label';
        label.textContent = d.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'perf-slider-' + name;
        slider.min = d.min; slider.max = d.max; slider.step = d.step; slider.value = d.value;
        slider.disabled = !d.on;
        slider.className = 'drum-dial-slider';

        const readout = document.createElement('span');
        readout.id = 'perf-readout-' + name;
        readout.className = 'drum-dial-readout';
        readout.textContent = d.fmt(d.value);

        lock.addEventListener('change', () => {
            slider.disabled = !lock.checked;
            window.PerformanceControls.update(name, { on: lock.checked });
        });
        // Update the readout live while dragging, but only re-render audio on release
        // (change) so continuous dragging doesn't stutter the loop.
        slider.addEventListener('input', () => {
            d.value = parseFloat(slider.value);
            readout.textContent = d.fmt(d.value);
        });
        slider.addEventListener('change', () => {
            window.PerformanceControls.update(name, { value: parseFloat(slider.value) });
        });

        row.appendChild(lock);
        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(readout);
        return row;
    }
}

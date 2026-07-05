/**
 * DrumControls — app-level service + drawer panel for GLOBAL performance dials.
 *
 * Mirrors window.Palette / window.Photo: one shared, instance-agnostic service that
 * every DrumMachineIndividual consults at RENDER time. It exposes the render-stage
 * "style dials" (tempo, swing, humanize, drive) as global overrides so the user can
 * drive the whole population from one place — e.g. LOCK the tempo, then jam a bass
 * line over evolving loops that all stay at that BPM.
 *
 * Why only these dials: they are read while turning the grid into audio (never baked
 * into the genome's grid), so overriding them is free — substitute the value at
 * render, genome untouched. That's the point of "user control *as well as* the
 * genome": each dial's gene still lives in every genome (so variety and inheritance
 * are preserved in the latent), but while a dial is LOCKED the global value shadows
 * it for playback. Unlock and the genome drives it again. (The prior-stage genes —
 * density, syncopation — can't be overridden this way; they shape the grid at
 * generation time, so they're not offered here.)
 *
 * apply(pheno) returns an effective phenotype (a shallow copy with locked dials
 * substituted); DrumMachineIndividual.renderToAudioBuffer renders from that. Changing
 * a locked dial while a loop plays re-renders that loop so the change is audible.
 */
window.DrumControls = {
    // Each dial: on = is the global override engaged; value = the global value.
    // The gene of the same name in each genome is used when on === false.
    dials: {
        bpm:      { on: false, value: 120,  min: 60, max: 180, step: 1,    label: 'Tempo',    fmt: v => Math.round(v) + ' BPM' },
        swing:    { on: false, value: 0.15, min: 0,  max: 0.5, step: 0.01, label: 'Swing',    fmt: v => v.toFixed(2) },
        humanize: { on: false, value: 0.30, min: 0,  max: 1,   step: 0.01, label: 'Humanize', fmt: v => v.toFixed(2) },
        drive:    { on: false, value: 0.20, min: 0,  max: 1,   step: 0.01, label: 'Drive',    fmt: v => v.toFixed(2) },
    },

    // Effective phenotype for rendering: the genome's phenotype with any LOCKED
    // dials overridden. Returns the input untouched when nothing is locked (no copy).
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

    // Free-running global transport clock. So playback keeps a CONTINUOUS loop
    // position: editing a cell (re-render) or switching which individual plays
    // resumes at the current spot instead of snapping back to the downbeat. Phase is
    // time-based (mod the bar length): when every loop shares a tempo (e.g. Tempo
    // locked for a jam) this is a true shared beat grid; across differing tempos it
    // still preserves time continuity, each loop entering at its own phase.
    transport: {
        epoch: null, // ctx.currentTime at which the global timeline began (set once)
        // Where (seconds into a barLen-long loop) playback should begin right now.
        phase(ctx, barLen) {
            if (this.epoch == null || !isFinite(this.epoch)) this.epoch = ctx.currentTime;
            if (!(barLen > 0)) return 0;
            let t = (ctx.currentTime - this.epoch) % barLen;
            return t < 0 ? t + barLen : t;
        },
        reset() { this.epoch = null; }, // start the grid fresh from the next play
    },

    // Update a dial (lock state or value) and, if a loop is playing, re-render it so
    // the change is heard immediately. Called by the panel.
    update(name, patch) {
        Object.assign(this.dials[name], patch);
        this.refreshPlaying();
    },

    // Re-render the currently-playing drum loop, if any, so a dial change takes
    // effect without the user re-triggering play. playMIDI() stops + restarts with a
    // freshly rendered buffer (see DrumMachineIndividual).
    refreshPlaying() {
        const fw = window.framework;
        const cur = fw && fw.currentlyPlaying;
        if (cur && cur.isPlaying && typeof cur.renderToAudioBuffer === 'function') {
            cur.playMIDI();
        }
    },
};

/**
 * DrumControlsUI — the drawer panel. One row per dial: a Lock checkbox, a slider,
 * and a live readout. Attached by the framework (loadExtensions) for individuals
 * that return true from usesDrumControls().
 */
class DrumControlsUI {
    constructor(framework) {
        this.framework = framework;
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Performance</h3>' +
            '<div class="hotkey-hint">Lock a dial to drive every loop from here (e.g. hold a tempo to jam over). Unlocked dials come from each genome and keep evolving.</div>';

        const dials = window.DrumControls.dials;
        Object.keys(dials).forEach((name) => section.appendChild(this._row(name, dials[name])));

        container.appendChild(section);
    }

    _row(name, d) {
        const row = document.createElement('div');
        row.className = 'drum-dial';

        const lock = document.createElement('input');
        lock.type = 'checkbox';
        lock.checked = d.on;
        lock.id = 'drum-dial-' + name;

        const label = document.createElement('label');
        label.htmlFor = lock.id;
        label.className = 'drum-dial-label';
        label.textContent = d.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = d.min; slider.max = d.max; slider.step = d.step; slider.value = d.value;
        slider.disabled = !d.on;
        slider.className = 'drum-dial-slider';

        const readout = document.createElement('span');
        readout.className = 'drum-dial-readout';
        readout.textContent = d.fmt(d.value);

        lock.addEventListener('change', () => {
            slider.disabled = !lock.checked;
            // Lock/unlock changes what's heard, so re-render the playing loop.
            window.DrumControls.update(name, { on: lock.checked });
        });
        // Update the readout live while dragging, but only re-render audio on release
        // (change) so continuous dragging doesn't stutter the loop.
        slider.addEventListener('input', () => {
            d.value = parseFloat(slider.value);
            readout.textContent = d.fmt(d.value);
        });
        slider.addEventListener('change', () => {
            window.DrumControls.update(name, { value: parseFloat(slider.value) });
        });

        row.appendChild(lock);
        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(readout);
        return row;
    }
}

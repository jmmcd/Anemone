/**
 * MelodyIndividual — an evolvable 16-step polyphonic piano-roll (the melodic sibling
 * of DrumMachineIndividual, sharing its step-sequencer machinery).
 *
 * Genome (via PTO): an 8-pitch-row × 16-step grid plus style genes. Rows are the eight
 * degrees of a diatonic scale (default C major, C4..C5, low row at the bottom). Each
 * cell is 0 (rest) or a velocity SEED in [0.6,1]; a held note is a RUN of consecutive
 * on-cells in a row, so note length is expressed directly on the grid (and shows as a
 * joined bar). Chords are allowed (multiple rows on at the same step). Phenotype is
 * { bpm, swing, length, scale[8], grid[8][16] }, where `length` (8–16) is the active
 * bar length — steps past it are latent (dimmed, not played), so the bar length evolves.
 *
 * Style genes (render-stage — read while turning the grid into sound, so overriding
 * them via the global Performance panel is free and the genome is untouched):
 *   bpm (tempo), swing (delay the 16th offbeats). Both honour window.PerformanceControls.
 *
 * Per-cell genes are EXPLICITLY named (hit_r_s categorical, vel_r_s real) exactly like
 * the drum machine, so a direct grid edit folds back into the genome via
 * representation.setGene and keeps evolving — this is what powers click/drag editing in
 * the zoom lightbox. hit_r_s is categorical so PTO's fine mutation FLIPS it (toggles the
 * cell); the velocity seed is a real gene so it creeps smoothly.
 *
 * Playback is unified with the drum machine (Individual.playSequenced): live MIDI when
 * an output is available (notes on channel 1), else a synthesised loop buffer through
 * the shared AudioModality — both entered at the shared Transport phase, so switching
 * or editing resumes in time. ⤓ MIDI export writes exactly the active `length` steps.
 */

// Diatonic scale, low row (r=0) = C4 at the bottom, high row (r=7) = C5 at the top.
const MELODY_SCALE = [60, 62, 64, 65, 67, 69, 71, 72]; // C major
// Relative per-degree prior: tonic / third / fifth / octave land more readily than the
// passing tones, so a random init reads as tonal rather than a uniform cluster.
const MELODY_ROW_PRIOR = [0.9, 0.35, 0.7, 0.35, 0.8, 0.4, 0.35, 0.6];
// Granularity of the hit-probability pool (also the floor/ceiling 1/RES), mirroring the
// drum machine: every cell keeps a {0,1} pool so aligned genes stay set-identical across
// genomes and hand-edits survive replay.
const MELODY_HIT_RES = 40;

const melodyGenerator = (rnd) => {
    const bpm = 80 + rnd.randint(0, 60);        // 80–140 BPM
    const swing = rnd.uniform(0, 0.3);
    const length = rnd.randint(8, 16);          // active bar length in steps

    const grid = [];
    for (let r = 0; r < 8; r++) {
        const prior = MELODY_ROW_PRIOR[r];
        const row = [];
        for (let s = 0; s < 16; s++) {
            // Favour the strong beats so onsets land musically; keep it sparse so it
            // reads as a melody/arp, not a wall of held chords.
            const onbeat = (s % 4 === 0) ? 1.3 : (s % 2 === 0 ? 1.0 : 0.7);
            const pHit = Math.min(1 - 1 / MELODY_HIT_RES, Math.max(1 / MELODY_HIT_RES, prior * 0.15 * onbeat));
            const k = Math.round(pHit * MELODY_HIT_RES);
            const pool = [];
            for (let j = 0; j < MELODY_HIT_RES; j++) pool.push(j < k ? 1 : 0);
            const hit = rnd.choice(pool, { name: 'hit_' + r + '_' + s });   // categorical ⇒ fine mutation FLIPS the bit
            const vraw = rnd.uniform(0, 1, { name: 'vel_' + r + '_' + s });  // velocity seed (real ⇒ smooth creep)
            row.push(hit ? 0.6 + 0.4 * vraw : 0);
        }
        grid.push(row);
    }
    return { bpm, swing, length, scale: MELODY_SCALE.slice(), grid };
};

const melodyRepresentation = new PTORepresentation(melodyGenerator);

class MelodyIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = melodyRepresentation;
        this.genome = genome || this.representation.generateRandom();
        // Shared output modalities (local fallbacks for tests): notes → MIDI, else synth.
        const fw = (typeof window !== 'undefined') && window.framework;
        this.midiModality = (fw && fw.sharedMIDI) || new MIDIModality();
        this.audio = (fw && fw.sharedAudio) || new AudioModality();
        this.isPlaying = false;
    }

    usesColorPalette() { return true; }        // rows are palette-coloured
    usesPerformanceControls() { return true; } // attaches the global Performance panel
    performanceDials() { return ['bpm', 'swing', 'length']; }
    usesMIDISync() { return true; }            // attaches the MIDI Clock Sync panel
    isGridEditable() { return true; }
    // The melody's artefact is the sound (MIDI/audio), not the piano-roll tile.
    usesImageSave() { return false; }

    // Audible MIDI velocity (1–127) from a cell's stored seed (seed ∈ [0.6,1]).
    _velocity(seed) { return Math.max(1, Math.min(127, Math.round(seed * 127))); }

    // Effective bar length in steps: the genome's `length` gene, unless the global
    // "Length" override is locked (the default, forcing 16) — see PerformanceControls.
    _effectiveLength() {
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        return Math.max(1, Math.min(16, Math.round(p.length)));
    }

    // Merge each row's runs of consecutive on-cells (within the active length) into
    // held notes { pitch, velocity, start(step), steps }. This is the phenotype the
    // renderer, the synth and the MIDI export all read.
    getPhenotype() {
        const p = this.phenotype;
        const notes = [];
        if (!p || !p.grid) return notes;
        const L = this._effectiveLength();
        for (let r = 0; r < 8; r++) {
            let s = 0;
            while (s < L) {
                if (p.grid[r][s] > 0) {
                    let e = s;
                    while (e < L && p.grid[r][e] > 0) e++;
                    notes.push({ pitch: p.scale[r], velocity: this._velocity(p.grid[r][s]), start: s, steps: e - s });
                    s = e;
                } else s++;
            }
        }
        return notes;
    }

    // Grid geometry for a W×H canvas — the single source of truth shared by visualize()
    // and cellAtCanvasXY(), so a click always lands on the cell it appears to. Row r is
    // drawn with r=0 (lowest pitch) at the BOTTOM.
    _gridLayout(W, H) {
        const rows = 8, cols = 16;
        const pad = Math.max(2, Math.floor(W * 0.02));
        const cw = (W - 2 * pad) / cols;
        const gridH = H - 2 * pad;
        const chh = gridH / rows;
        return { rows, cols, pad, cw, chh, gridH, yTop: pad };
    }

    _roundRect(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // --- Tile visual: a piano roll (low pitch at the bottom, held notes as bars) -----
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);
        const p = this.phenotype;
        if (!p || !p.grid) return;

        const { rows, cols, pad, cw, chh, gridH, yTop } = this._gridLayout(W, H);
        const L = this._effectiveLength();

        // Shade the quarter-note columns so the beat is legible.
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let s = 0; s < cols; s += 4) ctx.fillRect(pad + s * cw, yTop, cw, gridH);

        // Faint grid lines.
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let r = 0; r <= rows; r++) { const y = yTop + r * chh; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + cols * cw, y); ctx.stroke(); }
        for (let s = 0; s <= cols; s++) { const x = pad + s * cw; ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yTop + gridH); ctx.stroke(); }

        // Held notes: each run of on-cells in a row is one rounded bar.
        for (let r = 0; r < rows; r++) {
            const col = window.Palette.color(r / (rows - 1));
            const y = yTop + (rows - 1 - r) * chh; // low pitch (r=0) at the bottom
            let s = 0;
            while (s < cols) {
                if (p.grid[r][s] > 0) {
                    let e = s;
                    while (e < cols && p.grid[r][e] > 0) e++;
                    const b = 0.3 + 0.7 * (this._velocity(p.grid[r][s]) / 127);
                    const m = Math.min(cw, chh) * 0.14;
                    const x = pad + s * cw + m, w = (e - s) * cw - 2 * m;
                    ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${b})`;
                    this._roundRect(ctx, x, y + m, w, chh - 2 * m, Math.min(6, chh * 0.3, w * 0.5));
                    ctx.fill();
                    s = e;
                } else s++;
            }
        }

        // Dim the inactive steps beyond the active bar length, and mark the boundary.
        if (L < cols) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(pad + L * cw, yTop, (cols - L) * cw, gridH);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(pad + L * cw, yTop); ctx.lineTo(pad + L * cw, yTop + gridH); ctx.stroke();
        }
    }

    // --- Direct cell editing (folded back into the genome, like the drum machine) ----
    cellAtCanvasXY(canvas, px, py) {
        const { rows, cols, pad, cw, chh, yTop } = this._gridLayout(canvas.width, canvas.height);
        const s = Math.floor((px - pad) / cw);
        const rowFromTop = Math.floor((py - yTop) / chh);
        const c = (rows - 1) - rowFromTop;      // low pitch (r=0) at the bottom
        if (s < 0 || s >= cols || c < 0 || c >= rows) return null;
        return { c, s };
    }

    cellOn(c, s) {
        const p = this.phenotype;
        return !!(p && p.grid && p.grid[c][s] > 0);
    }

    // Turn a cell on/off by forcing its hit gene, and replace the genome so the edit is
    // heritable (a freshly-on cell reuses its existing velocity-seed gene).
    setCellHit(c, s, on) {
        this.genome = melodyRepresentation.setGene(this.genome, `hit_${c}_${s}`, on ? 1 : 0);
        this.invalidateImageCache();
    }

    midiToNoteName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[midi % 12] + (Math.floor(midi / 12) - 1);
    }

    describeExtra() {
        const p = this.phenotype;
        if (!p || !p.grid) return '';
        const L = this._effectiveLength();
        let s = `<span class="genome-label">Feel:</span> ${Math.round(p.bpm)} BPM · swing ${p.swing.toFixed(2)} · length ${L} steps\n`;
        for (let r = 7; r >= 0; r--) { // high pitch first, matching the visual
            const name = this.midiToNoteName(p.scale[r]).padStart(3, ' ');
            let line = '';
            for (let step = 0; step < 16; step++) line += step >= L ? '·' : (p.grid[r][step] > 0 ? '█' : '·');
            s += '  ' + name + ' ' + line + '\n';
        }
        return s;
    }

    // --- Render one loop to an AudioBuffer (the synth fallback when there's no MIDI) --
    renderToAudioBuffer() {
        const ctx = window.AudioClip.context();
        const sr = ctx.sampleRate;
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        const beat = 60 / p.bpm, stepSec = beat / 4;         // 16th note
        const barSec = Math.max(stepSec, this._effectiveLength() * stepSec);
        const N = Math.max(1, Math.round(barSec * sr));
        const buffer = ctx.createBuffer(1, N, sr);
        const buf = buffer.getChannelData(0);
        const swung = st => st % 2 === 1;                    // delay the 16th offbeats
        // Short attack + release ramps so every note starts and ends at zero amplitude
        // — without them the note cuts off mid-decay (and mid-waveform) and clicks, at
        // the note end and at the loop seam.
        const atkN = Math.max(1, Math.round(0.005 * sr));    // 5 ms attack
        const relN = Math.max(1, Math.round(0.012 * sr));    // 12 ms release

        for (const n of this.getPhenotype()) {
            const startSec = n.start * stepSec + (swung(n.start) ? p.swing * stepSec * 0.66 : 0);
            const durSec = n.steps * stepSec;
            const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
            const amp = 0.25 * (n.velocity / 127);
            const start = Math.max(0, Math.round(startSec * sr));
            const len = Math.round(durSec * sr);
            // Clamp the written span to the buffer end, and run the release relative to
            // THAT end — so a note pushed past the loop boundary by swing/rounding still
            // fades to zero instead of being hard-cut (which clicked at the loop seam,
            // most visibly on a <16-step loop where the last step is often swung).
            const endI = Math.min(len, N - start);
            for (let i = 0; i < endI; i++) {
                const t = i / sr;
                // A soft tone: fundamental + a little second harmonic, with a gentle decay
                // across the note length and attack/release fades to silence at both ends.
                let env = Math.exp(-t / (durSec * 0.9 + 0.05));
                if (i < atkN) env *= i / atkN;               // attack ramp up from 0
                const rem = endI - i;
                if (rem < relN) env *= rem / relN;           // release to zero by the clamped end
                const w = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(4 * Math.PI * freq * t);
                buf[start + i] += w * amp * env;
            }
        }
        // Peak-normalise so dense chords don't clip.
        let peak = 0; for (let i = 0; i < N; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
        if (peak > 0.99) { const g = 0.99 / peak; for (let i = 0; i < N; i++) buf[i] *= g; }
        // Loop-seam declick, shared with the drum machine (belt-and-suspenders on top of
        // the per-note release above — see AudioModality.declickTail).
        AudioModality.declickTail(buf, sr);
        return buffer;
    }

    // --- MIDI export / live-MIDI sequence ---------------------------------------------
    // Emit the active-length loop as a note sequence (ticks). Honours the global tempo /
    // swing overrides. channel 0 (MIDI channel 1); loopTicks = the active bar length.
    toMIDISequence() {
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        const ppq = 96, stepTicks = ppq / 4;
        const swung = st => st % 2 === 1;
        const notes = this.getPhenotype().map(n => {
            const startTicks = n.start * stepTicks + (swung(n.start) ? p.swing * stepTicks * 0.66 : 0);
            return {
                pitch: n.pitch,
                velocity: n.velocity,
                start: Math.max(0, Math.round(startTicks)),
                duration: Math.max(1, Math.round(n.steps * stepTicks)),
                channel: 0,
            };
        });
        return { bpm: p.bpm, ppq, loopTicks: this._effectiveLength() * stepTicks, notes };
    }

    // --- Playback (unified step-sequencer path: live MIDI else synth) -----------------
    playMIDI() { this.playSequenced(); }
    stopMIDI() { this.stopSequenced(); }
}

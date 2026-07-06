/**
 * DrumMachineIndividual — an evolvable step-sequencer drum loop.
 *
 * Genome (via PTO): an 8-channel × 16-step grid plus a set of higher-order "style"
 * genes. Channels are kick / snare / closed-hat / open-hat / clap / rim / tom /
 * cowbell. Each cell is 0 (rest) or a velocity SEED in [0.6,1]; the audible
 * velocity is derived at render from the seed + the `accent` gene + metrical
 * weight. The phenotype is { bpm, swing, swingTarget, accent, humanize, drive,
 * syncopation, push, density[8], grid[8][16] }.
 *
 * Two families of gene, split by WHERE they act (this determines how they behave
 * under mutation):
 *   - Render-stage "style dials" — read while turning the grid into audio, so
 *     mutating one always changes the output (continuous controls, like tempo):
 *       swing, swingTarget (8th vs 16th feel), accent (flat↔metrical velocities),
 *       humanize (tight↔loose timing/velocity), push (one pocket gene, snare
 *       laid-back↔rushed — the common high-impact case), drive (clean↔lo-fi).
 *   - Prior-stage bias — consumed in the generator to shape the hit-pool, so they
 *     bias the *initial/inherited* pattern but not the mutation dynamics:
 *       density[] (per-channel busyness), syncopation (on-beat↔off-beat emphasis).
 *
 * The point of interest is the PRIOR. A uniform random grid sounds like noise,
 * because drum patterns have strong metrical structure. A PTO generator can bake
 * that structure in probabilistically (where a grammar only gives *structural*
 * priors): each cell's hit is a *categorical* gene — rnd.choice over a small 0/1
 * pool whose proportion of 1s is that cell's hit probability, pHit = CHANNEL_PRIOR
 * × density × a syncopation factor. So random init already lands a backbeat snare
 * / downbeat kick / hats on the grid.
 *
 * Why categorical and not "uniform < threshold"? Because PTO's fine mutation
 * treats each gene TYPE differently. A real gene (uniform) mutates by Gaussian
 * *creep* — a tiny step — so a hit encoded as a thresholded uniform almost never
 * crosses its threshold and mutation barely changes the pattern. A categorical
 * gene mutates by resampling to a *different* value (RandomCat._fineMutation),
 * which for a 0/1 pool simply FLIPS the bit — so mutating a cell reliably toggles
 * its hit. The velocity seed stays a real gene (uniform) so it creeps smoothly.
 * Both genes are always drawn, so the trace is fixed-length and crossover/mutation
 * align cleanly.
 *
 * pHit is clamped to [1/RES, 1−1/RES] so every cell's pool always holds both a 0
 * and a 1 — set {0,1}. That keeps aligned genes set-identical across genomes even
 * though density/syncopation change the COUNTS of 1s, which is all PTO's
 * categorical operators need (the counts only bias init sampling, not
 * mutation/crossover) — this is what lets density and syncopation vary safely
 * under crossover. EVERY cell of EVERY channel floors this way (no exceptions), so
 * even a prior-0 cell can throw a 1/RES surprise hit and roam. The colour channels
 * (clap/rim/tom/cowbell) differ only in carrying LOW priors (and a quieter mix), so
 * tom/rim/cowbell land in varied spots yet are usually sparse/absent, with clap
 * about half as likely as the snare. (Earlier revisions LOCKED colour true-zero
 * cells to pool {0} so a channel could vanish entirely; that made those cells
 * un-editable/frozen, so it's gone — universal flooring is simpler and makes every
 * cell uniformly editable, below.)
 *
 * EDITABLE LOOPS: each cell draws two EXPLICITLY-NAMED genes (hit_c_s categorical,
 * vel_c_s real), so a direct user edit of the grid folds straight back into the
 * genome via representation.setGene(name, val): the forced value survives replay
 * (the regenerated pool matches) and — because every pool is {0,1} — keeps evolving
 * like any other gene. This is what powers cell-by-cell editing in the zoom
 * lightbox while evolution continues from the edited genome.
 *
 * Rendering is Web Audio, but the loop is mixed by hand into one AudioBuffer
 * (cached voice one-shots added at step times) — synchronous, no
 * OfflineAudioContext. Playback loops that buffer through the shared AudioContext
 * (window.AudioClip.context()), reusing the framework's sound-individual play/stop
 * contract (playMIDI/stopMIDI → ▶ button). The same buffer is what AudioExport
 * writes to .wav.
 */

// 16th-note metrical weights for one 4/4 bar (Lerdahl–Jackendoff-ish): downbeat
// strongest, then beat 3, then 2 & 4, then 8ths, then 16ths. Shapes both which
// cells are likely hits, how they're accented, and how syncopation reweights them.
const DRUM_METRICAL = [1, .2, .5, .25, .8, .2, .5, .25, .9, .2, .5, .25, .8, .2, .5, .3];
// Base P(hit) per channel × step — the genre prior, scaled by density & syncopation.
// Core kit on strong structure; the extra colours (clap/rim/tom/cowbell) are
// sparser accents so they don't overwhelm.
const DRUM_CHANNEL_PRIOR = {
    kick:    [.9, 0, 0, 0, .1, 0, 0, .3, .8, 0, .3, .4, .1, 0, 0, 0],
    snare:   [0, 0, .1, 0, .9, 0, .1, 0, 0, .1, 0, 0, .9, 0, .2, 0],
    chh:     [.9, .3, .6, .3, .8, .3, .6, .3, .85, .3, .6, .3, .8, .3, .6, .4],
    ohh:     [0, 0, .3, 0, 0, 0, .3, 0, 0, 0, .3, 0, 0, 0, .6, 0],
    clap:    [0, 0, .05, 0, .45, 0, .05, 0, 0, .05, 0, 0, .45, 0, .1, 0], // ≈ half the snare
    // Colour channels: low probability spread across ALL cells (free placement),
    // with light accents for character. Low RES floor keeps them rare overall.
    rim:     [.022, .02, .04, .02, .03, .02, .04, .02, .025, .02, .04, .02, .03, .02, .045, .025],
    tom:     [.02, .02, .022, .025, .02, .025, .03, .035, .02, .025, .035, .04, .022, .04, .05, .05],
    cowbell: [.04, .02, .04, .02, .035, .02, .03, .02, .04, .02, .04, .02, .035, .02, .03, .02],
};
const DRUM_CHANNELS = ['kick', 'snare', 'chh', 'ohh', 'clap', 'rim', 'tom', 'cowbell'];
// Granularity of the hit-probability pool. Sets how finely pHit is quantised at
// init AND the floor/ceiling hit probability (1/RES): with the [1/RES, 1−1/RES]
// clamp, every "sometimes" cell has at least a 1/RES chance of a hit and of a
// rest. It's fairly high so the floor is LOW (~2%): that lets the colour channels
// spread genuinely-low priors across many cells (free placement) yet stay rare —
// a lower RES would floor those cells up and make the channels too busy.
const DRUM_HIT_RES = 48;
// Target output loudness (RMS) the rendered loop is normalised to, so tempo,
// density and drive don't change how loud a pattern is. ~0.16 leaves headroom.
const DRUM_TARGET_RMS = 0.16;

const drumMachineGenerator = (rnd) => {
    // Defaults kept deliberately calmer (less manic): moderate tempo, gentle swing,
    // mostly-clean drive. Bigger ranges are still reachable by evolution/editing.
    const bpm = 70 + rnd.randint(0, 60);        // 70–130 BPM
    const swing = rnd.uniform(0, 0.22);         // subtle shuffle by default
    const swingTarget = rnd.choice([8, 16]);    // swing the 8th offbeats or the 16ths
    const accent = rnd.uniform(0, 1);           // flat ↔ strongly metrical velocities
    const humanize = rnd.uniform(0, 1);         // tight ↔ loose timing & velocity
    const drive = rnd.uniform(0, 0.5);          // clean ↔ mildly saturated (rarely full lo-fi)
    const syncopation = rnd.uniform(0, 1);      // on-beat ↔ off-beat emphasis (0.5 neutral)
    const push = rnd.uniform(-1, 1);            // ONE pocket gene: snare rushed(-)/laid-back(+)
    const length = rnd.randint(8, 16);          // active bar length in steps (latent unless the Length override is unlocked)
    const g = (syncopation - 0.5) * 2;          // -1..1

    const density = [];
    const grid = [];
    for (let c = 0; c < 8; c++) {
        const dens = 0.6 + rnd.uniform(0, 0.9);  // higher-order per-channel busyness
        density.push(dens);
        const prior = DRUM_CHANNEL_PRIOR[DRUM_CHANNELS[c]];
        const row = [];
        for (let s = 0; s < 16; s++) {
            // Syncopation lifts off-beat priors and lowers on-beat ones (or vice
            // versa). EVERY cell of EVERY channel floors to a {0,1} pool (no locked
            // cells): colour channels differ only by carrying LOW priors, so they
            // stay sparse but can still roam AND be hand-edited durably (see header).
            const syncFactor = 1 + g * (0.5 - DRUM_METRICAL[s]) * 1.2;
            const pHit = Math.min(1 - 1 / DRUM_HIT_RES, Math.max(1 / DRUM_HIT_RES, prior[s] * dens * syncFactor));
            const k = Math.round(pHit * DRUM_HIT_RES);
            const pool = [];
            for (let j = 0; j < DRUM_HIT_RES; j++) pool.push(j < k ? 1 : 0);
            // Explicit stable names make each cell individually addressable, so a
            // direct user edit can be folded back into the trace via
            // representation.setGene('hit_c_s'/'vel_c_s', …) — see the header note
            // on editable loops. (The grid is fixed 8×16, so stable names align
            // cleanly across genomes; the structural-naming compiler appends its own
            // {name} as a later arg, which rnd.choice/uniform ignore, so ours wins.)
            const hit = rnd.choice(pool, { name: 'hit_' + c + '_' + s });   // categorical ⇒ fine mutation FLIPS the bit
            const vraw = rnd.uniform(0, 1, { name: 'vel_' + c + '_' + s });  // velocity seed (real ⇒ smooth creep)
            row.push(hit ? 0.6 + 0.4 * vraw : 0); // store SEED; accent is applied at render
        }
        grid.push(row);
    }
    return { bpm, swing, swingTarget, accent, humanize, drive, syncopation, push, length, density, grid };
};

const drumMachineRepresentation = new PTORepresentation(drumMachineGenerator);

// --- Drum voice synthesis (module-level, cached per sample rate) --------------
// Short one-shot Float32Arrays, mixed into the loop by hand. Identical for every
// individual, so synthesised once.
const _drumVoiceCache = {};
function drumVoices(sampleRate) {
    if (_drumVoiceCache[sampleRate]) return _drumVoiceCache[sampleRate];
    const sr = sampleRate;
    const env = (n, a, d) => { const e = new Float32Array(n); const at = Math.floor(a * sr); for (let i = 0; i < n; i++) { let g = Math.exp(-i / sr / d); if (i < at) g *= i / at; e[i] = g; } return e; };
    const kick = () => { const n = Math.floor(0.30 * sr), s = new Float32Array(n), e = env(n, 0.001, 0.14); let ph = 0; for (let i = 0; i < n; i++) { const f = 120 * Math.exp(-i / sr / 0.03) + 45; ph += 2 * Math.PI * f / sr; s[i] = Math.sin(ph) * e[i] * 0.95; } return s; };
    const snare = () => { const n = Math.floor(0.18 * sr), s = new Float32Array(n), e = env(n, 0.001, 0.08); for (let i = 0; i < n; i++) s[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 185 * i / sr) * 0.5 * Math.exp(-i / sr / 0.05)) * e[i] * 0.8; return s; };
    const hat = (d) => { const n = Math.floor(d * sr), s = new Float32Array(n), e = env(n, 0.0005, d * 0.4); let prev = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; s[i] = (w - prev) * e[i] * 0.35; prev = w; } return s; };
    // 909-ish clap: three sharp noise transients (the "hands") ~9 ms apart plus a
    // diffuse reverb-like tail, then BAND-passed around ~1.1 kHz. The band-pass is
    // what gives a clap its body — an earlier high-pass here made it hiss like an
    // open hat. Uses a Chamberlin state-variable filter, taking the band output.
    const clap = () => {
        const n = Math.floor(0.20 * sr), s = new Float32Array(n);
        for (const bt of [0, 0.009, 0.018]) { const off = Math.floor(bt * sr); for (let i = 0; off + i < n; i++) s[off + i] += (Math.random() * 2 - 1) * Math.exp(-i / sr / 0.006); }
        for (let i = 0; i < n; i++) s[i] = s[i] * 0.7 + (Math.random() * 2 - 1) * Math.exp(-i / sr / 0.12) * 0.18;
        const fc = 1100, f = 2 * Math.sin(Math.PI * fc / sr), q = 0.6; // q = damping (lower = more resonant)
        let low = 0, band = 0;
        for (let i = 0; i < n; i++) {
            low += f * band;
            const high = s[i] - low - q * band;
            band += f * high;
            s[i] = band * 1.1;
        }
        return s;
    };
    // Rimshot / side-stick: a bright click plus a short tonal ping.
    const rim = () => { const n = Math.floor(0.06 * sr), s = new Float32Array(n), e = env(n, 0.0003, 0.018); for (let i = 0; i < n; i++) s[i] = (Math.sin(2 * Math.PI * 1700 * i / sr) * 0.5 + (Math.random() * 2 - 1) * 0.5) * e[i] * 0.8; return s; };
    // Mid tom: a pitched membrane (like the kick, tuned higher, longer).
    const tom = () => { const n = Math.floor(0.30 * sr), s = new Float32Array(n), e = env(n, 0.001, 0.16); let ph = 0; for (let i = 0; i < n; i++) { const f = 180 * Math.exp(-i / sr / 0.08) + 110; ph += 2 * Math.PI * f / sr; s[i] = Math.sin(ph) * e[i] * 0.85; } return s; };
    // 808-ish cowbell: two detuned square tones.
    const cowbell = () => { const n = Math.floor(0.20 * sr), s = new Float32Array(n), e = env(n, 0.001, 0.09); let p1 = 0, p2 = 0; for (let i = 0; i < n; i++) { p1 += 2 * Math.PI * 540 / sr; p2 += 2 * Math.PI * 800 / sr; s[i] = ((Math.sin(p1) >= 0 ? 1 : -1) * 0.5 + (Math.sin(p2) >= 0 ? 1 : -1) * 0.5) * e[i] * 0.4; } return s; };
    const voices = { kick: kick(), snare: snare(), chh: hat(0.045), ohh: hat(0.4), clap: clap(), rim: rim(), tom: tom(), cowbell: cowbell() };
    // Each voice's exponential envelope ends at ~8–11% amplitude, so a voice whose tail
    // lands mid-loop steps to silence and clicks (most audibly the frequent closed hat).
    // Fade every voice's tail to zero once — same shared helper as the loop-seam declick.
    for (const k in voices) AudioModality.declickTail(voices[k], sr, 4);
    _drumVoiceCache[sampleRate] = voices;
    return voices;
}

// Row indices whose voices ring freely vs. the choking hi-hat bus.
const DRUM_FREE_CHANNELS = [0, 1, 4, 5, 6, 7]; // kick, snare, clap, rim, tom, cowbell
const DRUM_HAT_CHANNELS = [2, 3];              // chh, ohh — one physical hat (choke)
// Per-channel mix gain: the four colour voices sit at half level so they read as
// accents rather than lead (relative levels survive the RMS normalise).
const DRUM_CHANNEL_GAIN = [1, 1, 1, 1, 0.5, 0.5, 0.3, 0.3]; // tom/cowbell sit further back

class DrumMachineIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = drumMachineRepresentation;
        this.genome = genome || this.representation.generateRandom();
        // Shared buffer/graph playback modality (local fallback for tests).
        this.audio = (typeof window !== 'undefined' && window.framework && window.framework.sharedAudio) || new AudioModality();
        this.isPlaying = false;
    }

    usesColorPalette() { return true; }        // rows are palette-coloured
    usesPerformanceControls() { return true; } // attaches the global Performance panel
    performanceDials() { return ['bpm', 'swing', 'humanize', 'drive', 'length']; }

    // Effective bar length in steps: the genome's `length` gene, unless the global
    // "Length" override is locked (the default, forcing 16). Shared concept with the
    // melody grid (see PerformanceControls); the [ and ] hotkeys drive it.
    _effectiveLength() {
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        return Math.max(1, Math.min(16, Math.round(p.length != null ? p.length : 16)));
    }

    // 8 channels with the colour rows now spread over all cells is ~117 mutable
    // hit genes. Scale the framework's rate to keep a single-parent offspring
    // around ~7 flips (the churn that felt right); at the full rate it would be ~12.
    mutate(rate = 0.1) {
        super.mutate(rate * 0.6);
    }

    // Audible velocity from a cell's stored seed: the `accent` gene blends between
    // flat (velocity ~ seed only) and strongly metrical (accents loud, ghosts
    // quiet). Render-stage, so changing `accent` always changes the output. No
    // humanize here — that jitter is added per-hit at render (kept out so the tile
    // visual is stable).
    _velocity(seed, s) {
        const a = this.phenotype.accent;
        const accentTerm = a * DRUM_METRICAL[s] + (1 - a) * 0.6;
        return Math.min(1, 0.35 + 0.6 * accentTerm * seed);
    }

    // Grid geometry for a W×H canvas — the single source of truth shared by
    // visualize() (drawing) and cellAtCanvasXY() (hit-testing), so a click always
    // lands on the cell it appears to. Row c is drawn kick (c=0) at the BOTTOM.
    _gridLayout(W, H) {
        const rows = 8, cols = 16;
        const pad = Math.max(2, Math.floor(W * 0.02));
        const cw = (W - 2 * pad) / cols;
        const gridH = H - 2 * pad;              // 8 rows fill the padded height
        const chh = gridH / rows;
        return { rows, cols, pad, cw, chh, gridH, yTop: pad };
    }

    // --- Tile visual: a step-sequencer grid (kick at the bottom) ----------------
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

        for (let c = 0; c < rows; c++) {
            const col = window.Palette.color(c / (rows - 1));
            const y = yTop + (rows - 1 - c) * chh; // kick (c=0) at the bottom
            for (let s = 0; s < cols; s++) {
                const x = pad + s * cw;
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.strokeRect(x, y, cw, chh);
                const seed = p.grid[c][s];
                if (seed > 0) {
                    // Spread the ~[0.4,0.95] velocity range across a wider brightness
                    // band so per-hit dynamics read clearly (was a narrow, flat band).
                    const v = this._velocity(seed, s);
                    const b = 0.22 + 0.78 * Math.max(0, Math.min(1, (v - 0.4) / 0.55));
                    ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${b})`;
                    const m = Math.min(cw, chh) * 0.15;
                    ctx.fillRect(x + m, y + m, cw - 2 * m, chh - 2 * m);
                }
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

    // --- Direct cell editing (folded back into the genome) ----------------------
    // The tile visual is a real step sequencer, so the framework lets the user
    // click/drag it in the zoom lightbox. Each edit is written to the addressable
    // per-cell genes (hit_c_s / vel_c_s) via representation.setGene, so evolution
    // continues from the edited genome (see the header's EDITABLE LOOPS note).
    isGridEditable() { return true; }

    // Map a canvas pixel (already in canvas coordinate space) to { c, s }, or null
    // if outside the grid. Inverse of the layout used by visualize().
    cellAtCanvasXY(canvas, px, py) {
        const { rows, cols, pad, cw, chh, yTop } = this._gridLayout(canvas.width, canvas.height);
        const s = Math.floor((px - pad) / cw);
        const rowFromTop = Math.floor((py - yTop) / chh);
        const c = (rows - 1) - rowFromTop;      // kick (c=0) at the bottom
        if (s < 0 || s >= cols || c < 0 || c >= rows) return null;
        return { c, s };
    }

    cellOn(c, s) {
        const p = this.phenotype;
        return !!(p && p.grid && p.grid[c][s] > 0);
    }

    // Turn a cell on or off by forcing its hit gene, and replace this individual's
    // genome with the result so the change is heritable. A freshly-turned-on cell
    // reuses its existing velocity-seed gene (already in the trace), so it inherits
    // a sensible dynamic rather than a flat default.
    setCellHit(c, s, on) {
        this.genome = drumMachineRepresentation.setGene(this.genome, `hit_${c}_${s}`, on ? 1 : 0);
        this.invalidateImageCache();
    }

    describeExtra() {
        const p = this.phenotype;
        if (!p || !p.grid) return '';
        const label = ['K', 'S', 'h', 'o', 'C', 'R', 'T', 'b'];
        const L = this._effectiveLength();
        let s = `<span class="genome-label">Feel:</span> ${Math.round(p.bpm)} BPM · swing ${p.swing.toFixed(2)} (${p.swingTarget === 16 ? '16th' : '8th'}) · accent ${p.accent.toFixed(2)} · humanize ${p.humanize.toFixed(2)} · drive ${p.drive.toFixed(2)} · sync ${p.syncopation.toFixed(2)} · length ${L}\n`;
        p.grid.forEach((row, c) => {
            s += '  ' + label[c] + ' ' + row.map((v, i) => (i >= L ? '·' : (v > 0 ? (this._velocity(v, i) > 0.66 ? 'X' : 'x') : '·'))).join('') + '\n';
        });
        return s;
    }

    // --- Render one bar to an AudioBuffer (synchronous hand-mix) ----------------
    // Also the entry point AudioExport uses to write a .wav.
    renderToAudioBuffer() {
        const ctx = window.AudioClip.context();
        const sr = ctx.sampleRate;
        // Apply any GLOBAL performance overrides (tempo/swing/humanize/drive locked
        // in the Performance panel). Render-stage only: the genome is untouched, so
        // unlocking restores the per-genome feel. accent stays from the genome (read
        // via _velocity, which isn't overridable).
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        const L = this._effectiveLength();          // active steps (bar length)
        const beat = 60 / p.bpm, step = beat / 4, bar = L * step; // step = one 16th
        const N = Math.max(1, Math.round(bar * sr));
        const buffer = ctx.createBuffer(1, N, sr);
        const buf = buffer.getChannelData(0);
        const voices = drumVoices(sr);

        // Swing target: delay the 16th offbeats, or the 8th offbeats.
        const swung = s => (p.swingTarget === 16 ? (s % 2 === 1) : (s % 4 === 2));
        const swingFac = p.swingTarget === 16 ? 0.66 : 1.3;
        const MAX_PUSH = 0.008, MAX_JIT = 0.004; // seconds

        // Onset sample of channel c's step s: base grid time + swing + (snare only)
        // the pocket push/pull + a per-hit humanize jitter.
        const startAt = (c, s) => {
            let t = s * step + (swung(s) ? p.swing * step * swingFac : 0);
            if (c === 1) t += p.push * MAX_PUSH;   // push/pull the snare only
            t += (Math.random() * 2 - 1) * p.humanize * MAX_JIT;
            const i = Math.round(t * sr);
            return i < 0 ? 0 : i;
        };
        // Audible velocity: accent-shaped seed + a per-hit humanize jitter.
        const cellVel = (c, s) => {
            let v = this._velocity(p.grid[c][s], s) * DRUM_CHANNEL_GAIN[c] * (1 + (Math.random() * 2 - 1) * p.humanize * 0.15);
            return v < 0 ? 0 : v > 1 ? 1 : v;
        };

        // Free-ringing voices (kick/snare/clap/rim/tom/cowbell) mix additively.
        for (const c of DRUM_FREE_CHANNELS) {
            const sig = voices[DRUM_CHANNELS[c]];
            for (let s = 0; s < L; s++) {
                if (p.grid[c][s] <= 0) continue;
                const vel = cellVel(c, s), start = startAt(c, s);
                for (let k = 0; k < sig.length && start + k < N; k++) buf[start + k] += sig[k] * vel;
            }
        }

        // Hi-hats share one physical object: any hat hit (closed or open) chokes the
        // previous one. Gather all hat events, sort by time, and truncate each at the
        // next hat's onset (short release fade so the cut doesn't click).
        const hatEvents = [];
        for (const c of DRUM_HAT_CHANNELS) {
            const sig = voices[DRUM_CHANNELS[c]];
            for (let s = 0; s < L; s++) {
                if (p.grid[c][s] > 0) hatEvents.push({ start: startAt(c, s), sig, vel: cellVel(c, s) });
            }
        }
        hatEvents.sort((a, b) => a.start - b.start);
        const fadeN = Math.max(1, Math.floor(0.004 * sr)); // 4 ms release at a choke
        for (let i = 0; i < hatEvents.length; i++) {
            const ev = hatEvents[i];
            const next = i + 1 < hatEvents.length ? hatEvents[i + 1].start : N;
            const room = next - ev.start;                   // samples until the next hat
            const len = Math.min(ev.sig.length, room, N - ev.start);
            const fade = room < ev.sig.length ? Math.min(len, fadeN) : 0; // fade only if cut short
            for (let k = 0; k < len; k++) {
                const g = (fade && k > len - fade) ? (len - k) / fade : 1;
                buf[ev.start + k] += ev.sig[k] * ev.vel * g;
            }
        }

        // Drive: saturate harder and, at higher settings, bit-crush toward lo-fi.
        const driveGain = 1 + p.drive * 5;
        const bits = p.drive > 0.02 ? Math.max(3, Math.round(16 - p.drive * 13)) : 16;
        const levels = Math.pow(2, bits);
        let sumsq = 0, peak = 0;
        for (let i = 0; i < N; i++) {
            let x = Math.tanh(buf[i] * driveGain);
            if (bits < 16) x = Math.round(x * levels) / levels; // bit-crush
            buf[i] = x;
            sumsq += x * x; const a = Math.abs(x); if (a > peak) peak = a;
        }
        // Normalise to a target LOUDNESS (RMS), not peak: saturation raises RMS at
        // equal peak, so peak-normalising would let drive just get louder. A peak
        // guard then keeps sparse/peaky loops from clipping.
        const rms = Math.sqrt(sumsq / N);
        let gain = rms > 1e-6 ? DRUM_TARGET_RMS / rms : 1;
        if (peak * gain > 0.98) gain = 0.98 / peak;
        for (let i = 0; i < N; i++) buf[i] *= gain;
        // Fade the loop seam so truncated voice tails don't click on repeat (shared
        // with the melody synth — see AudioModality.declickTail).
        AudioModality.declickTail(buf, sr);
        return buffer;
    }

    // --- MIDI export (window.MidiExport) ----------------------------------------
    // Emit the loop as a note sequence for a Standard MIDI File. Deterministic:
    // reuses the render-stage timing (16th grid + swing + snare push + accent
    // velocities, with any locked Performance override) but DROPS the random
    // humanize jitter so the file reproduces exactly. Rows map to General MIDI
    // percussion on channel 9 (the GM drum channel).
    toMIDISequence() {
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        const ppq = 96, step = ppq / 4;            // one 16th note in ticks
        // Absolute-seconds offsets (push) → ticks, via the bar's tick/second rate.
        const secToTicks = ppq * p.bpm / 60;
        const MAX_PUSH = 0.008;                     // seconds (matches renderToAudioBuffer)

        const swung = s => (p.swingTarget === 16 ? (s % 2 === 1) : (s % 4 === 2));
        const swingFac = p.swingTarget === 16 ? 0.66 : 1.3;
        // General MIDI percussion note per channel (kick, snare, chh, ohh, clap, rim, tom, cowbell).
        const GM = [36, 38, 42, 46, 39, 37, 47, 56];

        const L = this._effectiveLength();
        const notes = [];
        for (let c = 0; c < 8; c++) {
            for (let s = 0; s < L; s++) {
                const seed = p.grid[c][s];
                if (seed <= 0) continue;
                let t = s * step + (swung(s) ? p.swing * step * swingFac : 0);
                if (c === 1) t += p.push * MAX_PUSH * secToTicks; // snare pocket
                const vel = Math.round(this._velocity(seed, s) * DRUM_CHANNEL_GAIN[c] * 127);
                notes.push({ pitch: GM[c], velocity: Math.max(1, Math.min(127, vel)),
                    start: Math.max(0, Math.round(t)), duration: Math.round(step), channel: 9 });
            }
        }
        // loopTicks = the active bar length; the live-MIDI player loops on it.
        return { bpm: p.bpm, ppq, loopTicks: L * step, notes };
    }

    // --- Playback (framework sound-individual interface) -----------------------
    // Unified step-sequencer playback (base Individual.playSequenced): live MIDI to
    // GM percussion when an output is available, else the synthesised loop buffer
    // (renderToAudioBuffer) through the shared AudioModality — both entered at the
    // shared Transport phase.
    playMIDI() { this.playSequenced(); }
    stopMIDI() { this.stopSequenced(); }
}

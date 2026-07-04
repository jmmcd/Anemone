/**
 * AudioClip — an app-level, individual-agnostic audio service (mirrors Photo).
 *
 * `window.AudioClip` holds ONE source clip shared by every AudioFilterIndividual.
 * The clip is deliberately NOT part of any genome: individuals evolve an audio
 * *effects graph*, and all of them filter this same shared clip. Replacing the
 * clip bumps a version counter and invalidates render caches, but leaves the
 * population (and its evolutionary history) untouched — so the user can swap in a
 * new clip and keep evolving the filters they already have.
 *
 * The default clip is the Amen break (assets/cw_amen01_175.wav) — fetched and
 * decoded when possible; if that fails (offline, or the file:// scheme where fetch
 * of a local file is blocked) a procedural drum loop is synthesised in JS as the
 * fallback — mirroring how Photo falls back to a generated gradient. Either way we
 * end up with a decoded AudioBuffer, giving us both playback and waveform samples.
 *
 * A single shared (lazily created) AudioContext backs playback for every
 * individual, mirroring the single shared MIDIModality: only one individual drives
 * it at a time (the framework stops the current one when another starts).
 */

const DEFAULT_CLIP_URL = 'assets/cw_amen01_175.wav';

class AudioClip {
    constructor() {
        this._version = 0;
        this._userLoaded = false;
        this._name = 'breakbeat (synth)';
        this._buffer = null;                 // decoded AudioBuffer (null until ready)
        this._ctx = null;                    // shared AudioContext (lazy)
        this._peakCache = new Map();         // buckets → {min,max} arrays
        this._peakVersion = -1;

        // Install a procedural loop immediately so the type is usable offline and
        // before the asset arrives, then upgrade to the real asset if we can fetch it.
        this._buffer = this._synthLoop(this.context());
        this._loadDefault();
    }

    /** Bumps whenever the source changes — used in render cache keys. */
    version() { return this._version; }

    /** Display name of the current source. */
    name() { return this._name; }

    /** True once the *user* has loaded their own clip (vs. the default). */
    hasClip() { return this._userLoaded; }

    /** The decoded source AudioBuffer (or null before anything is ready). */
    buffer() { return this._buffer; }

    /** Shared AudioContext, created lazily. Callers resume() it on a user gesture. */
    context() {
        if (!this._ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this._ctx = new Ctx();
        }
        return this._ctx;
    }

    /**
     * Min/max waveform peaks over `buckets` columns of channel 0, cached per size
     * for the current version. Used by the tiles to draw the shared waveform
     * (cheap-and-cheerful, computed once at load; the same for every individual).
     */
    peaks(buckets) {
        if (this._peakVersion !== this._version) { this._peakCache.clear(); this._peakVersion = this._version; }
        if (this._peakCache.has(buckets)) return this._peakCache.get(buckets);
        const out = { min: new Float32Array(buckets), max: new Float32Array(buckets) };
        if (this._buffer) {
            const data = this._buffer.getChannelData(0);
            const span = data.length / buckets;
            for (let b = 0; b < buckets; b++) {
                let lo = 1, hi = -1;
                const start = Math.floor(b * span), end = Math.floor((b + 1) * span);
                for (let i = start; i < end; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
                out.min[b] = lo; out.max[b] = hi;
            }
        }
        this._peakCache.set(buckets, out);
        return out;
    }

    /** Replace the source with a user-selected audio file. Resolves once decoded. */
    async setClipFromFile(file) {
        const arr = await file.arrayBuffer();
        const buffer = await this.context().decodeAudioData(arr);
        this._install(buffer, file.name || 'audio', true);
    }

    _install(buffer, name, userLoaded) {
        this._buffer = buffer;
        this._name = name;
        if (userLoaded) this._userLoaded = true;
        this._version++;
        this._peakCache.clear();
    }

    // Fetch + decode the real asset in the background; keep the synth loop on failure.
    async _loadDefault() {
        try {
            const resp = await fetch(DEFAULT_CLIP_URL);
            if (!resp.ok) throw new Error('fetch ' + resp.status);
            const arr = await resp.arrayBuffer();
            const buffer = await this.context().decodeAudioData(arr);
            if (this._userLoaded) return;                 // user already picked their own
            this._install(buffer, 'Amen break', false);
            this._rerenderIfActive();
        } catch (_) {
            /* offline / file:// — keep the synthesised loop already installed */
        }
    }

    // Compact procedural breakbeat: kick / snare / closed+open hats over one 4/4
    // bar at 136 BPM. Provides temporal structure and works with no network.
    _synthLoop(ctx) {
        const sr = ctx.sampleRate;
        const bpm = 136, bar = (60 / bpm) * 4, step = bar / 16;
        const N = Math.round(bar * sr);
        const buffer = ctx.createBuffer(1, N, sr);
        const buf = buffer.getChannelData(0);
        const place = (sig, t) => { const i = Math.round(t * sr); for (let k = 0; k < sig.length && i + k < N; k++) buf[i + k] += sig[k]; };
        const env = (n, a, d) => { const e = new Float32Array(n); const at = Math.floor(a * sr); for (let i = 0; i < n; i++) { let g = Math.exp(-i / sr / d); if (i < at) g *= i / at; e[i] = g; } return e; };
        const kick = () => { const n = Math.floor(0.28 * sr), s = new Float32Array(n); let ph = 0; const e = env(n, 0.001, 0.14); for (let i = 0; i < n; i++) { const f = 120 * Math.exp(-i / sr / 0.03) + 45; ph += 2 * Math.PI * f / sr; s[i] = Math.sin(ph) * e[i] * 0.95; } return s; };
        const snare = () => { const n = Math.floor(0.18 * sr), s = new Float32Array(n), e = env(n, 0.001, 0.08); for (let i = 0; i < n; i++) s[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 185 * i / sr) * 0.5 * Math.exp(-i / sr / 0.05)) * e[i] * 0.8; return s; };
        const hat = (d) => { const n = Math.floor(d * sr), s = new Float32Array(n), e = env(n, 0.0005, d * 0.4); let prev = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; s[i] = (w - prev) * e[i] * 0.35; prev = w; } return s; };
        [0, 10, 11].forEach(s => place(kick(), s * step));
        [4, 12].forEach(s => place(snare(), s * step));
        [0, 2, 3, 4, 6, 8, 10, 12, 14, 15].forEach(s => place(hat(0.045), s * step));
        place(hat(0.16), 7 * step);
        let peak = 0; for (let i = 0; i < N; i++) { buf[i] = Math.tanh(buf[i] * 1.2); if (Math.abs(buf[i]) > peak) peak = Math.abs(buf[i]); }
        const g = 0.92 / (peak + 1e-9); for (let i = 0; i < N; i++) buf[i] *= g;
        return buffer;
    }

    // If an audio-filter population is on screen, redraw it so the late-arriving
    // asset replaces the synth loop. Keeps the population (evolution continues).
    _rerenderIfActive() {
        const fw = window.framework;
        if (!fw || !fw.ea || !fw.ea.population || typeof fw.invalidateAndRender !== 'function') return;
        const sample = fw.ea.population[0];
        if (sample && typeof sample.usesAudio === 'function' && sample.usesAudio()) fw.invalidateAndRender();
    }
}

// App-level singleton (mirrors window.Photo / window.Palette).
window.AudioClip = new AudioClip();

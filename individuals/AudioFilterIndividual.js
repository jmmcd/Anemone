/**
 * AudioFilterIndividual — a whole-signal DAG audio filter (the audio analogue of
 * PhotoFilterIndividual).
 *
 * Evolves a directed acyclic *graph* of audio effects over the shared clip
 * (window.AudioClip). The source clip is node 0; each processing node applies a
 * unary op (lowpass/highpass/…/delay/reverb/distortion/ringmod) or a BINARY
 * combiner (mix, multiply/ring-mod, sub) to earlier nodes' signals; the output
 * node selects the final signal. Because nodes can be reused and recombined you
 * get parallel-effect compositions a linear chain can't — e.g. split the signal,
 * distort one branch, delay the other, and ring-mod them together. Every edge
 * carries an audio signal and every op is signal→signal (or signal,signal→signal),
 * so closure is trivial (any output can feed any input) — the property that makes
 * this a clean GP substrate. Mirrors PhotoFilter's whole-image DAG exactly.
 *
 * The clip is NOT in the genome, so the user can replace it (AudioControlUI) and
 * keep evolving the same filters.
 *
 * Representation: PTO, same plain-data / index-based / acyclic shape as the photo
 * DAG (photoFilterGenerator): the generator is self-contained (top-level consts
 * only, no closure, no `new`) and emits connections as indices into earlier nodes.
 * The trace is the genotype; the plain-data graph is the phenotype.
 *
 * Rendering is Web Audio only (no hand-written DSP): the graph is compiled into a
 * live Web Audio node graph at play time (source → … → destination) and played in
 * realtime through the shared AudioContext (window.AudioClip.context()); stopping
 * tears the graph down. There is no OfflineAudioContext / async render — the TILE
 * visual does not depend on the filtered audio at all. Instead each tile draws the
 * SHARED source waveform (a fixed temporal reminder, identical for every
 * individual) washed with a per-individual TINT derived symbolically from the op
 * mix (lowpass/reverb-heavy → dark/cool, highpass/distortion/ring-mod-heavy →
 * bright/warm), mapped through the palette. Both are synchronous.
 *
 * Playback reuses the framework's sound-individual machinery: implementing
 * playMIDI()/stopMIDI() makes the framework show the ▶ play button and guarantee
 * only one individual sounds at a time (it shares one AudioContext, like the
 * shared MIDIModality).
 */

// Op library. Unary ops are signal→signal; binary ops are (sigA,sigB)→signal. A
// top-level arity table (mirrors IMG_ARITY) lets the generator derive how many
// input edges each node needs. All consts are top-level so the isolated generator
// may reference them. The unary filter ops are named exactly as Web Audio
// BiquadFilterNode types, so building one is just `node.type = op`.
const AUDIO_UNARY_OPS = [
    'lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf',
    'delay', 'reverb', 'distortion', 'tremolo', 'ringmod', 'compressor'
];
const AUDIO_BINARY_OPS = ['mix', 'multiply', 'sub'];
// Selection pool. Binary combiners produce the richer parallel composites, so they
// are listed twice to bias the graph toward branching/recombination.
const AUDIO_OPS = [...AUDIO_UNARY_OPS, ...AUDIO_BINARY_OPS, ...AUDIO_BINARY_OPS];
const AUDIO_ARITY = (() => {
    const a = {};
    AUDIO_UNARY_OPS.forEach(op => { a[op] = 1; });
    AUDIO_BINARY_OPS.forEach(op => { a[op] = 2; });
    return a;
})();
// The biquad filter ops (share one build branch and a cutoff-driven tint nudge).
const AUDIO_FILTER_OPS = new Set(['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf']);
// Symbolic "brightness" per op for the tile tint: negative = dark/cool (bass,
// smoothing, space), positive = bright/warm (treble, grit, modulation).
const AUDIO_BRIGHTNESS = {
    lowpass: -0.8, highpass: 0.8, bandpass: 0.0, notch: 0.0, peaking: 0.2,
    lowshelf: -0.4, highshelf: 0.4, delay: -0.1, reverb: -0.5, distortion: 0.9,
    tremolo: 0.1, ringmod: 0.6, compressor: 0.1, mix: 0.0, multiply: 0.3, sub: 0.0
};
// Averaging the weights over a graph regresses toward neutral, so most tints
// would cluster in the middle. This expands them back out toward the palette
// extremes (tanh saturates smoothly, no hard clip); raise it for more punch.
const TINT_CONTRAST = 2.6;

const audioFilterGenerator = (rnd) => {
    // Node 0 is implicitly the source clip; processing node i is global index i+1.
    const numProc = rnd.randint(3, 8);
    const procs = [];
    for (let i = 0; i < numProc; i++) {
        const op = rnd.choice(AUDIO_OPS);
        const arity = AUDIO_ARITY[op];
        const available = 1 + i; // source(0) + earlier procs → global indices 0..i
        const inputs = [];
        for (let j = 0; j < arity; j++) inputs.push(rnd.randint(0, available - 1));
        procs.push({ op, arity, inputs, p: [rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1)] });
    }
    // Output reads one of the last few nodes (never the bare source), so the
    // evolved graph structure actually shows/sounds.
    const outputIndex = rnd.randint(Math.max(1, numProc - 3), numProc);
    return { procs, outputIndex };
};

const audioFilterRepresentation = new PTORepresentation(audioFilterGenerator);

class AudioFilterIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = audioFilterRepresentation;
        this.genome = genome || this.representation.generateRandom();
        // Shared buffer/graph playback modality (local fallback for tests).
        this.audio = (typeof window !== 'undefined' && window.framework && window.framework.sharedAudio) || new AudioModality();
        this.isPlaying = false;
    }

    usesColorPalette() { return true; } // the tile tint uses the palette
    usesAudio() { return true; }        // attaches the Audio panel

    // --- Tile visual: shared source waveform washed with a symbolic tint --------
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const col = window.Palette.color(this._tintT());

        // Background: a dark wash of the tint colour.
        ctx.fillStyle = `rgb(${col.r * 0.22 | 0},${col.g * 0.22 | 0},${col.b * 0.22 | 0})`;
        ctx.fillRect(0, 0, w, h);

        // Shared source waveform (identical for every individual; a temporal
        // reminder, computed once at load).
        const peaks = window.AudioClip.peaks(w);
        const mid = h / 2, amp = h * 0.44;
        ctx.strokeStyle = `rgb(${col.r},${col.g},${col.b})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            ctx.moveTo(x + 0.5, mid - peaks.max[x] * amp);
            ctx.lineTo(x + 0.5, mid - peaks.min[x] * amp);
        }
        ctx.stroke();
    }

    // Symbolic tint in [0,1] from the op mix (+ a cutoff nudge for filters). No
    // audio is analysed — this is purely a function of the phenotype graph.
    _tintT() {
        const procs = this.phenotype && this.phenotype.procs;
        if (!procs || !procs.length) return 0.5;
        let sum = 0;
        for (const d of procs) {
            let wgt = AUDIO_BRIGHTNESS[d.op] || 0;
            if (AUDIO_FILTER_OPS.has(d.op)) wgt += (d.p[0] - 0.5); // low cutoff darkens
            sum += wgt;
        }
        const m = sum / procs.length;                       // ~[-1,1], but clusters near 0
        return 0.5 + 0.5 * Math.tanh(m * TINT_CONTRAST);    // expand away from the middle
    }

    describeExtra() {
        const g = this.phenotype;
        if (!g || !Array.isArray(g.procs)) return '';
        const name = idx => (idx === 0 ? 'clip' : 'p' + idx);
        let s = '<span class="genome-label">Audio DAG:</span>\n';
        g.procs.forEach((d, i) => { s += `  p${i + 1} = ${d.op}(${d.inputs.map(name).join(', ')})\n`; });
        s += `  output = ${name(g.outputIndex)}\n`;
        return s;
    }

    // --- Playback (framework sound-individual interface) -----------------------
    // The framework shows a ▶ button because playMIDI exists, and stops the current
    // individual before starting another. The Web Audio lifecycle (gain, connect,
    // start/stop) is owned by the shared AudioModality; the individual only compiles
    // its DAG into the live graph the modality plays.
    playMIDI() {
        const buffer = window.AudioClip.buffer();
        if (!buffer) return;                 // nothing decoded yet
        this.audio.playGraph((ctx) => {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const { output, sources } = this._compileGraph(ctx, src, this.phenotype);
            return { output, sources: [src, ...sources] };
        });
        this.isPlaying = true;
    }

    stopMIDI() {
        this.audio.stop();
        this.isPlaying = false;
    }

    // --- DAG → live Web Audio node graph ---------------------------------------
    // Walk nodes in order, memoising each node's output AudioNode (a node feeding
    // several consumers just fans out — the DAG-reuse win). Returns the final
    // output node and the list of startable sources (oscillators) to start/stop.
    _compileGraph(ctx, srcNode, graph) {
        const sources = [];
        const outs = [srcNode]; // global index 0 = source clip
        const procs = (graph && graph.procs) || [];
        for (let i = 0; i < procs.length; i++) {
            const d = procs[i];
            const pick = idx => outs[Math.max(0, Math.min(idx, outs.length - 1))];
            const ins = d.inputs.map(pick);
            outs.push(this._buildNode(ctx, d.op, ins, d.p, sources));
        }
        const outIdx = Math.max(0, Math.min((graph && graph.outputIndex) || 0, outs.length - 1));
        return { output: outs[outIdx], sources };
    }

    _buildNode(ctx, op, ins, p, sources) {
        const A = ins[0], B = ins[1] || ins[0];

        if (AUDIO_FILTER_OPS.has(op)) {
            const f = ctx.createBiquadFilter();
            f.type = op;
            // Kept away from the extremes that silence a breakbeat: a lowpass at a
            // very low cutoff (or a highpass at a very high one) removes nearly all
            // the energy. ~120 Hz .. ~7.7 kHz, and a moderate max Q so a narrow
            // bandpass can't sit entirely in a dead zone.
            f.frequency.value = 120 * Math.pow(2, p[0] * 6);    // ~120 Hz .. ~7.7 kHz
            f.Q.value = 0.5 + p[1] * 6;
            f.gain.value = (p[2] - 0.5) * 30;                   // dB (peaking/shelf)
            A.connect(f);
            return f;
        }

        switch (op) {
            case 'delay': {
                const delay = ctx.createDelay(1.0);
                delay.delayTime.value = 0.05 + p[0] * 0.5;
                const fb = ctx.createGain(); fb.gain.value = Math.min(0.75, p[1] * 0.85);
                const out = ctx.createGain();
                A.connect(out);                 // dry
                A.connect(delay); delay.connect(fb); fb.connect(delay); // feedback loop
                delay.connect(out);             // wet
                return out;
            }
            case 'reverb': {
                const conv = ctx.createConvolver();
                conv.buffer = this._impulse(ctx, 0.25 + p[0] * 2.0, p[1]);
                const out = ctx.createGain();
                const wet = ctx.createGain(); wet.gain.value = 0.3 + p[2] * 0.6;
                A.connect(out);                 // dry
                A.connect(conv); conv.connect(wet); wet.connect(out);
                return out;
            }
            case 'distortion': {
                const pre = ctx.createGain(); pre.gain.value = 0.4 + p[1] * 1.6;
                const ws = ctx.createWaveShaper();
                ws.curve = this._distCurve(1 + p[0] * 400);
                ws.oversample = '2x';
                const post = ctx.createGain(); post.gain.value = 0.6; // tame the level
                A.connect(pre); pre.connect(ws); ws.connect(post);
                return post;
            }
            case 'tremolo': {
                const depth = 0.2 + p[1] * 0.8;
                const g = ctx.createGain(); g.gain.value = 1 - depth / 2;
                const lfo = ctx.createOscillator(); lfo.frequency.value = 1 + p[0] * 12;
                const lg = ctx.createGain(); lg.gain.value = depth / 2;
                lfo.connect(lg); lg.connect(g.gain);
                A.connect(g);
                sources.push(lfo);
                return g;
            }
            case 'ringmod': {
                const g = ctx.createGain(); g.gain.value = 0;   // base 0 → output = A * osc
                const osc = ctx.createOscillator(); osc.frequency.value = 50 + p[0] * 1500;
                osc.connect(g.gain);
                A.connect(g);
                sources.push(osc);
                return g;
            }
            case 'compressor': {
                const c = ctx.createDynamicsCompressor();
                c.threshold.value = -40 + p[0] * 30;
                c.ratio.value = 2 + p[1] * 10;
                A.connect(c);
                return c;
            }
            case 'mix': {
                const g = ctx.createGain(); g.gain.value = 0.5;
                A.connect(g); B.connect(g);
                return g;
            }
            case 'multiply': {               // ring-mod of two signals: A * B
                const g = ctx.createGain(); g.gain.value = 0;
                A.connect(g); B.connect(g.gain);
                return g;
            }
            case 'sub': {
                // sub(x, x) is digital silence; fall back to passthrough so an
                // op whose two inputs resolved to the same node isn't dead.
                if (A === B) { const g = ctx.createGain(); A.connect(g); return g; }
                const inv = ctx.createGain(); inv.gain.value = -1;
                B.connect(inv);
                const g = ctx.createGain(); g.gain.value = 0.5;
                A.connect(g); inv.connect(g);
                return g;
            }
            default: {                       // unknown → passthrough
                const g = ctx.createGain();
                A.connect(g);
                return g;
            }
        }
    }

    // Exponentially-decaying white-noise impulse response for the convolver reverb.
    _impulse(ctx, seconds, colour) {
        const sr = ctx.sampleRate;
        const n = Math.max(1, Math.floor(seconds * sr));
        const buf = ctx.createBuffer(2, n, sr);
        const decay = 2 + colour * 4;
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
        }
        return buf;
    }

    // tanh-ish waveshaping curve; `k` sets the drive.
    _distCurve(k) {
        const n = 1024, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            curve[i] = Math.tanh(k * x) / Math.tanh(k || 1);
        }
        return curve;
    }
}

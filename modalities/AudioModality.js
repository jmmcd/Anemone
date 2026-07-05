/**
 * AudioModality — shared Web Audio *playback* for sound individuals whose output is
 * a rendered buffer or a live effects graph (DrumMachineIndividual, AudioFilterIndividual).
 *
 * It is the sibling of MIDIModality: MIDIModality plays NOTE events (Melody /
 * MouseMusic / EEG — MIDI out with a Web-Audio-synth fallback); AudioModality plays
 * SAMPLES — an AudioBuffer (playBuffer) or a compiled node graph (playGraph). Both
 * are shared singletons owned by the framework (framework.sharedMIDI /
 * framework.sharedAudio) and referenced by the individuals, so there is one owner of
 * the play/stop lifecycle per medium instead of the same createBufferSource → gain →
 * connect → start/stop boilerplate hand-rolled in each individual.
 *
 * It owns no AudioContext of its own: it plays through the single shared context that
 * window.AudioClip already provides (`AudioClip.context()`), so the whole app shares
 * one context. Only one thing plays at a time — starting a new playback stops the
 * previous — mirroring the framework's single-sound-individual contract.
 */

class AudioModality {
    constructor() {
        this._active = null; // { nodes:[…startable], gain } while playing
    }

    /** The shared AudioContext (owned by window.AudioClip). */
    context() {
        return window.AudioClip.context();
    }

    /** Resume the context (needed after a user gesture) and return it. */
    resume() {
        const ctx = this.context();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    /**
     * Play a decoded AudioBuffer. Options: { loop, gain, offset } (offset seeks into
     * the buffer, then loop wraps it — e.g. entering a drum loop mid-bar).
     */
    playBuffer(buffer, { loop = false, gain = 0.9, offset = 0 } = {}) {
        const ctx = this.resume();
        this.stop();
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = loop;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(g);
        g.connect(ctx.destination);
        src.start(ctx.currentTime, offset);
        this._active = { nodes: [src], gain: g };
    }

    /**
     * Play a live graph. `build(ctx)` returns { output, sources }: `output` is the
     * final AudioNode, `sources` the startable nodes (buffer sources, oscillators).
     * The modality wires output → master gain → destination and starts every source.
     */
    playGraph(build, { gain = 0.9 } = {}) {
        const ctx = this.resume();
        this.stop();
        const { output, sources } = build(ctx);
        const g = ctx.createGain();
        g.gain.value = gain;
        output.connect(g);
        g.connect(ctx.destination);
        (sources || []).forEach(n => { try { n.start(); } catch (_) { /* already started */ } });
        this._active = { nodes: sources || [], gain: g };
    }

    /** Stop whatever is currently playing and tear down its nodes. Idempotent. */
    stop() {
        if (!this._active) return;
        this._active.nodes.forEach(n => { try { n.stop(); } catch (_) { } });
        try { this._active.gain.disconnect(); } catch (_) { }
        this._active = null;
    }

    /** True while something is playing. */
    get isActive() { return !!this._active; }

    /**
     * Loop-seam declick: fade the last `ms` of a channel's samples linearly to zero,
     * so a buffer that LOOPS (or ends a WAV) has no discontinuity at the seam —
     * whatever is still ringing (a drum voice tail truncated at the bar end, a swung
     * note pushed over the boundary) ramps to silence instead of jumping. Both step
     * sequencers' `renderToAudioBuffer` call this, so the loop-seam fix lives in one
     * place rather than being reimplemented per (differently structured) mixer. The
     * per-note attack/release a synth applies is separate — that shapes each note and
     * declicks mid-buffer note ends; this only guarantees the single seam sample.
     */
    static declickTail(data, sampleRate, ms = 5) {
        if (!data || !data.length) return data;
        const n = Math.min(data.length, Math.max(1, Math.round((ms / 1000) * sampleRate)));
        const start = data.length - n;
        for (let i = 0; i < n; i++) data[start + i] *= (n - 1 - i) / n; // 1 → 0 over the last n samples
        return data;
    }
}

if (typeof window !== 'undefined') window.AudioModality = AudioModality;

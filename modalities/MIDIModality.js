/**
 * MIDIModality
 *
 * Manages MIDI output with automatic Web Audio fallback.
 * Provides a unified sendNote() interface usable by any individual that produces sound,
 * plus a managed interval loop for DAG-style continuous evaluation.
 */

class MIDIModality {
    constructor() {
        this.midiOutput = null;
        this.audioContext = null;
        this.isRunning = false;
        this._intervalId = null;
        this._initWebAudio();
    }

    _initWebAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            // Web Audio not available in this environment
        }
    }

    setMidiOutput(output) {
        this.midiOutput = output;
    }

    /**
     * Send a note, falling back to Web Audio synthesis if MIDI is unavailable or fails.
     */
    sendNote(pitch, velocity = 80, duration = 200) {
        if (this.midiOutput) {
            try {
                this.midiOutput.send([0x90, pitch, velocity]);
                const out = this.midiOutput;
                setTimeout(() => {
                    try { out.send([0x80, pitch, 0]); } catch (e) {}
                }, duration);
                return;
            } catch (e) {
                // MIDI failed — fall through to Web Audio
            }
        }
        this._webAudioNote(pitch, velocity, duration);
    }

    _webAudioNote(pitch, velocity, duration) {
        if (!this.audioContext) return;
        try {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            const frequency = 440 * Math.pow(2, (pitch - 69) / 12);

            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'sine';

            const volume = velocity / 127 * 0.3;
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration / 1000);
        } catch (e) {}
    }

    /**
     * Send MIDI CC 123 (all notes off). No-op if no MIDI output.
     */
    allNotesOff() {
        if (this.midiOutput) {
            try { this.midiOutput.send([0xB0, 0x7B, 0x00]); } catch (e) {}
        }
    }

    /**
     * Start a recurring evaluation loop (for DAG-style individuals).
     * @param {Function} callback - Called on each tick
     * @param {number} timeStep - Interval in milliseconds
     */
    start(callback, timeStep = 100) {
        if (!this.isRunning) {
            this.isRunning = true;
            this._intervalId = setInterval(callback, timeStep);
        }
    }

    /**
     * Stop the evaluation loop.
     */
    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
        }
    }

    /**
     * Loop a note sequence to the MIDI output, synced to a shared transport. This is
     * the live-MIDI side of the unified step-sequencer playback (the AudioModality
     * buffer loop is the fallback when no output is available).
     *
     * seq = { bpm, ppq, loopTicks, notes:[{ pitch, velocity, start, duration, channel }] }.
     * Uses a lookahead scheduler: a short interval schedules note-on/off for every loop
     * iteration entering a ~120 ms horizon via output.send(bytes, timestampMs). Web MIDI
     * timestamps are in the performance.now() domain — the same clock the transport uses,
     * so loops stay phase-aligned. Returns false (a no-op) if there's no MIDI output, so
     * the caller can fall back to synthesised audio.
     */
    playSequence(seq, transport) {
        this.stopSequence();
        if (!this.midiOutput || !seq || !seq.notes) return false;
        const out = this.midiOutput;
        const ppq = seq.ppq || 96;
        const tickSec = 60 / ((seq.bpm > 0 ? seq.bpm : 120) * ppq);
        const loopSec = Math.max(0.05, (seq.loopTicks || ppq * 4) * tickSec);
        const LOOKAHEAD = 0.12; // seconds
        const now0 = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const phase = transport ? transport.phase(loopSec) : 0;
        const t0 = now0 - phase;   // virtual bar-0 start (seconds), so we enter at `phase`
        let nextLoop = 0;

        const tick = () => {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
            const horizon = now + LOOKAHEAD;
            while (t0 + nextLoop * loopSec < horizon) {
                const base = t0 + nextLoop * loopSec;
                for (const n of seq.notes) {
                    const on = base + n.start * tickSec;
                    const off = base + (n.start + n.duration) * tickSec;
                    if (off <= now) continue;                       // already elapsed
                    const ch = (n.channel || 0) & 0x0f;
                    const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
                    const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
                    try {
                        out.send([0x90 | ch, pitch, vel], Math.max(now, on) * 1000);
                        out.send([0x80 | ch, pitch, 0], off * 1000);
                    } catch (e) { /* send failed — skip this note */ }
                }
                nextLoop++;
            }
        };
        tick();
        this._seqTimer = setInterval(tick, 25);
        this.isRunning = true;
        return true;
    }

    /** Stop the looping note sequence and silence any held notes. */
    stopSequence() {
        if (this._seqTimer) { clearInterval(this._seqTimer); this._seqTimer = null; }
        this.isRunning = false;
        this.allNotesOff();
    }
}

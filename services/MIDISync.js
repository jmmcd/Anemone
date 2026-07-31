/**
 * MIDISync — app-level service (mirrors window.Palette / window.Photo) that listens
 * for MIDI Beat Clock from an external MIDI input — e.g. GarageBand/Logic driving
 * the same IAC bus Anemone's note output already uses — and turns it into a tempo
 * estimate + a phase-lock point. This is what lets a step-sequencer individual (or
 * a MIDI-clock-quantised DAG individual) play IN TIME with a DAW transport instead
 * of free-running on Anemone's own clock: press play in GarageBand and Anemone's
 * evolving loop locks to its tempo and downbeat.
 *
 * Wiring: Anemone.js opens a second MIDI port (input, alongside the existing output)
 * during initializeMIDI() and forwards every onmidimessage here via handleMessage().
 * Nothing downstream needs to know MIDI exists — window.Transport.phase() and
 * window.PerformanceControls.apply() consult window.MIDISync directly, and
 * MIDIModality.start() reads .bpm for its cadence — so every synced individual gets
 * in-time playback for free, with no changes to the individuals themselves.
 *
 * Standard MIDI Beat Clock is 24 pulses (0xF8) per quarter note. Song Position
 * Pointer (0xF2) is NOT decoded, so Continue (0xFB) is treated like Start (0xFA) —
 * resuming at phase 0 rather than the DAW's exact resume point. That's good enough
 * for jamming (tempo + downbeat lock); it isn't sample-accurate scrubbing.
 */
window.MIDISync = {
    enabled: false,        // user opt-in (toggled from the UI) — off by default
    running: false,        // saw a Start/Continue with no following Stop
    bpm: null,             // smoothed tempo estimate from clock intervals, or null until enough pulses arrive
    epoch: null,           // performance.now()/1000 at the last Start/Continue — the DAW's "downbeat"
    lastTickTime: null,    // performance.now()/1000 of the last clock pulse
    _intervals: [],        // rolling window of inter-pulse deltas (seconds), for the tempo average

    // True once we're actually receiving a live, recent clock — vs. merely enabled
    // but nothing connected/playing yet. Callers (Transport, PerformanceControls)
    // only trust bpm/epoch when this is true, so an idle/disconnected sync toggle
    // is a no-op rather than freezing playback.
    get active() {
        if (!this.enabled || !this.running || this.bpm == null || this.lastTickTime == null) return false;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        return (now - this.lastTickTime) < 0.75; // a couple of missed pulses at even a slow tempo
    },

    // data = the raw Uint8Array/Array from a MIDIMessageEvent; timeStampMs = the
    // event's timeStamp (performance.now()-domain, matching Transport/MIDIModality).
    handleMessage(data, timeStampMs) {
        if (!this.enabled || !data || !data.length) return;
        const t = (timeStampMs != null ? timeStampMs : (typeof performance !== 'undefined' ? performance.now() : Date.now())) / 1000;
        const status = data[0];
        if (status === 0xF8) this._tick(t);
        else if (status === 0xFA || status === 0xFB) this._start(t); // Start / Continue — see header re: SPP
        else if (status === 0xFC) this._stop();
    },

    _tick(t) {
        if (this.lastTickTime != null) {
            const dt = t - this.lastTickTime;
            if (dt > 0.001 && dt < 1) { // ignore back-to-back glitches and long gaps (a stall, not a tempo)
                this._intervals.push(dt);
                if (this._intervals.length > 24) this._intervals.shift(); // ~1 quarter note of history
                const avg = this._intervals.reduce((a, b) => a + b, 0) / this._intervals.length;
                this.bpm = 60 / (avg * 24);
            }
        }
        this.lastTickTime = t;
    },

    _start(t) {
        this.running = true;
        this.epoch = t;
        this._intervals.length = 0; // re-settle the tempo average for the new run
    },

    _stop() {
        this.running = false;
    },

    // Human-readable status for the UI panel.
    status() {
        if (!this.enabled) return 'Off';
        if (this.active) return `Locked @ ${Math.round(this.bpm)} BPM`;
        if (this.running) return 'Waiting for clock…';
        return 'No clock — press play in your DAW';
    },
};

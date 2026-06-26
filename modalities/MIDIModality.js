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
}

/**
 * OSCInput — app-level service (mirrors window.Palette / window.Photo / window.MIDISync)
 * that receives OSC messages over a WebSocket and exposes the latest feature vector.
 *
 * A browser can't listen on a UDP socket, so OSC arrives over WebSocket: some sender
 * (see scripts/eeg-osc-sender.js, which replays an EEG CSV) runs a WebSocket server
 * and pushes binary OSC messages to it. This service connects as the client, decodes
 * each message, and — for any address starting with "/eeg" — adaptively normalises its
 * numeric arguments (a running per-feature z-score, see _normalise) into the current
 * sample. Normalisation is done here, on the live stream, rather than by the sender:
 * a real EEG feed has no end to min-max over and drifts, so each feature is scaled by
 * its own running spread as it arrives.
 *
 * EEGSonificationIndividual reads window.OSCInput.sample() directly (the way palette /
 * photo individuals read window.Palette / window.Photo), so nothing has to be plumbed
 * through the framework. Off by default; the OSC Input drawer panel (OSCInputUI) turns
 * it on and sets the URL. Auto-reconnects while enabled so the sender can start after
 * Anemone, or restart mid-run, without a manual reconnect.
 */

// --- Minimal OSC decoder (plain messages only — Anemone never sends bundles) ---

// Read an OSC string (null-terminated, padded to a 4-byte boundary) at `offset`.
// Returns { value, next } where next is the offset of the following datum.
function _oscReadString(dv, offset) {
    let end = offset;
    while (end < dv.byteLength && dv.getUint8(end) !== 0) end++;
    let str = '';
    for (let i = offset; i < end; i++) str += String.fromCharCode(dv.getUint8(i));
    let next = end + 1;                 // skip the null terminator
    next += (4 - (next % 4)) % 4;       // then pad up to the next 4-byte boundary
    return { value: str, next };
}

// Decode one OSC message → { address, args } (or null if it isn't a plain message).
// Arguments are big-endian per the OSC spec; unknown type tags stop parsing.
function _decodeOSCMessage(dv) {
    const addr = _oscReadString(dv, 0);
    if (addr.value[0] !== '/') return null;               // bundle ("#bundle") or garbage
    const types = _oscReadString(dv, addr.next);
    if (types.value[0] !== ',') return null;
    let offset = types.next;
    const args = [];
    for (const tag of types.value.slice(1)) {
        if (tag === 'f') { args.push(dv.getFloat32(offset, false)); offset += 4; }
        else if (tag === 'i') { args.push(dv.getInt32(offset, false)); offset += 4; }
        else if (tag === 'd') { args.push(dv.getFloat64(offset, false)); offset += 8; }
        else if (tag === 's') { const s = _oscReadString(dv, offset); args.push(s.value); offset = s.next; }
        else if (tag === 'T') { args.push(true); }
        else if (tag === 'F') { args.push(false); }
        else break;                                       // unknown/unsupported type tag
    }
    return { address: addr.value, args };
}

class OSCInput {
    constructor() {
        this.enabled = false;                 // user opt-in (from the UI) — off by default
        this.url = 'ws://localhost:8080';
        this.ws = null;
        this.connected = false;
        this._latest = null;                  // { features: number[], raw: number[], time: ms } or null
        this._lastError = null;
        this._reconnectTimer = null;
        this._stats = null;                   // per-feature running {mean, var} for _normalise
        this._count = 0;
    }

    // Adaptive per-feature normalisation for a LIVE stream. We can't min-max over a whole
    // recording the way a file replay could — a live EEG feed has no end and drifts — so we
    // keep a running mean/variance per feature (EMA) and emit each value as a z-score,
    // soft-bounded to (-1, 1) by tanh. Each feature is scaled by its OWN running spread, so
    // a raw feed in arbitrary units (µV, band power, …) still lands in a useful range and
    // tracks slow drift instead of saturating. Warms up fast on the first samples, then
    // settles to a ~50-sample window.
    _normalise(features) {
        if (!this._stats || this._stats.length !== features.length) {
            this._stats = features.map(v => ({ mean: v, var: 1 }));
            this._count = 0;
        }
        this._count++;
        const alpha = Math.max(0.02, Math.min(0.5, 1 / this._count));
        return features.map((x, i) => {
            const s = this._stats[i];
            const delta = x - s.mean;
            const std = Math.sqrt(s.var) || 1;
            const z = delta / std;                              // z-score vs. current stats
            s.mean += alpha * delta;                            // then update the EMA
            s.var = (1 - alpha) * (s.var + alpha * delta * delta);
            return Math.tanh(z * 0.5);                          // soft-bound to (-1, 1)
        });
    }

    // Open (or re-point) the connection and keep it alive while enabled.
    connect(url) {
        if (url) this.url = url;
        this.enabled = true;
        this._closeSocket();
        this._open();
    }

    disconnect() {
        this.enabled = false;
        this._clearReconnect();
        this._closeSocket();
    }

    _open() {
        if (typeof WebSocket === 'undefined') { this._lastError = 'WebSocket unavailable'; return; }
        this._clearReconnect();
        try {
            const ws = new WebSocket(this.url);
            ws.binaryType = 'arraybuffer';
            this.ws = ws;
            ws.onopen = () => { this.connected = true; this._lastError = null; };
            ws.onmessage = (e) => this._onMessage(e.data);
            ws.onerror = () => { this._lastError = 'connection error'; };
            ws.onclose = () => {
                this.connected = false;
                if (this.ws === ws) this.ws = null;
                if (this.enabled) this._scheduleReconnect();
            };
        } catch (err) {
            this._lastError = err && err.message ? err.message : 'connection failed';
            if (this.enabled) this._scheduleReconnect();
        }
    }

    _closeSocket() {
        if (this.ws) {
            try { this.ws.onclose = null; this.ws.close(); } catch (e) { /* ignore */ }
            this.ws = null;
        }
        this.connected = false;
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this.enabled) this._open();
        }, 1500);
    }

    _clearReconnect() {
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    }

    _onMessage(data) {
        try {
            if (!(data instanceof ArrayBuffer)) return;   // ignore any text frames
            const msg = _decodeOSCMessage(new DataView(data));
            if (msg && msg.address.indexOf('/eeg') === 0) {
                const raw = msg.args.filter(a => typeof a === 'number');
                if (raw.length) this._latest = { features: this._normalise(raw), raw, time: Date.now() };
            }
        } catch (e) { /* malformed packet — ignore */ }
    }

    // Latest received sample in the shape EEGSonificationIndividual expects,
    // or null if nothing has arrived yet.
    sample() {
        return this._latest ? { features: this._latest.features } : null;
    }

    // Human-readable status for the UI panel.
    status() {
        if (!this.enabled) return 'Off';
        if (this.connected) return this._latest ? 'Receiving OSC ✓' : 'Connected — waiting for data…';
        return this._lastError ? `Connecting… (${this._lastError})` : 'Connecting…';
    }
}

if (typeof window !== 'undefined') {
    window.OSCInput = new OSCInput();
}

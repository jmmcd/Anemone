/**
 * MidiExport — an app-level service that writes an individual's note sequence to a
 * Standard MIDI File (.mid), mirroring window.AudioExport (WAV) and window.MeshExport
 * (STL): medium-specific plumbing kept out of the individuals, one entry point per job.
 *
 * The SMF is hand-rolled binary (like the PNG-chunk / STL / ZIP writers already in
 * this repo — no library). An individual opts in by implementing
 *   toMIDISequence() -> { bpm, ppq, notes: [{ pitch, velocity(0-127),
 *                          start(ticks), duration(ticks), channel }] }
 * so the individual owns the musical mapping (drum grid → GM percussion, melody →
 * pitches) and this service owns only the file format.
 *
 * Output is a type-0 SMF (single track): an MThd header + one MTrk. At tick 0 the
 * track carries a tempo meta-event and the same {type, genome, phenotype, phenoSig}
 * provenance JSON as the PNG/WAV exports, embedded as a *sequencer-specific* meta
 * event (FF 7F) so DAWs ignore it rather than showing the JSON as text/lyrics.
 * Exposed as the global window.MidiExport.
 */
window.MidiExport = {
    /** True if this individual can produce a note sequence (drives the ⤓ MIDI button). */
    canExport(individual) {
        return !!individual && typeof individual.toMIDISequence === 'function';
    },

    // Variable-length quantity (MIDI delta-time / meta-length encoding): 7 bits per
    // byte, high bit set on all but the last. Returns an array of bytes.
    _vlq(value) {
        let v = Math.max(0, Math.round(value));
        const out = [v & 0x7f];
        v = Math.floor(v / 128);
        while (v > 0) { out.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
        return out;
    },

    // Build one MTrk chunk (with length framing) from a flat, time-sorted event list.
    // Each event is { tick, bytes:[...] }; delta-times are computed here.
    _buildTrack(events) {
        const body = [];
        let prev = 0;
        for (const ev of events) {
            body.push(...this._vlq(ev.tick - prev), ...ev.bytes);
            prev = ev.tick;
        }
        body.push(...this._vlq(0), 0xff, 0x2f, 0x00); // end of track
        const len = body.length;
        return [
            0x4d, 0x54, 0x72, 0x6b,                                  // "MTrk"
            (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
            ...body,
        ];
    },

    // Turn a { bpm, ppq, notes } sequence + optional provenance JSON into SMF bytes.
    //
    // Format 0, ONE clean track (tempo + notes). The Anemone provenance goes in a
    // CUSTOM top-level chunk ("anmn"), appended AFTER the track — NOT in a track and
    // NOT a meta event. MIDI's chunk framing (4-byte type + 4-byte big-endian length,
    // like RIFF/PNG) means a reader consumes exactly the `ntracks` MTrk chunks the
    // header declares and skips any chunk whose type it doesn't recognise — so the
    // metadata is invisible to DAWs. This is the same ancillary-chunk trick used for
    // PNG (iTXt) and WAV (anmn RIFF chunk). It replaces an earlier attempt to embed
    // the blob as an in-track FF 7F meta event: that is spec-valid, but a large meta
    // event makes Logic (and GarageBand) mis-parse the rest of *that track* into
    // thousands of bars of garbage — meta data must live outside the tracks entirely.
    buildSMF(seq, metaJson) {
        const ppq = Math.max(1, Math.round(seq.ppq || 96));
        const bpm = seq.bpm > 0 ? seq.bpm : 120;
        const usPerQuarter = Math.round(60000000 / bpm); // microseconds per quarter note

        // Single track: tempo (FF 51 03) then the note-on / note-off pairs.
        const events = [{ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03,
            (usPerQuarter >>> 16) & 0xff, (usPerQuarter >>> 8) & 0xff, usPerQuarter & 0xff] }];
        for (const n of (seq.notes || [])) {
            const ch = (n.channel || 0) & 0x0f;
            const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
            const vel = Math.max(1, Math.min(127, Math.round(n.velocity)));
            const start = Math.max(0, Math.round(n.start));
            const end = start + Math.max(1, Math.round(n.duration));
            events.push({ tick: start, order: 1, bytes: [0x90 | ch, pitch, vel] });
            events.push({ tick: end, order: 0, bytes: [0x80 | ch, pitch, 0] });
        }
        // Stable sort by tick; at equal ticks the tempo comes first, then note-off
        // before note-on so a re-triggered pitch isn't immediately cut short.
        events.sort((a, b) => (a.tick - b.tick) || (a.order - b.order));

        const header = [
            0x4d, 0x54, 0x68, 0x64,          // "MThd"
            0x00, 0x00, 0x00, 0x06,          // header length = 6
            0x00, 0x00,                      // format 0
            0x00, 0x01,                      // one track
            (ppq >>> 8) & 0xff, ppq & 0xff,  // division = ticks per quarter note
        ];
        let out = header.concat(this._buildTrack(events));
        if (metaJson != null) {
            // Custom top-level chunk: "anmn" + 4-byte big-endian length + UTF-8 JSON.
            const data = Array.from(new TextEncoder().encode(String(metaJson)));
            const len = data.length;
            out = out.concat(
                [0x61, 0x6e, 0x6d, 0x6e,     // "anmn"
                    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff],
                data);
        }
        return new Uint8Array(out);
    },

    // ---- Read embedded provenance back out of a .mid ------------------------
    // Inverse of the "anmn" chunk written by buildSMF: walk the top-level chunks
    // (each an 8-byte type+length header, like RIFF) past the MThd/MTrk chunks and
    // return the parsed JSON from the "anmn" chunk, or null. No event parsing needed
    // — the metadata lives outside the tracks. Symmetric with ImageSave/AudioExport
    // readMetadata, and the load path's reader.
    readMetadata(bytes) {
        if (!bytes || bytes.length < 14) return null;
        const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
        if (tag(0) !== 'MThd') return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let pos = 8 + view.getUint32(4);           // skip the header chunk
        while (pos + 8 <= bytes.length) {
            const type = tag(pos);
            const len = view.getUint32(pos + 4);
            if (type === 'anmn') {
                try { return JSON.parse(new TextDecoder().decode(bytes.subarray(pos + 8, pos + 8 + len))); }
                catch (e) { return null; }
            }
            pos += 8 + len;
        }
        return null;
    },

    readMetadataFromFile(file) {
        return file.arrayBuffer().then((buf) => this.readMetadata(new Uint8Array(buf)));
    },

    // Build + download the individual's sequence as a .mid. Returns the filename.
    downloadMIDI(individual) {
        if (!this.canExport(individual)) throw new Error('Individual has no MIDI sequence');
        const seq = individual.toMIDISequence();
        const meta = (window.ImageSave && window.ImageSave.metaFor)
            ? JSON.stringify(window.ImageSave.metaFor(individual)) : null;
        const bytes = this.buildSMF(seq, meta);

        const filename = window.ExportNaming.filename(individual, 'mid');
        const blob = new Blob([bytes], { type: 'audio/midi' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return filename;
    }
};

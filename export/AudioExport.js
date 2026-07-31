/**
 * AudioExport — an app-level service that renders an audio individual's evolved
 * effects graph to actual samples, for (a) WAV download and (b) silence detection.
 * Mirrors window.MeshExport (STL for 3D): medium-specific plumbing kept out of the
 * individuals, with one entry point per job.
 *
 * Both jobs need the one thing realtime Web Audio can't give you — the resulting
 * samples — so both go through an OfflineAudioContext: build source → graph →
 * destination, render, read the AudioBuffer. This is the "offline" Web Audio
 * idiom; the individual's own realtime playback (playMIDI) never touches it.
 *
 * Two kinds of audio individual can be rendered:
 *   - one that renders itself to an AudioBuffer (renderToAudioBuffer(), e.g.
 *     DrumMachineIndividual — it generates its own source, no shared clip);
 *   - one that exposes _compileGraph(ctx, srcNode, phenotype) → { output, sources }
 *     (AudioFilterIndividual — its source is the shared window.AudioClip), rendered
 *     through an OfflineAudioContext here.
 */
window.AudioExport = {
    /** True if this individual can be rendered to audio (drives the ⤓ WAV button). */
    canExport(individual) {
        return !!individual && (
            typeof individual.renderToAudioBuffer === 'function' ||
            typeof individual._compileGraph === 'function'
        );
    },

    // Render the individual to an AudioBuffer. Prefers a self-rendered buffer;
    // otherwise compiles its effects graph over the shared clip (offline).
    async renderToBuffer(individual) {
        if (individual && typeof individual.renderToAudioBuffer === 'function') {
            return individual.renderToAudioBuffer();
        }
        if (!individual || typeof individual._compileGraph !== 'function') {
            throw new Error('Individual has no audio to render');
        }
        const src = window.AudioClip.buffer();
        if (!src) throw new Error('No audio clip loaded');

        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ctx = new Offline(src.numberOfChannels, src.length, src.sampleRate);

        const source = ctx.createBufferSource();
        source.buffer = src; // AudioBuffers aren't context-bound; reuse across contexts
        const { output, sources } = individual._compileGraph(ctx, source, individual.phenotype);
        const master = ctx.createGain();
        master.gain.value = 0.9;
        output.connect(master);
        master.connect(ctx.destination);

        [source, ...sources].forEach(n => { try { n.start(0); } catch (_) { } });
        return await ctx.startRendering();
    },

    // RMS over all channels — a cheap "how loud overall" measure for silence
    // detection. Typical audible content is well above ~0.01; near-zero is silent.
    measureRMS(buffer) {
        let sum = 0, n = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const d = buffer.getChannelData(c);
            for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
            n += d.length;
        }
        return Math.sqrt(sum / Math.max(1, n));
    },

    /** True if rendering the individual's filter yields near-silence. */
    async isSilent(individual, threshold = 0.008) {
        try {
            const buffer = await this.renderToBuffer(individual);
            return this.measureRMS(buffer) < threshold;
        } catch (_) {
            return false; // couldn't render → don't claim silence
        }
    },

    // Encode an AudioBuffer as a 16-bit PCM WAV (interleaved) ArrayBuffer.
    // If metaJson is given, an extra "anmn" RIFF chunk carrying that UTF-8 string
    // is appended after the data chunk: conformant WAV decoders skip chunks they
    // don't recognise, so the file still plays everywhere, but the individual's
    // {type, genome, phenotype, phenoSig} provenance travels with it. RIFF chunks
    // are word-aligned, so an odd-length payload gets a trailing pad byte.
    encodeWAV(buffer, metaJson) {
        const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
        const blockAlign = numCh * 2;               // 16-bit
        const dataSize = len * blockAlign;

        let metaBytes = null, metaChunkSize = 0;
        if (metaJson != null) {
            metaBytes = new TextEncoder().encode(String(metaJson));
            const padded = metaBytes.length + (metaBytes.length & 1); // word-align
            metaChunkSize = 8 + padded;             // "anmn" + size + data(+pad)
        }

        const ab = new ArrayBuffer(44 + dataSize + metaChunkSize);
        const view = new DataView(ab);
        const wstr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

        wstr(0, 'RIFF'); view.setUint32(4, 36 + dataSize + metaChunkSize, true); wstr(8, 'WAVE');
        wstr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
        view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        wstr(36, 'data'); view.setUint32(40, dataSize, true);

        const chans = [];
        for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
        let off = 44;
        for (let i = 0; i < len; i++) {
            for (let c = 0; c < numCh; c++) {
                let s = chans[c][i];
                s = s < -1 ? -1 : s > 1 ? 1 : s;
                view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                off += 2;
            }
        }

        if (metaBytes) {
            wstr(off, 'anmn'); off += 4;
            view.setUint32(off, metaBytes.length, true); off += 4; // real (unpadded) length
            new Uint8Array(ab, off, metaBytes.length).set(metaBytes);
            // trailing pad byte (if any) is left as the ArrayBuffer's zero fill
        }
        return ab;
    },

    // ---- Read embedded provenance back out of a WAV -------------------------
    // Inverse of the "anmn" chunk written by encodeWAV: walk the RIFF chunks and
    // return the parsed {type, genome, phenotype, phenoSig} JSON, or null. This is
    // the load path's reader (symmetric with ImageSave.readMetadata for PNG).
    readMetadata(bytes) {
        if (!bytes || bytes.length < 12) return null;
        const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
        if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let pos = 12;
        while (pos + 8 <= bytes.length) {
            const id = tag(pos);
            const size = view.getUint32(pos + 4, true);
            if (id === 'anmn') {
                try { return JSON.parse(new TextDecoder().decode(bytes.subarray(pos + 8, pos + 8 + size))); }
                catch (e) { return null; }
            }
            pos += 8 + size + (size & 1); // chunks are word-aligned
        }
        return null;
    },

    readMetadataFromFile(file) {
        return file.arrayBuffer().then((buf) => this.readMetadata(new Uint8Array(buf)));
    },

    // Render + encode + download the filtered clip as a .wav. Returns the filename.
    async downloadWAV(individual) {
        const buffer = await this.renderToBuffer(individual);
        const meta = (window.ImageSave && window.ImageSave.metaFor)
            ? JSON.stringify(window.ImageSave.metaFor(individual)) : null;
        const wav = this.encodeWAV(buffer, meta);

        const filename = window.ExportNaming.filename(individual, 'wav');

        const blob = new Blob([wav], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return filename;
    }
};

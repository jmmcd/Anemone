/*
 * ImageSave.js — save a rendered canvas as a PNG with the individual's
 * genotype embedded as reproducible metadata.
 *
 * The genome (a PTO trace) plus the individual's type name is enough to
 * re-express any individual via PTORepresentation, so we embed exactly that.
 * It goes into an *uncompressed iTXt* ancillary chunk (UTF-8, keyword
 * "anemone"): conformant PNG decoders ignore chunks they don't recognise, so
 * the file still displays as an ordinary image everywhere, but Anemone (or any
 * future program) can read the chunk back and reconstruct the individual.
 *
 * iTXt is chosen over tEXt (Latin-1 only) and zTXt (needs a deflate
 * implementation): it is UTF-8, needs no compression dependency, and is trivial
 * to build by hand. Exposed as the global `window.ImageSave`.
 */
(function () {
    'use strict';

    // ---- CRC-32 (PNG polynomial), used for every chunk ------------------
    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    // ---- Build one uncompressed iTXt chunk ------------------------------
    // Layout: keyword\0 compressionFlag(0) compressionMethod(0) langTag\0
    //         translatedKeyword\0 text(UTF-8)
    function buildITxtChunk(keyword, text) {
        const enc = new TextEncoder();
        const keywordBytes = enc.encode(keyword);   // keyword must be Latin-1; "anemone" is ASCII
        const textBytes = enc.encode(text);

        const dataLen = keywordBytes.length + 1 /*null*/ + 1 /*compflag*/ +
            1 /*compmethod*/ + 1 /*langtag null*/ + 1 /*transkw null*/ + textBytes.length;
        const data = new Uint8Array(dataLen);
        let o = 0;
        data.set(keywordBytes, o); o += keywordBytes.length;
        data[o++] = 0;              // keyword terminator
        data[o++] = 0;              // compression flag: uncompressed
        data[o++] = 0;              // compression method
        data[o++] = 0;              // language tag (empty) terminator
        data[o++] = 0;              // translated keyword (empty) terminator
        data.set(textBytes, o);

        const type = new Uint8Array([0x69, 0x54, 0x58, 0x74]); // "iTXt"
        const chunk = new Uint8Array(4 + 4 + data.length + 4);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, data.length);          // length (data only)
        chunk.set(type, 4);
        chunk.set(data, 8);
        // CRC covers type + data
        const crcInput = new Uint8Array(type.length + data.length);
        crcInput.set(type, 0);
        crcInput.set(data, type.length);
        view.setUint32(8 + data.length, crc32(crcInput));
        return chunk;
    }

    // ---- Insert a chunk into a PNG just before IEND ---------------------
    function insertChunk(pngBytes, chunk) {
        // PNG = 8-byte signature, then chunks. Walk to IEND and splice before it.
        let pos = 8;
        const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
        while (pos < pngBytes.length) {
            const len = view.getUint32(pos);
            const type = String.fromCharCode(
                pngBytes[pos + 4], pngBytes[pos + 5], pngBytes[pos + 6], pngBytes[pos + 7]
            );
            if (type === 'IEND') break;
            pos += 12 + len; // length(4) + type(4) + data + crc(4)
        }
        const out = new Uint8Array(pngBytes.length + chunk.length);
        out.set(pngBytes.subarray(0, pos), 0);
        out.set(chunk, pos);
        out.set(pngBytes.subarray(pos), pos + chunk.length);
        return out;
    }

    // Single-file download names come from window.ExportNaming (shared with the
    // STL/WAV exports); batch/zip entries keep their own per-archive index below.

    // ---- Phenotype signature -------------------------------------------
    // A short hash of the individual's expressed phenotype, embedded alongside
    // the genome so a *loader* can verify reproduction: reconstruct from the
    // genome, recompute the signature, and refuse if it doesn't match. This is
    // what makes load trustworthy despite the upstream PTO trace-serialisation
    // limitation (see pto-trace-roundtrip-bug.js) that stops grammar individuals
    // — and Sheep's per-instance random network — from round-tripping.
    function phenotypeSignature(individual) {
        let pheno;
        try { pheno = individual.getPhenotype ? individual.getPhenotype() : individual.phenotype; }
        catch (e) { return null; }
        let str;
        try { str = JSON.stringify(pheno); } catch (e) { str = undefined; }
        if (str === undefined) str = String(pheno);
        // FNV-1a 32-bit
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    // Best-effort snapshot of the expressed phenotype, for embedding alongside
    // the genome. The genome is a PTO trace, and can lose its meaning if a
    // generator/grammar changes later; the phenotype (an expression string, note
    // list, plain-data tree/DAG, param array…) stays informative to future code.
    // Uses the same getPhenotype→phenotype fallback as the signature; anything
    // that doesn't survive JSON is simply omitted.
    function phenotypeOf(individual) {
        let pheno;
        try { pheno = individual.getPhenotype ? individual.getPhenotype() : individual.phenotype; }
        catch (e) { return undefined; }
        try { JSON.stringify(pheno); } catch (e) { return undefined; } // must round-trip through JSON
        return pheno;
    }

    // ---- Reproducible metadata embedded in every saved PNG --------------
    // The single source of the provenance object shared across PNG (iTXt chunk),
    // WAV (RIFF chunk) and MIDI (meta event) exports and the liked-ZIP manifest.
    function metaFor(individual) {
        return {
            app: 'Anemone',
            type: individual && individual.constructor && individual.constructor.name,
            id: individual && individual.id,
            timestamp: new Date().toISOString(),
            phenoSig: phenotypeSignature(individual),
            phenotype: phenotypeOf(individual),
            genome: individual && individual.genome,
        };
    }

    // ---- Render a canvas to PNG bytes with the individual's genome embedded.
    // The shared core of both single-image save and the bulk ZIP export: it
    // produces the same metadata-carrying, reloadable PNG, just without
    // triggering a download (the caller decides what to do with the bytes).
    function buildPngBytes(canvas, individual) {
        return new Promise((resolve, reject) => {
            if (!canvas || !canvas.toBlob) { reject(new Error('No canvas to save')); return; }
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
                blob.arrayBuffer().then((buf) => {
                    let bytes = new Uint8Array(buf);
                    try {
                        const chunk = buildITxtChunk('anemone', JSON.stringify(metaFor(individual)));
                        bytes = insertChunk(bytes, chunk);
                    } catch (e) {
                        console.warn('Could not embed metadata, saving plain PNG:', e);
                    }
                    resolve(bytes);
                }).catch(reject);
            }, 'image/png');
        });
    }

    // ---- Public: save a canvas + individual to a downloaded PNG ----------
    function saveCanvas(canvas, individual) {
        return buildPngBytes(canvas, individual).then((bytes) => {
            const filename = window.ExportNaming.filename(individual, 'png');
            triggerDownload(new Blob([bytes], { type: 'image/png' }), filename);
            return filename;
        });
    }

    // ---- Compose several canvases into one bordered montage canvas -------
    // Lays the tiles out in a grid with a uniform border/gutter on a solid
    // background. Tiles are assumed uniform in size (the 128px grid canvases);
    // the first canvas's dimensions set the tile size. Returns a new canvas.
    function composeMontage(canvases, opts) {
        opts = opts || {};
        const tiles = (canvases || []).filter(Boolean);
        if (tiles.length === 0) throw new Error('No canvases to compose');
        const border = opts.border != null ? opts.border : 8;
        const gap = opts.gap != null ? opts.gap : border;
        const bg = opts.background || '#111';
        const cols = opts.cols || Math.ceil(Math.sqrt(tiles.length));
        const rows = Math.ceil(tiles.length / cols);
        const tw = tiles[0].width, th = tiles[0].height;
        const W = border * 2 + cols * tw + (cols - 1) * gap;
        const H = border * 2 + rows * th + (rows - 1) * gap;
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const ctx = out.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        tiles.forEach((c, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const x = border + col * (tw + gap);
            const y = border + row * (th + gap);
            ctx.drawImage(c, x, y, tw, th);
        });
        return out;
    }

    // ---- Build a ZIP archive (STORE / no compression) from byte entries --
    // entries: [{ name, bytes: Uint8Array }]. PNGs are already compressed, so
    // STORE loses nothing and keeps this dependency-free — the CRC-32 the ZIP
    // format needs is the very same routine the PNG chunks use above. Hand-rolled
    // in the spirit of the PNG-chunk and STL writers already in this repo.
    function buildZip(entries) {
        const enc = new TextEncoder();
        const parts = [];      // local headers + file data, in order
        const central = [];    // central directory records
        let offset = 0;

        for (const entry of entries) {
            const nameBytes = enc.encode(entry.name);
            const data = entry.bytes;
            const crc = crc32(data);
            const size = data.length;

            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);   // local file header signature
            lv.setUint16(4, 20, true);           // version needed to extract
            lv.setUint16(6, 0, true);            // general purpose flags
            lv.setUint16(8, 0, true);            // compression method: store
            lv.setUint16(10, 0, true);           // last mod file time
            lv.setUint16(12, 0, true);           // last mod file date
            lv.setUint32(14, crc, true);
            lv.setUint32(18, size, true);        // compressed size
            lv.setUint32(22, size, true);        // uncompressed size
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);           // extra field length
            local.set(nameBytes, 30);
            parts.push(local, data);

            const cen = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(cen.buffer);
            cv.setUint32(0, 0x02014b50, true);   // central directory signature
            cv.setUint16(4, 20, true);           // version made by
            cv.setUint16(6, 20, true);           // version needed to extract
            cv.setUint16(8, 0, true);            // flags
            cv.setUint16(10, 0, true);           // compression method
            cv.setUint16(12, 0, true);           // time
            cv.setUint16(14, 0, true);           // date
            cv.setUint32(16, crc, true);
            cv.setUint32(20, size, true);
            cv.setUint32(24, size, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);           // extra length
            cv.setUint16(32, 0, true);           // comment length
            cv.setUint16(34, 0, true);           // disk number start
            cv.setUint16(36, 0, true);           // internal attributes
            cv.setUint32(38, 0, true);           // external attributes
            cv.setUint32(42, offset, true);      // offset of local header
            cen.set(nameBytes, 46);
            central.push(cen);

            offset += local.length + data.length;
        }

        const centralSize = central.reduce((s, c) => s + c.length, 0);
        const centralOffset = offset;

        const end = new Uint8Array(22);
        const ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true);       // end of central directory signature
        ev.setUint16(4, 0, true);                // number of this disk
        ev.setUint16(6, 0, true);                // disk with central directory
        ev.setUint16(8, entries.length, true);   // entries on this disk
        ev.setUint16(10, entries.length, true);  // total entries
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, centralOffset, true);
        ev.setUint16(20, 0, true);               // comment length

        const all = parts.concat(central, [end]);
        const total = all.reduce((s, a) => s + a.length, 0);
        const out = new Uint8Array(total);
        let p = 0;
        for (const a of all) { out.set(a, p); p += a.length; }
        return out;
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke after the click has a chance to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---- Public: read embedded metadata back out of a PNG ---------------
    // (round-trip helper for future "load image -> reproduce" features/tests)
    function readMetadata(pngBytes) {
        const dec = new TextDecoder();
        let pos = 8;
        const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
        while (pos < pngBytes.length) {
            const len = view.getUint32(pos);
            const type = String.fromCharCode(
                pngBytes[pos + 4], pngBytes[pos + 5], pngBytes[pos + 6], pngBytes[pos + 7]
            );
            if (type === 'iTXt') {
                const data = pngBytes.subarray(pos + 8, pos + 8 + len);
                let i = 0;
                while (i < data.length && data[i] !== 0) i++;       // keyword
                const keyword = dec.decode(data.subarray(0, i));
                i += 1;                                              // keyword null
                i += 2;                                              // comp flag + method
                while (i < data.length && data[i] !== 0) i++; i += 1; // language tag
                while (i < data.length && data[i] !== 0) i++; i += 1; // translated keyword
                if (keyword === 'anemone') {
                    try { return JSON.parse(dec.decode(data.subarray(i))); } catch (e) { return null; }
                }
            }
            if (type === 'IEND') break;
            pos += 12 + len;
        }
        return null;
    }

    // ---- Public: read embedded metadata out of a File (the load path) ----
    function readMetadataFromFile(file) {
        return file.arrayBuffer().then((buf) => readMetadata(new Uint8Array(buf)));
    }

    window.ImageSave = {
        saveCanvas, buildPngBytes, composeMontage, buildZip, download: triggerDownload,
        readMetadata, readMetadataFromFile, phenotypeSignature, metaFor,
        buildITxtChunk, insertChunk, crc32,
    };
})();

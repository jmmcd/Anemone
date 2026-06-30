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

    // ---- Filename helper: anemone-<type>-<NNNN>.png ---------------------
    const COUNTER_KEY = 'anemone:saveCounter';

    function nextFilename(typeName) {
        let n = 0;
        try { n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) || 0; } catch (e) { /* private mode */ }
        n += 1;
        try { localStorage.setItem(COUNTER_KEY, String(n)); } catch (e) { /* ignore */ }
        const type = String(typeName || 'Individual')
            .replace(/Individual$/, '')      // AnemoneIndividual -> Anemone
            .replace(/[^A-Za-z0-9]+/g, '')
            .toLowerCase() || 'individual';
        const seq = String(n).padStart(4, '0');
        return `anemone-${type}-${seq}.png`;
    }

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

    // ---- Public: save a canvas + individual to a downloaded PNG ----------
    function saveCanvas(canvas, individual) {
        return new Promise((resolve, reject) => {
            if (!canvas || !canvas.toBlob) { reject(new Error('No canvas to save')); return; }
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
                blob.arrayBuffer().then((buf) => {
                    let bytes = new Uint8Array(buf);
                    try {
                        const meta = {
                            app: 'Anemone',
                            type: individual && individual.constructor && individual.constructor.name,
                            id: individual && individual.id,
                            timestamp: new Date().toISOString(),
                            phenoSig: phenotypeSignature(individual),
                            genome: individual && individual.genome,
                        };
                        const chunk = buildITxtChunk('anemone', JSON.stringify(meta));
                        bytes = insertChunk(bytes, chunk);
                    } catch (e) {
                        console.warn('Could not embed metadata, saving plain PNG:', e);
                    }
                    const filename = nextFilename(individual && individual.constructor && individual.constructor.name);
                    triggerDownload(new Blob([bytes], { type: 'image/png' }), filename);
                    resolve(filename);
                }).catch(reject);
            }, 'image/png');
        });
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
        saveCanvas, readMetadata, readMetadataFromFile, phenotypeSignature,
        nextFilename, buildITxtChunk, insertChunk, crc32,
    };
})();

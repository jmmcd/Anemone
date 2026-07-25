#!/usr/bin/env node
/**
 * eeg-osc-sender.js — replay an EEG CSV to Anemone as OSC-over-WebSocket.
 *
 * Reads an EEG CSV and computes the 5 features Anemone's EEG sonifier expects (mean /
 * variance / peak / baseline / left-right asymmetry over the channels), then streams them
 * RAW as OSC messages "/eeg f f f f f" over a WebSocket. Anemone normalises the feed
 * adaptively as it arrives (window.OSCInput's running normaliser) — the same way it must
 * for a genuine live EEG source — so this script just transports the signal. Anemone's
 * EEGSonificationIndividual reads window.OSCInput, so open the "OSC Input" panel there
 * and connect to this server.
 *
 * Two CSV layouts are auto-detected:
 *   - Muse headband: columns like Alpha_TP9, Beta_AF7, … — the Alpha/Beta/Theta band
 *     channels are used (other columns, e.g. RAW_/Accelerometer, are ignored).
 *   - Generic: a leading timestamp column then raw channels (ch1, ch2, …) — every
 *     numeric column after the first is used (see data/EEG/sample_eeg.csv).
 * Both feed the same feature extraction (ported from Anemone's old EEGPreprocessing).
 *
 * A browser can't receive UDP, so OSC rides on a WebSocket. This script IS the server;
 * Anemone connects to it as the client. Zero dependencies — Node's built-in http/crypto
 * do the WebSocket handshake and frame the (unmasked, server→client) binary messages.
 *
 * Usage:
 *   node scripts/eeg-osc-sender.js path/to/eeg.csv [options]
 *   node scripts/eeg-osc-sender.js data/EEG/sample_eeg.csv --loop
 *
 * Options:
 *   --port <n>        WebSocket port to listen on          (default 8080)
 *   --interval <ms>   delay between samples                (default 200)
 *   --downsample <n>  keep every nth CSV row               (default 1)
 *   --address <addr>  OSC address to send on               (default /eeg)
 *   --loop            repeat from the start when finished
 *   --help
 *
 * Then in Anemone: pick "EEG Sonification", open the OSC Input drawer, tick "Receive OSC"
 * (default ws://localhost:8080), and press play.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

// ---- args ----------------------------------------------------------------

function parseArgs(argv) {
    const opts = { port: 8080, interval: 200, downsample: 1, address: '/eeg', loop: false, file: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') opts.help = true;
        else if (a === '--loop') opts.loop = true;
        else if (a === '--port') opts.port = parseInt(argv[++i], 10);
        else if (a === '--interval') opts.interval = parseInt(argv[++i], 10);
        else if (a === '--downsample') opts.downsample = parseInt(argv[++i], 10);
        else if (a === '--address') opts.address = argv[++i];
        else if (!a.startsWith('-') && !opts.file) opts.file = a;
    }
    return opts;
}

const HELP = `eeg-osc-sender.js — replay an EEG CSV to Anemone over OSC/WebSocket

  node scripts/eeg-osc-sender.js path/to/eeg.csv [--port 8080] [--interval 200]
       [--downsample 1] [--address /eeg] [--loop]

Auto-detects Muse band columns (Alpha_TP9, …) or a generic timestamp+channels CSV
(e.g. data/EEG/sample_eeg.csv). Then connect Anemone's "OSC Input" panel to
ws://localhost:<port>.`;

// ---- Muse CSV → 5 features ----------------------------------------------

const BANDS = ['Alpha', 'Beta', 'Theta'];
const CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'];

// Column indices for each requested band's channels, in header order (so per band the
// values land in TP9, AF7, AF8, TP10 order — what the asymmetry feature assumes).
function findBandIndices(headers) {
    const indices = [];
    for (const band of BANDS) {
        for (let col = 0; col < headers.length; col++) {
            const h = headers[col];
            if (h.startsWith(band + '_') && CHANNELS.includes(h.slice(band.length + 1))) {
                indices.push(col);
            }
        }
    }
    return indices;
}

// The 5 per-sample statistics Anemone's EEG sonifier drives its DAG inputs with: spatial
// mean / spread / peak / baseline over the channels, plus a left-right asymmetry. These
// are sent RAW (in the CSV's own units) — Anemone normalises each feature adaptively as
// it streams in (window.OSCInput's running normaliser), which is what a live EEG source
// needs too (there's no end-of-file to min-max over). So this script is a faithful
// transport of the feature signal; the scaling that keeps it in a useful range lives at
// the receiver, not here.
function rawFeatures(channels) {
    if (!channels.length) return [0, 0, 0, 0, 0];
    const mean = channels.reduce((a, b) => a + b, 0) / channels.length;
    const variance = channels.reduce((s, v) => s + (v - mean) ** 2, 0) / channels.length;
    const std = Math.sqrt(variance);
    const max = Math.max(...channels);
    const min = Math.min(...channels);
    let asym = 0;
    if (channels.length >= 4 && Math.floor(channels.length / 3) >= 4) {
        const leftAvg = (channels[1] + channels[0]) / 2;   // AF7 + TP9
        const rightAvg = (channels[3] + channels[2]) / 2;  // TP10 + AF8
        asym = leftAvg - rightAvg;
    }
    return [mean, std, max, min, asym];
}

// Choose which columns are EEG channels: Muse band columns if present, otherwise every
// column after the first (the timestamp). Returns { indices, format }.
function detectChannelColumns(headers) {
    const bandIdx = findBandIndices(headers);
    if (bandIdx.length) return { indices: bandIdx, format: 'Muse band' };
    const indices = [];
    for (let col = 1; col < headers.length; col++) indices.push(col); // skip timestamp col 0
    return { indices, format: 'generic channel' };
}

function loadSamples(file, downsample) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV has no data rows');

    const headers = lines[0].split(',').map(h => h.trim());
    const { indices, format } = detectChannelColumns(headers);
    if (!indices.length) throw new Error('No channel columns found (need a timestamp column plus channels)');

    const raw = [];
    let row = 0;
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 2) continue;
        const channels = [];
        for (const idx of indices) {
            const v = parseFloat(parts[idx]);
            if (!isNaN(v)) channels.push(v);
        }
        if (channels.length < indices.length) continue;   // skip event/partial rows
        if (row++ % downsample !== 0) continue;            // downsample
        raw.push(rawFeatures(channels));
    }
    return { samples: raw, format, channelCount: indices.length };
}

// ---- OSC encoding --------------------------------------------------------

function oscString(str) {
    const bytes = Buffer.from(str + '\0', 'ascii');
    const pad = (4 - (bytes.length % 4)) % 4;
    return pad ? Buffer.concat([bytes, Buffer.alloc(pad)]) : bytes;
}

function oscMessage(address, floats) {
    const addr = oscString(address);
    const types = oscString(',' + 'f'.repeat(floats.length));
    const args = Buffer.alloc(floats.length * 4);
    floats.forEach((f, i) => args.writeFloatBE(f, i * 4));
    return Buffer.concat([addr, types, args]);
}

// ---- Minimal WebSocket server (server→client binary frames only) ---------

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Frame an unmasked binary payload (opcode 0x2). Server→client frames are never masked.
function wsFrame(payload) {
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x82, len]);
    } else if (len < 65536) {
        header = Buffer.from([0x82, 126, (len >> 8) & 0xff, len & 0xff]);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x82; header[1] = 127;
        header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
        header.writeUInt32BE(len >>> 0, 6);
    }
    return Buffer.concat([header, payload]);
}

function startServer(port, onClient) {
    const clients = new Set();
    const server = http.createServer((req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('This is a WebSocket endpoint for OSC. Connect with ws://\n');
    });

    server.on('upgrade', (req, socket) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) { socket.destroy(); return; }
        const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
        );
        socket.setNoDelay(true);
        clients.add(socket);
        console.log(`  ↳ client connected (${clients.size} total)`);
        const drop = () => {
            if (clients.delete(socket)) console.log(`  ↳ client disconnected (${clients.size} total)`);
        };
        socket.on('close', drop);
        socket.on('error', drop);
        // We don't decode inbound frames; just watch for the close handshake byte.
        socket.on('data', (buf) => { if (buf.length && (buf[0] & 0x0f) === 0x8) socket.end(); });
        onClient(clients.size);
    });

    server.listen(port, () => {
        console.log(`OSC/WebSocket server listening on ws://localhost:${port}`);
    });

    return {
        broadcast(payload) {
            const frame = wsFrame(payload);
            for (const s of clients) { try { s.write(frame); } catch (e) { clients.delete(s); } }
        },
        clientCount: () => clients.size,
    };
}

// ---- main ----------------------------------------------------------------

function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help || !opts.file) { console.log(HELP); process.exit(opts.help ? 0 : 1); }

    let samples, format, channelCount;
    try {
        ({ samples, format, channelCount } = loadSamples(opts.file, opts.downsample));
    } catch (err) {
        console.error(`Failed to read ${opts.file}: ${err.message}`);
        process.exit(1);
    }
    if (!samples.length) { console.error('No usable samples parsed from CSV.'); process.exit(1); }

    console.log(`Loaded ${samples.length} samples from ${opts.file} ` +
        `(${format} format, ${channelCount} channels, ` +
        `~${((samples.length * opts.interval) / 1000).toFixed(1)}s at ${opts.interval}ms/sample).`);
    console.log(`Sending OSC "${opts.address} f f f f f"${opts.loop ? ' (looping)' : ''}. Ctrl-C to stop.`);

    const wss = startServer(opts.port, () => {});

    let idx = 0;
    setInterval(() => {
        if (wss.clientCount() === 0) return;   // idle until Anemone connects
        if (idx >= samples.length) {
            if (opts.loop) { idx = 0; } else { console.log('Reached end of CSV.'); return; }
        }
        wss.broadcast(oscMessage(opts.address, samples[idx]));
        idx++;
    }, Math.max(1, opts.interval));
}

main();

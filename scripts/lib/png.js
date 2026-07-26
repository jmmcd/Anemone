/**
 * png.js — a tiny, dependency-free PNG writer + raster helper for offline/headless
 * rendering in Node (dev tooling only; the app itself never uses this).
 *
 * The repo is deliberately dependency-free, so when a session needs to *see* what a
 * generator or projection produces without a browser (e.g. checking a JennPolytope
 * shape, an EEG waveform, a debug plot), there's no canvas library to lean on. This
 * module is the reusable version of the hand-rolled encoder that kept getting
 * rewritten in scratch scripts: 8-bit truecolour PNG via Node's built-in `zlib`,
 * plus a small `Raster` (white-backed RGB buffer with `setPixel`/`line`).
 *
 * Usage:
 *   const { Raster } = require('./lib/png');
 *   const r = new Raster(500, 500);
 *   r.line(10, 10, 490, 490, [30, 30, 30], 0.6);   // colour, alpha
 *   r.save('out.png');
 */
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
    let crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        let c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

/**
 * Encode an RGB byte buffer (length W*H*3, row-major) as a PNG and write it to `file`.
 */
function writePNG(file, W, H, rgb) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2;   // 8-bit depth, truecolour (RGB)
    const raw = Buffer.alloc(H * (W * 3 + 1));
    for (let y = 0; y < H; y++) {
        raw[y * (W * 3 + 1)] = 0;   // filter byte: none
        rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
    }
    const idat = zlib.deflateSync(raw);
    fs.writeFileSync(file, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

/** A white-backed RGB canvas with alpha-blended pixel/line drawing. */
class Raster {
    constructor(width, height, bg = 255) {
        this.width = width; this.height = height;
        this.buf = Buffer.alloc(width * height * 3, bg);
    }
    setPixel(x, y, [r, g, b], a = 1) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
        const i = (y * this.width + x) * 3;
        this.buf[i] = Math.round(this.buf[i] * (1 - a) + r * a);
        this.buf[i + 1] = Math.round(this.buf[i + 1] * (1 - a) + g * a);
        this.buf[i + 2] = Math.round(this.buf[i + 2] * (1 - a) + b * a);
    }
    line(x0, y0, x1, y1, color, a = 1) {
        const dx = x1 - x0, dy = y1 - y0;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
        for (let s = 0; s <= steps; s++) this.setPixel(x0 + dx * s / steps, y0 + dy * s / steps, color, a);
    }
    save(file) { writePNG(file, this.width, this.height, this.buf); }
}

module.exports = { writePNG, Raster, crc32 };

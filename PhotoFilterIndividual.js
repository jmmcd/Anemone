/**
 * PhotoFilterIndividual
 *
 * Evolves a *photo filter*: a short chain of image-processing primitives applied
 * to the shared photo (window.Photo). The genome (a PTO trace) encodes an ordered
 * list of ops — each op is a {type, p:[3 floats]} record — and visualize() runs
 * the chain over the source pixels. The photo itself is NOT in the genome, so the
 * user can replace it (PhotoControlUI) and keep evolving the same filters.
 *
 * PTO notes: the generator is self-contained and references only the top-level
 * PHOTO_FILTER_TYPES const; ops are built with an explicit for-loop (variable
 * length), and params are a plain array literal of rnd.uniform calls (three
 * distinct call sites) — both required for structural naming to align genes.
 */

// Typical photo-filter primitives. A top-level const so the (isolated) generator
// may reference it. Point ops act per pixel; blur/sharpen are neighbourhood passes.
const PHOTO_FILTER_TYPES = [
    'brightness', 'contrast', 'gamma', 'saturation', 'hueRotate', 'invert',
    'tint', 'posterize', 'threshold', 'solarize', 'sepia', 'vignette',
    'channelMix', 'blur', 'sharpen', 'tiltShift', 'gradientMap'
];

const photoFilterGenerator = (rnd) => {
    const ops = [];
    const n = rnd.randint(2, 6);
    for (let i = 0; i < n; i++) {
        ops.push({
            type: rnd.choice(PHOTO_FILTER_TYPES),
            p: [rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1)]
        });
    }
    return ops;
};

const photoFilterRepresentation = new PTORepresentation(photoFilterGenerator);

class PhotoFilterIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = photoFilterRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    // The palette drives the tint / gradientMap ops (and attaches the palette UI).
    usesColorPalette() { return true; }

    // Opt into the Photo panel (framework attaches PhotoControlUI).
    usesPhoto() { return true; }

    // Cache must refresh when the filter chain, the photo, or the palette changes.
    renderKey() {
        return JSON.stringify(this.phenotype) + '|photo' + window.Photo.version()
            + '|' + window.Palette.name();
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const src = window.Photo.sourceImageData(width, height); // shared, read-only
            const out = ctx.createImageData(width, height);
            out.data.set(src.data);
            this.applyChain(out.data, width, height, this.phenotype);
            return out;
        });
    }

    describeExtra() {
        const ops = this.phenotype;
        if (!Array.isArray(ops) || ops.length === 0) return '';
        return `<span class="genome-label">Filter chain:</span>\n  ${ops.map(o => o.type).join(' → ')}\n`;
    }

    // --- Filter pipeline --------------------------------------------------
    // Each op mutates the Uint8ClampedArray `d` (RGBA) in place. Point ops read
    // p[] as [0,1] control values; neighbourhood ops (blur/sharpen) rebuild a
    // blurred copy. Alpha is left at 255 throughout.

    applyChain(d, w, h, ops) {
        for (const op of ops) this.applyOp(d, w, h, op.type, op.p);
    }

    applyOp(d, w, h, type, p) {
        const n = d.length;
        switch (type) {
            case 'brightness': {
                const amt = (p[0] - 0.5) * 2 * 255;
                for (let i = 0; i < n; i += 4) { d[i] += amt; d[i + 1] += amt; d[i + 2] += amt; }
                break;
            }
            case 'contrast': {
                const c = (p[0] - 0.5) * 2 * 255;
                const f = (259 * (c + 255)) / (255 * (259 - c));
                for (let i = 0; i < n; i += 4) {
                    d[i] = f * (d[i] - 128) + 128;
                    d[i + 1] = f * (d[i + 1] - 128) + 128;
                    d[i + 2] = f * (d[i + 2] - 128) + 128;
                }
                break;
            }
            case 'gamma': {
                const g = 0.2 + p[0] * 2.3; // 0.2 .. 2.5
                const lut = new Uint8ClampedArray(256);
                for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, g);
                for (let i = 0; i < n; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
                break;
            }
            case 'saturation': {
                const s = p[0] * 2; // 0 (grey) .. 2 (boosted)
                for (let i = 0; i < n; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    d[i] = lum + (d[i] - lum) * s;
                    d[i + 1] = lum + (d[i + 1] - lum) * s;
                    d[i + 2] = lum + (d[i + 2] - lum) * s;
                }
                break;
            }
            case 'hueRotate': {
                const a = p[0] * Math.PI * 2;
                const cos = Math.cos(a), sin = Math.sin(a);
                const m0 = 0.213 + cos * 0.787 - sin * 0.213, m1 = 0.715 - cos * 0.715 - sin * 0.715, m2 = 0.072 - cos * 0.072 + sin * 0.928;
                const m3 = 0.213 - cos * 0.213 + sin * 0.143, m4 = 0.715 + cos * 0.285 + sin * 0.140, m5 = 0.072 - cos * 0.072 - sin * 0.283;
                const m6 = 0.213 - cos * 0.213 - sin * 0.787, m7 = 0.715 - cos * 0.715 + sin * 0.715, m8 = 0.072 + cos * 0.928 + sin * 0.072;
                for (let i = 0; i < n; i += 4) {
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    d[i] = r * m0 + g * m1 + b * m2;
                    d[i + 1] = r * m3 + g * m4 + b * m5;
                    d[i + 2] = r * m6 + g * m7 + b * m8;
                }
                break;
            }
            case 'invert': {
                const a = p[0];
                for (let i = 0; i < n; i += 4) {
                    d[i] += (255 - 2 * d[i]) * a;
                    d[i + 1] += (255 - 2 * d[i + 1]) * a;
                    d[i + 2] += (255 - 2 * d[i + 2]) * a;
                }
                break;
            }
            case 'tint': {
                const col = window.Palette.color(p[1]);
                const s = p[0];
                for (let i = 0; i < n; i += 4) {
                    d[i] = d[i] * (1 - s) + col.r * s;
                    d[i + 1] = d[i + 1] * (1 - s) + col.g * s;
                    d[i + 2] = d[i + 2] * (1 - s) + col.b * s;
                }
                break;
            }
            case 'posterize': {
                const levels = 2 + Math.floor(p[0] * 6); // 2 .. 7
                const step = 255 / (levels - 1);
                for (let i = 0; i < n; i += 4) {
                    d[i] = Math.round(d[i] / step) * step;
                    d[i + 1] = Math.round(d[i + 1] / step) * step;
                    d[i + 2] = Math.round(d[i + 2] / step) * step;
                }
                break;
            }
            case 'threshold': {
                const t = p[0] * 255;
                const s = p[1]; // blend toward the black/white result
                for (let i = 0; i < n; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    const bw = lum > t ? 255 : 0;
                    d[i] = d[i] * (1 - s) + bw * s;
                    d[i + 1] = d[i + 1] * (1 - s) + bw * s;
                    d[i + 2] = d[i + 2] * (1 - s) + bw * s;
                }
                break;
            }
            case 'solarize': {
                const t = p[0] * 255;
                for (let i = 0; i < n; i += 4) {
                    if (d[i] > t) d[i] = 255 - d[i];
                    if (d[i + 1] > t) d[i + 1] = 255 - d[i + 1];
                    if (d[i + 2] > t) d[i + 2] = 255 - d[i + 2];
                }
                break;
            }
            case 'sepia': {
                const s = p[0];
                for (let i = 0; i < n; i += 4) {
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    const nr = r * 0.393 + g * 0.769 + b * 0.189;
                    const ng = r * 0.349 + g * 0.686 + b * 0.168;
                    const nb = r * 0.272 + g * 0.534 + b * 0.131;
                    d[i] = r * (1 - s) + nr * s;
                    d[i + 1] = g * (1 - s) + ng * s;
                    d[i + 2] = b * (1 - s) + nb * s;
                }
                break;
            }
            case 'vignette': {
                const strength = p[0] * 1.5;
                const radius = 0.3 + p[1] * 0.7; // where darkening begins (fraction of half-diagonal)
                const cx = w / 2, cy = h / 2;
                const maxD = Math.sqrt(cx * cx + cy * cy);
                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD;
                        let f = 1;
                        if (dist > radius) f = Math.max(0, 1 - strength * (dist - radius) / (1 - radius));
                        const i = (y * w + x) * 4;
                        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
                    }
                }
                break;
            }
            case 'channelMix': {
                const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
                const perm = perms[Math.min(5, Math.floor(p[0] * 6))];
                for (let i = 0; i < n; i += 4) {
                    const c = [d[i], d[i + 1], d[i + 2]];
                    d[i] = c[perm[0]]; d[i + 1] = c[perm[1]]; d[i + 2] = c[perm[2]];
                }
                break;
            }
            case 'blur': {
                const radius = 1 + Math.floor(p[0] * 3); // 1 .. 3
                const b = this.boxBlur(d, w, h, radius);
                d.set(b);
                break;
            }
            case 'sharpen': {
                const amt = p[0] * 1.5;
                const b = this.boxBlur(d, w, h, 1);
                for (let i = 0; i < n; i += 4) {
                    d[i] += (d[i] - b[i]) * amt;
                    d[i + 1] += (d[i + 1] - b[i + 1]) * amt;
                    d[i + 2] += (d[i + 2] - b[i + 2]) * amt;
                }
                break;
            }
            case 'tiltShift': {
                // Miniature/"toy" look: keep a horizontal focus band sharp and
                // blend toward a fully-blurred copy with vertical distance from it.
                const focus = p[0];                       // band centre (fraction of height)
                const bandHalf = 0.06 + p[1] * 0.24;      // sharp half-height
                const radius = 2 + Math.floor(p[2] * 4);  // 2 .. 6
                const falloff = 0.22;                     // how fast focus falls off past the band
                const blurred = this.boxBlur(d, w, h, radius);
                for (let y = 0; y < h; y++) {
                    let t = (Math.abs(y / h - focus) - bandHalf) / falloff;
                    t = t < 0 ? 0 : (t > 1 ? 1 : t);
                    if (t === 0) continue;                // inside the band: leave sharp
                    for (let x = 0; x < w; x++) {
                        const i = (y * w + x) * 4;
                        d[i] = d[i] * (1 - t) + blurred[i] * t;
                        d[i + 1] = d[i + 1] * (1 - t) + blurred[i + 1] * t;
                        d[i + 2] = d[i + 2] * (1 - t) + blurred[i + 2] * t;
                    }
                }
                break;
            }
            case 'gradientMap': {
                const s = p[0];
                // Map luminance through the current palette; cache 256 lookups.
                const lut = [];
                for (let v = 0; v < 256; v++) lut.push(window.Palette.color(v / 255));
                for (let i = 0; i < n; i += 4) {
                    const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
                    const col = lut[lum];
                    d[i] = d[i] * (1 - s) + col.r * s;
                    d[i + 1] = d[i + 1] * (1 - s) + col.g * s;
                    d[i + 2] = d[i + 2] * (1 - s) + col.b * s;
                }
                break;
            }
        }
    }

    // Separable box blur of the RGB channels → a new Uint8ClampedArray (edge-clamped).
    boxBlur(d, w, h, radius) {
        const out = new Uint8ClampedArray(d.length);
        const tmp = new Uint8ClampedArray(d.length);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let k = -radius; k <= radius; k++) {
                    let xx = x + k; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
                    const j = (y * w + xx) * 4; r += d[j]; g += d[j + 1]; b += d[j + 2]; cnt++;
                }
                const i = (y * w + x) * 4; tmp[i] = r / cnt; tmp[i + 1] = g / cnt; tmp[i + 2] = b / cnt; tmp[i + 3] = 255;
            }
        }
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let k = -radius; k <= radius; k++) {
                    let yy = y + k; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
                    const j = (yy * w + x) * 4; r += tmp[j]; g += tmp[j + 1]; b += tmp[j + 2]; cnt++;
                }
                const i = (y * w + x) * 4; out[i] = r / cnt; out[i + 1] = g / cnt; out[i + 2] = b / cnt; out[i + 3] = 255;
            }
        }
        return out;
    }
}

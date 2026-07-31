/**
 * PhotoFilterIndividual — a whole-image DAG photo filter (CGP-IP style).
 *
 * Evolves a directed acyclic *graph* of whole-image operations over the shared
 * photo (window.Photo). The source photo is node 0; each processing node applies
 * a unary op (blur, gamma, edges, tiltShift, …) or a BINARY combiner (add,
 * difference, blend, lighten, …) to earlier nodes' images; the output node selects
 * a final image. Because nodes can be reused and recombined, you get compositions
 * a linear chain can't — e.g. compute an edge map, blur it, and difference it back
 * over the original. Every edge carries an image and every op is image→image (or
 * image,image→image), so closure is trivial (any output can feed any input) — the
 * property that makes this a clean GP substrate. (This replaced the earlier linear
 * op-chain filter, which is just a degenerate DAG with no branching.)
 *
 * The photo is NOT in the genome, so the user can replace it (PhotoControlUI) and
 * keep evolving the same filters.
 *
 * Representation: PTO, same plain-data / index-based / acyclic shape as the audio
 * DAGs (mouseMusicGenerator): the generator is self-contained (top-level consts
 * only, no closure, no `new`) and emits connections as indices into earlier nodes.
 * The trace is the genotype; the plain-data graph is the phenotype. Unlike the
 * audio DAG this graph is a *pure, stateless function* of the source image, so it
 * is evaluated by a direct memoised walk here rather than instantiated into
 * stateful node objects (buildDAG) — hence it doesn't use DAGRepresentation.js.
 *
 * Images are carried as { w, h, data:Float32Array } RGB (0..255) so many passes
 * compose without repeated 8-bit rounding; clamped to bytes only at output.
 */

// Op library. Unary ops are image→image; binary ops are (imgA,imgB)→image. A
// top-level arity table (mirrors DAG_ARITIES) lets the generator derive how many
// input edges each node needs from the chosen op. All consts are top-level so the
// isolated generator may reference them.
const IMG_UNARY_OPS = [
    'gray', 'invert', 'brightness', 'contrast', 'gamma', 'saturation', 'hueRotate',
    'posterize', 'threshold', 'solarize', 'sepia', 'blur', 'sharpen', 'edges',
    'emboss', 'vignette', 'gradientMap', 'tint', 'channelMix', 'tiltShift',
    'median', 'chromatic', 'edgeHue'
];
const IMG_BINARY_OPS = ['add', 'sub', 'diff', 'mul', 'screen', 'lighten', 'darken', 'blend'];
// Selection pool. Binary combiners produce the richer composites, so they are
// listed twice to bias the graph toward branching/recombination (~40% binary).
const IMG_OPS = [...IMG_UNARY_OPS, ...IMG_BINARY_OPS, ...IMG_BINARY_OPS];
const IMG_ARITY = (() => {
    const a = {};
    IMG_UNARY_OPS.forEach(op => { a[op] = 1; });
    IMG_BINARY_OPS.forEach(op => { a[op] = 2; });
    return a;
})();

const photoFilterGenerator = (rnd) => {
    // Node 0 is implicitly the source image; processing node i is global index i+1.
    const numProc = rnd.randint(3, 9);
    const procs = [];
    for (let i = 0; i < numProc; i++) {
        const op = rnd.choice(IMG_OPS);
        const arity = IMG_ARITY[op];
        const available = 1 + i; // source(0) + earlier procs → global indices 0..i
        const inputs = [];
        for (let j = 0; j < arity; j++) inputs.push(rnd.randint(0, available - 1));
        procs.push({ op, arity, inputs, p: [rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1)] });
    }
    // Output reads one of the last few nodes (never the bare source), so the
    // evolved graph structure actually shows.
    const outputIndex = rnd.randint(Math.max(1, numProc - 3), numProc);
    return { procs, outputIndex };
};

const photoFilterRepresentation = new PTORepresentation(photoFilterGenerator);

class PhotoFilterIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = photoFilterRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; } // gradientMap / tint / edgeHue use the palette
    usesPhoto() { return true; }        // attaches the Photo panel

    renderKey() {
        return JSON.stringify(this.phenotype) + '|photo' + window.Photo.version()
            + '|' + window.Palette.name();
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const src = this.toFloat(window.Photo.sourceImageData(width, height));
            const result = this.evaluateGraph(src, this.phenotype);
            const out = ctx.createImageData(width, height);
            this.toRGBA(result, out.data);
            return out;
        });
    }

    describeExtra() {
        const g = this.phenotype;
        if (!g || !Array.isArray(g.procs)) return '';
        const name = idx => (idx === 0 ? 'src' : 'p' + idx);
        let s = '<span class="genome-label">Image DAG:</span>\n';
        g.procs.forEach((d, i) => { s += `  p${i + 1} = ${d.op}(${d.inputs.map(name).join(', ')})\n`; });
        s += `  output = ${name(g.outputIndex)}\n`;
        return s;
    }

    // --- Graph evaluation --------------------------------------------------
    // Walk nodes in order, memoising each node's output image. Every op returns a
    // NEW image (pure), so an image feeding several consumers is never mutated.
    // Indices are clamped in case mutation/repair left a dangling reference.
    evaluateGraph(src, graph) {
        const outs = [src]; // global index 0 = source
        for (let i = 0; i < graph.procs.length; i++) {
            const d = graph.procs[i];
            const pick = idx => outs[Math.max(0, Math.min(idx, outs.length - 1))];
            const img = d.arity === 2
                ? this.applyBinary(d.op, pick(d.inputs[0]), pick(d.inputs[1]), d.p)
                : this.applyUnary(d.op, pick(d.inputs[0]), d.p);
            outs.push(img);
        }
        return outs[Math.max(0, Math.min(graph.outputIndex, outs.length - 1))];
    }

    // --- Image <-> buffer conversion --------------------------------------
    toFloat(imageData) {
        const { width: w, height: h, data } = imageData;
        const out = new Float32Array(w * h * 3);
        for (let p = 0, q = 0; p < data.length; p += 4, q += 3) {
            out[q] = data[p]; out[q + 1] = data[p + 1]; out[q + 2] = data[p + 2];
        }
        return { w, h, data: out };
    }

    toRGBA(img, rgba) {
        const d = img.data;
        for (let q = 0, p = 0; q < d.length; q += 3, p += 4) {
            rgba[p] = d[q] < 0 ? 0 : d[q] > 255 ? 255 : d[q];
            rgba[p + 1] = d[q + 1] < 0 ? 0 : d[q + 1] > 255 ? 255 : d[q + 1];
            rgba[p + 2] = d[q + 2] < 0 ? 0 : d[q + 2] > 255 ? 255 : d[q + 2];
            rgba[p + 3] = 255;
        }
    }

    // --- Unary ops (image → image) ----------------------------------------
    applyUnary(op, img, p) {
        const { w, h, data } = img;
        const n = data.length;

        // Neighbourhood / spatial ops build from more than the current pixel.
        if (op === 'blur') return this.boxBlurF(img, 1 + Math.floor(p[0] * 3));
        if (op === 'sharpen') {
            const b = this.boxBlurF(img, 1).data;
            const amt = p[0] * 1.5;
            const out = new Float32Array(n);
            for (let i = 0; i < n; i++) out[i] = data[i] + (data[i] - b[i]) * amt;
            return { w, h, data: out };
        }
        if (op === 'edges') return this.sobel(img);
        if (op === 'emboss') return this.convolve3(img, [-2, -1, 0, -1, 1, 1, 0, 1, 2], 128);
        if (op === 'vignette') return this.vignetteF(img, p);
        if (op === 'tiltShift') return this.tiltShiftF(img, p);
        if (op === 'median') return this.medianF(img);
        if (op === 'chromatic') return this.chromaticF(img, p);
        if (op === 'edgeHue') return this.edgeHueF(img, p);

        const out = new Float32Array(n);
        switch (op) {
            case 'gray':
                for (let q = 0; q < n; q += 3) {
                    const L = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
                    out[q] = out[q + 1] = out[q + 2] = L;
                }
                break;
            case 'invert':
                for (let i = 0; i < n; i++) out[i] = 255 - data[i];
                break;
            case 'brightness': {
                const a = (p[0] - 0.5) * 2 * 255;
                for (let i = 0; i < n; i++) out[i] = data[i] + a;
                break;
            }
            case 'contrast': {
                const c = (p[0] - 0.5) * 2 * 255;
                const f = (259 * (c + 255)) / (255 * (259 - c));
                for (let i = 0; i < n; i++) out[i] = f * (data[i] - 128) + 128;
                break;
            }
            case 'gamma': {
                const g = 0.2 + p[0] * 2.3;
                for (let i = 0; i < n; i++) {
                    const base = data[i] < 0 ? 0 : data[i] > 255 ? 1 : data[i] / 255;
                    out[i] = 255 * Math.pow(base, g);
                }
                break;
            }
            case 'saturation': {
                const s = p[0] * 2;
                for (let q = 0; q < n; q += 3) {
                    const L = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
                    out[q] = L + (data[q] - L) * s;
                    out[q + 1] = L + (data[q + 1] - L) * s;
                    out[q + 2] = L + (data[q + 2] - L) * s;
                }
                break;
            }
            case 'hueRotate': {
                const a = p[0] * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
                const m0 = 0.213 + cos * 0.787 - sin * 0.213, m1 = 0.715 - cos * 0.715 - sin * 0.715, m2 = 0.072 - cos * 0.072 + sin * 0.928;
                const m3 = 0.213 - cos * 0.213 + sin * 0.143, m4 = 0.715 + cos * 0.285 + sin * 0.140, m5 = 0.072 - cos * 0.072 - sin * 0.283;
                const m6 = 0.213 - cos * 0.213 - sin * 0.787, m7 = 0.715 - cos * 0.715 + sin * 0.715, m8 = 0.072 + cos * 0.928 + sin * 0.072;
                for (let q = 0; q < n; q += 3) {
                    const r = data[q], gg = data[q + 1], b = data[q + 2];
                    out[q] = r * m0 + gg * m1 + b * m2;
                    out[q + 1] = r * m3 + gg * m4 + b * m5;
                    out[q + 2] = r * m6 + gg * m7 + b * m8;
                }
                break;
            }
            case 'posterize': {
                const levels = 2 + Math.floor(p[0] * 6), step = 255 / (levels - 1);
                for (let i = 0; i < n; i++) out[i] = Math.round(data[i] / step) * step;
                break;
            }
            case 'threshold': {
                const t = p[0] * 255, s = p[1];
                for (let q = 0; q < n; q += 3) {
                    const L = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
                    const bw = L > t ? 255 : 0;
                    out[q] = data[q] * (1 - s) + bw * s;
                    out[q + 1] = data[q + 1] * (1 - s) + bw * s;
                    out[q + 2] = data[q + 2] * (1 - s) + bw * s;
                }
                break;
            }
            case 'solarize': {
                const t = p[0] * 255;
                for (let i = 0; i < n; i++) out[i] = data[i] > t ? 255 - data[i] : data[i];
                break;
            }
            case 'sepia': {
                const s = p[0];
                for (let q = 0; q < n; q += 3) {
                    const r = data[q], gg = data[q + 1], b = data[q + 2];
                    out[q] = r * (1 - s) + (r * 0.393 + gg * 0.769 + b * 0.189) * s;
                    out[q + 1] = gg * (1 - s) + (r * 0.349 + gg * 0.686 + b * 0.168) * s;
                    out[q + 2] = b * (1 - s) + (r * 0.272 + gg * 0.534 + b * 0.131) * s;
                }
                break;
            }
            case 'tint': {
                const col = window.Palette.color(p[1]), s = p[0];
                for (let q = 0; q < n; q += 3) {
                    out[q] = data[q] * (1 - s) + col.r * s;
                    out[q + 1] = data[q + 1] * (1 - s) + col.g * s;
                    out[q + 2] = data[q + 2] * (1 - s) + col.b * s;
                }
                break;
            }
            case 'channelMix': {
                const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
                const perm = perms[Math.min(5, Math.floor(p[0] * 6))];
                for (let q = 0; q < n; q += 3) {
                    const c = [data[q], data[q + 1], data[q + 2]];
                    out[q] = c[perm[0]]; out[q + 1] = c[perm[1]]; out[q + 2] = c[perm[2]];
                }
                break;
            }
            case 'gradientMap': {
                const s = p[0], lut = [];
                for (let v = 0; v < 256; v++) lut.push(window.Palette.color(v / 255));
                for (let q = 0; q < n; q += 3) {
                    let L = Math.round(0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2]);
                    L = L < 0 ? 0 : L > 255 ? 255 : L;
                    const col = lut[L];
                    out[q] = data[q] * (1 - s) + col.r * s;
                    out[q + 1] = data[q + 1] * (1 - s) + col.g * s;
                    out[q + 2] = data[q + 2] * (1 - s) + col.b * s;
                }
                break;
            }
            default: // unknown → passthrough
                out.set(data);
        }
        return { w, h, data: out };
    }

    // --- Binary ops ((imgA, imgB) → image) --------------------------------
    applyBinary(op, A, B, p) {
        const a = A.data, b = B.data, n = a.length;
        const out = new Float32Array(n);
        switch (op) {
            case 'add':     for (let i = 0; i < n; i++) out[i] = a[i] + b[i]; break;
            case 'sub':     for (let i = 0; i < n; i++) out[i] = a[i] - b[i]; break;
            case 'diff':    for (let i = 0; i < n; i++) out[i] = Math.abs(a[i] - b[i]); break;
            case 'mul':     for (let i = 0; i < n; i++) out[i] = a[i] * b[i] / 255; break;
            case 'screen':  for (let i = 0; i < n; i++) out[i] = 255 - (255 - a[i]) * (255 - b[i]) / 255; break;
            case 'lighten': for (let i = 0; i < n; i++) out[i] = Math.max(a[i], b[i]); break;
            case 'darken':  for (let i = 0; i < n; i++) out[i] = Math.min(a[i], b[i]); break;
            case 'blend': {
                const t = p[0];
                for (let i = 0; i < n; i++) out[i] = a[i] * (1 - t) + b[i] * t;
                break;
            }
            default:        out.set(a);
        }
        return { w: A.w, h: A.h, data: out };
    }

    // --- Spatial helpers (operate on Float32 RGB, edge-clamped) ------------
    boxBlurF(img, radius) {
        const { w, h, data } = img;
        const tmp = new Float32Array(data.length);
        const out = new Float32Array(data.length);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let k = -radius; k <= radius; k++) {
                    let xx = x + k; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
                    const j = (y * w + xx) * 3; r += data[j]; g += data[j + 1]; b += data[j + 2]; cnt++;
                }
                const i = (y * w + x) * 3; tmp[i] = r / cnt; tmp[i + 1] = g / cnt; tmp[i + 2] = b / cnt;
            }
        }
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0, g = 0, b = 0, cnt = 0;
                for (let k = -radius; k <= radius; k++) {
                    let yy = y + k; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
                    const j = (yy * w + x) * 3; r += tmp[j]; g += tmp[j + 1]; b += tmp[j + 2]; cnt++;
                }
                const i = (y * w + x) * 3; out[i] = r / cnt; out[i + 1] = g / cnt; out[i + 2] = b / cnt;
            }
        }
        return { w, h, data: out };
    }

    // 3×3 convolution of each channel with a flat 9-kernel, plus a bias.
    convolve3(img, kernel, bias) {
        const { w, h, data } = img;
        const out = new Float32Array(data.length);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0, g = 0, b = 0, ki = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    let yy = y + dy; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
                    for (let dx = -1; dx <= 1; dx++) {
                        let xx = x + dx; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
                        const j = (yy * w + xx) * 3, kv = kernel[ki++];
                        r += data[j] * kv; g += data[j + 1] * kv; b += data[j + 2] * kv;
                    }
                }
                const i = (y * w + x) * 3; out[i] = r + bias; out[i + 1] = g + bias; out[i + 2] = b + bias;
            }
        }
        return { w, h, data: out };
    }

    // Sobel gradient magnitude of luminance → greyscale edge image.
    sobel(img) {
        const { w, h, data } = img;
        const lum = new Float32Array(w * h);
        for (let q = 0, i = 0; q < data.length; q += 3, i++) {
            lum[i] = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
        }
        const out = new Float32Array(data.length);
        const at = (x, y) => {
            if (x < 0) x = 0; else if (x >= w) x = w - 1;
            if (y < 0) y = 0; else if (y >= h) y = h - 1;
            return lum[y * w + x];
        };
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const gx = at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1)
                    - at(x + 1, y - 1) - 2 * at(x + 1, y) - at(x + 1, y + 1);
                const gy = at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)
                    - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
                const mag = Math.sqrt(gx * gx + gy * gy);
                const i = (y * w + x) * 3; out[i] = out[i + 1] = out[i + 2] = mag;
            }
        }
        return { w, h, data: out };
    }

    // Sobel gradient DIRECTION → palette hue, magnitude → brightness. Colours
    // edges by their orientation (uses the current palette as the hue wheel).
    edgeHueF(img, p) {
        const { w, h, data } = img;
        const lum = new Float32Array(w * h);
        for (let q = 0, i = 0; q < data.length; q += 3, i++) {
            lum[i] = 0.299 * data[q] + 0.587 * data[q + 1] + 0.114 * data[q + 2];
        }
        const at = (x, y) => {
            if (x < 0) x = 0; else if (x >= w) x = w - 1;
            if (y < 0) y = 0; else if (y >= h) y = h - 1;
            return lum[y * w + x];
        };
        const gain = 0.5 + p[0] * 3;
        const lut = [];
        for (let k = 0; k <= 64; k++) lut.push(window.Palette.color(k / 64));
        const out = new Float32Array(data.length);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const gx = at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1)
                    - at(x + 1, y - 1) - 2 * at(x + 1, y) - at(x + 1, y + 1);
                const gy = at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)
                    - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
                const mag = Math.sqrt(gx * gx + gy * gy);
                const t = (Math.atan2(gy, gx) / (2 * Math.PI)) + 0.5; // [0,1]
                const col = lut[Math.min(64, Math.max(0, Math.round(t * 64)))];
                const inten = Math.min(1, mag * gain / 255);
                const i = (y * w + x) * 3; out[i] = col.r * inten; out[i + 1] = col.g * inten; out[i + 2] = col.b * inten;
            }
        }
        return { w, h, data: out };
    }

    // 3×3 median filter per channel — edge-preserving denoise.
    medianF(img) {
        const { w, h, data } = img;
        const out = new Float32Array(data.length);
        const win = new Float32Array(9);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                for (let c = 0; c < 3; c++) {
                    let k = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        let yy = y + dy; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
                        for (let dx = -1; dx <= 1; dx++) {
                            let xx = x + dx; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
                            win[k++] = data[(yy * w + xx) * 3 + c];
                        }
                    }
                    win.sort((a, b) => a - b);
                    out[(y * w + x) * 3 + c] = win[4];
                }
            }
        }
        return { w, h, data: out };
    }

    // Chromatic aberration: shift the R and B channels in opposite directions.
    chromaticF(img, p) {
        const { w, h, data } = img;
        const out = new Float32Array(data.length);
        const shift = 1 + Math.floor(p[0] * 6);
        const ang = p[1] * Math.PI * 2;
        const dx = Math.round(Math.cos(ang) * shift), dy = Math.round(Math.sin(ang) * shift);
        const sample = (x, y, c) => {
            if (x < 0) x = 0; else if (x >= w) x = w - 1;
            if (y < 0) y = 0; else if (y >= h) y = h - 1;
            return data[(y * w + x) * 3 + c];
        };
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 3;
                out[i] = sample(x + dx, y + dy, 0);   // R shifted one way
                out[i + 1] = data[i + 1];              // G unchanged
                out[i + 2] = sample(x - dx, y - dy, 2); // B shifted the other
            }
        }
        return { w, h, data: out };
    }

    vignetteF(img, p) {
        const { w, h, data } = img;
        const out = new Float32Array(data.length);
        const strength = p[0] * 1.5, radius = 0.3 + p[1] * 0.7;
        const cx = w / 2, cy = h / 2, maxD = Math.sqrt(cx * cx + cy * cy);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD;
                let f = 1;
                if (dist > radius) f = Math.max(0, 1 - strength * (dist - radius) / (1 - radius));
                const i = (y * w + x) * 3; out[i] = data[i] * f; out[i + 1] = data[i + 1] * f; out[i + 2] = data[i + 2] * f;
            }
        }
        return { w, h, data: out };
    }

    // Miniature/"toy" tilt-shift: keep a horizontal focus band sharp, blend toward
    // a fully-blurred copy with vertical distance from it.
    tiltShiftF(img, p) {
        const { w, h, data } = img;
        const focus = p[0], bandHalf = 0.06 + p[1] * 0.24, radius = 2 + Math.floor(p[2] * 4), falloff = 0.22;
        const blur = this.boxBlurF(img, radius).data;
        const out = new Float32Array(data.length);
        for (let y = 0; y < h; y++) {
            let t = (Math.abs(y / h - focus) - bandHalf) / falloff;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 3;
                out[i] = data[i] * (1 - t) + blur[i] * t;
                out[i + 1] = data[i + 1] * (1 - t) + blur[i + 1] * t;
                out[i + 2] = data[i + 2] * (1 - t) + blur[i + 2] * t;
            }
        }
        return { w, h, data: out };
    }
}

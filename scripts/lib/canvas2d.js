/*
 * canvas2d.js — a minimal, dependency-free CanvasRenderingContext2D over the
 * Raster in ./png.js, so a 2D individual's visualize() can be rendered to a PNG
 * headlessly.
 *
 * The test harness's canvas context is a no-op stub (it proves the render path
 * doesn't throw, but draws nothing), and there is no node-canvas in this repo.
 * This is the missing piece for *seeing* a Canvas2D type offline — the 2D
 * counterpart of the software rasteriser in endlessforms-preview.js.
 *
 * Supported, because that is what the individuals use: paths (moveTo/lineTo/
 * quadraticCurveTo/bezierCurveTo/arc/ellipse/rect/closePath), fill/stroke,
 * fillRect/clearRect, save/restore, translate/scale/rotate, fillStyle/strokeStyle
 * (#rgb, #rrggbb, rgb(), rgba(), hsl(), a few names), lineWidth, lineCap/lineJoin
 * (round joins only), globalAlpha. Not supported (no-ops): clip, text, gradients,
 * shadows, composite modes, getImageData/putImageData. So this renders types that
 * draw with paths — it is NOT a substitute for a browser, and a pixel-pushing type
 * that goes through Canvas2DModality's ImageData path won't work here.
 *
 * Antialiasing is by supersampling: render into a raster `scale` times bigger and
 * box-downsample (see downsample()), rather than computing per-edge coverage.
 *
 * Filling uses the correct non-zero winding rule across all subpaths (so holes
 * work); stroking unions per-segment quads plus round joins into one coverage
 * mask, then blends once, so a translucent stroke doesn't double-blend itself.
 */

const NAMED = {
    black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
    blue: [0, 0, 255], orange: [255, 165, 0], yellow: [255, 255, 0], grey: [128, 128, 128],
    gray: [128, 128, 128], transparent: [0, 0, 0, 0],
};

/** CSS colour string → [r, g, b, a]. Unknown strings render as mid grey. */
function parseColor(css) {
    if (Array.isArray(css)) return css.length === 4 ? css : [...css, 1];
    if (typeof css !== 'string') return [128, 128, 128, 1];
    const s = css.trim().toLowerCase();
    if (NAMED[s]) return [...NAMED[s], NAMED[s].length === 4 ? NAMED[s][3] : 1];
    if (s[0] === '#') {
        const h = s.slice(1);
        if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1];
        if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
        return [128, 128, 128, 1];
    }
    let m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
        const parts = m[1].split(',').map(v => parseFloat(v));
        return [parts[0] | 0, parts[1] | 0, parts[2] | 0, parts.length > 3 ? parts[3] : 1];
    }
    m = s.match(/^hsla?\(([^)]+)\)$/);
    if (m) {
        const parts = m[1].split(',').map(v => parseFloat(v));
        const [h, sat, l] = [((parts[0] % 360) + 360) % 360 / 360, parts[1] / 100, parts[2] / 100];
        const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
        const p = 2 * l - q;
        const hue = (t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255),
            parts.length > 3 ? parts[3] : 1];
    }
    return [128, 128, 128, 1];
}

/**
 * Rasterise polygons (device-space point arrays) into a coverage mask.
 * Returns the touched bounds [y0, y1, x0, x1] so the blend pass — and the mask
 * clear after it — only walk the pixels the shape could have covered.
 */
function scanFill(polys, mask, W, H, combined) {
    const edges = [];
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length];
            minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]);
            minY = Math.min(minY, a[1]); maxY = Math.max(maxY, a[1]);
            if (a[1] === b[1]) continue;
            edges.push([a[0], a[1], b[0], b[1], poly.__id || 0]);
        }
    }
    if (!edges.length) return null;
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
    const x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(W - 1, Math.ceil(maxX));
    if (y1 < y0 || x1 < x0) return null;
    const xs = [];
    for (let y = y0; y <= y1; y++) {
        const sy = y + 0.5;
        xs.length = 0;
        for (const [ax, ay, bx, by, id] of edges) {
            if ((sy >= ay && sy < by) || (sy >= by && sy < ay)) {
                xs.push([ax + (sy - ay) / (by - ay) * (bx - ax), by > ay ? 1 : -1, id]);
            }
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p[0] - q[0]);
        if (combined) {
            // One non-zero winding number over every subpath: holes work.
            let w = 0;
            for (let i = 0; i < xs.length - 1; i++) {
                w += xs[i][1];
                if (w !== 0) spanFill(mask, W, y, xs[i][0], xs[i + 1][0]);
            }
        } else {
            // Per-polygon winding, unioned: overlapping pieces cover once.
            const wind = new Map();
            for (let i = 0; i < xs.length - 1; i++) {
                wind.set(xs[i][2], (wind.get(xs[i][2]) || 0) + xs[i][1]);
                let any = false;
                for (const v of wind.values()) if (v !== 0) { any = true; break; }
                if (any) spanFill(mask, W, y, xs[i][0], xs[i + 1][0]);
            }
        }
    }
    return [y0, y1, x0, x1];
}

function spanFill(mask, W, y, xa, xb) {
    const from = Math.max(0, Math.round(xa)), to = Math.min(W - 1, Math.round(xb) - 1);
    const row = y * W;
    for (let x = from; x <= to; x++) mask[row + x] = 1;
}

class MiniContext {
    /**
     * @param {Raster} raster  target (already `scale` times the logical size)
     * @param {number} scale   supersampling factor
     * @param {number} ox,oy   device-space origin of this canvas within the raster
     */
    constructor(raster, scale, ox = 0, oy = 0) {
        this.raster = raster;
        this.k = scale;
        this.ox = ox;
        this.oy = oy;
        this.m = [1, 0, 0, 1, 0, 0];
        this.stack = [];
        this.fillStyle = '#000';
        this.strokeStyle = '#000';
        this.lineWidth = 1;
        this.lineCap = 'butt';
        this.lineJoin = 'miter';
        this.globalAlpha = 1;
        this.imageSmoothingEnabled = true;
        this.font = '10px sans-serif';
        this.textAlign = 'left';
        this.subs = [];
        this.cur = null;
    }

    // --- state ---
    save() {
        this.stack.push({
            m: this.m.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
            lineWidth: this.lineWidth, lineCap: this.lineCap, lineJoin: this.lineJoin,
            globalAlpha: this.globalAlpha,
        });
    }
    restore() {
        const s = this.stack.pop();
        if (s) Object.assign(this, s);
    }
    translate(x, y) { this.m[4] += this.m[0] * x + this.m[2] * y; this.m[5] += this.m[1] * x + this.m[3] * y; }
    scale(x, y) { this.m[0] *= x; this.m[1] *= x; this.m[2] *= y; this.m[3] *= y; }
    rotate(a) {
        const c = Math.cos(a), s = Math.sin(a);
        const [m0, m1, m2, m3] = this.m;
        this.m[0] = m0 * c + m2 * s; this.m[1] = m1 * c + m3 * s;
        this.m[2] = m2 * c - m0 * s; this.m[3] = m3 * c - m1 * s;
    }
    setLineDash() {}
    clip() {}
    fillText() {}
    strokeText() {}
    measureText(t) { return { width: (t ? t.length : 0) * 6 }; }
    drawImage() {}

    /** User → device coordinates. */
    _pt(x, y) {
        const m = this.m;
        return [(m[0] * x + m[2] * y + m[4]) * this.k + this.ox,
            (m[1] * x + m[3] * y + m[5]) * this.k + this.oy];
    }
    /** Average scale factor, for turning a user-space lineWidth into device px. */
    _sc() {
        const m = this.m;
        return (Math.hypot(m[0], m[1]) + Math.hypot(m[2], m[3])) / 2 * this.k;
    }

    // --- path building (flattened to device-space polylines as we go) ---
    beginPath() { this.subs = []; this.cur = null; }
    moveTo(x, y) { this.cur = [this._pt(x, y)]; this.cur.closed = false; this.subs.push(this.cur); }
    lineTo(x, y) { if (!this.cur) return this.moveTo(x, y); this.cur.push(this._pt(x, y)); }
    closePath() { if (this.cur) this.cur.closed = true; }
    quadraticCurveTo(cx, cy, x, y) {
        if (!this.cur) this.moveTo(cx, cy);
        const [x0, y0] = this.cur[this.cur.length - 1];
        const c = this._pt(cx, cy), e = this._pt(x, y);
        for (let i = 1; i <= 16; i++) {
            const t = i / 16, u = 1 - t;
            this.cur.push([u * u * x0 + 2 * u * t * c[0] + t * t * e[0],
                u * u * y0 + 2 * u * t * c[1] + t * t * e[1]]);
        }
    }
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
        if (!this.cur) this.moveTo(c1x, c1y);
        const [x0, y0] = this.cur[this.cur.length - 1];
        const a = this._pt(c1x, c1y), b = this._pt(c2x, c2y), e = this._pt(x, y);
        for (let i = 1; i <= 20; i++) {
            const t = i / 20, u = 1 - t;
            this.cur.push([
                u * u * u * x0 + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0],
                u * u * u * y0 + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1]]);
        }
    }
    ellipse(x, y, rx, ry, rot = 0, a0 = 0, a1 = Math.PI * 2, ccw = false) {
        let span = a1 - a0;
        if (!ccw && span < 0) span += Math.PI * 2;
        if (ccw && span > 0) span -= Math.PI * 2;
        const steps = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI * 2) * 48));
        const cos = Math.cos(rot), sin = Math.sin(rot);
        for (let i = 0; i <= steps; i++) {
            const t = a0 + span * i / steps;
            const px = rx * Math.cos(t), py = ry * Math.sin(t);
            const ux = x + px * cos - py * sin, uy = y + px * sin + py * cos;
            if (i === 0 && !this.cur) this.moveTo(ux, uy); else this.lineTo(ux, uy);
        }
    }
    arc(x, y, r, a0 = 0, a1 = Math.PI * 2, ccw = false) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
    arcTo(x1, y1, x2, y2) { this.lineTo(x1, y1); this.lineTo(x2, y2); }
    rect(x, y, w, h) {
        this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h);
        this.closePath();
    }

    // --- painting ---
    // One mask buffer is reused across every fill/stroke on this context and
    // cleared over the touched bounds only — allocating (and scanning) a
    // full-raster mask per draw call is what makes a naive version unusably slow.
    _mask() {
        if (!this._maskBuf) this._maskBuf = new Uint8Array(this.raster.width * this.raster.height);
        return this._maskBuf;
    }
    _blend(mask, bounds, color) {
        if (!bounds) return;
        const [y0, y1, x0, x1] = bounds;
        const [r, g, b, ca] = parseColor(color);
        const a = ca * this.globalAlpha;
        const W = this.raster.width;
        for (let y = y0; y <= y1; y++) {
            const row = y * W;
            for (let x = x0; x <= x1; x++) {
                if (!mask[row + x]) continue;
                mask[row + x] = 0;
                if (a > 0) this.raster.setPixel(x, y, [r, g, b], a);
            }
        }
    }

    fill() {
        if (!this.subs.length) return;
        const mask = this._mask();
        const bounds = scanFill(this.subs, mask, this.raster.width, this.raster.height, true);
        this._blend(mask, bounds, this.fillStyle);
    }

    stroke() {
        if (!this.subs.length) return;
        const w = Math.max(1, this.lineWidth * this._sc());
        const half = w / 2;
        const polys = [];
        let id = 0;
        const disc = (cx, cy) => {
            const p = [];
            for (let i = 0; i < 12; i++) {
                const t = i / 12 * Math.PI * 2;
                p.push([cx + half * Math.cos(t), cy + half * Math.sin(t)]);
            }
            p.__id = id++;
            polys.push(p);
        };
        for (const sub of this.subs) {
            const pts = sub.closed && sub.length > 1 ? [...sub, sub[0]] : sub;
            if (pts.length === 1) { disc(pts[0][0], pts[0][1]); continue; }
            for (let i = 0; i < pts.length - 1; i++) {
                const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
                const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
                if (len < 1e-9) continue;
                const nx = -dy / len * half, ny = dx / len * half;
                const q = [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
                q.__id = id++;
                polys.push(q);
                // Round joins everywhere (and round caps when asked): cheap, and the
                // individuals all set lineCap 'round' or draw closed shapes anyway.
                if (i > 0 || this.lineCap === 'round' || sub.closed) disc(x0, y0);
            }
            const last = pts[pts.length - 1];
            if (this.lineCap === 'round' || sub.closed) disc(last[0], last[1]);
        }
        const mask = this._mask();
        const bounds = scanFill(polys, mask, this.raster.width, this.raster.height, false);
        this._blend(mask, bounds, this.strokeStyle);
    }

    fillRect(x, y, w, h) {
        const saved = this.subs, savedCur = this.cur;
        this.beginPath();
        this.rect(x, y, w, h);
        this.fill();
        this.subs = saved; this.cur = savedCur;
    }
    clearRect(x, y, w, h) {
        const f = this.fillStyle, a = this.globalAlpha;
        this.fillStyle = '#ffffff'; this.globalAlpha = 1;
        this.fillRect(x, y, w, h);
        this.fillStyle = f; this.globalAlpha = a;
    }
    strokeRect(x, y, w, h) {
        const saved = this.subs, savedCur = this.cur;
        this.beginPath();
        this.rect(x, y, w, h);
        this.stroke();
        this.subs = saved; this.cur = savedCur;
    }
    // The ImageData path is not emulated; a type that uses it needs a browser.
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
    getImageData(x, y, w, h) { return this.createImageData(w, h); }
    putImageData() {}
}

/**
 * A canvas-shaped object for `individual.visualize(canvas)`, drawing into a
 * (supersampled) raster at device offset (ox, oy).
 */
function makeCanvas(raster, scale, width, height, ox = 0, oy = 0) {
    const ctx = new MiniContext(raster, scale, ox, oy);
    return { width, height, getContext: () => ctx };
}

/** Box-downsample a supersampled raster by `k` (the antialiasing step). */
function downsample(src, k, Raster) {
    const W = Math.floor(src.width / k), H = Math.floor(src.height / k);
    const out = new Raster(W, H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let r = 0, g = 0, b = 0;
            for (let j = 0; j < k; j++) {
                for (let i = 0; i < k; i++) {
                    const s = ((y * k + j) * src.width + (x * k + i)) * 3;
                    r += src.buf[s]; g += src.buf[s + 1]; b += src.buf[s + 2];
                }
            }
            const n = k * k, d = (y * W + x) * 3;
            out.buf[d] = Math.round(r / n); out.buf[d + 1] = Math.round(g / n); out.buf[d + 2] = Math.round(b / n);
        }
    }
    return out;
}

module.exports = { MiniContext, makeCanvas, downsample, parseColor };

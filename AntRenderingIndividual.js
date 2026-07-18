/**
 * AntRenderingIndividual — a "painting with ants" non-photorealistic renderer.
 *
 * Loosely inspired by Aupetit et al.'s "Interactive Evolution of Ant Paintings"
 * (GECCO 2004): a colony of many simple agents ("ants") is scattered over the
 * shared source photo (window.Photo) and crawls around it, laying down ink as it
 * goes. No ant sees any global feature of the image — each only reads the pixels
 * under it (local luminance + gradient) and reacts, so the finished picture is an
 * emergent, stroke-based re-rendering of the photo rather than a filtered copy.
 *
 * This is a much-simplified version of the paper. The genome is NOT the ants'
 * per-step decisions (that would be an enormous, un-evolvable trace); instead the
 * PTO generator emits a small colony-parameter object (how many ants, how far they
 * step, how strongly they follow edges, ink colour/opacity, …) plus one integer
 * `seed`. visualize() runs the whole simulation deterministically from those genes
 * via a local seeded PRNG (mulberry32), so the render is reproducible and cacheable
 * from the genome while the trace stays tiny. Mutating `seed` reshuffles the ant
 * field; mutating a behaviour gene changes how the colony paints.
 *
 * Ant state per step mirrors Table 2 of the paper in spirit: position, heading
 * (velocity direction), a fixed step size, and a turn cap that forbids overly sharp
 * turns (the paper's "memory check" — we also break the stroke when the turn is
 * clamped, so sharp corners leave gaps like a real brush lifting off).
 *
 * The photo is NOT in the genome (shared via window.Photo), so the user can replace
 * it and keep evolving the same colonies — exactly like PhotoFilterIndividual.
 */

// All top-level so the isolated PTO generator may reference them.
const ANT_COLOR_MODES = ['photo', 'palette', 'mono'];
const ANT_BACKGROUNDS = ['dark', 'light', 'photo'];

const antRenderingGenerator = (rnd) => {
    return {
        numAnts: rnd.randint(20, 800),        // colony size
        maxSteps: rnd.randint(3, 50),         // steps per ant since birth → stroke length cap
        stepSize: rnd.uniform(0.6, 3.0),      // movement magnitude (px, ×res at zoom)
        edgeFollow: rnd.uniform(0, 1),        // steer along isophotes (follow edges)
        gradientBias: rnd.uniform(-1, 1),     // drift toward dark (−) or bright (+)
        wander: rnd.uniform(0, 1),            // random-walk component
        maxTurn: rnd.uniform(8, 70),          // deg: anti-sharp-turn cap (the "memory check")
        penWidth: rnd.uniform(0.05, 2.5),     // stroke width (px, ×res at zoom)
        opacity: rnd.uniform(0.15, 0.9),      // base ink opacity
        brightnessOpacity: rnd.uniform(-1, 1),// modulate opacity by local luminance
        deposit: rnd.uniform(0.4, 1),         // fraction of steps that lay ink
        colorMode: rnd.choice(ANT_COLOR_MODES),
        background: rnd.choice(ANT_BACKGROUNDS),
        seed: rnd.randint(1, 1000000000),     // reshuffles ant starts / wander
    };
};

const antRenderingRepresentation = new PTORepresentation(antRenderingGenerator);

class AntRenderingIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = antRenderingRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; } // 'palette' colour mode maps luminance → palette
    usesPhoto() { return true; }        // attaches the Photo panel; walks the shared photo

    renderKey() {
        return JSON.stringify(this.phenotype) + '|photo' + window.Photo.version()
            + '|' + window.Palette.name();
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const g = this.phenotype;
            const src = window.Photo.sourceImageData(width, height);

            // Resolution scale (reference is the 128px grid tile). Scaling the step
            // size AND pen width by res makes each ant traverse the same *fraction*
            // of the image over its fixed step count, so a 768px zoom is a faithful
            // magnification of the tile rather than a sparser/thinner version.
            const res = Math.min(width, height) / 128;

            // Precompute luminance + Sobel gradient of the source.
            const { lum, gx, gy } = this._computeFields(src, width, height);

            // Float RGB accumulation buffer, initialised to the chosen background.
            const buf = this._initBackground(g.background, src, width, height);

            this._runColony(g, buf, lum, gx, gy, width, height, res);

            const out = ctx.createImageData(width, height);
            const d = out.data;
            for (let p = 0, i = 0; p < buf.length; p += 3, i += 4) {
                d[i]     = buf[p]     < 0 ? 0 : buf[p]     > 255 ? 255 : buf[p];
                d[i + 1] = buf[p + 1] < 0 ? 0 : buf[p + 1] > 255 ? 255 : buf[p + 1];
                d[i + 2] = buf[p + 2] < 0 ? 0 : buf[p + 2] > 255 ? 255 : buf[p + 2];
                d[i + 3] = 255;
            }
            return out;
        });
    }

    // --- Simulation --------------------------------------------------------
    _runColony(g, buf, lum, gx, gy, width, height, res) {
        const rand = this._mulberry32(g.seed >>> 0);
        const step = g.stepSize * res;
        const penW = Math.max(0.5, g.penWidth * res);
        const maxTurn = g.maxTurn * Math.PI / 180;
        const DEG2 = Math.PI * 2;

        const sampleLum = (x, y) => {
            let ix = x | 0, iy = y | 0;
            if (ix < 0) ix = 0; else if (ix >= width) ix = width - 1;
            if (iy < 0) iy = 0; else if (iy >= height) iy = height - 1;
            return { i: iy * width + ix, l: lum[iy * width + ix] };
        };

        for (let a = 0; a < g.numAnts; a++) {
            let x = rand() * width;
            let y = rand() * height;
            let heading = rand() * DEG2; // radians

            for (let s = 0; s < g.maxSteps; s++) {
                const hx = Math.cos(heading), hy = Math.sin(heading);

                // Local gradient (points toward brighter pixels).
                const cell = sampleLum(x, y);
                const ggx = gx[cell.i], ggy = gy[cell.i];
                const gmag = Math.hypot(ggx, ggy);

                // Desired direction: momentum + edge-following + brightness drift + wander.
                let dirX = hx, dirY = hy; // momentum (keep going)
                if (gmag > 1e-4) {
                    const nx = ggx / gmag, ny = ggy / gmag; // toward bright
                    // Isophote (edge) direction is perpendicular to the gradient;
                    // pick the sign that best continues the current heading.
                    let ix = -ny, iy = nx;
                    if (ix * hx + iy * hy < 0) { ix = -ix; iy = -iy; }
                    dirX += g.edgeFollow * ix;
                    dirY += g.edgeFollow * iy;
                    dirX += g.gradientBias * nx;
                    dirY += g.gradientBias * ny;
                }
                dirX += g.wander * (rand() * 2 - 1);
                dirY += g.wander * (rand() * 2 - 1);

                let target = Math.atan2(dirY, dirX);

                // Turn cap ("memory check"): forbid overly sharp turns. When the
                // desired turn is clamped, lift the brush (skip the mark) so sharp
                // corners leave gaps, like the paper's stroke-breaking rule.
                let delta = target - heading;
                while (delta > Math.PI) delta -= DEG2;
                while (delta < -Math.PI) delta += DEG2;
                let clamped = false;
                if (delta > maxTurn) { delta = maxTurn; clamped = true; }
                else if (delta < -maxTurn) { delta = -maxTurn; clamped = true; }
                heading += delta;

                const nxp = x + Math.cos(heading) * step;
                const nyp = y + Math.sin(heading) * step;

                // Lay ink for this segment (probabilistic; not on a clamped sharp turn).
                if (!clamped && rand() < g.deposit) {
                    const at = sampleLum(nxp, nyp);
                    const t = at.l / 255;
                    let op = g.opacity * (1 + g.brightnessOpacity * (t - 0.5) * 2);
                    op = op < 0 ? 0 : op > 1 ? 1 : op;
                    if (op > 0.01) {
                        const col = this._inkColor(g, at.i, t, src => src);
                        this._stampSegment(buf, width, height, x, y, nxp, nyp, col, op, penW);
                    }
                }

                x = nxp; y = nyp;
                // Reflect off the edges so ants keep working the frame.
                if (x < 0 || x >= width) { heading = Math.PI - heading; x = Math.max(0, Math.min(width - 1, x)); }
                if (y < 0 || y >= height) { heading = -heading; y = Math.max(0, Math.min(height - 1, y)); }
            }
        }
    }

    // Ink colour for the current mode. `src` param is unused sentinel to keep the
    // call site terse; colour comes from the precomputed fields / palette / photo.
    _inkColor(g, idx, t) {
        if (g.colorMode === 'photo') {
            const p = idx * 3;
            return { r: this._srcRGB[p], g: this._srcRGB[p + 1], b: this._srcRGB[p + 2] };
        }
        if (g.colorMode === 'palette') {
            return window.Palette.color(t);
        }
        // mono: ink contrasts the background.
        return g.background === 'light' ? { r: 20, g: 20, b: 20 } : { r: 235, g: 235, b: 235 };
    }

    // Alpha-blended thick segment: stamp a small disc every ~1px along the line.
    _stampSegment(buf, width, height, x0, y0, x1, y1, col, op, penW) {
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.max(1, Math.hypot(dx, dy));
        const steps = Math.ceil(len);
        const r = Math.max(0.5, penW / 2);
        const r2 = r * r;
        const ri = Math.ceil(r);
        for (let s = 0; s <= steps; s++) {
            const cx = x0 + (dx * s) / steps;
            const cy = y0 + (dy * s) / steps;
            const minX = Math.max(0, Math.floor(cx - ri)), maxX = Math.min(width - 1, Math.ceil(cx + ri));
            const minY = Math.max(0, Math.floor(cy - ri)), maxY = Math.min(height - 1, Math.ceil(cy + ri));
            for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                    const ex = px - cx, ey = py - cy;
                    if (ex * ex + ey * ey > r2) continue;
                    const p = (py * width + px) * 3;
                    buf[p]     = buf[p]     * (1 - op) + col.r * op;
                    buf[p + 1] = buf[p + 1] * (1 - op) + col.g * op;
                    buf[p + 2] = buf[p + 2] * (1 - op) + col.b * op;
                }
            }
        }
    }

    // --- Field precomputation ---------------------------------------------
    _computeFields(src, width, height) {
        const data = src.data;
        const n = width * height;
        const lum = new Float32Array(n);
        // Keep the source RGB around for 'photo' colour mode.
        const rgb = new Float32Array(n * 3);
        for (let i = 0, p = 0, q = 0; i < n; i++, p += 4, q += 3) {
            const r = data[p], gch = data[p + 1], b = data[p + 2];
            lum[i] = 0.299 * r + 0.587 * gch + 0.114 * b;
            rgb[q] = r; rgb[q + 1] = gch; rgb[q + 2] = b;
        }
        this._srcRGB = rgb;

        const gx = new Float32Array(n), gy = new Float32Array(n);
        const at = (x, y) => {
            if (x < 0) x = 0; else if (x >= width) x = width - 1;
            if (y < 0) y = 0; else if (y >= height) y = height - 1;
            return lum[y * width + x];
        };
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                gx[y * width + x] = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
                    - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
                gy[y * width + x] = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
                    - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
            }
        }
        return { lum, gx, gy };
    }

    _initBackground(mode, src, width, height) {
        const n = width * height;
        const buf = new Float32Array(n * 3);
        if (mode === 'light') { buf.fill(245); return buf; }
        if (mode === 'dark') { buf.fill(12); return buf; }
        // 'photo': a dimmed underpainting so strokes sit over a faint copy.
        const data = src.data;
        for (let i = 0, p = 0, q = 0; i < n; i++, p += 4, q += 3) {
            buf[q] = data[p] * 0.28; buf[q + 1] = data[p + 1] * 0.28; buf[q + 2] = data[p + 2] * 0.28;
        }
        return buf;
    }

    // Small, fast, deterministic PRNG so the whole colony is reproducible from `seed`.
    _mulberry32(seed) {
        let t = seed;
        return function () {
            t += 0x6D2B79F5;
            let r = t;
            r = Math.imul(r ^ (r >>> 15), r | 1);
            r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    describeExtra() {
        const g = this.phenotype;
        if (!g) return '';
        let s = '<span class="genome-label">Colony:</span>\n';
        s += `  ${g.numAnts} ants × ${g.maxSteps} steps, step ${g.stepSize.toFixed(2)}, pen ${g.penWidth.toFixed(2)}\n`;
        s += `  edgeFollow ${g.edgeFollow.toFixed(2)}, gradientBias ${g.gradientBias.toFixed(2)}, wander ${g.wander.toFixed(2)}, maxTurn ${g.maxTurn.toFixed(0)}°\n`;
        s += `  colour ${g.colorMode}, background ${g.background}, opacity ${g.opacity.toFixed(2)}\n`;
        return s;
    }
}

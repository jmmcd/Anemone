/**
 * RoboHashCatIndividual — evolvable identikit cats, assembled from David
 * Revoy's "Cat Avatar Generator" artwork as vendored by Robohash (set4).
 *
 * THE IDEA. Robohash is a hash function into identikit space: it slices a
 * SHA-512 into blocks and uses one block per part directory to pick a body, a
 * coat pattern, eyes, a mouth and an accessory, then pastes them in z-order
 * (see robohash.py, and scripts/build-robohash-parts.py for how that ordering
 * was imported). Replacing "a slice of a hash" with "a gene under selection" is
 * the whole type: the same assembly, driven by what a person picks instead of
 * by a digest. That puts it in the lineage of identikit/photofit evolution
 * (Frowd's EvoFIT), and next to the app's own hand-drawn Robot and Bug.
 *
 * WHY IT IS NOT JUST PART INDICES. Five slots of 10-16 options is only ~360k
 * creatures, and every mutation is a discrete jump: swap the eyes and you get a
 * different cat, not a nearby one. That is a poor space to steer by eye. So the
 * genome also carries a small continuous layer, deliberately subtle:
 *
 *   - a per-group affine jitter (offset, scale, rotation), which gives mutation
 *     something to creep along and lets a lineage drift toward a slightly
 *     lopsided, wide-eyed or tilt-hatted cat rather than only re-rolling parts;
 *   - a palette tint on the parts where recolouring reads as intent rather than
 *     damage.
 *
 * The affine groups matter. Body and fur SHARE one transform, because the fur
 * is a pattern layer painted to sit on the body's silhouette — jitter them
 * independently and the spots slide off the cat. Eyes, mouth and accessory each
 * get their own, because those are features sitting on the face and nudging
 * them is exactly the charm. Each group pivots about its OWN part's alpha
 * bounding box (recorded in the manifest at import time), so jittered eyes turn
 * in place instead of swinging around the canvas centre.
 *
 * Tinting is restricted to body, fur and accessory — the coat and the costume.
 * Eyes and mouth stay as drawn: they are what makes the thing read as a face,
 * and a green sclera looks like a bug rather than a choice.
 *
 * ASYNC. Parts are image files, so window.RoboParts hands back a decoded image
 * or null and visualize() draws whatever exists — the tile fills in over the
 * first moment and the service asks for one re-render when the batch lands. The
 * render cache key therefore includes RoboParts.version(), and a tile is only
 * cached once it is complete.
 */

const ROBOCAT_SET = 'set4';

// Slots in PASTE (z) order, mirroring img/robohash/manifest.js. The counts are
// literal here rather than read from the manifest because a PTO generator must
// be self-contained (structural naming compiles it in isolation) — and because
// a silent drift between the two would quietly reinterpret every saved genome.
// tests/run.js asserts this table and the manifest agree.
const ROBOCAT_SLOTS = [
    { name: 'body',        count: 15, group: 0 },
    { name: 'fur',         count: 10, group: 0 },   // shares the body's transform
    { name: 'eyes',        count: 15, group: 1 },
    { name: 'mouth',       count: 10, group: 2 },
    { name: 'accessories', count: 16, group: 3 },
];

// Which slots may be palette-tinted, as indices into ROBOCAT_SLOTS: the coat
// (body, fur) and the costume (accessory). The tint genes are stored in this
// order, so it is part of the genome's meaning — appending is safe, reordering
// is not.
const ROBOCAT_TINT_SLOTS = [0, 1, 4];

const ROBOCAT_GROUPS = 4;

// Per-group jitter magnitudes: how far the genes' -1..1 range actually moves
// things. Offsets are fractions of the canvas, rotation is in degrees. Kept
// small on purpose — this is meant to read as a hand-assembled wonkiness, not
// as parts falling off. Genes are stored normalised, so these can be retuned
// without invalidating a saved genome.
const ROBOCAT_JITTER = [
    { dx: 0.020, dy: 0.020, scale: 0.04, rot: 3 },   // 0 body + fur
    { dx: 0.030, dy: 0.030, scale: 0.08, rot: 6 },   // 1 eyes
    { dx: 0.030, dy: 0.030, scale: 0.10, rot: 6 },   // 2 mouth
    { dx: 0.035, dy: 0.035, scale: 0.08, rot: 8 },   // 3 accessory
];

// Tint strength: the gene ramps from 0 above a gate, so a good share of cats
// keep Revoy's own colours and the rest recolour continuously (no cliff for
// mutation to fall off).
const ROBOCAT_TINT_GATE = 0.55;
const ROBOCAT_TINT_MAX = 0.55;

/**
 * Self-contained PTO generator (top-level consts only, explicit for-loops, no
 * `new`, no closure variables — see PTORepresentation).
 *
 * Phenotype: { parts: [int per slot], jitter: [{dx,dy,scale,rot} per group],
 *              tint: [{hue,amount} per tintable slot] }
 * Jitter/tint genes are normalised; the tables above turn them into pixels.
 */
const roboCatGenerator = (rnd) => {
    const parts = [];
    for (let i = 0; i < ROBOCAT_SLOTS.length; i++) {
        parts.push(rnd.randint(0, ROBOCAT_SLOTS[i].count - 1));
    }

    const jitter = [];
    for (let g = 0; g < ROBOCAT_GROUPS; g++) {
        jitter.push({
            dx: rnd.uniform(-1, 1),
            dy: rnd.uniform(-1, 1),
            scale: rnd.uniform(-1, 1),
            rot: rnd.uniform(-1, 1),
        });
    }

    const tint = [];
    for (let i = 0; i < ROBOCAT_TINT_SLOTS.length; i++) {
        tint.push({ hue: rnd.uniform(0, 1), amount: rnd.uniform(0, 1) });
    }

    return { parts, jitter, tint };
};

const roboCatRepresentation = new PTORepresentation(roboCatGenerator);

// One scratch canvas for the whole type: a tinted layer is composited straight
// onto the tile, so it never needs to outlive the drawImage that consumes it.
let roboCatScratch = null;

class RoboHashCatIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = roboCatRepresentation;
        this.genome = genome || this.representation.generateRandom();

        // Begin fetching the set the first time one of these exists, so a user
        // who never picks this type downloads none of it.
        if (typeof window !== 'undefined' && window.RoboParts) {
            window.RoboParts.ensureLoaded(ROBOCAT_SET);
        }
    }

    usesColorPalette() { return true; }
    usesRoboParts()    { return true; }

    // The phenotype is an object, so the base renderKey() would stringify to
    // "[object Object]" and never invalidate. Include the parts service version
    // so a tile drawn while images were still arriving is redrawn once they land.
    renderKey() {
        const v = (typeof window !== 'undefined' && window.RoboParts)
            ? window.RoboParts.version() : 0;
        return JSON.stringify(this.phenotype) + '|v' + v;
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;

        const key = `${this.renderKey()}_${w}x${h}`;
        if (this._cacheKey === key && this._cachedImageData) {
            ctx.putImageData(this._cachedImageData, 0, 0);
            return;
        }

        ctx.clearRect(0, 0, w, h);

        const p = this.phenotype || {};
        const parts = p.parts || [];
        const jitter = p.jitter || [];
        const parts_service = (typeof window !== 'undefined') ? window.RoboParts : null;

        let drawn = 0;
        // The fur rides on the body, so it must pivot about the body's box too.
        const bodyPivot = this._pivot(0, parts[0], w, h);

        for (let s = 0; s < ROBOCAT_SLOTS.length; s++) {
            const img = parts_service ? parts_service.image(ROBOCAT_SET, s, parts[s]) : null;
            if (!img) continue;
            drawn++;

            const group = ROBOCAT_SLOTS[s].group;
            const pivot = (group === 0) ? bodyPivot : this._pivot(s, parts[s], w, h);
            const layer = this._tintedLayer(s, img, w, h);

            ctx.save();
            this._applyJitter(ctx, jitter[group], group, pivot, w, h);
            ctx.drawImage(layer, 0, 0, w, h);
            ctx.restore();
        }

        if (drawn === 0) this._drawPlaceholder(ctx, w, h);

        // Snapshot only a finished picture. getImageData throws on a tainted
        // canvas — which happens when the app is opened over file://, where
        // local images count as cross-origin — so fall back to not caching
        // rather than letting the render fail.
        if (drawn === ROBOCAT_SLOTS.length) {
            try {
                this._cachedImageData = ctx.getImageData(0, 0, w, h);
                this._cacheKey = key;
            } catch (e) {
                this._cachedImageData = null;
                this._cacheKey = null;
            }
        }
    }

    /** Canvas-space centre of a part's alpha box; the canvas centre if unknown. */
    _pivot(slotIndex, partIndex, w, h) {
        const svc = (typeof window !== 'undefined') ? window.RoboParts : null;
        const bb = svc ? svc.bbox(ROBOCAT_SET, slotIndex, partIndex) : null;
        if (!bb) return [w / 2, h / 2];
        return [(bb[0] + bb[2]) / 2 * w, (bb[1] + bb[3]) / 2 * h];
    }

    _applyJitter(ctx, j, group, pivot, w, h) {
        if (!j) return;
        const r = ROBOCAT_JITTER[group];
        ctx.translate(pivot[0], pivot[1]);
        ctx.rotate(j.rot * r.rot * Math.PI / 180);
        const sc = 1 + j.scale * r.scale;
        ctx.scale(sc, sc);
        ctx.translate(-pivot[0], -pivot[1]);
        ctx.translate(j.dx * r.dx * w, j.dy * r.dy * h);
    }

    /** Tint strength for a slot, 0 when the slot isn't tintable or the gene is low. */
    _tintAmount(slotIndex) {
        const k = ROBOCAT_TINT_SLOTS.indexOf(slotIndex);
        if (k < 0) return 0;
        const gene = ((this.phenotype || {}).tint || [])[k];
        if (!gene) return 0;
        const a = (gene.amount - ROBOCAT_TINT_GATE) / (1 - ROBOCAT_TINT_GATE);
        return a > 0 ? a * ROBOCAT_TINT_MAX : 0;
    }

    /**
     * The part, optionally lerped toward a palette colour.
     *
     * 'source-atop' paints only where the part already has pixels and leaves its
     * alpha untouched, so with globalAlpha it is exactly a blend toward the
     * colour with the outline art intact. ('multiply' would need an
     * alpha-restoring pass that squares the edge alpha and eats the linework —
     * and this art is flat-shaded, so there is no shading to preserve anyway.)
     */
    _tintedLayer(slotIndex, img, w, h) {
        const amount = this._tintAmount(slotIndex);
        if (amount <= 0) return img;
        if (typeof document === 'undefined' || !document.createElement) return img;

        const k = ROBOCAT_TINT_SLOTS.indexOf(slotIndex);
        const hue = this.phenotype.tint[k].hue;
        const palette = (typeof window !== 'undefined') ? window.Palette : null;
        if (!palette) return img;
        const colour = palette.color(hue);

        if (!roboCatScratch) roboCatScratch = document.createElement('canvas');
        if (roboCatScratch.width !== w || roboCatScratch.height !== h) {
            roboCatScratch.width = w;
            roboCatScratch.height = h;
        }
        const sx = roboCatScratch.getContext('2d');
        sx.globalCompositeOperation = 'source-over';
        sx.globalAlpha = 1;
        sx.clearRect(0, 0, w, h);
        sx.drawImage(img, 0, 0, w, h);
        sx.globalCompositeOperation = 'source-atop';
        sx.globalAlpha = amount;
        sx.fillStyle = colour.css || `rgb(${colour.r},${colour.g},${colour.b})`;
        sx.fillRect(0, 0, w, h);
        sx.globalAlpha = 1;
        sx.globalCompositeOperation = 'source-over';
        return roboCatScratch;
    }

    // Shown only while nothing has loaded yet: a soft blob, so a fresh grid
    // reads as "arriving" rather than as sixteen broken tiles.
    _drawPlaceholder(ctx, w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.55, Math.min(w, h) * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    describeExtra() {
        const svc = (typeof window !== 'undefined') ? window.RoboParts : null;
        const parts = (this.phenotype || {}).parts || [];

        let out = '\n<span class="genome-label">Parts:</span>\n';
        for (let s = 0; s < ROBOCAT_SLOTS.length; s++) {
            const name = svc ? svc.partName(ROBOCAT_SET, s, parts[s]) : parts[s];
            const tint = this._tintAmount(s);
            const tintNote = tint > 0 ? `  tint ${(tint * 100).toFixed(0)}%` : '';
            out += `  ${ROBOCAT_SLOTS[s].name.padEnd(12)} ${name}${tintNote}\n`;
        }
        if (svc) out += `\n<span class="genome-label">Artwork:</span> ${svc.credit(ROBOCAT_SET)}\n`;
        return out;
    }

    toString() {
        const parts = (this.phenotype || {}).parts || [];
        return `RoboHashCatIndividual #${this.id} (fitness ${this.fitness}) — parts ${parts.join('/')}`;
    }
}

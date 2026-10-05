// ReflectiveSketchIndividual ("Reflective Sketch" in the UI)
//
// A line drawing made of a variable-length list of cubic Bezier strokes, where
// each stroke is placed *reflectively*: its start (and often its end) is not a
// coordinate but a reference to a salient locus of the drawing so far — where
// the last stroke ended, where two strokes crossed, a point along the "anchor"
// stroke, a free end still waiting for something to attach to it. The drawing
// is therefore a construction (in the compass-and-straightedge sense) rather
// than a list of shapes, and a mutation to an early stroke moves everything
// built on it.
//
// Genotype vs construction. The generator only *chooses*: each choice is drawn
// from a fixed list (reference kinds, ranks, arc-length fractions), never from
// the current state of the drawing. Resolving a choice against the drawing is a
// separate, pure step (`rsConstruct`, below) run in the individual. Two reasons:
//   - heritability: a gene means the same thing ("the 2nd most salient
//     crossing") whatever the drawing currently holds, and 'fine' mutation of a
//     fixed-size choice is a like-for-like resample;
//   - the generator stays short and editable in the code editor.
// A reference that cannot be resolved (no crossings yet, no free ends, …) falls
// back to "continue from the last stroke", and for the first stroke to the
// origin — so every choice always resolves to *something*.
//
// The registry holds FRAMES (a point plus a direction), not bare points, so a
// stroke can leave or arrive along a tangent: that is what lets consecutive
// strokes join smoothly into one gesture (G1 continuity), or strike off
// perpendicular to the stroke they hang from. Reference kinds:
//
//   continue        end of the last stroke, leaving along its tangent (and the
//                   start handle is forced along that tangent: a smooth join)
//   recent k end    start or end of the stroke k back (k = 0…2)
//   first           the very first start point of the drawing
//   anchorLongest t point at arc-length fraction t ∈ {0,¼,½,¾,1} along the
//                   longest stroke (geometric salience)
//   anchorUsed t    … along the most-referenced stroke (salience by use: a
//                   stroke gets credit each time a later stroke attaches to it,
//                   so attachments attract attachments — spines with ribs)
//   crossLast       the newest crossing
//   crossRanked r   the r-th most salient crossing (r = 0…2); salience =
//                   sin(crossing angle) × (1 + crossings nearby), so a clean
//                   perpendicular crossing in a busy region ranks highest
//   freeEnd r       the r-th newest dangling endpoint (one touching no other
//                   stroke), leaving outward — attaching there makes closure
//   point           a literal point and heading (the one non-reflective kind)
//
// A stroke's end is either another reference (probability = the drawing's
// `reach` gene, reduced for a stroke that starts at a fresh `point`, so some
// marks stay separate) or a free polar offset from its start frame. An end
// reference that lands on the stroke's own start makes a LOOP — a teardrop out
// and back, sized and aimed by the polar genes. Handles at each end
// are 'chord' (an angle off the chord: equal angles give a C, opposite an S),
// 'tangent' (along the end's frame) or 'normal' (perpendicular to it).
//
// Choosing which kind each stroke uses is weighted by a per-drawing `style`
// vector, so one drawing can be mostly continuous gesture and another mostly
// crossings — the preference itself evolves.
//
// Rendering is ink on paper with a pressure taper, rasterised into ImageData by
// a small antialiased capsule rasteriser (no canvas path API), so the same code
// renders headless in `scripts/sketch-preview.js`.

const RS_KINDS = ['continue', 'recent', 'first', 'anchorLongest', 'anchorUsed',
    'crossLast', 'crossRanked', 'freeEnd', 'point'];
const RS_TO_KINDS = ['recent', 'first', 'anchorLongest', 'anchorUsed',
    'crossLast', 'crossRanked', 'freeEnd', 'point'];
const RS_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const RS_HANDLES = ['chord', 'tangent', 'normal'];

// Choose a drawing. Every draw comes from a fixed list or range; resolving the
// choices against the drawing happens later, in rsConstruct. (Self-contained:
// the inner pickRef helper is declared here, as structural naming requires.)
const reflectiveSketchGenerator = (rnd) => {
    const n = rnd.randint(3, 16);              // number of strokes
    const reach = rnd.uniform(0.25, 1);        // P(a stroke ENDS on a reference); mean 0.625
    const weight = rnd.uniform(0.6, 2.2);      // overall pen weight
    const taper = rnd.uniform(0, 1);           // 0 = even line, 1 = brush-like taper

    // Per-drawing preference over reference kinds (squared → sharper tastes).
    const style = [];
    for (let i = 0; i < RS_KINDS.length; i++) {
        const u = rnd.random();
        style.push(u * u);
    }

    const pickRef = (kinds) => {
        let total = 0;
        for (let i = 0; i < kinds.length; i++) total += style[RS_KINDS.indexOf(kinds[i])] + 0.02;
        let u = rnd.random() * total;
        let kind = kinds[kinds.length - 1];
        for (let i = 0; i < kinds.length; i++) {
            u -= style[RS_KINDS.indexOf(kinds[i])] + 0.02;
            if (u <= 0) { kind = kinds[i]; break; }
        }
        if (kind === 'recent') return { kind, k: rnd.randint(0, 2), end: rnd.choice(['start', 'end']) };
        if (kind === 'anchorLongest' || kind === 'anchorUsed') return { kind, t: rnd.choice(RS_FRACTIONS) };
        if (kind === 'crossRanked' || kind === 'freeEnd') return { kind, r: rnd.randint(0, 2) };
        if (kind === 'point') return { kind, x: rnd.uniform(-1, 1), y: rnd.uniform(-1, 1), h: rnd.uniform(-180, 180) };
        return { kind };
    };

    const strokes = [];
    for (let i = 0; i < n; i++) {
        const from = pickRef(RS_KINDS);
        // A stroke that starts at a fresh point is a bit more likely to end
        // freely too, so some sketches keep a few separate marks.
        const to = rnd.random() < (from.kind === 'point' ? 0.6 * reach : reach) ? pickRef(RS_TO_KINDS) : null;
        strokes.push({
            from, to,
            turn: rnd.uniform(-180, 180),      // polar end: angle off the start frame
            len: rnd.uniform(0.3, 1.4),        // polar end: length
            h0: rnd.choice(RS_HANDLES), a0: rnd.uniform(-90, 90), k0: rnd.uniform(0.1, 0.6),
            h1: rnd.choice(RS_HANDLES), a1: rnd.uniform(-90, 90), k1: rnd.uniform(0.1, 0.6),
            side: rnd.choice([-1, 1]),         // which way a 'normal' handle points
            w: rnd.uniform(0.5, 1.5),          // this stroke's weight
        });
    }
    return { strokes, weight, taper };
};

const reflectiveSketchRepresentation = new PTORepresentation(reflectiveSketchGenerator);

// ---------------------------------------------------------------------------
// Geometry (pure helpers)

const RS_FLAT_SEGS = 24;    // polyline resolution for salience geometry
const RS_EPS = 0.03;        // "touching" distance, in drawing units
const RS_NEAR = 0.15;       // radius within which crossings count as one busy region

function rsBez(c, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0],
        a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}

function rsFlatten(c, segs) {
    const pts = [], cum = [0];
    for (let i = 0; i <= segs; i++) pts.push(rsBez(c, i / segs));
    for (let i = 1; i <= segs; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { pts, cum, len: cum[segs] };
}

function rsUnit(dx, dy) {
    const m = Math.hypot(dx, dy);
    return m > 1e-9 ? [dx / m, dy / m] : [1, 0];
}

function rsBezTan(c, t) {
    const u = 1 - t;
    return [3 * u * u * (c[1][0] - c[0][0]) + 6 * u * t * (c[2][0] - c[1][0]) + 3 * t * t * (c[3][0] - c[2][0]),
        3 * u * u * (c[1][1] - c[0][1]) + 6 * u * t * (c[2][1] - c[1][1]) + 3 * t * t * (c[3][1] - c[2][1])];
}

/** Frame at arc-length fraction f along a stroke, tangent in drawing direction.
 *  Endpoints use the curve's own point and exact tangent, so a 'continue' join
 *  is truly G1 (the polyline's last segment is only an approximation). */
function rsFrameAt(s, f) {
    const { c, pts, cum, len } = s;
    if (f <= 0 || f >= 1) {
        const t = f <= 0 ? 0 : 1;
        let [dx, dy] = rsBezTan(c, t);
        if (Math.hypot(dx, dy) < 1e-9) {        // coincident handle: tangent of the next control point over
            const q = t === 0 ? c[2] : c[1], p = c[t === 0 ? 0 : 3];
            [dx, dy] = t === 0 ? [q[0] - p[0], q[1] - p[1]] : [p[0] - q[0], p[1] - q[1]];
        }
        [dx, dy] = rsUnit(dx, dy);
        return { x: c[t * 3][0], y: c[t * 3][1], dx, dy };
    }
    const target = f * len;
    let i = 1;
    while (i < pts.length - 1 && cum[i] < target) i++;
    const segLen = cum[i] - cum[i - 1];
    const u = segLen > 1e-12 ? (target - cum[i - 1]) / segLen : 0;
    const [dx, dy] = rsUnit(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return {
        x: pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0]),
        y: pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1]),
        dx, dy,
    };
}

/** Proper intersection of segments ab and cd → [t, u] params, or null. */
function rsSegX(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return (t >= 0 && t < 1 && u >= 0 && u < 1) ? [t, u] : null;
}

function rsDistToPoly(x, y, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], ay = pts[i - 1][1];
        const vx = pts[i][0] - ax, vy = pts[i][1] - ay;
        const vv = vx * vx + vy * vy;
        const t = vv > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / vv)) : 0;
        best = Math.min(best, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    }
    return best;
}

/** Crossings of the newest stroke (index b) against stroke a. Attachments
 *  (within the first/last 3% of the new stroke) are joins, not crossings. */
function rsCrossings(strokes, a, b) {
    const P = strokes[a].pts, Q = strokes[b].pts, out = [];
    const nq = Q.length - 1;
    for (let j = 1; j < Q.length; j++) {
        for (let i = 1; i < P.length; i++) {
            const hit = rsSegX(Q[j - 1], Q[j], P[i - 1], P[i]);
            if (!hit) continue;
            const f = (j - 1 + hit[0]) / nq;
            if (f < 0.03 || f > 0.97) continue;
            const [qx, qy] = rsUnit(Q[j][0] - Q[j - 1][0], Q[j][1] - Q[j - 1][1]);
            let [px, py] = rsUnit(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
            if (px * qx + py * qy < 0) { px = -px; py = -py; }
            const cross = Math.abs(qx * py - qy * px);   // sin of the crossing angle
            const [dx, dy] = rsUnit(px + qx, py + qy);   // bisector
            out.push({
                x: Q[j - 1][0] + hit[0] * (Q[j][0] - Q[j - 1][0]),
                y: Q[j - 1][1] + hit[0] * (Q[j][1] - Q[j - 1][1]),
                dx, dy, sin: cross, a, b,
            });
        }
    }
    return out;
}

/** Crossings ranked by salience: sin(angle) × (1 + crossings nearby); ties to the older. */
function rsRankedCrossings(crosses) {
    const scored = crosses.map((c, seq) => {
        let near = 0;
        for (const o of crosses) if (o !== c && Math.hypot(o.x - c.x, o.y - c.y) < RS_NEAR) near++;
        return { c, seq, score: c.sin * (1 + near) };
    });
    scored.sort((p, q) => (q.score - p.score) || (p.seq - q.seq));
    return scored.map(s => s.c);
}

/** Dangling endpoints, newest first; each leaves outward from its stroke.
 *  A loop's ends meet each other, so a loop has none. */
function rsFreeEnds(strokes) {
    const out = [];
    for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].loop) continue;
        for (const end of ['end', 'start']) {
            const f = rsFrameAt(strokes[i], end === 'end' ? 1 : 0);
            let free = true;
            for (let j = 0; j < strokes.length && free; j++) {
                if (j !== i && rsDistToPoly(f.x, f.y, strokes[j].pts) < RS_EPS) free = false;
            }
            if (free) out.push(end === 'end' ? { ...f, on: [i] } : { ...f, dx: -f.dx, dy: -f.dy, on: [i] });
        }
    }
    return out;
}

function rsArgmax(strokes, key) {
    let best = 0;
    for (let i = 1; i < strokes.length; i++) if (key(strokes[i]) > key(strokes[best])) best = i;
    return best;
}

/** Resolve a reference against the drawing so far → frame {x,y,dx,dy,on}, or null. */
function rsResolve(ref, strokes, crosses) {
    const n = strokes.length;
    const endFrame = (i, end) => {
        const f = rsFrameAt(strokes[i], end === 'end' ? 1 : 0);
        return end === 'end' ? { ...f, on: [i] } : { ...f, dx: -f.dx, dy: -f.dy, on: [i] };
    };
    switch (ref.kind) {
        case 'continue': return n ? endFrame(n - 1, 'end') : null;
        case 'recent': return n - 1 - ref.k >= 0 ? endFrame(n - 1 - ref.k, ref.end) : null;
        case 'first': return n ? endFrame(0, 'start') : null;
        case 'anchorLongest':
        case 'anchorUsed': {
            if (!n) return null;
            const i = ref.kind === 'anchorLongest' ? rsArgmax(strokes, s => s.len) : rsArgmax(strokes, s => s.uses);
            return { ...rsFrameAt(strokes[i], ref.t), on: [i] };
        }
        case 'crossLast': {
            const c = crosses[crosses.length - 1];
            return c ? { x: c.x, y: c.y, dx: c.dx, dy: c.dy, on: [c.a, c.b] } : null;
        }
        case 'crossRanked': {
            const c = rsRankedCrossings(crosses)[ref.r];
            return c ? { x: c.x, y: c.y, dx: c.dx, dy: c.dy, on: [c.a, c.b] } : null;
        }
        case 'freeEnd': return rsFreeEnds(strokes)[ref.r] || null;
        case 'point': {
            const h = ref.h * Math.PI / 180;
            return { x: ref.x, y: ref.y, dx: Math.cos(h), dy: Math.sin(h), on: [] };
        }
    }
    return null;
}

/** Place a stroke's four control points from its resolved start frame F and
 *  end frame T (null for a free polar end). */
function rsControlPoints(g, F, T, h0) {
    const P0 = [F.x, F.y];

    // An end that lands on the start makes a LOOP (a teardrop out and back
    // to the same point). Handle lengths can't scale with the chord here (it
    // is zero), so the polar `len` gene sizes the loop, `turn` aims it, and
    // the two chord angles set how wide each side opens.
    if (T && Math.hypot(T.x - F.x, T.y - F.y) < 0.05) {
        const open0 = (20 + 0.6 * Math.abs(g.a0)) * Math.PI / 180;
        const open1 = (20 + 0.6 * Math.abs(g.a1)) * Math.PI / 180;
        const heading = Math.atan2(F.dy, F.dx);
        // After a 'continue', leave along the previous tangent (a G1 join into the loop).
        const axis = h0 === 'continue' ? heading + open0 : heading + g.turn * Math.PI / 180;
        const s0 = g.len * (0.5 + g.k0), s1 = g.len * (0.5 + g.k1);
        const c = [P0,
            [P0[0] + s0 * Math.cos(axis - open0), P0[1] + s0 * Math.sin(axis - open0)],
            [P0[0] + s1 * Math.cos(axis + open1), P0[1] + s1 * Math.sin(axis + open1)],
            [P0[0], P0[1]]];
        return { c, h1: 'loop', loop: true };
    }

    let P3;
    if (T) P3 = [T.x, T.y];
    else {
        const ang = Math.atan2(F.dy, F.dx) + g.turn * Math.PI / 180;
        P3 = [F.x + g.len * Math.cos(ang), F.y + g.len * Math.sin(ang)];
    }
    const L = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]);
    const phi = Math.atan2(P3[1] - P0[1], P3[0] - P0[0]);
    const [cx, cy] = [Math.cos(phi), Math.sin(phi)];

    // Start handle. 'continue' always leaves along the previous tangent.
    let P1;
    if (h0 === 'continue') P1 = [P0[0] + g.k0 * L * F.dx, P0[1] + g.k0 * L * F.dy];
    else if (h0 === 'tangent') {
        const sgn = (F.dx * cx + F.dy * cy) < 0 ? -1 : 1;
        P1 = [P0[0] + sgn * g.k0 * L * F.dx, P0[1] + sgn * g.k0 * L * F.dy];
    } else if (h0 === 'normal') P1 = [P0[0] - g.side * g.k0 * L * F.dy, P0[1] + g.side * g.k0 * L * F.dx];
    else {
        const a = phi + g.a0 * Math.PI / 180;
        P1 = [P0[0] + g.k0 * L * Math.cos(a), P0[1] + g.k0 * L * Math.sin(a)];
    }

    // End handle: frame-relative only when the end is a reference.
    const h1 = T ? g.h1 : 'chord';
    let P2;
    if (h1 === 'tangent') {
        const sgn = (T.dx * cx + T.dy * cy) < 0 ? -1 : 1;
        P2 = [P3[0] - sgn * g.k1 * L * T.dx, P3[1] - sgn * g.k1 * L * T.dy];
    } else if (h1 === 'normal') P2 = [P3[0] - g.side * g.k1 * L * T.dy, P3[1] + g.side * g.k1 * L * T.dx];
    else {
        const a = phi - g.a1 * Math.PI / 180;
        P2 = [P3[0] - g.k1 * L * Math.cos(a), P3[1] - g.k1 * L * Math.sin(a)];
    }

    return { c: [P0, P1, P2, P3], h1, loop: false };
}

/**
 * Build the drawing from the generator's choices: resolve each stroke's
 * references against the strokes placed before it, place its control points,
 * then register its crossings and credit the strokes it attached to.
 * Returns { strokes: [{c, pts, cum, len, uses, w, from, to, fromFell, toFell, loop}], crosses }.
 */
function rsConstruct(spec) {
    const strokes = [], crosses = [];
    for (const g of (spec && spec.strokes) || []) {
        let F = rsResolve(g.from, strokes, crosses);
        const fromFell = !F;
        if (!F) F = rsResolve({ kind: 'continue' }, strokes, crosses) || { x: 0, y: 0, dx: 1, dy: 0, on: [] };

        const T = g.to ? rsResolve(g.to, strokes, crosses) : null;
        const toFell = !!g.to && !T;
        const h0 = (g.from.kind === 'continue' && !fromFell) ? 'continue' : g.h0;
        const { c, h1, loop } = rsControlPoints(g, F, T, h0);
        for (const i of F.on) strokes[i].uses++;
        if (T) for (const i of T.on) strokes[i].uses++;
        strokes.push({ c, ...rsFlatten(c, RS_FLAT_SEGS), uses: 0, w: g.w, from: g.from, to: g.to, fromFell, toFell, h0, h1, loop });
        const b = strokes.length - 1;
        for (let a = 0; a < b; a++) crosses.push(...rsCrossings(strokes, a, b));
    }
    return { strokes, crosses };
}

const RS_FRACTION_LABELS = { 0: '0', 0.25: '¼', 0.5: '½', 0.75: '¾', 1: '1' };

function rsRefLabel(ref) {
    if (!ref) return 'free';
    switch (ref.kind) {
        case 'continue': return 'continue';
        case 'recent': return `${ref.end} of stroke −${ref.k + 1}`;
        case 'first': return 'first start';
        case 'anchorLongest': return `longest @${RS_FRACTION_LABELS[ref.t]}`;
        case 'anchorUsed': return `most-used @${RS_FRACTION_LABELS[ref.t]}`;
        case 'crossLast': return '✕ newest';
        case 'crossRanked': return `✕ #${ref.r + 1}`;
        case 'freeEnd': return `free end #${ref.r + 1}`;
        case 'point': return `point (${ref.x.toFixed(2)}, ${ref.y.toFixed(2)})`;
    }
    return ref.kind;
}

// Construction is pure in the phenotype, and the phenotype object is cached per
// trace by PTORepresentation, so memoise on its identity.
const rsDrawingCache = new WeakMap();

class ReflectiveSketchIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = reflectiveSketchRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    /** The resolved drawing: strokes with control points + the crossings registry. */
    drawing() {
        const p = this.phenotype;
        if (!p || typeof p !== 'object') return { strokes: [], crosses: [] };
        let d = rsDrawingCache.get(p);
        if (!d) { d = rsConstruct(p); rsDrawingCache.set(p, d); }
        return d;
    }

    renderKey() {
        return JSON.stringify(this.phenotype);
    }

    validate() {
        const { strokes } = this.drawing();
        if (strokes.length < 2) return false;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const s of strokes) for (const [x, y] of s.pts) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        return Math.max(maxX - minX, maxY - minY) > 0.2;
    }

    visualize(canvas) {
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            ReflectiveSketchIndividual.paint(imageData, this.drawing(), this.phenotype);
            return imageData;
        });
    }

    /** Paint ink-on-paper strokes into an ImageData (also used headless). */
    static paint(imageData, drawing, spec) {
        const { data, width, height } = imageData;
        const PAPER = [246, 241, 231], INK = [28, 26, 34], INK_ALPHA = 0.9;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = PAPER[0]; data[i + 1] = PAPER[1]; data[i + 2] = PAPER[2]; data[i + 3] = 255;
        }
        const strokes = drawing.strokes;
        if (!strokes.length) return;

        const sc = Math.min(width, height) / 128;               // resolution independence
        const weight = (spec && spec.weight) || 1, taper = (spec && spec.taper) || 0;
        const halfW = (s, t) => {
            const profile = (1 - taper) + taper * Math.pow(Math.sin(Math.PI * t), 0.5);
            return 0.5 * 1.1 * sc * weight * s.w * Math.max(0.15, profile);
        };

        // Fit the bounding box (of the curves, not the control points).
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const s of strokes) for (const [x, y] of s.pts) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        const margin = 0.1 * Math.min(width, height);
        const span = Math.max(maxX - minX, maxY - minY, 1e-6);
        const k = (Math.min(width, height) - 2 * margin) / span;
        const ox = width / 2 - k * (minX + maxX) / 2, oy = height / 2 - k * (minY + maxY) / 2;

        const cov = new Float32Array(width * height);
        for (const s of strokes) {
            // Re-flatten at render resolution so zoomed curves stay smooth.
            const segs = Math.max(8, Math.min(240, Math.ceil(s.len * k / 3)));
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const [x, y] = rsBez(s.c, i / segs);
                pts.push([x * k + ox, y * k + oy, halfW(s, i / segs)]);
            }
            let bx0 = width, bx1 = -1, by0 = height, by1 = -1;
            for (let i = 1; i < pts.length; i++) {
                const [ax, ay, ar] = pts[i - 1], [qx, qy, qr] = pts[i];
                const r = Math.max(ar, qr) + 1;
                const x0 = Math.max(0, Math.floor(Math.min(ax, qx) - r)), x1 = Math.min(width - 1, Math.ceil(Math.max(ax, qx) + r));
                const y0 = Math.max(0, Math.floor(Math.min(ay, qy) - r)), y1 = Math.min(height - 1, Math.ceil(Math.max(ay, qy) + r));
                bx0 = Math.min(bx0, x0); bx1 = Math.max(bx1, x1); by0 = Math.min(by0, y0); by1 = Math.max(by1, y1);
                const vx = qx - ax, vy = qy - ay, vv = vx * vx + vy * vy;
                for (let py = y0; py <= y1; py++) {
                    for (let px = x0; px <= x1; px++) {
                        const dx = px + 0.5 - ax, dy = py + 0.5 - ay;
                        const t = vv > 0 ? Math.max(0, Math.min(1, (dx * vx + dy * vy) / vv)) : 0;
                        const d = Math.hypot(dx - t * vx, dy - t * vy);
                        const c = Math.min(1, ar + t * (qr - ar) - d + 0.5);
                        const idx = py * width + px;
                        if (c > cov[idx]) cov[idx] = c;
                    }
                }
            }
            // Composite this stroke (max-coverage within a stroke, so its own
            // segments don't double up; overlapping strokes do darken).
            for (let py = by0; py <= by1; py++) {
                for (let px = bx0; px <= bx1; px++) {
                    const idx = py * width + px, c = cov[idx];
                    if (c <= 0) continue;
                    cov[idx] = 0;
                    const a = c * INK_ALPHA, o = idx * 4;
                    data[o] += (INK[0] - data[o]) * a;
                    data[o + 1] += (INK[1] - data[o + 1]) * a;
                    data[o + 2] += (INK[2] - data[o + 2]) * a;
                }
            }
        }
    }

    getPhenotype() {
        const { strokes, crosses } = this.drawing();
        let ends = 0, attached = 0;
        for (const s of strokes) {
            ends += 2;
            if (!s.fromFell && s.from.kind !== 'point') attached++;
            if (s.to && !s.toFell && s.to.kind !== 'point') attached++;
        }
        const pct = ends ? Math.round(100 * attached / ends) : 0;
        return `${strokes.length} strokes, ${crosses.length} crossings, ${pct}% of stroke ends placed by reference`;
    }

    describeExtra() {
        const { strokes, crosses } = this.drawing();
        if (!strokes.length) return '';
        const longest = rsArgmax(strokes, s => s.len), used = rsArgmax(strokes, s => s.uses);
        let s = '\n<span class="genome-label">Construction:</span>\n';
        strokes.forEach((st, i) => {
            const from = rsRefLabel(st.from) + (st.fromFell ? ' (→ continue)' : '');
            const to = st.to ? rsRefLabel(st.to) + (st.toFell ? ' (→ free)' : '') : 'free';
            const curve = st.loop ? (st.h0 === 'continue' ? 'smooth join, loop' : 'loop')
                : st.h0 === 'continue' ? 'smooth join' : `handles ${st.h0}/${st.to && !st.toFell ? st.h1 : 'chord'}`;
            s += `  ${String(i + 1).padStart(2)}. ${from} → ${to}   [${curve}]\n`;
        });
        s += '\n<span class="genome-label">Salience:</span>\n';
        s += `  longest stroke: ${longest + 1}; most-used stroke: ${used + 1} (${strokes[used].uses} attachments)\n`;
        s += `  ${crosses.length} crossings, ${rsFreeEnds(strokes).length} free ends\n`;
        return s;   // labels contain no HTML-special characters
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReflectiveSketchIndividual;
}

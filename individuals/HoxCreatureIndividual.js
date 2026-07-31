// HoxCreatureIndividual
//
// A segmented body-plan individual — the evo-devo demonstration type. Every
// PTO-backed individual already has an indirect genotype→phenotype map, but
// this one is built specifically to show the two extra evo-devo hallmarks
// that a direct-mapped genome (e.g. GridIndividual's 64 independent bits)
// cannot: GENE REUSE (a small "toolkit" of segment archetypes is invoked at
// every segment that expresses it) and a REGULATORY ("Hox") LAYER that
// decides *which* archetype each segment expresses, so a single point
// mutation to one Hox gene can flip a whole segment's identity — a visible,
// homeotic-style jump — while the shared drawing code for that archetype is
// untouched.
//
// Presentation: a top-down "museum display" insect. The body runs vertically,
// head at the top (a custom head segment with eyes and gene-controlled
// antennae), tail at the bottom; appendages splay left and right (bilateral
// symmetry). Drawn cartoon-style on a white ground: black outlines everywhere,
// palette colours used only for the fills. The whole creature is measured and
// fit-scaled into the tile each render, so long legs / big wings / antennae
// stay inside the cell wherever the Hox array puts them.
//
// Genome layers (all produced by explicit `for` loops, per the structural-
// naming rules in PTORepresentation.js — no closures, no `new`, no
// Array.from):
//   1. Toolkit (structural genes, built once): K segment archetypes
//      (leg / spike / wing / plain), each with continuous shape params plus a
//      discrete leg-style gene (straight vs jointed). Reused wherever a
//      segment's Hox gene selects it.
//   2. Axis genes (regulatory, whole-body): spine curvature (a sideways bow),
//      an anterior→posterior taper gradient, a base hue, a single segment-
//      shape gene (ellipse / rectangle / triangle / circle), head size, and
//      antenna length + curvature. Mutating these reshapes the whole creature
//      uniformly (regulatory-gene-level change, as opposed to a toolkit/
//      structural-gene mutation).
//   3. Hox array (regulatory, per-segment): for each segment, an identity
//      gene picks which archetype is expressed there, plus a graded
//      expression-strength gene (not just on/off).
//   4. Segment count itself is evolvable — a stand-in for a segmentation-
//      clock gene — giving variable-length body plans.
const hoxCreatureGenerator = (rnd) => {
    const K = 4; // toolkit size: 0=leg, 1=spike, 2=wing, 3=plain
    const toolkit = [];
    for (let k = 0; k < K; k++) {
        toolkit.push({
            length: rnd.uniform(0.5, 1.6),
            curve: rnd.uniform(-0.6, 0.6),
            spread: rnd.uniform(0.15, 0.9),
            jointed: rnd.choice([0, 1]),   // leg style: 0=straight, 1=jointed
        });
    }

    const numSegments = rnd.randint(4, 12);
    const spineCurvature = rnd.uniform(-1, 1);
    const taperStart = rnd.uniform(0.5, 1.0);
    const taperEnd = rnd.uniform(0.2, 1.0);
    const hueSeed = rnd.uniform(0, 1);
    const segShape = rnd.choice([0, 1, 2, 3]); // 0=ellipse, 1=rectangle, 2=triangle, 3=circle
    const headSize = rnd.uniform(0.7, 1.6);
    const antennaLength = rnd.uniform(0.5, 2.2);
    const antennaCurve = rnd.uniform(-1, 1);

    const segments = [];
    for (let i = 0; i < numSegments; i++) {
        segments.push({
            archetype: rnd.choice([0, 1, 2, 3]),
            strength: rnd.uniform(0, 1),
        });
    }

    return {
        numSegments, spineCurvature, taperStart, taperEnd, hueSeed,
        segShape, headSize, antennaLength, antennaCurve, toolkit, segments,
    };
};

// One shared, stateless representation for all individuals of this type.
const hoxCreatureRepresentation = new PTORepresentation(hoxCreatureGenerator);

// Human-readable names, index-matched to the generator's choices.
const HOX_ARCHETYPE_NAMES = ['leg', 'spike', 'wing', 'plain'];
const HOX_SHAPE_NAMES = ['ellipse', 'rectangle', 'triangle', 'circle'];

const HOX_INK = '#141414'; // cartoon black for every outline

const hoxLerp = (a, b, t) => a + (b - a) * t;

class HoxCreatureIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = hoxCreatureRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    // Genome panel: the Hox array (segment → expressed archetype → strength),
    // so a homeotic mutation is visible in the data, not just the picture.
    describeExtra() {
        const p = this.phenotype;
        let out = `\n<span class="genome-label">Body plan (${p.numSegments} segments, ${HOX_SHAPE_NAMES[p.segShape]} plates):</span>\n`;
        for (let i = 0; i < p.segments.length; i++) {
            const seg = p.segments[i];
            out += `  segment ${i}: ${HOX_ARCHETYPE_NAMES[seg.archetype]} (expression ${seg.strength.toFixed(2)})\n`;
        }
        return out;
    }

    // ---- Geometry (built once, then measured & fit-scaled) ------------------
    //
    // All geometry is expressed as pure functions of a nominal radius R and a
    // centre (cx, cy): positions scale linearly with R and translate with the
    // centre (tangents are scale/translation-invariant). visualize() therefore
    // builds the geometry once at R=1 around the origin, measures its bounding
    // box, then rebuilds at the R and centre that fit the box into the tile —
    // so nothing (antennae, big wings on the last segment) escapes the cell.
    // Pixel-unit constants (stroke widths, foot dots) are added only at draw
    // time and absorbed by the fit margin, so they aren't part of this space.

    // Segment anchors down a vertical spine (a quadratic bezier from top to
    // bottom, bowed sideways by the spineCurvature axis gene), head-to-tail.
    // `tangent` points down the body toward the tail; appendages are drawn
    // perpendicular to it, splaying left and right (bilateral symmetry).
    _spineAnchors(p, cx, cy, R) {
        const top = cy - R * 0.72;
        const bottom = cy + R;
        const p0 = { x: cx, y: top };
        const p2 = { x: cx, y: bottom };
        const p1 = { x: cx + p.spineCurvature * R * 0.5, y: (top + bottom) / 2 };
        const anchors = [];
        for (let i = 0; i < p.numSegments; i++) {
            const u = (i + 0.5) / p.numSegments;
            const mu = 1 - u;
            const x = mu * mu * p0.x + 2 * mu * u * p1.x + u * u * p2.x;
            const y = mu * mu * p0.y + 2 * mu * u * p1.y + u * u * p2.y;
            const dx = 2 * mu * (p1.x - p0.x) + 2 * u * (p2.x - p1.x);
            const dy = 2 * mu * (p1.y - p0.y) + 2 * u * (p2.y - p1.y);
            anchors.push({ x, y, tangent: Math.atan2(dy, dx) });
        }
        return anchors;
    }

    // The outer points of one segment's bilateral appendage pair — the tips
    // (and, for wings, the fan bulge) that bound the drawing. Also carries the
    // intermediate points the draw path needs, so bounds and rendering share
    // one source of truth. Returns [] for 'plain'.
    _appendageSides(a, archIdx, arch, strength, taper, R) {
        if (archIdx === 3) return [];
        const base = arch.length * R * (0.3 + 0.7 * strength) * taper;
        const sweep = arch.spread * 0.8; // splay swept back toward the tail
        const sides = [];
        for (const side of [-1, 1]) {
            const dir = a.tangent + side * (Math.PI / 2 - sweep);
            const cosD = Math.cos(dir), sinD = Math.sin(dir);
            const perpX = -sinD, perpY = cosD;

            if (archIdx === 0) {           // leg — longer than the other appendages
                const len = base * 1.05;
                if (arch.jointed) {
                    // Femur out-and-up toward the head, tibia out-and-down to
                    // the foot: an insect knee (up, then down). Blend the
                    // sideways direction (Lx,Ly) with anterior (−T) then
                    // posterior (+T), curve gene tuning the bend.
                    const Tx = Math.cos(a.tangent), Ty = Math.sin(a.tangent); // toward tail
                    const Lx = -Ty * side, Ly = Tx * side;                    // sideways (bilateral)
                    let fx = Lx * 0.85 - Tx * (0.45 + arch.curve * 0.3);
                    let fy = Ly * 0.85 - Ty * (0.45 + arch.curve * 0.3);
                    const fn = Math.hypot(fx, fy) || 1; fx /= fn; fy /= fn;
                    const midX = a.x + fx * len * 0.55;
                    const midY = a.y + fy * len * 0.55;
                    let gx = Lx * 0.5 + Tx * (0.7 + arch.curve * 0.3);
                    let gy = Ly * 0.5 + Ty * (0.7 + arch.curve * 0.3);
                    const gn = Math.hypot(gx, gy) || 1; gx /= gn; gy /= gn;
                    const endX = midX + gx * len * 0.6;
                    const endY = midY + gy * len * 0.6;
                    sides.push({ archIdx, side, jointed: true, midX, midY, endX, endY });
                } else {
                    const endX = a.x + cosD * len;
                    const endY = a.y + sinD * len;
                    sides.push({ archIdx, side, jointed: false, endX, endY });
                }
            } else if (archIdx === 1) {    // spike
                const len = base * 0.55;
                sides.push({ archIdx, side, cosD, sinD, perpX, perpY, len, base,
                    tipX: a.x + cosD * len, tipY: a.y + sinD * len });
            } else if (archIdx === 2) {    // wing — the big appendage
                const len = base * 1.15;
                const wingW = len * 0.62;
                // `side * perp` mirrors the fan across the spine, so the left
                // and right wings are true reflections (not 180°-rotations,
                // which read as one wing being upside-down).
                sides.push({ archIdx, side, cosD, sinD, perpX, perpY, len, wingW,
                    bulgeX: a.x + cosD * len * 0.55 + side * perpX * wingW,
                    bulgeY: a.y + sinD * len * 0.55 + side * perpY * wingW,
                    tipX: a.x + cosD * len, tipY: a.y + sinD * len });
            }
        }
        return sides;
    }

    _headGeom(p, a, R) {
        const dir = a.tangent;
        const cosD = Math.cos(dir), sinD = Math.sin(dir);
        const perpX = -sinD, perpY = cosD;
        const upX = -cosD, upY = -sinD;                 // anterior direction
        const hr = R * 0.24 * p.headSize;
        const hx = a.x + upX * hr * 0.9;
        const hy = a.y + upY * hr * 0.9;

        const antennae = [];
        for (const side of [-1, 1]) {
            const rootX = hx + upX * hr * 0.5 + perpX * side * hr * 0.5;
            const rootY = hy + upY * hr * 0.5 + perpY * side * hr * 0.5;
            const alen = hr * 2.2 * p.antennaLength;
            const tipX = rootX + upX * alen + perpX * side * alen * 0.5;
            const tipY = rootY + upY * alen + perpY * side * alen * 0.5;
            const bow = p.antennaCurve * alen * 0.6;    // gene-controlled curvature
            const ctrlX = (rootX + tipX) / 2 + perpX * side * bow;
            const ctrlY = (rootY + tipY) / 2 + perpY * side * bow;
            antennae.push({ rootX, rootY, ctrlX, ctrlY, tipX, tipY });
        }

        const eyes = [];
        for (const side of [-1, 1]) {
            eyes.push({
                ex: hx + perpX * side * hr * 0.42 + upX * hr * 0.35,
                ey: hy + perpY * side * hr * 0.42 + upY * hr * 0.35,
            });
        }
        return { hx, hy, hr, dir, cosD, sinD, upX, upY, antennae, eyes };
    }

    _buildGeometry(p, cx, cy, R) {
        const anchors = this._spineAnchors(p, cx, cy, R);
        const segs = [];
        for (let i = 0; i < anchors.length; i++) {
            const a = anchors[i];
            const seg = p.segments[i];
            const arch = p.toolkit[seg.archetype];
            const u = (i + 0.5) / p.numSegments;
            const taper = hoxLerp(p.taperStart, p.taperEnd, u);
            const neighbour = anchors[i + 1] || anchors[i - 1] || a;
            const gap = Math.hypot(neighbour.x - a.x, neighbour.y - a.y) || R * 0.18;
            const rx = R * 0.24 * taper;
            const ry = Math.max(rx * 0.7, gap * 0.72);
            segs.push({
                a, u, taper, archIdx: seg.archetype, color: this._color(p, u),
                rx, ry,
                sides: this._appendageSides(a, seg.archetype, arch, seg.strength, taper, R),
            });
        }
        const head = this._headGeom(p, anchors[0], R);
        return { anchors, segs, head, headColor: this._color(p, 0) };
    }

    _boundsPoints(geom) {
        const pts = [];
        for (const s of geom.segs) {
            const { a, rx, ry } = s;
            pts.push({ x: a.x + rx, y: a.y + ry }, { x: a.x - rx, y: a.y - ry },
                     { x: a.x + rx, y: a.y - ry }, { x: a.x - rx, y: a.y + ry });
            for (const side of s.sides) {
                if (side.jointed) pts.push({ x: side.midX, y: side.midY });
                pts.push({ x: side.endX ?? side.tipX, y: side.endY ?? side.tipY });
                if (side.bulgeX !== undefined) pts.push({ x: side.bulgeX, y: side.bulgeY });
            }
        }
        const h = geom.head;
        pts.push({ x: h.hx + h.hr, y: h.hy + h.hr }, { x: h.hx - h.hr, y: h.hy - h.hr },
                 { x: h.hx + h.hr, y: h.hy - h.hr }, { x: h.hx - h.hr, y: h.hy + h.hr });
        for (const ant of h.antennae) {
            pts.push({ x: ant.tipX, y: ant.tipY }, { x: ant.ctrlX, y: ant.ctrlY });
        }
        return pts;
    }

    _color(p, u) {
        const c = window.Palette.color((p.hueSeed + u * 0.6) % 1);
        return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }

    // ---- Drawing ------------------------------------------------------------

    // A black joint linking each pair of consecutive plates, drawn under them:
    // where plates overlap it's hidden, where a gap opens (small circle plates,
    // a low segment count) it reads as the dark joint between two segments.
    _drawSpine(ctx, segs, s) {
        ctx.strokeStyle = HOX_INK;
        for (let i = 0; i < segs.length - 1; i++) {
            const a = segs[i].a, b = segs[i + 1].a;
            const w = Math.min(segs[i].rx, segs[i + 1].rx) * 1.5 + 2 * s;
            ctx.lineWidth = Math.max(2, w);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
    }

    // A segment's body plate: a palette-filled shape (chosen by the single
    // segShape axis gene) with a black outline, its long axis along the spine.
    _drawPlate(ctx, seg, shape, s) {
        const { a, rx: rx0, ry } = seg;
        const rx = rx0 + 2 * s;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.tangent - Math.PI / 2); // local +y runs down the spine (toward tail)
        ctx.fillStyle = seg.color;
        ctx.strokeStyle = HOX_INK;
        ctx.lineWidth = Math.max(1.2, 2 * s);
        ctx.beginPath();
        if (shape === 1) {                    // rectangle (rounded)
            const r = Math.min(rx, ry) * 0.35;
            if (ctx.roundRect) ctx.roundRect(-rx, -ry, rx * 2, ry * 2, r);
            else ctx.rect(-rx, -ry, rx * 2, ry * 2);
        } else if (shape === 2) {             // triangle, apex toward the head
            ctx.moveTo(0, -ry);
            ctx.lineTo(rx, ry);
            ctx.lineTo(-rx, ry);
            ctx.closePath();
        } else if (shape === 3) {             // circle
            ctx.arc(0, 0, Math.min(rx, ry), 0, Math.PI * 2);
        } else {                              // ellipse (default)
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // The bilateral appendage pair a segment's Hox gene selected. Legs are
    // black lines (straight or jointed, per the toolkit gene); spikes and
    // wings are palette-filled with a black outline.
    _drawAppendage(ctx, seg, s) {
        const outline = Math.max(1, 2 * s);
        for (const side of seg.sides) {
            const a = seg.a;
            if (side.archIdx === 0) {          // leg
                ctx.strokeStyle = HOX_INK;
                ctx.lineWidth = Math.max(1.2, 2.4 * seg.taper * s);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                if (side.jointed) ctx.lineTo(side.midX, side.midY);
                ctx.lineTo(side.endX, side.endY);
                ctx.stroke();
                ctx.fillStyle = HOX_INK;      // foot
                ctx.beginPath();
                ctx.arc(side.endX, side.endY, Math.max(1.2, 1.6 * s), 0, Math.PI * 2);
                ctx.fill();
            } else if (side.archIdx === 1) {   // spike
                const baseW = Math.max(2, 3 * s) + side.base * 0.06;
                ctx.fillStyle = seg.color;
                ctx.strokeStyle = HOX_INK;
                ctx.lineWidth = outline;
                ctx.beginPath();
                ctx.moveTo(a.x + side.perpX * baseW, a.y + side.perpY * baseW);
                ctx.lineTo(a.x - side.perpX * baseW, a.y - side.perpY * baseW);
                ctx.lineTo(side.tipX, side.tipY);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (side.archIdx === 2) {   // wing
                ctx.fillStyle = seg.color;
                ctx.strokeStyle = HOX_INK;
                ctx.lineWidth = outline;
                ctx.globalAlpha = 0.82;        // slight translucency where wings overlap
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.quadraticCurveTo(side.bulgeX, side.bulgeY, side.tipX, side.tipY);
                ctx.quadraticCurveTo(
                    a.x + side.cosD * side.len * 0.35 - side.side * side.perpX * side.wingW * 0.25,
                    a.y + side.sinD * side.len * 0.35 - side.side * side.perpY * side.wingW * 0.25,
                    a.x, a.y
                );
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.beginPath();               // a single vein
                ctx.lineWidth = Math.max(0.75, s);
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(a.x + side.cosD * side.len * 0.8, a.y + side.sinD * side.len * 0.8);
                ctx.stroke();
            }
        }
    }

    // The custom head segment: gene-scaled head capsule, two cartoon eyes, and
    // a pair of gene-controlled antennae (length + curvature) with bulb tips.
    _drawHead(ctx, h, fill, s) {
        // Antennae behind the head.
        ctx.strokeStyle = HOX_INK;
        ctx.lineWidth = Math.max(1, 1.8 * s);
        for (const ant of h.antennae) {
            ctx.beginPath();
            ctx.moveTo(ant.rootX, ant.rootY);
            ctx.quadraticCurveTo(ant.ctrlX, ant.ctrlY, ant.tipX, ant.tipY);
            ctx.stroke();
            ctx.fillStyle = HOX_INK;
            ctx.beginPath();
            ctx.arc(ant.tipX, ant.tipY, Math.max(1.4, 2 * s), 0, Math.PI * 2);
            ctx.fill();
        }

        // Head capsule.
        ctx.save();
        ctx.translate(h.hx, h.hy);
        ctx.rotate(h.dir);
        ctx.fillStyle = fill;
        ctx.strokeStyle = HOX_INK;
        ctx.lineWidth = Math.max(1.2, 2.2 * s);
        ctx.beginPath();
        ctx.ellipse(0, 0, h.hr * 0.85, h.hr, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Cartoon eyes (white with a black pupil), toward the anterior.
        const eyeR = h.hr * 0.3;
        for (const eye of h.eyes) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = HOX_INK;
            ctx.lineWidth = Math.max(1, 1.4 * s);
            ctx.beginPath();
            ctx.arc(eye.ex, eye.ey, eyeR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = HOX_INK;
            ctx.beginPath();
            ctx.arc(eye.ex + h.upX * eyeR * 0.35, eye.ey + h.upY * eyeR * 0.35, eyeR * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Cartoon presentation: white ground, black lines, palette only in fills.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const p = this.phenotype;
        const s = Math.min(width, height) / 128; // resolution-independent pixel-unit scale

        // Measure the creature at unit scale, then fit its bounding box into
        // the tile (with a margin for stroke widths) so nothing overflows.
        const probe = this._buildGeometry(p, 0, 0, 1);
        const pts = this._boundsPoints(probe);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }
        const bw = Math.max(maxX - minX, 1e-3);
        const bh = Math.max(maxY - minY, 1e-3);
        const margin = 0.88;
        const R = margin * Math.min(width / bw, height / bh);
        const cx = width / 2 - ((minX + maxX) / 2) * R;
        const cy = height / 2 - ((minY + maxY) / 2) * R;

        const geom = this._buildGeometry(p, cx, cy, R);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Appendages first, so the body plates overlap their roots.
        for (const seg of geom.segs) this._drawAppendage(ctx, seg, s);

        // 2. A connecting spine, so consecutive plates never float apart when
        //    they don't overlap (e.g. small circle plates at a tapered tail).
        //    Drawn under the plates, it only shows through the gaps as a joint.
        this._drawSpine(ctx, geom.segs, s);

        // 3. Body plates down the spine (tail → head, so anterior plates sit on top).
        for (let i = geom.segs.length - 1; i >= 0; i--) {
            this._drawPlate(ctx, geom.segs[i], p.segShape, s);
        }

        // 4. The custom head segment on top of the anterior end.
        this._drawHead(ctx, geom.head, geom.headColor, s);
    }
}

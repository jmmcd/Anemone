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
// Genome layers (all produced by explicit `for` loops, per the structural-
// naming rules in PTORepresentation.js — no closures, no `new`, no
// Array.from):
//   1. Toolkit (structural genes, built once): K segment archetypes
//      (leg / spike / wing / plain), each with a few continuous shape params.
//      Reused wherever a segment's Hox gene selects it.
//   2. Topology (regulatory, whole-body): 'linear' (a spine, head-to-tail,
//      arthropod/caterpillar-style) or 'radial' (a spiral of whorls around a
//      centre, echoing the ABC model of flower organ identity). The same
//      toolkit + Hox mechanism is redeployed under either topology — a nod to
//      how one gene toolkit can build different-looking body plans.
//   3. Axis genes (regulatory, whole-body): spine curvature / ring growth,
//      an anterior→posterior taper gradient, a base hue. Mutating these
//      reshapes the whole creature uniformly (regulatory-gene-level change,
//      as opposed to a toolkit/structural-gene mutation).
//   4. Hox array (regulatory, per-segment): for each segment, an identity
//      gene picks which archetype is expressed there, plus a graded
//      expression-strength gene (not just on/off).
//   5. Segment count itself is evolvable — a stand-in for a segmentation-
//      clock gene — giving variable-length body plans.
const hoxCreatureGenerator = (rnd) => {
    const K = 4; // toolkit size: 0=leg, 1=spike, 2=wing, 3=plain
    const toolkit = [];
    for (let k = 0; k < K; k++) {
        toolkit.push({
            length: rnd.uniform(0.5, 1.4),
            curve: rnd.uniform(-0.6, 0.6),
            spread: rnd.uniform(0.15, 0.9),
        });
    }

    const topology = rnd.choice(['linear', 'radial']);
    const numSegments = rnd.randint(4, 14);
    const spineCurvature = rnd.uniform(-1, 1);
    const taperStart = rnd.uniform(0.3, 1.0);
    const taperEnd = rnd.uniform(0.1, 1.0);
    const hueSeed = rnd.uniform(0, 1);

    const segments = [];
    for (let i = 0; i < numSegments; i++) {
        segments.push({
            archetype: rnd.choice([0, 1, 2, 3]),
            strength: rnd.uniform(0, 1),
        });
    }

    return { topology, numSegments, spineCurvature, taperStart, taperEnd, hueSeed, toolkit, segments };
};

// One shared, stateless representation for all individuals of this type.
const hoxCreatureRepresentation = new PTORepresentation(hoxCreatureGenerator);

// Human-readable names for the toolkit archetypes, index-matched to the generator.
const HOX_ARCHETYPE_NAMES = ['leg', 'spike', 'wing', 'plain'];

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
        let out = `\n<span class="genome-label">Body plan (${p.topology}, ${p.numSegments} segments):</span>\n`;
        for (let i = 0; i < p.segments.length; i++) {
            const seg = p.segments[i];
            out += `  segment ${i}: ${HOX_ARCHETYPE_NAMES[seg.archetype]} (expression ${seg.strength.toFixed(2)})\n`;
        }
        return out;
    }

    // Segment anchors along a curved spine (a quadratic bezier from left to
    // right edge, bowed by the spineCurvature axis gene), head-to-tail.
    // outAngle is perpendicular to the spine's tangent, so appendages point
    // away from the body on both sides (bilateral symmetry).
    _linearAnchors(p, cx, cy, R) {
        const p0 = { x: cx - R, y: cy };
        const p2 = { x: cx + R, y: cy };
        const p1 = { x: cx, y: cy + p.spineCurvature * R * 0.6 };
        const anchors = [];
        for (let i = 0; i < p.numSegments; i++) {
            const u = (i + 0.5) / p.numSegments;
            const mu = 1 - u;
            const x = mu * mu * p0.x + 2 * mu * u * p1.x + u * u * p2.x;
            const y = mu * mu * p0.y + 2 * mu * u * p1.y + u * u * p2.y;
            const dx = 2 * mu * (p1.x - p0.x) + 2 * u * (p2.x - p1.x);
            const dy = 2 * mu * (p1.y - p0.y) + 2 * u * (p2.y - p1.y);
            const tangent = Math.atan2(dy, dx);
            anchors.push({ x, y, outAngle: tangent + Math.PI / 2 });
        }
        return anchors;
    }

    // Segment anchors on an outward-growing spiral of whorls (radial
    // topology): the same spineCurvature axis gene, reused here as ring
    // growth rate, redeploys the identical toolkit/Hox mechanism under a
    // different body-plan layout. outAngle points radially outward.
    _radialAnchors(p, cx, cy, R) {
        const turns = 2.25;
        const ringGrowth = 0.25 + Math.abs(p.spineCurvature) * 0.5;
        const anchors = [];
        for (let i = 0; i < p.numSegments; i++) {
            const u = (i + 0.5) / p.numSegments;
            const angle = u * Math.PI * 2 * turns;
            const radius = R * (0.15 + ringGrowth * u);
            anchors.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, outAngle: angle });
        }
        return anchors;
    }

    _color(p, u) {
        const c = window.Palette.color((p.hueSeed + u * 0.6) % 1);
        return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }

    // Draw the archetype a segment's Hox gene selected, scaled by taper
    // (anterior→posterior gradient) and expression strength (graded, not
    // on/off). Legs/spikes/wings are drawn as a mirrored bilateral pair;
    // 'plain' segments carry no appendage, just a body plate.
    _drawArchetype(ctx, a, archIdx, arch, strength, taper, R, s, color) {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (archIdx === 3) { // plain: a body plate, no appendage
            ctx.beginPath();
            ctx.arc(a.x, a.y, Math.max(2 * s, R * 0.05 * taper), 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        const len = arch.length * taper * (0.25 + 0.75 * strength) * R * 0.4;
        const spread = 0.35 + arch.spread * 0.9;

        for (const side of [-1, 1]) {
            const dir = a.outAngle + side * spread;
            const midX = a.x + Math.cos(dir) * len * 0.55;
            const midY = a.y + Math.sin(dir) * len * 0.55;
            const bentDir = dir + side * arch.curve;
            const endX = midX + Math.cos(bentDir) * len * 0.55;
            const endY = midY + Math.sin(bentDir) * len * 0.55;

            if (archIdx === 0) { // leg: jointed two-segment line
                ctx.lineWidth = Math.max(1, 3 * taper * s);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(midX, midY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            } else if (archIdx === 1) { // spike: filled triangle
                const perpX = -Math.sin(dir), perpY = Math.cos(dir);
                const baseW = Math.max(1, 2.5 * s);
                ctx.beginPath();
                ctx.moveTo(a.x + perpX * baseW, a.y + perpY * baseW);
                ctx.lineTo(a.x - perpX * baseW, a.y - perpY * baseW);
                ctx.lineTo(endX, endY);
                ctx.closePath();
                ctx.fill();
            } else if (archIdx === 2) { // wing: filled curved fan
                const perpX = -Math.sin(dir), perpY = Math.cos(dir);
                const wingW = len * 0.5;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.quadraticCurveTo(
                    a.x + Math.cos(dir) * len * 0.6 + perpX * wingW,
                    a.y + Math.sin(dir) * len * 0.6 + perpY * wingW,
                    endX, endY
                );
                ctx.quadraticCurveTo(
                    a.x + Math.cos(dir) * len * 0.3, a.y + Math.sin(dir) * len * 0.3,
                    a.x, a.y
                );
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        const p = this.phenotype;
        const s = Math.min(width, height) / 128; // resolution-independent pixel-unit scale
        const R = Math.min(width, height) * 0.38;
        const cx = width / 2, cy = height / 2;

        const anchors = p.topology === 'radial'
            ? this._radialAnchors(p, cx, cy, R)
            : this._linearAnchors(p, cx, cy, R);

        // Shared body: connect consecutive anchors so the spine/whorl-spiral
        // itself is visible, tapered by the same anterior→posterior gradient.
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < anchors.length - 1; i++) {
            const u = (i + 0.5) / p.numSegments;
            const taper = hoxLerp(p.taperStart, p.taperEnd, u);
            ctx.strokeStyle = this._color(p, u);
            ctx.lineWidth = Math.max(1, 5 * taper * s);
            ctx.beginPath();
            ctx.moveTo(anchors[i].x, anchors[i].y);
            ctx.lineTo(anchors[i + 1].x, anchors[i + 1].y);
            ctx.stroke();
        }

        // Per-segment archetype expression (the Hox layer).
        for (let i = 0; i < anchors.length; i++) {
            const seg = p.segments[i];
            const arch = p.toolkit[seg.archetype];
            const u = (i + 0.5) / p.numSegments;
            const taper = hoxLerp(p.taperStart, p.taperEnd, u);
            const color = this._color(p, u);
            this._drawArchetype(ctx, anchors[i], seg.archetype, arch, seg.strength, taper, R, s, color);
        }
    }
}

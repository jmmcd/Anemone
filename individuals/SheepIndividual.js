// PTO generator: 6 floats in [0,1] (the neural-network inputs). The default
// 'fine' mutation gives Gaussian creep, matching the old FloatRepresentation feel.
// Explicit for-loop (not Array.from) so structural naming names each gene; see PTORepresentation.
const sheepGenerator = (rnd) => { const g = []; for (let i = 0; i < 6; i++) g.push(rnd.uniform(0, 1)); return g; };
const sheepRepresentation = new PTORepresentation(sheepGenerator);

// ---------------------------------------------------------------------------
// The point of this type is to illustrate GENE INTERACTIONS: the genome does
// not control appearance directly. Instead the 6 genes feed a small fixed
// neural network (6 inputs → 4 hidden → 10 outputs, tanh) whose outputs are
// the drawing traits. The weights are ad-hoc but FIXED — hand-written
// constants shared by every sheep — so the same genome always gives the same
// sheep, and evolution explores a stable genotype→phenotype map.
//
// The weights are deliberately SPARSE so the interactions are non-obvious but
// gradually comprehensible: each hidden unit acts as a nameable latent factor
// driven by 2-3 genes, and each trait reads 1-2 factors. E.g. nudging gene 3
// moves the "mood" factor, which shifts the smile, ear perk, eye size and
// blush together — while genes 0/1 trade body size against leg length.
//
//   h0 "bulk"   ← genes 0,1        → bigger body, shorter legs, bigger fluff
//   h1 "fleece" ← genes 1,2,(5)    → fluff, tail curl, leg length; droops ears
//   h2 "mood"   ← genes 3,4        → smile, perky ears, wide eyes, blush
//   h3 "tone"   ← genes 0,4,5      → wool brightness, face paleness, blush
//
// Inputs are centred to [-1,1] before the first layer so gene = 0.5 is neutral.
const SHEEP_W_HIDDEN = [
    // g0    g1    g2    g3    g4    g5
    [ 2.0,  1.2,  0.0,  0.0,  0.0,  0.0], // h0 bulk
    [ 0.0,  1.6, -1.9,  0.0,  0.0,  0.3], // h1 fleece
    [ 0.0,  0.0,  0.0,  2.2,  1.0,  0.0], // h2 mood
    [-1.4,  0.0,  0.0,  0.0,  1.3,  1.8], // h3 tone
];
const SHEEP_B_HIDDEN = [-0.2, 0.2, 0.0, 0.0];

// One row per trait: [w_h0, w_h1, w_h2, w_h3, bias], then tanh, then map
// [-1,1] onto the trait's range below.
const SHEEP_W_OUT = {
    bodySize:  [ 1.3,  0.0, -0.4,  0.0,  0.0],
    legLength: [-1.1,  0.9,  0.0,  0.0,  0.3],
    fluff:     [ 0.5,  1.5,  0.0,  0.0,  0.0],
    woolTone:  [ 0.0, -0.5,  0.0,  1.2,  0.0],
    faceTone:  [ 0.0,  0.0,  0.4,  1.6, -0.2],
    smile:     [ 0.0,  0.2,  1.6,  0.0,  0.0],
    earPerk:   [ 0.0, -1.1,  1.2,  0.0,  0.0],
    tailCurl:  [ 0.0,  1.1,  0.7,  0.0,  0.0],
    eyeSize:   [-0.6,  0.0,  0.8,  0.0,  0.2],
    blush:     [ 0.0,  0.0,  0.9,  0.7, -0.3],
};
const SHEEP_TRAIT_RANGES = {
    bodySize:  [0.78, 1.22],
    legLength: [0.70, 1.35],
    fluff:     [0, 1],
    woolTone:  [0, 1],
    faceTone:  [0, 1],
    smile:     [0, 1],
    earPerk:   [0, 1],   // 0 = droopy, 1 = perky
    tailCurl:  [0, 1],
    eyeSize:   [0.8, 1.3],
    blush:     [0, 1],
};

class SheepIndividual extends Individual {
    constructor(genome = null) {
        super();

        this.representation = sheepRepresentation;
        this.genome = genome || this.representation.generateRandom();

        // Expose the fixed network (tests check the shapes).
        this.hiddenSize = SHEEP_W_HIDDEN.length;
        this.weightsInputHidden = SHEEP_W_HIDDEN;
        this.hiddenBiases = SHEEP_B_HIDDEN;
    }

    // Forward pass through the fixed network: genes → hidden activations.
    hiddenActivations() {
        const genes = this.phenotype;
        const acts = [];
        for (let h = 0; h < SHEEP_W_HIDDEN.length; h++) {
            let sum = SHEEP_B_HIDDEN[h];
            for (let i = 0; i < genes.length; i++) {
                sum += (genes[i] * 2 - 1) * SHEEP_W_HIDDEN[h][i];
            }
            acts.push(Math.tanh(sum));
        }
        return acts;
    }

    // Hidden activations → named traits, each mapped into its range.
    getPhenotype() {
        const acts = this.hiddenActivations();
        const traits = {};
        for (const [name, w] of Object.entries(SHEEP_W_OUT)) {
            let sum = w[w.length - 1]; // bias
            for (let h = 0; h < acts.length; h++) sum += acts[h] * w[h];
            const t = (Math.tanh(sum) + 1) / 2; // → [0,1]
            const [lo, hi] = SHEEP_TRAIT_RANGES[name];
            traits[name] = lo + t * (hi - lo);
        }
        return traits;
    }

    // Genome panel: show the middle of the genes → factors → traits story, so
    // a user comparing two sheep can see how the interactions flow.
    describeExtra() {
        const acts = this.hiddenActivations();
        const names = ['bulk', 'fleece', 'mood', 'tone'];
        let out = '\n<span class="genome-label">Hidden factors (genes → traits):</span>\n';
        for (let h = 0; h < acts.length; h++) {
            out += `  ${names[h]}: ${acts[h].toFixed(2)}\n`;
        }
        return out;
    }

    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const t = this.getPhenotype();

        ctx.save();
        ctx.translate(width / 2, height / 2);
        const scale = Math.min(width, height) / 200;
        ctx.scale(scale, scale);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // --- Palette from the tone traits ---
        const lerp = (a, b, u) => Math.round(a + (b - a) * u);
        const wool = `rgb(${lerp(196, 252, t.woolTone)}, ${lerp(194, 250, t.woolTone)}, ${lerp(188, 242, t.woolTone)})`;
        const face = `rgb(${lerp(52, 232, t.faceTone)}, ${lerp(42, 220, t.faceTone)}, ${lerp(38, 205, t.faceTone)})`;
        // Face features must read on both dark and pale faces.
        const faceLine = t.faceTone > 0.45 ? '#2f2a28' : '#efe9e2';
        const outline = '#2f2a28';
        const legCol = '#3a3a40';
        const hoofCol = '#26262b';

        const bodyRX = 46 * t.bodySize;
        const bodyRY = 30 * t.bodySize;
        const bodyCX = -6;
        const bodyCY = 6;
        const legLen = 34 * t.legLength;
        const legTopY = bodyCY + bodyRY * 0.55;

        // --- Tail (behind body): three wool puffs off the rump; hangs down
        // when tailCurl is low, sweeps up over the back when high ---
        {
            let px = bodyCX - bodyRX * 0.92;
            let py = bodyCY - bodyRY * 0.15;
            let ang = 2.7 - t.tailCurl * 1.1; // down-left → up-left
            ctx.fillStyle = wool;
            ctx.strokeStyle = outline;
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const r = 7.5 - i * 1.5;
                px += Math.cos(ang) * (r + 2.5);
                py += Math.sin(ang) * (r + 2.5);
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ang -= t.tailCurl * 1.1;
            }
        }

        // --- Legs: rounded columns with hooves; hind pair behind the body ---
        const drawLeg = (x) => {
            const w = 8.5;
            ctx.fillStyle = legCol;
            ctx.strokeStyle = outline;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - w / 2, legTopY);
            ctx.lineTo(x - w / 2, legTopY + legLen - 6);
            ctx.quadraticCurveTo(x - w / 2, legTopY + legLen, x, legTopY + legLen);
            ctx.quadraticCurveTo(x + w / 2, legTopY + legLen, x + w / 2, legTopY + legLen - 6);
            ctx.lineTo(x + w / 2, legTopY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Hoof
            ctx.fillStyle = hoofCol;
            ctx.beginPath();
            ctx.moveTo(x - w / 2 - 1, legTopY + legLen - 7);
            ctx.lineTo(x + w / 2 + 1, legTopY + legLen - 7);
            ctx.lineTo(x + w / 2, legTopY + legLen);
            ctx.lineTo(x - w / 2, legTopY + legLen);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };
        drawLeg(bodyCX - bodyRX * 0.55);
        drawLeg(bodyCX + bodyRX * 0.45);

        // --- Wool body: scalloped cloud outline; fluff sets the bump depth ---
        {
            const nBumps = 12;
            const bumpR = (4.5 + t.fluff * 6) * t.bodySize;
            ctx.fillStyle = wool;
            ctx.strokeStyle = outline;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < nBumps; i++) {
                const a = (i / nBumps) * Math.PI * 2;
                const px = bodyCX + Math.cos(a) * bodyRX;
                const py = bodyCY + Math.sin(a) * bodyRY;
                // Each bump is an outward arc centred on the ellipse perimeter.
                // Span < half the bump spacing + π/2 keeps adjacent arcs from
                // looping inward into cusps at high fluff.
                ctx.arc(px, py, bumpR, a - 1.55, a + 1.55);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        // Front legs (over the body)
        drawLeg(bodyCX - bodyRX * 0.2);
        drawLeg(bodyCX + bodyRX * 0.8);

        // --- Head group (frontal cartoon face at the body's right shoulder) ---
        const headX = bodyCX + bodyRX * 0.95;
        const headY = bodyCY - bodyRY * 0.95;
        const headRX = 16.5, headRY = 19;

        // Ears behind the head: perky points up-and-out, droopy hangs down-and-out.
        // Angles are explicit canvas directions (y down): the right ear sweeps
        // from -45° (perky) to +40° (droopy); the left ear mirrors it.
        const drawEar = (side) => { // side: -1 left, +1 right
            const ax = headX + side * headRX * 0.85;
            const ay = headY - headRY * 0.3;
            const droop = 1 - t.earPerk;
            const ang = side === 1
                ? (-0.78 + droop * 1.48)          // up-right → down-right
                : (Math.PI + 0.78 - droop * 1.48); // up-left → down-left
            const len = 14, wid = 6;
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(ang);
            ctx.fillStyle = face;
            ctx.strokeStyle = outline;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(len / 2, 0, len / 2 + 2, wid, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        };
        drawEar(-1);
        drawEar(1);

        // Face
        ctx.fillStyle = face;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(headX, headY, headRX, headRY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Wool tuft on top of the head (three overlapping puffs)
        const tuftR = 6 + t.fluff * 3;
        const tuft = [
            [headX - 7, headY - headRY * 0.78, tuftR * 0.85],
            [headX + 8, headY - headRY * 0.72, tuftR * 0.8],
            [headX + 1, headY - headRY * 0.95, tuftR],
        ];
        ctx.fillStyle = wool;
        ctx.strokeStyle = outline;
        ctx.lineWidth = 2;
        for (const [tx, ty, tr] of tuft) {
            ctx.beginPath();
            ctx.arc(tx, ty, tr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // Eyes
        const eyeR = 4.6 * t.eyeSize;
        const eyeY = headY - 4;
        for (const side of [-1, 1]) {
            const ex = headX + side * 7;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = outline;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(ex, eyeY, eyeR, eyeR * 1.15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#1c1c1e';
            ctx.beginPath();
            ctx.arc(ex + 0.5, eyeY + (t.smile > 0.6 ? -1 : 0.5), eyeR * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(ex + 1.6, eyeY - eyeR * 0.35, eyeR * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }

        // Blush
        if (t.blush > 0.15) {
            ctx.fillStyle = `rgba(244, 138, 150, ${(t.blush * 0.55).toFixed(2)})`;
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(headX + side * 11, headY + 5, 3.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Muzzle: pink nose + mouth whose curve follows the smile trait
        ctx.fillStyle = '#f3a4ae';
        ctx.strokeStyle = faceLine;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(headX, headY + 7, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = faceLine;
        ctx.lineWidth = 1.8;
        const mouthY = headY + 12;
        const curve = 5 - t.smile * 11; // +5 frown → -6 big smile
        ctx.beginPath();
        ctx.moveTo(headX - 6, mouthY);
        ctx.quadraticCurveTo(headX, mouthY - curve, headX + 6, mouthY);
        ctx.stroke();
        if (t.smile > 0.75) {
            // Open-mouth grin with a little tongue
            ctx.fillStyle = '#e2798a';
            ctx.beginPath();
            ctx.ellipse(headX, mouthY + 1.5, 2.6, 1.8, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

/**
 * CatIndividual — evolvable *parametric sprite animation*.
 *
 * Every other 2D type here evolves a picture. This one evolves a **movement**:
 * the genome describes a small articulated creature *and* the way it walks, and
 * the tile is a live loop rather than a still. There is no sprite sheet and
 * there are no keyframes — the whole pose is a pure function of one clock,
 *
 *      pose(params, t) → joint positions → pixels
 *
 * which is exactly why it is evolvable. A sprite sheet is opaque to mutation; a
 * parameter vector is not. `examples/parametric-cat.html` is the same idea as a
 * standalone p5 sketch with no evolution around it, if you want to read the
 * technique without the framework.
 *
 * ---------------------------------------------------------------------------
 * The parametric techniques, all visible below and all under genetic control:
 *
 *  1. SHAPE GENES vs MOTION GENES. `catGenerator` writes two groups that never
 *     mix: who the cat is (bone lengths, head size, ear type) and how it moves
 *     (stride frequency, phase offsets, amplitudes, lags). Crossover can hand a
 *     cat's build to another cat's gait, which is the interesting recombination.
 *
 *  2. PHASE-OFFSET OSCILLATORS. One clock drives four legs through four offsets
 *     into the same cycle. The entire difference between a walk, a trot, a pace
 *     and a bound is those four numbers — see CAT_GAITS.
 *
 *  3. PROCEDURAL FOOT PATH + CLOSED-FORM IK. Oscillating the joint angles
 *     directly is the obvious approach and the wrong one: feet then skate along
 *     the ground and sink through it, and no amount of gene-tuning fixes it.
 *     Instead each foot is driven around a closed path in world space (stance:
 *     slide backwards at exactly the scroll speed; swing: arc forwards over a
 *     sine hump) and the two bones are solved backwards from it by the law of
 *     cosines (`solveIK`). Ground contact then holds *by construction* for every
 *     genome the EA can produce, rather than being a property the EA has to
 *     rediscover.
 *
 *  4. REACH BY CONSTRUCTION. Same idea one level up. Rather than evolving bone
 *     lengths independently and rejecting the cats whose legs cannot reach the
 *     ground (which would throw away most of the population), the generator
 *     evolves stance height, stride length and a `legSlack` ratio, and the
 *     decode layer *derives* the bone lengths from them so the leg always
 *     reaches with some bend left over. Constrain the map, not the search.
 *
 *  5. RECTIFIED AND HARMONIC SINES. `|sin(a)|` never goes negative, so the body
 *     dips and rebounds twice per stride — once per footfall pair — out of a
 *     single term. The second harmonic `sin(2a)` drives squash & stretch,
 *     applied as a non-uniform scale so the silhouette keeps roughly its area.
 *
 *  6. TIME-DELAY CHAINS. Each tail segment reads the same oscillator at
 *     `t - i·lag`, so a wave travels outward and the tail trails the body.
 *     Follow-through with no physics and no state — the cheapest big win here.
 *
 *  7. NOISE. A little Perlin-ish drift on the tail and ears so the loop is not
 *     visibly clockwork. Seeded from a `seed` gene through Individual.mulberry32
 *     (value noise, not p5's Perlin — see `catNoise`), so it is reproducible:
 *     a saved cat reloads to the same wobble.
 *
 *  8. EXPONENTIATED SINE AS AN IMPULSE. `max(0, sin(2πft))^n` for large n is a
 *     sine squeezed into a narrow spike — a blink or an ear twitch, periodic but
 *     not metronomic, from one expression and no state machine.
 *
 * ---------------------------------------------------------------------------
 * Pipeline and editable stages. `editableSections()` exposes all three stages of
 * `generator → pose → draw`, which is the point of the type: Pose is where every
 * technique above actually lives, so it is the interesting thing to rewrite in
 * the code editor. Pose and Draw are `rebuild: false` — edit them and the
 * evolved population is kept and simply re-animated.
 *
 * Everything is in NORMALISED units (fractions of min(width,height)) and scaled
 * at draw time, so the 128px tile and the 768px zoom are the same picture — see
 * CLAUDE.md > Resolution-independent 2D rendering. Line widths included.
 *
 * Playback rides the shared `Individual.AnimationClock`, so `.` pauses every
 * tile together and `[` / `]` change speed together, while each cat keeps its
 * own evolved stride frequency and its own genome-determined phase.
 */

// Four phase offsets into one gait cycle: [front-near, front-far, hind-near,
// hind-far], as fractions of a stride. This table is the whole difference
// between the gaits — nothing else in the code branches on `gait`.
const CAT_GAITS = {
    walk:  [0.00, 0.50, 0.25, 0.75],  // lateral-sequence walk: one foot lands at a time
    trot:  [0.00, 0.50, 0.50, 0.00],  // diagonal pairs move together
    pace:  [0.00, 0.50, 0.00, 0.50],  // lateral pairs together — a rolling amble
    bound: [0.00, 0.00, 0.50, 0.50],  // front pair, then hind pair — a rabbit/cheetah bound
};
const CAT_GAIT_NAMES = ['walk', 'trot', 'pace', 'bound'];

// PTO generator. Structural naming records each decision by its call-site path,
// so the conditional genes below (`arch` only for a bound, `stripeT` only for a
// striped cat) align correctly under crossover: parents exchange the genes they
// both actually have. The per-segment tail loop is an explicit `for`, not
// Array.from — with a *variable* segment count that distinction is not
// cosmetic; see CLAUDE.md > PTORepresentation.
const catGenerator = (rnd) => {
    const p = {};

    // ---------------- shape genes: who the cat is ----------------
    // Only ONE absolute length: everything else is a *fraction* of something
    // already chosen, so the figure holds together no matter how the genes
    // drift. Mutating bodyLen resizes the whole animal instead of leaving a
    // pea-sized head on a horse; a big stride can never outrun the hip
    // separation and scissor the legs, because the stride is measured in hip
    // separations. (RobotIndividual makes the same argument for a static
    // figure — here it also keeps the *motion* plausible.)
    p.bodyLen = rnd.uniform(0.34, 0.54);      // the one absolute: fraction of min(width, height)
    p.depthFrac = rnd.uniform(0.32, 0.48);    // barrel depth, of bodyLen
    p.chest = rnd.uniform(0.9, 1.35);         // shoulder mass, of barrel depth
    p.standFrac = rnd.uniform(0.30, 0.55);    // hip height above the ground, of bodyLen
    p.hipSpread = rnd.uniform(0.52, 0.74);    // hip separation, of bodyLen
    p.legRatio = rnd.uniform(0.42, 0.58);     // upper:lower split of the leg
    p.legSlack = rnd.uniform(1.05, 1.22);     // >1: bones longer than the reach, so knees keep a bend
    p.chunk = rnd.uniform(0.7, 1.6);          // limb thickness
    p.neckFrac = rnd.uniform(0.04, 0.17);     // neck length, of bodyLen
    p.headFrac = rnd.uniform(0.40, 0.55);     // head radius, of barrel depth
    p.snout = rnd.uniform(0.35, 1.1);
    p.earType = rnd.choice(['pointed', 'round', 'tufted', 'folded']);
    p.earSize = rnd.uniform(0.55, 1.5);
    // Segment *count* is smoothness, not length: the tail's total length is its
    // own gene and the segments divide it up. Evolve them independently and a
    // 13-segment tail is four times the length of a 4-segment one, which is not
    // a tail gene, it is an accident of the loop bound.
    p.tailSegs = rnd.randint(4, 13);
    p.tailLenFrac = rnd.uniform(0.35, 1.0);   // whole tail, of bodyLen

    // ---------------- motion genes: how it moves ----------------
    p.gait = rnd.choice(CAT_GAIT_NAMES);
    p.stride = rnd.uniform(0.35, 1.7);        // gait cycles per second
    p.stepFrac = rnd.uniform(0.25, 0.80);     // stride length, of the hip separation
    p.liftFrac = rnd.uniform(0.10, 0.40);     // swing height, of the stride length
    p.duty = rnd.uniform(0.5, 0.78);          // fraction of the cycle a foot is planted
    p.bobFrac = rnd.uniform(0.0, 0.22);       // body bounce, of barrel depth
    p.squash = rnd.uniform(0.0, 0.11);
    // Sway is a whole-tail quantity too, for the same reason as length: the
    // per-segment angle is this divided by the segment count, so segments buy
    // smoothness rather than an ever-tighter curl.
    p.tailSway = rnd.uniform(0.1, 1.3);       // total sway of the tail, radians
    p.tailFreq = rnd.uniform(0.15, 1.2);
    p.tailLag = rnd.uniform(0.01, 0.15);      // seconds of delay per segment — the whip
    p.tailCurl = rnd.uniform(-0.5, 1.2);      // base angle: down, straight out, or up over the back
    p.headBob = rnd.uniform(0.0, 0.16);
    p.headLag = rnd.uniform(0.0, 0.35);       // seconds the head trails the body
    p.breathe = rnd.uniform(0.15, 0.6);       // Hz, independent of the gait
    p.blinkHz = rnd.uniform(0.08, 0.5);
    p.twitchHz = rnd.uniform(0.08, 0.6);
    p.wobble = rnd.uniform(0.0, 0.4);         // how much noise rides on the tail and ears
    p.phase = rnd.uniform(0, 1);              // where in the cycle this cat starts — heritable,
                                              // so a saved genome reloads to the same pose
    p.seed = rnd.randint(1, 1e6);             // seeds the render-time noise (not the genome)

    // Conditional gene: only a bounding cat arches its spine, so only a bounding
    // cat carries the gene for how much. Structural naming keeps this aligned
    // under crossover — two bounding parents swap their arch, a bounding and a
    // trotting parent simply have nothing to swap there.
    if (p.gait === 'bound') p.archFrac = rnd.uniform(0.15, 0.6);   // of barrel depth

    // Per-segment tail stiffness: a variable-length run of genes, built with a
    // real loop so structural naming gives each element its own counter.
    p.tailStiff = [];
    for (let i = 0; i < p.tailSegs; i++) p.tailStiff.push(rnd.uniform(0.4, 1.5));

    // ---------------- look genes ----------------
    p.furT = rnd.uniform(0, 1);               // position in the current palette
    p.bellyT = rnd.uniform(0.3, 1.0);         // how far the underside is lightened
    p.bgT = rnd.uniform(0, 1);
    p.stripes = rnd.choice([0, 0, 0, 2, 3, 4, 5, 6]);
    if (p.stripes > 0) p.stripeT = rnd.uniform(0, 1);

    return p;
};

const catRepresentation = new PTORepresentation(catGenerator);

// Deterministic value noise: mulberry32 hashed per integer lattice point, then
// smoothstep-interpolated. Perlin would do as well; what matters is that it is
// seeded from the genome, so the drift is reproducible and a reloaded cat
// wobbles identically. (p5's noise() is not available here, and the app's own
// PRNG contract lives in Individual.mulberry32 — see CLAUDE.md.)
function catNoise(seed, x) {
    const i = Math.floor(x);
    const f = x - i;
    const at = (n) => Individual.mulberry32((seed + n * 374761393) >>> 0)();
    const u = f * f * (3 - 2 * f);            // smoothstep
    return at(i) * (1 - u) + at(i + 1) * u;   // → [0, 1)
}

// Closed-form two-bone IK (law of cosines). `bend` picks which side the joint
// buckles to: +1 for the forelimb (elbow back), -1 for the hind limb (stifle
// forward), which is most of what makes a cat's back legs read as back legs.
// The distance is clamped into the annulus the bones can actually span, so an
// out-of-reach target degrades to a straight leg pointing at it rather than
// producing NaN — the guarantee that keeps a mutated genome from drawing a hole.
function catIK(hx, hy, tx, ty, l1, l2, bend) {
    const dx = tx - hx, dy = ty - hy;
    const raw = Math.hypot(dx, dy);
    const d = Math.max(Math.abs(l1 - l2) + 1e-6, Math.min(l1 + l2 - 1e-6, raw));
    const base = Math.atan2(dy, dx);
    const cosA = (d * d + l1 * l1 - l2 * l2) / (2 * d * l1);
    const inner = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const a1 = base + bend * inner;
    return { kx: hx + l1 * Math.cos(a1), ky: hy + l1 * Math.sin(a1), reached: raw <= l1 + l2 };
}

/**
 * POSE — the parametric animation itself, and the stage worth editing.
 *
 * A pure function (params, t) → joint positions in normalised units. It touches
 * no canvas and holds no state: give it the same t twice and you get the same
 * pose, which is what makes the render cacheable-in-principle, testable, and
 * scrubable. Techniques 2, 3, 5, 6, 7 and 8 from the file header all live here.
 *
 * Coordinates: x right, y DOWN (canvas convention), origin at the cat's centre
 * of mass at rest, ground at y = CAT_GROUND_Y.
 */
const CAT_GROUND_Y = 0.30;

const catPose = new Editable(function (P, t) {
    const TAU = Math.PI * 2;
    const a = TAU * (P.stride * t + P.phase);   // the stride angle: one clock, everything hangs off it

    // --- 5. body bounce and squash & stretch ---
    // |sin| is a rectified sine: never negative, so the body dips and rebounds
    // twice per stride rather than swinging symmetrically about its rest height.
    const bob = -P.bob * Math.abs(Math.sin(a));
    const squash = 1 + P.squash * Math.sin(2 * a);        // 2nd harmonic
    const breath = 1 + 0.02 * Math.sin(TAU * P.breathe * t);
    // A bounding cat also flexes its spine, on the same clock.
    const arch = -(P.arch || 0) * Math.abs(Math.sin(a));

    const hipY = CAT_GROUND_Y - P.standH + bob;
    const half = P.bodyLen / 2;
    const hipX = half * P.hipSpread;
    const bodyY = hipY - P.bodyDepth * 0.30 + arch;

    // --- 2 + 3. four legs: same cycle, four phase offsets, feet on a path ---
    const phases = CAT_GAITS[P.gait] || CAT_GAITS.walk;
    const legs = [];
    for (let i = 0; i < 4; i++) {
        const front = i < 2;
        const hx = front ? hipX : -hipX;
        const foot = catFootTarget(P, t, phases[i]);
        const tx = hx + foot.x, ty = CAT_GROUND_Y + foot.y;
        const k = catIK(hx, hipY, tx, ty, P.upper, P.lower, front ? 1 : -1);
        legs.push({
            hip: [hx, hipY], knee: [k.kx, k.ky], foot: [tx, ty],
            near: (i % 2) === 0,      // near-side legs draw in front of the body
            planted: foot.planted, reached: k.reached,
        });
    }

    // --- 6 + 7. tail: a delay chain with noise ---
    // Segment i reads the same oscillator at t - i*lag, so the wave travels
    // outward instead of the whole tail swinging as a rigid rod.
    const tail = [];
    let tx0 = -half * 0.96, ty0 = bodyY - P.bodyDepth * 0.12;
    let ang = -Math.PI + P.tailCurl;                       // back, and up if tailCurl > 0
    tail.push([tx0, ty0]);
    for (let i = 0; i < P.tailSegs; i++) {
        const td = t - i * P.tailLag;
        const stiff = P.tailStiff[i] !== undefined ? P.tailStiff[i] : 1;
        ang += P.tailAmp * stiff * Math.sin(TAU * P.tailFreq * td)
             + (P.wobble / P.tailSegs) * (catNoise(P.seed, i * 1.7 + td * 0.8) - 0.5);
        tx0 += P.tailSeg * Math.cos(ang);
        ty0 += P.tailSeg * Math.sin(ang);
        tail.push([tx0, ty0]);
    }

    // --- 8. head: continuous nod, plus impulses for the blink and ear twitch ---
    const nod = P.headBob * Math.sin(2 * TAU * P.stride * (t - P.headLag));
    // The head hangs off the *shoulder*, up and forward along the neck, so it
    // stays attached whatever the body genes do. The neck's angle is fixed; its
    // length is the gene.
    const shoulderX = half * 0.82, shoulderY = bodyY - P.bodyDepth * 0.28;
    const headX = shoulderX + P.neck * 0.72 + P.headSize * 0.45;
    const headY = shoulderY - P.neck * 0.62 - P.headSize * 0.35;
    const spike = (hz, ph, sharp) => Math.pow(Math.max(0, Math.sin(TAU * hz * t + ph)), sharp);

    return {
        groundY: CAT_GROUND_Y,
        body: { x: 0, y: bodyY, len: P.bodyLen, depth: P.bodyDepth, squash, breath, bob },
        legs, tail,
        head: {
            x: headX, y: headY, r: P.headSize, tilt: nod,
            neck: [shoulderX, shoulderY],
            eyeOpen: 1 - 0.95 * spike(P.blinkHz, 1.2, 90),
            earTwitch: 0.5 * spike(P.twitchHz, 0, 60)
                     + P.wobble * 0.3 * (catNoise(P.seed + 7, t * 1.1) - 0.5),
        },
        // The ground scrolls at exactly stride x step, so planted feet do not
        // skate: the same number drives the feet and the world.
        scroll: (t * P.stride * P.step) % 0.12,
    };
});

// The foot's closed path through one cycle, in hip-relative coordinates. Stance
// slides straight back along the ground; swing arcs forward over a sine hump.
// `duty` splits the two, and is what separates a plodding walk (long stance)
// from a springy one.
function catFootTarget(P, t, phase) {
    const u = (P.stride * t + P.phase + phase) % 1;
    if (u < P.duty) {
        const k = u / P.duty;
        return { x: P.step * (0.5 - k), y: 0, planted: true };
    }
    const k = (u - P.duty) / (1 - P.duty);
    return { x: P.step * (k - 0.5), y: -P.lift * Math.sin(Math.PI * k), planted: false };
}

/**
 * DRAW — pose (normalised units) → pixels. Deliberately dumb: it makes no
 * animation decisions, it just renders the pose it is handed at whatever size
 * the canvas happens to be. Every length here is multiplied by `scale`,
 * including line widths, so the 128px tile and the 768px zoom are the same
 * picture rather than the zoom having hairline legs.
 */
const catDraw = new Editable(function (self, ctx, width, height, pose, P) {
    const scale = Math.min(width, height);
    const X = (u) => width / 2 + u * scale;
    const Y = (v) => height / 2 + v * scale;
    const L = (u) => u * scale;

    const rgb = (c) => `rgb(${c.r | 0}, ${c.g | 0}, ${c.b | 0})`;
    const mix = (c, d, f) => ({ r: c.r + (d.r - c.r) * f, g: c.g + (d.g - c.g) * f, b: c.b + (d.b - c.b) * f });
    const WHITE = { r: 255, g: 255, b: 255 }, BLACK = { r: 0, g: 0, b: 0 };

    // Palette colours, forced apart in lightness so the cat always reads against
    // its ground: the palette picks the hue, the type guarantees the contrast.
    const pal = window.Palette;
    const fur = mix(pal.color(P.furT), WHITE, 0.32);
    const belly = mix(fur, WHITE, 0.45 * P.bellyT);
    const far = mix(fur, BLACK, 0.34);                 // off-side limbs sit back in depth
    const bg = mix(pal.color(P.bgT), BLACK, 0.82);
    const stripe = P.stripes > 0 ? mix(pal.color(P.stripeT), BLACK, 0.45) : fur;

    ctx.fillStyle = rgb(bg);
    ctx.fillRect(0, 0, width, height);

    // Ground line + scrolling ticks: the world moves so the cat can walk in place.
    ctx.strokeStyle = rgb(mix(bg, WHITE, 0.16));
    ctx.lineWidth = Math.max(1, L(0.006));
    ctx.beginPath();
    ctx.moveTo(0, Y(pose.groundY));
    ctx.lineTo(width, Y(pose.groundY));
    ctx.stroke();
    ctx.strokeStyle = rgb(mix(bg, WHITE, 0.10));
    ctx.lineWidth = Math.max(1, L(0.005));
    for (let u = -0.72; u < 0.72; u += 0.12) {
        const x = X(u - pose.scroll);
        ctx.beginPath();
        ctx.moveTo(x, Y(pose.groundY + 0.012));
        ctx.lineTo(x, Y(pose.groundY + 0.035));
        ctx.stroke();
    }

    // Contact shadow, driven by the same bob term as the body: it spreads and
    // thins as the cat rises. One number, two consumers — that consistency is
    // most of why a cheap shadow reads as contact at all.
    const rise = -pose.body.bob;                        // 0 at the bottom of the bounce
    ctx.fillStyle = rgb(mix(bg, BLACK, 0.5));
    ctx.beginPath();
    ctx.ellipse(X(0), Y(pose.groundY), L(pose.body.len * (0.58 + rise * 1.2)),
                L(0.018 - rise * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();

    const drawLeg = (leg, colour) => {
        // The pose's foot point is the *contact* point — where the sole meets the
        // ground — so the paw is drawn sitting on top of it and the shin stops at
        // the paw's centre. Draw the shin all the way to the contact point instead
        // and its round cap, plus the paw, hang below the ground line.
        const pawR = 0.014 * P.chunk;
        const ankleY = leg.foot[1] - pawR;
        ctx.strokeStyle = rgb(colour);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, L(0.022 * P.chunk));
        ctx.beginPath();
        ctx.moveTo(X(leg.hip[0]), Y(leg.hip[1]));
        ctx.lineTo(X(leg.knee[0]), Y(leg.knee[1]));
        ctx.lineTo(X(leg.foot[0]), Y(ankleY));
        ctx.stroke();
        ctx.fillStyle = rgb(colour);
        ctx.beginPath();
        ctx.ellipse(X(leg.foot[0]), Y(ankleY), L(0.026 * P.chunk), L(pawR), 0, 0, Math.PI * 2);
        ctx.fill();
    };

    // Depth order: off-side legs, tail, body, head, near-side legs.
    for (const leg of pose.legs) if (!leg.near) drawLeg(leg, far);

    // Tail: a tapering polyline, thick at the base.
    ctx.strokeStyle = rgb(mix(fur, BLACK, 0.18));
    ctx.lineCap = 'round';
    for (let i = 1; i < pose.tail.length; i++) {
        const w = 1 - (i - 1) / Math.max(1, pose.tail.length - 1);
        ctx.lineWidth = Math.max(1, L((0.006 + 0.018 * w) * P.chunk));
        ctx.beginPath();
        ctx.moveTo(X(pose.tail[i - 1][0]), Y(pose.tail[i - 1][1]));
        ctx.lineTo(X(pose.tail[i][0]), Y(pose.tail[i][1]));
        ctx.stroke();
    }

    // Body: barrel + shoulder mass, scaled non-uniformly for squash & stretch.
    const B = pose.body;
    ctx.save();
    ctx.translate(X(B.x), Y(B.y));
    ctx.scale(1 / B.squash, B.squash * B.breath);
    ctx.fillStyle = rgb(fur);
    ctx.beginPath();
    ctx.ellipse(0, 0, L(B.len / 2), L(B.depth / 2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(L(B.len * 0.24), L(B.depth * 0.04), L(B.depth * 0.42 * P.chest), L(B.depth * 0.46), 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly, then stripes clipped to the barrel.
    ctx.fillStyle = rgb(belly);
    ctx.beginPath();
    ctx.ellipse(0, L(B.depth * 0.22), L(B.len * 0.40), L(B.depth * 0.22), 0, 0, Math.PI * 2);
    ctx.fill();
    if (P.stripes > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, L(B.len / 2), L(B.depth / 2), 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = rgb(stripe);
        ctx.lineWidth = Math.max(1, L(B.len * 0.035));
        for (let i = 0; i < P.stripes; i++) {
            const x = L(B.len * (-0.36 + 0.72 * (i + 0.5) / P.stripes));
            ctx.beginPath();
            ctx.moveTo(x, -L(B.depth));
            ctx.lineTo(x + L(B.depth * 0.18), L(B.depth));
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();

    // Neck: drawn before the head so the head caps it. Thick enough to read as
    // a body part rather than a stick, and it is what keeps the head visually
    // attached when the neck gene is long.
    const H = pose.head;
    ctx.strokeStyle = rgb(fur);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, L(H.r * 0.95));
    ctx.beginPath();
    ctx.moveTo(X(H.neck[0]), Y(H.neck[1]));
    ctx.lineTo(X(H.x), Y(H.y));
    ctx.stroke();

    // Head, with the ears, muzzle and eye hung off it.
    ctx.save();
    ctx.translate(X(H.x), Y(H.y));
    ctx.rotate(H.tilt);
    const R = L(H.r);
    const ear = (dir, twitch) => {
        ctx.save();
        ctx.rotate(twitch);
        ctx.fillStyle = rgb(dir > 0 ? fur : far);
        const e = R * P.earSize;
        ctx.beginPath();
        if (P.earType === 'round') {
            ctx.ellipse(dir * R * 0.55, -R * 0.7, e * 0.5, e * 0.5, 0, 0, Math.PI * 2);
        } else if (P.earType === 'folded') {
            ctx.moveTo(dir * R * 0.15, -R * 0.85);
            ctx.lineTo(dir * R * 0.95, -R * 0.62);
            ctx.lineTo(dir * R * 0.7, -R * 0.2);
        } else {                                        // pointed / tufted
            ctx.moveTo(dir * R * 0.1, -R * 0.75);
            ctx.lineTo(dir * R * 0.62, -R * 0.75 - e);
            ctx.lineTo(dir * R * 1.0, -R * 0.35);
        }
        ctx.closePath();
        ctx.fill();
        if (P.earType === 'tufted') {                   // a whisker of fur off the tip
            ctx.strokeStyle = rgb(fur);
            ctx.lineWidth = Math.max(1, L(0.006));
            ctx.beginPath();
            ctx.moveTo(dir * R * 0.62, -R * 0.75 - e);
            ctx.lineTo(dir * R * 0.75, -R * 0.75 - e * 1.5);
            ctx.stroke();
        }
        ctx.restore();
    };
    ear(-1, 0);
    ear(1, H.earTwitch);
    ctx.fillStyle = rgb(fur);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.05, R * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(belly);                          // muzzle
    ctx.beginPath();
    ctx.ellipse(R * 0.55 * P.snout, R * 0.35, R * 0.5 * P.snout, R * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(mix(fur, BLACK, 0.75));
    ctx.beginPath();                                     // nose
    ctx.ellipse(R * (0.35 + 0.6 * P.snout), R * 0.28, R * 0.11, R * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();                                     // eye — height is the blink
    ctx.ellipse(R * 0.42, -R * 0.15, R * 0.16, R * 0.2 * Math.max(0.04, H.eyeOpen), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (const leg of pose.legs) if (leg.near) drawLeg(leg, fur);
});

class CatIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = catRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }

    // Redraws every frame off the shared clock, so `[` / `]` are animation speed
    // and `.` is play/pause for this type (see framework/Hotkeys.js).
    animatesContinuously() { return true; }

    // All three stages of generator → pose → draw. Pose is the interesting one:
    // it is where the parametric animation lives, and editing it keeps the
    // evolved population (rebuild: false) so you can watch the same cats move
    // differently.
    editableSections() {
        return [
            Individual.functionSection('Pose', catPose),
            Individual.functionSection('Draw', catDraw),
            Individual.generatorSection(this.representation),
        ];
    }

    /**
     * Decode layer: genome ratios → the absolute lengths the pose works in.
     *
     * Two things happen here, and both are the point of the type.
     *
     * First, the *relative* geometry is resolved: the genome carries one
     * absolute length (bodyLen) and a set of fractions, so every cat is in
     * proportion by construction and a mutated gene rescales rather than
     * dislocates. A stride measured in hip separations can never be so long
     * that the fore and hind legs scissor through each other.
     *
     * Second — technique 4 from the header — the bone lengths are *derived* to
     * reach. The distance a leg must span is fixed by the stance height, the
     * body bob and how far the foot travels; rather than evolving bone lengths
     * and rejecting the cats whose legs fall short, we evolve the ratio between
     * the two bones and a slack factor, then size them to that reach. Every
     * genome the EA can produce therefore has legs that touch the ground with a
     * bend left in the knee. The constraint lives in the map, so the search
     * never spends a generation rediscovering it.
     */
    getParameters() {
        const p = this.phenotype;
        const bodyDepth = p.bodyLen * p.depthFrac;
        const standH = p.bodyLen * p.standFrac;
        const step = p.bodyLen * p.hipSpread * p.stepFrac;
        const bob = bodyDepth * p.bobFrac;
        // The worst case the leg has to span: half a stride away horizontally,
        // and the stance height *plus* the full body bob vertically — the bob
        // lifts the hip, so it lengthens the leg rather than shortening it. Miss
        // that term and a bouncy cat's feet tear away from the ground at the top
        // of every bounce.
        const reach = Math.hypot(standH + bob, step / 2) * p.legSlack;
        return Object.assign({}, p, {
            bodyDepth, standH, step, bob,
            lift: step * p.liftFrac,
            neck: p.bodyLen * p.neckFrac,
            headSize: bodyDepth * p.headFrac,
            tailSeg: p.bodyLen * p.tailLenFrac / Math.max(1, p.tailSegs),
            tailAmp: p.tailSway / Math.max(1, p.tailSegs),
            arch: p.archFrac ? bodyDepth * p.archFrac : 0,
            upper: reach * p.legRatio,
            lower: reach * (1 - p.legRatio),
            phases: CAT_GAITS[p.gait] || CAT_GAITS.walk,
        });
    }

    /** The pose at a given time, in normalised units. Pure — same t, same pose. */
    poseAt(t) {
        return catPose.value(this.getParameters(), t);
    }

    /** Render one frame. Split out so tests and the RAF loop share a path. */
    renderFrame(canvas, t) {
        catDraw.value(this, canvas.getContext('2d'), canvas.width, canvas.height,
                      this.poseAt(t), this.getParameters());
    }

    visualize(canvas) {
        // No RAF (Node tests, or a headless render): draw a single frame. t is
        // offset so the still is mid-stride rather than at the cycle origin,
        // where several gaits have both feet of a pair in the same place.
        if (typeof requestAnimationFrame !== 'function') {
            this.renderFrame(canvas, 0.37);
            return;
        }

        const clock = Individual.AnimationClock;
        const myId = this.id;
        const self = this;
        canvas._animOwner = myId;

        // 20 fps: smooth enough for a walk cycle at a third of the cost of 60,
        // and this runs on every tile in the grid at once.
        const FRAME_MS = 1000 / 20;
        let last = 0;

        const step = () => {
            // Bail when the canvas has been taken over — by another cat
            // (different id) or by a static type (Canvas2DModality.renderCached
            // sets _animOwner to null).
            if (canvas._animOwner !== myId) return;
            const now = performance.now();
            if (now - last >= FRAME_MS) {
                last = now;
                // The clock owns pause and speed; the cat owns its own stride
                // rate and phase, both of which are genes.
                self.renderFrame(canvas, clock.seconds());
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /**
     * Reject cats that cannot walk. Bone lengths are derived to reach the
     * ground, so this normally passes — it is a guard for *edited* generators
     * and pose functions (the code editor can produce anything), and it states
     * the contract that makes the type work: feet must be able to reach their
     * targets, and the animation must actually move.
     */
    validate() {
        const P = this.getParameters();
        if (!(P.upper > 0) || !(P.lower > 0)) return false;
        if (!(P.stride > 0.05) || !(P.step > 0.02)) return false;   // must read as walking
        for (const t of [0, 0.13, 0.29, 0.53, 0.71, 0.97]) {
            const pose = this.poseAt(t / Math.max(0.05, P.stride));
            for (const leg of pose.legs) {
                if (!leg.reached) return false;                     // IK had to clamp: the leg is short
                if (!isFinite(leg.knee[0]) || !isFinite(leg.knee[1])) return false;
            }
        }
        return true;
    }

    getPhenotype() {
        const p = this.phenotype;
        return `Cat: ${p.gait} at ${p.stride.toFixed(2)} Hz, ${p.earType} ears, ` +
               `${p.tailSegs}-segment tail` + (p.stripes ? `, ${p.stripes} stripes` : ', plain');
    }

    describeExtra() {
        const P = this.getParameters();
        const clock = Individual.AnimationClock;
        const row = (label, value) => `<div><b>${label}:</b> ${value}</div>`;
        const f = (n, d = 2) => n.toFixed(d);
        const speedNote = clock.scale !== 1
            ? ` (transport × ${f(1 / clock.scale)}${clock.paused ? ', paused' : ''})`
            : (clock.paused ? ' (paused)' : '');
        return row('Gait', `${P.gait} — phases [${P.phases.join(', ')}]`) +
               row('Stride', `${f(P.stride)} cycles/s, step ${f(P.step)}, duty ${f(P.duty)}${speedNote}`) +
               row('Bones', `upper ${f(P.upper, 3)} + lower ${f(P.lower, 3)} for a reach of ` +
                            `${f(Math.hypot(P.standH, P.step / 2), 3)} (slack ×${f(P.legSlack)})`) +
               row('Tail', `${P.tailSegs} segments, ${f(P.tailLag, 3)} s lag each — ` +
                           `${f(P.tailSegs * P.tailLag, 2)} s from base to tip`) +
               row('Body', `bob ${f(P.bob, 3)}, squash ${f(P.squash, 3)}, breathing ${f(P.breathe)} Hz`);
    }
}

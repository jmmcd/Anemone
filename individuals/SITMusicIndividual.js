// SITMusicIndividual
//
// "Leeuwenberg Code Music" in the UI — the AUDITORY half of Leeuwenberg's 1971
// coding language, whose title is "A Perceptual Coding Language for Visual *and
// Auditory* Patterns". It is a `SITCodeIndividual` subclass and shares the whole
// engine (`SITLanguage.js`): the same 4 information units, 5 operations, ~10
// indicators and combinatory rules, evaluated by the same `evaluate()` to the
// same item stream. Only the *interpretation* differs — `interpretMusic` reads
// the stream as a piece of music instead of a figure, and this file supplies a
// generator that writes musical codes plus the note rendering.
//
// That is the paper's own claim, and it is worth stating plainly: nothing in the
// algebra was changed to make music out of it. The full mapping is in
// `SITLanguage.interpretMusic`'s header; the three moves that make it work are
//
//   * a value is a PITCH INTERVAL, one per elementary grain of TIME, exactly as
//     the visual half reads it as an angle, one per elementary grain of contour;
//   * a full turn is an OCTAVE, so the rotational family N is the scale (N notes
//     to the octave, one unit = one scale degree) and the engine's existing
//     360°-based closure arithmetic becomes pitch-class arithmetic untouched;
//   * length is never a primitive, in either reading: a straight edge of n
//     grains is `n·(0)`, and so is a note held for n grains.
//
// What falls out is a surprising amount of music theory. `±` is inversion, `R`
// is the arch — a phrase followed by its mirror, which in pitch terms is its
// retrograde inversion (R reverses INTERVALS; a true retrograde reverses and
// negates them). `+` is transposition, and `2·{X} + (0,c)`, by the paper's own
// rule that a constant lands on a chunk's head, is the classical SEQUENCE; a
// parallel continuation is a chord built by stacking one interval, a parallel
// structure is counterpoint, `‖` is a tonal rather than real answer, and `⦃ ⦄`
// — "repeat until it meets something" — is a phrase repeated until it returns to
// its starting pitch class. None of that was designed in; it is what the
// operators already meant.
//
// THE SCALE IS THE FAMILY GENE. `SITCodeIndividual` unified discrete and
// continuous figures in one gene: a rotational family N, with every angle
// literal an integer multiple of 360/N. Read musically that gene is the scale —
// N notes to the octave — so it selects a tuning *and* a harmonic idiom in one:
// 3 = augmented, 4 = diminished seventh, 5 = pentatonic, 6 = whole-tone,
// 7 = diatonic, 8 = octatonic, 12 = chromatic. Capping the *multiple* (as the
// 2D type does, for gentler curves) caps the LEAP, so a diatonic code steps by
// at most a fourth while a chromatic one may leap a tritone.
//
// The one liberty: `⟨ ⟩`, the outerproduct, which is the whole of the paper's
// 3D machinery, is read here as the TIME dimension (augmentation/diminution of
// the grain) rather than a spatial one. The move borrowed is the paper's — "a
// dimension orthogonal to the plane the code has been working in" — since for a
// stream of pitches the orthogonal dimension is duration.
//
// Playback rides the shared step-sequencer path (`Individual.playSequenced`):
// live MIDI when an output is available, else a synthesised loop through the
// shared AudioModality. So this drives Logic/GarageBand over IAC like the drum
// machine and the melody grid do, and exports to .mid for free.

// Scale tables: one per rotational family, mapping a scale degree to semitones.
// The family gene picks the row; degree d becomes tonic + 12·⌊d/N⌋ + row[d mod N],
// so a degree is a genuine scale step and an octave is exactly N of them.
const LEE_SCALES = {
    3: [0, 4, 8],                        // augmented
    4: [0, 3, 6, 9],                     // diminished seventh
    5: [0, 2, 4, 7, 9],                  // major pentatonic
    6: [0, 2, 4, 6, 8, 10],              // whole tone
    7: [0, 2, 4, 5, 7, 9, 11],           // diatonic (major)
    8: [0, 1, 3, 4, 6, 7, 9, 10],        // octatonic
    12: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],   // chromatic
};
// The families a musical code may take, weighted by repetition: the scales that
// carry a tonal centre come up more often than the symmetrical ones.
const LEE_MUSIC_FAMILIES = [3, 4, 5, 5, 6, 7, 7, 7, 8, 12, 12];
const LEE_MUSIC_PITCH_LO = 36;   // fold pitches into a playable range (C2…C7)
const LEE_MUSIC_PITCH_HI = 96;
const LEE_MUSIC_PPQ = 96;        // divisible by 12, so the ⟨ ⟩ triplet grains stay integral
const LEE_MUSIC_LEAF_P = 0.34;   // chance of stopping at a leaf below the root
/**
 * How many phrases one ( ) border may hold — a weighted pool, for the same
 * reason the depth budget is one. A random code wants a narrow border (2-4
 * phrases, like the figure types); an ANALYSED melody wants a wide one, because
 * a long tune has to fan out somewhere and fanning out costs code length
 * linearly where nesting deeper costs it exponentially. Drawing from a pool
 * skewed to the low end gives random codes the narrow border and still leaves
 * the wide one reachable — by mutation, and by the encoder. Mirrored by
 * SITAnalysis's regrouping, which must not exceed what the generator can draw.
 */
const LEE_MUSIC_SEQ_POOL = [2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10];
const LEE_MUSIC_SEQ_MAX = 10;
/**
 * How deep a code may nest — a GENE, not a constant, which the visual types do
 * not need.
 *
 * A random motif is shallow: the pool is weighted to 5-7, which is where the
 * figure types sit, and going deeper mostly buys longer codes that the caps
 * truncate anyway. But an ANALYSED melody (SITAnalysis) nests as deep as its
 * real structure demands — Frère Jacques needs 10 — and a code that cannot be
 * *generated* cannot become a genome (see fromCode). Making the budget a gene
 * lets imported music reach the depth it needs without every random code paying
 * for it in size and generation time.
 */
const LEE_MUSIC_DEPTHS = [5, 5, 5, 6, 6, 6, 7, 7, 8, 9, 10, 11, 12];

/**
 * The generator's node-kind table: cumulative thresholds on one `rnd.random()`.
 *
 * It is a top-level const because TWO pieces of code walk it — the generator
 * below, and `leeEncodeMusic`, which runs the generator BACKWARDS to turn an
 * analysed melody into a genome (see fromCode). Keeping the thresholds in one
 * table is what stops those two drifting apart; the encoder picks the midpoint
 * of a kind's interval, so a mutation nudges the gene into a neighbouring kind
 * exactly as it would for an evolved code.
 */
const LEE_MUSIC_KINDS = [
    ['out', 0.10],    // ⟨ ⟩ the time dimension: augmentation / diminution
    ['seq', 0.20],    // ( ) one phrase after another
    ['cont', 0.29],   // ⦃ ⦄ repeat until the melody closes on its starting pitch class
    ['iter', 0.41],   // · repetition (a repeated note, or an ostinato)
    ['rev', 0.51],    // R retrograde
    ['pm', 0.59],     // ± inversion
    ['int', 0.63],    // ∫ intervals → absolute pitches
    ['op', 0.72],     // + × * ⊛ transposition, expansion, cantus firmus
    ['comb', 0.77],   // (a,b)(c,d) two phrases interleaved note by note
    ['osi', 0.81],    // n notes of one phrase per 1 of the other
    ['chunk', 0.85],  // { } an unbroken phrase (iteration repeats it whole)
    ['brk', 0.88],    // [ ] ⟦ ⟧ breakdown
    ['abs', 0.91],    // | | pitches from the tonic, not from the previous note
    ['hide', 0.94],   // ‾ rests
    ['val', 0.96],    // a bare interval, with no run after it
    ['par', 1.00],    // parallel structure: a simultaneous voice at each node
];
// Pools the generator draws from (top-level so the encoder can invert them).
const LEE_MUSIC_DURS = [-2, -1, 1, 2];              // ⟨v⟩ augmentation/diminution steps
const LEE_MUSIC_OPS = ['+', '+', 'x', '*', '@'];    // + weighted: transposition is the common one

/**
 * The intervals a code may write, in scale degrees, as a weighted pool: steps
 * are common, leaps rare, and the octave stays reachable.
 *
 * This is where the musical reading parts company with the visual one. The
 * figure types cap an angle literal at half the circle, because a turn beyond
 * 180° IS a turn the other way — angles are circular. Pitch is not: +5 degrees
 * and -2 degrees are different notes, not the same one written twice. Capping a
 * melody at half the octave would forbid it a fifth, let alone an octave leap,
 * so the span here is the octave itself (with a floor, so the small symmetrical
 * families are not confined to a couple of notes).
 *
 * A weighted pool rather than a uniform range because the weighting is what
 * makes a random code sing rather than jump: conjunct motion with the odd leap
 * is the shape of nearly every melody. It is a `choice`, so PTO's fine mutation
 * resamples it like-for-like, and the ENCODER inverts it by index — which is why
 * generator and encoder must build the pool from this one function.
 */
const leeIntervalPool = (family) => {
    const span = Math.min(12, Math.max(5, family));
    const pool = [];
    for (let v = -span; v <= span; v++) {
        const d = Math.abs(v);
        const w = d === 0 ? 2 : d === 1 ? 4 : d === 2 ? 3 : d <= 4 ? 2 : 1;
        for (let i = 0; i < w; i++) pool.push(v);
    }
    return pool;
};

// Self-contained PTO generator (no closure variables, no `new`, explicit for
// loops — see PTORepresentation). Same shape as leeGenerator2D, retuned for the
// ear: rests get their own share of the mass, `⟨ ⟩` writes the rhythm dimension,
// and the top-level "finish" can impose the classical sequence idiom.
const leeGeneratorMusic = (rnd) => {
    const build = (depth, family, budget) => {
        // Leaf: the paper's basic element — one interval, then a run of grains
        // at that pitch, i.e. ONE NOTE held that long, written the paper's way
        // as n repetitions of the interval 0. A vanished run is a rest, so the
        // leaf covers "a note", "a short note then silence" and "a rest".
        if (depth <= 1 || (depth < budget && rnd.random() < LEE_MUSIC_LEAF_P)) {
            const run = { k: 'iter', ns: [rnd.randint(1, LEE_RUN_MAX)], child: { k: 'num', a: 0 } };
            return {
                k: 'seq', items: [
                    { k: 'num', a: rnd.choice(leeIntervalPool(family)) },
                    rnd.random() < 0.22 ? { k: 'hide', child: run } : run,
                ]
            };
        }
        // Which construct of the language this node is (see LEE_MUSIC_KINDS).
        const r = rnd.random();
        let kind = LEE_MUSIC_KINDS[LEE_MUSIC_KINDS.length - 1][0];
        for (let i = 0; i < LEE_MUSIC_KINDS.length; i++) {
            if (r < LEE_MUSIC_KINDS[i][1]) { kind = LEE_MUSIC_KINDS[i][0]; break; }
        }
        // ⟨ ⟩ outerproduct — out of the pitch plane into the time dimension:
        // the grain is augmented or diminished for what follows. Idiomatically
        // it wraps ONE value ("⟨-1⟩ then carry on", i.e. double time from here),
        // which is how the paper writes its out-of-plane tips; wrapping a whole
        // sub-code instead augments every one of its values in turn.
        if (kind === 'out') {
            if (rnd.random() < 0.75) {
                return {
                    k: 'seq', items: [
                        { k: 'out', child: { k: 'num', a: rnd.choice(LEE_MUSIC_DURS) } },
                        build(depth - 1, family, budget),
                    ]
                };
            }
            return { k: 'out', child: build(depth - 1, family, budget) };
        }
        // ( ) border / serial structure — one phrase after another
        if (kind === 'seq') {
            const n = rnd.choice(LEE_MUSIC_SEQ_POOL);
            const items = [];
            for (let i = 0; i < n; i++) items.push(build(depth - 1, family, budget));
            return { k: 'seq', items };
        }
        // ⦃ ⦄ continuation — repeat until the melody returns to its starting
        // pitch class, so a rising motif becomes a cycle that closes
        if (kind === 'cont') return { k: 'cont', child: build(depth - 1, family, budget) };
        // · iteration — a repeated note or a repeated phrase (ostinato)
        if (kind === 'iter') {
            const ns = [rnd.randint(2, 8)];
            const pair = rnd.random() < 0.3;
            const n2 = rnd.randint(2, 5);
            if (pair) ns.push(n2);
            return { k: 'iter', ns, cross: rnd.random() < 0.25, child: build(depth - 1, family, budget) };
        }
        // R reversal — RETROGRADE (and R over a ± is the retrograde inversion)
        if (kind === 'rev') return { k: 'rev', child: build(depth - 1, family, budget) };
        // ± left-right variation — INVERSION
        if (kind === 'pm') return { k: 'pm', child: build(depth - 1, family, budget) };
        // ∫ integration — reads the values as differences, so what follows is a
        // series of absolute pitches against the tonic rather than intervals
        if (kind === 'int') return { k: 'int', child: build(depth - 1, family, budget) };
        // + × * ⊛ — transposition, interval expansion, and the cantus firmus
        if (kind === 'op') {
            return {
                k: 'op',
                op: rnd.choice(LEE_MUSIC_OPS),
                cross: rnd.random() < 0.2,
                a: build(depth - 1, family, budget),
                b: build(depth - 1, family, budget),
            };
        }
        // combination: (a,b)(c,d) = a,c,b,d — two phrases interleaved note by note
        if (kind === 'comb') return { k: 'comb', a: build(depth - 1, family, budget), b: build(depth - 1, family, budget) };
        // one-sided iteration: n notes of one phrase per 1 of the other
        if (kind === 'osi') {
            const ns = [rnd.randint(2, 4)];
            const pair = rnd.random() < 0.3;
            const n2 = rnd.randint(1, 3);
            if (pair) ns.push(n2);
            return {
                k: 'osi', ns, side: rnd.choice(['l', 'r']),
                a: build(depth - 1, family, budget), b: build(depth - 1, family, budget),
            };
        }
        // { } chunking — an unbroken phrase, so iteration repeats it whole
        // rather than repeating each note (2·{a,b} = a,b,a,b, not a,a,b,b)
        if (kind === 'chunk') return { k: 'chunk', child: build(depth - 1, family, budget) };
        // [ ] / ⟦ ⟧ breakdown
        if (kind === 'brk') {
            const all = rnd.random() < 0.5;
            return { k: all ? 'brkall' : 'brk', child: build(depth - 1, family, budget) };
        }
        // | | absolute pitches — measured from the tonic, not from the previous
        // note, so the phrase keeps its pitch instead of drifting
        if (kind === 'abs') return { k: 'abs', child: build(depth - 1, family, budget) };
        // ‾ vanishing sign — the values still function, but sound nothing: RESTS
        if (kind === 'hide') return { k: 'hide', child: build(depth - 1, family, budget) };
        // A bare interval — one note, with no run held after it. (The leaf above
        // always carries a run; this is what lets a code write a plain value,
        // which the operations need as an operand: `2·{X} + (0,c)`.)
        if (kind === 'val') return { k: 'num', a: rnd.choice(leeIntervalPool(family)) };
        // Parallel structure: a branch at each node of the row above = a
        // simultaneous voice. ‖ makes it answer from the tonic (a tonal answer)
        // instead of transposed to the note it hangs off (a real one).
        const nRows = rnd.randint(2, 3);
        const rows = [], indep = [], every = [];
        for (let i = 0; i < nRows; i++) {
            rows.push(build(depth - 1, family, budget));
            indep.push(rnd.random() < 0.35);
            every.push(rnd.random() < 0.3);
        }
        return { k: 'par', rows, indep, every };
    };

    const family = rnd.choice(LEE_MUSIC_FAMILIES);
    const half = Math.min(Math.floor(family / 2), LEE_MAX_MULT);
    const budget = rnd.choice(LEE_MUSIC_DEPTHS);
    const parts = rnd.randint(1, 2);
    const items = [];
    for (let i = 0; i < parts; i++) items.push(build(budget, family, budget));
    const body = { k: 'seq', items };

    // Impose a regularity at top level, as almost every figure in the paper
    // carries one. Musically this is what makes a random code a *piece* rather
    // than a wander: the minimum principle acting as a prior.
    const finish = rnd.choice(['cont', 'iter', 'rev', 'sequence', 'sequence', 'par', 'plain']);
    let root = body;
    if (finish === 'cont') root = { k: 'cont', child: body };
    else if (finish === 'iter') root = { k: 'iter', ns: [rnd.randint(2, 4)], child: { k: 'chunk', child: body } };
    else if (finish === 'rev') root = { k: 'rev', child: body };
    else if (finish === 'sequence') {
        // The classical SEQUENCE, in the paper's own algebra: k copies of the
        // phrase, the i-th transposed by i·step. `+` lands a constant on a
        // chunk's HEAD only (p. 316, a + {b,c} = {a+b,c}), and pitch accumulates
        // from note to note, so bumping a copy's leading interval shifts that
        // whole copy — transposition, written with no operator for it.
        const k = rnd.randint(2, 4);
        const step = rnd.randint(1, Math.max(1, Math.min(4, half)));
        const offs = [];
        for (let i = 0; i < k; i++) offs.push({ k: 'num', a: i * step });
        root = {
            k: 'op', op: '+',
            a: { k: 'iter', ns: [k], child: { k: 'chunk', child: body } },
            b: { k: 'seq', items: offs },
        };
    } else if (finish === 'par') {
        root = {
            k: 'par', rows: [body, build(3, family, budget)],
            indep: [false, rnd.random() < 0.4], every: [false, rnd.random() < 0.4],
        };
    }

    return {
        family,
        tonic: 60 + rnd.randint(-5, 4),          // the key: a transposition of the whole piece
        bpm: 70 + rnd.randint(0, 60),
        swing: rnd.uniform(0, 0.25),
        root,
    };
};

// One shared, stateless representation per type (swappable live via the editor).
const leeRepresentationMusic = new PTORepresentation(leeGeneratorMusic);

/**
 * Run the generator BACKWARDS: the decisions it would have had to make to
 * produce `code`. This is what turns an ANALYSED melody (SITAnalysis) into a
 * real, heritable genome instead of a read-only curiosity — see fromCode.
 *
 * WHY THIS SHAPE. A PTO genome is a trace of `rnd` decisions, so an imported
 * code can only become a genome by being *generated*. Every one of PTO's
 * distributions samples with exactly one `Math.random()` call and inverts
 * exactly (uniform → linear, randint/choice → the bucket's midpoint), so a
 * queue of u-values in call order drives the generator down any path we like,
 * and PTO's tracer then names and records the entries itself — no name
 * prediction, no reaching inside the tracer. The midpoint is deliberate: it
 * leaves each gene in the middle of its bucket, so mutation creeps it to a
 * neighbouring value exactly as for an evolved genome.
 *
 * It is, unavoidably, a MIRROR of `leeGeneratorMusic`: same order, same
 * thresholds (shared via LEE_MUSIC_KINDS), same pools. That coupling is real,
 * which is why `fromCode` verifies the result by replaying it and comparing the
 * evaluated item streams, and gives up cleanly rather than seeding something
 * that only nearly matches. A user-edited generator will simply fail that check.
 *
 * Throws when the code is outside what the generator can express (too deep, an
 * interval beyond the family's cap, an unsupported node). Callers catch it.
 *
 * @param {object} pheno  { family, tonic, bpm, swing, root }
 * @returns {number[]}    u-values, in the order the generator consumes them
 */
const leeCodeDepth = (node) => {
    if (!node || typeof node !== 'object') return 0;
    let d = 0;
    for (const key of ['child', 'a', 'b']) if (node[key]) d = Math.max(d, leeCodeDepth(node[key]));
    for (const it of (node.items || [])) d = Math.max(d, leeCodeDepth(it));
    for (const r of (node.rows || [])) d = Math.max(d, leeCodeDepth(r));
    return d + 1;
};

const leeEncodeMusic = (pheno) => {
    const us = [];
    const uRandom = (v) => us.push(Math.max(0, Math.min(1 - 1e-9, v)));
    const uUniform = (v, a, b) => uRandom((v - a) / (b - a));
    const uRandint = (v, a, b) => {
        if (!Number.isInteger(v) || v < a || v > b) throw new Error(`randint ${v} outside [${a},${b}]`);
        uRandom((v - a + 0.5) / (b - a + 1));
    };
    const uChoice = (v, pool) => {
        const i = pool.indexOf(v);
        if (i < 0) throw new Error(`choice ${v} not in pool`);
        uRandom((i + 0.5) / pool.length);
    };
    const kindU = (kind) => {
        for (let i = 0; i < LEE_MUSIC_KINDS.length; i++) {
            if (LEE_MUSIC_KINDS[i][0] === kind) {
                const lo = i === 0 ? 0 : LEE_MUSIC_KINDS[i - 1][1];
                return uRandom((lo + LEE_MUSIC_KINDS[i][1]) / 2);
            }
        }
        throw new Error(`unknown kind ${kind}`);
    };
    // Does this node have the leaf's exact shape — an interval then a run of 0s,
    // the run optionally vanished? The generator emits that shape before it ever
    // consults the kind table, so the encoder has to recognise it the same way.
    const asLeaf = (node) => {
        if (!node || node.k !== 'seq' || !node.items || node.items.length !== 2) return null;
        const [head, tail] = node.items;
        if (head.k !== 'num') return null;
        const hidden = tail.k === 'hide';
        const run = hidden ? tail.child : tail;
        if (!run || run.k !== 'iter' || !run.ns || run.ns.length !== 1) return null;
        if (!run.child || run.child.k !== 'num' || run.child.a !== 0) return null;
        if (run.ns[0] < 1 || run.ns[0] > LEE_RUN_MAX) return null;
        return { a: head.a, n: run.ns[0], hidden };
    };

    const emit = (node, depth, family, budget) => {
        if (!node) throw new Error('empty node');
        const leaf = asLeaf(node);
        // The generator only *offers* the leaf below the root, and takes it
        // unconditionally at depth 1 — mirror both, in that order.
        // NB the generator draws the RUN LENGTH before the interval (the run is
        // built first, in the `run` const), and the leaf test before both.
        const emitLeaf = () => {
            uRandint(leaf.n, 1, LEE_RUN_MAX);
            uChoice(leaf.a, leeIntervalPool(family));
            uRandom(leaf.hidden ? 0.1 : 0.9);
        };
        if (depth <= 1) {
            if (!leaf) throw new Error('code too deep for the generator');
            emitLeaf();
            return;
        }
        if (depth < budget) uRandom(leaf ? 0.1 : 0.9);
        if (leaf) { emitLeaf(); return; }
        const d = depth - 1;
        switch (node.k) {
            case 'num':
                kindU('val');
                uChoice(node.a, leeIntervalPool(family));
                return;
            case 'seq': {
                const items = node.items || [];
                if (items.length < 2 || items.length > LEE_MUSIC_SEQ_MAX) throw new Error('seq arity out of range');
                kindU('seq');
                uChoice(items.length, LEE_MUSIC_SEQ_POOL);
                for (const it of items) emit(it, d, family, budget);
                return;
            }
            case 'out':
                // The generator writes ⟨ ⟩ two ways: as the one-value idiom
                // (which is a `seq`, and reaches the encoder as one) or over a
                // whole subtree. Only the second is a bare `out` node.
                kindU('out');
                uRandom(0.9);
                emit(node.child, d, family, budget);
                return;
            case 'cont': kindU('cont'); emit(node.child, d, family, budget); return;
            case 'iter': {
                const ns = node.ns || [];
                if (!ns.length || ns.length > 2) throw new Error('iteration count arity');
                kindU('iter');
                uRandint(ns[0], 2, 8);
                uRandom(ns.length > 1 ? 0.1 : 0.9);
                uRandint(ns.length > 1 ? ns[1] : 2, 2, 5);
                uRandom(node.cross ? 0.1 : 0.9);
                emit(node.child, d, family, budget);
                return;
            }
            case 'rev': kindU('rev'); emit(node.child, d, family, budget); return;
            case 'pm': kindU('pm'); emit(node.child, d, family, budget); return;
            case 'int': kindU('int'); emit(node.child, d, family, budget); return;
            case 'op':
                kindU('op');
                uChoice(node.op, LEE_MUSIC_OPS);
                uRandom(node.cross ? 0.1 : 0.9);
                emit(node.a, d, family, budget);
                emit(node.b, d, family, budget);
                return;
            case 'comb':
                kindU('comb');
                emit(node.a, d, family, budget);
                emit(node.b, d, family, budget);
                return;
            case 'osi': {
                const ns = node.ns || [];
                if (!ns.length || ns.length > 2) throw new Error('iteration count arity');
                kindU('osi');
                uRandint(ns[0], 2, 4);
                uRandom(ns.length > 1 ? 0.1 : 0.9);
                uRandint(ns.length > 1 ? ns[1] : 1, 1, 3);
                uChoice(node.side || 'l', ['l', 'r']);
                emit(node.a, d, family, budget);
                emit(node.b, d, family, budget);
                return;
            }
            case 'chunk': kindU('chunk'); emit(node.child, d, family, budget); return;
            case 'brk': case 'brkall':
                kindU('brk');
                uRandom(node.k === 'brkall' ? 0.1 : 0.9);
                emit(node.child, d, family, budget);
                return;
            case 'abs': kindU('abs'); emit(node.child, d, family, budget); return;
            case 'hide': kindU('hide'); emit(node.child, d, family, budget); return;
            case 'par': {
                const rows = node.rows || [];
                if (rows.length < 2 || rows.length > 3) throw new Error('parallel row count');
                kindU('par');
                uRandint(rows.length, 2, 3);
                for (let i = 0; i < rows.length; i++) {
                    emit(rows[i], d, family, budget);
                    uRandom((node.indep && node.indep[i]) ? 0.1 : 0.9);
                    uRandom((node.every && node.every[i]) ? 0.1 : 0.9);
                }
                return;
            }
            default:
                throw new Error(`unsupported node ${node.k}`);
        }
    };

    // Top level, in the generator's own order: family, one part, the code, a
    // 'plain' finish (the analysed code already IS the whole piece), then the
    // performance genes.
    uChoice(pheno.family, LEE_MUSIC_FAMILIES);
    // The depth budget the code actually needs: the shallowest the gene offers
    // that still covers it (a `num` leaf needs one level below its own).
    const need = leeCodeDepth(pheno.root) + 1;
    let budget = 0;
    for (let i = 0; i < LEE_MUSIC_DEPTHS.length; i++) {
        if (LEE_MUSIC_DEPTHS[i] >= need && (!budget || LEE_MUSIC_DEPTHS[i] < budget)) budget = LEE_MUSIC_DEPTHS[i];
    }
    if (!budget) throw new Error(`code needs depth ${need}, deeper than any genome`);
    uChoice(budget, LEE_MUSIC_DEPTHS);
    uRandint(1, 1, 2);
    emit(pheno.root, budget, pheno.family, budget);
    uChoice('plain', ['cont', 'iter', 'rev', 'sequence', 'sequence', 'par', 'plain']);
    uRandint(Math.round(pheno.tonic) - 60, -5, 4);
    uRandint(Math.round(pheno.bpm) - 70, 0, 60);
    uUniform(pheno.swing, 0, 0.25);
    return us;
};

class SITMusicIndividual extends SITCodeIndividual {
    constructor(genome = null) {
        super(genome);
        // Shared output modalities (local fallbacks for tests): notes → MIDI, else synth.
        const fw = (typeof window !== 'undefined') && window.framework;
        this.midiModality = (fw && fw.sharedMIDI) || new MIDIModality();
        this.audio = (fw && fw.sharedAudio) || new AudioModality();
        this.isPlaying = false;
    }

    defaultRepresentation() { return leeRepresentationMusic; }

    /**
     * Build an individual from a code that was ANALYSED out of a real melody
     * (window.SITAnalysis), so an imported tune enters the population as an
     * ordinary genome and can be bred from.
     *
     * This is the same contract the grid-edit writeback obeys: an intervention
     * only counts if it goes through the representation. A code held beside the
     * genome would be lost at the first mutate(); a code *generated* by driving
     * the generator down the right path is a trace like any other, and evolution
     * carries on from the imported melody instead of discarding it.
     *
     * Verified by replay: the genome is expressed again and its evaluated item
     * stream compared with the target's. Returns null if the code cannot be
     * expressed (too deep, an interval beyond the family's cap) or if the replay
     * does not match — a user-edited generator, for instance. Callers should
     * treat null as "analysis only, no seed", never as a silent near-miss.
     *
     * @param {object} pheno  { family, tonic, bpm, swing, root } from SITAnalysis
     * @returns {SITMusicIndividual|null}
     */
    static fromCode(pheno) {
        if (!pheno || !pheno.root) return null;
        // Fold the performance genes into the ranges the generator can draw, so
        // an imported tempo or key doesn't fail the encoding outright. The tonic
        // moves only by octaves, which transposes the whole piece by an octave.
        const code = {
            family: pheno.family,
            tonic: Math.round(pheno.tonic),
            bpm: Math.max(70, Math.min(130, Math.round(pheno.bpm || 100))),
            swing: Math.max(0, Math.min(0.249, pheno.swing || 0)),
            root: pheno.root,
        };
        while (code.tonic > 64) code.tonic -= 12;
        while (code.tonic < 55) code.tonic += 12;

        let us;
        try { us = leeEncodeMusic(code); } catch (err) { return null; }

        const rep = leeRepresentationMusic;
        rep.op();                                   // build the PTO Op first: it must not eat our queue
        const realRandom = Math.random;
        let i = 0;
        let genome;
        try {
            // Every PTO distribution samples with exactly one Math.random(), so
            // the queue lines up with the generator's decisions one for one.
            Math.random = () => (i < us.length ? us[i++] : realRandom());
            genome = rep.generateRandom();
        } finally {
            Math.random = realRandom;
        }
        if (i !== us.length) return null;            // the generator took a different path

        const individual = new SITMusicIndividual(genome);
        const unit = individual.unitDegrees();
        const want = SITLanguage.evaluate(code.root, unit);
        const got = SITLanguage.evaluate(individual.phenotype.root, unit);
        if (!SITMusicIndividual.sameStream(want, got)) return null;
        return individual;
    }

    /** Do two evaluated item streams sound the same? (The seeding check.) */
    static sameStream(a, b) {
        const flat = (items) => SITLanguage._flatten(items)
            .map(it => `${it.v}|${it.hide ? 1 : 0}|${it.abs ? 1 : 0}|${it.out ? 1 : 0}`).join(',');
        return flat(a) === flat(b);
    }

    usesColorPalette() { return true; }         // voices are palette-coloured
    usesPerformanceControls() { return true; }  // global tempo/swing dials
    performanceDials() { return ['bpm', 'swing']; }
    usesMIDISync() { return true; }             // follow a DAW's MIDI clock
    // Attaches the Leeuwenberg Analysis panel: the reverse map (a melody → a
    // code → a genome). This is the only type that can receive one, since it is
    // the only one whose generator can be run backwards (see fromCode).
    usesSITAnalysis() { return true; }

    /**
     * Start from the beginning, every time — unlike the step sequencers.
     *
     * They are one bar repeating, so entering at the shared Transport phase is
     * what keeps the beat as you move across the grid. A Leeuwenberg code is not
     * a bar: it is a piece of whatever length its own structure gives it, up to
     * sixteen bars, and its regularities are heard FROM THE START (an arch, a
     * sequence, a repeat with a transposed answer). Dropping into the middle of
     * one at whatever phase the previous tile happened to leave the clock at
     * would hide exactly what there is to listen for.
     */
    usesSharedPhase() { return false; }
    // Like the melody grid, the artefact is the sound; the piano roll is a view of it.
    usesImageSave() { return false; }

    /** The scale table for this code's rotational family (see LEE_SCALES). */
    scale() {
        const p = this.phenotype;
        return LEE_SCALES[(p && p.family)] || LEE_SCALES[7];
    }

    /**
     * A scale degree as a MIDI pitch. An octave is exactly `family` degrees —
     * that identity is what lets the engine's angular arithmetic be pitch
     * arithmetic — and the result is folded into a playable range rather than
     * clamped, so a runaway ascent wraps by octaves instead of piling up on the
     * top note.
     */
    midiFor(degree) {
        const p = this.phenotype;
        const table = this.scale();
        const N = table.length;
        const d = Math.round(degree);
        const idx = ((d % N) + N) % N;
        let pitch = ((p && p.tonic) || 60) + 12 * Math.floor(d / N) + table[idx];
        while (pitch > LEE_MUSIC_PITCH_HI) pitch -= 12;
        while (pitch < LEE_MUSIC_PITCH_LO) pitch += 12;
        return pitch;
    }

    /** The interpreted piece (cached per phenotype — evaluation is not cheap). */
    music() {
        const p = this.phenotype;
        if (this._musicFor !== p) {
            this._musicFor = p;
            this._music = SITLanguage.interpretMusic(this.items());
        }
        return this._music;
    }

    /**
     * The notes, as MIDI: { pitch, velocity, start, dur (grains), voice, t }.
     * Velocity carries the texture — the trunk sings out, branches sit under it,
     * and a note landing on a beat is accented — so counterpoint is audible as
     * foreground and background rather than a flat wall.
     */
    getPhenotype() {
        const piece = this.music();
        return piece.notes.map(n => {
            const onBeat = Math.abs(n.start % 4) < 1e-6;
            const base = n.depth === 0 ? 102 : Math.max(58, 92 - 14 * n.depth);
            return {
                pitch: this.midiFor(n.degree),
                velocity: Math.max(1, Math.min(127, Math.round(base + (onBeat ? 10 : 0)))),
                start: n.start, dur: n.dur, voice: n.voice, depth: n.depth, t: n.t,
            };
        });
    }

    /** Total length of the piece in grains (a grain is a 16th note). */
    grains() { return Math.max(1, Math.ceil(this.music().grains)); }

    /** Greatest number of notes sounding at once (a sweep over the note edges). */
    polyphony() {
        const edges = [];
        for (const n of this.music().notes) { edges.push([n.start, 1], [n.start + n.dur, -1]); }
        edges.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
        let now = 0, most = 0;
        for (const e of edges) { now += e[1]; if (now > most) most = now; }
        return most;
    }

    /**
     * Reject codes that aren't worth a tile: too short or too long to be a
     * phrase, too few notes, too few distinct pitches (a code that repeats one
     * note is perfectly legal Leeuwenberg — it just isn't music), or so thickly
     * polyphonic that it is a cluster rather than a texture. The visual half
     * rejects near-collinear figures for the same reason: the language is not at
     * fault, but not every legal code is worth hearing. A piece that hits the
     * engine's grain cap is truncated mid-code, so it goes too.
     */
    validate() {
        const piece = this.music();
        if (piece.notes.length < 6) return false;
        const grains = piece.grains;
        if (grains < 8 || grains >= LEE_MAX_GRAINS) return false;
        const pitches = new Set(piece.notes.map(n => this.midiFor(n.degree)));
        if (pitches.size < 3) return false;
        return this.polyphony() <= 8;
    }

    // --- Tile visual: a piano roll, one colour per voice ----------------------
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);

        const notes = this.getPhenotype();
        if (!notes.length) return;
        const grains = this.grains();
        const s = Math.min(W, H) / 128;           // resolution-independent pixel unit
        const pad = Math.max(2, Math.round(3 * s));

        let lo = Infinity, hi = -Infinity;
        for (const n of notes) { lo = Math.min(lo, n.pitch); hi = Math.max(hi, n.pitch); }
        // Always show at least an octave, so a narrow melody doesn't stretch into
        // absurdly fat bars and a wide one still fills the tile.
        if (hi - lo < 12) { const mid = (hi + lo) / 2; lo = mid - 6; hi = mid + 6; }
        const gridW = W - 2 * pad, gridH = H - 2 * pad;
        const x = (g) => pad + (g / grains) * gridW;
        const rowH = gridH / (hi - lo + 1);
        const y = (pitch) => pad + (hi - pitch) * rowH;

        // Beat and bar lines, so the metre is legible behind the notes.
        for (let g = 0; g <= grains; g += 4) {
            ctx.fillStyle = (g % 16 === 0) ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(x(g), pad, Math.max(1, s), gridH);
        }

        for (const n of notes) {
            // Voices are spread around the palette by the golden ratio, so
            // adjacent voices never collide in colour however many there are.
            const col = window.Palette.color(0.12 + 0.8 * ((n.voice * 0.6180339887) % 1));
            const nx = x(n.start), nw = Math.max(1.5 * s, x(n.start + n.dur) - nx - 0.5 * s);
            const ny = y(n.pitch) + rowH * 0.12, nh = Math.max(1.5 * s, rowH * 0.76);
            const r = Math.min(2 * s, nh * 0.45, nw * 0.5);
            this._roundRect(ctx, nx, ny, nw, nh, r);
            // Velocity reads as opacity, matching the step sequencers' "a quiet
            // note is still a note" wash.
            ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${0.45 + 0.55 * (n.velocity / 127)})`;
            ctx.fill();
        }

        // The play cursor. It sweeps the whole tile because the tile IS the
        // whole piece — where a step sequencer's cursor crosses one bar over and
        // over, this one crosses the piece once and starts again (see
        // usesSharedPhase).
        const at = this.playheadFraction();
        if (at !== null) Canvas2DModality.drawPlayhead(ctx, x(at * grains), pad, gridH, s);
    }

    _roundRect(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // --- Playback (unified step-sequencer path: live MIDI else synth) ---------
    playMIDI() { this.playSequenced(); }
    stopMIDI() { this.stopSequenced(); }

    /**
     * The piece as a note sequence in ticks. One grain is a 16th note; ⟨ ⟩ may
     * have made a grain a triplet or a half of one, which is why the PPQ is
     * divisible by 12 — every duration the language can write stays integral.
     */
    toMIDISequence() {
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        const ppq = LEE_MUSIC_PPQ, grainTicks = ppq / 4;
        const notes = this.getPhenotype().map(n => {
            const swung = Math.round(n.start) % 2 === 1 ? p.swing * grainTicks * 0.66 : 0;
            return {
                pitch: n.pitch,
                velocity: n.velocity,
                start: Math.max(0, Math.round(n.start * grainTicks + swung)),
                duration: Math.max(1, Math.round(n.dur * grainTicks)),
                // Voices go out on their own channels (0-3, staying clear of the
                // percussion channel) so a DAW can give each one its own sound.
                channel: Math.min(3, n.depth),
            };
        });
        return { bpm: p.bpm, ppq, loopTicks: this.grains() * grainTicks, notes };
    }

    /** Render one loop to an AudioBuffer (the synth fallback when there's no MIDI). */
    renderToAudioBuffer() {
        const ctx = window.AudioClip.context();
        const sr = ctx.sampleRate;
        const p = window.PerformanceControls ? window.PerformanceControls.apply(this.phenotype) : this.phenotype;
        const stepSec = (60 / p.bpm) / 4;                    // one grain = a 16th
        const N = Math.max(1, Math.round(this.grains() * stepSec * sr));
        const buffer = ctx.createBuffer(1, N, sr);
        const buf = buffer.getChannelData(0);
        const atkN = Math.max(1, Math.round(0.005 * sr));    // 5 ms attack
        const relN = Math.max(1, Math.round(0.012 * sr));    // 12 ms release

        for (const n of this.getPhenotype()) {
            const swung = Math.round(n.start) % 2 === 1 ? p.swing * stepSec * 0.66 : 0;
            const durSec = Math.max(0.02, n.dur * stepSec);
            const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
            const amp = 0.22 * (n.velocity / 127);
            // Deeper voices get a duller tone (less second harmonic), so the
            // counterpoint separates by timbre as well as by loudness.
            const h2 = n.depth === 0 ? 0.32 : 0.12;
            const start = Math.max(0, Math.round((n.start * stepSec + swung) * sr));
            const endI = Math.min(Math.round(durSec * sr), N - start);
            for (let i = 0; i < endI; i++) {
                const t = i / sr;
                let env = Math.exp(-t / (durSec * 0.9 + 0.05));
                if (i < atkN) env *= i / atkN;
                const rem = endI - i;
                if (rem < relN) env *= rem / relN;
                const w = Math.sin(2 * Math.PI * freq * t) + h2 * Math.sin(4 * Math.PI * freq * t);
                buf[start + i] += w * amp * env;
            }
        }
        let peak = 0; for (let i = 0; i < N; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
        if (peak > 0.99) { const g = 0.99 / peak; for (let i = 0; i < N; i++) buf[i] *= g; }
        AudioModality.declickTail(buf, sr);
        return buffer;
    }

    // --- Self-description ----------------------------------------------------

    scaleName() {
        const p = this.phenotype;
        return {
            3: 'augmented', 4: 'diminished 7th', 5: 'pentatonic', 6: 'whole tone',
            7: 'diatonic', 8: 'octatonic', 12: 'chromatic',
        }[(p && p.family)] || 'diatonic';
    }

    describeExtra() {
        const p = this.phenotype;
        const { values, ops } = SITLanguage.load(p && p.root);
        const load = values + ops;
        const piece = this.music();
        const notes = this.getPhenotype();
        const ratio = load > 0 ? (notes.length / load).toFixed(1) : '—';
        const vocab = SITLanguage.vocabulary(p && p.root);
        const used = Object.keys(vocab).sort((a, b) => vocab[b] - vocab[a]);

        let s = '\n<span class="genome-label">Structural information load (I):</span>\n';
        s += `  ${load} units — ${values} values + ${ops} operations\n`;
        s += `  → ${notes.length} notes in ${piece.voices} voices,`
            + ` up to ${this.polyphony()} at once (compression ×${ratio})\n`;
        s += `  scale: ${this.scaleName()} (${(p && p.family) || '?'} to the octave)`
            + ` · key ${this.midiToNoteName((p && p.tonic) || 60)}\n`;
        s += `  ${Math.round(p ? p.bpm : 120)} BPM · swing ${(p ? p.swing : 0).toFixed(2)}`
            + ` · ${this.grains()} grains (${(this.grains() / 16).toFixed(1)} bars)\n`;
        s += '\n<span class="genome-label">Language used:</span>\n';
        s += `  ${this._escapeHtml(used.join(', ') || 'none')}\n`;
        s += '\n<span class="genome-label">Code:</span>\n';
        s += `  ${this._escapeHtml(SITLanguage.notation(p && p.root))}\n`;
        s += '\n<span class="genome-label">Piano roll:</span>\n';
        s += this._pianoRoll(notes);
        return s;
    }

    midiToNoteName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    }

    /** A compact ASCII piano roll for the genome panel (one column per grain). */
    _pianoRoll(notes) {
        if (!notes.length) return '  (silent)\n';
        const cols = Math.min(64, this.grains());
        const scale = cols / this.grains();
        const pitches = [...new Set(notes.map(n => n.pitch))].sort((a, b) => b - a).slice(0, 16);
        let s = '';
        for (const pitch of pitches) {
            const row = new Array(cols).fill('·');
            for (const n of notes) {
                if (n.pitch !== pitch) continue;
                const a = Math.floor(n.start * scale), b = Math.max(a + 1, Math.ceil((n.start + n.dur) * scale));
                for (let i = a; i < Math.min(cols, b); i++) row[i] = (i === a) ? '█' : '▬';
            }
            s += '  ' + this.midiToNoteName(pitch).padStart(3, ' ') + ' ' + row.join('') + '\n';
        }
        return s;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SITMusicIndividual;
}

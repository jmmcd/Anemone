// SITAnalysis.js
//
// The REVERSE map: a piece of music (or any value stream) → a Leeuwenberg code.
//
// Everything else in Anemone runs Structural Information Theory *generatively*:
// write a code, decode it to a figure or a piece, and let the minimum principle
// act as a prior on the representation. But SIT is not natively a generative
// theory — it is an ANALYSIS theory. Its claim is that the percept a figure or
// a melody gives rise to is the one described by its SHORTEST code, and the
// theory's work is to find that code. This service is that direction: given a
// melody, search for a minimal-load code of it.
//
// The two directions meet: a code found here is a genome there
// (`SITMusicIndividual.fromCode`), so a real tune can be imported, coded, and
// then EVOLVED — the analysed structure becoming heritable material rather than
// a read-out.
//
// ---------------------------------------------------------------------------
// WHAT IS SEARCHED, AND WHAT IS NOT
// ---------------------------------------------------------------------------
//
// The encoder is a memoised dynamic program over substrings of the value
// stream, minimising `SITLanguage.load` (the paper's I) over a SUBSET of the
// language:
//
//   literal          a value, or a run of them                (cost: 1 per non-zero value)
//   ( ) serial        s = X then Y                            (free — a border is not a unit)
//   · iteration       s = k copies of X                       (1 + I(X))
//   R reversal        s = X followed by its MIRROR             (1 + I(X))
//                     (the intervals reversed — an arch, i.e. the retrograde
//                      inversion of the phrase, not its retrograde)
//   ± variation       s = X followed by its inversion         (1 + I(X))
//   + transposition   s = k copies of X, the i-th moved by dᵢ (2 + #{dᵢ≠0} + I(X))
//
// Those six cover the regularities that make tonal melodies compressible —
// repetition, symmetry, inversion and the sequence — and they are exactly the
// constructs `SITMusicIndividual`'s generator can express, which is what lets an
// analysis become a genome. Deliberately NOT searched: continuation ⦃ ⦄ (its
// repeat count is resolved geometrically, so it cannot be guaranteed exact),
// parallel structure (the analysis is monophonic), ⊛, ∫, and the combinatory
// rules. A code found here is therefore an UPPER BOUND on I, never a claim of
// the true minimum — which is the honest position anyway, since finding the
// global minimum over the full language is not a tractable search.
//
// Exactness is the one thing that is guaranteed: `verify` replays the code
// through the very same `SITLanguage.evaluate` the app uses and compares value
// streams, and the tests assert it for every built-in melody. An analysis that
// is not exact is a bug, not an approximation.
//
// ---------------------------------------------------------------------------
// FROM NOTES TO VALUES
// ---------------------------------------------------------------------------
//
// `interpretMusic` reads a stream of intervals, one per grain of time, so the
// analysis has to write one:
//
//   a note onset      the interval from the previous sounding pitch
//   a held grain      0 (the pitch does not move — which is what makes a held
//                     note `n·(0)`, the paper's own "length is not a primitive")
//   a rest grain      0, vanished (‾): time passes, nothing sounds, the pitch
//                     pointer stays where it was
//
// Intervals are counted in SCALE DEGREES, not semitones, because that is what
// makes a melody compressible: a sequence rising by step is one interval
// repeated in the scale, and several different ones in semitones. `chooseKey`
// picks the smallest scale that contains every pitch in the tune, so a
// pentatonic melody is coded pentatonically and a chromatic one chromatically.

const SIT_ANALYSIS_MAX_GRAINS = 256;  // longest stream the DP will take on
const SIT_ANALYSIS_MAX_COUNT = 8;     // largest iteration count a code may use
// Largest arity of one ( ) border. Mirrors the arity `SITMusicIndividual`'s
// generator can draw, so a tidied code stays expressible as a genome.
const SIT_ANALYSIS_MAX_SEQ = 10;
// Scales tried by chooseKey, smallest first: the smallest family that holds
// every pitch gives the tightest intervals and so the shortest code.
const SIT_ANALYSIS_SCALES = [
    [3, [0, 4, 8]], [4, [0, 3, 6, 9]], [5, [0, 2, 4, 7, 9]], [6, [0, 2, 4, 6, 8, 10]],
    [7, [0, 2, 4, 5, 7, 9, 11]], [8, [0, 1, 3, 4, 6, 7, 9, 10]],
    [12, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
];

const SITAnalysis = {

    // =======================================================================
    // THE ENCODER:  value stream -> minimal-load code
    // =======================================================================

    /**
     * Find a short code for a stream of ATOMS — `{ v, hide }` objects, the
     * value-level form of what `SITLanguage.evaluate` produces.
     *
     * Memoised over substrings; each state keeps the cheapest node found and
     * whether that node's item stream is FLAT (free of chunk items). Flatness
     * matters because R and ± reverse/negate the ITEM list, so over a chunked
     * operand they do not reverse the value stream — the rules are only applied
     * where they mean what they say.
     *
     * @param {Array} atoms  [{v, hide}]
     * @returns {{node: object, cost: number}}
     */
    encode(atoms) {
        const A = atoms.slice(0, SIT_ANALYSIS_MAX_GRAINS);
        const n = A.length;
        if (!n) return { node: { k: 'seq', items: [] }, cost: 0 };

        // Prefix sums of literal cost: the load of writing a span out in full.
        const lit = new Array(n + 1).fill(0);
        for (let i = 0; i < n; i++) lit[i + 1] = lit[i] + (A[i].v !== 0 ? 1 : 0);

        const same = (a, b) => a.v === b.v && !!a.hide === !!b.hide;
        const memo = new Map();

        const literalNode = (i, j) => {
            const items = [];
            for (let k = i; k < j; k++) items.push(this._atomNode(A[k]));
            return items.length === 1 ? items[0] : { k: 'seq', items };
        };

        const best = (i, j) => {
            const key = i * (n + 1) + j;
            const hit = memo.get(key);
            if (hit) return hit;
            const len = j - i;
            // Start from the literal, which is always available.
            let out = { node: literalNode(i, j), cost: lit[j] - lit[i], flat: true };
            const take = (node, cost, flat) => {
                if (cost < out.cost) out = { node, cost, flat };
            };
            memo.set(key, out);      // guard against re-entry on degenerate spans
            if (len < 2) return out;

            // · ITERATION — the span is k copies of a period p.
            for (let p = 1; p <= len / 2; p++) {
                if (len % p) continue;
                const k = len / p;
                if (k > SIT_ANALYSIS_MAX_COUNT) continue;
                let periodic = true;
                for (let x = i + p; x < j && periodic; x++) periodic = same(A[x], A[x - p]);
                if (!periodic) continue;
                if (p === 1) {
                    // A repeated single value: `k·(a)`, no chunking needed.
                    take({ k: 'iter', ns: [k], child: this._atomNode(A[i]) },
                        1 + (A[i].v !== 0 ? 1 : 0), true);
                } else {
                    const sub = best(i, i + p);
                    // The chunk is what makes iteration repeat the phrase WHOLE
                    // (2·{a,b} = a,b,a,b) rather than each note (a,a,b,b).
                    take({ k: 'iter', ns: [k], child: { k: 'chunk', child: sub.node } },
                        1 + sub.cost, false);
                }
            }

            if (len % 2 === 0) {
                const h = i + len / 2;
                // R REVERSAL — the phrase then its retrograde.
                let pal = true;
                for (let x = 0; x < len / 2 && pal; x++) pal = same(A[i + x], A[j - 1 - x]);
                if (pal) {
                    const sub = best(i, h);
                    if (sub.flat) take({ k: 'rev', child: sub.node }, 1 + sub.cost, true);
                }
                // ± LEFT-RIGHT VARIATION — the phrase then its inversion.
                let inv = true;
                for (let x = 0; x < len / 2 && inv; x++) {
                    inv = A[h + x].v === -A[i + x].v && !!A[h + x].hide === !!A[i + x].hide;
                }
                if (inv) {
                    const sub = best(i, h);
                    if (sub.flat) take({ k: 'pm', child: sub.node }, 1 + sub.cost, true);
                }
            }

            // + TRANSPOSED REPEAT — the classical SEQUENCE. k copies of one
            // phrase, the i-th shifted in pitch. Since pitch accumulates from
            // note to note, shifting a copy means bumping its LEADING interval,
            // and the paper's own rule (a + {b,c} = {a+b,c}) lands a constant on
            // exactly that head — so `k·{X} + (0,d₁,…)` is the whole idiom.
            for (let k = 2; k <= SIT_ANALYSIS_MAX_COUNT && k <= len; k++) {
                if (len % k) continue;
                const p = len / k;
                if (p < 2) continue;
                const offs = [0];
                let fits = true;
                for (let c = 1; c < k && fits; c++) {
                    const base = i + c * p;
                    // Every note of the copy must match but the first, whose
                    // interval carries the transposition.
                    for (let x = 1; x < p && fits; x++) fits = same(A[base + x], A[i + x]);
                    if (!fits) break;
                    if (!!A[base].hide !== !!A[i].hide) { fits = false; break; }
                    offs.push(A[base].v - A[i].v);
                }
                if (!fits) continue;
                if (offs.every(d => d === 0)) continue;         // plain iteration already covers it
                const sub = best(i, i + p);
                const items = offs.map(d => ({ k: 'num', a: d }));
                const cost = 2 + offs.filter(d => d !== 0).length + sub.cost;
                take({
                    k: 'op', op: '+',
                    a: { k: 'iter', ns: [k], child: { k: 'chunk', child: sub.node } },
                    b: { k: 'seq', items },
                }, cost, false);
            }

            // ( ) SERIAL — split anywhere. A border costs nothing, so this is
            // pure bookkeeping: the cheapest way to cut the span in two.
            for (let m = i + 1; m < j; m++) {
                const a = best(i, m), b = best(m, j);
                if (a.cost + b.cost < out.cost) {
                    take({ k: 'seq', items: [a.node, b.node] }, a.cost + b.cost, a.flat && b.flat);
                }
            }
            memo.set(key, out);
            return out;
        };

        const result = best(0, n);
        return { node: this.tidy(result.node), cost: result.cost };
    },

    /** One atom as a code node: a value, vanished if it is a rest. */
    _atomNode(atom) {
        const num = { k: 'num', a: atom.v };
        return atom.hide ? { k: 'hide', child: num } : num;
    },

    /**
     * Flatten nested borders and re-group wide ones.
     *
     * The DP splits a span in two at a time, so it builds right-leaning chains
     * of `seq` nodes — evaluation-identical to one wide border and identical in
     * load (a border is not an information unit), but arbitrarily DEEP. Depth is
     * not free here: `SITMusicIndividual`'s generator can only express a code
     * within its recursion budget, so a 90-note melody coded as an 90-deep chain
     * could be read but never seeded. Flattening and re-grouping turns that into
     * a shallow, balanced tree at no cost in I.
     */
    tidy(node) {
        if (!node || typeof node !== 'object') return node;
        for (const key of ['child', 'a', 'b']) {
            if (node[key]) node[key] = this.tidy(node[key]);
        }
        if (node.rows) node.rows = node.rows.map(r => this.tidy(r));
        if (node.k !== 'seq') return node;

        // Collect the WHOLE border spine before re-grouping. Doing it level by
        // level instead would re-nest the groups at every step of the DP's
        // binary chain, which adds a level per split and leaves the tree as deep
        // as it started — the flattening has to see the entire run at once.
        const items = [];
        const collect = (n) => {
            if (n && n.k === 'seq' && n.items) { for (const c of n.items) collect(c); }
            else if (n) items.push(this.tidy(n));
        };
        for (const it of (node.items || [])) collect(it);
        return this._group(items);
    },

    /** Nest a wide list of items into borders of at most SIT_ANALYSIS_MAX_SEQ. */
    _group(items) {
        if (items.length === 1) return items[0];
        if (items.length <= SIT_ANALYSIS_MAX_SEQ) return { k: 'seq', items };
        // Balanced: split into MAX_SEQ groups of near-equal size, recursively.
        const per = Math.ceil(items.length / SIT_ANALYSIS_MAX_SEQ);
        const groups = [];
        for (let i = 0; i < items.length; i += per) groups.push(this._group(items.slice(i, i + per)));
        return { k: 'seq', items: groups };
    },

    /** Depth of a code tree (what the generator's recursion budget has to cover). */
    depth(node) {
        if (!node || typeof node !== 'object') return 0;
        let d = 0;
        for (const key of ['child', 'a', 'b']) if (node[key]) d = Math.max(d, this.depth(node[key]));
        for (const it of (node.items || [])) d = Math.max(d, this.depth(it));
        for (const r of (node.rows || [])) d = Math.max(d, this.depth(r));
        return d + 1;
    },

    /**
     * Does this code evaluate back to exactly these atoms? The check that makes
     * the analysis a claim rather than a hope — it goes through the app's own
     * evaluator, not a private replica.
     */
    verify(node, atoms) {
        const got = SITLanguage._flatten(SITLanguage.evaluate(node));
        if (got.length !== atoms.length) return false;
        for (let i = 0; i < got.length; i++) {
            if (got[i].v !== atoms[i].v || !!got[i].hide !== !!atoms[i].hide) return false;
        }
        return true;
    },

    // =======================================================================
    // FROM NOTES TO A CODE
    // =======================================================================

    /**
     * Analyse a melody.
     *
     * @param {Array}  notes  [{pitch, start, dur}] — start/dur in the same units
     * @param {object} [opts]
     * @param {number} [opts.grain]  time units per grain (default 1)
     * @param {number} [opts.bpm]
     * @returns {object} { code, atoms, load, literalLoad, ratio, family, tonic,
     *                     scaleName, grains, exact, depth, notes }
     */
    analyse(notes, opts = {}) {
        const grain = opts.grain || 1;
        const mono = this.monophonic(notes, grain);
        if (!mono.length) return null;
        const key = this.chooseKey(mono.map(n => n.pitch));
        const atoms = this.atoms(mono, key);
        const span = Math.min(12, Math.max(5, key.family));
        const { node, cost } = this.encode(atoms);
        const literalLoad = atoms.reduce((s, a) => s + (a.v !== 0 ? 1 : 0), 0);
        const code = {
            family: key.family,
            tonic: key.tonic,
            bpm: opts.bpm || 100,
            swing: 0,
            root: node,
        };
        return {
            code, atoms, notes: mono,
            load: cost,
            literalLoad,
            ratio: cost > 0 ? literalLoad / cost : 0,
            family: key.family,
            tonic: key.tonic,
            scaleName: key.name,
            grains: atoms.length,
            depth: this.depth(node),
            // A leap wider than the generator's interval pool can be coded and
            // heard, but not seeded — worth reporting rather than hiding.
            withinSpan: atoms.every(a => Math.abs(a.v) <= span),
            exact: this.verify(node, atoms),
        };
    },

    /**
     * Quantise to grains and reduce to a single line. The coding language reads
     * one value per grain, so a chord has to become one note: we keep the
     * highest (the melody one hears — the "skyline"), which is the standard
     * reduction and is stated plainly in the panel rather than done silently.
     */
    monophonic(notes, grain = 1) {
        const q = (notes || []).map(n => ({
            pitch: Math.round(n.pitch),
            start: Math.max(0, Math.round(n.start / grain)),
            dur: Math.max(1, Math.round(n.dur / grain)),
        })).sort((a, b) => (a.start - b.start) || (b.pitch - a.pitch));

        const out = [];
        for (const n of q) {
            const prev = out[out.length - 1];
            if (!prev) { out.push(n); continue; }
            if (n.start === prev.start) continue;             // a chord: keep the top note
            if (n.start < prev.start + prev.dur) prev.dur = n.start - prev.start;  // clip an overlap
            if (prev.dur > 0) out.push(n); else { out[out.length - 1] = n; }
        }
        return out.filter(n => n.dur > 0);
    },

    /**
     * The smallest scale that contains every pitch — the key the melody is in,
     * as far as the coding language is concerned. A smaller family means fewer
     * degrees to the octave, so the same tune is written with smaller intervals
     * and codes shorter: this choice is itself an application of the minimum
     * principle.
     */
    chooseKey(pitches) {
        const names = {
            3: 'augmented', 4: 'diminished 7th', 5: 'pentatonic', 6: 'whole tone',
            7: 'diatonic', 8: 'octatonic', 12: 'chromatic',
        };
        const lo = Math.min(...pitches);
        for (const [family, table] of SIT_ANALYSIS_SCALES) {
            for (let pc = 0; pc < 12; pc++) {
                if (pitches.every(p => table.indexOf((((p - pc) % 12) + 12) % 12) >= 0)) {
                    const tonic = pc + 12 * Math.floor((lo - pc) / 12);
                    return { family, tonic, table, name: names[family] };
                }
            }
        }
        const table = SIT_ANALYSIS_SCALES[SIT_ANALYSIS_SCALES.length - 1][1];
        return { family: 12, tonic: lo, table, name: names[12] };
    },

    /** A pitch as a scale degree from the tonic (an octave is `family` degrees). */
    degreeOf(pitch, key) {
        const s = pitch - key.tonic;
        const oct = Math.floor(s / 12);
        const idx = key.table.indexOf(s - 12 * oct);
        return oct * key.table.length + (idx < 0 ? 0 : idx);
    },

    /**
     * The atom stream for a monophonic line: one value per grain of time —
     * interval at an onset, 0 while a note is held, 0-vanished during a rest.
     * This is the inverse of what `interpretMusic`'s turtle does, so decoding
     * the result gives the notes back exactly.
     */
    atoms(notes, key) {
        const atoms = [];
        let t = 0, prev = 0, prevPitch = null;                // the turtle starts on the tonic
        for (const n of notes) {
            for (let g = t; g < n.start && atoms.length < SIT_ANALYSIS_MAX_GRAINS; g++) {
                atoms.push({ v: 0, hide: true });              // a rest: time moves, pitch does not
            }
            // A REPEATED note, hard against the one before it, has to be
            // articulated or it is not a repeat: successive grains at one pitch
            // are one held note (that is the whole point of `n·(0)`, and the
            // visual half says the same — collinear grains are one line). So
            // clip a grain off the previous note and vanish it. That is what the
            // vanishing sign is for, it is what a player does anyway, and it
            // costs nothing in I because the value is 0. A note only one grain
            // long has nothing to clip, and does merge — the language genuinely
            // cannot tell a tie from a re-attack at the grain resolution.
            const contiguous = prevPitch === n.pitch && t === n.start;
            if (contiguous && atoms.length && !atoms[atoms.length - 1].hide
                && atoms[atoms.length - 1].v === 0) {
                atoms[atoms.length - 1] = { v: 0, hide: true };
            }
            const deg = this.degreeOf(n.pitch, key);
            atoms.push({ v: deg - prev, hide: false });
            for (let g = 1; g < n.dur && atoms.length < SIT_ANALYSIS_MAX_GRAINS; g++) {
                atoms.push({ v: 0, hide: false });             // held: `n·(0)`, the paper's own
            }
            prev = deg;
            prevPitch = n.pitch;
            t = n.start + n.dur;
        }
        return atoms.slice(0, SIT_ANALYSIS_MAX_GRAINS);
    },

    // =======================================================================
    // MELODIES TO ANALYSE
    // =======================================================================

    /**
     * Built-in tunes, in a one-line notation: `PITCH:GRAINS`, where a grain is a
     * SIXTEENTH note (so 4 = a crotchet, 8 = a minim) and `r` is a rest. They
     * are chosen for what they show: nursery tunes are built almost entirely out
     * of the regularities the coder searches for, which is exactly the claim SIT
     * makes about why they are easy to hear and to remember.
     */
    melodies: {
        'Twinkle, Twinkle': {
            bpm: 108,
            notes: 'C4:4 C4:4 G4:4 G4:4 A4:4 A4:4 G4:8 F4:4 F4:4 E4:4 E4:4 D4:4 D4:4 C4:8 '
                + 'G4:4 G4:4 F4:4 F4:4 E4:4 E4:4 D4:8 G4:4 G4:4 F4:4 F4:4 E4:4 E4:4 D4:8 '
                + 'C4:4 C4:4 G4:4 G4:4 A4:4 A4:4 G4:8 F4:4 F4:4 E4:4 E4:4 D4:4 D4:4 C4:8',
        },
        'Frère Jacques': {
            bpm: 120,
            notes: 'C4:4 D4:4 E4:4 C4:4 C4:4 D4:4 E4:4 C4:4 '
                + 'E4:4 F4:4 G4:8 E4:4 F4:4 G4:8 '
                + 'G4:2 A4:2 G4:2 F4:2 E4:4 C4:4 G4:2 A4:2 G4:2 F4:2 E4:4 C4:4 '
                + 'C4:4 G3:4 C4:8 C4:4 G3:4 C4:8',
        },
        'Ode to Joy': {
            bpm: 120,
            notes: 'E4:4 E4:4 F4:4 G4:4 G4:4 F4:4 E4:4 D4:4 C4:4 C4:4 D4:4 E4:4 E4:6 D4:2 D4:8 '
                + 'E4:4 E4:4 F4:4 G4:4 G4:4 F4:4 E4:4 D4:4 C4:4 C4:4 D4:4 E4:4 D4:6 C4:2 C4:8',
        },
        'Row, Row, Row Your Boat': {
            bpm: 100,
            notes: 'C4:4 C4:4 C4:4 D4:2 E4:2 E4:4 D4:2 E4:2 F4:2 G4:6 '
                + 'C5:2 C5:2 C5:2 G4:2 G4:2 G4:2 E4:2 E4:2 E4:2 C4:2 C4:2 C4:2 '
                + 'G4:2 F4:2 E4:2 D4:2 C4:8',
        },
        'Rising sequence': {
            bpm: 120,
            // A four-note motif transposed up a step three times: the textbook
            // sequence, and the one case where the `k·{X} + (0,d…)` rule alone
            // should collapse the whole tune to a handful of units.
            notes: 'C4:2 E4:2 D4:2 G4:2 D4:2 F4:2 E4:2 A4:2 '
                + 'E4:2 G4:2 F4:2 B4:2 F4:2 A4:2 G4:2 C5:2',
        },
        'Row and mirror': {
            bpm: 132,
            // A twelve-tone row and its MIRROR — the intervals read backwards,
            // which is what `R` writes. (Not the row's retrograde: that would
            // need the intervals negated too, and the language's symmetry
            // operations append rather than transform.) `R` should find it and
            // halve the load, which is the test that the coder sees symmetry.
            // One grain per note, so the atom stream IS the interval series and
            // its symmetry is visible to the coder: a note two grains long
            // would put a held grain between the halves and break the mirror.
            notes: 'C4:1 C#4:1 A3:1 B3:1 G3:1 A#3:1 D4:1 E4:1 F#4:1 D#4:1 F4:1 G#4:1 '
                + 'B4:1 C#5:1 A#4:1 C5:1 D5:1 F#5:1 A5:1 F5:1 G5:1 D#5:1 E5:1',
        },
    },

    /** Parse the `PITCH:GRAINS` notation above into notes (start/dur in grains). */
    parseMelody(text) {
        const names = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        const notes = [];
        let t = 0;
        for (const token of String(text).trim().split(/\s+/)) {
            if (!token) continue;
            const [note, len] = token.split(':');
            const dur = Math.max(1, parseInt(len, 10) || 1);
            const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
            if (m) {
                const pc = names[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
                notes.push({ pitch: (parseInt(m[3], 10) + 1) * 12 + pc, start: t, dur });
            }
            t += dur;                                          // an unparsed token is a rest
        }
        return notes;
    },

    /** Analyse one of the built-in melodies by name. */
    analyseMelody(name) {
        const m = this.melodies[name];
        if (!m) return null;
        const result = this.analyse(this.parseMelody(m.notes), { bpm: m.bpm });
        if (result) result.title = name;
        return result;
    },
};

if (typeof window !== 'undefined') window.SITAnalysis = SITAnalysis;
if (typeof module !== 'undefined' && module.exports) module.exports = SITAnalysis;

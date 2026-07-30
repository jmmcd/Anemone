// SITLanguage.js
//
// A near-complete implementation of the *perceptual coding language* of
// E. L. J. Leeuwenberg, "A Perceptual Coding Language for Visual and Auditory
// Patterns", American Journal of Psychology 84(3), 1971, pp. 307-349 — the
// full 1971 notation, not the three-regularity cartoon of Structural
// Information Theory that later papers (and Anemone's existing
// `StructuralInformationIndividual`) use.
//
// This file is the *engine*: it evaluates a code (an abstract syntax tree held
// as plain data) to a stream of values, and interprets that stream as a 2D or
// 3D figure. The two individual types that use it (`SITCodeIndividual`,
// `SITCode3DIndividual`) supply only the PTO generator that writes random
// codes. It is deliberately app-level and stateless, like Palette/Photo.
//
// ---------------------------------------------------------------------------
// WHAT THE PAPER SPECIFIES, AND HOW IT IS REPRESENTED HERE
// ---------------------------------------------------------------------------
//
// The key move (paper p. 312, and the "grain" discussion p. 332) is that a
// figure is coded as a *sequence of angles*, one per elementary "grain" length
// of contour. Length is therefore not a separate primitive: a straight edge of
// n grains is `n·(0)`, n repetitions of the angle 0. Everything below is an
// operator over such value sequences, so one uniform algebra covers angles,
// lengths and (in the paper) tone heights.
//
// A value sequence here is a JS array of ITEMS. An item is either
//
//     a value  { v, abs, out, hide, ov, sub, indep }
//     a chunk  { chunk: [ items ] }                     (the `{ }` indicator)
//
// Chunks are first-class because several rules distinguish "a group that
// functions as one unbroken unit" from "a group whose members function
// separately" (`2·{a,b} = {a,b},{a,b}` vs `2·(a,b) = a,a,b,b`).
//
// INFORMATION UNITS (4, p. 312)
//   n   Number            {k:'num', a}            a literal value
//   ∫   Integration       {k:'int'}               (3,2,5)∫ = 0,3,5,10
//   R   Reversal          {k:'rev'}               R{3,2,5} = 3,2,5,5,2,3
//   ±   Left-right var.   {k:'pm'}                ±(90) = 90,-90
//
// OPERATIONS (5, pp. 312-313)
//   +   Addition          {k:'op', op:'+'}        5+3 = 8
//   ×   Multiplication    {k:'op', op:'x'}        5×3 = 15
//   ·   Iteration         {k:'iter'}              3·(a) = a,a,a
//   *   Vector addition   {k:'op', op:'*'}        composes two angles into one
//                                                 direction; "does not affect
//                                                 length" (fig. 4)
//   ⊛   Addition of       {k:'op', op:'@'}        superimposes one figure's
//       coincident angles                         angles on another (fig. 5) —
//                                                 how a flat figure is drawn
//                                                 onto a curved surface.
//       The paper's glyph is an INTERSECTION SIGN WITH AN ASTERISK INSIDE
//       (∩ over *) — i.e. "intersect, then add" — and p. 319 glosses the two
//       halves separately: "at every point (⟦ ⟧) where it intersects (∩) the
//       radials of the star, a constant absolute angle (|70 deg|) is made with
//       (⊛) these radials". So the geometric reading is in the notation itself,
//       not just in the prose. ⊛ is written here for want of the real glyph.
//   plus ONE-SIDED ITERATION (p. 316) {k:'osi', side:'l'|'r'} — n elements of
//   the left operand per 1 of the right (`;`) or vice versa (`ᐟ`).
//
// INDICATORS (9-10, pp. 313-315)
//   ⦃ ⦄ Continuation      {k:'cont'}   repeat "until it meets something"
//       (parallel form)   {k:'parcont'} the same braces written VERTICALLY:
//                                      replicate a branch about a common point,
//                                      each copy referenced to the last — a
//                                      rosette (fig. 10b, Table 1 shape I)
//   { } Chunking          {k:'chunk'}  one unbroken unit in every context
//   ( ) Border            {k:'seq'}    common fate, members function separately
//   [ ] Breakdown         {k:'brk'}    strip one level of chunking
//   ⟦ ⟧ Full breakdown    {k:'brkall'} strip all chunking
//   / / Reprisal          cross:true   cross-product instead of elementwise
//   | | Absolute angles   {k:'abs'}    values measured from one base axis
//   ‖   Independence      par.indep[]  a branch's angles do not use the parent
//                                      as reference axis
//   ⟨ ⟩ Outerproduct      {k:'out'}    the angle leaves the current plane, in
//                                      the right-hand-rule direction — this is
//                                      the whole of the paper's 3D machinery
//   ‾   Vanishing sign    {k:'hide'}   the value functions but is invisible
//
// COMBINATORY AND IMPLICIT RULES (p. 316)
//   Combination   {k:'comb'}   (a,b)(c,d) = a,c,b,d ; (a,b){c,d} = a,{c,d},b,{c,d}
//   Serial        {k:'seq'}    plain concatenation
//   Parallel      {k:'par'}    "used at nodes, from which different branches
//                              derive": each element of the upper row carries
//                              the whole lower row as a branch, the upper
//                              angles being the reference base for the lower.
//                              (A push/pop branching turtle, exactly.)
//
// ---------------------------------------------------------------------------
// DELIBERATE SIMPLIFICATIONS
// ---------------------------------------------------------------------------
//  * Continuation ("holds until this sequence meets 'something'") is resolved
//    geometrically rather than by collision detection: the repeat count is the
//    one that closes the contour, round(360 / net turn), clamped. This is what
//    turns `⦃a, n·(0)⦄` into a polygon of the right order (fig. 10a) and what
//    the paper's own examples always mean in practice.
//  * ⊛ is implemented as the two-stage construction the paper describes (build
//    the left figure, then trace the right one with its absolute angles taken
//    against the left's local direction rather than the fixed base axis) — see
//    _binary. What is NOT modelled is intersection as such: the field is the
//    direction of the nearest segment, so the superimposed figure is steered
//    everywhere rather than only where it genuinely crosses. For the paper's
//    own uses the two coincide. The rule's worked example on p. 313 also has an
//    off-by-one its prose never explains, and is not reproduced.
//  * The vanishing sign's exception clause ("unless there would be no
//    difference between the situations with and without signs", p. 315) is not
//    modelled; a vanished value is always invisible.
//  * A lone visible grain renders as a POINT, not a short dash (see _markDots):
//    the grain length is notional, so an angle with nothing joined to it is a
//    dot. This is what makes Table 1's C and G dot patterns rather than dashed
//    figures, and the paper distinguishes those from its dashed ones.
//  * Auditory patterns (Table 2) are out of scope, as are the paper's
//    *measures* (preferred dimensionality, hierarchy, substructural order);
//    only structural information load I is reported.
//
// The engine is used generatively, not analytically: we write codes and decode
// them, rather than searching for the minimal code of a given figure. The
// minimum principle therefore acts as a prior on the representation — short
// codes decode to regular, symmetric, repetitive figures.

// --- Evaluation / interpretation caps (a nest of continuations and parallel
// rows can multiply without bound). ---
const LEE_MAX_ITEMS = 4000;      // items produced by one evaluation
const LEE_MAX_MARKS = 6000;      // drawn segments produced by one interpretation
const LEE_CONT_MAX = 24;         // largest repeat count a continuation may take
const LEE_CONT_STRAIGHT = 6;     // repeats for a continuation with no net turn
const LEE_MAX_BRANCH_DEPTH = 4;  // nesting depth of parallel-structure branches
const LEE_FIELD_SAMPLES = 256;   // segments sampled when building a ⊛ direction field

const SITLanguage = {

    // =======================================================================
    // EVALUATION:  code tree -> item stream
    // =======================================================================

    /**
     * Evaluate a code tree to a flat item stream.
     *
     * @param {object} node   the code
     * @param {number} [unit] degrees per angle unit (360 / rotational family).
     *   Only continuation needs it — it has to know the *real* net turn of its
     *   operand to work out how many repeats close the contour. Everything else
     *   in the algebra is unit-agnostic, so this defaults to 1 (values already
     *   in degrees), which is how the paper's own worked examples read.
     */
    evaluate(node, unit = 1) {
        return this._ev(node, { n: 0, unit });
    },

    _ev(node, st) {
        if (!node || st.n > LEE_MAX_ITEMS) return [];
        switch (node.k) {
            case 'num': {
                st.n++;
                return [{ v: node.a }];
            }
            // ( ) Border / serial structure: plain concatenation.
            case 'seq': {
                const out = [];
                const items = node.items || [];
                for (let i = 0; i < items.length; i++) {
                    const part = this._ev(items[i], st);
                    for (let j = 0; j < part.length; j++) out.push(part[j]);
                }
                return out;
            }
            // { } Chunking: one unbroken unit in every context.
            case 'chunk':
                return [{ chunk: this._ev(node.child, st) }];
            // [ ] Breakdown into elements: strip ONE level of chunking.
            case 'brk': {
                const src = this._ev(node.child, st);
                const out = [];
                for (const it of src) {
                    if (it.chunk) { for (const c of it.chunk) out.push(c); }
                    else out.push(it);
                }
                return out;
            }
            // ⟦ ⟧ Complete breakdown: strip all chunking.
            case 'brkall':
                return this._flatten(this._ev(node.child, st));
            /**
             * PARALLEL continuation — the paper's *vertical* wavy braces, as
             * distinct from the horizontal `⦃ ⦄` of a serial continuation
             * (p. 318: "just as the ⦃ ⦄ symbols are used both in the serial
             * formula for figure 10a and in the parallel formula for figure
             * 10b"). Serial continuation extends a contour; parallel
             * continuation replicates a branch about a COMMON STARTING POINT,
             * each copy taking the previous as its reference base — so the
             * copies fan out at equal angles. That is Table 1's shape I (`~a~`,
             * one information unit: an asterisk), figure 10b's eight-spoke star,
             * and the radial star that figure 10g superimposes a line on.
             *
             * The between-copy angle is the child's own first angle, which is
             * what "the upper angles form the reference bases for the lower"
             * means when there is no trunk above; the count is whatever closes
             * the fan, 360/a.
             */
            case 'parcont': {
                const sub = this._ev(node.child, st);
                if (!sub.length) return [];
                const head = this._flatten(sub)[0];
                const stepUnits = head ? head.v : 0;
                const stepDeg = stepUnits * (st.unit || 1);
                let count = node.n;
                if (!count) {
                    const d = Math.abs(stepDeg);
                    count = d < 1e-9 ? LEE_CONT_STRAIGHT
                        : Math.max(2, Math.min(LEE_CONT_MAX, Math.round(360 / d)));
                }
                st.n += count;
                // A structural marker, not a contour element: it draws nothing
                // and advances nothing (`nostep`), it only fans its child.
                return [{
                    v: 0, hide: true, nostep: true,
                    fan: { sub, count, step: stepUnits, skin: !!node.skin },
                }];
            }
            // ⦃ ⦄ Continuation: repeat until the contour closes.
            case 'cont': {
                const s = this._ev(node.child, st);
                if (!s.length) return s;
                const k = this._closureCount(s, st.unit || 1);
                return this._repeatWhole(s, k, st);
            }
            // · Iteration: each item of the operand, n times over.
            case 'iter':
                return this._iterate(this._ev(node.child, st), node.ns || [2], !!node.cross, st);
            // ; / ᐟ One-sided iteration.
            case 'osi':
                return this._oneSided(node, st);
            // Combination: (a,b)(c,d) = a,c,b,d.
            case 'comb':
                return this._interleave(this._ev(node.a, st), this._ev(node.b, st), st);
            // ∫ Integration: differences -> running totals (relative -> absolute).
            case 'int': {
                const vals = this._flatten(this._ev(node.child, st));
                const out = [{ v: 0, abs: true }];
                let acc = 0;
                for (const it of vals) {
                    acc += it.v;
                    out.push({ v: acc, abs: true, hide: it.hide, out: it.out });
                    st.n++;
                }
                return out;
            }
            // R Reversal: the sequence followed by its reverse (a,b -> a,b,b,a).
            case 'rev': {
                const s = this._ev(node.child, st);
                const out = s.slice();
                for (let i = s.length - 1; i >= 0; i--) out.push(s[i]);
                st.n += s.length;
                return out;
            }
            // ± Left-right variation: the sequence, then its negation.
            case 'pm': {
                const s = node.child ? this._ev(node.child, st) : [{ v: 1 }];
                const out = s.slice();
                for (let i = 0; i < s.length; i++) out.push(this._mapValues(s[i], (x) => -x));
                st.n += s.length;
                return out;
            }
            // + × * ⊛ Operations.
            case 'op':
                return this._binary(node, st);
            // | | Absolute angles.
            case 'abs':
                return this._setFlag(this._ev(node.child, st), 'abs');
            // ⟨ ⟩ Outerproduct: the angle leaves the current plane.
            case 'out':
                return this._setFlag(this._ev(node.child, st), 'out');
            // ‾ Vanishing sign: functions normally, but invisible.
            case 'hide':
                return this._setFlag(this._ev(node.child, st), 'hide');
            // Parallel structure: branches hang off the nodes of the row above.
            case 'par':
                return this._parallel(node, st);
            default:
                return [];
        }
    },

    // --- item-stream helpers -------------------------------------------------

    /**
     * Strip every chunk wrapper, leaving only value items. A parallel
     * continuation expands to the sequence of directions its copies take — that
     * is what an operation on it sees, and it is what makes figure 10g work: the
     * star's radials are the reference axes the line's constant 70° is added to.
     */
    _flatten(items) {
        const out = [];
        for (const it of items) {
            if (it.chunk) { for (const c of this._flatten(it.chunk)) out.push(c); }
            else if (it.fan) {
                for (let i = 0; i < it.fan.count; i++) out.push({ v: (i + 1) * it.fan.step, abs: true });
            } else if (it.field) {
                for (const c of this._flatten(it.field.sub)) out.push(c);
            } else out.push(it);
        }
        return out;
    },

    /** Deep-copy an item, applying `fn` to every numeric value inside it. */
    _mapValues(item, fn) {
        if (item.chunk) return { chunk: item.chunk.map(c => this._mapValues(c, fn)) };
        const copy = Object.assign({}, item);
        copy.v = fn(item.v);
        if (typeof copy.ov === 'number') copy.ov = fn(copy.ov);
        return copy;
    },

    /**
     * Deep-copy an item stream, setting one boolean flag on every value.
     * Descends into the structural markers too — a vanishing sign over a
     * parallel continuation must hide the copies it fans, not merely the marker
     * (figure 10h vanishes a whole star this way).
     */
    _setFlag(items, flag) {
        return items.map(it => {
            if (it.chunk) return { chunk: this._setFlag(it.chunk, flag) };
            const copy = Object.assign({}, it);
            copy[flag] = true;
            if (it.fan) copy.fan = Object.assign({}, it.fan, { sub: this._setFlag(it.fan.sub, flag) });
            if (it.field) {
                copy.field = {
                    base: this._setFlag(it.field.base, flag),
                    sub: this._setFlag(it.field.sub, flag),
                };
            }
            if (it.sub) copy.sub = this._setFlag(it.sub, flag);
            return copy;
        });
    },

    _gcd(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; },

    /** Length both streams must be cycled to before they align (capped). */
    _alignLength(la, lb) {
        if (!la || !lb) return Math.max(la, lb);
        const l = (la / this._gcd(la, lb)) * lb;
        return Math.min(l, LEE_MAX_ITEMS);
    },

    /**
     * Combination rule (p. 316): (a,b)(c,d) = a,c,b,d, and the mixed
     * chunk/border forms fall out of the same interleave once a chunk counts as
     * a single item — {a,b}(c,d) = {a,b},c,{a,b},d.
     */
    _interleave(a, b, st) {
        if (!a.length) return b;
        if (!b.length) return a;
        const l = this._alignLength(a.length, b.length);
        const out = [];
        for (let i = 0; i < l && st.n <= LEE_MAX_ITEMS; i++) {
            out.push(a[i % a.length]);
            out.push(b[i % b.length]);
            st.n += 2;
        }
        return out;
    },

    /**
     * Iteration `·` (p. 316): 3·(a,b) = a,a,b,b (each *item* repeated), while
     * 2·{a,b} = {a,b},{a,b} because a chunk is one item. A sequence of counts
     * zips with the items — (2,3)·(a,b) = a,a,b,b,b — unless the count operand
     * is under a reprisal `/ /`, when every count meets every item:
     * /2,3/·(a,b) = 2·(a),2·(b),3·(a),3·(b).
     */
    _iterate(items, ns, cross, st) {
        if (!items.length || !ns.length) return [];
        const out = [];
        if (cross) {
            for (const n of ns) {
                for (const it of items) {
                    for (let r = 0; r < n && st.n <= LEE_MAX_ITEMS; r++) { out.push(it); st.n++; }
                }
            }
            return out;
        }
        const l = this._alignLength(items.length, ns.length);
        for (let i = 0; i < l && st.n <= LEE_MAX_ITEMS; i++) {
            const n = ns[i % ns.length];
            const it = items[i % items.length];
            for (let r = 0; r < n && st.n <= LEE_MAX_ITEMS; r++) { out.push(it); st.n++; }
        }
        return out;
    },

    /** Repeat a whole sequence k times (used by continuation). */
    _repeatWhole(items, k, st) {
        const out = [];
        for (let i = 0; i < k && st.n <= LEE_MAX_ITEMS; i++) {
            for (const it of items) { out.push(it); st.n++; }
        }
        return out;
    },

    /**
     * How many times a continuation `⦃ … ⦄` repeats. The paper says "until this
     * sequence meets 'something'"; geometrically that is the count which closes
     * the contour, so we take the net heading change of one pass and repeat
     * round(360/Δ) times — `⦃a,4·(0)⦄` with a = 60 gives the hexagon of fig. 10a.
     * A pass with no net turn (a straight run) gets a fixed default.
     */
    _closureCount(items, unit) {
        const vals = this._flatten(items);
        let h = 0;
        for (const it of vals) {
            // In degrees, not raw units: a family-6 code turning by one unit
            // turns by 60°, so it closes in 6 repeats, not 360.
            const deg = it.v * (unit || 1);
            if (it.abs) h = deg; else h += deg;
        }
        const d = Math.abs(h);
        if (d < 1e-9) return LEE_CONT_STRAIGHT;
        const k = Math.round(360 / d);
        if (!isFinite(k) || k < 2) return 2;
        return Math.min(LEE_CONT_MAX, k);
    },

    /**
     * One-sided iteration (p. 316): n elements of one operand per 1 of the
     * other, cycling both until they simultaneously land on a cycle boundary.
     * Reproduces the paper's three worked cases exactly —
     *   3;(a,b)(c,d)   = a,b,a,c,b,a,b,d
     *   2ᐟ(a,b)(c,d,e) = a,c,d,b,e,c,a,d,e,b,c,d,a,e,c,b,d,e
     *   (1,2)ᐟ(a)(b)   = a,b,a,b,b
     * With one operand (the `3;(±) = +,+,+,-` form) the operand is split into
     * its first item and the rest.
     */
    _oneSided(node, st) {
        let a = this._ev(node.a, st);
        let b = node.b ? this._ev(node.b, st) : null;
        if (!b) { b = a.slice(1); a = a.slice(0, 1); }
        if (!a.length || !b.length) return a.concat(b);
        const ns = node.ns && node.ns.length ? node.ns : [2];
        const left = node.side !== 'r';
        const out = [];
        let ia = 0, ib = 0, round = 0;
        while (st.n <= LEE_MAX_ITEMS) {
            const n = ns[round % ns.length];
            const takeA = left ? n : 1;
            const takeB = left ? 1 : n;
            for (let i = 0; i < takeA; i++) { out.push(a[ia % a.length]); ia++; st.n++; }
            for (let i = 0; i < takeB; i++) { out.push(b[ib % b.length]); ib++; st.n++; }
            round++;
            if (ia % a.length === 0 && ib % b.length === 0 && round % ns.length === 0) break;
            if (round > LEE_MAX_ITEMS) break;
        }
        return out;
    },

    /**
     * The operations `+ × * ⊛`, with the paper's distribution rules:
     *   (a,b) + (c,d)  = a+c, b+d                  (elementwise, cycling)
     *   (a,b) + {c,d}  = a+{c,d}, b+{c,d}          (a value meets a chunk...)
     *   a + {b,c}      = {a+b, c}                  (...and lands on its head)
     *   /a,b/ + (c,d)  = {a+c,a+d}, {b+c,b+d}      (reprisal: cross product)
     * `*` is *vector* addition: it composes an in-plane angle with an
     * out-of-plane one into a single direction rather than summing them, which
     * is what makes it "not affect length" (fig. 4). `⊛` superimposes one
     * figure's angles on another's, cycling, and forces absolute angles — the
     * "drawn on a curved surface" operation (fig. 5).
     */
    _binary(node, st) {
        const a = this._ev(node.a, st);
        const b = this._ev(node.b, st);
        if (!a.length) return b;
        if (!b.length) return a;
        const op = node.op;
        if (op === '@') {
            /**
             * ⊛ — addition of coincident angles. Unlike the other four
             * operations this is not arithmetic on two value streams: the paper
             * is explicit that it is a two-stage *construction* (p. 319: "the
             * left-hand pattern must first be constructed before the right-hand
             * pattern can be superimposed on it"; p. 321: "superimposed on it
             * step by step … it is not possible to construct the shape directly
             * from the two substructures"). Its glyph says so too — an
             * intersection sign with an asterisk inside.
             *
             * The generalisation that makes it a rule rather than a special
             * case is in the paper's own gloss: the superimposed figure's
             * angles "form a constant 70 deg with THE ABSOLUTE REFERENCE AXES
             * FORMED BY THE RADIALS of the star". So `| |` — normally "measured
             * from the one fixed base axis" — has its base axis replaced by a
             * *field* derived from the left operand: at each point, the local
             * direction of that figure. Hence:
             *
             *     A ⊛ B  =  build A; trace B with its absolute angles taken
             *               against A's local direction rather than the axis.
             *
             * Nothing here knows about stars. A star's nearest radial to a point
             * is essentially its polar angle, so "constant angle to the local
             * field" becomes "constant angle to the radius vector" — the
             * equiangular spiral, which is exactly what figures 10g/10h draw. A
             * curved contour gives its tangent (figs. 5, 10k/10l — the case the
             * operation was introduced for), and a straight line degenerates to
             * an ordinary constant base axis.
             *
             * Geometry is not available during evaluation, so this emits a
             * structural marker and the turtle does the work. `base` keeps its
             * own vanishing signs: a hidden star still draws nothing but still
             * supplies the field, which is what figure 10h asks for.
             */
            st.n += 2;
            return [{ v: 0, hide: true, nostep: true, field: { base: a, sub: b } }];
        }
        if (node.cross) {
            const out = [];
            for (const x of a) {
                const row = [];
                for (const y of b) { row.push(this._apply(x, y, op)); st.n++; }
                out.push({ chunk: row });
                if (st.n > LEE_MAX_ITEMS) break;
            }
            return out;
        }
        const l = this._alignLength(a.length, b.length);
        const out = [];
        for (let i = 0; i < l && st.n <= LEE_MAX_ITEMS; i++) {
            out.push(this._apply(a[i % a.length], b[i % b.length], op));
            st.n++;
        }
        return out;
    },

    /** Apply one operation to two items (value/value, value/chunk, chunk/chunk). */
    _apply(x, y, op) {
        if (x.chunk && y.chunk) {
            const n = Math.max(x.chunk.length, y.chunk.length);
            const row = [];
            for (let i = 0; i < n; i++) {
                row.push(this._apply(x.chunk[i % x.chunk.length], y.chunk[i % y.chunk.length], op));
            }
            return { chunk: row };
        }
        // a + {b,c} = {a+b, c}: the scalar lands on the chunk's head only.
        if (y.chunk) {
            const row = y.chunk.slice();
            row[0] = this._apply(x, row[0], op);
            return { chunk: row };
        }
        if (x.chunk) {
            const row = x.chunk.slice();
            row[0] = this._apply(row[0], y, op);
            return { chunk: row };
        }
        const merged = Object.assign({}, x);
        // NB: `y.hide` is deliberately NOT propagated. The vanishing sign hides
        // an operand's own contour, not whatever is computed from it — figure
        // 10h is precisely that case, a spiral that survives the star which
        // gave it its directions ("Once the star pattern has transferred its
        // directional function on the line, the star as such can vanish").
        if (op === 'x') merged.v = x.v * y.v;
        else if (op === '*') {
            // Vector addition: an in-plane angle composed with an out-of-plane
            // one gives one 3D direction — keep both components rather than
            // summing incommensurable rotations.
            if (y.out && !x.out) { merged.v = x.v; merged.ov = (x.ov || 0) + y.v; }
            else if (x.out && !y.out) { merged.v = y.v; merged.ov = (y.ov || 0) + x.v; merged.out = false; }
            else merged.v = x.v + y.v;
        } else merged.v = x.v + y.v;    // '+' and '@'
        return merged;
    },

    /**
     * Parallel structure (p. 317). The first row is the trunk; the remaining
     * rows, evaluated ONCE and shared, hang off it as a branch at each node —
     * "the upper angles form the reference bases for the lower [angles] and
     * have common starting points". `every[i]` chooses whether row i attaches
     * at every element or only at genuine nodes (elements with a non-zero
     * angle, i.e. actual corners — which is what makes fig. S's square-of-
     * squares a cube rather than a square at every grain point). `indep[i]`
     * is the ‖ indicator: the branch measures its angles from the absolute
     * base instead of from the parent element.
     */
    _parallel(node, st) {
        const rows = node.rows || [];
        if (!rows.length) return [];
        const trunk = this._ev(rows[0], st);
        if (rows.length === 1) return trunk;
        const rest = {
            k: 'par', rows: rows.slice(1),
            indep: (node.indep || []).slice(1),
            every: (node.every || []).slice(1),
            skin: (node.skin || []).slice(1),
        };
        const sub = this._ev(rest, st);
        if (!sub.length) return trunk;
        const indep = !!(node.indep && node.indep[1]);
        const every = !!(node.every && node.every[1]);
        const skin = !!(node.skin && node.skin[1]);
        // A branch hanging off a VANISHED element vanishes with it. This is the
        // paper's own rule, stated of figure 10d (p. 319): "not only n·(0)
        // itself vanishes but also its further function, this being revealed by
        // the fact that where n·(0) has disappeared, p·(0) has also disappeared.
        // If this had not been so, the formula would have also applied to figure
        // 10e." So the branch density is decided by the trunk's own visibility,
        // not by any heuristic — 10d gets a stroke at each surviving vertex,
        // 10e (nothing vanished) gets one at every element, and Table 1's P and
        // Q get a cluster at each of their trunk's dots. `every` overrides it,
        // giving the non-propagating reading the paper contrasts against.
        const hiddenSub = every ? sub : this._setFlag(sub, 'hide');
        const attach = (items) => items.map(it => {
            if (it.chunk) return { chunk: attach(it.chunk) };
            // A fan is a structural marker, not a node: hang the branch off the
            // nodes *inside* its copies instead.
            if (it.fan) {
                return Object.assign({}, it, {
                    fan: Object.assign({}, it.fan, { sub: attach(it.fan.sub) }),
                });
            }
            const copy = Object.assign({}, it);
            copy.sub = it.hide ? hiddenSub : sub;
            copy.indep = indep;
            copy.skin = skin;
            return copy;
        });
        return attach(trunk);
    },

    // =======================================================================
    // INTERPRETATION:  item stream -> figure
    // =======================================================================

    /**
     * 2D turtle. Every item turns then advances one grain length, drawing
     * unless vanished; `abs` items take their heading from the fixed base axis
     * instead of the previous segment. An item carrying a parallel-structure
     * branch pushes state, walks the branch, and pops.
     *
     * @param {Array} items    evaluated item stream
     * @param {number} unit    degrees per angle unit (360 / rotational family)
     * @returns {Array} marks  [{x1,y1,x2,y2,t}] — t is palette position
     */
    interpret2D(items, unit) {
        const marks = [];
        const st = { x: 0, y: 0, h: 0, n: 0, chain: 0, nextChain: 0, field: null, collect: null };
        const total = Math.max(1, this._countValues(items));
        this._walk2D(items, st, unit, marks, total, 0);
        return this._markDots(marks);
    },

    /**
     * A grain of contour with nothing joined to it is a POINT, not a dash.
     *
     * This is what makes the paper's dot patterns dot patterns. Length is never
     * a primitive here — an edge is `n·(0)`, n repetitions of the angle 0 — and
     * the grain length is a notional infinitesimal, so a lone visible angle
     * between vanished runs shrinks to a point in the limit. Table 1 makes the
     * reading explicit: C is `(n·(0)){‾n·(0)‾}`, five dots in a row, and G is
     * `⦃a⦄{‾n·(0)‾}`, a circle of dots, both drawn from one unbroken trace whose
     * straight runs have vanished. Rendering those as short dashes instead
     * (which is what we did before) turns C into a dashed line and G into a
     * dashed circle — the paper's figures D and 10f respectively, which it
     * distinguishes from C and G.
     *
     * A chain id is carried through the walk and bumped at every gap — a
     * vanished value, a branch boundary, a fan copy — so a singleton chain is
     * exactly a mark with no neighbour.
     *
     * The dot sits at the grain's START, not its end. The paper's own account of
     * figure 3 fixes this: it reads a figure as "the series of angles formed AT
     * EACH DOT, the angles between the dot's connections with the previous dot
     * and the base axis" (p. 310) — so an angle is located at the point the
     * grain leaves from. Two figures turn on it. In Table 1 J the copies of a
     * parallel continuation all leave the same point, so their leading angles
     * coincide there and draw ONE dot rather than four around it (the paper's J
     * is five dots, a centre and four arms). In figure 10e the dot for grain i
     * lands on the attachment point of grain i-1's branch, so a closed polygon
     * still shows a dot at the base of every stroke — which is what it prints.
     */
    _markDots(marks) {
        const runs = new Map();
        for (const m of marks) runs.set(m.chain, (runs.get(m.chain) || 0) + 1);
        for (const m of marks) if (runs.get(m.chain) === 1) m.dot = true;
        return marks;
    },

    _walk2D(items, st, unit, marks, total, depth) {
        for (const it of items) {
            if (st.n > LEE_MAX_MARKS) return;
            if (it.chunk) { this._walk2D(it.chunk, st, unit, marks, total, depth); continue; }
            // ⊛ — build the base figure, then trace the superimposed one in
            // the direction field it induces (see _binary).
            if (it.field) {
                if (depth < LEE_MAX_BRANCH_DEPTH) {
                    const saved = { x: st.x, y: st.y, h: st.h, chain: st.chain };
                    const segs = [];
                    st.collect = segs;
                    st.chain = ++st.nextChain;
                    this._walk2D(it.field.base, st, unit, marks, total, depth + 1);
                    st.collect = null;
                    // The superimposed figure starts where the base did.
                    st.x = saved.x; st.y = saved.y; st.h = saved.h;
                    const outerField = st.field;
                    st.field = this._directionField(segs) || outerField;
                    st.chain = ++st.nextChain;
                    this._walk2D(it.field.sub, st, unit, marks, total, depth + 1);
                    st.field = outerField;
                    st.x = saved.x; st.y = saved.y; st.h = saved.h; st.chain = saved.chain;
                }
                continue;
            }
            // Parallel continuation: fan the child about this point.
            if (it.fan) {
                if (depth < LEE_MAX_BRANCH_DEPTH) {
                    const saved = { x: st.x, y: st.y, h: st.h };
                    const outerChain = st.chain;
                    for (let i = 0; i < it.fan.count; i++) {
                        st.x = saved.x; st.y = saved.y;
                        st.h = saved.h + i * it.fan.step * unit;
                        st.chain = ++st.nextChain;   // each copy is its own run
                        this._walk2D(it.fan.sub, st, unit, marks, total, depth + 1);
                    }
                    st.x = saved.x; st.y = saved.y; st.h = saved.h;
                    st.chain = outerChain;
                }
                continue;
            }
            const deg = it.v * unit;
            // `| |` is measured from the base axis — which ⊛ replaces by a field.
            if (it.abs) st.h = (st.field ? st.field.at(st.x, st.y) : 0) + deg;
            else st.h += deg;
            // The branch hangs off the point the angle is AT — the grain's start,
            // the same point its dot marks (see _markDots) — so it is walked
            // before the grain steps away. In figure 10e that puts the dot
            // exactly at the base of its stroke, and in Table 1 P and Q it makes
            // each trunk dot the centre of its cluster rather than a stray
            // neighbour of it.
            if (it.sub && depth < LEE_MAX_BRANCH_DEPTH) {
                const saved = { x: st.x, y: st.y, h: st.h };
                if (it.indep) st.h = 0;
                // A branch is a side excursion in the TRACE, so it separates the
                // trunk grain before it from the one after: the branch gets its
                // own run, and the trunk resumes on a fresh one.
                //
                // The consequence is the whole point of figure 10e. When every
                // element of a polygon carries a branch, every trunk grain is
                // left alone in its run and therefore draws as a dot — so 10e is
                // an *implicit* polygon, a ring of dots each with a stroke
                // radiating from it, which is exactly what the paper prints. A
                // polygon with a branch at only one vertex keeps its outline,
                // because only that one grain ends up isolated. The rule is
                // emergent rather than a special case, and it is why 10e's
                // literal code (an unvanished polygon) gives 10e's figure.
                st.chain = ++st.nextChain;
                this._walk2D(it.sub, st, unit, marks, total, depth + 1);
                st.x = saved.x; st.y = saved.y; st.h = saved.h;
                st.chain = ++st.nextChain;
            }
            if (!it.nostep) {
                const rad = st.h * Math.PI / 180;
                const nx = st.x + Math.cos(rad);
                const ny = st.y + Math.sin(rad);
                // Collect for a ⊛ field: vanished steps count too.
                if (st.collect) st.collect.push([st.x, st.y, nx, ny]);
                // A vanished grain ends the current run; what follows starts a new one.
                if (it.hide) st.chain = ++st.nextChain;
                else marks.push({ x1: st.x, y1: st.y, x2: nx, y2: ny, chain: st.chain, t: 0.15 + 0.85 * (st.n / total) });
                st.x = nx; st.y = ny; st.n++;
            }
        }
    },

    /**
     * 3D turtle. The state is a direction `d` plus the normal `n` of the plane
     * of the last two segments. A plain (relative) angle rotates `d` about `n`
     * — it stays in the plane, exactly as in 2D. An outerproduct angle ⟨v⟩
     * rotates `d` about `d × n`, i.e. straight out of that plane in the
     * right-hand-rule direction, and the plane's normal becomes `d × n`. That
     * single extra rule is the whole of the paper's 3D machinery (pp. 314-315):
     * "a surface determined by two angles is used as reference base for every
     * following angle".
     *
     * SURFACES. A parallel structure generates its branch code ONCE and hangs
     * the same item stream off every node of the trunk, so the branch copies
     * are structurally identical — a regular grid of points, one row per node.
     * That grid is a parametric surface, and it is how the paper draws its
     * generalised cylinders, cones and vases (Table 1, S-3 and U-1…W): "take an
     * element of the polygon and attach to it…". So besides the drawn segments
     * we return, for each attachment site, the FAMILY of branch strands in trunk
     * order, ready to be lofted into a skin. Reference identity of the shared
     * `sub` array is what groups them, which is exactly the reuse that makes a
     * regularity a regularity in SIT.
     *
     * @returns {{segments: Array, families: Array}}
     *   segments  [{a, b, t, fam}]  drawn grain steps; `fam` indexes families
     *   families  [{skin, strands: [[[x,y,z],…], …]}]  branch grids in trunk order
     */
    interpret3D(items, unit) {
        const out = { segments: [], families: [], _bySub: new Map() };
        const st = {
            p: [0, 0, 0], d: [1, 0, 0], n: [0, 0, 1],
            baseD: [1, 0, 0], baseN: [0, 0, 1], n_: 0,
        };
        const total = Math.max(1, this._countValues(items));
        this._walk3D(items, st, unit, out, total, 0, null, -1);
        delete out._bySub;
        return out;
    },

    _walk3D(items, st, unit, out, total, depth, collect, fam) {
        const segs = out.segments;
        for (const it of items) {
            if (st.n_ > LEE_MAX_MARKS) return;
            if (it.chunk) { this._walk3D(it.chunk, st, unit, out, total, depth, collect, fam); continue; }
            // Parallel continuation: fan the child about this point, in the
            // current plane. The copies are structurally identical, so they form
            // a loftable family exactly as a parallel structure's branches do.
            if (it.fan) {
                if (depth < LEE_MAX_BRANCH_DEPTH) {
                    const saved = { p: st.p, d: st.d, n: st.n };
                    let f = out._bySub.get(it.fan.sub);
                    if (!f) {
                        f = { skin: !!it.fan.skin, strands: [], idx: out.families.length };
                        out._bySub.set(it.fan.sub, f);
                        out.families.push(f);
                    }
                    for (let i = 0; i < it.fan.count; i++) {
                        st.p = saved.p;
                        st.n = saved.n;
                        st.d = this._rot3(saved.d, saved.n, i * it.fan.step * unit);
                        const strand = [st.p];
                        this._walk3D(it.fan.sub, st, unit, out, total, depth + 1, strand, f.idx);
                        if (strand.length > 1) f.strands.push(strand);
                    }
                    st.p = saved.p; st.d = saved.d; st.n = saved.n;
                }
                continue;
            }
            const deg = it.v * unit;
            if (it.out) {
                // ⟨v⟩ — leave the current plane about its in-plane perpendicular.
                // A ⟨0⟩ (or ⟨180⟩) is a straight continuation: the two segments
                // are collinear, so they determine no new surface and the
                // reference plane must be left alone. Rolling it there would
                // corkscrew every `⟨…⟩` around a run of grain steps, which is
                // exactly what a straight edge inside an out-of-plane branch is.
                const spin = Math.abs(((deg % 180) + 180) % 180);
                if (spin > 1e-9) {
                    const axis = this._norm3(this._cross(st.d, st.n));
                    st.d = this._rot3(st.d, axis, deg);
                    st.n = axis;
                }
            } else if (it.abs) {
                st.d = this._rot3(st.baseD, st.baseN, deg);
                st.n = st.baseN.slice();
            } else {
                st.d = this._rot3(st.d, st.n, deg);
            }
            if (typeof it.ov === 'number' && it.ov !== 0) {
                // `*` composed an out-of-plane component onto this direction.
                const ovDeg = it.ov * unit;
                if (Math.abs(((ovDeg % 180) + 180) % 180) > 1e-9) {
                    const axis = this._norm3(this._cross(st.d, st.n));
                    st.d = this._rot3(st.d, axis, ovDeg);
                    st.n = axis;
                }
            }
            if (it.sub && depth < LEE_MAX_BRANCH_DEPTH) {
                const saved = { p: st.p, d: st.d, n: st.n };
                if (it.indep) { st.d = st.baseD.slice(); st.n = st.baseN.slice(); }
                let f = out._bySub.get(it.sub);
                if (!f) {
                    f = { skin: !!it.skin, strands: [], idx: out.families.length };
                    out._bySub.set(it.sub, f);
                    out.families.push(f);
                }
                const strand = [st.p];
                this._walk3D(it.sub, st, unit, out, total, depth + 1, strand, f.idx);
                if (strand.length > 1) f.strands.push(strand);
                st.p = saved.p; st.d = saved.d; st.n = saved.n;
            }
            if (it.nostep) continue;
            const q = [st.p[0] + st.d[0], st.p[1] + st.d[1], st.p[2] + st.d[2]];
            if (!it.hide) {
                segs.push({ a: st.p, b: q, t: 0.15 + 0.85 * (st.n_ / total), fam });
            }
            st.p = q; st.n_++;
            // A vanished step still "functions as an existing element", so it
            // contributes its point to the surface grid even though it draws no
            // segment — a hidden run is a smooth stretch of skin, not a hole.
            if (collect) collect.push(q);
        }
    },

    /**
     * A direction field over a figure's drawn segments: at any point, the
     * direction of the nearest one. This is the reference frame `⊛` substitutes
     * for the fixed base axis (see _binary). Vanished segments are included —
     * the paper's figure 10h keeps the field after the star itself has gone.
     *
     * Sampled down to a bounded number of segments so the per-step nearest query
     * stays cheap; the field is a smooth-ish quantity, so a subsample of a dense
     * figure gives essentially the same directions.
     */
    _directionField(segs) {
        if (!segs || !segs.length) return null;
        const stride = Math.max(1, Math.ceil(segs.length / LEE_FIELD_SAMPLES));
        const s = [];
        for (let i = 0; i < segs.length; i += stride) s.push(segs[i]);
        return {
            /** Direction (degrees) of the segment nearest to (x, y). */
            at(x, y) {
                let best = Infinity, dir = 0;
                for (const g of s) {
                    const ax = g[0], ay = g[1], bx = g[2], by = g[3];
                    const dx = bx - ax, dy = by - ay;
                    const len2 = dx * dx + dy * dy;
                    let t = len2 > 1e-12 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
                    t = t < 0 ? 0 : t > 1 ? 1 : t;
                    const px = x - (ax + t * dx), py = y - (ay + t * dy);
                    const d2 = px * px + py * py;
                    if (d2 < best) { best = d2; dir = Math.atan2(dy, dx) * 180 / Math.PI; }
                }
                return dir;
            },
        };
    },

    _countValues(items) {
        let n = 0;
        for (const it of items) {
            if (it.chunk) n += this._countValues(it.chunk);
            else { n++; if (it.sub) n += this._countValues(it.sub); }
        }
        return n;
    },

    // --- small 3D vector helpers ---
    _cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    },
    _norm3(v) {
        const l = Math.hypot(v[0], v[1], v[2]);
        return l < 1e-12 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
    },
    /** Rodrigues rotation of `v` about unit `axis` by `deg` degrees. */
    _rot3(v, axis, deg) {
        const a = this._norm3(axis);
        const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        const dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
        const cr = this._cross(a, v);
        return this._norm3([
            v[0] * c + cr[0] * s + a[0] * dot * (1 - c),
            v[1] * c + cr[1] * s + a[1] * dot * (1 - c),
            v[2] * c + cr[2] * s + a[2] * dot * (1 - c),
        ]);
    },

    // =======================================================================
    // NOTATION AND INFORMATION LOAD
    // =======================================================================

    /** Render a code tree in (approximately) the paper's notation. */
    notation(node) {
        if (!node) return '';
        const N = (x) => this.notation(x);
        const num = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
        switch (node.k) {
            case 'num': return num(node.a);
            case 'seq': return '(' + (node.items || []).map(N).join(',') + ')';
            case 'chunk': return '{' + N(node.child) + '}';
            case 'brk': return '[' + N(node.child) + ']';
            case 'brkall': return '⟦' + N(node.child) + '⟧';
            case 'cont': return '⦃' + N(node.child) + '⦄';
            case 'parcont': return '≈' + N(node.child) + '≈';   // the vertical wavy braces
            case 'iter': {
                const ns = (node.ns || []).map(num).join(',');
                const m = node.cross ? '/' + ns + '/' : (node.ns && node.ns.length > 1 ? '(' + ns + ')' : ns);
                return m + '·' + N(node.child);
            }
            case 'osi': {
                const ns = (node.ns || []).map(num).join(',');
                const m = node.ns && node.ns.length > 1 ? '(' + ns + ')' : ns;
                return m + (node.side === 'r' ? 'ᐟ' : ';') + N(node.a) + (node.b ? N(node.b) : '');
            }
            case 'comb': return N(node.a) + N(node.b);
            case 'int': return N(node.child) + '∫';
            case 'rev': return 'R' + N(node.child);
            case 'pm': return '±' + (node.child ? N(node.child) : '');
            case 'op': {
                const sym = { '+': '+', 'x': '×', '*': '*', '@': '⊛' }[node.op] || '+';
                const a = node.cross ? '/' + N(node.a).replace(/^\(|\)$/g, '') + '/' : N(node.a);
                return a + sym + N(node.b);
            }
            case 'abs': return '|' + N(node.child) + '|';
            case 'out': return '⟨' + N(node.child) + '⟩';
            case 'hide': return '‾' + N(node.child) + '‾';
            case 'par': {
                const rows = (node.rows || []).map((r, i) => {
                    const bar = i > 0 && node.indep && node.indep[i] ? '‖ ' : '';
                    return bar + N(r);
                });
                return '[' + rows.join(' ↧ ') + ']';
            }
            default: return '';
        }
    },

    /**
     * Structural information load I (pp. 331-332): the number of independent
     * information units in the compact code. The paper is explicit that
     * "3 × ( )" is ONE unit (the operator, its argument-count and its brackets
     * are meaningless apart from each other), that indicators are not units,
     * and that "the value 0, and therefore 0̄ and (0), are not information".
     *
     * Caveat: this is the load of *this* code, not of the figure it draws. We
     * generate codes rather than minimising them, so a redundantly-written
     * figure over-states its load.
     */
    load(node, acc) {
        acc = acc || { values: 0, ops: 0 };
        if (!node) return acc;
        switch (node.k) {
            case 'num': if (node.a !== 0) acc.values++; break;
            case 'seq': (node.items || []).forEach(c => this.load(c, acc)); break;
            case 'chunk': case 'brk': case 'brkall': case 'cont': case 'parcont':
            case 'abs': case 'out': case 'hide':
                this.load(node.child, acc); break;
            case 'iter': acc.ops++; this.load(node.child, acc); break;
            case 'osi': acc.ops++; this.load(node.a, acc); this.load(node.b, acc); break;
            case 'comb': this.load(node.a, acc); this.load(node.b, acc); break;
            case 'int': case 'rev': case 'pm':
                acc.ops++; this.load(node.child, acc); break;
            case 'op': acc.ops++; this.load(node.a, acc); this.load(node.b, acc); break;
            case 'par': (node.rows || []).forEach(r => this.load(r, acc)); break;
        }
        return acc;
    },

    /** Which parts of the language a given code actually uses (for the panel). */
    vocabulary(node, seen) {
        seen = seen || {};
        if (!node) return seen;
        const mark = (s) => { seen[s] = (seen[s] || 0) + 1; };
        switch (node.k) {
            case 'num': break;
            case 'seq': mark('( ) border'); (node.items || []).forEach(c => this.vocabulary(c, seen)); break;
            case 'chunk': mark('{ } chunking'); this.vocabulary(node.child, seen); break;
            case 'brk': mark('[ ] breakdown'); this.vocabulary(node.child, seen); break;
            case 'brkall': mark('⟦ ⟧ full breakdown'); this.vocabulary(node.child, seen); break;
            case 'cont': mark('⦃ ⦄ serial continuation'); this.vocabulary(node.child, seen); break;
            case 'parcont': mark('parallel continuation (rosette)'); this.vocabulary(node.child, seen); break;
            case 'abs': mark('| | absolute angles'); this.vocabulary(node.child, seen); break;
            case 'out': mark('⟨ ⟩ outerproduct'); this.vocabulary(node.child, seen); break;
            case 'hide': mark('‾ vanishing'); this.vocabulary(node.child, seen); break;
            case 'iter': mark(node.cross ? '/ / reprisal · iteration' : '· iteration'); this.vocabulary(node.child, seen); break;
            case 'osi': mark('one-sided iteration'); this.vocabulary(node.a, seen); this.vocabulary(node.b, seen); break;
            case 'comb': mark('combination'); this.vocabulary(node.a, seen); this.vocabulary(node.b, seen); break;
            case 'int': mark('∫ integration'); this.vocabulary(node.child, seen); break;
            case 'rev': mark('R reversal'); this.vocabulary(node.child, seen); break;
            case 'pm': mark('± left-right variation'); this.vocabulary(node.child, seen); break;
            case 'op': {
                mark({ '+': '+ addition', 'x': '× multiplication', '*': '* vector addition', '@': '⊛ coincident angles' }[node.op] || '+ addition');
                if (node.cross) mark('/ / reprisal');
                this.vocabulary(node.a, seen); this.vocabulary(node.b, seen);
                break;
            }
            case 'par':
                mark('parallel structure');
                if ((node.indep || []).some(Boolean)) mark('‖ independence of angles');
                (node.rows || []).forEach(r => this.vocabulary(r, seen));
                break;
        }
        return seen;
    },
};

if (typeof window !== 'undefined') window.SITLanguage = SITLanguage;
if (typeof module !== 'undefined' && module.exports) module.exports = SITLanguage;

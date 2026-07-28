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
//                                                 onto a curved surface
//   plus ONE-SIDED ITERATION (p. 316) {k:'osi', side:'l'|'r'} — n elements of
//   the left operand per 1 of the right (`;`) or vice versa (`ᐟ`).
//
// INDICATORS (9-10, pp. 313-315)
//   ⦃ ⦄ Continuation      {k:'cont'}   repeat "until it meets something"
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
//  * ⊛ (addition of coincident angles) is implemented as cycling elementwise
//    addition onto absolute angles. The paper's worked example has an
//    off-by-one against that reading which its prose does not explain; the
//    geometric effect it is used for (a figure re-drawn on a curved base, so a
//    straight line becomes a spiral — figs. 10g/10j/10l) is reproduced.
//  * The vanishing sign's exception clause ("unless there would be no
//    difference between the situations with and without signs", p. 315) is not
//    modelled; a vanished value is always invisible.
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

const SITLanguage = {

    // =======================================================================
    // EVALUATION:  code tree -> item stream
    // =======================================================================

    /** Evaluate a code tree to a flat item stream. */
    evaluate(node) {
        return this._ev(node, { n: 0 });
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
            // ⦃ ⦄ Continuation: repeat until the contour closes.
            case 'cont': {
                const s = this._ev(node.child, st);
                if (!s.length) return s;
                const k = this._closureCount(s);
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

    /** Strip every chunk wrapper, leaving only value items. */
    _flatten(items) {
        const out = [];
        for (const it of items) {
            if (it.chunk) { for (const c of this._flatten(it.chunk)) out.push(c); }
            else out.push(it);
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

    /** Deep-copy an item stream, setting one boolean flag on every value. */
    _setFlag(items, flag) {
        return items.map(it => {
            if (it.chunk) return { chunk: this._setFlag(it.chunk, flag) };
            const copy = Object.assign({}, it);
            copy[flag] = true;
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
    _closureCount(items) {
        const vals = this._flatten(items);
        let h = 0;
        for (const it of vals) {
            if (it.abs) h = it.v; else h += it.v;
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
            // Coincident-angle addition: cycle the base figure `a` onto `b`,
            // keeping b's length, and read the result as absolute angles.
            const out = [];
            const av = this._flatten(a);
            for (let i = 0; i < b.length && st.n <= LEE_MAX_ITEMS; i++) {
                const base = av[i % av.length];
                out.push(this._apply(b[i], base, op));
                st.n++;
            }
            return this._setFlag(out, 'abs');
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
        if (y.hide) merged.hide = true;
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
        const rest = { k: 'par', rows: rows.slice(1), indep: (node.indep || []).slice(1), every: (node.every || []).slice(1) };
        const sub = this._ev(rest, st);
        if (!sub.length) return trunk;
        const indep = !!(node.indep && node.indep[1]);
        const every = !!(node.every && node.every[1]);
        const attach = (items) => items.map(it => {
            if (it.chunk) return { chunk: attach(it.chunk) };
            if (!every && it.v === 0) return it;
            const copy = Object.assign({}, it);
            copy.sub = sub;
            copy.indep = indep;
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
        const st = { x: 0, y: 0, h: 0, n: 0 };
        const total = Math.max(1, this._countValues(items));
        this._walk2D(items, st, unit, marks, total, 0);
        return marks;
    },

    _walk2D(items, st, unit, marks, total, depth) {
        for (const it of items) {
            if (st.n > LEE_MAX_MARKS) return;
            if (it.chunk) { this._walk2D(it.chunk, st, unit, marks, total, depth); continue; }
            const deg = it.v * unit;
            if (it.abs) st.h = deg; else st.h += deg;
            const rad = st.h * Math.PI / 180;
            const nx = st.x + Math.cos(rad);
            const ny = st.y + Math.sin(rad);
            if (!it.hide) {
                marks.push({ x1: st.x, y1: st.y, x2: nx, y2: ny, t: 0.15 + 0.85 * (st.n / total) });
            }
            st.x = nx; st.y = ny; st.n++;
            if (it.sub && depth < LEE_MAX_BRANCH_DEPTH) {
                const saved = { x: st.x, y: st.y, h: st.h };
                if (it.indep) st.h = 0;
                this._walk2D(it.sub, st, unit, marks, total, depth + 1);
                st.x = saved.x; st.y = saved.y; st.h = saved.h;
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
     * @returns {Array} polylines [{pts:[[x,y,z],…], t0, t1}]
     */
    interpret3D(items, unit) {
        const lines = [];
        const st = {
            p: [0, 0, 0], d: [1, 0, 0], n: [0, 0, 1],
            baseD: [1, 0, 0], baseN: [0, 0, 1], n_: 0,
        };
        const total = Math.max(1, this._countValues(items));
        this._walk3D(items, st, unit, lines, total, 0);
        return lines;
    },

    _walk3D(items, st, unit, segs, total, depth) {
        for (const it of items) {
            if (st.n_ > LEE_MAX_MARKS) return;
            if (it.chunk) { this._walk3D(it.chunk, st, unit, segs, total, depth); continue; }
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
            const q = [st.p[0] + st.d[0], st.p[1] + st.d[1], st.p[2] + st.d[2]];
            if (!it.hide) {
                segs.push({ a: st.p, b: q, t: 0.15 + 0.85 * (st.n_ / total) });
            }
            st.p = q; st.n_++;
            if (it.sub && depth < LEE_MAX_BRANCH_DEPTH) {
                const saved = { p: st.p, d: st.d, n: st.n };
                if (it.indep) { st.d = st.baseD.slice(); st.n = st.baseN.slice(); }
                this._walk3D(it.sub, st, unit, segs, total, depth + 1);
                st.p = saved.p; st.d = saved.d; st.n = saved.n;
            }
        }
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
            case 'chunk': case 'brk': case 'brkall': case 'cont':
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
            case 'cont': mark('⦃ ⦄ continuation'); this.vocabulary(node.child, seen); break;
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

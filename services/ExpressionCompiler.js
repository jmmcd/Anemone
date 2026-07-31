/**
 * ExpressionCompiler — the one place an evolved expression *string* becomes a
 * numeric JS function.
 *
 * Four types compile expressions: AnimatedPattern (x,y,t), PatternGrammar
 * (x,y), PolarCurve (t) and the RadialSurface3D family (theta,phi / a). They
 * had four near-identical copies of the same rewrite-then-`new Function`
 * pipeline, differing only in which rewrites apply and what a failed
 * evaluation returns. Those differences are real and load-bearing, so they are
 * *parameters* here, not smoothed away — see the PRESETS below, which are the
 * documented record of how the four call sites genuinely differ.
 *
 * The rewrite pipeline runs in a fixed order; each call site enables a subset:
 *
 *   1. `fns`               bare `sin(` … → `Math.sin(`
 *   2. `ifpos`             `ifpos(a,b,c)` → `((a) > 0 ? (b) : (c))`
 *   3. `cartesianPolar`    `r` → `Math.sqrt(x*x + y*y)`, `theta` → `Math.atan2(y, x)`
 *   4. `piLiterals`        the grammars' `3.14159` / `6.28318` → `Math.PI` / `2π`
 *   5. `protectedDivision` `/d` and `%d` → guarded against a near-zero divisor
 *
 * Every call site's original order was a subsequence of this one, so the
 * generated source text is unchanged and renders stay pixel-identical.
 *
 * Compiled functions are total: an expression that throws or evaluates to
 * NaN/Infinity yields `fallback` (0 for a pattern/surface value, 1 for a polar
 * radius — a radius of 0 collapses the curve, so PolarCurve wants a unit
 * circle). An expression that will not even compile yields a constant
 * `() => fallback`.
 *
 * NOTE: callers cache the compiled function themselves, keyed by the
 * expression string (so it auto-invalidates when the genome changes). No cache
 * lives here: evolution mints new expressions every generation, so a
 * module-level cache would grow without bound.
 */
const ExpressionCompiler = {

    // Bare math-function names each preset qualifies with `Math.`. Deliberately
    // per-preset: a rewrite is only a no-op if the token cannot appear, and the
    // grammars differ (only the surfaces produce `pow`; only the pattern
    // grammars produce `floor`/`ceil`).
    PATTERN_FNS: ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'floor', 'ceil'],
    SURFACE_FNS: ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'pow'],

    /** Rewrite an expression string to JS source. Exposed for testing. */
    toJS(expression, opts = {}) {
        let js = String(expression);

        for (const fn of (opts.fns || [])) {
            js = js.replace(new RegExp(fn, 'g'), 'Math.' + fn);
        }
        if (opts.ifpos) {
            js = js.replace(/ifpos\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
                '(($1) > 0 ? ($2) : ($3))');
        }
        if (opts.cartesianPolar) {
            js = js.replace(/\br\b/g, 'Math.sqrt(x*x + y*y)')
                   .replace(/\btheta\b/g, 'Math.atan2(y, x)');
        }
        if (opts.piLiterals) {
            js = js.replace(/3\.14159/g, 'Math.PI')
                   .replace(/6\.28318/g, '(2*Math.PI)');
        }
        if (opts.protectedDivision) {
            js = js.replace(/\/([^\/]+)/g, (m, d) => `/(Math.abs(${d}) > 1e-6 ? ${d} : 1.0)`);
            js = js.replace(/%([^%]+)/g,   (m, d) => `%(Math.abs(${d}) > 1e-6 ? ${d} : 1.0)`);
        }
        return js;
    },

    /**
     * Compile `expression` over `varNames` into a total numeric function.
     * `opts` is one of PRESETS (optionally spread with an override).
     */
    compile(expression, varNames, opts = {}) {
        const fallback = (typeof opts.fallback === 'number') ? opts.fallback : 0;
        try {
            const js = this.toJS(expression, opts);
            return new Function(...varNames, `
                try {
                    const result = ${js};
                    return isFinite(result) ? result : ${fallback};
                } catch (e) {
                    return ${fallback};
                }
            `);
        } catch (error) {
            return () => fallback;
        }
    },
};

/**
 * The three genuinely different configurations, one per grammar family.
 * PATTERN is shared by PatternGrammarIndividual and AnimatedPatternIndividual
 * (which differ only in their variable list).
 */
ExpressionCompiler.PRESETS = {
    // x,y(,t) patterns: the full rewrite set. Protected division/modulo keeps a
    // GP-style expression from blowing up on a zero divisor.
    PATTERN: {
        fns: ExpressionCompiler.PATTERN_FNS,
        ifpos: true,
        cartesianPolar: true,
        piLiterals: true,
        protectedDivision: true,
        fallback: 0.0,
    },
    // r(t) polar curves. No protected division: this grammar emits parenthesised
    // sub-expressions the regex cannot balance, so rewriting `/` would mangle
    // most expressions into uncompilable code. Division by zero instead produces
    // Infinity/NaN, which the isFinite guard maps to the fallback.
    POLAR: {
        fns: ExpressionCompiler.PATTERN_FNS,
        piLiterals: true,
        fallback: 1.0,
    },
    // r(theta,phi) radial surfaces: `pow` instead of floor/ceil, and no r/theta
    // substitution (here `theta` is a *variable*, not a derived quantity —
    // rewriting it would destroy the expression).
    SURFACE: {
        fns: ExpressionCompiler.SURFACE_FNS,
        fallback: 0,
    },
};

if (typeof window !== 'undefined') window.ExpressionCompiler = ExpressionCompiler;
if (typeof module !== 'undefined' && module.exports) module.exports = ExpressionCompiler;

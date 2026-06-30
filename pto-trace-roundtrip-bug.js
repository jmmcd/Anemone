/*
 * Standalone reproducer — PTO-js trace is not faithfully serialisable when a
 * generator uses `rnd.choice` over NON-PRIMITIVE values.
 * ============================================================================
 *
 * Run:  node pto-trace-roundtrip-bug.js
 *
 * SUMMARY
 * -------
 * A PTO trace (the genotype) is meant to be a record of random decisions that
 * fully determines the phenotype: replaying the generator against the trace
 * (`op.fixInd(geno)`) should reproduce the same phenotype. That holds for the
 * *same* in-memory trace, but it BREAKS once the trace is deep-copied or
 * serialised (e.g. JSON, structuredClone, save-to-disk) — *if and only if* the
 * generator chose among non-primitive values (arrays/objects), such as the
 * production alternatives of a BNF grammar in grammatical evolution.
 *
 * Replaying a deep-copied trace then silently RESAMPLES every such choice
 * instead of reusing the recorded one, so the phenotype changes. There is no
 * error — the trace just fails to round-trip. This makes PTO solutions that use
 * categorical choices over composite values impossible to persist/reload.
 *
 * EXPECTED:  both generators reproduce 100% after a JSON round-trip.
 * ACTUAL:    `choice` over arrays reproduces ~0%; over primitives, 100%.
 *
 * ROOT CAUSE (two reference-identity comparisons on categorical values)
 * --------------------------------------------------------------------
 * During replay, Tracer.sample() reuses a recorded value only if
 * `dist.matches(traceDist)` is true; otherwise it calls `dist.repair(traceDist)`.
 *
 *   1) Dist.matches(other):  for array-valued args it compares elements with
 *      `a.some((v, j) => v !== b[j])` — i.e. a SHALLOW, reference-identity
 *      comparison. When the args contain nested arrays/objects (e.g. the list of
 *      productions, each production itself an array), a deep-copied trace's args
 *      are equal-by-value but not identical-by-reference, so matches() returns
 *      false and the recorded value is discarded.
 *
 *   2) RandomCat._fineRepair(other):  the fallback then does
 *      `seq.includes(other.val)` (Array.prototype.includes → ===). The recorded
 *      choice `other.val` is a deep-copied array, not reference-present in the
 *      live `seq`, so it's treated as "no longer a valid option" and a fresh
 *      value is sampled at random.
 *
 * Both assume choice VALUES keep their object identity across replays. That is
 * true within one process (a shared grammar object hands back the same array
 * references every call) but false across any copy/serialisation.
 *
 * SUGGESTED FIX
 * -------------
 * Compare categorical values/args structurally (deep value-equality) rather than
 * by reference in Dist.matches() and in the RandomCat repair path — or, more
 * generally, store choices by index into the (deterministic) args list so the
 * recorded decision is a primitive that round-trips. Either makes traces over
 * composite-valued choices serialisable.
 *
 * Reproduced against the esbuild "browser" bundle vendored at
 * vendor/pto-bundle.js (PTO public API: PTO.run(...).{createInd,fixInd}).
 * Upstream maintainers can replace the loader below with their normal import,
 * e.g.  const PTO = require('pto-js');
 */

'use strict';
const fs = require('fs');
const path = require('path');

// ---- Load the vendored bundle and capture its `PTO` export ----------------
// (`var PTO = (() => {...})()` is module-local in the bundle, so evaluate it and
// return PTO. Replace this with your usual import when running upstream.)
const bundlePath = path.join(__dirname, 'vendor', 'pto-bundle.js');
const PTO = new Function(fs.readFileSync(bundlePath, 'utf8') + '\nreturn PTO;')();

// ---- Two generators that differ only in the TYPE of value chosen -----------
// The option lists are globals so their array references are stable across
// generator invocations — exactly how a shared grammar object behaves, and a
// precondition for in-process replay to work at all.
globalThis.COMPOSITE_OPTIONS = [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j']];
globalThis.PRIMITIVE_OPTIONS = ['a', 'b', 'c', 'd', 'e'];

// choice over ARRAYS (mirrors a BNF production list) — the failing case.
function generatorComposite(rnd) {
    let out = '';
    for (let i = 0; i < 5; i++) out += rnd.choice(COMPOSITE_OPTIONS).join('');
    return out;
}
// choice over PRIMITIVES — the control; round-trips fine.
function generatorPrimitive(rnd) {
    let out = '';
    for (let i = 0; i < 5; i++) out += rnd.choice(PRIMITIVE_OPTIONS);
    return out;
}

// ---- Measure reproduction rate of in-process vs serialised replay ----------
function measure(generator, trials) {
    const op = PTO.run(generator, () => 0, {
        solver: 'searchOperators', naming: 'structural', distType: 'fine',
    });
    let sameObject = 0, afterJSON = 0;
    for (let i = 0; i < trials; i++) {
        const sol = op.createInd();
        const original = sol.pheno;

        // (a) replay the SAME trace object — should always reproduce.
        if (op.fixInd(sol.geno).pheno === original) sameObject++;

        // (b) replay a serialised copy of the trace — the bug.
        const copy = JSON.parse(JSON.stringify(sol.geno));
        if (op.fixInd(copy).pheno === original) afterJSON++;
    }
    return { sameObject, afterJSON, trials };
}

const N = 1000;
const composite = measure(generatorComposite, N);
const primitive = measure(generatorPrimitive, N);

const pct = (k) => (100 * k / N).toFixed(1) + '%';
console.log(`\nPTO trace serialisation round-trip (${N} trials each)\n`);
console.log('generator                     in-process replay   after JSON round-trip');
console.log('---------------------------   -----------------   ---------------------');
console.log(`choice over arrays (composite) ${pct(composite.sameObject).padStart(12)}   ${pct(composite.afterJSON).padStart(12)}   <- BUG`);
console.log(`choice over strings (primitive)${pct(primitive.sameObject).padStart(12)}   ${pct(primitive.afterJSON).padStart(12)}`);

const bugPresent = composite.sameObject === N && composite.afterJSON < N && primitive.afterJSON === N;
console.log('\n' + (bugPresent
    ? 'BUG REPRODUCED: composite-valued choices replay in-process but NOT after serialisation.'
    : 'Bug NOT reproduced in this run (composite choices round-tripped) — PTO may be fixed.'));
process.exit(bugPresent ? 1 : 0);

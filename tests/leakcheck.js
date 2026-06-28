/**
 * PTO categorical-crossover leak probe (regression diagnostic)
 *
 *   node tests/leakcheck.js
 *
 * Background. The grammar individuals do GE by letting a PTO generator BE the
 * derivation: it expands a BNF grammar, picking a production with `rnd.choice`
 * at each non-terminal. PTO is supposed to guarantee that, after mutation and
 * crossover, `rnd.choice(seq)` always returns a member of `seq` (repair coerces
 * any replayed value back into the current distribution's support). It mostly
 * does — but fine-mode categorical crossover has a bug:
 *
 *   RandomCat._fineCrossover does `child = this.clone(); child.val =
 *   Math.random()<0.5 ? this.val : other.val;` — it can take the OTHER parent's
 *   value without checking it belongs to `this.seq`. Uniform crossover aligns
 *   genes by structural name; when the two parents have DIFFERENT non-terminals
 *   at the same name (their derivations diverged upstream), the child gets `seq`
 *   from one symbol and `val` from the other (val ∉ seq). On the next fixInd,
 *   Dist.matches() compares only `seq` (not val ∈ seq), accepts it, and the
 *   foreign production flows into the phenotype.
 *
 * This script reproduces that *faithfully* — it drives evolution through only
 * `PTORepresentation.generateRandom / mutate / crossover` (exactly the app path)
 * with a generator identical in shape to patternGrammarGenerator, and counts how
 * often `rnd.choice` returns a value outside the current `choices`.
 *
 * The leak is benign for the app (a foreign token compiles to a constant, so the
 * individual renders flat and is rejected by validate() / not selected), so we do
 * NOT work around it in app code — rnd.choice is the idiomatic, PTO-insulated
 * form. The real fix belongs upstream in PTO (_fineCrossover should constrain
 * child.val to this.seq; and/or matches() should require val ∈ seq). See TODO.md.
 *
 * Exit status: 0 while the leak stays in its known-benign range (and there are no
 * crashes); 1 if it disappears entirely (PTO fixed it — update this probe) or
 * blows past the benign bound (a regression). It is intentionally NOT part of
 * `tests/run.js`, which stays green.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GENERATIONS = 500;
const POP = 20;
const MUTATION_RATE = 0.1;
// The leak sits around ~2%. Flag a regression if it climbs much higher; flag
// "looks fixed" if it vanishes (so we remember to retire the workaround note).
const BENIGN_MAX = 0.10;

// Load the same sources the app/browser loads, into one shared global scope (so
// the structural-naming compiler — which evals the generator in isolation — can
// resolve the top-level `grammar` const and `globalThis`, just as in the app).
const sandbox = {
    console, Math, Date, Array, Object, Function, JSON,
    isFinite, isNaN, Set, Map, WeakMap,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const SOURCES = [
    'vendor/pto-bundle.js',
    'Grammar.js',
    'representations/PTORepresentation.js',
];
let combined = SOURCES.map(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');

// Append the probe: a generator identical in shape to patternGrammarGenerator,
// plus a membership assertion on every rnd.choice, then a driver that evolves a
// population using only PTORepresentation's operators.
combined += `
globalThis.__choices = 0;
globalThis.__violations = 0;
globalThis.__examples = [];

const grammar = Grammar.createImagePatternGrammar();

const probeGenerator = (rnd) => {
    const expand = (symbol, depth) => {
        if (!grammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0 ? grammar.getProductions(symbol) : grammar.shortestProductions(symbol);
        const prod = rnd.choice(choices);
        globalThis.__choices++;
        if (!choices.includes(prod)) {                 // PTO contract violation: prod ∉ seq
            globalThis.__violations++;
            if (globalThis.__examples.length < 5) {
                globalThis.__examples.push(symbol + ' -> [' + prod.join(' ') + ']');
            }
        }
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    return expand('<pattern>', 6);
};

globalThis.__run = function (generations, pop, rate) {
    const rep = new PTORepresentation(probeGenerator);   // defaults: fine + structural
    let population = [];
    for (let i = 0; i < pop; i++) population.push(rep.generateRandom());
    for (let g = 0; g < generations; g++) {
        const next = [];
        while (next.length < pop) {
            const a = population[(Math.random() * population.length) | 0];
            const b = population[(Math.random() * population.length) | 0];
            const [c1, c2] = rep.crossover(a, b);
            next.push(rep.mutate(c1, rate));
            if (next.length < pop) next.push(rep.mutate(c2, rate));
        }
        population = next;
    }
    return { choices: globalThis.__choices, violations: globalThis.__violations, examples: globalThis.__examples };
};
`;

vm.runInContext(combined, sandbox);

let result;
try {
    result = sandbox.__run(GENERATIONS, POP, MUTATION_RATE);
} catch (e) {
    console.error('CRASH while driving PTO operators:', e.message);
    process.exit(1);
}

const rate = result.violations / result.choices;
console.log(`rnd.choice calls:                 ${result.choices}`);
console.log(`out-of-seq returns (PTO leak):    ${result.violations} (${(100 * rate).toFixed(3)}%)`);
if (result.examples.length) console.log('examples:', result.examples);

if (result.violations === 0) {
    console.log('\nNo leak detected — PTO may have fixed _fineCrossover. Revisit this probe and TODO.md.');
    process.exit(1);
}
if (rate > BENIGN_MAX) {
    console.error(`\nLeak rate ${(100 * rate).toFixed(2)}% exceeds benign bound ${(100 * BENIGN_MAX).toFixed(0)}% — regression?`);
    process.exit(1);
}
console.log(`\nLeak present at the expected benign level (≤ ${(100 * BENIGN_MAX).toFixed(0)}%); known PTO bug, not worked around. See TODO.md.`);
process.exit(0);

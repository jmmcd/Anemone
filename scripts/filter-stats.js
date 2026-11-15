#!/usr/bin/env node
/*
 * filter-stats.js — how much user attention do the EA's two filters save?
 *
 * Runs simulated interactive-evolution sessions for every registered type,
 * headlessly through the test harness, and tabulates the counters the real
 * EvolutionaryAlgorithm keeps (EvolutionaryAlgorithm.emptyStats documents them):
 *
 *   - invalid:    candidates rejected by the type's validate() (trivial / broken
 *                 phenotypes the user would otherwise have had to look at)
 *   - duplicate:  candidates rejected because their phenotype had already been
 *                 shown in this run, split into a copy of one of its own parents
 *                 (no-op variation), of a sibling in the same generation, or of
 *                 anything earlier
 *   - geno-dup:   of all candidates, how many were an identical genotype (what a
 *                 genotype-level filter would catch); phenotype-dup minus this is
 *                 NEUTRAL variation — a new trace expressing an old phenotype
 *   - fallbacks:  times 100 attempts produced nothing admissible
 *
 * The counts are of *candidates*, i.e. every individual generated and judged.
 * Since each draw is (roughly) independent, "% of candidates rejected" estimates
 * the % of tiles that an unfiltered EA would have shown and wasted.
 *
 * Elite and locked clones are deliberate copies: they are never candidates and
 * never counted. The numbers come from the app's own EA code, not a re-model.
 *
 * Simulated user: each generation likes k tiles chosen uniformly at random, with
 * k uniform in 1..--max-likes (k = 1 ⇒ mutation only; k ≥ 2 ⇒ crossover +
 * mutation), and with probability --p-none likes nothing (a re-roll). A random
 * user is a neutral stand-in: real users are more consistent, which tends to
 * converge the population and RAISE duplicate rates, so treat these as lower
 * bounds on duplicates.
 *
 * Math.random is replaced by a seeded PRNG (re-seeded per type from --seed and
 * the type name), so a row reproduces exactly when re-run, alone or with others.
 *
 * Usage:
 *   node scripts/filter-stats.js [--runs 10] [--gens 20] [--pop 16] [--rate 0.1]
 *        [--max-likes 4] [--p-none 0.05] [--dedupe phenotype|genotype|off]
 *        [--types Pattern,Grid,...] [--seed 1] [--format text|latex|csv] [--verbose 1]
 *
 * --types takes registry names with or without the "Individual" suffix.
 * LaTeX output puts one type per line so rows can be commented out with %.
 */
'use strict';
const path = require('path');
const { load, INDIVIDUAL_TYPES } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

// ---- args -----------------------------------------------------------------
const opts = {
    runs: 10, gens: 20, pop: 16, rate: 0.1, 'max-likes': 4, 'p-none': 0.05,
    dedupe: 'phenotype', types: null, seed: 1, format: 'text', verbose: 0,
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([\w-]+)$/);
    if (!m || !(m[1] in opts)) { console.error(`unknown argument: ${argv[i]}`); process.exit(2); }
    const v = argv[++i];
    opts[m[1]] = typeof opts[m[1]] === 'number' ? Number(v) : v;
}

// ---- seeded randomness ------------------------------------------------------
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function strSeed(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
// The harness hands the host's Math to the sandbox, so this reaches every
// generator, operator and PTO distribution.
const reseed = (name) => { Math.random = mulberry32((opts.seed * 0x9E3779B1) ^ strSeed(name)); };

// ---- run ----------------------------------------------------------------------
reseed('harness-load');
const env = load();
env.sandbox.console.warn = () => {};     // the EA warns on each fallback; we count them instead
const EA = env.EvolutionaryAlgorithm;
// Set the level before any EA is built, so generation 0 is filtered under it too.
if (!EA.DEDUPE_LEVELS.includes(opts.dedupe)) { console.error(`--dedupe must be one of ${EA.DEDUPE_LEVELS}`); process.exit(2); }
EA.DEFAULT_DEDUPE = opts.dedupe;

const wanted = opts.types && new Set(opts.types.split(',').map(t => t.trim().replace(/Individual$/, '') + 'Individual'));
const types = INDIVIDUAL_TYPES.filter(t => !wanted || wanted.has(t.name));
if (wanted && types.length !== wanted.size) {
    const known = new Set(INDIVIDUAL_TYPES.map(t => t.name));
    console.error('unknown type(s): ' + [...wanted].filter(n => !known.has(n)).join(', '));
    process.exit(2);
}

function addInto(total, s) {
    for (const src of Object.keys(s)) for (const k of Object.keys(s[src])) total[src][k] += s[src][k];
}

function simulate(type) {
    const cls = env.classes[type.name];
    reseed(type.name);
    const total = EA.emptyStats();
    let likes = 0, evolves = 0;
    const t0 = Date.now();
    for (let r = 0; r < opts.runs; r++) {
        const ea = new EA(cls, opts.pop);
        ea.mutationRate = opts.rate;
        for (let g = 0; g < opts.gens; g++) {
            if (Math.random() >= opts['p-none']) {
                const k = 1 + Math.floor(Math.random() * Math.min(opts['max-likes'], ea.population.length));
                const idx = [...ea.population.keys()];
                for (let i = 0; i < k; i++) {
                    const j = i + Math.floor(Math.random() * (idx.length - i));
                    [idx[i], idx[j]] = [idx[j], idx[i]];
                    ea.toggleLike(ea.population[idx[i]]);
                }
                likes += k;
            }
            const tg = Date.now();
            ea.evolve();
            evolves++;
            if (opts.verbose) console.error(`  ${type.name} run ${r} gen ${g}: ${Date.now() - tg} ms, heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`);
        }
        ea.stopAllPlayback();
        addInto(total, ea.stats);
    }
    return { type, stats: total, seconds: (Date.now() - t0) / 1000, meanLikes: likes / evolves };
}

// ---- summarise ----------------------------------------------------------------
function summarise({ type, stats, seconds }) {
    const all = EA.emptyStats().init;   // a blank row to sum into
    for (const s of Object.values(stats)) for (const k of Object.keys(all)) all[k] += s[k];
    const bred = EA.emptyStats().init;
    for (const s of [stats.mutation, stats.crossover]) for (const k of Object.keys(bred)) bred[k] += s[k];
    const pct = (n, d) => (d ? 100 * n / d : NaN);
    const dup = all.dupParent + all.dupSibling + all.dupEarlier;
    return {
        name: type.name.replace(/Individual$/, ''),
        label: type.label,
        hidden: !!type.hidden,
        candidates: all.candidates,
        accepted: all.accepted,
        invalid: pct(all.invalid, all.candidates),
        invalidInit: pct(stats.init.invalid, stats.init.candidates),
        invalidBred: pct(bred.invalid, bred.candidates),
        dup: pct(dup, all.candidates),
        dupParent: pct(all.dupParent, all.candidates),
        dupSibling: pct(all.dupSibling, all.candidates),
        dupEarlier: pct(all.dupEarlier, all.candidates),
        genoDup: pct(all.genoDup, all.candidates),
        neutral: pct(all.phenoDup - all.genoDup, all.candidates),
        rejected: pct(all.invalid + dup, all.candidates),
        attempts: all.accepted ? all.candidates / all.accepted : NaN,
        fallbacks: all.fallbacks,
        seconds,
    };
}

const COLS = [
    ['name', 'Type', 0],
    ['candidates', 'cand', 0],
    ['invalid', 'inv%', 1],
    ['invalidInit', 'inv%init', 1],
    ['invalidBred', 'inv%bred', 1],
    ['dup', 'dup%', 1],
    ['dupParent', 'parent', 1],
    ['dupSibling', 'sibling', 1],
    ['dupEarlier', 'earlier', 1],
    ['genoDup', 'genoDup%', 1],
    ['neutral', 'neutral%', 1],
    ['rejected', 'saved%', 1],
    ['attempts', 'tries', 2],
    ['fallbacks', 'fallbk', 0],
    ['seconds', 'secs', 1],
];
const fmt = (v, d) => (typeof v === 'number' ? (Number.isNaN(v) ? '–' : v.toFixed(d)) : String(v));

const header = `% filter-stats: runs=${opts.runs} gens=${opts.gens} pop=${opts.pop} rate=${opts.rate} ` +
    `max-likes=${opts['max-likes']} p-none=${opts['p-none']} dedupe=${opts.dedupe} seed=${opts.seed}`;

const rows = [];
function emit(row) {
    rows.push(row);
    if (opts.format === 'text') {
        if (rows.length === 1) {
            console.log(header.slice(2));
            console.log('(all % are of candidates; dup% = parent + sibling + earlier; saved% = inv% + dup%)\n');
            console.log(COLS.map(([, h], i) => i ? h.padStart(9) : h.padEnd(42)).join(''));
        }
        console.log(COLS.map(([k, , d], i) => i ? fmt(row[k], d).padStart(9) : (row[k] + (row.hidden ? '*' : '')).padEnd(42)).join(''));
    }
}

for (const type of types) {
    try {
        emit(summarise(simulate(type)));
    } catch (e) {
        console.error(`${type.name}: ${e && e.stack || e}`);
    }
}

if (opts.format === 'csv') {
    console.log(['label', ...COLS.map(c => c[0])].join(','));
    for (const r of rows) console.log([JSON.stringify(r.label), ...COLS.map(([k, , d]) => k === 'name' ? r.name : fmt(r[k], d))].join(','));
} else if (opts.format === 'latex') {
    // A compact paper table. Invalid + the three duplicate columns sum to Saved
    // (each candidate is counted once: duplicates are checked before validity).
    // Neutral sits apart because it is NOT additive: it is the part of the
    // duplicates that a genotype-only filter would have missed (new trace, old
    // phenotype). Comment rows out with %.
    console.log(header);
    console.log('\\begin{tabular}{lrrrrrr|r}');
    console.log('\\toprule');
    console.log('Type & Invalid & \\multicolumn{4}{c}{Duplicate (phenotype)} & Saved & Neutral \\\\');
    console.log('     &         & parent & sibling & earlier & total &       &         \\\\');
    console.log('\\midrule');
    const p = (v) => (Number.isNaN(v) ? '--' : v.toFixed(1));
    for (const r of rows) {
        console.log(`${r.label.replace(/[&%_#]/g, m => '\\' + m)} & ${p(r.invalid)} & ${p(r.dupParent)} & ${p(r.dupSibling)} & ${p(r.dupEarlier)} & ${p(r.dup)} & ${p(r.rejected)} & ${p(r.neutral)} \\\\`);
    }
    console.log('\\bottomrule');
    console.log('\\end{tabular}');
} else if (rows.some(r => r.hidden)) {
    console.log('\n* hidden from the type menu');
}

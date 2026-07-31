#!/usr/bin/env node
/**
 * Anemone test runner — dependency-free smoke + regression tests.
 *
 * Run with:  node tests/run.js
 * Exits non-zero if any test fails.
 *
 * Covers, for every individual type:
 *   - the genetic operators (construct / mutate / crossover / clone)
 *   - the render path (visualize() against a stubbed canvas, before and after mutation)
 * Plus targeted regression tests (e.g. Sheep neural-network phenotype).
 */
const fs = require('fs');
const path = require('path');
const { load, INDIVIDUAL_CLASSES, INDIVIDUAL_TYPES } = require('./harness');

let passed = 0, failed = 0;
const failures = [];

function check(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        failures.push(`${name}: ${e.message}`);
        console.log(`  ✗ ${name} — ${e.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

const { classes, makeCanvas, SITLanguage, ExpressionCompiler, Individual, psRandom } = load();

// --- Individual-type registry (IndividualRegistry.js is the single source of truth) ---
// These tests convert the previously-silent "forgot to register / forgot a
// <script> tag" failures into loud test failures. See CLAUDE.md > Testing.
console.log('\nIndividual-type registry:');
{
    const ROOT = path.join(__dirname, '..');
    // Concrete individual classes only; these two are abstract base classes that
    // match *Individual.js but are intentionally not registered.
    const ABSTRACT_BASES = new Set(['Individual', 'RadialSurface3DIndividual']);

    check('every registry entry resolves to an Individual subclass', () => {
        for (const t of INDIVIDUAL_TYPES) {
            const C = classes[t.name];
            assert(typeof C === 'function', `registry entry ${t.name} is not a loaded class`);
            assert(typeof t.label === 'string' && t.label.length > 0, `${t.name} needs a label`);
        }
    });

    check('every *Individual.js on disk is registered (no orphan types)', () => {
        const names = new Set(INDIVIDUAL_TYPES.map(t => t.name));
        const skipDirs = new Set(['.git', 'node_modules', 'vendor', 'tests', 'scripts', 'movies', 'data', 'img', 'assets']);
        const orphans = [];
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isDirectory()) { if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name)); continue; }
                const m = entry.name.match(/^(.+Individual)\.js$/);
                if (!m || ABSTRACT_BASES.has(m[1]) || names.has(m[1])) continue;
                orphans.push(entry.name);
            }
        })(ROOT);
        assert(orphans.length === 0, `unregistered individual file(s): ${orphans.join(', ')} — add to IndividualRegistry.js`);
    });

    check('every registry entry has a <script> tag in index.html', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const missing = INDIVIDUAL_TYPES.filter(t => !new RegExp(`src=["'][^"']*${t.name}\\.js["']`).test(html));
        assert(missing.length === 0, `no <script> tag for: ${missing.map(t => t.name).join(', ')}`);
    });
}

// --- Framework hotkey table (framework/Hotkeys.js) ---
// The framework files aren't in the harness sandbox (they need a real DOM), but
// the class *declaration* + the partial-class prototype merges run in a bare vm
// with no DOM, so we can assert the split didn't drop methods and that the
// declarative hotkey table reproduces the old if/else dispatch.
console.log('\nFramework hotkey table + partial-class split:');
{
    const vm = require('vm');
    const FILES = ['Anemone.js', 'Shared3D.js', 'Lightbox.js', 'ExportManager.js', 'Hotkeys.js'];
    let src = '';
    for (const f of FILES) src += fs.readFileSync(path.join(__dirname, '..', 'framework', f), 'utf8') + '\n';
    src += ';globalThis.__F = InteractiveEAFramework;';
    const ctx = { console: { log() {}, warn() {}, error() {}, time() {}, timeEnd() {} }, Math, Object, Function, JSON, parseInt };
    vm.createContext(ctx);
    let F = null;
    check('the five framework files load and merge onto one prototype', () => {
        vm.runInContext(src, ctx, { filename: 'framework-concat.js' });
        F = ctx.__F;
        assert(typeof F === 'function', 'InteractiveEAFramework not defined');
    });

    check('partial classes contributed their methods (nothing dropped in the split)', () => {
        const P = F.prototype;
        // A representative method from each partial file + a few that stayed.
        for (const m of ['addMeshToScene', 'renderMeshToCanvas', 'cleanupShared3D',      // Shared3D
                         'openZoom', 'closeZoom', 'togglePlayPauseOrRotation',            // Lightbox
                         'setupEditing', 'teardownEditing',                               // Lightbox (intervention)
                         'saveCurrentImage', 'exportCurrentSTL', 'placeLoadedIndividual', // ExportManager
                         'evolveGeneration', '_handleKeydown', '_hotkeyContext',          // Hotkeys
                         'loadExtensions', 'render', 'switchIndividualType']) {           // stayed
            assert(typeof P[m] === 'function', `prototype missing ${m}`);
        }
        assert(P.constructor === F, 'constructor was clobbered by a prototype merge');
    });

    check('every hotkey binding is well formed', () => {
        assert(Array.isArray(F.HOTKEYS) && F.HOTKEYS.length > 0, 'HOTKEYS missing');
        for (const b of F.HOTKEYS) {
            assert(Array.isArray(b.keys) && b.keys.length > 0, 'binding needs keys[]');
            assert(typeof b.desc === 'string' && b.desc, 'binding needs a description (for the ? overlay)');
            assert(typeof b.group === 'string' && b.group, 'binding needs a group');
            assert(typeof b.run === 'function', 'binding needs run()');
            assert(!b.when || typeof b.when === 'function', 'when must be a predicate');
        }
    });

    check('the table reproduces the old context-sensitive dispatch', () => {
        // First binding whose key matches and whose when() holds — the dispatcher's rule.
        const pick = (key, c) => F.HOTKEYS.find(b => b.keys.includes(key) && (!b.when || b.when(c)));
        const seq = { sequencer: true, animatedPattern: false };
        const anim = { sequencer: false, animatedPattern: true };
        const def = { sequencer: false, animatedPattern: false };
        const cases = [
            ['[', seq, 'Step sequencer'], [']', seq, 'Step sequencer'],
            ['[', anim, 'Animated pattern'], ['[', def, '3D camera'],
            ['.', anim, 'Animated pattern'], ['.', seq, 'Playback'], ['.', def, 'Playback'],
            ['-', def, '3D camera'], [' ', def, 'General'],
            ['a', def, 'General'], ['F', def, 'General'], ['Escape', def, 'General'],
        ];
        for (const [k, c, g] of cases) {
            const e = pick(k, c);
            assert(e, `no binding for "${k}"`);
            assert(e.group === g, `"${k}" in ${JSON.stringify(c)} → ${e.group}, expected ${g}`);
        }
    });
}

// --- Genetic operators ---
console.log('\nGenetic operators (construct / mutate / crossover / clone):');
for (const name of INDIVIDUAL_CLASSES) {
    check(name, () => {
        const C = classes[name];
        assert(typeof C === 'function', 'class not loaded');

        const a = new C();
        const b = new C();
        assert(a.genome != null, 'genome not initialised');

        a.mutate(0.5); // high rate to exercise the path

        const children = a.crossover(b);
        assert(Array.isArray(children) && children.length === 2, 'crossover must return 2 children');
        assert(children[0] instanceof C && children[1] instanceof C, 'children must be same type');
        assert(children[0].genome != null && children[1].genome != null, 'child genome missing');

        a.fitness = 0.42;
        const clone = a.clone();
        assert(clone instanceof C, 'clone must be same type');
        assert(clone.fitness === 0.42, 'clone must preserve fitness');
        assert(clone !== a, 'clone must be a distinct individual');
        // Cloning must be safe to evolve independently. (PTO-backed individuals
        // intentionally share the immutable genome/trace with their clone, so we
        // assert the safety contract — isolation — not object distinctness.)
        const originalPheno = a.phenotype;
        clone.mutate(1.0);
        assert(a.phenotype === originalPheno, 'mutating a clone must not change the original');
    });
}

// --- Render path ---
console.log('\nRender path (visualize before and after mutation):');
for (const name of INDIVIDUAL_CLASSES) {
    check(name, () => {
        const C = classes[name];
        const ind = new C();
        const canvas = makeCanvas(48, 48);
        ind.visualize(canvas);
        ind.mutate(0.5);
        ind.visualize(canvas);
    });
}

// --- Validation / evolutionary filtering ---
console.log('\nValidation / evolutionary filtering:');
check('PatternIndividual.validate() rejects constant expressions', () => {
    const env = load();
    const ind = new env.classes.PatternIndividual();
    // validate() reads this.phenotype (the built tree); force a constant-only tree.
    Object.defineProperty(ind, 'phenotype', { value: new env.TerminalNode(42), configurable: true });
    assert(ind.validate() === false, 'constant terminal should be rejected');
});
check('PatternGrammarIndividual.validate() rejects constant expressions', () => {
    const ind = new classes.PatternGrammarIndividual();
    ind.getPhenotype = () => '1.0';
    assert(ind.validate() === false, 'constant grammar expression should be rejected');
});
check('PolarCurveIndividual.validate() rejects expressions without t', () => {
    const ind = new classes.PolarCurveIndividual();
    ind.getPhenotype = () => '2.0';
    assert(ind.validate() === false, 'polar expression without t should be rejected');
});
check('EvolutionaryAlgorithm fills the population with valid individuals', () => {
    class FlakyPattern extends classes.PatternIndividual {
        static validationAttempts = 0;

        validate() {
            FlakyPattern.validationAttempts += 1;
            return FlakyPattern.validationAttempts > 1;
        }
    }

    const env = load();
    const algorithm = new env.EvolutionaryAlgorithm(FlakyPattern, 3);
    assert(algorithm.population.length === 3, 'population should be filled to the requested size');
    assert(algorithm.population.every(ind => ind.validate()), 'population should contain only valid individuals');
});

// --- Capability flags ---
console.log('\nCapability flags:');
const expectedPalette = {
    PatternIndividual: true, PatternGrammarIndividual: true,
    PolarCurveIndividual: true, ShapesIndividual: true,
    SuperShapeIndividual: true, SuperShape3DIndividual: true,
    AnemoneIndividual: true,
    GridIndividual: true, RobotIndividual: false,
    HoxCreatureIndividual: true,
    SheepIndividual: false, PenroseIndividual: false,
    MelodyIndividual: true, MouseMusicIndividual: false, EEGSonificationIndividual: false,
};
check('usesColorPalette() matches expectation', () => {
    for (const [name, expect] of Object.entries(expectedPalette)) {
        const ind = new classes[name]();
        assert(ind.usesColorPalette() === expect, `${name}.usesColorPalette() should be ${expect}`);
    }
});
check('only the 3D types report is3D()', () => {
    // The 3D types are the RadialSurface3DIndividual subclasses plus the Jenn
    // polytope visualiser and the 3D Leeuwenberg code (all ride the shared
    // Three.js pipeline).
    const threeD = new Set([
        'SuperShape3DIndividual', 'PetalSphere3DIndividual',
        'FreeSurface3DIndividual', 'WarpedSurface3DIndividual',
        'JennPolytopeIndividual', 'SITCode3DIndividual',
        'EndlessFormsIndividual',
    ]);
    for (const name of INDIVIDUAL_CLASSES) {
        const ind = new classes[name]();
        const expect = threeD.has(name);
        assert(ind.is3D() === expect, `${name}.is3D() should be ${expect}`);
    }
});

check('Jenn polytope vertex tables recover the known 1-skeletons', () => {
    // The precomputed 4D vertex sets are validated by the edge count that
    // nearest-neighbour recovery produces — the canonical invariant of each
    // regular polychoron. A wrong coordinate set would shift these.
    const { jennGeometry, JENN_EDGE_COUNTS, JENN_POLYTOPES } = load();
    const expectVerts = { the_5_cell: 5, the_8_cell: 16, the_16_cell: 8, the_24_cell: 24, the_600_cell: 120 };
    const expectFaces = { the_5_cell: 10, the_8_cell: 24, the_16_cell: 32, the_24_cell: 96, the_600_cell: 1200 };
    for (const shape of JENN_POLYTOPES) {
        const { verts, edges, faces } = jennGeometry(shape);
        assert(verts.length === expectVerts[shape], `${shape}: ${verts.length} verts, expected ${expectVerts[shape]}`);
        assert(edges.length === JENN_EDGE_COUNTS[shape], `${shape}: ${edges.length} edges, expected ${JENN_EDGE_COUNTS[shape]}`);
        assert(faces.length === expectFaces[shape], `${shape}: ${faces.length} faces, expected ${expectFaces[shape]}`);
        // Face polygons must close: consecutive vertices (cyclically) are edges.
        const edgeSet = new Set(edges.map(([a, b]) => a < b ? `${a},${b}` : `${b},${a}`));
        for (const f of faces)
            for (let i = 0; i < f.length; i++) {
                const a = f[i], b = f[(i + 1) % f.length];
                assert(edgeSet.has(a < b ? `${a},${b}` : `${b},${a}`), `${shape}: face edge ${a}-${b} not in edge set`);
            }
        // Every vertex must sit on the unit 3-sphere.
        for (const v of verts) {
            const r = Math.hypot(v[0], v[1], v[2], v[3]);
            assert(Math.abs(r - 1) < 1e-9, `${shape}: vertex off S³ (r=${r})`);
        }
    }
});

check('Jenn grand antiprism carves two orthogonal decagons out of the 600-cell', () => {
    // Semiregular polychoron = 600-cell minus a decagon–decagon (20 verts). The
    // survivors keep the single 600-cell edge length, so nearest-neighbour
    // recovery must land on exactly 100 verts / 500 edges (its known 1-skeleton),
    // and its recovered faces (antiprism/tetrahedron triangles) must all close.
    const { jennGeometry } = load();
    const { verts, edges, faces } = jennGeometry('the_grand_antiprism');
    assert(verts.length === 100, `grand antiprism: ${verts.length} verts, expected 100`);
    assert(edges.length === 500, `grand antiprism: ${edges.length} edges, expected 500`);
    const edgeSet = new Set(edges.map(([a, b]) => a < b ? `${a},${b}` : `${b},${a}`));
    for (const f of faces)
        for (let i = 0; i < f.length; i++) {
            const a = f[i], b = f[(i + 1) % f.length];
            assert(edgeSet.has(a < b ? `${a},${b}` : `${b},${a}`), `grand antiprism: face edge ${a}-${b} not in edge set`);
        }
    for (const v of verts) assert(Math.abs(Math.hypot(v[0], v[1], v[2], v[3]) - 1) < 1e-9, 'grand antiprism: vertex off S³');
});

check('Jenn duoprisms {p}×{q} build p·q verts, 2p·q edges, p·q square faces', () => {
    // Parametric family: the Cartesian product of a p-gon and a q-gon. Explicit
    // (not distance-recovered) edges/faces, so the p≠q case (two edge lengths)
    // keeps both edge families. Faces are squares in cyclic (closing) order.
    const { jennGeometry } = load();
    for (const [p, q] of [[3, 3], [10, 4], [6, 12], [5, 8]]) {
        const { verts, edges, faces } = jennGeometry('the_duoprism', p, q);
        assert(verts.length === p * q, `${p}×${q}: ${verts.length} verts, expected ${p * q}`);
        assert(edges.length === 2 * p * q, `${p}×${q}: ${edges.length} edges, expected ${2 * p * q}`);
        assert(faces.length === p * q, `${p}×${q}: ${faces.length} faces, expected ${p * q}`);
        const edgeSet = new Set(edges.map(([a, b]) => a < b ? `${a},${b}` : `${b},${a}`));
        for (const f of faces) {
            assert(f.length === 4, `${p}×${q}: non-square face`);
            for (let i = 0; i < 4; i++) {
                const a = f[i], b = f[(i + 1) % 4];
                assert(edgeSet.has(a < b ? `${a},${b}` : `${b},${a}`), `${p}×${q}: face edge ${a}-${b} not in edge set`);
            }
        }
        for (const v of verts) assert(Math.abs(Math.hypot(v[0], v[1], v[2], v[3]) - 1) < 1e-9, `${p}×${q}: vertex off S³`);
    }
});

// --- Leeuwenberg 1971 coding language (SITLanguage.js) ---
// The paper states the value of almost every rule as a worked example, so those
// examples ARE the regression suite: each assertion below is a literal quote
// from Leeuwenberg (1971), pp. 312-317. If one of these fails, the language has
// drifted from the paper — which is the whole claim of the two SITCode types.
console.log('\nLeeuwenberg coding language (worked examples from the paper):');
{
    // Letters stand for distinct values, as in the paper: a=1 b=2 c=3 d=4 e=5.
    const num = (a) => ({ k: 'num', a });
    const seq = (...items) => ({ k: 'seq', items });
    const chunk = (child) => ({ k: 'chunk', child });
    const A = num(1), B = num(2), C = num(3), D = num(4), E = num(5);
    // Serialise an item stream the way the paper writes it: chunks in braces.
    const show = (items) => items.map(function f(it) {
        return it.chunk ? '{' + it.chunk.map(f).join(',') + '}' : String(it.v);
    }).join(',');
    const ev = (node) => show(SITLanguage.evaluate(node));
    const paper = (label, node, expected) => check(label, () => {
        const got = ev(node);
        assert(got === expected, `got ${got}, paper says ${expected}`);
    });

    // Information units (p. 312).
    paper('∫  (3,2,5)∫ = 0,3,5,10',
        { k: 'int', child: seq(num(3), num(2), num(5)) }, '0,3,5,10');
    paper('R  R{3,2,5} = 3,2,5,5,2,3',
        { k: 'rev', child: seq(num(3), num(2), num(5)) }, '3,2,5,5,2,3');
    paper('±  ±(90) = 90,-90',
        { k: 'pm', child: num(90) }, '90,-90');

    // Combination (p. 316) — one interleave rule covers all three forms.
    paper('(a,b)(c,d) = a,c,b,d',
        { k: 'comb', a: seq(A, B), b: seq(C, D) }, '1,3,2,4');
    paper('(a,b){c,d} = a,{c,d},b,{c,d}',
        { k: 'comb', a: seq(A, B), b: chunk(seq(C, D)) }, '1,{3,4},2,{3,4}');
    paper('{a,b}(c,d) = {a,b},c,{a,b},d',
        { k: 'comb', a: chunk(seq(A, B)), b: seq(C, D) }, '{1,2},3,{1,2},4');

    // Operations and their distribution rules (p. 316).
    paper('(a,b)+(c,d) = a+c,b+d',
        { k: 'op', op: '+', a: seq(A, B), b: seq(C, D) }, '4,6');
    paper('(a,b)+{c,d} = a+{c,d},b+{c,d}  (and a+{b,c} = {a+b,c})',
        { k: 'op', op: '+', a: seq(A, B), b: chunk(seq(C, D)) }, '{4,4},{5,4}');
    paper('/a,b/+(c,d) = {a+c,a+d},{b+c,b+d}   (reprisal)',
        { k: 'op', op: '+', cross: true, a: seq(A, B), b: seq(C, D) }, '{4,5},{5,6}');

    // Iteration (p. 316).
    paper('3·(a,b) = a,a,a,b,b,b',
        { k: 'iter', ns: [3], child: seq(A, B) }, '1,1,1,2,2,2');
    paper('2·{a,b} = {a,b},{a,b}',
        { k: 'iter', ns: [2], child: chunk(seq(A, B)) }, '{1,2},{1,2}');
    paper('(2,3)·(a,b) = 2·(a),3·(b)',
        { k: 'iter', ns: [2, 3], child: seq(A, B) }, '1,1,2,2,2');
    paper('/2,3/·(a,b) = 2·(a),2·(b),3·(a),3·(b)   (reprisal)',
        { k: 'iter', ns: [2, 3], cross: true, child: seq(A, B) }, '1,1,2,2,1,1,1,2,2,2');

    // One-sided iteration (p. 316) — the fiddliest rule in the paper, and the
    // one whose three examples pin the definition down completely.
    paper('3;(a,b)(c,d) = a,b,a,c,b,a,b,d',
        { k: 'osi', side: 'l', ns: [3], a: seq(A, B), b: seq(C, D) }, '1,2,1,3,2,1,2,4');
    paper('2ᐟ(a,b)(c,d,e) = a,c,d,b,e,c,a,d,e,b,c,d,a,e,c,b,d,e',
        { k: 'osi', side: 'r', ns: [2], a: seq(A, B), b: seq(C, D, E) },
        '1,3,4,2,5,3,1,4,5,2,3,4,1,5,3,2,4,5');
    paper('(1,2)ᐟ(a)(b) = a,b,a,b,b',
        { k: 'osi', side: 'r', ns: [1, 2], a: seq(A), b: seq(B) }, '1,2,1,2,2');

    // "the rules for iteration and for one-sided iteration can also be applied
    // to left-right variation" (p. 316).
    paper('3;(±) = +,+,+,-', { k: 'osi', side: 'l', ns: [3], a: { k: 'pm' } }, '1,1,1,-1');
    paper('3ᐟ(±) = +,-,-,-', { k: 'osi', side: 'r', ns: [3], a: { k: 'pm' } }, '1,-1,-1,-1');
    paper('3·(±) = +,+,+,-,-,-', { k: 'iter', ns: [3], child: { k: 'pm' } }, '1,1,1,-1,-1,-1');
    paper('3·{±} = {+,-}{+,-}{+,-}',
        { k: 'iter', ns: [3], child: chunk({ k: 'pm' }) }, '{1,-1},{1,-1},{1,-1}');

    // Breakdown indicators (pp. 313-314).
    const nested = chunk(seq(chunk(seq(A, B)), chunk(seq(C, D))));
    paper('[{{a,b},{c,d}}] = {a,b},{c,d}   (one step only)',
        { k: 'brk', child: nested }, '{1,2},{3,4}');
    paper('⟦{{a,b},{c,d}}⟧ = a,b,c,d   (complete breakdown)',
        { k: 'brkall', child: nested }, '1,2,3,4');

    // Continuation, resolved geometrically (see SITLanguage's header).
    check('⦃a,4·(0)⦄ closes into a hexagon when a = 60° (fig. 10a)', () => {
        const motif = seq(num(60), { k: 'iter', ns: [4], child: num(0) });
        const items = SITLanguage.evaluate({ k: 'cont', child: motif });
        assert(items.length === 6 * 5, `expected 6 sides × 5 angles, got ${items.length}`);
        const marks = SITLanguage.interpret2D(items, 1);
        const last = marks[marks.length - 1];
        assert(Math.hypot(last.x2, last.y2) < 1e-9, 'the contour should return to its start');
    });

    // The outerproduct, i.e. all of the paper's 3D machinery (pp. 314-315).
    check('⟨90⟩ leaves the plane; a plain angle stays in it', () => {
        const flat = SITLanguage.interpret3D(
            SITLanguage.evaluate(seq(num(0), num(90), num(90))), 1).segments;
        for (const s of flat) assert(Math.abs(s.b[2]) < 1e-9, 'a relative angle must stay in z = 0');
        const spatial = SITLanguage.interpret3D(
            SITLanguage.evaluate(seq(num(0), { k: 'out', child: num(90) })), 1).segments;
        const tip = spatial[spatial.length - 1].b;
        assert(Math.abs(tip[2]) > 0.5, '⟨90⟩ must take the contour out of the plane');
    });
    check('⟨0⟩ is a straight continuation and does not roll the reference plane', () => {
        // A straight run inside an out-of-plane branch is a ⟨…⟩ over n·(0). Two
        // collinear segments determine no surface, so ⟨0⟩ must leave the
        // reference plane alone — otherwise every such run would corkscrew and
        // the following ⟨90⟩ would tip in an arbitrary direction.
        const dir = (child) => {
            const segs = SITLanguage.interpret3D(SITLanguage.evaluate({ k: 'out', child }), 1).segments;
            const s = segs[segs.length - 1];
            return [s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]];
        };
        const plain = dir(seq(num(90)));
        const afterRun = dir(seq(num(0), num(0), num(0), num(90)));
        for (let i = 0; i < 3; i++) {
            assert(Math.abs(plain[i] - afterRun[i]) < 1e-9,
                `⟨0⟩ rolled the frame: ⟨90⟩ went ${plain} alone but ${afterRun} after a run`);
        }
        assert(Math.abs(plain[2]) > 0.9, '⟨90⟩ should tip fully out of the start plane');
    });

    // The paper's opening worked example, end to end (pp. 310-311). It derives
    // the code 4·((46, 4·(R(-23,23)))∫) for figure 3 and prints the angle series
    // it expands to; asserting that series exercises ∫, R and iteration together
    // and against real numbers rather than stand-in letters. Our ∫ prepends the
    // 0 its stated rule calls for ("(3,2,5)∫ = 0,3,5,10"), which the figure-3
    // derivation drops — a leading 0 is not information (p. 331) and draws one
    // grain along the base axis, so the rest must match exactly.
    check('fig. 3: 4·((46,4·(R(-23,23)))∫) expands to the paper\'s angle series', () => {
        const code = { k: 'iter', ns: [4], child: { k: 'int', child: seq(num(46),
            { k: 'iter', ns: [4], child: { k: 'rev', child: seq(num(-23), num(23)) } }) } };
        const got = SITLanguage.evaluate(code).map(it => it.v);
        // p. 310, quadruplicity expanded: 4·(46,23,0,-23,-46,-23,0,23,46,69,92,115,138,115,92,69,46)
        const distinct = [46, 23, 0, -23, -46, -23, 0, 23, 46, 69, 92, 115, 138, 115, 92, 69, 46];
        const want = [0, 0, 0, 0];
        for (const v of distinct) for (let i = 0; i < 4; i++) want.push(v);
        assert(got.length === want.length, `got ${got.length} angles, paper has ${want.length}`);
        for (let i = 0; i < want.length; i++) {
            assert(got[i] === want[i], `angle ${i}: got ${got[i]}, paper says ${want[i]}`);
        }
        // ∫ turns relative angles into absolute ones, so every value says so.
        assert(SITLanguage.evaluate(code).every(it => it.abs), '∫ must yield absolute angles');
    });

    // Fig. 10c: the vanishing sign turns a polygon into a dot pattern. Exactly
    // the corners survive — one visible grain each, isolated by hidden runs.
    check('fig. 10c: ⦃60,‾4·(0)‾⦄ draws six isolated dots, not a hexagon', () => {
        const code = { k: 'cont', child: seq(num(60), { k: 'hide', child: { k: 'iter', ns: [4], child: num(0) } }) };
        const marks = SITLanguage.interpret2D(SITLanguage.evaluate(code, 1), 1);
        assert(marks.length === 6, `expected 6 visible corners, got ${marks.length}`);
        // ...and they are genuinely separated, not a closed outline.
        for (let i = 1; i < marks.length; i++) {
            const gap = Math.hypot(marks[i].x1 - marks[i - 1].x2, marks[i].y1 - marks[i - 1].y2);
            assert(gap > 1.5, 'dots should be separated by the hidden runs');
        }
    });

    // Fig. 10i: the castellated line. Combination interleaves the operands —
    // (0,180)(90) = 0,90,180,90 — and | | reads them as absolute angles, so the
    // contour only ever heads along three fixed directions.
    check('fig. 10i: (|0,180|)(|90|) as absolute angles makes a square wave', () => {
        const code = { k: 'iter', ns: [4], child: { k: 'abs',
            child: { k: 'comb', a: seq(num(0), num(180)), b: seq(num(90)) } } };
        const marks = SITLanguage.interpret2D(SITLanguage.evaluate(code, 1), 1);
        const dirs = new Set(marks.map(m => Math.round(Math.atan2(m.y2 - m.y1, m.x2 - m.x1) * 180 / Math.PI)));
        assert(dirs.size === 3, `a square wave uses 3 directions, got ${[...dirs].join(',')}`);
        for (const d of dirs) assert([0, 90, 180, -180].includes(d), `unexpected direction ${d}`);
    });

    // Fig. 10m / Table 1 S-3: the generalised cylinder. A ring carrying a
    // vertical profile at every node, lofted — so every point of the skin sits
    // at one distance from the ring's axis. This is the geometric pay-off of the
    // two-quarter-turn lathe tip; with a single tip the profile would lean
    // tangentially and the radius would wander.
    check('fig. 10m: a ring plus a vertical profile lofts into a true cylinder', () => {
        const ind = new classes.SITCode3DIndividual();
        const tip = { k: 'iter', ns: [2], child: { k: 'out', child: num(90) } };
        const profile = seq(num(-90), { k: 'iter', ns: [6], child: num(0) });
        Object.defineProperty(ind, 'phenotype', {
            value: {
                family: 360,
                root: {
                    k: 'par', rows: [{ k: 'cont', child: num(30) }, seq(tip, profile)],
                    indep: [false, false], every: [false, true], skin: [false, true],
                },
            },
        });
        const fam = ind.skins()[0];
        assert(fam && fam.strands.length === 12, 'a 30° continuation should close into 12 nodes');
        // The wall: every profile point after the tip must share one radius
        // about the ring's axis. The ring lies in the z = 0 plane but the turtle
        // starts on its rim, not at its centre, so measure about the centroid of
        // the trunk nodes.
        let cx = 0, cy = 0;
        for (const s of fam.strands) { cx += s[0][0]; cy += s[0][1]; }
        cx /= fam.strands.length; cy /= fam.strands.length;
        const radii = [];
        for (const s of fam.strands) {
            for (let j = 3; j < s.length; j++) radii.push(Math.hypot(s[j][0] - cx, s[j][1] - cy));
        }
        const lo = Math.min(...radii), hi = Math.max(...radii);
        assert(hi - lo < 0.05, `cylinder wall radius wandered from ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
        assert(lo > 1, 'the wall should stand off the axis');
    });

    // Structural information I (pp. 331-332).
    check('I counts values and operations, and 0 is not information', () => {
        // "n·(0) conveys one unit of information"; "the value 0, and therefore
        // 0̄ and (0), are not information".
        const straight = { k: 'iter', ns: [4], child: num(0) };
        let l = SITLanguage.load(straight);
        assert(l.values === 0 && l.ops === 1, `n·(0) should be 1 unit, got ${JSON.stringify(l)}`);
        // Indicators are not information units either.
        l = SITLanguage.load(chunk({ k: 'abs', child: { k: 'hide', child: straight } }));
        assert(l.values === 0 && l.ops === 1, `indicators must be free, got ${JSON.stringify(l)}`);
        // "3 × ( ) [is] one given entity — one information unit", plus its argument.
        l = SITLanguage.load({ k: 'iter', ns: [3], child: seq(A, B) });
        assert(l.values === 2 && l.ops === 1, `3·(a,b) should be 1 op + 2 values, got ${JSON.stringify(l)}`);
    });
}

// --- The paper's own figures ---
// tests/paper-figures.js holds hand-written transcriptions of Leeuwenberg's
// figure 10 and Table 1, shared with scripts/sit-figures.js (which renders them
// as a contact sheet). Every figure must evaluate, interpret and draw; those
// carrying `checks` are asserted against the shape the paper prints. Figures
// whose `status` names a discrepancy are still exercised — they must not throw
// or go blank — but are not held to a shape they are known to miss.
console.log('\nThe paper\'s figures (tests/paper-figures.js):');
{
    const { FIGURES } = require('./paper-figures');
    const ids = new Set();
    check('the figure table is well formed', () => {
        assert(FIGURES.length >= 25, `expected the bulk of the paper's figures, got ${FIGURES.length}`);
        for (const f of FIGURES) {
            assert(f.id && f.label && f.code && f.family, `figure ${f.id || '?'} is missing fields`);
            assert(!ids.has(f.id), `duplicate figure id ${f.id}`);
            ids.add(f.id);
            assert(f.status, `figure ${f.id} must state whether it matches the paper`);
        }
    });
    for (const f of FIGURES) {
        const differs = /^DIFFERS/.test(f.status);
        check(`${f.id} — ${f.label}${differs ? ' (known to differ)' : ''}`, () => {
            const unit = 360 / f.family;
            const items = SITLanguage.evaluate(f.code, unit);
            assert(items.length > 0, 'code evaluated to nothing');
            if (f.mode === 'solid') {
                const fig = SITLanguage.interpret3D(items, unit);
                assert(fig.segments.length > 0 || fig.families.length > 0, 'figure is empty');
                if (f.checks && f.checks.skins) {
                    const err = f.checks.skins(fig.families.filter(x => x.skin));
                    assert(!err, err);
                }
                if (f.checks && f.checks.segments) {
                    const err = f.checks.segments(fig.segments);
                    assert(!err, err);
                }
            } else {
                const marks = SITLanguage.interpret2D(items, unit);
                assert(marks.length > 0, 'figure drew nothing');
                for (const m of marks) {
                    assert(Number.isFinite(m.x1) && Number.isFinite(m.y2), 'non-finite mark');
                }
                if (f.checks && f.checks.marks) {
                    const err = f.checks.marks(marks);
                    assert(!err, err);
                }
            }
        });
    }
    // The two engine features the figures forced out into the open.
    check('a lone grain is flagged as a dot; a joined one is not', () => {
        const dots = SITLanguage.interpret2D(
            SITLanguage.evaluate({ k: 'comb', a: { k: 'iter', ns: [5], child: { k: 'num', a: 0 } },
                b: { k: 'chunk', child: { k: 'hide', child: { k: 'iter', ns: [5], child: { k: 'num', a: 0 } } } } }, 1), 1);
        assert(dots.length === 5 && dots.every(m => m.dot), 'Table 1 C should be five dots');
        const line = SITLanguage.interpret2D(
            SITLanguage.evaluate({ k: 'iter', ns: [5], child: { k: 'num', a: 0 } }, 1), 1);
        assert(line.length === 5 && line.every(m => !m.dot), 'Table 1 B is a line, not five dots');
    });
    check('parallel continuation fans about one point; serial extends a contour', () => {
        const fan = SITLanguage.interpret2D(SITLanguage.evaluate({ k: 'parcont', child: { k: 'num', a: 45 } }, 1), 1);
        assert(fan.length === 8, `≈45≈ should fan into 8 spokes, got ${fan.length}`);
        // All eight start at the origin — that is what "common starting points" means.
        for (const m of fan) assert(Math.hypot(m.x1, m.y1) < 1e-9, 'a fan copy did not start at the shared point');
        const chain = SITLanguage.interpret2D(SITLanguage.evaluate({ k: 'cont', child: { k: 'num', a: 45 } }, 1), 1);
        assert(chain.length === 8, `⦃45⦄ should close into 8 sides, got ${chain.length}`);
        // ...whereas a serial continuation walks away from it.
        assert(chain.some(m => Math.hypot(m.x1, m.y1) > 1), 'a serial continuation should not stay at the origin');
    });
    check('the vanishing sign does not infect what is computed from it (fig. 10h)', () => {
        const code = { k: 'op', op: '@', a: { k: 'hide', child: { k: 'parcont', child: { k: 'num', a: 30 } } },
            b: { k: 'brkall', child: { k: 'abs', child: { k: 'iter', ns: [6], child: { k: 'num', a: 70 } } } } };
        const marks = SITLanguage.interpret2D(SITLanguage.evaluate(code, 1), 1);
        assert(marks.length === 6, `expected the induced figure to survive, got ${marks.length} marks`);
        assert(marks.every(m => !m.dot), 'the induced figure should be a contour, not dots');
    });
}

console.log('\nLeeuwenberg code individuals:');
check('both types draw a figure, and the 3D one goes spatial', () => {
    const flat = new classes.SITCodeIndividual();
    assert(flat.marks().length > 0, '2D code drew nothing');
    assert(flat.unitDegrees() > 0, 'no angular unit');

    // Over a sample, the 3D generator must actually produce out-of-plane codes
    // (a code with no ⟨ ⟩ anywhere is planar, and legal, but not all of them).
    let spatial = 0;
    for (let i = 0; i < 30; i++) {
        const ind = new classes.SITCode3DIndividual();
        const zs = [];
        for (const l of ind.polylines(true)) for (const p of l.pts) zs.push(p[2]);
        if (zs.length && Math.max(...zs) - Math.min(...zs) > 1e-6) spatial++;
    }
    assert(spatial > 5, `only ${spatial}/30 3D codes left the plane`);
});
check('a skinned parallel structure lofts into a closed surface of revolution', () => {
    // The paper's generalised cylinder: a ring ⦃90⦄ carrying, at each node, a
    // profile tipped out of the ring's plane. Because the branch code is
    // generated once and replicated, the copies form a regular grid — which is
    // what makes them loftable into a skin rather than a bundle of rods.
    const ind = new classes.SITCode3DIndividual();
    const profile = { k: 'seq', items: [{ k: 'num', a: 0 }, { k: 'num', a: 0 }, { k: 'num', a: 1 }, { k: 'num', a: 0 }] };
    Object.defineProperty(ind, 'phenotype', {
        value: {
            family: 4,
            root: {
                k: 'par',
                rows: [{ k: 'cont', child: { k: 'num', a: 1 } },
                { k: 'seq', items: [{ k: 'out', child: { k: 'num', a: 1 } }, profile] }],
                indep: [false, false], every: [false, true], skin: [false, true],
            },
        },
    });
    const skins = ind.skins();
    assert(skins.length === 1, `expected one skinned family, got ${skins.length}`);
    const strands = skins[0].strands;
    assert(strands.length === 4, `a ⦃90⦄ ring has 4 nodes, got ${strands.length}`);
    const width = strands[0].length;
    for (const s of strands) assert(s.length === width, 'replicated branches must be the same length');

    // The loop closes, so a 4-node ring sweeps 4 bands round the figure, not 3
    // — the surface joins up instead of leaving a seam.
    const skin = { vertices: [], indices: [], colors: [] };
    const bands = ind._emitSkin(skins[0], (p) => p, skin);
    assert(bands === 4, `a closed 4-node trunk should sweep 4 bands, got ${bands}`);
    assert(skin.indices.length > 0, 'no surface triangles emitted');
    for (const v of skin.vertices) assert(Number.isFinite(v), 'non-finite surface vertex');

    // The whole mesh carries the skin plus the ring's own rods, and nothing in
    // it may index off the end.
    const { vertices, indices } = ind.generate3DPoints();
    assert(indices.length > skin.indices.length, 'the trunk should still be tubed');
    const maxIndex = vertices.length / 3;
    for (const ix of indices) assert(ix >= 0 && ix < maxIndex, 'index out of range');
});
check('an open trunk leaves a seam (one band fewer than a closed one)', () => {
    // The closure rule must be a real test of the geometry, not always-on: a
    // trunk that does not come back on itself must not have its skin wrapped
    // around from the last profile to the first.
    const ind = new classes.SITCode3DIndividual();
    const branch = { k: 'seq', items: [{ k: 'iter', ns: [2], child: { k: 'out', child: { k: 'num', a: 1 } } }, { k: 'num', a: 0 }] };
    const open = { k: 'seq', items: [{ k: 'num', a: 0 }, { k: 'num', a: 0 }, { k: 'num', a: 0 }, { k: 'num', a: 0 }] };
    Object.defineProperty(ind, 'phenotype', {
        value: {
            family: 4,
            root: { k: 'par', rows: [open, branch], indep: [false, false], every: [false, true], skin: [false, true] },
        },
    });
    const fam = ind.skins()[0];
    assert(fam && fam.strands.length === 4, 'expected 4 profiles on the straight trunk');
    const bands = ind._emitSkin(fam, (p) => p, { vertices: [], indices: [], colors: [] });
    assert(bands === 3, `an open trunk should sweep 3 bands, got ${bands}`);
});
check('geometry drawn twice in one place is not built twice (no z-fighting)', () => {
    // The flicker bug. A code may legitimately say "draw this again" — e.g.
    // n·{closed contour} repeats a closed figure in place — and in 2D the
    // overdraw is harmless. In 3D two coincident sheets or tubes z-fight, and
    // the surface speckles and flickers as the camera orbits. Measured across
    // random individuals, ~15% of all triangles were exact duplicates (worst
    // case 77%) before this was handled.
    const ind = new classes.SITCode3DIndividual();
    const ring = { k: 'cont', child: { k: 'num', a: 1 } };
    const branch = { k: 'seq', items: [{ k: 'iter', ns: [2], child: { k: 'out', child: { k: 'num', a: 1 } } }, { k: 'num', a: 0 }] };
    const lathe = { k: 'par', rows: [ring, branch], indep: [false, false], every: [false, true], skin: [false, true] };
    Object.defineProperty(ind, 'phenotype', {
        // 3·{lathe}: the same closed figure three times over, in place.
        value: { family: 4, root: { k: 'iter', ns: [3], child: { k: 'chunk', child: lathe } } },
    });
    const fam = ind.skins()[0];
    assert(fam.strands.length === 12, `expected 3 in-place copies of a 4-node ring, got ${fam.strands.length}`);

    const { vertices, indices } = ind.generate3DPoints();
    const key = (i) => [0, 1, 2].map(k => vertices[i * 3 + k].toFixed(4)).join(',');
    const seen = new Set();
    for (let i = 0; i < indices.length; i += 3) {
        const k = [key(indices[i]), key(indices[i + 1]), key(indices[i + 2])].sort().join('|');
        assert(!seen.has(k), 'coincident duplicate triangle survived into the mesh');
        seen.add(k);
    }
    assert(indices.length > 0, 'the figure should still have geometry');
});
check('3D codes build a mesh that STL export can consume', () => {
    let built = 0;
    for (let i = 0; i < 10; i++) {
        const ind = new classes.SITCode3DIndividual();
        if (!ind.validate()) continue;
        const { vertices, indices, colors } = ind.generate3DPoints();
        assert(vertices.length % 3 === 0 && colors.length === vertices.length, 'malformed mesh arrays');
        assert(indices.length % 3 === 0, 'indices must be triangles');
        for (const v of vertices) assert(Number.isFinite(v), 'non-finite vertex');
        const maxIndex = vertices.length / 3;
        for (const ix of indices) assert(ix >= 0 && ix < maxIndex, 'index out of range');
        if (indices.length) built++;
    }
    assert(built > 0, 'no 3D code produced geometry');
});
check('the rotational family gene spans discrete-to-continuous in one type', () => {
    // Angle literals are integer multiples of 360/family, and the multiple is
    // capped, so a small family is coarse and closing while a large one is fine
    // and gentle. This is what replaced the old discrete/continuous type pair.
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(new classes.SITCodeIndividual().phenotype.family);
    assert(seen.size > 3, `family gene barely varies (${[...seen].join(',')})`);
    const small = Math.min(...seen), large = Math.max(...seen);
    assert(360 / small > 360 / large, 'family must set the angular unit');
});
check('validate() rejects empty and effectively-collinear figures', () => {
    const ind = new classes.SITCodeIndividual();
    Object.defineProperty(ind, 'phenotype', { value: { family: 4, root: { k: 'num', a: 0 } } });
    assert(!ind.validate(), 'a bare straight run should be rejected');
});

// --- Self-description ---
// Each individual owns its display: toString() (concise summary) and describe()
// (rich HTML panel) live on the individual, not the framework.
console.log('\nSelf-description (toString / describe):');
for (const name of INDIVIDUAL_CLASSES) {
    check(name, () => {
        const ind = new classes[name]();
        const str = ind.toString();
        assert(typeof str === 'string' && str.includes(name), 'toString() should mention the type');

        const html = ind.describe();
        assert(typeof html === 'string' && html.length > 0, 'describe() must return a non-empty string');
        assert(html.includes(name), 'describe() should include the type');
        assert(html.includes('Fitness'), 'describe() should include a Fitness label');
    });
}
check('SuperFormula describe() includes its formula', () => {
    assert(new classes.SuperShapeIndividual().describe().includes('Formula'), 'missing formula block');
    assert(new classes.SuperShape3DIndividual().describe().includes('r₁(θ)'), 'missing 3D formula block');
});
check('tree / PTO-trace genomes pick the right section', () => {
    assert(new classes.PatternIndividual().describe().includes('Expression Tree'), 'GP should show its tree');
    assert(new classes.GridIndividual().describe().includes('PTO trace'), 'PTO genome shows its trace');
    assert(new classes.MouseMusicIndividual().describe().includes('PTO trace'), 'DAG (PTO) genome shows its trace');
});

// --- Bloom post-filter ---
console.log('\nBloom post-filter:');
check('spreads bright pixels into a halo but leaves flat background unchanged', () => {
    const Canvas2D = load().Canvas2DModality;
    const W = 9, H = 9;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) data[i + 3] = 255; // opaque black
    const c = (4 * W + 4) * 4;            // bright pixel at the centre
    data[c] = data[c + 1] = data[c + 2] = 200;

    Canvas2D.bloom({ width: W, height: H, data }, { radius: 2, strength: 1, background: { r: 0, g: 0, b: 0 } });

    const neighbour = (4 * W + 5) * 4;
    assert(data[neighbour] > 0, 'an adjacent pixel should receive glow');
    assert(data[c] >= 200, 'the bright core should stay at least as bright');
    assert(data[0] === 0, 'a far background pixel must not be brightened');
});

// --- Canvas2D render cache ---
console.log('\nCanvas2D render cache:');
check('renderCached skips re-render until genome or size changes', () => {
    const Canvas2D = load().Canvas2DModality;
    const canvas = makeCanvas(8, 8);
    const holder = { genome: [1, 2, 3], _cachedImageData: null, _cacheKey: null };
    let calls = 0;
    const renderFn = (ctx, w, h) => { calls++; return ctx.createImageData(w, h); };

    Canvas2D.renderCached(canvas, holder, renderFn);
    Canvas2D.renderCached(canvas, holder, renderFn);              // unchanged → cache hit
    assert(calls === 1, 'unchanged genome/size should hit the cache');

    holder.genome = [9, 9, 9];
    Canvas2D.renderCached(canvas, holder, renderFn);              // genome changed → re-render
    assert(calls === 2, 'changing the genome should re-render');

    holder._cachedImageData = null; holder._cacheKey = null;     // simulate invalidateImageCache()
    Canvas2D.renderCached(canvas, holder, renderFn);
    assert(calls === 3, 'a cleared cache should re-render');
});

// --- Active intervention (direct manipulation → heritable genome) ---
// The edit gesture belongs to the individual (base Individual.beginEditSession
// implements the step-grid one); the framework only supplies session callbacks.
// The contract that matters is that an edit is written into the *genome*, not
// just a cached phenotype, so evolution continues from what the user drew.
console.log('\nActive intervention (edit sessions):');
{
    // A canvas stub that also answers the DOM calls an edit session makes.
    function makeEditCanvas(w = 768, h = 768) {
        const canvas = makeCanvas(w, h);
        const listeners = {};
        canvas.style = {};
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h });
        canvas.addEventListener = (type, fn, opts) => {
            (listeners[type] = listeners[type] || []).push({ fn, signal: opts && opts.signal });
        };
        canvas.dispatch = (type, x, y) => {
            for (const l of (listeners[type] || [])) {
                if (l.signal && l.signal.aborted) continue;
                l.fn({ clientX: x, clientY: y, pointerId: 1, preventDefault() {} });
            }
        };
        canvas.liveCount = () => Object.values(listeners)
            .reduce((n, ls) => n + ls.filter(l => !(l.signal && l.signal.aborted)).length, 0);
        return canvas;
    }

    // Canvas coordinates of the centre of cell (c, s), via the type's own layout.
    function cellCentre(ind, canvas, c, s) {
        for (let py = 0; py < canvas.height; py += 2) {
            for (let px = 0; px < canvas.width; px += 2) {
                const cell = ind.cellAtCanvasXY(canvas, px, py);
                if (cell && cell.c === c && cell.s === s) return { x: px, y: py };
            }
        }
        throw new Error(`no canvas point maps to cell ${c},${s}`);
    }

    check('the editable flag defaults off, and on for the step sequencers', () => {
        assert(new classes.PatternIndividual().isEditable() === false, 'a plain 2D type is not editable');
        assert(new classes.DrumMachineIndividual().isEditable() === true, 'DrumMachine should be editable');
        assert(new classes.MelodyIndividual().isEditable() === true, 'Melody should be editable');
    });

    check('base beginEditSession returns a teardown that unbinds the gesture', () => {
        const ind = new classes.DrumMachineIndividual();
        const canvas = makeEditCanvas();
        const end = ind.beginEditSession(canvas, {});
        assert(typeof end === 'function', 'beginEditSession must return a teardown function');
        assert(canvas.liveCount() > 0, 'expected pointer listeners to be bound');
        end();
        assert(canvas.liveCount() === 0, 'teardown must unbind every listener');
    });

    check('a non-grid type gets a harmless no-op session', () => {
        // The base session is grid-shaped; a type without the cell hooks must not
        // throw when handed a canvas (a third-party type overrides the whole
        // method instead).
        const ind = new classes.PatternIndividual();
        const end = ind.beginEditSession(makeEditCanvas(), {});
        assert(typeof end === 'function', 'expected a teardown even with no gesture');
        end();
    });

    for (const type of ['DrumMachineIndividual', 'MelodyIndividual']) {
        check(`${type}: a click toggles a cell and writes it into the genome`, () => {
            const ind = new classes[type]();
            const canvas = makeEditCanvas();
            let edits = 0, gestures = 0;
            const end = ind.beginEditSession(canvas, {
                onEdit: () => edits++,
                onGestureEnd: () => gestures++,
            });
            const before = ind.cellOn(2, 3);
            const genomeBefore = ind.genome;
            const { x, y } = cellCentre(ind, canvas, 2, 3);
            canvas.dispatch('pointerdown', x, y);
            canvas.dispatch('pointerup', x, y);
            assert(ind.cellOn(2, 3) === !before, 'click should toggle the cell');
            assert(ind.genome !== genomeBefore, 'the edit must produce a new genome, not mutate the phenotype');
            assert(edits === 1, `expected one onEdit, got ${edits}`);
            assert(gestures === 1, `expected one onGestureEnd, got ${gestures}`);
            end();
        });

        check(`${type}: the edit is heritable (survives clone and mutation)`, () => {
            const ind = new classes[type]();
            const canvas = makeEditCanvas();
            const end = ind.beginEditSession(canvas, {});
            const want = !ind.cellOn(1, 5);
            const { x, y } = cellCentre(ind, canvas, 1, 5);
            canvas.dispatch('pointerdown', x, y);
            canvas.dispatch('pointerup', x, y);
            end();
            assert(ind.cellOn(1, 5) === want, 'setup: the cell should have toggled');
            const child = ind.clone();
            assert(child.cellOn(1, 5) === want, 'a clone must inherit the edited cell');
            // ...and the edited genome is a valid trace the operators still accept.
            const mutant = ind.clone();
            mutant.mutate(0.05);
            assert(mutant.phenotype && mutant.phenotype.grid, 'the edited genome must survive mutation');
        });

        check(`${type}: a vertical drag on an on-cell edits velocity, not the hit`, () => {
            const ind = new classes[type]();
            const canvas = makeEditCanvas();
            const end = ind.beginEditSession(canvas, {});
            // Find an on cell to drag.
            let on = null;
            for (let c = 0; c < 8 && !on; c++)
                for (let s = 0; s < 8 && !on; s++) if (ind.cellOn(c, s)) on = { c, s };
            assert(on, 'expected at least one on cell');
            const v0 = ind.cellVel(on.c, on.s);
            const { x, y } = cellCentre(ind, canvas, on.c, on.s);
            canvas.dispatch('pointerdown', x, y);
            assert(ind.cellOn(on.c, on.s), 'pressing an on cell must NOT toggle it immediately');
            canvas.dispatch('pointermove', x, y - 200);      // drag up = louder
            canvas.dispatch('pointerup', x, y - 200);
            end();
            assert(ind.cellOn(on.c, on.s), 'a velocity drag must leave the cell on');
            const v1 = ind.cellVel(on.c, on.s);
            assert(v1 > v0 || v0 === 1, `dragging up should raise velocity (${v0} → ${v1})`);
            assert(v1 <= 1, 'velocity must stay within 0..1');
        });

        check(`${type}: dragging down lowers velocity, and it is heritable`, () => {
            const ind = new classes[type]();
            const canvas = makeEditCanvas();
            const end = ind.beginEditSession(canvas, {});
            let on = null;
            for (let c = 0; c < 8 && !on; c++)
                for (let s = 0; s < 8 && !on; s++) if (ind.cellOn(c, s)) on = { c, s };
            ind.setCellVel(on.c, on.s, 0.8);                 // start from a known level
            const { x, y } = cellCentre(ind, canvas, on.c, on.s);
            canvas.dispatch('pointerdown', x, y);
            canvas.dispatch('pointermove', x, y + 300);      // drag down = softer
            canvas.dispatch('pointerup', x, y + 300);
            end();
            const v = ind.cellVel(on.c, on.s);
            assert(v < 0.8, `dragging down should lower velocity (got ${v})`);
            assert(v >= 0, 'velocity must not go negative');
            assert(ind.clone().cellVel(on.c, on.s) === v, 'the velocity edit must be heritable');
        });

        check(`${type}: a small movement is still a click (dead zone)`, () => {
            const ind = new classes[type]();
            const canvas = makeEditCanvas();
            const end = ind.beginEditSession(canvas, {});
            let on = null;
            for (let c = 0; c < 8 && !on; c++)
                for (let s = 0; s < 8 && !on; s++) if (ind.cellOn(c, s)) on = { c, s };
            const { x, y } = cellCentre(ind, canvas, on.c, on.s);
            canvas.dispatch('pointerdown', x, y);
            canvas.dispatch('pointermove', x + 2, y + 3);    // inside the 6px dead zone
            canvas.dispatch('pointerup', x + 2, y + 3);
            end();
            assert(ind.cellOn(on.c, on.s) === false, 'a jittery click should still toggle the cell off');
        });

        check(`${type}: a drag paints in one direction and dedupes within a cell`, () => {
            const ind = new classes[type]();
            const canvas = makeEditCanvas();
            let edits = 0;
            const end = ind.beginEditSession(canvas, { onEdit: () => edits++ });
            // Start on a cell that is off, so the drag paints ON.
            let start = null;
            for (let s = 0; s < 8 && !start; s++) if (!ind.cellOn(0, s)) start = s;
            assert(start !== null, 'expected at least one off cell in row 0');
            const a = cellCentre(ind, canvas, 0, start);
            canvas.dispatch('pointerdown', a.x, a.y);
            canvas.dispatch('pointermove', a.x, a.y);        // same cell — must not re-fire
            assert(edits === 1, `re-entering the same cell should not re-fire (got ${edits})`);
            const next = start + 1;
            if (next < 8) {
                const b = cellCentre(ind, canvas, 0, next);
                canvas.dispatch('pointermove', b.x, b.y);
                assert(ind.cellOn(0, next) === true, 'the drag should paint the next cell ON');
                assert(edits === 2, `expected a second edit on the new cell (got ${edits})`);
            }
            canvas.dispatch('pointerup', a.x, a.y);
            end();
        });
    }
}

// --- Seeded PRNGs (render-time randomness) ---
// These streams are part of the phenotype: a type's saved genomes only reload
// to the same picture while its generator produces the same numbers. The
// expected values below are the streams as of the shared-PRNG refactor and are
// pinned deliberately — if a change here fails, the fix is to restore the
// stream, not to update the numbers.
console.log('\nSeeded PRNGs:');
{
    check('Individual.mulberry32 reproduces its reference stream', () => {
        const expected = [
            0.979728267760947, 0.306752264499664, 0.484205421525985,
            0.817934412509203, 0.509428369347006,
        ];
        const rand = Individual.mulberry32(12345);
        expected.forEach((e, i) => {
            const got = rand();
            assert(Math.abs(got - e) < 1e-15, `draw ${i}: expected ${e}, got ${got}`);
        });
    });

    check('mulberry32 is a fresh independent stream per seed', () => {
        const a = Individual.mulberry32(1), b = Individual.mulberry32(1), c = Individual.mulberry32(2);
        const draw = (r) => [r(), r(), r()];
        const [x, y, z] = [draw(a), draw(b), draw(c)];
        assert(x.every((v, i) => v === y[i]), 'same seed must give the same stream');
        assert(x.some((v, i) => v !== z[i]), 'different seeds must diverge');
        assert(x.every(v => v >= 0 && v < 1), 'draws must lie in [0,1)');
    });

    check('AntRendering renders identically from the same genome (seeded, cacheable)', () => {
        const a = new classes.AntRenderingIndividual();
        const b = a.clone();
        const px = (ind) => {
            const canvas = makeCanvas(128, 128);
            ind.visualize(canvas);
            return ind._cachedImageData;
        };
        const [pa, pb] = [px(a), px(b)];
        assert(pa && pb, 'expected a cached render from both');
        assert(pa.data.length === pb.data.length, 'renders differ in size');
        let diff = 0;
        for (let i = 0; i < pa.data.length; i++) if (pa.data[i] !== pb.data[i]) diff++;
        assert(diff === 0, `${diff} bytes differ — the colony sim is not reproducible from the genome`);
    });

    check('PSystem keeps its own LCG stream (deliberately not mulberry32)', () => {
        // The two identical copies of this LCG were deduped into one psRandom
        // factory. The stream must be exactly what it was, or every saved
        // P-system genome reloads to a different picture.
        const expected = [
            0.238780839834362, 0.913493264699355, 0.612491666339338,
            0.926981459138915, 0.049341175239533,
        ];
        const rand = psRandom(7);
        expected.forEach((e, i) => {
            const got = rand();
            assert(Math.abs(got - e) < 1e-15, `LCG draw ${i}: expected ${e}, got ${got}`);
        });
        // Seed 0 falls back to 1 (an LCG seeded 0 from this state would still
        // advance, but the guard predates the refactor and is part of the stream).
        assert(psRandom(0)() === psRandom(1)(), 'seed 0 must behave as seed 1');
        // ...and it is genuinely a different stream from mulberry32.
        assert(psRandom(7)() !== Individual.mulberry32(7)(), 'PSystem must not silently share mulberry32');
    });

    check('PSystem renders identically from the same genome', () => {
        const a = new classes.PSystemIndividual();
        const b = a.clone();
        const px = (ind) => { const c = makeCanvas(128, 128); ind.visualize(c); return ind._cachedImageData; };
        const [pa, pb] = [px(a), px(b)];
        assert(pa && pb, 'expected a cached render from both');
        let diff = 0;
        for (let i = 0; i < pa.data.length; i++) if (pa.data[i] !== pb.data[i]) diff++;
        assert(diff === 0, `${diff} bytes differ — the P-system render is not reproducible`);
    });
}

// --- Shared expression compiler (services/ExpressionCompiler.js) ---
// The four expression types (PatternGrammar, AnimatedPattern, PolarCurve,
// RadialSurface3D) share one rewrite pipeline. Their differences are real and
// load-bearing, so each is pinned here: a preset quietly gaining or losing a
// rewrite would silently change every render of that type.
console.log('\nShared expression compiler:');
{
    const EC = ExpressionCompiler;
    const P = EC.PRESETS;

    check('qualifies bare math functions and evaluates', () => {
        const f = EC.compile('sin(x) + cos(y)', ['x', 'y'], P.PATTERN);
        assert(Math.abs(f(0, 0) - 1) < 1e-12, `expected 1, got ${f(0, 0)}`);
    });

    check('PATTERN: r and theta become derived quantities of x,y', () => {
        const r = EC.compile('r', ['x', 'y'], P.PATTERN);
        assert(Math.abs(r(3, 4) - 5) < 1e-12, `r should be hypot(x,y), got ${r(3, 4)}`);
        const th = EC.compile('theta', ['x', 'y'], P.PATTERN);
        assert(Math.abs(th(0, 1) - Math.PI / 2) < 1e-12, `theta should be atan2(y,x), got ${th(0, 1)}`);
    });

    check('SURFACE: theta stays a variable (no polar substitution)', () => {
        const f = EC.compile('theta + phi', ['theta', 'phi'], P.SURFACE);
        assert(Math.abs(f(2, 3) - 5) < 1e-12, `theta must be the parameter here, got ${f(2, 3)}`);
        const g = EC.compile('pow(a, 2)', ['a'], P.SURFACE);
        assert(Math.abs(g(3) - 9) < 1e-12, 'pow should be qualified for surfaces');
    });

    check('PATTERN: ifpos compiles to a conditional', () => {
        const f = EC.compile('ifpos(x, 10, 20)', ['x', 'y'], P.PATTERN);
        assert(f(1, 0) === 10 && f(-1, 0) === 20, 'ifpos did not branch on sign');
    });

    check('PATTERN: division and modulo are protected against a zero divisor', () => {
        const f = EC.compile('1/x', ['x', 'y'], P.PATTERN);
        assert(f(0, 0) === 1, `guarded divisor should give 1/1, got ${f(0, 0)}`);
        assert(Math.abs(f(4, 0) - 0.25) < 1e-12, 'ordinary division must be unaffected');
    });

    check('POLAR: division is NOT rewritten (the regex would mangle this grammar)', () => {
        const src = EC.toJS('(t*3)/tan(t)', P.POLAR);
        assert(!src.includes('1e-6'), 'POLAR must not carry the protected-division guard');
        const f = EC.compile('5.0*(t/2)', ['t'], P.POLAR);
        assert(Math.abs(f(2) - 5) < 1e-12, 'polar division expression should evaluate');
    });

    check('pi literals the grammars emit become exact constants', () => {
        const f = EC.compile('6.28318', ['t'], P.POLAR);
        assert(Math.abs(f(0) - 2 * Math.PI) < 1e-12, 'literal should become 2*Math.PI exactly');
        const g = EC.compile('3.14159', ['x', 'y'], P.PATTERN);
        assert(g(0, 0) === Math.PI, 'literal should become Math.PI exactly');
    });

    check('fallbacks differ by preset: 0 for a value, 1 for a polar radius', () => {
        assert(EC.compile('0/0', ['t'], P.POLAR)(1) === 1.0, 'NaN in POLAR should fall back to a unit radius');
        assert(EC.compile('log(0-1)', ['theta', 'phi'], P.SURFACE)(0, 0) === 0, 'NaN in SURFACE should fall back to 0');
        assert(EC.compile('sqrt(0-1)', ['x', 'y'], P.PATTERN)(0, 0) === 0.0, 'NaN in PATTERN should fall back to 0');
    });

    check('an uncompilable expression yields the constant fallback, not a throw', () => {
        const f = EC.compile('this is ) not ( javascript', ['t'], P.POLAR);
        assert(f(0) === 1.0 && f(99) === 1.0, 'syntax error should degrade to the constant fallback');
    });

    check('the four call sites route through the shared compiler', () => {
        // Each type keeps its own thin wrapper; these are the contracts the
        // wrappers must preserve (variables and fallback value).
        const pg = new classes.PatternGrammarIndividual();
        assert(Math.abs(pg.compileExpression('x+y')(2, 3) - 5) < 1e-12, 'PatternGrammar compiles over x,y');
        const ap = new classes.AnimatedPatternIndividual();
        assert(Math.abs(ap._compileExpression('x+y+t')(1, 2, 3) - 6) < 1e-12, 'AnimatedPattern compiles over x,y,t');
        const pc = new classes.PolarCurveIndividual();
        assert(Math.abs(pc.compileExpressionForT('t*2')(4) - 8) < 1e-12, 'PolarCurve compiles over t');
        const s3 = new classes.WarpedSurface3DIndividual();
        assert(Math.abs(s3.compileExpr('theta*phi', ['theta', 'phi'])(3, 4) - 12) < 1e-12, 'RadialSurface3D compiles over theta,phi');
    });
}

// --- GE Radius expression compilation regression ---
// Regression for the protected-division regex that mangled any expression
// containing '/' or '%' into uncompilable code, so it fell back to a constant
// r = 1.0 (the dotty fallback circle). Division expressions must now evaluate.
console.log('\nGE Radius expression compilation:');
check('division/modulo expressions compile and vary with t (not constant 1.0)', () => {
    const ind = new classes.PolarCurveIndividual();
    const f = ind.compileExpressionForT('5.0*(t/2)');
    assert(Math.abs(f(2) - 5.0) < 1e-9 && Math.abs(f(4) - 10.0) < 1e-9, 'division expr did not evaluate correctly');

    const g = ind.compileExpressionForT('(t*3)/tan((t*2)+log((t*2))-(t/2))');
    assert(g(1) !== 1.0 || g(5) !== 1.0, 'complex expr collapsed to the 1.0 fallback');

    const c = ind.compileExpressionForT('6.28318');
    assert(Math.abs(c(0) - c(9)) < 1e-9 && Math.abs(c(0) - 2 * Math.PI) < 1e-6, 'constant should compile to a constant');
});

// --- Sheep regression: neural-network phenotype must be finite ---
// Regression for the bug where the input->hidden weights were sized from an
// undefined `this.genomeLength`, leaving them empty so the forward pass produced
// NaN and only the (fixed-coordinate) head rendered.
console.log('\nSheep neural-network regression:');
check('input->hidden weights are sized to the genome', () => {
    const sheep = new classes.SheepIndividual();
    assert(sheep.weightsInputHidden.length === sheep.hiddenSize, 'wrong hidden count');
    for (const row of sheep.weightsInputHidden) {
        assert(row.length === sheep.phenotype.length, 'each hidden node needs one weight per genome input');
    }
});
check('phenotype values are all finite numbers', () => {
    const p = new classes.SheepIndividual().getPhenotype();
    for (const [k, v] of Object.entries(p)) {
        assert(typeof v === 'number' && isFinite(v), `phenotype.${k} is not finite (got ${v})`);
    }
});
check('bodySize and legLength are within range (so body/legs render)', () => {
    const p = new classes.SheepIndividual().getPhenotype();
    assert(p.bodySize >= 0.7 && p.bodySize <= 1.3, `bodySize out of range: ${p.bodySize}`);
    assert(p.legLength >= 0.6 && p.legLength <= 1.4, `legLength out of range: ${p.legLength}`);
});

// --- Shared MIDI modality ---
// All sound individuals reference the framework's single shared MIDIModality
// (rather than each constructing their own AudioContext), and clones keep that
// shared reference so no per-individual MIDI re-wiring is needed.
console.log('\nShared MIDI modality:');
const soundTypes = ['MelodyIndividual', 'MouseMusicIndividual', 'EEGSonificationIndividual'];
check('all sound individuals reference the framework shared modality', () => {
    const env = load();
    const fwShared = env.sandbox.window.framework.sharedMIDI;
    for (const name of soundTypes) {
        const ind = new env.classes[name]();
        assert(ind.midiModality === fwShared, `${name} should reference the shared modality`);
    }
});
check('clones keep the shared modality reference (no per-clone re-wiring)', () => {
    const env = load();
    const fwShared = env.sandbox.window.framework.sharedMIDI;
    for (const name of soundTypes) {
        const ind = new env.classes[name]();
        const clone = ind.clone();
        assert(clone.midiModality === fwShared, `${name} clone should still share the modality`);
        const [c1, c2] = ind.crossover(new env.classes[name]());
        assert(c1.midiModality === fwShared && c2.midiModality === fwShared, `${name} children should share the modality`);
    }
});
check('two individuals of the same type share one modality instance', () => {
    const env = load();
    for (const name of soundTypes) {
        const a = new env.classes[name]();
        const b = new env.classes[name]();
        assert(a.midiModality === b.midiModality, `${name} instances must share the modality`);
    }
});

// --- Shared AudioModality (buffer/graph playback) ---
// The sibling of MIDIModality: DrumMachine/AudioFilter reference the framework's
// single sharedAudio for buffer/graph playback (one owner of the Web Audio
// play/stop lifecycle instead of per-individual boilerplate).
console.log('\nShared AudioModality (buffer/graph playback):');
const audioTypes = ['DrumMachineIndividual', 'AudioFilterIndividual'];
check('audio individuals reference the framework shared AudioModality', () => {
    const env = load();
    const fwShared = env.sandbox.window.framework.sharedAudio;
    for (const name of audioTypes) {
        assert(new env.classes[name]().audio === fwShared, `${name} should reference framework.sharedAudio`);
    }
});
check('AudioModality plays a buffer / graph and tracks a single active playback', () => {
    const env = load();
    const audio = new env.AudioModality();
    assert(audio.isActive === false, 'starts idle');
    const ctx = env.sandbox.window.AudioClip.context();
    audio.playBuffer(ctx.createBuffer(1, 100, 44100), { loop: true });
    assert(audio.isActive === true, 'active after playBuffer');
    // A second start replaces the first (single active playback).
    audio.playGraph((c) => ({ output: c.createGain(), sources: [c.createBufferSource()] }));
    assert(audio.isActive === true, 'still one active playback after playGraph');
    audio.stop();
    assert(audio.isActive === false, 'idle after stop');
    audio.stop(); // idempotent
});
check('DrumMachine/AudioFilter play + stop through the shared AudioModality', () => {
    const env = load();
    for (const name of audioTypes) {
        const ind = new env.classes[name]();
        ind.playMIDI();
        assert(ind.audio.isActive === true, `${name}.playMIDI should start the shared modality`);
        assert(ind.isPlaying === true, `${name}.isPlaying should be true`);
        ind.stopMIDI();
        assert(ind.audio.isActive === false, `${name}.stopMIDI should stop the shared modality`);
        assert(ind.isPlaying === false, `${name}.isPlaying should be false`);
    }
});

// --- Melody piano-roll (the DrumMachine machinery propagated to melody) ---
console.log('\nMelody piano-roll:');
check('getPhenotype merges consecutive on-cells in a row into one held note', () => {
    const m = new classes.MelodyIndividual();
    // Force a known row 0: on at steps 2,3,4 (a 3-step held note) and 8 (a 1-step note).
    // Mutating the expressed phenotype directly is fine here — we're testing the
    // run-merging in getPhenotype(), not the genome.
    const p = m.phenotype;
    for (let s = 0; s < 16; s++) p.grid[0][s] = 0;
    p.grid[0][2] = 0.8; p.grid[0][3] = 0.8; p.grid[0][4] = 0.8; p.grid[0][8] = 0.7;
    p.length = 16;
    const row0 = m.getPhenotype().filter(n => n.pitch === p.scale[0]);
    assert(row0.length === 2, `expected 2 notes in row 0, got ${row0.length}`);
    const held = row0.find(n => n.start === 2);
    assert(held && held.steps === 3, 'the 2..4 run should be one 3-step held note');
    assert(row0.find(n => n.start === 8 && n.steps === 1), 'the lone step-8 note should be 1 step');
});
check('the Length override is locked to 16 by default (uniform loops)', () => {
    const env = load();
    assert(env.sandbox.window.PerformanceControls.dials.length.on === true, 'Length override on by default');
    const m = new env.classes.MelodyIndividual();
    const p = m.phenotype;
    for (let s = 0; s < 16; s++) p.grid[0][s] = 0.8;   // fill row 0 fully
    p.length = 8;                                       // gene says 8, but the override forces 16
    assert(m._effectiveLength() === 16, 'effective length is forced to 16 while the override is locked');
    const notes = m.getPhenotype().filter(n => n.pitch === p.scale[0]);
    assert(notes.length === 1 && notes[0].steps === 16, 'a full row spans all 16 steps while locked');
    assert(m.toMIDISequence().loopTicks === 16 * 24, 'export loops the full 16 steps while locked');
});
check('DrumMachine also honours the shared Length override (default 16, unlockable)', () => {
    const env = load();
    const dm = new env.classes.DrumMachineIndividual();
    assert(dm._effectiveLength() === 16, 'drum defaults to 16 steps (override locked)');
    assert(dm.toMIDISequence().loopTicks === 16 * 24, 'drum export loops the full 16 steps by default');
    env.sandbox.window.PerformanceControls.dials.length.on = false; // free the gene
    dm.phenotype.length = 8;
    assert(dm._effectiveLength() === 8, 'unlocked drum uses its own length gene');
    assert(dm.toMIDISequence().loopTicks === 8 * 24, 'unlocked drum export loops the gene length');
});
check('unlocking the Length override lets the length gene bound the loop', () => {
    const env = load();
    env.sandbox.window.PerformanceControls.dials.length.on = false; // free the gene (advanced users)
    const m = new env.classes.MelodyIndividual();
    const p = m.phenotype;
    for (let s = 0; s < 16; s++) p.grid[0][s] = 0.8;
    p.length = 8;
    const notes = m.getPhenotype().filter(n => n.pitch === p.scale[0]);
    assert(notes.length === 1 && notes[0].start === 0 && notes[0].steps === 8,
        'a full row reads as one 8-step note when the gene length is 8 and the override is off');
    const seq = m.toMIDISequence();
    assert(seq.loopTicks === 8 * (seq.ppq / 4), 'loopTicks = gene length × stepTicks when unlocked');
    assert(seq.notes.every(n => n.channel === 0), 'melody notes on channel 0 (MIDI ch 1)');
});
check('a grid edit folds into the genome and toggles the cell (like the drum machine)', () => {
    const m = new classes.MelodyIndividual();
    const was = m.cellOn(3, 5);
    m.setCellHit(3, 5, !was);
    assert(m.cellOn(3, 5) === !was, 'setCellHit should toggle the cell');
    // The edit is heritable: a fresh individual from the edited genome reproduces it.
    const child = new classes.MelodyIndividual(JSON.parse(JSON.stringify(m.representation.revive(m.genome))));
    assert(child.cellOn(3, 5) === !was, 'the edited cell should survive into a genome-built child');
});

// --- Unified step-sequencer playback (live MIDI else synth) ---
// Both DrumMachine and Melody: send live MIDI when framework.sharedMIDI has an output,
// else fall back to a synthesised buffer through sharedAudio.
console.log('\nUnified playback (live MIDI else synth):');
const seqTypes = ['DrumMachineIndividual', 'MelodyIndividual'];
check('no MIDI output → play through the synth (AudioModality) path', () => {
    const env = load();
    env.sandbox.window.framework.sharedMIDI.midiOutput = null;
    for (const name of seqTypes) {
        const ind = new env.classes[name]();
        ind.playMIDI();
        assert(env.sandbox.window.framework.sharedAudio.isActive === true, `${name} should use the synth path`);
        ind.stopMIDI();
        assert(env.sandbox.window.framework.sharedAudio.isActive === false, `${name} should stop the synth path`);
    }
});
check('rendered loop buffers end at zero (shared loop-seam declick, no click on repeat)', () => {
    const env = load();
    for (const name of seqTypes) {
        const ind = new env.classes[name]();
        // Force something loud right at the last step so the seam is exercised.
        const p = ind.phenotype;
        if (name === 'MelodyIndividual') { env.sandbox.window.PerformanceControls.dials.length.on = false; p.length = 8; p.swing = 0.5; p.grid[0][7] = 1.0; }
        else { p.grid[0][15] = 1.0; }
        const data = ind.renderToAudioBuffer().getChannelData(0);
        assert(Math.abs(data[data.length - 1]) < 1e-4, `${name} buffer must fade to ~0 at the loop seam (got ${data[data.length - 1]})`);
    }
});
check('every drum voice ends at zero (no mid-loop tail cliff, e.g. the kick ~step 3)', () => {
    const env = load();
    const voices = env.drumVoices(44100);
    assert(voices && voices.kick, 'drumVoices should expose the baked voices');
    for (const name of Object.keys(voices)) {
        const s = voices[name];
        // The exponential envelopes end at ~8–11%; AudioModality.declickTail must fade
        // each voice's tail to zero so it doesn't step to silence mid-loop and click.
        assert(Math.abs(s[s.length - 1]) < 1e-4, `voice "${name}" must end at ~0 (got ${s[s.length - 1]})`);
    }
});
check('MIDI output present → send live notes (and no synth buffer)', () => {
    const env = load();
    const sent = [];
    env.sandbox.window.framework.sharedMIDI.midiOutput = { send: (bytes) => sent.push(bytes) };
    for (const name of seqTypes) {
        const ind = new env.classes[name]();
        // Guarantee at least one note so the scheduler emits something.
        const p = ind.phenotype; p.length = 16; p.grid[0][0] = 0.9;
        ind.playMIDI();
        assert(env.sandbox.window.framework.sharedAudio.isActive === false, `${name} must NOT use the synth when MIDI is available`);
        ind.stopMIDI();
    }
    assert(sent.some(b => (b[0] & 0xf0) === 0x90), 'a note-on (0x9n) should have been sent to the MIDI output');
    assert(sent.some(b => (b[0] & 0xf0) === 0x80), 'a note-off (0x8n) should have been sent to the MIDI output');
});

// --- Image save: PNG metadata round-trip ---
// Saved PNGs embed {type, genome, ...} in an uncompressed iTXt chunk so an
// individual can be reproduced later. The chunk must read back byte-identically
// (incl. UTF-8 and nested genome data) and must be spliced in without breaking
// the PNG signature or the trailing IEND chunk.
console.log('\nImage save (PNG metadata round-trip):');
// The browser-global export services share one window; load them together so
// metaFor (ImageSave) is available to the WAV/MIDI writers, exactly as in the app.
const { ImageSave, ExportNaming, AudioExport, MidiExport } = (() => {
    const prev = global.window;
    const w = {};
    global.window = w;
    for (const f of ['../export/ExportNaming.js', '../export/ImageSave.js', '../export/AudioExport.js', '../export/MidiExport.js']) {
        delete require.cache[require.resolve(f)];
        require(f);
    }
    global.window = prev;
    return w;
})();
check('embedded metadata reads back identically (UTF-8 + nested genome)', () => {
    const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const iendType = new Uint8Array([73, 69, 78, 68]); // "IEND"
    const png = new Uint8Array([...sig, ...u32(0), ...iendType, ...u32(ImageSave.crc32(iendType))]);

    const meta = { app: 'Anemone', type: 'AnemoneIndividual', genome: [1, 2, 'x', { a: 3 }], note: 'café→π' };
    const out = ImageSave.insertChunk(png, ImageSave.buildITxtChunk('anemone', JSON.stringify(meta)));

    assert(JSON.stringify(ImageSave.readMetadata(out)) === JSON.stringify(meta), 'metadata did not round-trip');
    assert(sig.every((b, i) => out[i] === b), 'PNG signature corrupted');
    assert(String.fromCharCode(...out.slice(-8, -4)) === 'IEND', 'IEND must remain last chunk');
});
check('ExportNaming builds a type-stemmed, timestamped filename', () => {
    assert(ExportNaming.stem('SuperShape3DIndividual') === 'supershape3d',
        'stem strips the Individual suffix and lowercases');
    const name = ExportNaming.filename({ constructor: { name: 'DrumMachineIndividual' } }, 'mid');
    assert(/^anemone-drummachine-[\dT-]+\.mid$/.test(name), `unexpected filename: ${name}`);
});
check('phenotype signature is stable and discriminates', () => {
    const a = new classes.PatternIndividual();
    assert(ImageSave.phenotypeSignature(a) === ImageSave.phenotypeSignature(a), 'signature must be stable');
    let differ = 0;
    for (let i = 0; i < 5; i++) {
        const b = new classes.PatternIndividual();
        if (ImageSave.phenotypeSignature(a) !== ImageSave.phenotypeSignature(b)) differ++;
    }
    assert(differ > 0, 'distinct individuals should usually get distinct signatures');
});
// Load = reconstruct from the saved genome + verify via signature. All PTO-backed
// types (including grammar individuals) round-trip through serialisation now that
// generators use rnd.randint (primitive) instead of rnd.choice (production array)
// for production selection, avoiding the upstream PTO identity-compare bug.
check('fixed-structure individuals reproduce after a genome round-trip (load works)', () => {
    let ok = 0;
    for (let i = 0; i < 30; i++) {
        const orig = new classes.PatternIndividual();
        const sig = ImageSave.phenotypeSignature(orig);
        const recon = new classes.PatternIndividual(JSON.parse(JSON.stringify(orig.genome)));
        if (ImageSave.phenotypeSignature(recon) === sig) ok++;
    }
    assert(ok === 30, `expected all 30 to round-trip, got ${ok}`);
});
// A loaded individual carries a serialised "dead" trace; the loader revives it
// so the next evolve doesn't crash on the missing Dist operators. Mirror that
// revive step and confirm mutate/crossover work (and the phenotype is intact).
check('revived genome reproduces and can still evolve (no dead-trace crash)', () => {
    const orig = new classes.PatternIndividual();
    const sig = ImageSave.phenotypeSignature(orig);
    const recon = new classes.PatternIndividual(JSON.parse(JSON.stringify(orig.genome)));

    // Dead trace must throw on crossover (the bug we're guarding against).
    let deadThrew = false;
    try { recon.crossover(new classes.PatternIndividual()); } catch (e) { deadThrew = true; }
    assert(deadThrew, 'expected the un-revived (dead) trace to throw on crossover');

    // Revive exactly as the loader does, then it must evolve without throwing.
    recon.genome = recon.representation.revive(recon.genome);
    assert(ImageSave.phenotypeSignature(recon) === sig, 'revive must preserve the phenotype');
    recon.mutate(0.3);
    const [a, b] = recon.crossover(new classes.PatternIndividual());
    assert(a instanceof classes.PatternIndividual && b instanceof classes.PatternIndividual,
        'revived individual should crossover into valid children');
});
check('grammar individuals round-trip through JSON after rnd.randint fix (load works)', () => {
    let ok = 0;
    for (let i = 0; i < 30; i++) {
        const orig = new classes.PatternGrammarIndividual();
        const sig = ImageSave.phenotypeSignature(orig);
        const recon = new classes.PatternGrammarIndividual(JSON.parse(JSON.stringify(orig.genome)));
        if (ImageSave.phenotypeSignature(recon) === sig) ok++;
    }
    assert(ok === 30, `expected all 30 grammar individuals to round-trip, got ${ok}`);
});

// --- WAV / MIDI export metadata + reconstruct ---
// WAV and MIDI exports carry the same {type, genome, phenotype, phenoSig}
// provenance the PNG does (metaFor), so a saved audio file can be reconstructed
// the same way a saved PNG is. WAV puts it in a custom RIFF 'anmn' chunk; MIDI in
// an SMF sequencer-specific meta event (FF 7F).
console.log('\nAudio/MIDI export metadata:');
check('metaFor embeds the expressed phenotype alongside the genome', () => {
    const ind = new classes.GridIndividual();
    const meta = ImageSave.metaFor(ind);
    assert(meta.genome != null && meta.phenoSig != null, 'genome + phenoSig present');
    assert(meta.phenotype !== undefined, 'phenotype present');
    assert(JSON.stringify(meta.phenotype) === JSON.stringify(ind.getPhenotype()),
        'phenotype must be the expressed value');
});
check('WAV carries provenance in an anmn chunk and still frames as RIFF', () => {
    const buf = { numberOfChannels: 1, sampleRate: 44100, length: 3,
        getChannelData: () => new Float32Array([0, 0.5, -0.5]) };
    const metaJson = JSON.stringify({ app: 'Anemone', type: 'X', n: 'café→π' }); // odd byte length → pad
    const wav = new Uint8Array(AudioExport.encodeWAV(buf, metaJson));
    const riffSize = new DataView(wav.buffer).getUint32(4, true);
    assert(riffSize + 8 === wav.length, 'RIFF size field must include the anmn chunk');
    assert(JSON.stringify(AudioExport.readMetadata(wav)) === metaJson, 'anmn metadata did not round-trip');
    assert(AudioExport.readMetadata(new Uint8Array(AudioExport.encodeWAV(buf))) === null,
        'a plain WAV (no metadata) reads back null');
});
// A strict SMF reader: consumes exactly the `ntracks` MTrk chunks the header
// declares (as any DAW does), parsing note events, then records any TRAILING
// top-level chunks (our metadata lives in a non-MTrk "anmn" chunk that a DAW
// skips). Proves the notes are a clean track and the metadata is outside it.
function parseSMF(smf) {
    const view = new DataView(smf.buffer, smf.byteOffset, smf.byteLength);
    const tag = o => String.fromCharCode(smf[o], smf[o + 1], smf[o + 2], smf[o + 3]);
    if (tag(0) !== 'MThd') throw new Error('not an SMF');
    const out = { format: view.getUint16(8), ntrk: view.getUint16(10), tracks: [], trailing: [] };
    let cur = 8 + view.getUint32(4);
    for (let t = 0; t < out.ntrk; t++) {
        if (tag(cur) !== 'MTrk') throw new Error('expected MTrk at ' + cur);
        const end = cur + 8 + view.getUint32(cur + 4);
        let p = cur + 8, running = 0, noteOns = 0, outOfRange = 0, evs = 0;
        const vlq = () => { let v = 0, b; do { b = smf[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
        while (p < end && evs < 1e6) {
            vlq(); // delta
            let s = smf[p]; if (s & 0x80) p++; else s = running;
            if (s === 0xff) { running = 0; const type = smf[p++]; const len = vlq(); p += len; if (type === 0x2f) break; }
            else if (s === 0xf0 || s === 0xf7) { running = 0; p += vlq(); }
            else { running = s; const hi = s & 0xf0; const nb = (hi === 0xc0 || hi === 0xd0) ? 1 : 2; if (hi === 0x90) { noteOns++; if (smf[p] > 127 || smf[p + 1] > 127) outOfRange++; } p += nb; }
            evs++;
        }
        out.tracks.push({ noteOns, outOfRange, landed: p === end });
        cur = end;
    }
    // Trailing (non-track) chunks — where the Anemone metadata lives, ignored by DAWs.
    while (cur + 8 <= smf.length) { out.trailing.push({ type: tag(cur), len: view.getUint32(cur + 4) }); cur += 8 + view.getUint32(cur + 4); }
    out.consumedAll = cur === smf.length;
    return out;
}
check('MIDI keeps its metadata in a non-track chunk that DAWs ignore', () => {
    const seq = { bpm: 128, ppq: 96, notes: [
        { pitch: 36, velocity: 100, start: 0, duration: 24, channel: 9 },
        { pitch: 38, velocity: 90, start: 48, duration: 24, channel: 9 },
    ] };
    const metaJson = JSON.stringify({ app: 'Anemone', type: 'DrumMachineIndividual', n: 'π' });
    const p = parseSMF(MidiExport.buildSMF(seq, metaJson));
    assert(p.format === 0 && p.ntrk === 1, 'format 0, a single note track');
    assert(p.tracks[0].noteOns === seq.notes.length && p.tracks[0].landed, 'the track holds all notes and frames cleanly');
    assert(p.trailing.length === 1 && p.trailing[0].type === 'anmn', 'metadata is a trailing non-MTrk "anmn" chunk');
    assert(p.consumedAll, 'all bytes accounted for');
    assert(JSON.stringify(MidiExport.readMetadata(MidiExport.buildSMF(seq, metaJson))) === metaJson,
        'metadata round-trips');
    assert(parseSMF(MidiExport.buildSMF(seq, null)).trailing.length === 0, 'no metadata chunk when none embedded');
});
check('notes stay clean even with a large (34KB-ish) metadata blob — the Logic bug', () => {
    // A real drum-machine genome serialises to tens of KB. Kept OUT of the track
    // (an in-track meta event that big made Logic/GB mis-parse the track), so the
    // note track stays clean and the blob is an ignorable trailing chunk.
    const dm = new classes.DrumMachineIndividual();
    const p = parseSMF(MidiExport.buildSMF(dm.toMIDISequence(), JSON.stringify(ImageSave.metaFor(dm))));
    assert(p.tracks[0].noteOns > 0 && p.tracks[0].outOfRange === 0 && p.tracks[0].landed,
        'note track has the loop and zero out-of-range events');
    assert(p.trailing.some(c => c.type === 'anmn'), 'the big blob sits outside the track');
});
check('DrumMachine + Melody produce valid MIDI sequences on the right channels', () => {
    const dseq = new classes.DrumMachineIndividual().toMIDISequence();
    assert(dseq.notes.length > 0 && dseq.notes.every(n => n.channel === 9), 'drums on GM channel 9');
    assert(dseq.notes.every(n => n.velocity >= 1 && n.velocity <= 127 && n.pitch >= 0 && n.pitch <= 127),
        'drum notes in range');
    const mseq = new classes.MelodyIndividual().toMIDISequence();
    assert(mseq.notes.every(n => n.channel === 0), 'melody on channel 0');
    const mp = parseSMF(MidiExport.buildSMF(mseq, null));
    assert(mp.tracks[0].noteOns === mseq.notes.length, 'melody note track holds all the notes');
});
check('a saved MIDI reconstructs the same individual (the load path)', () => {
    const orig = new classes.MelodyIndividual();          // fixed-structure ⇒ round-trips
    const meta = ImageSave.metaFor(orig);
    const smf = MidiExport.buildSMF(orig.toMIDISequence(), JSON.stringify(meta));
    const read = MidiExport.readMetadata(smf);
    assert(read && read.type === 'MelodyIndividual', 'type recovered from the file');
    const recon = new classes.MelodyIndividual(JSON.parse(JSON.stringify(read.genome)));
    assert(ImageSave.phenotypeSignature(recon) === meta.phenoSig,
        'reconstructed phenotype must match the saved signature');
});
check('a saved WAV reconstructs the same individual (the load path)', () => {
    const orig = new classes.DrumMachineIndividual();     // fixed-structure ⇒ round-trips
    const meta = ImageSave.metaFor(orig);
    const buf = { numberOfChannels: 1, sampleRate: 44100, length: 2, getChannelData: () => new Float32Array([0, 0]) };
    const wav = new Uint8Array(AudioExport.encodeWAV(buf, JSON.stringify(meta)));
    const read = AudioExport.readMetadata(wav);
    assert(read && read.type === 'DrumMachineIndividual', 'type recovered from the WAV');
    const recon = new classes.DrumMachineIndividual(JSON.parse(JSON.stringify(read.genome)));
    assert(ImageSave.phenotypeSignature(recon) === meta.phenoSig,
        'reconstructed phenotype must match the saved signature');
});
check('MelodyIndividual opts out of PNG save (MIDI-only)', () => {
    assert(new classes.MelodyIndividual().usesImageSave() === false, 'Melody should not offer PNG save');
    assert(new classes.GridIndividual().usesImageSave() === true, 'other types still save PNG by default');
});

// --- MIDI Clock Sync (window.MIDISync) ---
// Lets an external DAW (GarageBand/Logic sending Beat Clock over the same IAC bus
// Anemone's note output uses) drive tempo/phase for the step sequencers, and the
// evaluation cadence for the mouse/EEG DAG individuals. Each check uses a fresh
// load() since MIDISync is stateful (enabled/running/bpm) singleton, like the
// shared-modality checks above.
console.log('\nMIDI Clock Sync:');
check('usesMIDISync() only on step sequencers and mouse/EEG DAG individuals', () => {
    const env = load();
    for (const name of ['DrumMachineIndividual', 'MelodyIndividual', 'MouseMusicIndividual', 'EEGSonificationIndividual']) {
        assert(new env.classes[name]().usesMIDISync() === true, `${name} should opt into MIDI sync`);
    }
    assert(new env.classes.GridIndividual().usesMIDISync() === false, 'a non-sound type should not opt in');
});
check('ignores Start/Clock messages while disabled (default)', () => {
    const env = load();
    const sync = env.sandbox.window.MIDISync;
    sync.handleMessage([0xFA], 0);
    sync.handleMessage([0xF8], 20);
    assert(sync.running === false && sync.bpm === null, 'disabled sync should not track any state');
    assert(sync.active === false, 'inactive while disabled');
});
check('estimates BPM from a run of Beat Clock pulses (24 ppqn)', () => {
    const env = load();
    const sync = env.sandbox.window.MIDISync;
    sync.enabled = true;
    sync.handleMessage([0xFA], 0); // Start
    const tickMs = 60000 / 120 / 24; // 120 BPM
    for (let i = 1; i <= 48; i++) sync.handleMessage([0xF8], i * tickMs);
    assert(sync.running === true, 'Start should mark the transport running');
    assert(Math.abs(sync.bpm - 120) < 0.5, `expected ~120 BPM, got ${sync.bpm}`);
    assert(sync.active === true, 'active once enabled + running + a recent tick');
});
check('Stop clears running (and so active)', () => {
    const env = load();
    const sync = env.sandbox.window.MIDISync;
    sync.enabled = true;
    sync.handleMessage([0xFA], 0);
    const tickMs = 60000 / 100 / 24;
    for (let i = 1; i <= 30; i++) sync.handleMessage([0xF8], i * tickMs);
    assert(sync.active === true, 'active while ticking');
    sync.handleMessage([0xFC], 9999); // Stop
    assert(sync.running === false, 'Stop should clear running');
    assert(sync.active === false, 'inactive after Stop');
});
check('PerformanceControls.apply() overrides bpm from an active sync, bypassing a locked bpm dial', () => {
    const env = load();
    const sync = env.sandbox.window.MIDISync;
    const pc = env.sandbox.window.PerformanceControls;
    sync.enabled = true;
    sync.handleMessage([0xFA], 0);
    const tickMs = 60000 / 140 / 24;
    for (let i = 1; i <= 30; i++) sync.handleMessage([0xF8], i * tickMs);
    pc.dials.bpm.on = true; pc.dials.bpm.value = 90; // a manually-locked tempo dial
    const out = pc.apply({ bpm: 70, swing: 0.1 });
    assert(Math.abs(out.bpm - 140) < 0.5, `synced bpm should win over the locked dial (90), got ${out.bpm}`);
});
check('Transport.phase() locks to the sync epoch (last Start/Continue) while active', () => {
    const env = load();
    const sync = env.sandbox.window.MIDISync;
    const transport = env.sandbox.window.Transport;
    sync.enabled = true;
    sync.handleMessage([0xFA], 1000); // Start at t=1000ms -> epoch = 1s
    const tickMs = 60000 / 120 / 24;
    for (let i = 1; i <= 30; i++) sync.handleMessage([0xF8], 1000 + i * tickMs);
    assert(sync.active === true, 'sync should be active for the phase test');
    // performance.now() is stubbed to 0, so phase = (0 - epoch) mod barLen, wrapped positive.
    assert(transport.phase(4) === 3, `expected phase 3 (barLen 4, epoch 1s, now 0s), got ${transport.phase(4)}`);
});
check('MIDIModality.start() paces the DAG-callback loop to the synced BPM (16th-note interval)', () => {
    const env = load();
    const sync = env.sandbox.window.MIDISync;
    sync.enabled = true;
    sync.handleMessage([0xFA], 0);
    const tickMs = 60000 / 120 / 24; // 120 BPM
    for (let i = 1; i <= 30; i++) sync.handleMessage([0xF8], i * tickMs);
    assert(sync.active === true, 'sync must be active for this test');

    let capturedInterval = null;
    env.sandbox.setTimeout = (fn, ms) => { capturedInterval = ms; return 0; };

    const midi = new env.MIDIModality();
    let calls = 0;
    midi.start(() => { calls++; }, 100);
    assert(calls === 1, 'the first tick should fire immediately');
    assert(Math.abs(capturedInterval - (60000 / 120 / 4)) < 1e-6,
        `expected a 16th-note interval at 120 BPM (125ms), got ${capturedInterval}`);
    midi.stop();
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
}

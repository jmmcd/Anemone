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
const { load, INDIVIDUAL_CLASSES } = require('./harness');

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

const { classes, makeCanvas } = load();

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
        assert(clone !== a && clone.genome !== a.genome, 'clone must be a distinct object');
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

// --- Capability flags ---
console.log('\nCapability flags:');
const expectedPalette = {
    GPPatternIndividual: true, GrammaticalEvolutionIndividual: true,
    GERadiusDrawingIndividual: true, DrawingCommandIndividual: true,
    SuperFormulaIndividual: true, SuperFormula3DIndividual: true,
    CreatureIndividual: true,
    BinaryPatternIndividual: false, CharacterIndividual: false,
    SheepIndividual: false, PenroseIndividual: false,
    MusicIndividual: false, DAGIndividual: false, EEGSonificationIndividual: false,
};
check('usesColorPalette() matches expectation', () => {
    for (const [name, expect] of Object.entries(expectedPalette)) {
        const ind = new classes[name]();
        assert(ind.usesColorPalette() === expect, `${name}.usesColorPalette() should be ${expect}`);
    }
});
check('SuperFormula3DIndividual is the only 3D type', () => {
    for (const name of INDIVIDUAL_CLASSES) {
        const ind = new classes[name]();
        const expect = name === 'SuperFormula3DIndividual';
        assert(ind.is3D() === expect, `${name}.is3D() should be ${expect}`);
    }
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
    assert(new classes.SuperFormulaIndividual().describe().includes('Formula'), 'missing formula block');
    assert(new classes.SuperFormula3DIndividual().describe().includes('r₁(θ)'), 'missing 3D formula block');
});
check('tree / array genomes pick the right section', () => {
    assert(new classes.GPPatternIndividual().describe().includes('Expression Tree'), 'GP should show its tree');
    assert(new classes.BinaryPatternIndividual().describe().includes('Genome (64 elements)'), 'binary genome dump');
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

// --- GE Radius expression compilation regression ---
// Regression for the protected-division regex that mangled any expression
// containing '/' or '%' into uncompilable code, so it fell back to a constant
// r = 1.0 (the dotty fallback circle). Division expressions must now evaluate.
console.log('\nGE Radius expression compilation:');
check('division/modulo expressions compile and vary with t (not constant 1.0)', () => {
    const ind = new classes.GERadiusDrawingIndividual();
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
        assert(row.length === sheep.genome.length, 'each hidden node needs one weight per genome input');
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
const soundTypes = ['MusicIndividual', 'DAGIndividual', 'EEGSonificationIndividual'];
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

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
}

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

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
}

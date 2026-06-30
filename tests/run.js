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
    GridIndividual: false, RobotIndividual: false,
    SheepIndividual: false, PenroseIndividual: false,
    MelodyIndividual: false, MouseMusicIndividual: false, EEGSonificationIndividual: false,
};
check('usesColorPalette() matches expectation', () => {
    for (const [name, expect] of Object.entries(expectedPalette)) {
        const ind = new classes[name]();
        assert(ind.usesColorPalette() === expect, `${name}.usesColorPalette() should be ${expect}`);
    }
});
check('SuperShape3DIndividual is the only 3D type', () => {
    for (const name of INDIVIDUAL_CLASSES) {
        const ind = new classes[name]();
        const expect = name === 'SuperShape3DIndividual';
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

// --- Image save: PNG metadata round-trip ---
// Saved PNGs embed {type, genome, ...} in an uncompressed iTXt chunk so an
// individual can be reproduced later. The chunk must read back byte-identically
// (incl. UTF-8 and nested genome data) and must be spliced in without breaking
// the PNG signature or the trailing IEND chunk.
console.log('\nImage save (PNG metadata round-trip):');
const ImageSave = (() => {
    const prev = global.window;
    global.window = {};
    delete require.cache[require.resolve('../ImageSave.js')];
    require('../ImageSave.js');
    const api = global.window.ImageSave;
    global.window = prev;
    return api;
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
check('filename increments and strips the Individual suffix', () => {
    let store = '7';
    const prev = global.localStorage;
    global.localStorage = { getItem: () => store, setItem: (k, v) => { store = v; } };
    const name = ImageSave.nextFilename('SuperShape3DIndividual');
    global.localStorage = prev;
    assert(name === 'anemone-supershape3d-0008.png', `unexpected filename: ${name}`);
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
// Load = reconstruct from the saved genome + verify via signature. Fixed-structure
// types round-trip through serialisation; grammar individuals do NOT (the known
// upstream PTO trace bug, see pto-trace-roundtrip-bug.js), so the loader's
// self-check is what keeps load honest.
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
check('self-check detects grammar individuals that cannot round-trip (load refuses)', () => {
    let reproduced = 0;
    for (let i = 0; i < 30; i++) {
        const orig = new classes.PatternGrammarIndividual();
        const sig = ImageSave.phenotypeSignature(orig);
        const recon = new classes.PatternGrammarIndividual(JSON.parse(JSON.stringify(orig.genome)));
        if (ImageSave.phenotypeSignature(recon) === sig) reproduced++;
    }
    // Most (effectively all) must fail to reproduce; the signature mismatch is
    // exactly what the loader uses to refuse them.
    assert(reproduced < 30, `grammar individuals unexpectedly all round-tripped (${reproduced}/30)`);
});

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
}

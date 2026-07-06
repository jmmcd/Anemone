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
    GridIndividual: true, RobotIndividual: false,
    SheepIndividual: false, PenroseIndividual: false,
    MelodyIndividual: true, MouseMusicIndividual: false, EEGSonificationIndividual: false,
};
check('usesColorPalette() matches expectation', () => {
    for (const [name, expect] of Object.entries(expectedPalette)) {
        const ind = new classes[name]();
        assert(ind.usesColorPalette() === expect, `${name}.usesColorPalette() should be ${expect}`);
    }
});
check('only the RadialSurface3D family reports is3D()', () => {
    // The 3D types are exactly the RadialSurface3DIndividual subclasses.
    const threeD = new Set([
        'SuperShape3DIndividual', 'PetalSphere3DIndividual',
        'FreeSurface3DIndividual', 'WarpedSurface3DIndividual',
    ]);
    for (const name of INDIVIDUAL_CLASSES) {
        const ind = new classes[name]();
        const expect = threeD.has(name);
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
    for (const f of ['../ExportNaming.js', '../ImageSave.js', '../AudioExport.js', '../MidiExport.js']) {
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

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
}

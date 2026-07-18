/**
 * Test harness for Anemone.
 *
 * The app is plain browser <script> files with no module system, so this harness
 * loads the source files into a Node `vm` sandbox with minimal browser stubs
 * (window, document, a no-op 2D canvas context, a palette stub). It exposes the
 * individual classes so tests can construct and exercise them headlessly.
 *
 * Anemone.js and main.js are intentionally NOT loaded — they auto-run framework
 * setup that needs a real DOM/MIDI environment.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// Source files in dependency order (classes use `extends` at definition time,
// so base classes must come first; representations/modalities before individuals).
// IMPORTANT: keep this in sync with the <script> tags in index.html whenever an
// individual type is added/removed or a base class is introduced — a missing base
// (e.g. RadialSurface3DIndividual before its subclasses) makes the whole bundle
// throw a ReferenceError at load and every test fails. See CLAUDE.md > Testing.
const SOURCES = [
    'vendor/pto-bundle.js',
    'Individual.js',
    'representations/TreeRepresentation.js',
    'representations/DAGRepresentation.js',
    'representations/PTORepresentation.js',
    'Grammar.js',
    'modalities/Canvas2DModality.js',
    'modalities/MIDIModality.js',
    'modalities/AudioModality.js',
    'modalities/ThreeDModality.js',
    'MIDISync.js',              // window.MIDISync (external MIDI clock sync; consulted by Transport/PerformanceControls/MIDIModality)
    'PerformanceControls.js',   // window.PerformanceControls + window.Transport (step-sequencer dials/clock)
    'EvolutionaryAlgorithm.js',
    // Individuals (base classes before their subclasses).
    'GridIndividual.js',
    'ShapesIndividual.js',
    'PhotoFilterIndividual.js',
    'AntRenderingIndividual.js',
    'AudioFilterIndividual.js',
    'DrumMachineIndividual.js',
    'MelodyIndividual.js',
    'MouseMusicIndividual.js',
    'EEGPreprocessing.js',
    'EEGSonificationIndividual.js',
    'PatternIndividual.js',
    'PatternGrammarIndividual.js',
    'AnimatedPatternIndividual.js',
    'PolarCurveIndividual.js',
    'AnemoneIndividual.js',
    'BranchIndividual.js',
    'SuperShapeIndividual.js',
    'RadialSurface3DIndividual.js',   // base for the 3D surface family
    'SuperShape3DIndividual.js',
    'PetalSphere3DIndividual.js',
    'FreeSurface3DIndividual.js',
    'WarpedSurface3DIndividual.js',
    'RobotIndividual.js',
    'HoxCreatureIndividual.js',
    'SheepIndividual.js',
    'PenroseIndividual.js',
    'PSystemIndividual.js',
];

// Every concrete individual class, in the order the UI lists them.
const INDIVIDUAL_CLASSES = [
    'PatternIndividual',
    'PatternGrammarIndividual',
    'AnimatedPatternIndividual',
    'PolarCurveIndividual',
    'ShapesIndividual',
    'PhotoFilterIndividual',
    'AntRenderingIndividual',
    'GridIndividual',
    'SuperShapeIndividual',
    'SuperShape3DIndividual',
    'PetalSphere3DIndividual',
    'FreeSurface3DIndividual',
    'WarpedSurface3DIndividual',
    'AnemoneIndividual',
    'BranchIndividual',
    'RobotIndividual',
    'HoxCreatureIndividual',
    'SheepIndividual',
    'PenroseIndividual',
    'PSystemIndividual',
    'MelodyIndividual',
    'DrumMachineIndividual',
    'AudioFilterIndividual',
    'MouseMusicIndividual',
    'EEGSonificationIndividual',
];

/** A no-op 2D canvas context that records nothing but never throws. */
function makeContext() {
    const noop = () => {};
    const imageData = (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    return {
        createImageData: imageData,
        getImageData: (x, y, w, h) => imageData(w, h),
        putImageData: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
        beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
        arc: noop, arcTo: noop, ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
        fill: noop, stroke: noop, save: noop, restore: noop,
        translate: noop, scale: noop, rotate: noop, setLineDash: noop, fillText: noop,
        // settable properties used by the drawing code
        fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
        lineJoin: 'miter', font: '10px monospace', textAlign: 'left',
        globalAlpha: 1, imageSmoothingEnabled: true,
    };
}

/** A stub canvas of the given size. */
function makeCanvas(width = 64, height = 64) {
    return { width, height, getContext: () => makeContext() };
}

/**
 * Load all sources into a fresh sandbox and return { sandbox, classes, makeCanvas }.
 * `classes` maps class name -> constructor for every individual type.
 */
function load() {
    // Quiet the individuals' own console.log chatter; keep warn/error visible.
    const quietConsole = Object.assign(Object.create(console), { log: () => {}, info: () => {}, time: () => {}, timeEnd: () => {} });
    const sandbox = {
        console: quietConsole, Math, Date, Array, Object, Function, JSON,
        isFinite, isNaN, parseInt, parseFloat, Uint8ClampedArray, Float32Array,
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        performance: { now: () => 0 },
    };
    sandbox.window = {
        framework: { settings: { colorPalette: 'viridis' } },
        Palette: {
            defaultPalette: 'viridis',
            name() {
                return (this.framework && this.framework.settings.colorPalette) || this.defaultPalette;
            },
            color(t, name = this.name()) {
                return {
                    r: Math.round(255 * Math.max(0, Math.min(1, t))),
                    g: Math.round(128 * Math.max(0, Math.min(1, t))),
                    b: 64,
                    hex: '#ff8040',
                    css: `rgb(${Math.round(255 * Math.max(0, Math.min(1, t)))}, ${Math.round(128 * Math.max(0, Math.min(1, t)))}, 64)`
                };
            },
            getColor(name, t) {
                return this.color(t, name);
            },
            getColorSwatch(paletteName, numColors = 8) {
                const colors = [];
                for (let i = 0; i < numColors; i++) {
                    colors.push(this.getColor(paletteName, i / (numColors - 1)));
                }
                return colors;
            },
            getPaletteList() {
                return ['viridis', 'plasma', 'inferno', 'blues', 'reds'];
            },
            getPaletteInfo(name) {
                return { description: name.charAt(0).toUpperCase() + name.slice(1), type: 'sequential' };
            }
        },
        // Shared source-photo service (PhotoFilterIndividual). A tiny flat image is
        // enough to exercise the render path headlessly.
        Photo: {
            version() { return 1; },
            sourceImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
        },
        // Shared source-clip service (AudioFilterIndividual waveform tile). The
        // context stub is a tiny Web Audio recorder — enough for AudioModality's
        // play/stop lifecycle (createBufferSource/createGain/connect/start/stop).
        AudioClip: {
            peaks(w) { return { max: new Array(w).fill(0.5), min: new Array(w).fill(-0.5) }; },
            buffer() { return { duration: 1, sampleRate: 44100, length: 44100, numberOfChannels: 1, getChannelData: () => new Float32Array(44100) }; },
            context() {
                if (this._ctx) return this._ctx;
                // One generic AudioNode stub with all the params/props the graph code
                // sets, so any create*() works (createGain/Delay/Biquad/… all reuse it).
                const node = () => ({
                    connect() { }, disconnect() { }, start() { }, stop() { },
                    gain: { value: 1 }, frequency: { value: 0 }, Q: { value: 1 },
                    delayTime: { value: 0 }, detune: { value: 0 },
                    threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 1 },
                    attack: { value: 0 }, release: { value: 0 },
                    type: 'sine', curve: null, oversample: 'none', buffer: null, loop: false,
                });
                const ctx = {
                    state: 'running', currentTime: 0, sampleRate: 44100, destination: node(),
                    resume() { },
                    // Persist channel arrays so a test can read back what renderToAudioBuffer wrote.
                    createBuffer: (ch, len, sr) => { const chans = Array.from({ length: ch }, () => new Float32Array(len)); return { duration: len / sr, length: len, sampleRate: sr, numberOfChannels: ch, getChannelData: (c) => chans[c || 0] }; },
                };
                for (const m of ['createBufferSource', 'createGain', 'createBiquadFilter',
                    'createOscillator', 'createDelay', 'createWaveShaper', 'createConvolver',
                    'createDynamicsCompressor', 'createStereoPanner']) ctx[m] = node;
                this._ctx = ctx;
                return ctx;
            },
        },
    };
    sandbox.document = { addEventListener: () => {}, getElementById: () => null };
    sandbox.navigator = {};
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);

    let combined = '';
    for (const rel of SOURCES) {
        combined += fs.readFileSync(path.join(ROOT, rel), 'utf8') + '\n';
    }
    // Re-expose the lexically-scoped class declarations on the sandbox global.
    combined += `;globalThis.__classes = { ${INDIVIDUAL_CLASSES.join(', ')} };\n`;
    combined += `;globalThis.__MIDIModality = MIDIModality;\n`;
    combined += `;globalThis.__AudioModality = AudioModality;\n`;
    combined += `;globalThis.__Canvas2DModality = Canvas2DModality;\n`;
    combined += `;globalThis.__EvolutionaryAlgorithm = EvolutionaryAlgorithm;\n`;
    combined += `;globalThis.__TerminalNode = TerminalNode;\n`;
    combined += `;globalThis.__drumVoices = (typeof drumVoices === 'function') ? drumVoices : null;\n`;
    vm.runInContext(combined, sandbox, { filename: 'anemone-bundle.js' });

    // Mirror the app: single shared output modalities on the framework, which sound
    // individuals reference instead of each constructing their own.
    sandbox.window.framework.sharedMIDI = new sandbox.__MIDIModality();
    sandbox.window.framework.sharedAudio = new sandbox.__AudioModality();

    return {
        sandbox,
        classes: sandbox.__classes,
        makeCanvas,
        MIDIModality: sandbox.__MIDIModality,
        AudioModality: sandbox.__AudioModality,
        Canvas2DModality: sandbox.__Canvas2DModality,
        EvolutionaryAlgorithm: sandbox.__EvolutionaryAlgorithm,
        TerminalNode: sandbox.__TerminalNode,
        drumVoices: sandbox.__drumVoices,
    };
}

module.exports = { load, makeCanvas, INDIVIDUAL_CLASSES };

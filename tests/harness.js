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
const SOURCES = [
    'vendor/pto-bundle.js',
    'Individual.js',
    'representations/TreeRepresentation.js',
    'representations/DAGRepresentation.js',
    'representations/PTORepresentation.js',
    'Grammar.js',
    'modalities/Canvas2DModality.js',
    'modalities/MIDIModality.js',
    'modalities/ThreeDModality.js',
    'GridIndividual.js',
    'EvolutionaryAlgorithm.js',
    'PatternIndividual.js',
    'PatternGrammarIndividual.js',
    'PolarCurveIndividual.js',
    'ShapesIndividual.js',
    'AnemoneIndividual.js',
    'SuperShapeIndividual.js',
    'SuperShape3DIndividual.js',
    'RobotIndividual.js',
    'SheepIndividual.js',
    'PenroseIndividual.js',
    'MelodyIndividual.js',
    'MouseMusicIndividual.js',
    'EEGSonificationIndividual.js',
];

// Every concrete individual class, in the order the UI lists them.
const INDIVIDUAL_CLASSES = [
    'PatternIndividual',
    'PatternGrammarIndividual',
    'PolarCurveIndividual',
    'ShapesIndividual',
    'GridIndividual',
    'AnemoneIndividual',
    'SuperShapeIndividual',
    'SuperShape3DIndividual',
    'RobotIndividual',
    'SheepIndividual',
    'PenroseIndividual',
    'MelodyIndividual',
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
        arc: noop, ellipse: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
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
        }
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
    combined += `;globalThis.__Canvas2DModality = Canvas2DModality;\n`;
    combined += `;globalThis.__EvolutionaryAlgorithm = EvolutionaryAlgorithm;\n`;
    combined += `;globalThis.__TerminalNode = TerminalNode;\n`;
    vm.runInContext(combined, sandbox, { filename: 'anemone-bundle.js' });

    // Mirror the app: a single shared MIDIModality on the framework, which sound
    // individuals reference instead of each constructing their own.
    sandbox.window.framework.sharedMIDI = new sandbox.__MIDIModality();

    return {
        sandbox,
        classes: sandbox.__classes,
        makeCanvas,
        MIDIModality: sandbox.__MIDIModality,
        Canvas2DModality: sandbox.__Canvas2DModality,
        EvolutionaryAlgorithm: sandbox.__EvolutionaryAlgorithm,
        TerminalNode: sandbox.__TerminalNode,
    };
}

module.exports = { load, makeCanvas, INDIVIDUAL_CLASSES };

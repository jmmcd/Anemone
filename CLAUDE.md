# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Anemone is an interactive evolutionary computation (IEC) library for generating visual art, 3D graphics, and music through user-guided evolution. Users select individuals from a grid, then evolve new generations based on their preferences. The system is entirely client-side JavaScript with no build process.

## Running the Application

Open `index.html` directly in a browser (file:// protocol) or serve via HTTP:
```bash
python -m http.server 8000
# Then navigate to http://localhost:8000
```

There is no build step, test suite, or linting configuration in this repository.

## Architecture

The codebase separates three concerns:

1. **Representations** (`representations/`) — genome structure and genetic operators
2. **Modalities** (`modalities/`) — output mechanisms (rendering, audio)
3. **Individuals** (root `*.js`) — application code that composes representations and modalities

### Framework Layer (`Anemone.js`)
`InteractiveEAFramework` orchestrates the system:
- Initialises MIDI access, and shared 3D resources (Three.js scene/renderer)
- Extension system: individual types register UI panels and settings via `getFrameworkExtensions()`
- Settings management: framework-level settings (e.g. `colorPalette`) accessed via `getFrameworkSetting()`
- 3D resource management: single shared Three.js scene and renderer to avoid WebGL context exhaustion

### Evolutionary Algorithm (`EvolutionaryAlgorithm.js`)
- Tournament selection from user-selected individuals (fitness > 0)
- Elitism: top 2 selected individuals cloned into next generation
- Crossover and mutation fill remaining slots
- Generation history for time-travel (reload previous generations)

### Individual Base Class (`Individual.js`)
All individual types inherit from this:
- **Required methods**: `visualize(canvas)`, `mutate(rate)`, `crossover(other)`, `clone()`
- **Optional methods**: `getPhenotype()`, `is3D()`, `playMIDI()`, `stopMIDI()`
- **Caching**: `visualizeWithCache()` caches ImageData by genome+settings hash
- **Palette helpers**: `getPaletteByName()`, `interpolateColor()`
- Pass `'SKIP_GENOME_GENERATION'` as the genome argument to `super()` when the subclass manages genome creation itself

## Representations

| File | Genome type | Used by |
|---|---|---|
| `TreeRepresentation.js` | GP expression tree | GPPatternIndividual |
| `BinaryRepresentation.js` | `0/1` array | BinaryPatternIndividual, MusicIndividual |
| `IntegerRepresentation.js` | integer array 0-255 | DrawingCommandIndividual, DAGIndividual, EEGSonificationIndividual |
| `FloatRepresentation.js` | float array with per-gene bounds, Gaussian mutation | SuperFormula{,3D}, Character, Sheep, Penrose |
| `GrammaticalRepresentation.js` | integer array → BNF derivation → compiled JS function | GrammaticalEvolutionIndividual, GERadiusDrawingIndividual |
| `DAGRepresentation.js` | integer array → DAG of InputNode/ProcessingNode/OutputNode | DAGIndividual, EEGSonificationIndividual |

`DAGRepresentation` is configurable: pass `numInputs`, `numOutputs`, `numProcIndex`, `procOpsStartIndex`, `outputThresholdIndex`, `connectionStartIndex` to handle both the mouse-driven DAG (3 inputs, 3 outputs) and the EEG variant (5 inputs, 2 outputs).

## Modalities

| File | Purpose |
|---|---|
| `Canvas2DModality.js` | Pixel-by-pixel 2D rendering: takes an `(x,y)→value` evaluator and a `value→color` mapper |
| `MIDIModality.js` | `sendNote(pitch, velocity, duration)` with automatic Web Audio fallback; `allNotesOff()`; managed `start(callback, interval)` / `stop()` loop |
| `ThreeDModality.js` | `createMesh(vertices, indices, colors)` and `render(canvas, id, vertices, indices, colors, framework)` via the shared Three.js scene |

All sound-producing individuals hold a `MIDIModality` instance. MIDI output is wired in via `setMidiOutput(output)`; if no MIDI output is available (or a send fails), `sendNote` falls back to Web Audio synthesis automatically.

## Composition Pattern

Most individuals follow this structure:

```javascript
class SomeIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.floatRep = new FloatRepresentation({ length: N, bounds: [...] });
        this.genome = genome || this.floatRep.generateRandom();
    }

    visualize(canvas) { /* domain-specific rendering */ }

    mutate(rate)     { this.floatRep.mutate(this.genome, rate); this.invalidateImageCache(); }

    crossover(other) {
        const [g1, g2] = this.floatRep.crossover(this.genome, other.genome);
        return [new SomeIndividual(g1), new SomeIndividual(g2)];
    }

    clone() {
        const c = new SomeIndividual(this.floatRep.clone(this.genome));
        c.fitness = this.fitness;
        return c;
    }
}
```

Individuals with non-standard genome semantics (SuperFormula integer/float mix, Creature variable-length) keep custom `mutate`/`crossover` but still use the representation for helpers like `gaussianRandom` and `clone`.

**CreatureIndividual** is intentionally not refactored into a representation: its genome is variable-length (insert/delete/change mutation, two-point crossover with independent cut points), and its rendering is path-based rather than pixel-based, so neither IntegerRepresentation nor Canvas2DModality applies cleanly.

## Individual Types

| Individual | Representation | Modality | Notes |
|---|---|---|---|
| `GPPatternIndividual` | Tree | Canvas2D | GP over x,y,r,theta |
| `GrammaticalEvolutionIndividual` | Grammatical | Canvas2D | BNF grammar → expression |
| `GERadiusDrawingIndividual` | Grammatical | Canvas2D | Polar coordinate curves |
| `DrawingCommandIndividual` | Integer | Canvas2D | Sequence of drawing ops |
| `BinaryPatternIndividual` | Binary | Canvas2D | 8×8 grid |
| `SuperFormulaIndividual` | Float | Canvas2D | Gielis polar curve |
| `SuperFormula3DIndividual` | Float | ThreeD | 3D Gielis surface |
| `CreatureIndividual` | custom | Canvas2D | Variable-length turtle graphics |
| `CharacterIndividual` | Float | Canvas2D | Parametric cartoon character |
| `SheepIndividual` | Float | Canvas2D | Float genome fed into fixed-random neural network |
| `PenroseIndividual` | Float | Canvas2D | Kite-and-dart tiling |
| `MusicIndividual` | Binary | MIDI | 8-note sequences |
| `DAGIndividual` | Integer + DAG | MIDI | Mouse-driven DAG → notes |
| `EEGSonificationIndividual` | Integer + DAG | MIDI | EEG-stream-driven DAG → notes |

## Extension System

Individuals register UI panels:
```javascript
static getFrameworkExtensions() {
    return {
        ui: PaletteControlUI,
        settings: ['colorPalette'],
        hotkeys: {}
    };
}
```
The panel class needs a `mount(container)` method. Access framework settings via `this.framework.updateSetting(key, value)`, which triggers cache invalidation and re-rendering.

## 3D Rendering Strategy

To avoid WebGL context limits (typically 16), all 3D individuals share one `THREE.Scene` and one `THREE.WebGLRenderer`. The rendering loop (Anemone.js):
1. Temporarily isolate the target individual's mesh in the shared scene
2. Position a rotating camera to frame it
3. Render to the shared renderer's canvas
4. Copy pixels to the individual's display canvas via 2D context

3D individuals must implement `is3D() { return true; }`.

## Key Implementation Notes

- **Palette system** (`ContinuousPaletteSystem.js`): d3-scale-chromatic palettes accessed via `window.continuousPaletteSystem.getColor(paletteName, t)`. Visual individuals access palettes via the `withPaletteExtensions` mixin.
- **Image cache**: `visualizeWithCache(canvas, renderFn)` skips the render when genome and palette settings haven't changed. Call `this.invalidateImageCache()` after mutation.
- **Genome/phenotype display**: `Anemone.js` tracks `currentIndividual` (last-clicked) and calls `displayCurrentGenome()` to show type-specific formatted genome/phenotype below the grid.
- **MIDI init**: Framework requests MIDI at startup, prefers "IAC Driver" or "Logic Pro Virtual" outputs, and passes the output to individuals via `setMidiOutput()`.
- **EEG**: `EEGPreprocessing.js` (`EEGDataStream` class) parses Muse-headband CSV, aligns to 200ms grid, and computes 5 normalised features (mean, variance, peak, baseline, asymmetry) per window. The framework distributes the stream to EEG individuals via `setEEGDataStream()`.

## Common Patterns

**Adding a new individual type:**
1. Extend `Individual` or `withPaletteExtensions(Individual)`
2. Pick or create a `Representation` for the genome
3. Implement `visualize(canvas)` (and pick a `Modality` if it helps)
4. Delegate `mutate`, `crossover`, `clone` to the representation
5. Register in `Anemone.js` individual type selector and add `<script>` tags to `index.html`

**Sound-producing individual:**
```javascript
constructor(genome = null) {
    // ...
    this.midiModality = new MIDIModality();
}
setMidiOutput(output) { this.midiModality.setMidiOutput(output); }
// send notes:
this.midiModality.sendNote(pitch, velocity, duration); // falls back to Web Audio
// interval loop (DAG-style):
this.midiModality.start(() => this.evaluate(), this.timeStep);
this.midiModality.stop();
```

**3D individual:**
```javascript
is3D() { return true; }
visualize(canvas) {
    const framework = window.framework;
    if (framework?.shared3D) {
        const { vertices, indices, colors } = this.generateGeometry();
        this.threeDModality.render(canvas, this.id, vertices, indices, colors, framework);
    }
}
```

## Default Individual Type

Set in `main.js:1` as `SuperFormula3DIndividual`. Change this line to switch the startup default.

## Project Context

Designed by jmmcd, mostly implemented by Claude Code. Demonstrates IEC without training corpora or neural networks — pure evolutionary art generation.

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
- Initialises MIDI access, a single shared `MIDIModality` (`framework.sharedMIDI`), and shared 3D resources (Three.js scene/renderer)
- Tracks `currentlyPlaying` so only one sound individual plays at a time (they share one modality)
- Extension system: the framework attaches UI panels based on individual capability flags (e.g. the palette panel when `usesColorPalette()` is true)
- Settings management: framework-level settings (e.g. `colorPalette`) accessed via `getFrameworkSetting()`
- 3D resource management: single shared Three.js scene and renderer to avoid WebGL context exhaustion

### Evolutionary Algorithm (`EvolutionaryAlgorithm.js`)
- Tournament selection from user-selected individuals (fitness > 0)
- Elitism: top 2 selected individuals cloned into next generation
- Crossover and mutation fill remaining slots
- Generation history for time-travel (reload previous generations)

### Individual Base Class (`Individual.js`)
All individual types inherit from this:
- **Required method**: `visualize(canvas)`
- **Generic genetic operators**: `mutate(rate)`, `crossover(other)`, `clone()` are implemented in the base class and delegate to `this.representation` (the representation strategy object). A typical subclass only sets up `this.representation` + `this.genome` and implements `visualize()`; it does **not** override the operators. Override only for non-standard genome semantics (variable length, mixed int/float, MIDI re-wiring on clone, etc.).
- **Capability flags**: `is3D()` and `usesColorPalette()` (both default `false`). The framework reads these — `is3D()` drives the shared-3D render path; `usesColorPalette()` makes the framework attach the palette UI panel.
- **Optional methods**: `getPhenotype()`, `playMIDI()`, `stopMIDI()`
- **Self-description**: `describe()` returns the rich HTML shown in the genome panel (header + informative phenotype + genome dump); `toString()` is a concise one-line summary. The base class implements both generically; subclasses usually override only `describeExtra()` to inject type-specific detail (e.g. SuperFormula's formula) into the default layout.
- **Caching**: the render cache state (`_cachedImageData`/`_cacheKey`) lives here and is cleared by `invalidateImageCache()`; the 2D-canvas caching mechanism itself is `Canvas2DModality.renderCached(canvas, individual, renderFn)`
- Pass `'SKIP_GENOME_GENERATION'` as the genome argument to `super()` when the subclass manages genome creation itself

## Representations

| File | Genome type | Used by |
|---|---|---|
| `TreeRepresentation.js` | GP expression tree | PatternIndividual |
| `BinaryRepresentation.js` | `0/1` array | GridIndividual, MelodyIndividual |
| `IntegerRepresentation.js` | integer array 0-255 | ShapesIndividual, MouseMusicIndividual, EEGSonificationIndividual |
| `FloatRepresentation.js` | float array with per-gene bounds, Gaussian mutation | SuperFormula{,3D}, Character, Sheep, Penrose |
| `GrammaticalRepresentation.js` | integer array → BNF derivation → compiled JS function | PatternGrammarIndividual, PolarCurveIndividual |
| `DAGRepresentation.js` | integer array → DAG of InputNode/ProcessingNode/OutputNode | MouseMusicIndividual, EEGSonificationIndividual |

`DAGRepresentation` is configurable: pass `numInputs`, `numOutputs`, `numProcIndex`, `procOpsStartIndex`, `outputThresholdIndex`, `connectionStartIndex` to handle both the mouse-driven DAG (3 inputs, 3 outputs) and the EEG variant (5 inputs, 2 outputs).

## Modalities

| File | Purpose |
|---|---|
| `Canvas2DModality.js` | Pixel-by-pixel 2D rendering: takes an `(x,y)→value` evaluator and a `value→color` mapper. Also exposes shared static helpers used by path-drawing individuals: `renderCached(canvas, individual, renderFn)` (ImageData caching by genome+size), `drawLine`/`drawThickLine`/`drawCircle`, and a reusable `bloom(imageData, {radius, strength, background})` glow/smoothing post-filter (separable Gaussian over brightness above the background, added back over the original) |
| `MIDIModality.js` | `sendNote(pitch, velocity, duration)` with automatic Web Audio fallback; `allNotesOff()`; managed `start(callback, interval)` / `stop()` loop |
| `ThreeDModality.js` | `createMesh(vertices, indices, colors)` and `render(canvas, id, vertices, indices, colors, framework)` via the shared Three.js scene |

All sound-producing individuals **share one** `MIDIModality` instance, owned by the framework (`framework.sharedMIDI`) — mirroring the shared 3D scene/renderer, and avoiding one Web Audio `AudioContext` per individual. Individuals reference it (`window.framework.sharedMIDI`, with a local fallback for tests) rather than constructing their own. The framework wires the resolved MIDI output into it; if no MIDI output is available (or a send fails), `sendNote` falls back to Web Audio synthesis automatically. Because the modality is shared, only one individual plays at a time (the framework stops the current one when another is started).

### Color Palette (`Palette.js`)
`window.Palette` is an app-level, medium-agnostic color service consumed by both 2D and 3D individuals: `window.Palette.color(t)` returns an `{r,g,b}` for `t∈[0,1]` using the framework's current palette (`window.Palette.name()` reads `framework.settings.colorPalette`). It is the palette provider for the app. Individuals opt in by returning `true` from `usesColorPalette()`, which makes the framework attach `PaletteControlUI`. (This replaced the old `withPaletteExtensions` mixin, which is gone.)

## Composition Pattern

A standard individual is just a constructor (representation + genome) plus `visualize()`; `mutate`/`crossover`/`clone` are inherited from `Individual` and delegate to `this.representation`:

```javascript
class SomeIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = new FloatRepresentation({ length: N, bounds: [...] });
        this.genome = genome || this.representation.generateRandom();
    }

    usesColorPalette() { return true; }            // optional: opt into the palette UI

    visualize(canvas) {
        // domain-specific rendering; for color use window.Palette.color(t)
    }
}
```

Override `mutate`/`crossover`/`clone` only when the genome semantics are non-standard. The representation strategy object is conventionally named `this.representation`.

Examples of non-standard overrides: `SuperFormula{,3D}` keep custom `mutate`/`crossover` for their mixed integer/float genome but still use `this.representation` for helpers like `gaussianRandom`/`clone`; `Creature` manages a variable-length genome directly and so has no `this.representation` at all (it overrides every operator).

**AnemoneIndividual** is intentionally not refactored into a representation: its genome is variable-length (insert/delete/change mutation, two-point crossover with independent cut points), and its rendering is path-based rather than pixel-based, so neither IntegerRepresentation nor Canvas2DModality applies cleanly.

## Individual Types

| Individual | Representation | Modality | Notes |
|---|---|---|---|
| `PatternIndividual` | Tree | Canvas2D | GP over x,y,r,theta |
| `PatternGrammarIndividual` | Grammatical | Canvas2D | BNF grammar → expression |
| `PolarCurveIndividual` | Grammatical | Canvas2D | Polar coordinate curves |
| `ShapesIndividual` | Integer | Canvas2D | Sequence of drawing ops |
| `GridIndividual` | Binary | Canvas2D | 8×8 grid |
| `SuperShapeIndividual` | Float | Canvas2D | Gielis polar curve |
| `SuperShape3DIndividual` | Float | ThreeD | 3D Gielis surface |
| `AnemoneIndividual` | custom | Canvas2D | Variable-length turtle graphics |
| `RobotIndividual` | Float | Canvas2D | Parametric cartoon character |
| `SheepIndividual` | Float | Canvas2D | Float genome fed into fixed-random neural network |
| `PenroseIndividual` | Float | Canvas2D | Kite-and-dart tiling |
| `MelodyIndividual` | Binary | MIDI | 8-note sequences |
| `MouseMusicIndividual` | Integer + DAG | MIDI | Mouse-driven DAG → notes |
| `EEGSonificationIndividual` | Integer + DAG | MIDI | EEG-stream-driven DAG → notes |

## Extension System

UI panels are attached by the framework based on individual capability flags rather than per-individual registration. Currently the only panel is `PaletteControlUI`, attached when an individual returns `true` from `usesColorPalette()` (see `loadExtensions()` in `Anemone.js`). A panel class needs a `mount(container)` method and accesses framework settings via `this.framework.updateSetting(key, value)`, which triggers cache invalidation and re-rendering.

## 3D Rendering Strategy

To avoid WebGL context limits (typically 16), all 3D individuals share one `THREE.Scene` and one `THREE.WebGLRenderer`. The rendering loop (Anemone.js):
1. Temporarily isolate the target individual's mesh in the shared scene
2. Position a rotating camera to frame it
3. Render to the shared renderer's canvas
4. Copy pixels to the individual's display canvas via 2D context

3D individuals must implement `is3D() { return true; }`.

## Key Implementation Notes

- **Palette system** (`Palette.js`): d3-scale-chromatic palettes. Individuals call `window.Palette.color(t)` (medium-agnostic, used by 2D and 3D), which resolves the current palette and delegates to `window.Palette.getColor(name, t)`. Opt into the palette UI via `usesColorPalette()`.
- **Image cache**: `Canvas2DModality.renderCached(canvas, individual, renderFn)` skips the render when the individual's genome and canvas size are unchanged (cache state stored on the individual). Call `this.invalidateImageCache()` after mutation; the framework also invalidates all caches when a setting (e.g. palette) changes.
- **Genome/phenotype display**: `Anemone.js` tracks `currentIndividual` (last-clicked); `displayCurrentGenome()` just sets the panel to `currentIndividual.describe()`. All formatting lives on the individual (base `describe()`/`_format*` helpers + per-type `describeExtra()`), not the framework.
- **MIDI init**: Framework requests MIDI at startup, prefers "IAC Driver" or "Logic Pro Virtual" outputs, and wires the output into the single shared `framework.sharedMIDI`.
- **EEG**: `EEGPreprocessing.js` (`EEGDataStream` class) parses Muse-headband CSV, aligns to 200ms grid, and computes 5 normalised features (mean, variance, peak, baseline, asymmetry) per window. The framework distributes the stream to EEG individuals via `setEEGDataStream()`.

## Common Patterns

**Adding a new individual type:**
1. Extend `Individual`
2. Pick or create a `Representation` for the genome and assign it to `this.representation`
3. Implement `visualize(canvas)` (and pick a `Modality` if it helps); return `true` from `usesColorPalette()` and/or `is3D()` as appropriate
4. Inherited `mutate`/`crossover`/`clone` delegate to `this.representation` — only override for non-standard genome semantics
5. Register in `Anemone.js` individual type selector and add `<script>` tags to `index.html`

**Sound-producing individual:**
```javascript
constructor(genome = null) {
    // ...
    // Reference the framework's single shared modality (local fallback for tests)
    this.midiModality = (typeof window !== 'undefined' && window.framework && window.framework.sharedMIDI) || new MIDIModality();
}
// send notes:
this.midiModality.sendNote(pitch, velocity, duration); // falls back to Web Audio
// interval loop (DAG-style):
this.midiModality.start(() => this.evaluate(), this.timeStep);
this.midiModality.stop();
```
The modality is shared, so `clone()` needs no MIDI re-wiring — the generic base `clone` works. The framework guarantees only one individual drives the shared modality at a time.

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

Set in `main.js:1` as `SuperShape3DIndividual`. Change this line to switch the startup default.

## Project Context

Designed by jmmcd, mostly implemented by Claude Code. Demonstrates IEC without training corpora or neural networks — pure evolutionary art generation.

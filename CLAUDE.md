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
- Direct ("truncation") selection: a click is a binary "like" (`toggleLike`, fitness 0/1); parents are drawn uniformly at random from the liked individuals (`selectParent`), since binary likes give no fitness gradient
- Elitism: first 2 liked individuals cloned into next generation
- Crossover and mutation fill remaining slots
- Generation history for time-travel (reload previous generations)

### Individual Base Class (`Individual.js`)
All individual types inherit from this:
- **Required method**: `visualize(canvas)`
- **Generic genetic operators**: `mutate(rate)`, `crossover(other)`, `clone()` are implemented in the base class and delegate to `this.representation` (the representation strategy object). A typical subclass only sets up `this.representation` + `this.genome` and implements `visualize()`; it does **not** override the operators. With `PTORepresentation` (see below) covering variable-length and mixed int/float structures, overriding the operators is now rarely necessary.
- **Genotype vs phenotype**: `this.genome` is the heritable material the operators act on. `this.phenotype` (a base getter) is the genome *expressed*: for most representations it is the genome itself, but for a `PTORepresentation` the genome is a trace and `this.phenotype` is whatever its generator produced (array, matrix, tree, … — opaque). Rendering/decoding should read `this.phenotype`, not `this.genome`. `getPhenotype()` returns `this.phenotype` by default; subclasses override it to return an interpreted form (a decoded object, a note list, a turtle-program string, …).
- **Capability flags**: `is3D()` and `usesColorPalette()` (both default `false`). The framework reads these — `is3D()` drives the shared-3D render path; `usesColorPalette()` makes the framework attach the palette UI panel.
- **Optional methods**: `getPhenotype()`, `playMIDI()`, `stopMIDI()`
- **Self-description**: `describe()` returns the rich HTML shown in the genome panel (header + informative phenotype + genome dump); `toString()` is a concise one-line summary. The base class implements both generically (and `_formatGenomeSection` renders a PTO trace as its list of recorded decisions); subclasses usually override only `describeExtra()` to inject type-specific detail (e.g. SuperFormula's formula) into the default layout.
- **Caching**: the render cache state (`_cachedImageData`/`_cacheKey`) lives here and is cleared by `invalidateImageCache()`; the 2D-canvas caching mechanism itself is `Canvas2DModality.renderCached(canvas, individual, renderFn)`, which keys on `individual.renderKey()` (the base returns `this.phenotype`).
- Pass `'SKIP_GENOME_GENERATION'` as the genome argument to `super()` when the subclass manages genome creation itself

## Representations

Every individual evolves via `PTORepresentation` (genome = PTO trace). The other files in `representations/` are no longer *representations* in the operator sense — they supply the **classes and converters** that a PTO generator's plain-data output is turned into.

| File | Role | Used by |
|---|---|---|
| `PTORepresentation.js` | **Program Trace Optimisation**: genome = trace of random decisions; phenotype = generator output. The operator backbone for every individual. | all individuals |
| `TreeRepresentation.js` | GP node classes (`TerminalNode`/`FunctionNode`), the self-contained `treeGenerator` (→ plain-data tree), and `buildTreeNode` (plain data → evaluable tree) | PatternIndividual |
| `GrammaticalRepresentation.js` | codon-array → BNF derivation → compiled JS function; used as a **mapper** (`this.grammar`), not as `this.representation` (its own `generate`/`mutate` are unused — PTO produces the codon array) | PatternGrammarIndividual, PolarCurveIndividual |
| `DAGRepresentation.js` | DAG node classes (`InputNode`/`ProcessingNode`/`OutputNode`), operation tables, and `buildDAG` (plain-data graph → runnable node graph). The generators live in the individuals. | MouseMusicIndividual, EEGSonificationIndividual |

The two DAG individuals each define their own self-contained, plain-data generator (mouse: 3 inputs / 3 outputs; EEG: 5 inputs / 2 outputs) emitting connections as indices, and share `buildDAG` to instantiate the node graph. (The old configurable `createDAGGenerator` factory is gone — structural naming can't compile a factory closure.)

### PTORepresentation (`representations/PTORepresentation.js`)
A representation backed by [Program Trace Optimisation](https://github.com/Program-Trace-Optimisation/PTO) (vendored at `vendor/pto-bundle.js`, loaded as a global `PTO`). Instead of a fixed genome shape, the search space is defined by a **generator** `generator(rnd)` that builds a phenotype using PTO's `rnd` (`rnd.random/uniform/randint/choice/sample`). PTO records the sequence of `rnd` decisions — the **trace** — and that trace is the genotype; one representation can thus emulate any structure (fixed/variable length, mixed int/float, etc.), so an individual only supplies a generator, not bespoke operators.

- `generateRandom()` → a trace; `express(geno)` replays the generator to derive the phenotype (cached per-trace in a `WeakMap`).
- `mutate(geno, rate)` is position-wise ("1/n type"): each trace entry mutates independently with probability `rate` (so the **caller controls mutation strength** — important for interactive EC), then the generator is replayed. `crossover` is uniform over the aligned traces; `clone` shares the immutable trace.
- **Operator defaults: `{ distType: 'fine', naming: 'structural' }`** — PTO's best operators, used for every individual. There is normally no reason to choose `'coarse'`: `'fine'` (Gaussian creep for reals, a like-for-like resample for ints/categoricals) handles discrete *and* variable-structure genomes too. `'structural'` naming names each trace entry by its **call-site path** in the generator, so mutation/crossover align like-typed genes even when the structure varies (trees, variable-length arrays); this is what makes `'fine'` safe everywhere. (Under the alternative `'linear'` naming a realigned variable-structure trace can pair a `choice` gene with a differently-typed one and crash fine repair — the old reason some individuals were forced to `'coarse'`.)
- **Generator constraints imposed by structural naming** (the generator is compiled in isolation, so write it self-contained):
  - It may reference top-level `const`s/classes but **not closure variables** (factory args, factory-local helpers). Declare any recursive helper *inside* the generator. This is why `createTreeGenerator`/`createDAGGenerator` factories are gone.
  - **No `new ClassName(...)` inside the generator** — the bundled `NameCompiler` doesn't instrument `rnd`/recursive calls nested in a `NewExpression`. Emit *plain data* and build class instances in the individual (Tree → `buildTreeNode`, DAG → `buildDAG`).
  - **Build repeated genes with an explicit `for` loop, not `Array.from({length}, () => rnd…)`** — only real loops get a per-element counter in the gene name; `Array.from` callbacks collide to a positional fallback (silently *linear* for fixed length, and badly misaligned when a length gene varies a variable-length genome).
- This replaced the former `FloatRepresentation` and `BinaryRepresentation` (now deleted) and the hand-rolled operators in the individuals above.

## Modalities

| File | Purpose |
|---|---|
| `Canvas2DModality.js` | Pixel-by-pixel 2D rendering: takes an `(x,y)→value` evaluator and a `value→color` mapper. Also exposes shared static helpers used by path-drawing individuals: `renderCached(canvas, individual, renderFn)` (ImageData caching by `individual.renderKey()` + size), `drawLine`/`drawThickLine`/`drawCircle`, and a reusable `bloom(imageData, {radius, strength, background})` glow/smoothing post-filter (separable Gaussian over brightness above the background, added back over the original) |
| `MIDIModality.js` | `sendNote(pitch, velocity, duration)` with automatic Web Audio fallback; `allNotesOff()`; managed `start(callback, interval)` / `stop()` loop |
| `ThreeDModality.js` | `createMesh(vertices, indices, colors)` and `render(canvas, id, vertices, indices, colors, framework)` via the shared Three.js scene |

All sound-producing individuals **share one** `MIDIModality` instance, owned by the framework (`framework.sharedMIDI`) — mirroring the shared 3D scene/renderer, and avoiding one Web Audio `AudioContext` per individual. Individuals reference it (`window.framework.sharedMIDI`, with a local fallback for tests) rather than constructing their own. The framework wires the resolved MIDI output into it; if no MIDI output is available (or a send fails), `sendNote` falls back to Web Audio synthesis automatically. Because the modality is shared, only one individual plays at a time (the framework stops the current one when another is started).

### Color Palette (`Palette.js`)
`window.Palette` is an app-level, medium-agnostic color service consumed by both 2D and 3D individuals: `window.Palette.color(t)` returns an `{r,g,b}` for `t∈[0,1]` using the framework's current palette (`window.Palette.name()` reads `framework.settings.colorPalette`). It is the palette provider for the app. Individuals opt in by returning `true` from `usesColorPalette()`, which makes the framework attach `PaletteControlUI`. (This replaced the old `withPaletteExtensions` mixin, which is gone.)

## Composition Pattern

Every individual is backed by `PTORepresentation`: the individual-specific part is a **generator** `generator(rnd)` (the search space); `mutate`/`crossover`/`clone` are inherited from `Individual` and delegate to the representation. The generator's output is the phenotype, read via `this.phenotype` (the genome itself is the PTO trace).

```javascript
// One shared, stateless representation per type (lazily builds a single PTO Op).
// Defaults are { distType: 'fine', naming: 'structural' } — almost never overridden.
const someGenerator = (rnd) => {
    const vec = [
        rnd.uniform(0, 1),                    // a float gene (fine = Gaussian creep)
        rnd.randint(1, 20),                   // an int gene
        rnd.choice([1, 2, 3, 4, 6, 8, 12]),  // a categorical gene
    ];
    // Repeated genes: explicit for-loop, NOT Array.from (see PTORepresentation).
    for (let i = 0; i < 8; i++) vec.push(rnd.uniform(0, 1));
    return vec;
};
const someRepresentation = new PTORepresentation(someGenerator);

class SomeIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = someRepresentation;
        this.genome = genome || this.representation.generateRandom();   // genome = trace
    }

    usesColorPalette() { return true; }            // optional: opt into the palette UI

    visualize(canvas) {
        const p = this.phenotype;                  // the generator's output array
        // domain-specific rendering; for color use window.Palette.color(t)
    }
}
```

The default `{ distType: 'fine', naming: 'structural' }` is right for essentially all genomes; keep the generator self-contained, free of `new`, and use `for` loops not `Array.from` for repeated genes (see PTORepresentation for why). Override `mutate`/`crossover`/`clone` only when the genome semantics genuinely fall outside this model.

Every individual is PTO-backed, but a few produce plain data that an individual then turns into a richer working structure: `PatternIndividual` (`treeGenerator` → plain tree, `buildTreeNode` → evaluable `TreeNode`s in `this.tree`); `MouseMusicIndividual`/`EEGSonificationIndividual` (plain-data DAG generator → `buildDAG` → runnable node graph in `this.dag`); and `PatternGrammarIndividual`/`PolarCurveIndividual` (PTO produces a codon array, then a shared `GrammaticalRepresentation` mapper derives/compiles the expression). For those, `this.phenotype` is the plain-data PTO output and the individual exposes the interpreted structure separately. The node/tree/grammar **classes** still live in `representations/` (`TreeRepresentation.js`, `DAGRepresentation.js`, `GrammaticalRepresentation.js`); only the operators are PTO's.

## Individual Types

All individuals use `PTORepresentation` (default fine/structural operators); the "PTO output" column notes what each generator produces.

| Individual | PTO output | Modality | Notes |
|---|---|---|---|
| `PatternIndividual` | plain-data GP tree | Canvas2D | GP over x,y,r,theta; `buildTreeNode` → evaluable tree |
| `PatternGrammarIndividual` | 100 codons | Canvas2D | codons → BNF grammar → expression |
| `PolarCurveIndividual` | 100 codons | Canvas2D | codons → polar-coordinate r(t) curve |
| `ShapesIndividual` | 60 bytes | Canvas2D | Sequence of drawing ops |
| `GridIndividual` | 64 bits | Canvas2D | 8×8 grid |
| `SuperShapeIndividual` | mixed int/float | Canvas2D | Gielis polar curve |
| `SuperShape3DIndividual` | mixed int/float | ThreeD | 3D Gielis surface |
| `AnemoneIndividual` | variable-length bytes | Canvas2D | Variable-length turtle graphics |
| `RobotIndividual` | 43 floats | Canvas2D | Parametric cartoon character |
| `SheepIndividual` | 8 floats | Canvas2D | Float genome fed into fixed-random neural network |
| `PenroseIndividual` | 8 params | Canvas2D | Kite-and-dart tiling |
| `MelodyIndividual` | 64 bits | MIDI | 8-note sequences |
| `MouseMusicIndividual` | plain-data DAG | MIDI | `buildDAG` → mouse-driven DAG → notes |
| `EEGSonificationIndividual` | plain-data DAG | MIDI | `buildDAG` → EEG-stream-driven DAG → notes |

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
- **Image cache**: `Canvas2DModality.renderCached(canvas, individual, renderFn)` skips the render when `individual.renderKey()` (the base returns `this.phenotype`) and the canvas size are unchanged (cache state stored on the individual). Call `this.invalidateImageCache()` after mutation; the framework also invalidates all caches when a setting (e.g. palette) changes.
- **Genome/phenotype display**: `Anemone.js` tracks `currentIndividual` (last-clicked); `displayCurrentGenome()` just sets the panel to `currentIndividual.describe()`. All formatting lives on the individual (base `describe()`/`_format*` helpers + per-type `describeExtra()`), not the framework.
- **MIDI init**: Framework requests MIDI at startup, prefers "IAC Driver" or "Logic Pro Virtual" outputs, and wires the output into the single shared `framework.sharedMIDI`.
- **EEG**: `EEGPreprocessing.js` (`EEGDataStream` class) parses Muse-headband CSV, aligns to 200ms grid, and computes 5 normalised features (mean, variance, peak, baseline, asymmetry) per window. The framework distributes the stream to EEG individuals via `setEEGDataStream()`.

## Common Patterns

**Adding a new individual type:**
1. Extend `Individual`
2. Write a self-contained `generator(rnd)` (no closure vars, no `new`, `for` loops not `Array.from`) and a shared `new PTORepresentation(generator)` (defaults fine/structural), assign it to `this.representation`, and set `this.genome = genome || this.representation.generateRandom()`. If the structure is a tree/grammar/DAG, have the generator emit plain data and convert it to the working classes in the individual (as `buildTreeNode`/`buildDAG`/the grammar mapper do).
3. Implement `visualize(canvas)` reading `this.phenotype` (and pick a `Modality` if it helps); return `true` from `usesColorPalette()` and/or `is3D()` as appropriate
4. Inherited `mutate`/`crossover`/`clone` delegate to `this.representation` — only override for non-standard genome semantics
5. Register in `Anemone.js` individual type selector and add `<script>` tags to `index.html` (PTO-backed types need `vendor/pto-bundle.js` and `representations/PTORepresentation.js`, which are already loaded)

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

Set in `main.js:1` as `AnemoneIndividual`. Change this line to switch the startup default.

## Project Context

Designed by jmmcd, mostly implemented by Claude Code. Demonstrates IEC without training corpora or neural networks — pure evolutionary art generation.

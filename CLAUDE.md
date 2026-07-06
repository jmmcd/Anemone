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

There is no build step or linting configuration in this repository.

## Testing

A dependency-free smoke/regression suite runs under Node (no browser, no CI):

```bash
node tests/run.js   # exits non-zero on any failure
```

`tests/harness.js` loads the plain-`<script>` source files into a Node `vm`
sandbox with minimal browser stubs (`window`, a no-op canvas 2D context, and
`Palette`/`Photo`/`AudioClip` stubs) and exposes the individual classes; `tests/run.js`
exercises the genetic operators, the render path, capability flags, and the
save/load/export services for every type.

**IMPORTANT — keep the harness in sync with the code.** The harness has two
hand-maintained lists that must track the app whenever an individual type (or a
shared base class) is added, removed, or renamed:

- `SOURCES` in `tests/harness.js` — the source files, **in dependency order**
  (base classes before subclasses; mirror the `<script>` order in `index.html`). A
  missing base (e.g. `RadialSurface3DIndividual.js` before its subclasses) throws a
  `ReferenceError` at bundle load and **every** test fails.
- `INDIVIDUAL_CLASSES` in `tests/harness.js` — the concrete individual class names.

New app-level services accessed via `window.*` from a constructor/`visualize()`
also need a stub in the harness `sandbox.window`. Update these lists (and run
`node tests/run.js`) as part of the same change that adds the type — it's easy to
forget after closing the laptop or clearing the session.

## Architecture

The codebase separates three concerns:

1. **Representations** (`representations/`) — genome structure and genetic operators
2. **Modalities** (`modalities/`) — output mechanisms (rendering, audio)
3. **Individuals** (root `*.js`) — application code that composes representations and modalities

### Framework Layer (`Anemone.js`)
`InteractiveEAFramework` orchestrates the system:
- Initialises MIDI access, the shared output modalities (`framework.sharedMIDI` for notes, `framework.sharedAudio` for sample buffers/graphs), and shared 3D resources (Three.js scene/renderer)
- Tracks `currentlyPlaying` so only one sound individual plays at a time (they share the output modalities)
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

Every individual evolves via `PTORepresentation` (genome = PTO trace). The other files below are no longer *representations* in the operator sense — they supply the **classes and converters** a PTO generator's output is built from. (`Grammar.js` lives at the repo root, not in `representations/`.)

| File | Role | Used by |
|---|---|---|
| `PTORepresentation.js` | **Program Trace Optimisation**: genome = trace of random decisions; phenotype = generator output. The operator backbone for every individual. | all individuals |
| `TreeRepresentation.js` | GP node classes (`TerminalNode`/`FunctionNode`), the self-contained `treeGenerator` (→ plain-data tree), and `buildTreeNode` (plain data → evaluable tree) | PatternIndividual |
| `Grammar.js` | generic BNF engine (`getProductions`/`isNonTerminal`/`shortestProductions`). The **grammar definitions live in the individuals** (a plain rules object each); their generators expand it directly | PatternGrammarIndividual, PolarCurveIndividual |
| `DAGRepresentation.js` | DAG node classes (`InputNode`/`ProcessingNode`/`OutputNode`), operation tables, and `buildDAG` (plain-data graph → runnable node graph). The generators live in the individuals. | MouseMusicIndividual, EEGSonificationIndividual |

The two DAG individuals each define their own self-contained, plain-data generator (mouse: 3 inputs / 3 outputs; EEG: 5 inputs / 2 outputs) emitting connections as indices, and share `buildDAG` to instantiate the node graph. (The old configurable `createDAGGenerator` factory is gone — structural naming can't compile a factory closure.)

`PhotoFilterIndividual` is a *third* DAG type but a different kind: its edges carry whole **images** (not scalars) and the graph is a **pure, stateless function** of the source photo, so it does **not** use `DAGRepresentation.js`/`buildDAG` (those build stateful scalar/MIDI node objects). It keeps the same plain-data / index-based / acyclic generator shape (op→arity table, inputs as indices into earlier nodes) but evaluates the graph by a direct memoised walk in the individual — mirroring how the grammar individuals keep their definition local while only the operators are PTO's. (It replaced the earlier linear op-chain photo filter, which is just a degenerate branch-free DAG.)

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
| `MIDIModality.js` | **Note** output: `sendNote(pitch, velocity, duration)` with automatic Web Audio fallback; `allNotesOff()`; managed `start(callback, interval)` / `stop()` loop; and `playSequence(seq, transport)` / `stopSequence()` — a lookahead clock that loops a `{bpm,ppq,loopTicks,notes}` sequence to the MIDI output. Used by note individuals (Melody/DrumMachine live MIDI, MouseMusic/EEG) |
| `AudioModality.js` | **Sample** output: `playBuffer(buffer, {loop,gain,offset})` and `playGraph(build → {output, sources}, {gain})` + `stop()`, over the shared `AudioClip.context()`. Owns the Web Audio play/stop lifecycle (source→gain→destination) so the step sequencers (DrumMachine/Melody via `playBuffer`) and AudioFilter (`playGraph`) don't hand-roll it. Also the static `declickTail(data, sr, ms)` — a loop-seam fade both step sequencers' `renderToAudioBuffer` apply so a looped buffer has no click at the seam (the one shared copy of that fix). The sibling of MIDIModality (samples vs. notes) |
| `ThreeDModality.js` | `createMesh(vertices, indices, colors)` and `render(canvas, id, vertices, indices, colors, framework)` via the shared Three.js scene |

Sound individuals **share one output modality per medium**, owned by the framework — mirroring the shared 3D scene/renderer, and avoiding one Web Audio `AudioContext` per individual: `framework.sharedMIDI` (a `MIDIModality`) for **note** output, and `framework.sharedAudio` (an `AudioModality`) for **sample** output (rendered buffers / live graphs). Individuals reference the one they need (`window.framework.sharedMIDI` / `.sharedAudio`, with a local `new …Modality()` fallback for tests) rather than constructing their own. For MIDI, the framework wires the resolved output in and `sendNote` falls back to Web Audio synthesis if none is available. `AudioModality` plays through the single shared context that `window.AudioClip` owns, so the whole app has one `AudioContext` for sample playback. Because each modality is shared and plays one thing at a time, only one individual sounds at once (the framework stops the current one when another is started).

**Unified step-sequencer playback.** The two step sequencers (DrumMachine, Melody) share one output path: base `Individual.playSequenced()`/`stopSequenced()` sends **live MIDI when `sharedMIDI.midiOutput` exists** (via `MIDIModality.playSequence`), **else synthesises a loop buffer** (`renderToAudioBuffer` → `sharedAudio.playBuffer`). A type only supplies `toMIDISequence()` (with a `loopTicks`) + `renderToAudioBuffer()`; `playMIDI`/`stopMIDI` are one-liners delegating to the base. Both paths enter at the shared `window.Transport` phase (a `performance.now()` clock, so audio and MIDI stay aligned), so editing a cell or switching individuals resumes in time. Global tempo/swing come from `window.PerformanceControls` (renamed from `DrumControls`): shared dials + the transport, attached as the "Performance" drawer panel when a type returns `usesPerformanceControls()`, showing only the dials the type declares via `performanceDials()` (drum: tempo/swing/humanize/drive/**length**; melody: tempo/swing/**length**). The `length` dial (shared by both step sequencers) is locked to 16 by **default** (so most users get uniform 16-step 4/4 loops); unlocking it lets each individual's evolved `length` gene (8–16) run free. It's the one dial that changes a *visual* (the dimmed inactive steps), so `PerformanceControls.update` calls `framework.invalidateAndRender()` for it; both types read the effective length via `_effectiveLength()` everywhere (grid, synth, export). The `[` / `]` hotkeys nudge it in a step-sequencer run (and stay the 3D camera zoom otherwise); `.` (the `>` key) toggles play/pause of the current sound individual (or 3D auto-rotation). This is what lets Anemone drive Logic/GarageBand live off an IAC/virtual port, or preview internally with no MIDI.

### Color Palette (`Palette.js`)
`window.Palette` is an app-level, medium-agnostic color service consumed by both 2D and 3D individuals: `window.Palette.color(t)` returns an `{r,g,b}` for `t∈[0,1]` using the framework's current palette (`window.Palette.name()` reads `framework.settings.colorPalette`). It is the palette provider for the app. Individuals opt in by returning `true` from `usesColorPalette()`, which makes the framework attach `PaletteControlUI`. (This replaced the old `withPaletteExtensions` mixin, which is gone.)

### Photo (`Photo.js`)
`window.Photo` is an app-level image service (mirrors `Palette`): it holds **one shared source photo**, not part of any genome, so `PhotoFilterIndividual`s all filter the same image and evolve only the filter chain. The default is scikit-image's "coffee" (a standard, cleanly-licensed demo photo), fetched from jsDelivr (pinned tag, CORS-enabled) in the background over a generated gradient placeholder that also serves as the offline fallback. `sourceImageData(w,h)` returns the source scaled to cover w×h (cached per size per version, treated read-only). Individuals opt in via `usesPhoto()`, which makes the framework attach `PhotoControlUI` (load/replace photo). Replacing the photo bumps `Photo.version()` and calls `framework.invalidateAndRender()` — caches drop and everything redraws, but the **population is kept, so evolution continues** on the new photo. Render caches must include `Photo.version()` in `renderKey()`.

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

Every individual is PTO-backed, but a few produce a structure the individual then interprets: `PatternIndividual` (`treeGenerator` → plain tree, `buildTreeNode` → evaluable `TreeNode`s in `this.tree`); `MouseMusicIndividual`/`EEGSonificationIndividual` (plain-data DAG generator → `buildDAG` → runnable node graph in `this.dag`). The grammar individuals (`PatternGrammarIndividual`/`PolarCurveIndividual`) do GE the proper PTO way: the generator **is** the derivation — it recursively expands a BNF grammar from the start symbol, picking a production with `rnd.choice` at each non-terminal and emitting the expression string directly, so `this.phenotype` is the expression and the trace records the derivation tree (no codon array, no `% productions.length`). The tree/DAG node classes live in `representations/` (`TreeRepresentation.js`, `DAGRepresentation.js`); the BNF *engine* is `Grammar.js` but each grammar *definition* lives in its individual; only the operators are PTO's.

## Individual Types

All individuals use `PTORepresentation` (default fine/structural operators); the "PTO output" column notes what each generator produces.

| Individual | PTO output | Modality | Notes |
|---|---|---|---|
| `PatternIndividual` | plain-data GP tree | Canvas2D | GP over x,y,r,theta; `buildTreeNode` → evaluable tree |
| `PatternGrammarIndividual` | expression string | Canvas2D | derivation generator expands a BNF grammar directly |
| `PolarCurveIndividual` | r(t) expression string | Canvas2D | derivation generator → polar-coordinate r(t) curve |
| `ShapesIndividual` | 60 bytes | Canvas2D | Sequence of drawing ops |
| `PhotoFilterIndividual` | plain-data image DAG | Canvas2D | CGP-IP-style: evolves a *graph* of whole-image ops (unary like blur/gamma/edges/tiltShift/edgeHue + binary combiners like add/diff/blend) over the shared `window.Photo`, reusing/recombining intermediate images; opts into palette (tint/gradientMap/edgeHue) |
| `GridIndividual` | 64 bits | Canvas2D | 8×8 grid |
| `SuperShapeIndividual` | mixed int/float | Canvas2D | Gielis polar curve |
| `SuperShape3DIndividual` | superformula expr strings + params | ThreeD | `RadialSurface3D` subclass: Gielis superformula as a fixed-form "grammar" (continuous params baked into the expr as literals) + extended φ range |
| `PetalSphere3DIndividual` | separable expr pair | ThreeD | `RadialSurface3D` subclass: r₁(θ)·r₂(φ), sin/cos-of-integer-angle grammar ⇒ 2π-periodic ⇒ seamless (petals/succulents) |
| `FreeSurface3DIndividual` | separable expr pair | ThreeD | `RadialSurface3D` subclass: free grammar in raw angle `a`; more variety, but non-periodic (possible φ seam) |
| `WarpedSurface3DIndividual` | bivariate expr | ThreeD | `RadialSurface3D` subclass: one free expr in `theta`,`phi` (non-separable); most warped, non-periodic |
| `AnemoneIndividual` | variable-length bytes | Canvas2D | Variable-length turtle graphics |
| `BranchIndividual` | array of drawing commands | Canvas2D | Free-form branching turtle; generator returns `{op,...}` commands. (Like every type, its generator is editable via CodeEditorUI.) |
| `RobotIndividual` | structured params object | Canvas2D | Parametric cartoon robot; conditional genes (body shape, locomotion legs/wheels/tracks/monowheel, front panel, hand style, per-anchor accessory slots with 30+ types) |
| `SheepIndividual` | 8 floats | Canvas2D | Float genome fed into fixed-random neural network |
| `PenroseIndividual` | 8 params | Canvas2D | Kite-and-dart tiling |
| `MelodyIndividual` | 8-pitch × 16-step grid + style genes | MIDI / audio | Polyphonic piano-roll (held note = run of on-cells; `length` gene = bar length 8–16). Shares the DrumMachine step-sequencer core: per-cell editable genes, global Performance panel, unified live-MIDI-else-synth playback, MIDI export |
| `DrumMachineIndividual` | 8-channel × 16-step grid + style genes (incl. `length` 8–16) | MIDI / audio | Evolvable drum loop; the step-sequencer template Melody is built on (per-cell `hit_c_s`/`vel_c_s` genes, `renderToAudioBuffer`, GM-percussion MIDI). See its file header |
| `MouseMusicIndividual` | plain-data DAG | MIDI | `buildDAG` → mouse-driven DAG → notes |
| `EEGSonificationIndividual` | plain-data DAG | MIDI | `buildDAG` → EEG-stream-driven DAG → notes |

### RadialSurface3D family (`RadialSurface3DIndividual.js`)

The four ThreeD rows above (`SuperShape3D`, `PetalSphere3D`, `FreeSurface3D`, `WarpedSurface3D`) share the base class `RadialSurface3DIndividual`. A **radial surface** meshes a sphere by computing a radius `r` at each `(θ,φ)` and mapping to Cartesian; the base owns everything downstream (compiling the expression(s) to a numeric function, `generate3DPoints` meshing, the shared-3D render + 2D fallback, and the genome panel). A subclass supplies only its own **top-level grammar + derivation generator** (the generator must be top-level, not a closure, for PTO structural naming — so the boilerplate generator is repeated per subclass rather than shared) and, via `editableSections()`, exposes that grammar. The generator's phenotype is either **separable** `{ meridianExpr, crossExpr }` → `r = r₁(θ)·r₂(φ)`, or **bivariate** `{ biExpr }` → `r = f(θ,φ)`; it may also carry optional `{ thetaRange, phiRange }` (defaults π, 2π). `SuperShape3D` is "just a grammar" with one fixed production: it emits the Gielis superformula with continuous params baked in as literals (so PTO's fine mutation still creeps them) and supplies the extended φ range — reproducing the old fixed-genome type with **no base override**. Radius safety is `|f| + radiusEps` (clamped; `radiusEps` defaults 0.05, `SuperShape3D` sets 0).

Any 3D individual exposing `generate3DPoints()` can be exported to a binary STL for 3D printing via `window.MeshExport.downloadSTL(individual)` (`MeshExport.js`), surfaced as the **⤓ STL** button in the zoom lightbox — so the whole family gets export for free. The mesh is exported raw (self-intersecting / non-periodic shapes aren't watertight and want a slicer/Blender repair pass).

## Extension System

UI panels are attached by the framework based on capability flags / structural checks rather than per-individual registration (see `loadExtensions()` in `Anemone.js`). A panel class needs a `mount(container)` method and accesses framework settings via `this.framework.updateSetting(key, value)`, which triggers cache invalidation and re-rendering. Current panels:
- `PaletteControlUI` — attached when an individual returns `true` from `usesColorPalette()`.
- `CodeEditorUI` — attached for **every individual that exposes editable code sections** (all PTO-backed types do — at minimum their generator). It lets the user view and rewrite the code of **whatever type is selected**.

### Editable code sections

Think of every individual as a pipeline: `generator → phenotype → visualize → pixels`. An **editable section** is a named, swappable stage of that pipeline a type chooses to expose, declared via `editableSections()` (base `Individual`). A section is `{ label, read() → text, reset() → text, apply(text), rebuild }`. The editor is stage-agnostic: it shows a selector when a type declares more than one section and edits whichever is chosen.

- **Default (all PTO types):** the base returns `[Individual.generatorSection(this.representation)]` — the generator. `generator.toString()` recovers the exact source; `apply` calls `representation.setGenerator(fn)`, which swaps the generator **in place** (clearing the lazy PTO `Op`/phenotype cache). Because the representation is a shared per-type singleton (assigned by reference), the swap reaches every individual of that type.
- **Grammar types** (`PatternGrammarIndividual`, `PolarCurveIndividual`) override `editableSections()` to expose their **grammar** first (`Individual.grammarSection(theGrammar)`), then the generator. The grammar is edited as JSON and its rules are replaced in place on the shared `Grammar` (which the derivation generator references by name, so it picks up the new productions).
- **Robot** exposes its **draw function** first (`Individual.functionSection('Draw', robotDraw)`), then the generator. The draw body lives in an `Editable` slot (a `{value, original}` holder defined in `Individual.js`) that `visualize()` reads; the generator returns a structured parameter object with *conditional* genes (e.g. wheel genes only exist when the locomotion gene chose wheels) — the showcase for PTO handling dependent search spaces.

Three section builders are static helpers on `Individual`: `generatorSection`, `grammarSection`, `functionSection` (all use `Individual.compileFunction` for text→function). A section's `rebuild` flag drives what happens on Apply: **search-space** edits (generator/grammar, `rebuild: true`) call `framework.reinitializePopulation()` (new genomes); **drawing-only** edits (a draw function, `rebuild: false`) call `framework.invalidateAndRender()`, which **keeps the user's evolved population** and just redraws. Either way, Apply first probe-renders one fresh individual offscreen and **reverts** the section (`apply(previousText)`) if the new code throws, so a bad edit can't break the app. "Reset to default" restores the section's original source (`representation.originalSourceText()`, `grammar.originalSourceText()`, or `slot.original`). Edits persist per type for the session (they live on the shared singleton/slot) and reset on reload.

A generator edit is still subject to the structural-naming constraints of the built-ins (self-contained, no closure vars, no `new` around rnd calls, `for` loops not `Array.from`) and must keep returning a phenotype of the shape that type's `visualize()` expects (e.g. `BranchIndividual` expects an array of `{op:'forward'|'turn'|'color'|'penWidth'|'step'|'push'|'pop', ...}` commands). A draw-function or grammar edit has no such constraint — it isn't PTO-compiled.

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
2. Write a self-contained `generator(rnd)` (no closure vars, no `new`, `for` loops not `Array.from`) and a shared `new PTORepresentation(generator)` (defaults fine/structural), assign it to `this.representation`, and set `this.genome = genome || this.representation.generateRandom()`. If the structure is a tree/DAG, have the generator emit plain data and convert it to the working classes in the individual (as `buildTreeNode`/`buildDAG` do); for a grammar, expand it directly in the generator (as the grammar individuals do).
3. Implement `visualize(canvas)` reading `this.phenotype` (and pick a `Modality` if it helps); return `true` from `usesColorPalette()` and/or `is3D()` as appropriate
4. Inherited `mutate`/`crossover`/`clone` delegate to `this.representation` — only override for non-standard genome semantics
5. Register in `Anemone.js` individual type selector and add `<script>` tags to `index.html` (PTO-backed types need `vendor/pto-bundle.js` and `representations/PTORepresentation.js`, which are already loaded)

**Sound-producing individual:** reference the framework's shared modality for your
medium (local fallback for tests). **Notes** → `sharedMIDI`:
```javascript
this.midiModality = (typeof window !== 'undefined' && window.framework && window.framework.sharedMIDI) || new MIDIModality();
// ...
this.midiModality.sendNote(pitch, velocity, duration);          // falls back to Web Audio
this.midiModality.start(() => this.evaluate(), this.timeStep);  // interval loop (DAG-style)
this.midiModality.stop();
```
**Samples** (a rendered loop or a live effects graph) → `sharedAudio`:
```javascript
this.audio = (typeof window !== 'undefined' && window.framework && window.framework.sharedAudio) || new AudioModality();
// ...
this.audio.playBuffer(this.renderToAudioBuffer(), { loop: true, offset });  // DrumMachine
this.audio.playGraph((ctx) => ({ output, sources }));                       // AudioFilter
this.audio.stop();
```
The modality is shared, so `clone()` needs no re-wiring — the generic base `clone` works. The framework guarantees only one individual drives sound at a time.

**Step-sequencer individual** (drum/melody): don't pick a modality — implement `toMIDISequence()` (with `loopTicks`) + `renderToAudioBuffer()`, make `playMIDI`/`stopMIDI` delegate to the base `this.playSequenced()`/`this.stopSequenced()`, and the base chooses live MIDI vs synth for you. Add `usesPerformanceControls()` + `performanceDials()` for the global tempo panel, and the grid-edit hooks (`isGridEditable`/`cellAtCanvasXY`/`cellOn`/`setCellHit`) for click/drag editing.

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

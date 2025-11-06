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

## Core Architecture

### Framework Layer (`Anemone.js`)
The `InteractiveEAFramework` class orchestrates the entire system:
- **Initialization**: Sets up MIDI access, Web Audio, and shared 3D resources (Three.js scene/renderer)
- **Extension system**: Individual types can register UI extensions, settings, and hotkeys via `getFrameworkExtensions()`
- **Settings management**: Framework-level settings (like `colorPalette`) that individuals can access via `getFrameworkSetting()`
- **3D resource management**: Single shared Three.js scene and renderer for all 3D individuals to prevent WebGL context exhaustion

### Evolutionary Algorithm (`EvolutionaryAlgorithm.js`)
Standard evolutionary operations:
- Tournament selection from user-selected individuals (fitness > 0)
- Elitism: Top 2 selected individuals cloned to next generation
- Crossover and mutation to fill remaining population slots
- Generation history for time-travel (load previous generations)

### Individual Base Class (`Individual.js`)
All individual types inherit from this:
- **Genome**: Representation varies by type (binary array, tree, integer array)
- **Required methods**: `visualize(canvas)`, `mutate(rate)`, `crossover(other)`, `clone()`
- **Optional methods**: `getPhenotype()`, `is3D()`, `playMIDI()`, `stopMIDI()`
- **Caching**: `visualizeWithCache()` helper for performance (caches ImageData by genome+settings)
- **Color palettes**: Built-in palette interpolation methods for visual individuals

### Individual Types

The codebase includes multiple individual implementations in separate files:

**Tree-based GP** (`GPPatternIndividual.js`):
- Genome: Expression tree (FunctionNode/TerminalNode)
- Evaluates mathematical expressions over 2D coordinate space (x, y, r, theta)
- Functions: arithmetic, trigonometric, conditionals
- Mutation: subtree replacement; Crossover: subtree swapping

**Grammatical Evolution** (`GrammaticalEvolutionIndividual.js`, `Grammar.js`):
- Genome: Array of integers (0-255) used as production rule choices
- Derives phenotype expressions from BNF grammar
- Expression compilation for performance (converts to JavaScript functions)

**Drawing Commands** (`DrawingCommandIndividual.js`):
- Genome: Sequence of canvas drawing operations
- Direct manipulation of 2D canvas context

**3D Graphics** (`SuperFormula3DIndividual.js`, `CreatureIndividual.js`):
- Generate Three.js meshes instead of 2D canvas drawings
- Must implement `is3D()` returning true
- Meshes added to shared scene via `framework.addMeshToScene(id, mesh)`
- Framework handles per-individual rendering with rotating camera

**Music** (`MusicIndividual.js`):
- Genome encodes MIDI note sequences
- Implements `playMIDI()` and `stopMIDI()` for audio playback
- Accesses MIDI output via `setMidiOutput()`

**Other types**: BinaryPattern, GERadiusDrawing, Character, DAG, Sheep, Penrose

### Extension System (`PaletteExtensionMixin.js`, `PaletteControlUI.js`)

Individuals can declare framework extensions:
```javascript
static getFrameworkExtensions() {
    return {
        ui: PaletteControlUI,  // UI component class
        settings: ['colorPalette'],  // Setting names
        hotkeys: {}  // Future use
    };
}
```

Extensions access framework via `this.framework.updateSetting(key, value)` which triggers cache invalidation and re-rendering.

### Palette System (`ContinuousPaletteSystem.js`)

Global palette system using d3-scale-chromatic:
- Sequential: viridis, inferno, magma, plasma, turbo, rainbow, etc.
- Diverging: spectral, RdBu, PuOr, etc.
- Custom: fire, ocean, sunset, forest
- Accessed via `window.continuousPaletteSystem.getColor(paletteName, t)`

Individuals can use palette mixins:
```javascript
class MyIndividual extends withPaletteExtensions(Individual) {
    visualize(canvas) {
        const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
        const palette = this.getPaletteByName(paletteName);
        const color = this.interpolateColor(palette, value);
    }
}
```

## Key Implementation Details

### 3D Rendering Strategy
To avoid hitting browser WebGL context limits (typically 16), all 3D individuals share:
- Single `THREE.Scene` with lighting
- Single `THREE.WebGLRenderer`
- Per-individual meshes stored in `shared3D.meshes` Map

Rendering process (Anemone.js:617-635):
1. Create temporary scene with only target individual's mesh
2. Position camera to frame mesh with rotation animation
3. Render to shared renderer's canvas
4. Copy pixels to individual's display canvas via 2D context

### MIDI Initialization
Framework initializes MIDI at startup (Anemone.js:29-90):
- Requests MIDI access with 5-second timeout
- Prefers "IAC Driver" or "Logic Pro Virtual" outputs
- Plays test note on initialization
- Passes `midiOutput` to individuals that support it

### Performance Optimization
- **Image caching**: `visualizeWithCache()` caches ImageData to avoid redundant computation
- **Expression compilation**: GE individuals compile phenotype strings to JavaScript functions
- **Timing instrumentation**: `console.time/timeEnd` blocks measure render performance

### Selection and Fitness
- Click individual → increment fitness, add to selected set
- Right-click → decrement fitness, remove if fitness reaches 0
- "Evolve" button disabled until at least 2 individuals selected (required for crossover)

## Common Patterns

**Creating a new individual type:**
1. Extend `Individual` or `withPaletteExtensions(Individual)`
2. Implement `generateRandomGenome()`, `visualize(canvas)`, `mutate()`, `crossover()`, `clone()`
3. Register in `Anemone.js` individual type selector (line 548-562)
4. Add script tag to `index.html`

**Accessing framework settings:**
```javascript
const setting = this.getFrameworkSetting('colorPalette');
```

**Adding a UI extension:**
Create class with `mount(container)` method and register via `getFrameworkExtensions()`.

**3D individual requirements:**
- Implement `is3D()` returning true
- Call `window.framework.addMeshToScene(this.id, mesh)` in `visualize()`
- Framework handles animation loop automatically

## Default Individual Type

The default individual type is set in `main.js:1` as `SuperFormula3DIndividual`. To change the default, modify this line.

## Project Context

This was designed by jmmcd and mostly implemented by Claude Code. It demonstrates IEC without training corpora or neural networks - pure evolutionary art generation.

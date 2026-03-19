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

---

## Recent Development (Session: 2025-11-18)

### Genome/Phenotype Display Feature

Added a comprehensive genome and phenotype display system that shows detailed information about the currently selected individual.

**Implementation** (`Anemone.js` lines ~387-591, `index.html` lines 29-34, `styles.css` lines 215-254):

- **Display Section**: Added below the grid, shows genome and phenotype of last-clicked individual
- **Smart Detection**: `isPhenotypeInformative()` determines when phenotype adds value beyond genome
- **Type-Specific Formatting**:
  - **Binary genomes**: Grouped in chunks of 8 bits for readability
  - **Integer genomes**: 16 values per line with spacing
  - **Float genomes**: 8 values per line with 4 decimal places
  - **Tree genomes (GP)**: Shows expression tree with depth/size stats
  - **String phenotypes**: Direct display with truncation for long strings
  - **Array phenotypes (DrawingCommands)**: Formatted list showing first 5 commands with key parameters
  - **SuperFormula phenotypes**: Shows parameters PLUS actual mathematical formula with values filled in

**Formula Visualization** (`formatSuperFormula()`):
- SuperFormulaIndividual: Shows `r(φ) = [|cos(m·φ/4)/a|^n2 + |sin(m·φ/4)/b|^n3]^(-1/n1)` with actual values
- SuperFormula3DIndividual: Shows both `r₁(θ)` and `r₂(φ)` formulas plus combined equation

**Framework Changes**:
- Added `currentIndividual` property to track last-clicked individual
- Added `displayCurrentGenome()` method called on render and click
- Clears current individual on evolve, reset, or individual type switch

**Phenotype-Informative Individual Types**:
- CreatureIndividual (turtle command string like "FFRR+LB-F")
- SuperFormulaIndividual & SuperFormula3DIndividual (parameters + formulas)
- GrammaticalEvolutionIndividual (derived expression from grammar)
- DrawingCommandIndividual (list of drawing commands with parameters)
- GERadiusDrawingIndividual, MusicIndividual, CharacterIndividual

### Future Work: Transformer-Based Individuals

**Discussion**: Explored adding small pretrained transformer models as a new individual type using Hugging Face's Transformers.js library.

**Promising Models** (all browser-compatible):
- `Xenova/all-MiniLM-L6-v2` (~23 MB) - Embedding model, best choice
- `Xenova/distilgpt2` (~80 MB) - Small text generation
- `Xenova/tiny-random-bert` (~5 MB) - Testing/experimentation

**Proposed Implementation** (not yet built):
```javascript
class TransformerEmbeddingIndividual extends Individual {
    // Genome: Text prompt describing visual qualities
    // Example: "flowing organic curves", "geometric crystalline"

    async getEmbedding() {
        // Use Transformers.js to embed text → 384-dim vector
    }

    embeddingToParameters(embedding) {
        // Map embedding dimensions to visual parameters
        // (SuperFormula params, GP tree params, etc.)
    }

    // Evolution operates on text:
    // - Mutation: change/add/remove words
    // - Crossover: swap sentence fragments
    // - Users select visuals, genome stays as readable text!
}
```

**Key Benefits**:
- Text-driven evolution (very intuitive for users!)
- High-dimensional embedding space (384-768 dims) ideal for evolution
- Explainable genomes (actual language descriptions)
- Can interpolate semantically between concepts

**Technical Considerations**:
- Model download: 23-100 MB (1-10 seconds on good connection)
- Initialization: 1-3 seconds first load
- Inference: ~50-200ms per embedding
- Memory: ~100-300 MB in browser
- Requires async operations in visualization pipeline (main architectural change)

**Implementation Priority**: Medium. Would be a unique and user-friendly individual type, but requires refactoring visualization pipeline for async operations.

**CDN Integration** (no build process):
```html
<script type="module">
    import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';
</script>
```

### Development Notes

- All changes maintain the no-build-process philosophy
- Genome display uses monospace font for readability
- Phenotype display prioritizes human interpretability over raw data
- Formula rendering uses Unicode subscripts (₁, ₂) for better appearance

---

## Recent Development (Session: 2026-03-19)

### EEG Sonification System

Added real-time EEG data sonification capability using DAG-based mapping from EEG features to MIDI notes.

**New Files**:
- `EEGSonificationIndividual.js`: Individual type for mapping EEG data to MIDI via DAG
- `EEGPreprocessing.js`: EEG data pipeline with parsing, event detection, feature extraction, and time-grid alignment
- `data/EEG/sample_eeg.csv`: Sample data file for testing

**Architecture**:
- **EEGDataStream**: Handles Muse headband CSV format
  - Parses `YYYY-MM-DD HH:MM:SS.mmm` timestamps
  - Detects and skips event rows (contain "/" in final column)
  - Extracts Alpha/Beta/Theta frequency bands
  - Computes 5 normalized features per sample (mean, variance, peak, baseline, asymmetry)
  - Auto-loops when data ends

- **EEGSonificationIndividual**: Extends DAGIndividual
  - Input nodes: 5 EEG features instead of mouse/time
  - Operates identically to DAGIndividual but with EEG data source
  - No MIDI output if no data loaded

**Framework Integration** (`Anemone.js`):
- `setEEGStream(stream)`: Sets the EEG data source
- `distributeEEGStream()`: Passes stream to all individuals that support it
- CSV loader with file validation and status display
- EEG stream automatically distributed after evolution/type switching

**UI Updates**:
- Added "Load EEG CSV" button next to Individual Type selector
- Shows CSV loading status (sample count, duration)
- Playback status panel (green) showing real-time notes being triggered
  - Updates every 50ms while playing
  - Shows note names (e.g., "Playing D3 (145ms)") with countdown
  - Shows "Rest" for inactive outputs
  - Auto-hides when playback stops

**Key Features**:
- Real-time streaming: EEG stream fed to active individual as if from live headset
- CSV replay: Load historical recordings, replays at realtime speed
- Interactive evolution: Users click individuals based on sonification quality vs EEG faithfulness
- Compact visualization: DAG nodes scaled down to prevent overlap
- Robust error handling: Try-catch throughout stream processing, evaluation loop, and MIDI operations

**Data Format Support**:
- Muse headband CSV with frequency bands (Delta, Theta, Alpha, Beta, Gamma)
- Irregular timestamps automatically aligned to 200ms grid
- Configurable downsampling (default: keep every 5th sample)
- Event detection and filtering

**Known Behavior**:
- Live Server (VS Code "Go Live") auto-reloads on code changes—use `python -m http.server` for testing without reloads
- EEG data loops seamlessly when end is reached
- Multiple output nodes can play different notes simultaneously

**Implementation Details**:
- Playback status updates use `setInterval(50ms)` to check if individual is running
- OutputNode tracks `lastNoteTime` to detect active notes (within 200ms duration window)
- MIDI note-off callback wrapped in try-catch to handle disconnected outputs
- CSV feature extraction uses `Math.tanh()` normalization for stable [-1,1] range
- Timestamp parsing validates dates and detects invalid/malformed entries per-line

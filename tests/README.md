# Tests

Dependency-free smoke and regression tests for Anemone, runnable with plain Node
(no build step, no test framework, no `npm install`).

```bash
node tests/run.js
```

Exits non-zero if anything fails.

## What's covered

For **every** individual type:
- **Genetic operators** — construct, `mutate`, `crossover` (returns two same-type
  children), and `clone` (same type, preserves fitness, distinct object).
- **Render path** — `visualize(canvas)` runs without throwing, before and after a
  mutation, against a stubbed 2D canvas.
- **Capability flags** — `usesColorPalette()` and `is3D()` return the expected values.

Plus targeted regression tests:
- **Sheep neural network** — the input→hidden weight matrix is sized to the genome,
  and the phenotype values are all finite and in range (guards the bug where an
  undefined `genomeLength` left the weights empty, producing `NaN` so only the
  sheep's head rendered).

## How it works

`harness.js` loads the source `<script>` files into a Node [`vm`](https://nodejs.org/api/vm.html)
sandbox with minimal browser stubs (a `window`, a no-op 2D canvas context, and a
palette colour stub). `Anemone.js` and `main.js` are deliberately **not** loaded —
they auto-run framework setup that needs a real DOM/MIDI environment.

When you add a new individual type, add its class name to both `SOURCES` and
`INDIVIDUAL_CLASSES` in `harness.js` and it will be exercised automatically.

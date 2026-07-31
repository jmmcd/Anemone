# Architecture

The system separates three concerns:

- **Representations** (`representations/`) — genome structure and genetic operators are provided by a Javascript version of [Program Trace Optimisation](https://github.com/Program-Trace-Optimisation/PTO). This means for every new problem we don't need to implement operators, as PTO is "universal". 
- **Modalities** (`modalities/`) — output mechanisms (`Canvas2DModality`, `MIDIModality` with Web Audio fallback, `ThreeDModality`)
- **Individuals** (`individuals/`) — application code that composes a representation and a modality

Each individual holds a representation object and delegates `mutate`, `crossover`, and `clone` to it. Rendering is either done inline or via a modality helper. See `CLAUDE.md` for the full architecture reference.

* Visualiser can be from genome, phenotype, or both, it's up to the individual.

# Testing

A dependency-free smoke/regression suite runs under Node:

```
npm test        # or: node tests/run.js
```

A pre-commit hook that runs it is checked in at `scripts/git-hooks/`. Activate it once per clone:

```
git config core.hooksPath scripts/git-hooks
```

Skip it for a single commit with `git commit -n`.

# Deployment

I deploy this to Surge just by running this in the current directory:

```surge . anemone.surge.sh``` 

# Adding a new problem

The goal is to design Anemone so that adding a new problems is easy. With PTO we don't need to define a new representation (encoding and search operators) for every problem. Instead the user only has to supply a **generator function** which samples from the solution space. It should go into a new `individuals/XYZIndividual.js` class where XYZ is your application name. Then add an entry to `framework/IndividualRegistry.js` (the single source of truth for the type list) and a `<script>` tag in `index.html`; `npm test` will tell you if you missed either. There are several audio, MIDI and graphics rendering examples already provided, so many new applications won't need much code. 
# Active intervention (direct manipulation)

A type can let the user edit its rendered phenotype **directly** — by pointer, on
the zoom canvas — with each edit written back into the heritable genome, so
evolution continues from what the user drew instead of discarding it. The step
sequencers use this (click or drag cells to rewrite the loop), but the protocol
is not grid-specific.

The framework asks `isEditable()`, then calls
`beginEditSession(canvas, session)` and keeps the returned teardown function to
call when the lightbox closes. `session` is the framework's side of the deal, so
your type needs to know nothing about the lightbox:

```js
isEditable() { return true; }

beginEditSession(canvas, session) {
    // ...bind your own pointer handling on `canvas`...
    // after each edit:      session.onEdit();
    // when the gesture ends: session.onGestureEnd();
    return () => { /* unbind */ };      // teardown
}
```

`session.onEdit()` refreshes the info panel; `session.onGestureEnd()` resyncs the
small grid tile and restarts the sound if this individual is the one playing.

**The genome-writeback contract is yours.** An edit must go through the
representation — `this.genome = rep.setGene(this.genome, name, value)` — not just
mutate a cached phenotype, or the change is lost at the next `mutate`/`clone`.
That is what makes the edit *heritable*, which is the whole point: the user's
intervention becomes genetic material rather than a one-off touch-up.

If your phenotype is a grid you need none of the above: implement
`isGridEditable()`, `cellAtCanvasXY(canvas, px, py)`, `cellOn(c, s)`,
`setCellHit(c, s, on)` and — for velocity — `cellVel(c, s)` / `setCellVel(c, s, v)`,
and the base `beginEditSession` supplies the whole gesture set for you (this is
how DrumMachine and Melody work): click toggles, a horizontal-first drag paints,
and a vertical-first drag on an on-cell rides that cell's velocity up or down.

# Adding a new individual type — checklist

1. Extend `Individual` in `individuals/XYZIndividual.js`.
2. Write a self-contained `generator(rnd)` and a shared
   `new PTORepresentation(generator)`; assign it to `this.representation` and set
   `this.genome = genome || this.representation.generateRandom()`.
   (Generator rules: no closure variables, no `new` around `rnd` calls, `for`
   loops rather than `Array.from` — see CLAUDE.md > PTORepresentation for why.)
3. Implement `visualize(canvas)`, reading `this.phenotype`.
4. Opt into what you need with the capability flags: `is3D()`,
   `usesColorPalette()`, `usesPhoto()`, `usesPerformanceControls()`,
   `usesMIDISync()`, `isGridEditable()`, …
5. Register it in `framework/IndividualRegistry.js` (the single source of truth
   for the type list — the menu and the tests both read it).
6. Add a `<script>` tag in `index.html`, and the same path to `SOURCES` in
   `tests/harness.js` (**in dependency order** — base classes first).
7. Run `npm test`. It will tell you what you forgot: a missing registry entry, a
   missing `<script>` tag, and an unresolvable class name are all test failures,
   not silent runtime breakage.

Inherited `mutate`/`crossover`/`clone` delegate to the representation, so only
override them if your genome semantics genuinely fall outside that model.

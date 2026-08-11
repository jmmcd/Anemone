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

# Parametric animation (evolving a movement, not a picture)

Most types evolve a still image. A type can instead evolve a **movement**, by
making the rendered pose a pure function of a clock:

```
generator → params → pose(params, t) → pixels
```

`CatIndividual` is the worked example (an articulated quadruped and its walk
cycle), and `examples/parametric-cat.html` is the same technique as a standalone
p5 sketch with no framework around it, if you want to read it in one file.

Why it is worth the trouble: a sprite sheet is opaque to mutation, but a
parameter vector is not, so an animation expressed this way can be evolved
exactly like anything else here. There are no keyframes and no frame storage —
the whole cycle is a handful of oscillators.

The techniques that matter, all visible in `CatIndividual`'s header:

- **Phase-offset oscillators.** One clock, four legs, four offsets into the same
  cycle. A walk, trot, pace and bound differ in nothing but those four numbers.
- **Procedural path + inverse kinematics.** Do not oscillate the joint angles
  directly — feet then skate and sink, and no gene tuning fixes it. Drive the
  *foot* around a closed path in world space and solve the bones backwards
  (closed-form, ~10 lines for two bones).
- **Constrain the map, not the search.** Derive bone lengths from stance height
  and stride so every genome can reach the ground, rather than evolving them
  freely and rejecting most of the population in `validate()`.
- **Relative geometry.** One absolute size, everything else a fraction of it, so
  a mutated gene rescales the figure instead of dislocating it. (`RobotIndividual`
  makes the same argument for a static figure.)
- **Delay chains** (`t - i*lag` down a chain of segments) for follow-through,
  **rectified/harmonic sines** for bounce and squash & stretch, **seeded noise**
  for drift, and **exponentiated sines** (`max(0,sin)^n`) as sparse impulses for
  blinks and twitches.

Three rules for the implementation:

1. `animatesContinuously() { return true; }` — this is what makes `[` / `]` mean
   animation speed and `.` mean play/pause for your type, in both the dispatcher
   and the `?` overlay.
2. Read `Individual.AnimationClock.seconds()`, never `performance.now()`. It is
   the app's one animation transport, shared with every other animating type, so
   the whole grid pauses and changes speed together.
3. Keep the pose function **pure and stateless**, and put its phase in the
   genome. That is what makes it testable headlessly, reproducible from a saved
   genome, and renderable at any size. See the Cat tests in `tests/run.js` — feet
   planted on the ground line, stance travel equal to the stride length, IK
   always reaching — and `node scripts/cat-preview.js`, which draws a filmstrip
   of the gait cycle offline (a still frame tells you nothing about a walk).

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

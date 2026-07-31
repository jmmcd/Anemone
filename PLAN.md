# Anemone code-quality & UX pass — implementation plan

Agreed scope: refactor/dedupe/layout/readability/extensibility + features D1–D5.
No new individual types. Every phase ends with `node tests/run.js` green (226 tests,
~4s) and, where noted, a manual browser smoke (one 2D type, one 3D type, one sound
type: e.g. PolarCurve, JennPolytope, DrumMachine — render grid, zoom, evolve, play).

Work in phase order; each numbered step is roughly one commit. Update CLAUDE.md
in the same commit as the change it describes (it is the contract for future
sessions — stale instructions are worse than none).

---

## Phase 0 — safety net & housekeeping

0.1 **`package.json`** (repo root): `{ "name": "anemone", "private": true,
    "scripts": { "test": "node tests/run.js" } }`. No dependencies, no build.
    Do NOT add module/type fields — the app is plain `<script>` tags and must
    stay that way (PTO structural naming compiles generator source text; a
    bundler could rename and silently break it).

0.2 **Pre-commit hook**: create `scripts/git-hooks/pre-commit` (executable):
    `#!/bin/sh` + `exec node "$(git rev-parse --show-toplevel)/tests/run.js"`.
    Document in DEVELOPERS.md: activate with
    `git config core.hooksPath scripts/git-hooks`; skip with `git commit -n`.
    Run the config command as part of this step.

0.3 **Housekeeping**: `git rm --cached .DS_Store` (already present in repo root),
    ensure `.DS_Store` is in `.gitignore`; move `pto-trace-roundtrip-bug.js` →
    `scripts/pto-trace-roundtrip-bug.js` (it's a debug script, not app code) and
    fix its internal relative path to `vendor/pto-bundle.js` if needed.

---

## Phase 1 — single type registry + declarative panel table

1.1 **`IndividualRegistry.js`** (root for now; moves to `framework/` in Phase 2).
    One ordered list, the sole source of truth for the four currently
    hand-maintained lists (index.html `<option>`s, `individualTypeMap()` in
    Anemone.js, `INDIVIDUAL_CLASSES` in tests/harness.js — the `<script>` tags
    remain manual but become test-checked):

    ```js
    // Order = menu order. `hidden` = registered/deep-linkable but not in the menu.
    const INDIVIDUAL_TYPES = [
        { name: 'PatternIndividual',           label: 'Pattern' },
        { name: 'PatternGrammarIndividual',    label: 'Pattern (Grammar)' },
        { name: 'AnimatedPatternIndividual',   label: 'Animated Pattern', hidden: true },
        // ... every current <option> in index.html order, plus hidden types
    ];
    if (typeof window !== 'undefined') window.INDIVIDUAL_TYPES = INDIVIDUAL_TYPES;
    ```

    Entries carry the class *name* as a string; resolution to the class object
    happens at startup via a lookup (`window[name]` in the browser; the sandbox
    global in tests). This keeps the registry loadable before/without the classes
    and JSON-simple.

1.2 **Anemone.js**: `individualTypeMap()` / `resolveIndividualType()` derive from
    `INDIVIDUAL_TYPES` (name → resolved class). `setupUI()` builds the
    `<select id="individual-type-select">` options from the registry (skipping
    `hidden`), keeping the current default-selected logic (`main.js` deep-link
    resolution is unchanged). Delete the hardcoded `<option>` list from
    index.html, leaving the bare `<select>`. Add
    `<script src="IndividualRegistry.js">` before Anemone.js.

1.3 **tests/harness.js**: add `IndividualRegistry.js` to `SOURCES`; derive
    `INDIVIDUAL_CLASSES` from the sandbox's `INDIVIDUAL_TYPES` instead of the
    hand list. **New tests in tests/run.js**: (a) every registry entry resolves
    to a defined class extending Individual; (b) every `*Individual.js` file on
    disk (fs.readdir of the individuals location) has a registry entry — this
    converts "forgot to register" from silent runtime failure to test failure.
    (c) every registry name appears in index.html's script tags (read
    index.html as text) — catches the forgotten `<script>`.

1.4 **Declarative panel table** in Anemone.js `loadExtensions()`: replace the five
    copy-pasted `typeof sample.usesX === 'function' && sample.usesX()` blocks with

    ```js
    const PANELS = [
        { flag: 'usesColorPalette',        ui: () => new PaletteControlUI(this) },
        { flag: 'usesPhoto',               ui: () => new PhotoControlUI(this) },
        { flag: 'usesAudioClip',           ui: () => new AudioControlUI(this) },   // match current flags exactly
        { flag: 'usesPerformanceControls', ui: () => new PerformanceControlsUI(this) },
        { flag: 'usesMIDISync',            ui: () => new MIDISyncUI(this) },
        { flag: 'usesOSCInput',            ui: () => new OSCInputUI(this) },
    ];
    ```

    (Read the current `loadExtensions()` first and mirror its exact flag names,
    constructor signatures, and mount order — CodeEditorUI's
    editableSections-based attachment stays as-is.) Adding a panel becomes a
    one-line diff.

---

## Phase 2 — role-based directories (one mechanical commit, no code changes)

Destinations (agreed with jmmcd; SITLanguage goes in a dir, not beside its clients):

| Directory | Files |
|---|---|
| `framework/` | Anemone.js, EvolutionaryAlgorithm.js, Individual.js, IndividualRegistry.js, main.js |
| `individuals/` | all 33 `*Individual.js` files incl. RadialSurface3DIndividual.js |
| `services/` | Palette.js, Photo.js, AudioClip.js, MIDISync.js, OSCInput.js, SITLanguage.js |
| `ui/` | PaletteControlUI.js, PhotoControlUI.js, AudioControlUI.js, MIDISyncUI.js, OSCInputUI.js, PerformanceControls.js, CodeEditorUI.js |
| `export/` | ImageSave.js, MeshExport.js, AudioExport.js, MidiExport.js, ExportNaming.js |
| `representations/` | (unchanged) + Grammar.js moves here |
| `modalities/` | unchanged |

Use `git mv` so history follows. Then update, in the same commit:
- every `<script src>` path in **index.html** (keep the existing dependency order,
  just re-point paths);
- `SOURCES` in **tests/harness.js** (same order, new paths);
- **scripts/** tools that reference source paths (jenn-preview.js,
  endlessforms-preview.js, sit-preview.js, sit-figures.js load via the harness —
  verify each still runs: `node scripts/sit-figures.js /tmp/x.png` etc.);
- path references in **CLAUDE.md** (the representations table, "root `*.js`"
  wording in Architecture, Grammar.js location notes) and **DEVELOPERS.md**;
- index.html comment structure: group script tags by directory with a one-line
  comment per group.

Smoke: `npm test` + serve via `python -m http.server` **and** open via `file://`
(both are supported entry modes) + run each `scripts/*-preview.js` once.

---

## Phase 3 — split Anemone.js (~1600 lines → framework + four modules)

Extract one seam per commit, in this order (safest first). Pattern for each:
new class in `framework/`, constructed by `InteractiveEAFramework` and stored on
it; the framework keeps thin delegate methods for every call site used by
individuals or other modules (grep for each method name before moving — e.g.
`addMeshToScene` is called from individuals' `visualize()`), so **no individual
file changes** in this phase. Add each new file to index.html (before Anemone.js)
and harness SOURCES.

3.1 **`framework/Shared3D.js`** — the shared Three.js pipeline: scene/renderer
    creation, `addMeshToScene`, `removeMeshFromScene` (traverse-dispose),
    `renderMeshToCanvas` (camera framing incl. `userData.framingCenter/Radius`
    and `background3D`, supersampling via `superSample3D`), the grid 3D animate
    loop, camera state (`cameraFOV`, `cameraDistanceFactor`, rotation time/toggle).
    Framework delegates `addMeshToScene`/`removeMeshFromScene`/`renderMeshToCanvas`
    and exposes `framework.shared3D` exactly as today (individuals check it).

3.2 **`framework/Hotkeys.js`** — replace the keydown if/else chain with a
    declarative table; each binding:

    ```js
    { keys: ['['], when: 'sequencer', description: 'Shorten loop length',
      action: (fw) => fw.adjustSequencerLength(-1) },
    { keys: ['['], when: '3d', description: 'Zoom camera out', ... },
    ```

    Contexts (`when`) computed once per keydown from framework state:
    `always | lightbox | 3d | sequencer | animatedPattern | sound`. Preserve
    current semantics *exactly* — the same key legitimately means different
    things per context (`[`/`]`, `.`); encode that as multiple entries with
    disjoint `when`, first match wins in table order. Include the hex-key tile
    selection (`0–9a–f`), space (evolve, closing lightbox first), Escape
    (close everything), `-/=/\` camera keys. `description` strings feed D1.
    Guard: ignore keydown when focus is in an input/textarea/select (check
    whether the current handler does this; if not, this is a bug worth fixing
    here — typing in the code editor must not trigger hotkeys).

3.3 **`framework/Lightbox.js`** — `openZoom`, `closeZoom`, `_renderLightboxInfo`,
    `startZoomAnimation` (incl. the animation token + `animatesGeometry` path),
    `_sampleIndividual` stays in framework; edit-session wiring (see Phase 5 —
    if Phase 5 is done first this is just a call; otherwise move
    `setupGridEditing`/`teardownGridEditing` here verbatim and revisit).
    Owns the lightbox DOM refs and the export-button visibility logic
    (`individualExportKind`).

3.4 **`framework/ExportManager.js`** — `saveCurrentImage`, `exportCurrentSTL`,
    `exportCurrentWav`, `exportCurrentMidi`, `typeStem`, `individualExportKind`,
    `reconstructAndPlace` + placement mode (`enterPlacementMode`,
    `exitPlacementMode`, `placeLoadedIndividual`), and `showToast` (or a tiny
    `ui/Toast.js` if it stays generic — implementer's choice, keep it one place).

    What remains in `InteractiveEAFramework`: population/EA orchestration, MIDI
    init, settings, extension loading, grid rendering + selection, history,
    type switching. Target ≤ ~700 lines.

Smoke after each sub-step: full manual pass (grid render 2D/3D, zoom, rotate,
all hotkeys touched by that step, save/export, placement flow after 3.4).

---

## Phase 4 — dedupe + conventions

4.1 **`services/ExpressionCompiler.js`**: one
    `compileExpression(expr, varNames, opts)` used by AnimatedPattern
    (`x,y,t`), PatternGrammar (`x,y`), PolarCurve (`t`), RadialSurface3D
    (`theta,phi` / `a`). Before writing it, diff the four current
    implementations for behavioural differences (safety wrapping, NaN/Infinity
    handling, allowed Math functions, error fallback value) and parameterise
    only what genuinely differs; each call site keeps its own fallback
    behaviour. Renders must be pixel-identical afterwards — verify with the
    existing render-path tests plus eyeballing one zoom per affected type.

4.2 **Seeded PRNG**: add `Individual.mulberry32(seed)` (static, beside
    `Individual.compileFunction`). Refactor `AntRenderingIndividual._mulberry32`
    to use it. Audit the other seed-using types (JennPolytope, PSystem, LSystem,
    DrumMachine, Melody, SITCode3D): refactor **only** exact-duplicate PRNG
    implementations; where a type uses a different generator, leave it —
    changing the stream changes every rendered phenotype for saved genomes.

4.3 **Docs canonicalisation**: file headers are canonical for deep design detail
    (Jenn, SITLanguage, PSystem); CLAUDE.md keeps the *constraints and
    contracts* (what future sessions must not break) plus a pointer to the
    header. Trim CLAUDE.md rows that duplicate header prose near-verbatim.
    Do not remove any "IMPORTANT"/constraint content from CLAUDE.md.

4.4 **Privacy convention sweep** (low priority, opportunistic): `_underscore`
    for internal helpers in files already being touched by this pass; do not
    churn untouched files for naming alone.

---

## Phase 5 — generalise active intervention (the paper claim)

Goal: any third-party individual type can declare direct-manipulation editing
whose edits are written back into the heritable genome. Currently the pointer
logic is framework-owned and grid-shaped.

5.1 **Base `Individual`**: add

    ```js
    isEditable() { return this.isGridEditable(); }   // keep old flag as the default signal
    beginEditSession(canvas, session) { ... }         // default: the grid implementation
    ```

    Move the pointer logic of `Anemone.js setupGridEditing` into the base
    `beginEditSession` (or a helper it calls, `Individual._gridEditSession`):
    pointer capture, click-toggle, drag-paint with paint-direction from first
    cell, per-cell dedupe — driven by the existing hooks `cellAtCanvasXY`,
    `cellOn`, `setCellHit`. `session` is a callbacks object provided by the
    framework: `{ onEdit() , onGestureEnd() }` — the framework keeps its
    responsibilities (re-render lightbox info, refresh `_tileCanvas`, restart
    audio if `currentlyPlaying`). Return a teardown function (wraps the
    AbortController), which the Lightbox calls on close.

5.2 **Framework/Lightbox**: replace `setupGridEditing`/`teardownGridEditing`
    with `this._endEdit = individual.beginEditSession(canvas, {...})` guarded by
    `isEditable()`. DrumMachine/Melody need no changes — they inherit the grid
    default via their existing hooks.

5.3 **Docs**: new short section in CLAUDE.md ("Active intervention") and
    DEVELOPERS.md: the protocol, the genome-writeback contract
    (`representation.setGene` keeps edits heritable), and that a type may
    override `beginEditSession` entirely for non-grid gestures. Add a harness
    test: base `beginEditSession` exists; DrumMachine/Melody `isEditable()`.

---

## Phase 6 — user-facing features

6.1 **D5 — velocity editing (DrumMachine + Melody)**
    - New hooks beside the existing ones: `cellVel(c, s)` → 0..1 and
      `setCellVel(c, s, v)` (folds into the `vel_c_s` genes via
      `representation.setGene`, mirroring `setCellHit`). Confirm both types'
      genomes carry per-cell velocity (`vel_c_s` per CLAUDE.md; check Melody).
    - Gesture (in the grid edit session, Phase 5): pointerdown on an **on** cell
      then vertical-first movement (≥ ~6px before horizontal wins) = velocity
      drag on that one cell — up louder, down softer, full canvas-height drag ≈
      full range, live re-render while dragging. Horizontal-first (or starting
      on an off cell) = existing paint. Plain click still toggles.
    - Rendering: on-cell drawn as a **partial fill from the bottom**
      proportional to velocity, in the track's colour (colour keeps meaning
      track, not velocity — Logic drum-machine idiom). Dim full-cell outline
      so a low-velocity cell still reads as "on". Same drawing in tile and zoom
      (fit-scaled, per the resolution-independence rule).
    - Tablet: add `touch-action: none` to the lightbox canvas CSS so vertical
      drags don't scroll; Pointer Events already unify mouse/touch.
    - Audio/MIDI paths already consume velocity (verify `renderToAudioBuffer`
      and `toMIDISequence` read the vel genes; fix if either ignores them).
    - Remove the corresponding TODO.md entry.

6.2 **D1 — `?` help overlay**
    - Generated from the Hotkeys table (key(s) + description, grouped by
      context, showing only rows whose `when` can apply to the current type,
      with the always-on rows first). Reuse the about-modal lightbox pattern
      (new `ui/HelpOverlayUI.js` or a static panel built by Hotkeys).
    - Open on `?` (shift-/), close on `?`/Escape/click-out. Add a small "?"
      icon-button in the app bar for touch users (no keyboard).
    - Include non-key gestures worth teaching: click = like, double-click/long-
      press = zoom, drag-in-zoom = edit (when editable).

6.3 **D2 — undo evolve**
    - `z` and `u` → step back one generation using the existing generation-
      history mechanism (find the method `renderHistory` clicks invoke and call
      it with the previous index; no new state). No-op with toast "No earlier
      generation" at gen 0. Add to hotkey table (`description: 'Back one
      generation'`). Optional: `Shift+Z` forward again if history supports it —
      only if it falls out free.

6.4 **D3 — population size & mutation-rate controls**
    - New drawer section "Evolution" (index.html + `ui/EvolutionControlsUI.js`,
      or extend the framework settings section): population size select
      (9 / 16 / 25 — square grids) and mutation-rate slider (range around the
      current default; find where `mutate(rate)` gets its rate — likely
      EvolutionaryAlgorithm — and surface that exact value, default marked).
    - Pop size change: rebuild population to the new size **preserving
      existing individuals** where possible (truncate / pad with fresh randoms
      rather than full reset), re-layout grid (`grid-template-columns:
      repeat(sqrt(n), 1fr)` — check styles.css for the current 4-col rule).
      Hex-key selection covers only the first 16 tiles at pop 25 — acceptable,
      note it in the help overlay.
    - Mutation rate: framework setting read by the evolve step; takes effect
      next generation; no cache invalidation needed.

6.5 **D4 — lock/protect a tile**
    - Third per-tile state alongside like: **locked** = copied unchanged into
      the next generation, excluded from the parent pool and from the elitism
      count (it must not crowd out liked parents' slots — implement as: locked
      individuals carry over first, then elitism/offspring fill the rest).
    - Gestures: Shift+click on pointer-fine; on touch, a small padlock
      icon-button in the tile corner (visible on the tile overlay where the
      zoom/⛶ affordance lives — mirror that pattern). Visual: padlock badge +
      distinct border colour (styles.css).
    - EvolutionaryAlgorithm: new `toggleLock`/`locked` set, honoured in
      `evolve()`; history entries preserve lock state. Harness tests: locked
      individual survives evolve unchanged (same genome reference or equal
      trace), is never returned by `selectParent`.

---

## Phase 7 — final pass

- Full CLAUDE.md review: architecture section reflects new directories, the
  registry, Shared3D/Hotkeys/Lightbox/ExportManager, the intervention protocol,
  new features/hotkeys; harness-sync warning updated (registry now does most of
  it).
- DEVELOPERS.md: "adding a new type" checklist updated (extend Individual →
  write generator → register in IndividualRegistry.js → add `<script>` tag →
  `npm test` tells you what you forgot); hooks setup; intervention protocol.
- TODO.md: remove items delivered here (src/ dir, popsize/mutation controls,
  drum velocity editing).
- Full manual smoke: every menu type renders a grid; zoom + evolve on five
  representative types (2D, grammar, 3D static, Jenn animated, DrumMachine incl.
  velocity edit + live MIDI if available); save/load PNG round-trip; STL/WAV/
  MIDI export; deep link `#DrumMachine`; file:// open.

## Risk notes for the implementer

- **Never touch generator functions' source semantics** — PTO structural naming
  compiles their text; moving/renaming around them is fine, editing inside them
  is not (unless intended, with `reinitializePopulation` consequences).
- The framework must keep publishing `window.framework = this` at the **top of
  its constructor** (3D deep-link startup depends on it) — preserve through the
  Phase 3 split.
- Phase 2 changes ~60 paths in lockstep; do it in one commit with nothing else,
  and run both the Node suite and both browser entry modes (http + file://)
  before committing.
- Saved-artifact compatibility: ImageSave reconstruction uses type names —
  registry keeps the same names, so old PNGs keep loading; verify one saved-PNG
  load after Phase 1 and Phase 2.

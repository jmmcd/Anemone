# `PSystemIndividual` — a Membrane-Computing (P-system) individual type

**Status:** design brief for implementation.
**Audience:** an implementer (Sonnet) adding a new individual type to Anemone.

This document specifies a new PTO-backed 2D individual type that simulates a **P-system**
(membrane computing) and renders its final configuration as a nested luminous cell. It is
self-contained: read it top to bottom and you have everything needed to implement, register,
and verify the type. Code blocks are reference implementations — match surrounding house
style; the exact numeric constants are tunable.

---

## Context

Anemone is an interactive evolutionary-art library where every individual type is a
PTO-backed generator whose output is drawn to a canvas (2D), rendered in 3D, or played as
sound. Existing types cover turtle graphics, GP trees, grammars, tilings, DAGs, drum
machines, etc. A **P-system** (membrane computing, Gh. Păun) is a natural, unused fit: a
*biologically inspired parallel computation over nested cell membranes*, which maps
beautifully onto Anemone's existing "luminous microscopic life" aesthetic (cf.
`AnemoneIndividual`'s bioluminescent look). It also showcases PTO on a **variable,
recursively-nested, mixed int/float genome** — a good exercise of the structural-naming
operators the whole library relies on.

**Intended outcome:** a new selectable individual type that reads as a **living cell
cross-section** — nested translucent membranes filled with glowing, palette-colored
particles — whose composition is driven by *actually simulating a P-system* (multiset
rewriting under maximal parallelism), so evolving the rules produces genuinely different
organisms.

---

## What a P-system is (one paragraph, for the mapping)

A P-system is a **rooted tree of membranes** (nested compartments). Each membrane holds a
**multiset of objects** (symbols from a finite alphabet, e.g. `a³b²c`) and a set of
**rewrite rules** `lhs → rhs`. In each step, **all applicable rules fire in maximal
parallelism** (every object that can be rewritten, is). A rule's products carry a **target**:
`here` (stay), `out` (to the parent membrane), or `in_j` (into child membrane *j*). A rule
may also **dissolve** its membrane (δ): the membrane vanishes and its contents merge into
the parent. Computation proceeds step by step until it halts (or, for art, a step cap).

---

## The mapping (P-system → picture) — the tasteful core

Render the **final configuration** after *N* steps as a **nested luminous cell**:

| P-system concept | Visual mapping |
|---|---|
| Membrane structure (nested tree) | Nested translucent discs — the composition/layout. Root fills the canvas; children packed inside their parent. |
| Membrane nesting depth | Dim cytoplasm fill color + rim brightness keyed to depth (deeper = subtly shifted hue). |
| A membrane's total object count | The membrane's **radius** (area ∝ population, `r ∝ √(1+count)`) — busy compartments swell. |
| An object of symbol *s* | A glowing particle at palette color `Palette.color(s/(K−1))`, jittered inside its membrane. |
| Multiplicity of symbol *s* | Number (and, past a render cap, brightness/size) of particles of that color. |
| Rewrite rules + maximal parallelism | The **generative engine**: it turns a bland initial multiset into a rich, evolvable population. Not drawn directly — *felt* through the resulting distribution. |
| Dissolution (δ) | Contents merged upward — visible as a parent fuller than its own initial multiset would suggest. |
| Simulation seed | Deterministic particle placement (part of the genome, so mutation reshuffles the scatter). |

Final touch: **dark background + `Canvas2DModality.bloom`** ⇒ bioluminescent organism,
matching `AnemoneIndividual`. The membrane hierarchy is the composition, the multiset is the
color content, the rules are the evolvable engine.

**Alternatives (documented, not chosen):** a *temporal-accretion* reading (overlay every
generation as growth strata) or *radial time-rings* (angle = membrane, radius = step). Both
are more abstract and need more layout work; final-config-as-cell is the recommended,
on-theme, lower-risk default. **Membrane division** (cells that split mid-run) is a lovely
optional extension but changes the drawn tree vs. the genome tree and needs stricter blow-up
caps — left as a future flourish; the MVP keeps a fixed tree with **dissolution** only.

---

## Data model — the plain-data spec the generator emits (`this.phenotype`)

Following the library idiom (`BranchIndividual`, the DAG types): **the generator emits plain
data**, and the individual interprets it. The generator emits a P-system *specification*;
the individual *simulates* it (a pure, deterministic function of the spec) to get the
configuration it draws.

```js
// this.phenotype (generator output):
{
  symbolCount: K,      // alphabet size, e.g. 3..6
  steps: S,            // simulation steps, e.g. 3..12
  seed: int,           // deterministic PRNG seed for the sim + particle scatter
  root: MembraneNode
}

// MembraneNode (recursive):
{
  objects: [int, ...],           // length K — initial count of each symbol
  rules:   [Rule, ...],
  children:[MembraneNode, ...]
}

// Rule:
{
  lhs: symIndex,                 // single-symbol LHS (non-cooperative → terminates well)
  rhs: [{ sym: symIndex, target: Target }, ...],   // 1..3 products
  dissolve: bool                 // δ: dissolve this membrane after firing (never the root)
}

// Target:
{ kind: 'here' } | { kind: 'out' } | { kind: 'in', child: childIndex }
```

Non-cooperative rules (single-symbol LHS) keep the dynamics simple and well-behaved; with the
per-membrane and per-step caps below the simulation always terminates and stays bounded —
essential because the render must be finite and deterministic.

---

## The generator (self-contained; obeys every PTO structural-naming rule)

Module-level constants + a self-contained generator. **Critical constraints** (from
`representations/PTORepresentation.js`): no closure variables from outside the generator,
**no `new` inside the generator**, **explicit `for` loops (never `Array.from`)** for repeated
genes, and any recursive helper **declared inside** the generator. Reads of top-level `const`s
and of generator-local `const`s are fine (only `rnd.*` and recursive calls get instrumented).
`rnd` API: `rnd.randint(a,b)` inclusive both ends; `rnd.uniform(a,b)` upper-exclusive;
`rnd.random()` → `[0,1)`; `rnd.choice(arr)`.

```js
// Bounds live at module scope so they can be referenced from inside the generator.
const PS_MAX_DEPTH    = 3;   // membrane nesting depth cap (structure bound)
const PS_MAX_CHILDREN = 3;   // max child membranes per membrane

const pSystemGenerator = (rnd) => {
    // --- global genes ---
    const symbolCount = rnd.randint(3, 6);      // K
    const steps       = rnd.randint(3, 12);
    const seed        = rnd.randint(1, 1000000000);

    // Recursive membrane builder — declared INSIDE the generator (structural naming
    // needs this; it may read symbolCount and the module consts, but must not be a
    // closure over anything outside the generator). No `new`. `for` loops only.
    const buildMembrane = (depth) => {
        // childCount first, so rules can legally target `in_j`.
        const maxKids    = depth < PS_MAX_DEPTH ? PS_MAX_CHILDREN : 0;
        const childCount = maxKids > 0 ? rnd.randint(0, maxKids) : 0;

        // initial multiset (length K)
        const objects = [];
        for (let s = 0; s < symbolCount; s++) objects.push(rnd.randint(0, 6));

        // rules
        const rules = [];
        const numRules = rnd.randint(1, 4);
        for (let r = 0; r < numRules; r++) {
            const lhs = rnd.randint(0, symbolCount - 1);
            const rhsLen = rnd.randint(1, 3);
            const rhs = [];
            for (let p = 0; p < rhsLen; p++) {
                const sym = rnd.randint(0, symbolCount - 1);
                // target: bias to 'here'; 'in' only when children exist
                const roll = rnd.random();
                let target;
                if (childCount > 0 && roll < 0.20) {
                    target = { kind: 'in', child: rnd.randint(0, childCount - 1) };
                } else if (depth > 0 && roll < 0.35) {
                    target = { kind: 'out' };
                } else {
                    target = { kind: 'here' };
                }
                rhs.push({ sym, target });
            }
            // dissolve only for non-root membranes, rarely
            const dissolve = depth > 0 && rnd.random() < 0.12;
            rules.push({ lhs, rhs, dissolve });
        }

        // children (recurse) — explicit for-loop
        const children = [];
        for (let c = 0; c < childCount; c++) children.push(buildMembrane(depth + 1));

        return { objects, rules, children };
    };

    return { symbolCount, steps, seed, root: buildMembrane(0) };
};

const pSystemRepresentation = new PTORepresentation(pSystemGenerator);
```

Notes:
- The recursion + `rnd.*` inside a generator-local helper is exactly the `treeGenerator`
  pattern — structural naming aligns like-typed genes across variable structures, so mutation
  creeps counts/params and crossover swaps subtrees sensibly.
- Verify the trace round-trips: construct, `mutate(0.5)`, `crossover`, `clone` (the harness
  does this). `childCount` is drawn before the rules that reference it, so `in_j` targets stay
  in range under mutation; keep it that way.

---

## The simulation (deterministic, in the individual — not in the generator)

A pure function of the spec (so the inherited `renderKey() → this.phenotype` cache stays
valid). Uses a tiny seeded LCG for reproducibility; distributes objects across matching rules
by a **deterministic integer split** (no per-object loops → no blow-up). Hard caps keep
everything finite. **Never mutate `spec`** — build a fresh mutable tree and `slice()` the
`objects` arrays (the `clone`-isolation test depends on this).

```js
_simulate() {
    const spec = this.phenotype;
    if (this._simSpec === spec && this._sim) return this._sim;   // memoize per-phenotype

    const K   = spec.symbolCount;
    const CAP = 300;          // per-membrane per-symbol object cap
    let st = (spec.seed >>> 0) || 1;
    const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

    // Build a mutable tree with parent pointers from the (read-only) spec.
    const makeNode = (node, parent) => {
        const m = {
            counts: node.objects.slice(0, K),
            rules: node.rules, parent, children: [], alive: true, dissolve: false
        };
        while (m.counts.length < K) m.counts.push(0);
        for (const ch of node.children) m.children.push(makeNode(ch, m));
        return m;
    };
    const root = makeNode(spec.root, null);

    const dfs = (m, list) => { if (m.alive) { list.push(m); m.children.forEach(c => dfs(c, list)); } };

    for (let step = 0; step < spec.steps; step++) {
        const membranes = []; dfs(root, membranes);
        const adds = [];                 // {m, sym, n} scheduled for after the step
        let applied = false;

        for (const m of membranes) {
            for (let s = 0; s < K; s++) {
                const n = m.counts[s];
                if (n <= 0) continue;
                const matching = m.rules.filter(r => r.lhs === s);
                if (matching.length === 0) continue;      // no rule → objects persist
                applied = true;
                m.counts[s] = 0;                          // all n consumed (max parallelism)

                // deterministic split of n across matching rules
                const base = Math.floor(n / matching.length);
                let rem = n - base * matching.length;
                for (const r of matching) {
                    let k = base;
                    if (rem > 0 && rand() < 0.5) { k++; rem--; }   // scatter remainder
                    if (k === 0) continue;
                    if (r.dissolve && m.parent) m.dissolve = true;
                    for (const prod of r.rhs) {
                        let dest = m;
                        if (prod.target.kind === 'out')  dest = m.parent || null;   // null = environment (discard)
                        else if (prod.target.kind === 'in') {
                            const c = m.children[prod.target.child];
                            dest = (c && c.alive) ? c : m;
                        }
                        if (dest) adds.push({ m: dest, sym: prod.sym, n: k });
                    }
                }
                if (rem > 0) m.counts[s] += rem;   // hand leftover back so nothing is lost
            }
        }

        // apply additions with caps
        for (const a of adds) a.m.counts[a.sym] = Math.min(CAP, a.m.counts[a.sym] + a.n);

        // dissolve marked membranes (deepest-first): merge counts up, reparent children
        const collectDeep = (m, out) => { m.children.forEach(c => collectDeep(c, out)); out.push(m); };
        const order = []; collectDeep(root, order);
        for (const m of order) {
            if (!m.dissolve || !m.parent) continue;
            for (let s = 0; s < K; s++)
                m.parent.counts[s] = Math.min(CAP, m.parent.counts[s] + m.counts[s]);
            const p = m.parent, idx = p.children.indexOf(m);
            p.children.splice(idx, 1, ...m.children);
            m.children.forEach(c => c.parent = p);
            m.alive = false;
        }

        if (!applied) break;   // halted
    }

    const list = []; dfs(root, list);
    list.forEach(m => m.total = m.counts.reduce((a, b) => a + b, 0));
    this._simSpec = spec;
    this._sim = { root, list, totalObjects: list.reduce((a, m) => a + m.total, 0) };
    return this._sim;
}
```

---

## Rendering (`visualize`) — nested luminous cells + bloom

Follows the canonical `renderCached` path (black background because we bloom; `res` scaling
so tile and 768px zoom match; palette via `window.Palette.color`).

1. **Layout** — assign each membrane a center and radius. Root: center canvas, radius
   `0.46·min(w,h)`. For each membrane, pack children inside: child radius ∝ `√(1+child.total)`
   normalized so children fit within ~`0.9·parentR`; place child centers on a **golden-angle
   spiral** from the parent center (deterministic, from the sim counts, not the PRNG). Gentle
   overlaps are fine — translucency + bloom hide them. (Packing quality is tunable; a light
   relaxation pass is a nice-to-have, not required.)
2. **Draw**, recursively, parent-before-children so nesting reads correctly:
   - **Membrane body**: alpha-blend a soft disc (cytoplasm) in a dim depth-keyed color into
     the `data` buffer (a small `fillDiscBlend(data,w,h,cx,cy,r,color,alpha)` helper, ~10 lines,
     à la `ShapesIndividual`'s private `drawEllipse`), then a bright 1–2px rim (a ring — e.g.
     `Canvas2DModality.drawCircle` at `r` over a slightly smaller dim disc). Rim width
     `≈ max(1, round(1.5·res))`.
   - **Particles**: for each symbol `s` with count `c`, draw `min(c, CAP_DOTS≈60)` dots of
     `window.Palette.color(s/(K−1))` via `Canvas2DModality.drawCircle`, radius `≈ 1.5·res`,
     jittered inside `0.8·r` using a PRNG **re-seeded from `spec.seed`** so placement is stable
     across renders. Past the dot cap, bump radius/brightness instead of adding dots.
   - Recurse into `children`.
3. **Bloom**: `Canvas2DModality.bloom(imageData, { radius: 3*res, strength: 1.4, background: {r:0,g:0,b:0} })`.

```js
usesColorPalette() { return true; }

visualize(canvas) {
    Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) { data[i]=0; data[i+1]=0; data[i+2]=0; data[i+3]=255; }

        const res = Math.min(width, height) / 128;
        const sim = this._simulate();
        // ... layout(sim.root, cx, cy, R) then drawMembrane(sim.root, depth=0) ...

        Canvas2DModality.bloom(imageData, { radius: 3 * res, strength: 1.4, background: { r:0,g:0,b:0 } });
        return imageData;
    });
}
```

Guard rails: cap total drawn particles (e.g. 4000) as a runaway guard (mirrors
`BranchIndividual`'s `MAX_PATHS`). `validate()` → `this._simulate().list.length > 0`.

`Canvas2DModality` static helpers you'll use (all take `data,width,height,...` and a
`{r,g,b}` color, alpha 255): `drawCircle(data,w,h,cx,cy,radius,color)`,
`drawLine(...)`, `drawThickLine(...,lineWidth)`,
`bloom(imageData,{radius,strength,background})`, `renderCached(canvas,holder,fn)` (fn must
return the ImageData).

---

## Class skeleton & panel text

```js
class PSystemIndividual extends Individual {
    constructor(genome = null) {
        super();
        this.representation = pSystemRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }
    usesColorPalette() { return true; }
    validate() { return this._simulate().list.length > 0; }
    _simulate() { /* as above; memoized on this._sim / this._simSpec */ }
    visualize(canvas) { /* as above */ }

    // Concise genome-panel phenotype (the raw spec is verbose and doubles as trace context).
    getPhenotype() {
        const s = this.phenotype, sim = this._simulate();
        return `${sim.list.length} membranes, ${s.symbolCount} symbols, `
             + `${sim.totalObjects} objects after ${s.steps} steps`;
    }

    // Type-specific detail: rule count, and final population per membrane.
    describeExtra() {
        const sim = this._simulate();
        // return a short HTML block: total rules, per-membrane totals / depth.
        return '';
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = PSystemIndividual;
```

- Inherit `mutate`/`crossover`/`clone`/`describe`/`editableSections` unchanged — the default
  `editableSections()` already exposes the generator to `CodeEditorUI`, so users get live
  editing of the P-system generator for free.
- **Cache invalidation**: `mutate()` calls the base `invalidateImageCache()`. Because the sim
  is memoized on `this._sim`/`this._simSpec` keyed by the *phenotype object identity*, a new
  genome yields a new phenotype object ⇒ the memo misses and re-simulates. No extra wiring
  needed. Do **not** memoize on anything mutable.

---

## Registration checklist (exact edit sites)

1. **New file** `PSystemIndividual.js` (repo root), with a header comment describing the
   mapping (like `BranchIndividual.js`).
2. **`index.html`**
   - Dropdown: add `<option value="PSystemIndividual">P-System</option>` in the
     `<select id="individual-type-select">` block (~lines 56–79).
   - Script: add `<script src="PSystemIndividual.js"></script>` in the individual-types block
     (~lines 165–190), **after** `Individual.js` / `PTORepresentation.js` (already loaded
     earlier) and **before** `EvolutionaryAlgorithm.js` / `Anemone.js` / `main.js`.
3. **`Anemone.js`** — add `'PSystemIndividual': PSystemIndividual,` to the static
   `individualTypeMap()` (~lines 1484–1509). The `value=` in the option must equal the class
   name exactly.
4. **`main.js`** — no change (only if it becomes the startup default: the `|| AnemoneIndividual`
   fallback on line 8).
5. **`tests/harness.js`** — add `'PSystemIndividual.js'` to `SOURCES` (dependency order; after
   base classes, mirroring index.html) and `'PSystemIndividual'` to `INDIVIDUAL_CLASSES`. No
   new sandbox stub needed — it only uses `window.Palette` (already stubbed) and
   `Canvas2DModality` (loaded). It is **not** 3D, so do **not** add it to `run.js`'s `threeD`
   set; not a sound type, so the sound/sync arrays are untouched.
6. **`tests/run.js`** — no change; the generic operator/render/description/flags loops cover a
   new 2D type automatically once it's in `INDIVIDUAL_CLASSES`.

---

## Verification

- **Unit/smoke**: `node tests/run.js` must exit 0. For `PSystemIndividual` this exercises:
  genome initialised; `mutate(0.5)`; `crossover` returns two same-type children with genomes;
  `clone` preserves fitness and is isolated (mutating the clone must not change the original's
  phenotype — hence: `_simulate` a pure function of `this.phenotype`, never mutate the spec);
  `visualize` on a 48×48 stub canvas twice (before/after mutate); `toString()` / `describe()`
  mention the class name and `describe()` contains "Fitness".
  - Two classic traps to avoid: (a) the sim must not mutate `spec` (fresh mutable tree,
    `slice()` the arrays); (b) `renderKey()` stays the inherited `this.phenotype` (the
    plain-data spec stringifies), so caching is correct.
- **Visual/manual**: `python -m http.server 8000`, open the app, pick **P-System** from the
  dropdown. Confirm a grid of distinct nested-cell organisms; click a tile → the zoom lightbox
  shows a faithful 6× magnification (glow/particle sizes scaled by `res`, not hairlines); like
  a few and evolve a generation to confirm variety; open the genome panel (Generator editor
  present, phenotype summary + `describeExtra` populations shown); tweak the generator in
  `CodeEditorUI` and Apply to confirm the live-edit path works and a bad edit reverts.
- If organisms look static/empty: raise the initial `objects` floor (`rnd.randint(0,6)`), the
  step-count range, or lower the per-membrane `CAP`.

---

## Out of scope (documented for later)

- Membrane **division/creation** (cells that split during the run) — the richer "lineage"
  aesthetic; needs the drawn tree to diverge from the genome tree and tighter blow-up caps.
- **Temporal** renderings (accretion strata / radial time-rings) — alternative metaphors.
- **Cooperative rules** (multi-symbol LHS) — more expressive, but easier to make
  non-terminating; the non-cooperative MVP is the safe default.

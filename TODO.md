# SHORT-TERM NOTES

* We are now using PTO (pilot) by vendoring in pto-bundle.js. Need to update that occasionally if PTO js changes. Or revisit how we build etc.

* PTO "pilot" is using a slightly simplified generator, where length does not creep upwards (which was a nice effect in AnemoneIndividual). 

* Grammar should be specified in the Individual, not in Grammar.js — DONE. The
  derivation logic and the grammar definition (a plain rules object) now both live
  in each individual; Grammar.js is just the generic BNF engine. Next step toward
  the goal: let the user paste/edit a grammar in a text window (the rules object is
  already in the editable shape).

* Claude bug report in PTO js:

"PTO's fine-mode RandomCat._fineRepair crashes when a variable-structure trace realigns a choice gene against a different-typed gene (it assumes the other gene is also a choice). Fixed-length heterogeneous genomes (SuperShape) never hit this; the variable-structure tree does. The DAG individuals use coarse (default) with heterogeneous variable traces and repair fine. So the fix is to drop fine for the tree:"
  → RESOLVED differently: switching to naming="structural" aligns genes by
    call-site (so a choice gene always meets a choice gene), which lets the tree
    keep fine. No need to drop fine.

* Claude bug report in PTO js:

"NameCompiler._visitExpr has no NewExpression case, so any rnd.* call or recursive helper call inside a new SomeClass(...) argument is left un-instrumented. For the recursive tree that means build(depth-1) inside new FunctionNode(...) loses its threaded __prefix__, so depth becomes undefined→NaN and recursion never terminates → stack overflow. The DAG generators (new InputNode(...) etc.) hit the same gap."

Claude wrote a patch for pto-bundle.js, but it would be better to apply it upstream.
  → For now the bundle is left pristine: instead of `new` in generators, the Tree
    and DAG generators emit plain data and the individual builds the class
    instances (buildTreeNode / buildDAG). Still worth fixing upstream.

* Claude bug report in PTO js (third one):

"Array.from({length}, () => rnd...) element callbacks are not instrumented by the
NameCompiler — they get no per-element counter, so they collide to a positional
(linear) fallback rather than structural names. This is silently OK for
fixed-length genomes but misaligns variable-length ones badly (Anemone validity
collapsed from ~94% to ~8% until we switched to explicit for-loops)."
  → Worked around: all generators now use explicit `for` loops, not Array.from.

"The vendor patch works cleanly: with a NewExpression case added to NameCompiler._visitExpr, the recursive class-building tree generator runs under fine+structural with healthy size variety (15–45 nodes). This is a real bug in the vendored PTO (and exactly the kind of "Claude bug report in PTO js" your TODO is collecting)."

* Claude bug report in PTO js (fourth one) — fine-mode categorical crossover
  produces out-of-support values:

"RandomCat._fineCrossover does `const child = this.clone(); child.val =
Math.random()<0.5 ? this.val : other.val;` — it can take the OTHER parent's value
without checking it belongs to `this.seq`. When uniform crossover aligns two genes
by structural name but the two parents have different non-terminals at that name
(their derivations diverged upstream), `child` ends up with seq from one symbol
and val from the other, so val ∉ seq. On the next fixInd, Dist.matches() compares
only seq (not val ∈ seq), accepts the inconsistent gene, and the foreign value
flows into the phenotype. Faithful repro (driving only PTORepresentation.mutate /
crossover under fine+structural): ~2% of rnd.choice calls return a value outside
the current choices, e.g. `<const> -> [floor]`, `<const> -> [<expr> <op> <expr>]`."
  → NOT worked around in app code (deliberately): rnd.choice is the idiomatic,
    PTO-insulated form, and the leak is benign here — a foreign token compiles to a
    constant, so the individual just renders flat and is rejected by validate() /
    not selected. The fix belongs in PTO: _fineCrossover should constrain child.val
    to this.seq (only take other.val when this.seq includes it; else keep this.val),
    and/or matches() should require val ∈ seq.

* META (the above four): we drifted deep into PTO internals. Of the four, the
  _fineRepair crash and this _fineCrossover leak are genuine operator bugs PTO
  should own; the NewExpression and Array.from gaps are NameCompiler limitations.
  Once they're fixed upstream, the app generators can shed their workarounds
  (`new`/plain-data, `for`-loops/Array.from) and just be written naturally. PTO is
  meant to insulate callers from all this — keep app code idiomatic and push fixes
  upstream rather than accreting more workarounds.



# TODO


* Allow user to paste in a GE grammar using standard drawing commands

* Allow user to paste in a JS generator for PTO, I guess using standard drawing commands. Call it "UserGeneratorDrawingIndividual.js" or something like that. It creates a text editor, and pre-populates with a full illustrative example that uses the same drawing commands already used in

* Hotkeys

* Individual can state its preference for (width, height) in the grid - might be needed for music individuals.

* User controls for popsize, mutation rate..?

* In the pattern individual, theta tends to be bad, so better would be sin theta and cos theta? With factor of 2 pi.

* Consider palettes in HSL or LCH or OKLCH (https://jakub.kr/components/oklch-colors)

* In the xy pattern, allow use of individual points as centres with r and theta. Also mod. And somehow, special points defined by intersections of other curves, eg (theta mod 12 intersected with r % 10 == 0) can become useful as reference points for others. Reference points define new x and y frames. So maybe we have functions like r() and theta(). If called with no arguments they give radius wrt the image centre. If called with some arguments, calculate wrt the point defined by those arguments. 

* When we zoom in, allow user to right-click to save an image. Actually this works already in Desktop but not mobile. Allow this save to be extremely convenient, save to a good directory with an informative filename, or else a separate text file. 

* Allow a user to assemble a "hall of fame" easily - the best individuals from the run.







# NEW APPLICATIONS

* Another type of individual, GL shaders https://tympanus.net/codrops/2025/06/23/modeling-the-world-in-280-characters/

* Another type of individual for use in brain-computer interface music-mapping

* Another type of individual: graph grammar with 3d coordinates per node as in my old GPEM paper

* For symbolic regression-like 3D, allow both axes to be GP giving a radius, and/or allow things like phase, frequency or amplitude of the second axis to be varied as a function of the meridian angle

* Another type of individual: Polyomino CFG

* Another L-system-like structure where commands draw pixel strokes, but are constrained by existing pixels. Variants are BFS and DFS.

* 3d L-system, again with space-occupying and non-space occupying 



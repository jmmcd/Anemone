# SHORT-TERM NOTES

* We are now using PTO (pilot) by vendoring in pto-bundle.js. Need to update that occasionally if PTO js changes. Or revisit how we build etc.

* PTO "pilot" is using a slightly simplified generator, where length does not creep upwards (which was a nice effect in AnemoneIndividual). 

* Grammar should be specified in the Individual, not in Grammar.js

* Does GrammarRepresentation actually use PTO? — yes: PTO evolves the codon
  array; GrammaticalRepresentation is only a derive/compile mapper (this.grammar),
  not this.representation. (Its own generate/mutate are unused.)

* fine/coarse + structural naming — DONE. PTORepresentation now defaults to
  { distType: 'fine', naming: 'structural' } for every individual; the per-type
  'fine' overrides and the tree's old 'coarse' workaround are gone.

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



* Bug in MouseMusic: no valid individuals? Only elites? — likely fixed by the
  DAG rewrite: connections are now indices into earlier nodes, not object
  references that couldn't align across PTO traces. Re-check in the running app.



# TODO


* Allow user to paste in a GE grammar using standard drawing commands

* Allow user to paste in a JS generator for PTO, I guess using standard drawing commands. Call it "UserGeneratorDrawingIndividual.js" or something like that. It creates a text editor, and pre-populates with a full illustrative example that uses the same drawing commands already used in

* Hotkeys

* Individual can state its preference for (width, height) in the grid

* Just a hook to say which individual is active?

* User controls for popsize, mutation rate..?

* In the pattern individual, theta tends to be bad, so better would be sin theta and cos theta? With factor of 2 pi.

* Consider palettes in HSL or LCH or OKLCH (https://jakub.kr/components/oklch-colors)

* In the xy pattern, allow use of individual points as centres with r and theta. Also mod. And somehow, special points defined by intersections of other curves, eg (theta mod 12 intersected with r % 10 == 0) can become useful as reference points for others. Reference points define new x and y frames. So maybe we have functions like r() and theta(). If called with no arguments they give radius wrt the image centre. If called with some arguments, calculate wrt the point defined by those arguments. 

* Allow user to zoom in on a particular individual (higher resolution / magnification)




# NEW APPLICATIONS

* Another type of individual, GL shaders https://tympanus.net/codrops/2025/06/23/modeling-the-world-in-280-characters/

* Another type of individual for use in brain-computer interface music-mapping

* Another type of individual: graph grammar with 3d coordinates per node as in my old GPEM paper

* For symbolic regression-like 3D, allow both axes to be GP giving a radius, and/or allow things like phase, frequency or amplitude of the second axis to be varied as a function of the meridian angle

* Another type of individual: Polyomino CFG

* Another L-system-like structure where commands draw pixel strokes, but are constrained by existing pixels. Variants are BFS and DFS.

* 3d L-system, again with space-occupying and non-space occupying 



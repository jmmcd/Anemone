# TODO

* We are now using PTO (pilot) by vendoring in pto-bundle.js. Need to update that occasionally if PTO js changes. Or revisit how we build etc.

* PTO AnemoneIndividual "pilot" is using a slightly simplified generator, where length does not creep upwards (which was a nice effect in old AnemoneIndividual). 

* User controls for popsize, mutation rate..?

* In the pattern individual, theta tends to be bad, so better would be sin theta and cos theta? With factor of 2 pi.

* In the xy pattern, allow use of individual points as centres with r and theta. Also mod. And somehow, special points defined by intersections of other curves, eg (theta mod 12 intersected with r % 10 == 0) can become useful as reference points for others. Reference points define new x and y frames. So maybe we have functions like r() and theta(). If called with no arguments they give radius wrt the image centre. If called with some arguments, calculate wrt the point defined by those arguments. 

* Fix several upstream PTO-js bugs. The one about serialising the trace is important for our load/save feature. Currently, the grammar individuals are not reconstructing correctly because of that.
* We have editable generators, but some individuals will need to have editable draw() instead/as well. The hook for this is working.

* In PhotoFilter the zoom-in re-render has a small issue. The zoom-in can look a bit different because of the different resolution. It is fixable, but unsure whether we want to fix it. For now I will decide that it is a feature not a bug, because the thumbnails are "exaggerated" relative to the real effect, but that is a good thing for thumbnails.

* The drum machine does not allow Velocity editing still TODO (the mechanism works, just needs a UI gesture).

* The drum machine has global controls which override the genome's values for eg tempo and swing. Could extend to accent/push/swingTarget.

* Someday could consider adding a proper MIDI interface (ie sync with GB via Web MIDI?).

* The audio filter app is not super interesting... maybe if there was audio in/out so it could be used as an effect for GB? Maybe the audio filter stuff should just be simplified and folded into the drum machine.

* Make a src/ directory?

* The grammar individuals now (as before) generate an int to choose a production, rather than choosing a production directly. That's because a production is not transparent to JSON-encoding, so a save/load round-trip doesn't work. This could indicate we need a PTO fix, or some other solution.


# NEW APPLICATIONS

* GL shaders https://tympanus.net/codrops/2025/06/23/modeling-the-world-in-280-characters/

* A music DAG individual for use in brain-computer interface music-mapping

* A graph grammar with 3d coordinates per node as in my old GPEM paper, but better. Rotating images

* Another type of individual: Polyomino CFG

* Another L-system-like structure where commands draw pixel strokes, but are constrained by existing pixels. Variants are BFS and DFS.

* 3d L-system, again with space-occupying and non-space occupying 

* Moving pictures using either t in [0, 1], or sin theta and cos theta

* A series of lines, each a curve with x, y start and end and control points and colour and style and glow (like in visuals at a good concert I was at recently)

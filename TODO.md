# TODO


* Replace our EC with Program Trace Optimisation (simple version) or PODI

* Provide GE as a built-in 

* Allow user to paste in a grammar using standard drawing commands

* Hotkeys

* Remove the test MIDI note that plays at startup and refactor the MIDI

* Individual can state its preference for (width, height) in the grid

* Pre-made visualisers for text, bitstrings, etc

* Visualiser can be from genome, phenotype, or both, it's up to the individual

* getPhenotype() should cache it

* Just a hook to say which individual is active?

* Controls for popsize, mutation rate..?

* Another type of individual, GL shaders https://tympanus.net/codrops/2025/06/23/modeling-the-world-in-280-characters/

* Another type of individual for use in brain-computer interface music-mapping

* Another type of individual: Polyomino CFG

* Another type of individual: graph grammar with 3d coordinates per node as in my old GPEM paper

* In the pattern individual, theta tends to be bad, so better would be sin theta and cos theta? With factor of 2 pi.

* Consider palettes in HSL or LCH or OKLCH (https://jakub.kr/components/oklch-colors)

* For symbolic regression-like 3D, allow both axes to be GP giving a radius, and/or allow things like phase, frequency or amplitude of the second axis to be varied as a function of the meridian angle

* Another L-system-like structure where commands draw pixel strokes, but are constrained by existing pixels. Variants are BFS and DFS.

* 3d L-system, again with space-occupying and non-space occupying 

* In the xy pattern, allow use of individual points as centres with r and theta. Also mod. And somehow, special points defined by intersections of other curves, eg (theta mod 12 intersected with r % 10 == 0) can become useful as reference points for others. Reference points define new x and y frames. So maybe we have functions like r() and theta(). If called with no arguments they give radius wrt the image centre. If called with some arguments, calculate wrt the point defined by those arguments. 

* Allow user to zoom in on a particular individual (higher resolution / magnification)
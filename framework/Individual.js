/**
 * Editable — a tiny holder for a live value (a function or a data object) that
 * the code editor can swap at runtime. It remembers the original so the editor's
 * "Reset to default" works even after edits. An individual keeps its swappable
 * draw function (or any other editable stage) in one of these and reads
 * `slot.value` at run time; see Individual.functionSection and RobotIndividual.
 */
class Editable {
    constructor(value) {
        this.value = value;
        this.original = value;
    }
}

/**
 * Individual — base class for all individual types.
 *
 * Holds a representation strategy object (this.representation) and delegates the
 * genetic operators to it. A typical subclass only needs to construct its
 * representation, set this.genome, and implement visualize(); mutate/crossover/
 * clone are inherited. Subclasses with non-standard genome semantics (variable
 * length, mixed int/float, MIDI re-wiring on clone, etc.) override as needed.
 */
class Individual {
    constructor(genome = null) {
        this.fitness = 0;
        this.selected = false;
        this.id = Math.random().toString(36).substr(2, 9);
        this._cachedImageData = null;
        this._cacheKey = null;

        if (genome !== null) {
            this.genome = genome;
        }
    }

    // --- Capability flags (read by the framework) ---
    is3D()             { return false; }
    usesColorPalette() { return false; }
    usesPhoto()        { return false; }
    usesAudio()        { return false; }
    // Whether the lightbox offers a PNG "Save" of the tile. Default true; a type
    // whose artefact is really the sound (e.g. MelodyIndividual → MIDI only) can
    // opt out so its lightbox shows just the relevant export.
    usesImageSave()    { return true; }
    // A type whose tile visual is a directly-editable grid (e.g. a step sequencer).
    // When true, the framework wires click/drag on the zoom lightbox canvas to
    // editCellAtXY(); the type maps pixels→cell and folds the edit into its genome.
    isGridEditable()   { return false; }
    // Whether the framework attaches the global Performance panel (tempo/swing/…).
    usesPerformanceControls() { return false; }
    // Which Performance dials this type exposes (a subset of PerformanceControls.dials).
    // Step sequencers override: drum → all four, melody → tempo + swing.
    performanceDials() { return ['bpm', 'swing', 'humanize', 'drive']; }
    // Whether the framework attaches the MIDI Clock Sync panel — a type whose sound
    // has a tempo (step sequencers) or a tempo-paced evaluation loop (mouse/EEG DAGs)
    // can lock it to an external MIDI clock (e.g. GarageBand) instead of free-running.
    usesMIDISync() { return false; }

    // --- Active intervention (direct manipulation of the phenotype) --------------
    // A type can let the user edit its rendered phenotype *directly* — by pointer,
    // on the zoom canvas — with each edit written back into the heritable genome,
    // so evolution continues from what the user drew rather than discarding it.
    //
    // The framework asks `isEditable()`, then calls `beginEditSession(canvas,
    // session)` and keeps the returned teardown function to call on close. The
    // gesture belongs to the *individual*: a type with a different phenotype (a
    // curve to drag, a node to move) overrides `beginEditSession` entirely and
    // owns its own pointer handling. `session` carries the framework's side of
    // the deal, so the individual needs to know nothing about the lightbox:
    //
    //   session.onEdit()        an edit landed — refresh the info panel
    //   session.onGestureEnd()  the gesture finished — resync the grid tile, and
    //                           restart the sound if this individual is playing
    //
    // The genome-writeback contract is the individual's: an edit must go through
    // the representation (setCellHit → representation.setGene), not just mutate a
    // cached phenotype, or the change is lost at the next mutate/clone.
    isEditable() { return this.isGridEditable(); }

    beginEditSession(canvas, session = {}) {
        return this._gridEditSession(canvas, session);
    }

    // The default session: a step grid, with two gestures distinguished by the
    // direction the pointer first moves — the Logic/Ableton drum-editor idiom.
    //
    //   click (no movement)          toggle the cell
    //   horizontal-first drag        paint: the first cell sets whether the drag
    //                                turns cells on or off
    //   vertical-first drag on an    velocity: adjust that ONE cell, up louder /
    //   *on* cell                    down softer, a full canvas height ≈ full range
    //
    // Starting on an *off* cell always paints (there is no velocity to drag), so
    // the toggle fires immediately there; on an on cell the toggle is deferred
    // until the gesture resolves, or until pointerup makes it a plain click.
    //
    // Driven entirely by the type's cellAtCanvasXY/cellOn/setCellHit hooks, plus
    // cellVel/setCellVel for velocity — so both step sequencers get all of it
    // without writing any pointer code.
    _gridEditSession(canvas, session = {}) {
        if (!canvas || typeof this.cellAtCanvasXY !== 'function') return () => {};
        const abort = new AbortController();
        const signal = abort.signal;
        const prevCursor = canvas.style.cursor;
        canvas.style.cursor = 'pointer';
        const DEADZONE = 6;   // client px before a drag commits to a direction
        const canEditVel = typeof this.setCellVel === 'function' && typeof this.cellVel === 'function';

        // mode: null = undecided (pointer is down on an on cell, awaiting direction)
        let mode = null, paintOn = null, lastKey = null;
        let startCell = null, startX = 0, startY = 0, startVel = 0;

        const cellAt = (e) => {
            const rect = canvas.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (canvas.width / rect.width);
            const py = (e.clientY - rect.top) * (canvas.height / rect.height);
            return this.cellAtCanvasXY(canvas, px, py);
        };
        const redraw = () => {
            this.visualize(canvas);
            if (session.onEdit) session.onEdit();
        };
        const paint = (cell, on) => {
            const key = cell.c + ',' + cell.s;
            if (key === lastKey) return;         // don't re-fire within the same cell during a drag
            lastKey = key;
            this.setCellHit(cell.c, cell.s, on);
            redraw();
        };

        canvas.addEventListener('pointerdown', (e) => {
            const cell = cellAt(e);
            if (!cell) return;
            e.preventDefault();
            try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
            lastKey = null;
            startCell = cell; startX = e.clientX; startY = e.clientY;
            if (this.cellOn(cell.c, cell.s) && canEditVel) {
                // Could still become a velocity drag — wait for the direction.
                mode = null;
                startVel = this.cellVel(cell.c, cell.s);
            } else {
                mode = 'paint';
                paintOn = !this.cellOn(cell.c, cell.s);
                paint(cell, paintOn);
            }
        }, { signal });

        canvas.addEventListener('pointermove', (e) => {
            if (mode === null && startCell) {
                const dx = e.clientX - startX, dy = e.clientY - startY;
                if (Math.abs(dx) < DEADZONE && Math.abs(dy) < DEADZONE) return;  // still undecided
                if (Math.abs(dy) > Math.abs(dx)) {
                    mode = 'velocity';
                } else {
                    mode = 'paint';
                    paintOn = false;                       // began on an on cell ⇒ erase
                    paint(startCell, paintOn);
                }
            }
            if (mode === 'velocity') {
                const rect = canvas.getBoundingClientRect();
                const dv = -(e.clientY - startY) / (rect.height || canvas.height); // up = louder
                this.setCellVel(startCell.c, startCell.s, startVel + dv);
                redraw();
            } else if (mode === 'paint') {
                const cell = cellAt(e);
                if (cell) paint(cell, paintOn);
            }
        }, { signal });

        const end = () => {
            if (mode === null && startCell) {
                // Pressed and released without committing to a direction: a click.
                this.setCellHit(startCell.c, startCell.s, !this.cellOn(startCell.c, startCell.s));
                redraw();
            } else if (mode === null) {
                return;                                    // nothing was in progress
            }
            mode = null; startCell = null; lastKey = null;
            if (session.onGestureEnd) session.onGestureEnd();
        };
        canvas.addEventListener('pointerup', end, { signal });
        canvas.addEventListener('pointercancel', end, { signal });

        return () => {
            abort.abort();
            canvas.style.cursor = prevCursor;
        };
    }

    // --- Unified step-sequencer playback (shared by DrumMachine + Melody) ---------
    // Play this individual's loop LIVE over MIDI when an output is available, else
    // fall back to a synthesised AudioBuffer through the shared AudioModality. Both
    // paths enter at the shared Transport phase so switching/editing resumes in time.
    // The type only supplies toMIDISequence() (with a loopTicks) and renderToAudioBuffer().
    playSequenced() {
        const fw = (typeof window !== 'undefined') && window.framework;
        const midi = (fw && fw.sharedMIDI) || this.midiModality;
        const audio = (fw && fw.sharedAudio) || this.audio;
        const transport = (typeof window !== 'undefined') && window.Transport;
        this.stopSequenced();
        if (midi && midi.midiOutput && typeof this.toMIDISequence === 'function') {
            const seq = this.toMIDISequence();
            if (midi.playSequence(seq, transport)) {
                if (typeof midi.startClock === 'function') midi.startClock(seq.bpm || 120);
                this._soundOut = midi;
            }
        }
        if (!this._soundOut && audio && typeof this.renderToAudioBuffer === 'function') {
            const buffer = this.renderToAudioBuffer();
            const offset = transport ? transport.phase(buffer.duration) : 0;
            audio.playBuffer(buffer, { loop: true, offset });
            this._soundOut = audio;
        }
        this.isPlaying = true;
    }

    stopSequenced() {
        if (this._soundOut) {
            if (typeof this._soundOut.stopClock === 'function') this._soundOut.stopClock();
            if (typeof this._soundOut.stopSequence === 'function') this._soundOut.stopSequence();
            else if (typeof this._soundOut.stop === 'function') this._soundOut.stop();
            this._soundOut = null;
        }
        this.isPlaying = false;
    }

    // --- Required / overridable behaviour ---
    visualize(canvas) {
        throw new Error("visualize() must be implemented by subclass");
    }

    // --- Editable code sections (for the live code editor, CodeEditorUI) ---
    //
    // Every individual is a pipeline: generator → phenotype → visualize → pixels.
    // An "editable section" is a named, swappable stage of that pipeline the type
    // chooses to expose. The editor is stage-agnostic: it lists whatever sections
    // the type declares and edits them all the same way. Each section is
    //   { label, read() → text, reset() → text, apply(text), rebuild }
    // where `rebuild` says whether applying it changes the *search space* (a
    // generator/grammar → rebuild the population) or only how genomes are drawn
    // (a draw function → keep the population, just re-render).
    //
    // By default a type exposes just its generator (all PTO-backed types). Types
    // where the generator is boilerplate (Robot's flat vector, the grammar
    // individuals' derivation) override this to surface the interesting stage too.
    editableSections() {
        const rep = this.representation;
        if (rep && typeof rep.setGenerator === 'function') {
            return [Individual.generatorSection(rep)];
        }
        return [];
    }

    /** Compile editor text into a function (a bare `(x) => …`/`function` expression). */
    static compileFunction(text) {
        const trimmed = text.trim();
        try {
            const fn = (0, eval)(`(${trimmed})`);
            if (typeof fn === 'function') return fn;
        } catch (_) { /* not a bare expression — fall through */ }

        const fn = new Function(
            `"use strict";\n${text}\n; return typeof generator !== 'undefined' ? generator : undefined;`
        )();
        if (typeof fn !== 'function') {
            throw new Error('Code must be a function expression, e.g. (rnd) => { … }.');
        }
        return fn;
    }

    /**
     * mulberry32 — a small, fast, deterministic PRNG, for individuals whose
     * *rendering* needs randomness (a particle sim, scattered strokes) rather
     * than their genome. Seed it from a `seed` gene and the whole render is
     * reproducible from the genome, so it stays cacheable and a saved genome
     * reloads to the same picture.
     *
     * NOTE: this is deliberately not the only PRNG in the codebase. Changing
     * the *stream* a type draws from changes every phenotype it has ever
     * rendered, so a type using a different generator (PSystem's LCG) keeps it;
     * only exact duplicates of this implementation should be folded in here.
     */
    static mulberry32(seed) {
        let t = seed;
        return function () {
            t += 0x6D2B79F5;
            let r = t;
            r = Math.imul(r ^ (r >>> 15), r | 1);
            r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    /** Section editing a PTORepresentation's generator (defines the search space). */
    static generatorSection(representation, label = 'Generator') {
        return {
            label,
            read: () => representation.sourceText(),
            reset: () => representation.originalSourceText(),
            apply: (text) => representation.setGenerator(Individual.compileFunction(text)),
            rebuild: true,
        };
    }

    /** Section editing a swappable function held in an Editable slot (e.g. a draw fn). */
    static functionSection(label, slot) {
        return {
            label,
            read: () => slot.value.toString(),
            reset: () => slot.original.toString(),
            apply: (text) => { slot.value = Individual.compileFunction(text); },
            rebuild: false, // genomes unchanged; just re-render
        };
    }

    /** Section editing a Grammar's rules in place (also part of the search space). */
    static grammarSection(grammar, label = 'Grammar') {
        return {
            label,
            read: () => grammar.sourceText(),
            reset: () => grammar.originalSourceText(),
            apply: (text) => grammar.setRules(JSON.parse(text)),
            rebuild: true,
        };
    }

    // The phenotype is the genome expressed. For most representations the genome
    // is itself the working structure, so phenotype === genome. For PTO-style
    // representations the genome is a trace (the genotype) and the phenotype is
    // whatever its generator produced (array, matrix, tree, …) — the
    // representation derives it via express(). Opaque: callers interpret it.
    get phenotype() {
        if (this.representation && typeof this.representation.express === 'function') {
            return this.representation.express(this.genome);
        }
        return this.genome;
    }

    getPhenotype() {
        return this.phenotype;
    }

    // Cache key for Canvas2DModality.renderCached: keyed on the phenotype, since
    // that is what gets drawn. For direct representations phenotype === genome,
    // so this matches the previous behaviour; for PTO ones it keys on the
    // expressed output rather than the trace object (which would not stringify
    // usefully).
    renderKey() {
        return this.phenotype;
    }

    validate() {
        return true;
    }

    // --- Self-description for the UI ---
    // An individual knows how to present itself. toString() is a concise one-line
    // summary (safe for logs); describe() is the rich multi-section HTML shown in
    // the genome panel. Subclasses can override either, or just describeExtra()
    // to add type-specific detail (e.g. a formula) to the default layout.

    toString() {
        const p = this.getPhenotype();
        const summary = (typeof p === 'string' && p !== this.genome)
            ? ` — ${p.length > 60 ? p.slice(0, 60) + '…' : p}`
            : '';
        return `${this.constructor.name} #${this.id} (fitness ${this.fitness})${summary}`;
    }

    /** Type-specific extra section inserted after the phenotype; '' by default. */
    describeExtra() {
        return '';
    }

    /** Full HTML description for the genome panel. */
    describe() {
        if (this.genome === undefined || this.genome === null) {
            return '<em>No genome available</em>';
        }

        let out = '';
        out += `<span class="genome-label">Type:</span> ${this.constructor.name}\n`;
        out += `<span class="genome-label">ID:</span> ${this.id}\n`;
        out += `<span class="genome-label">Fitness:</span> ${this.fitness}\n\n`;

        const phenotype = this.getPhenotype();
        const phenotypeString = this._formatPhenotype(phenotype);
        if (phenotypeString && this._isPhenotypeInformative(phenotype)) {
            out += `<span class="genome-label">Phenotype:</span>\n${phenotypeString}\n`;
            out += this.describeExtra();
            out += '\n';
        }

        out += this._formatGenomeSection();
        return out;
    }

    // Is the phenotype worth showing separately from the genome?
    _isPhenotypeInformative(phenotype) {
        const genome = this.genome;
        if (!phenotype) return false;
        if (phenotype === genome) return false;                                   // same object
        if (Array.isArray(genome) && phenotype === genome.toString()) return false; // just the array stringified
        if (genome && typeof genome.toString === 'function' && genome.getAllNodes) return false; // tree shown as genome
        if (typeof phenotype === 'string' && phenotype.length > 0 && phenotype.length < 2000) return true;
        if ((typeof phenotype === 'object' || Array.isArray(phenotype)) && phenotype !== genome) return true;
        return false;
    }

    _formatGenomeSection() {
        const genome = this.genome;

        // PTO trace genome: a dict of recorded random decisions (the genotype).
        // Show their values as a numeric list, independent of phenotype shape.
        if (this.representation && typeof this.representation.express === 'function'
            && genome && typeof genome === 'object' && !Array.isArray(genome)) {
            const vals = Object.values(genome).map(d => (d && d.val !== undefined) ? d.val : d);
            let s = `<span class="genome-label">Genome (PTO trace, ${vals.length} decisions):</span>\n`;
            if (vals.length > 0) {
                if (vals.every(v => typeof v === 'number')) {
                    s += vals.every(Number.isInteger) ? this._formatIntegerGenome(vals) : this._formatFloatGenome(vals);
                } else {
                    // Structured decisions (e.g. grammar productions = token arrays,
                    // DAG traces mixing op-choice strings with numbers). The numeric
                    // column formatter mangles these, and tokens like <expr> would be
                    // eaten as HTML tags by the genome panel (innerHTML), so render one
                    // per line, HTML-escaped, with floats rounded for readability.
                    const fmt = (v) => {
                        if (Array.isArray(v)) return v.join(' ');
                        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
                        return String(v);
                    };
                    s += vals.map(v => '  ' + this._escapeHtml(fmt(v))).join('\n');
                }
            }
            return s;
        }

        // Tree genome (GP): expression + stats
        if (genome && typeof genome.toString === 'function' && genome.getAllNodes) {
            let s = `<span class="genome-label">Expression Tree:</span>\n${genome.toString()}\n\n`;
            s += `<span class="genome-label">Tree Stats:</span>\n`;
            s += `  Depth: ${genome.depth()}\n`;
            s += `  Size: ${genome.size()} nodes\n`;
            return s;
        }

        // Array genome: pick a formatter by content
        if (Array.isArray(genome)) {
            let s = `<span class="genome-label">Genome (${genome.length} elements):</span>\n`;
            if (genome.length > 0) {
                if (genome.every(g => g === 0 || g === 1)) s += this._formatBinaryGenome(genome);
                else if (genome.every(g => Number.isInteger(g))) s += this._formatIntegerGenome(genome);
                else s += this._formatFloatGenome(genome);
            }
            return s;
        }

        // String genome
        if (typeof genome === 'string') {
            return `<span class="genome-label">Genome String:</span>\n${genome}\n`;
        }

        // Fallback
        return `<span class="genome-label">Genome:</span>\n${JSON.stringify(genome, null, 2)}`;
    }

    _formatPhenotype(phenotype) {
        if (!phenotype) return null;

        if (typeof phenotype === 'string') {
            return phenotype.length > 1000 ? phenotype.substring(0, 1000) + '...\n(truncated)' : phenotype;
        }

        if (Array.isArray(phenotype)) {
            // Array of command-like objects: show the first few
            if (phenotype.length > 0 && typeof phenotype[0] === 'object') {
                let s = `${phenotype.length} commands:\n`;
                const showCount = Math.min(5, phenotype.length);
                for (let i = 0; i < showCount; i++) {
                    const cmd = phenotype[i];
                    if (cmd.type) {
                        s += `  ${i + 1}. ${cmd.type}`;
                        if (cmd.x !== undefined && cmd.y !== undefined) s += ` at (${cmd.x.toFixed(2)}, ${cmd.y.toFixed(2)})`;
                        if (cmd.radius !== undefined) s += ` r=${cmd.radius.toFixed(2)}`;
                        if (cmd.width !== undefined && cmd.height !== undefined) s += ` ${cmd.width.toFixed(2)}×${cmd.height.toFixed(2)}`;
                        s += '\n';
                    } else {
                        s += `  ${i + 1}. ${JSON.stringify(cmd)}\n`;
                    }
                }
                if (phenotype.length > showCount) s += `  ... (${phenotype.length - showCount} more)`;
                return s;
            }
            return phenotype.length < 50
                ? phenotype.join(', ')
                : `[${phenotype.slice(0, 50).join(', ')}, ... (${phenotype.length} elements total)]`;
        }

        if (typeof phenotype === 'object') {
            try {
                const jsonStr = JSON.stringify(phenotype, null, 2);
                return jsonStr.length > 1000 ? jsonStr.substring(0, 1000) + '\n...\n(truncated)' : jsonStr;
            } catch (e) {
                return String(phenotype);
            }
        }

        return String(phenotype);
    }

    // Escape text that goes into the genome panel (rendered via innerHTML), so
    // grammar tokens like <expr> aren't silently dropped as unknown HTML tags.
    _escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _formatBinaryGenome(genome) {
        let s = '';
        for (let i = 0; i < genome.length; i += 8) {
            s += genome.slice(i, i + 8).join('').padEnd(8, ' ') + '  ';
            if ((i + 8) % 64 === 0) s += '\n';
        }
        return s;
    }

    _formatIntegerGenome(genome) {
        let s = '';
        const itemsPerLine = 16;
        for (let i = 0; i < genome.length; i++) {
            s += genome[i].toString().padStart(4, ' ');
            if ((i + 1) % itemsPerLine === 0 && i < genome.length - 1) s += '\n';
            else if (i < genome.length - 1) s += ' ';
        }
        return s;
    }

    _formatFloatGenome(genome) {
        let s = '';
        const itemsPerLine = 8;
        for (let i = 0; i < genome.length; i++) {
            const value = typeof genome[i] === 'number' ? genome[i].toFixed(4) : genome[i];
            s += value.toString().padStart(10, ' ');
            if ((i + 1) % itemsPerLine === 0 && i < genome.length - 1) s += '\n';
            else if (i < genome.length - 1) s += ' ';
        }
        return s;
    }

    // --- Generic genetic operators delegated to the representation ---
    mutate(rate = 0.1) {
        // In-place representations mutate this.genome and return it (or nothing);
        // functional ones (e.g. PTORepresentation, whose genome is an immutable
        // PTO solution) return a new genome. Reassign when a value comes back.
        const mutated = this.representation.mutate(this.genome, rate);
        if (mutated !== undefined) this.genome = mutated;
        this.invalidateImageCache();
    }

    crossover(other) {
        const [g1, g2] = this.representation.crossover(this.genome, other.genome);
        return [new this.constructor(g1), new this.constructor(g2)];
    }

    clone() {
        const clone = new this.constructor(this.representation.clone(this.genome));
        clone.fitness = this.fitness;
        return clone;
    }

    // Render cache. The cached ImageData is produced by Canvas2DModality.renderCached
    // (the 2D-canvas plumbing lives in that modality, not here). Call this after
    // mutation, or when settings change, to force a re-render.
    invalidateImageCache() {
        this._cachedImageData = null;
        this._cacheKey = null;
    }
}

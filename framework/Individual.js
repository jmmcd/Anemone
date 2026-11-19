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
 * AnimationClock — the app's single transport for *continuously animating*
 * types, exposed as `Individual.AnimationClock`.
 *
 * It is the visual sibling of `window.Transport` (the step sequencers' clock in
 * ui/PerformanceControls.js): one shared clock rather than one per individual,
 * so a grid of animating tiles pauses and changes speed together, and the
 * `[` / `]` / `.` hotkeys have a single thing to talk to.
 *
 * Time is *accumulated*, not derived from a start timestamp, which is what makes
 * pause and speed changes seamless: `_sync()` banks the animation-seconds
 * elapsed so far before any change to `paused`/`scale`, so a new rate applies
 * from now on instead of retroactively rescaling the whole history (which would
 * make every tile jump).
 *
 * `scale` is a *period* multiplier, matching the sequencers' feel: >1 is slower.
 * A type reads `seconds()` and divides by its own evolved period, so individuals
 * keep their own tempos while sharing one transport.
 */
const AnimationClock = {
    _scale: 1.0,       // period multiplier: 2 = half speed. Clamped to [0.25, 8].
    _paused: false,
    _elapsed: 0,       // animation-seconds banked up to _wall
    _wall: null,       // wall-clock ms at the last sync (null until first read)

    _now() {
        return (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
    },

    // Bank the time since the last sync at the rate that was in force for it.
    _sync() {
        const w = this._now();
        if (this._wall !== null && !this._paused) {
            this._elapsed += (w - this._wall) / 1000 / this._scale;
        }
        this._wall = w;
        return this._elapsed;
    },

    /** Animation time in seconds — frozen while paused, stretched by `scale`. */
    seconds() { return this._sync(); },

    get scale() { return this._scale; },
    get paused() { return this._paused; },

    /** factor > 1 slows down, < 1 speeds up (the [ and ] hotkeys). */
    adjustScale(factor) {
        this._sync();
        this._scale = Math.max(0.25, Math.min(8, this._scale * factor));
    },

    togglePause() { this._sync(); this._paused = !this._paused; },

    /** Test seam: rewind to a known state. */
    reset() { this._scale = 1.0; this._paused = false; this._elapsed = 0; this._wall = null; },
};

/**
 * Individual — base class for all individual types.
 *
 * A subclass is mostly declarative. It names its shared representation and its
 * capabilities as static fields, and implements visualize():
 *
 *     class FooIndividual extends Individual {
 *         static representation = fooRepresentation;      // a PTORepresentation
 *         static capabilities = { usesColorPalette: true };
 *         visualize(canvas) { ... this.phenotype ... }
 *     }
 *
 * The base constructor installs the representation and draws a random genome
 * when none is given; mutate/crossover/clone delegate to the representation.
 * A subclass writes a constructor only for genuinely per-instance state, and
 * calls super(genome) first.
 */
class Individual {
    // The type's shared, stateless representation (a PTORepresentation). One
    // per type, assigned by reference, so a generator edit in the code editor
    // reaches every individual of the type. Inherited down a subclass chain
    // unless the subclass names its own.
    static representation = null;

    // Capability declarations, read by the framework through the flag methods
    // below. A class lists only what it changes from DEFAULT_CAPABILITIES, and
    // declarations merge down the class chain (SITCode3D inherits SITCode's
    // palette and adds is3D). Keys are the flag-method names, so there is one
    // vocabulary: grepping for `usesPhoto` finds both declarations and readers.
    static capabilities = {};

    static DEFAULT_CAPABILITIES = Object.freeze({
        // The shared Three.js render path.
        is3D: false,
        // Framework-attached panels: palette, photo, audio clip, Performance
        // dials (and which ones), MIDI clock sync, OSC input, SIT analysis.
        usesColorPalette: false,
        usesPhoto: false,
        usesAudio: false,
        usesPerformanceControls: false,
        performanceDials: ['bpm', 'swing', 'humanize', 'drive'],
        usesMIDISync: false,
        usesOSCInput: false,
        usesSITAnalysis: false,
        // Draws from window.RoboParts; that service re-renders a type with this
        // flag when a late batch of parts arrives.
        usesRoboParts: false,
        // Whether the lightbox offers a PNG "Save". A type whose artefact is
        // really the sound can opt out so the lightbox shows only what matters.
        usesImageSave: true,
        // The zoom canvas is a step grid edited by the default grid session.
        isGridEditable: false,
        // The type supports direct manipulation (see beginEditSession). null
        // means "same as isGridEditable".
        isEditable: null,
        // The tile redraws every frame off Individual.AnimationClock, which is
        // what makes [ / ] mean animation speed and . mean play/pause.
        animatesContinuously: false,
        // A 3D type whose geometry (not just the camera) changes over time; the
        // zoom loop rebuilds its mesh each frame via setAnimationTime().
        animatesGeometry: false,
        // Playback enters at the shared Transport phase (a loop) rather than
        // at its own start (a piece). See usesSharedPhase() below.
        usesSharedPhase: true,
    });

    /** The merged capabilities of this class (cached per class). */
    static caps() {
        if (Object.prototype.hasOwnProperty.call(this, '_caps')) return this._caps;
        const parent = Object.getPrototypeOf(this);
        const inherited = (parent && typeof parent.caps === 'function')
            ? parent.caps() : Individual.DEFAULT_CAPABILITIES;
        const own = Object.prototype.hasOwnProperty.call(this, 'capabilities') ? this.capabilities : {};
        for (const k of Object.keys(own)) {
            if (!(k in Individual.DEFAULT_CAPABILITIES)) throw new Error(`${this.name}: unknown capability "${k}"`);
        }
        this._caps = Object.freeze({ ...inherited, ...own });
        return this._caps;
    }

    constructor(genome = null) {
        this.fitness = 0;
        this.selected = false;
        this.id = Math.random().toString(36).substr(2, 9);
        this._cachedImageData = null;
        this._cacheKey = null;

        const rep = this.constructor.representation;
        if (rep) {
            this.representation = rep;
            this.genome = genome || rep.generateRandom();
        } else if (genome !== null) {
            this.genome = genome;
        }
    }

    // --- Capability flags (read by the framework) ---
    // Declared via static `capabilities`; these are the readers.
    is3D()                    { return this.constructor.caps().is3D; }
    usesColorPalette()        { return this.constructor.caps().usesColorPalette; }
    usesPhoto()               { return this.constructor.caps().usesPhoto; }
    usesAudio()               { return this.constructor.caps().usesAudio; }
    usesRoboParts()           { return this.constructor.caps().usesRoboParts; }
    usesImageSave()           { return this.constructor.caps().usesImageSave; }
    usesPerformanceControls() { return this.constructor.caps().usesPerformanceControls; }
    performanceDials()        { return this.constructor.caps().performanceDials; }
    usesMIDISync()            { return this.constructor.caps().usesMIDISync; }
    usesOSCInput()            { return this.constructor.caps().usesOSCInput; }
    usesSITAnalysis()         { return this.constructor.caps().usesSITAnalysis; }
    isGridEditable()          { return this.constructor.caps().isGridEditable; }
    animatesContinuously()    { return this.constructor.caps().animatesContinuously; }
    animatesGeometry()        { return this.constructor.caps().animatesGeometry; }
    isEditable() {
        const c = this.constructor.caps();
        return c.isEditable === null ? c.isGridEditable : c.isEditable;
    }

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
        // A LOOP enters at the shared Transport phase, so switching between
        // tiles keeps the beat. A PIECE starts at its beginning — see
        // usesSharedPhase(). Both paths (MIDI and synth) read the same decision,
        // so the two stay aligned either way.
        const transport = this.usesSharedPhase()
            ? ((typeof window !== 'undefined') && window.Transport) : null;
        this.stopSequenced();
        this._playStart = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
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

    /**
     * Does playback enter at the shared Transport phase?
     *
     * True for a LOOP: the step sequencers are one bar repeating, so entering
     * mid-bar is what keeps the beat when you switch tiles or edit a cell —
     * that shared phase is the whole point of the Transport. False for a PIECE:
     * a type whose phenotype is a piece of its own length (a Leeuwenberg code
     * can run to sixteen bars) has no bar grid to share, and dropping into the
     * middle of one is just starting halfway through the tune. Such a type
     * starts from the beginning each time, and its playhead is measured from
     * `_playStart` rather than from the global clock.
     */
    usesSharedPhase() { return this.constructor.caps().usesSharedPhase; }

    /**
     * How long one time round lasts, in seconds — derived from the note
     * sequence the type already publishes, so no type has to state it twice.
     * 0 means "no loop", which is what makes playheadFraction() return null for
     * every type that isn't a sequencer.
     */
    loopSeconds() {
        if (typeof this.toMIDISequence !== 'function') return 0;
        const seq = this.toMIDISequence();
        if (!seq || !(seq.loopTicks > 0) || !(seq.bpm > 0)) return 0;
        return (seq.loopTicks / (seq.ppq || 96)) * (60 / seq.bpm);
    }

    /**
     * Where playback has got to, as a fraction 0…1 of the loop — or null when
     * this individual isn't sounding, which is also the signal to stop
     * animating it. The tile draws its own cursor from this (see
     * Canvas2DModality.drawPlayhead); the framework only decides when to
     * repaint (startPlayheadAnimation).
     *
     * It reads the same clock playback was scheduled against — the shared
     * Transport for a loop, this individual's own start time for a piece — so
     * the cursor cannot drift from what you hear, and while an external MIDI
     * clock is driving, it follows the DAW along with everything else.
     */
    playheadFraction() {
        if (!this.isPlaying) return null;
        const len = this.loopSeconds();
        if (!(len > 0)) return null;
        const transport = (typeof window !== 'undefined') && window.Transport;
        if (this.usesSharedPhase() && transport) return (transport.phase(len) / len) % 1;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        return ((((now - (this._playStart || now)) / len) % 1) + 1) % 1;
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
        if (this.is3D()) return this.visualize3D(canvas);
        throw new Error("visualize() must be implemented by subclass");
    }

    // --- 3D (types declaring is3D) ----------------------------------------------
    // A 3D type supplies generate3DPoints(lod) → { vertices, indices, colors }
    // (flat arrays; also what STL export reads) and inherits the rest: the mesh
    // goes into the framework's shared Three.js scene and is rebuilt only when
    // meshKey(lod) changes, the scene entry is freed by cleanup(), and without
    // WebGL (tests, a lost context) render2DProjection draws a fixed-view 2D
    // projection instead. Hooks, all optional:
    //   meshLOD(canvas)  detail level for this canvas (tiles may use less)
    //   meshKey(lod)     what the mesh depends on (add animation state here)
    //   buildMesh(lod)   a THREE object, when one flat mesh is not enough
    //   wireframe()      [{ pts: [[x,y,z]…], ts: [t…] }] lines for the 2D fallback

    visualize3D(canvas) {
        const fw = (typeof window !== 'undefined') && window.framework;
        if (!(fw && fw.shared3D)) return this.render2DProjection(canvas);
        const lod = this.meshLOD(canvas);
        const key = this.meshKey(lod);
        const cached = fw.shared3D.meshes.get(this.id);
        if (cached && key === this._meshKey) {
            fw.renderMeshToCanvas(canvas, this.id, cached);
            return;
        }
        const mesh = this.buildMesh(lod);
        if (!mesh) return;
        this._meshKey = key;
        fw.addMeshToScene(this.id, mesh);
        fw.renderMeshToCanvas(canvas, this.id, mesh);
    }

    meshLOD(canvas) { return 1; }

    meshKey(lod) { return `${lod}|${this.renderKey()}`; }

    buildMesh(lod) {
        const { vertices, indices, colors } = this.generate3DPoints(lod);
        if (!indices.length) return null;
        return ThreeDModality.createMesh(vertices, indices, colors);
    }

    wireframe() { return null; }

    // Free this individual's entry in the shared 3D scene (the framework calls
    // it when an individual leaves the grid).
    cleanup() {
        const fw = (typeof window !== 'undefined') && window.framework;
        if (this.is3D() && fw && fw.shared3D) fw.removeMeshFromScene(this.id);
        this._meshKey = null;
    }

    render2DProjection(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        const cy = Math.cos(0.6), sy = Math.sin(0.6), cx = Math.cos(0.4), sx = Math.sin(0.4);
        const project = (x, y, z) => {
            const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
            return [x1, y * cx - z1 * sx, y * sx + z1 * cx];
        };
        const lines = this.wireframe();
        let items;                                   // projected [x, y, depth] + colour
        if (lines) {
            items = lines.map(l => ({ pts: l.pts.map(p => project(p[0], p[1], p[2])), ts: l.ts }));
        } else {
            const { vertices, colors } = this.generate3DPoints();
            items = [];
            for (let i = 0; i < vertices.length; i += 3) {
                items.push({ p: project(vertices[i], vertices[i + 1], vertices[i + 2]),
                    rgb: [colors[i], colors[i + 1], colors[i + 2]] });
            }
        }
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        const grow = (p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
        for (const it of items) (it.pts || [it.p]).forEach(grow);
        if (!(x1 >= x0)) return;
        const scale = 0.85 * Math.min(w, h) / (Math.max(x1 - x0, y1 - y0) || 1);
        const X = (p) => w / 2 + (p[0] - (x0 + x1) / 2) * scale;
        const Y = (p) => h / 2 - (p[1] - (y0 + y1) / 2) * scale;   // scene y is up
        const px = Canvas2DModality.pixelScale(w, h);
        if (lines) {
            ctx.lineWidth = Math.max(1, 1.4 * px);
            for (const { pts, ts } of items) {
                for (let i = 0; i < pts.length - 1; i++) {
                    const c = window.Palette.color(ts[Math.min(i, ts.length - 1)]);
                    ctx.strokeStyle = `rgb(${c.r},${c.g},${c.b})`;
                    ctx.beginPath();
                    ctx.moveTo(X(pts[i]), Y(pts[i]));
                    ctx.lineTo(X(pts[i + 1]), Y(pts[i + 1]));
                    ctx.stroke();
                }
            }
        } else {
            items.sort((a, b) => b.p[2] - a.p[2]);   // far first
            const r = Math.max(1, 2 * px);
            for (const { p, rgb } of items) {
                ctx.fillStyle = `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;
                ctx.fillRect(X(p) - r / 2, Y(p) - r / 2, r, r);
            }
        }
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

    /**
     * Compile an evolved expression string to a total numeric function, using
     * the type's `static expression = { vars, preset }` (preset names one of
     * ExpressionCompiler.PRESETS — the presets differ deliberately; see that
     * file). Pure and uncached; `expressionFn` is the cached form.
     */
    compileExpression(expr, vars) {
        const spec = this.constructor.expression;
        return ExpressionCompiler.compile(expr, vars || spec.vars, ExpressionCompiler.PRESETS[spec.preset]);
    }

    /**
     * The compiled function for an expression in this phenotype, cached per
     * phenotype (so a new genome drops the old functions, and the cache can't
     * grow without bound as evolution mints new expressions).
     */
    expressionFn(expr, vars) {
        const cache = this.derive('expressionFns', () => new Map());
        const key = vars ? `${expr}|${vars}` : expr;
        let f = cache.get(key);
        if (!f) { f = this.compileExpression(expr, vars); cache.set(key, f); }
        return f;
    }

    /**
     * Memoise a value derived purely from the phenotype (a graph, a path list,
     * an evaluated stream). Phenotypes are cached per trace by the
     * representation, so identity is a sound key: a new genome — mutation, a
     * setGene edit, a generator swap in the code editor — misses automatically,
     * and there is nothing to invalidate by hand. Per instance, not per
     * phenotype, so a derived value that carries runtime state (MouseMusic's
     * DAG) is never shared between clones. `fn` receives the phenotype.
     */
    derive(name, fn) {
        const p = this.phenotype;
        const memo = this._derived || (this._derived = Object.create(null));
        const hit = memo[name];
        if (hit && hit.key === p) return hit.value;
        const value = fn(p);
        memo[name] = { key: p, value };
        return value;
    }

    // Cache key for Canvas2DModality.renderCached: everything that changes the
    // pixels. That is the phenotype, serialised (a bare object would key as
    // "[object Object]" and collide), plus the version of each shared service
    // the type declares it uses. Override only to key on less than the whole
    // phenotype, or to add an input no capability describes.
    renderKey() {
        const c = this.constructor.caps();
        let key = this.derive('phenotypeJSON', (p) => JSON.stringify(p));
        // Shared services a type draws from are part of what it draws.
        if (typeof window !== 'undefined') {
            if (c.usesColorPalette && window.Palette) key += '|' + window.Palette.name();
            if (c.usesPhoto && window.Photo) key += '|photo' + window.Photo.version();
            if (c.usesRoboParts && window.RoboParts) key += '|parts' + window.RoboParts.version();
        }
        return key;
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

// The one shared animation transport (see the AnimationClock definition above).
// Hung off Individual so every type reaches it the same way it reaches
// mulberry32, without another window.* service to stub in the test harness.
Individual.AnimationClock = AnimationClock;

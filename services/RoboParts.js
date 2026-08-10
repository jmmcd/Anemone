/**
 * RoboParts — an app-level, individual-agnostic library of identikit image
 * parts (mirrors Palette / Photo / AudioClip).
 *
 * `window.RoboParts` owns the decoded part images for the vendored Robohash
 * sets described by `img/robohash/manifest.js`, and nothing else: which parts a
 * creature is made of is the individual's genome, not this service's business.
 *
 * WHY A SERVICE AT ALL. Every other 2D type draws synchronously from numbers,
 * but these parts are files that arrive over the network. Three things follow,
 * and they are the whole reason this file exists:
 *
 *   1. One cache for the whole app. A population of 16 cats shares ~66 distinct
 *      part images, so per-individual loading would fetch each one many times.
 *   2. `image()` never blocks and never throws — it returns a decoded image or
 *      null. `visualize()` draws what exists and skips what doesn't, so a tile
 *      renders immediately and fills in as parts land.
 *   3. `version()` bumps (coalesced, once per batch of arrivals) whenever the
 *      set of available images changes, and the service then asks the framework
 *      to re-render — exactly how Photo handles its late-arriving default image.
 *      Individuals fold `version()` into their render cache key so a
 *      half-loaded tile is never cached as if it were finished.
 *
 * The parts are vendored under img/ rather than hotlinked from a CDN: the app is
 * meant to be handed to a room full of people at once, where a blocked or slow
 * third-party host is a lesson-ruining failure with no fallback, and same-origin
 * images keep the canvas untainted so PNG export still works.
 */
class RoboParts {
    constructor() {
        this._manifest = (typeof window !== 'undefined' && window.ROBOHASH_MANIFEST) || { sets: {} };
        this._images = new Map();   // "set/slot/index" → HTMLImageElement (loaded) | 'failed'
        this._requested = new Set();
        this._version = 0;
        this._bumpPending = false;
    }

    /** Bumps as parts arrive; belongs in an individual's renderKey(). */
    version() { return this._version; }

    /** The manifest entry for a set, or null. */
    set(setName) { return (this._manifest.sets && this._manifest.sets[setName]) || null; }

    /** Slot descriptors (in paste/z order) for a set. */
    slots(setName) {
        const set = this.set(setName);
        return set ? set.slots : [];
    }

    /** How many options each slot offers, in paste order — the genome's shape. */
    slotCounts(setName) {
        return this.slots(setName).map(s => s.parts.length);
    }

    /** Credit line for a set. CC-BY artwork: this is shown, not just stored. */
    credit(setName) {
        const set = this.set(setName);
        if (!set) return '';
        return `${set.label} by ${set.artist} (${set.license}), via Robohash`;
    }

    /**
     * Start fetching every part of a set. Called from an individual's
     * constructor, so a user who never selects this type downloads nothing.
     */
    ensureLoaded(setName) {
        const slots = this.slots(setName);
        for (let s = 0; s < slots.length; s++) {
            for (let i = 0; i < slots[s].parts.length; i++) this._request(setName, s, i);
        }
    }

    /**
     * The decoded image for a part, or null if it is not here yet (or failed).
     * Indices are taken modulo the slot size, so a genome stays meaningful even
     * if a slot's option count ever changes.
     */
    image(setName, slotIndex, partIndex) {
        const slot = this.slots(setName)[slotIndex];
        if (!slot) return null;
        const i = this._wrap(partIndex, slot.parts.length);
        const got = this._images.get(this._key(setName, slotIndex, i));
        if (got === undefined) { this._request(setName, slotIndex, i); return null; }
        return got === 'failed' ? null : got;
    }

    /**
     * The part's alpha bounding box, normalised to 0..1, or null for a fully
     * transparent part. Individuals pivot rotation/scale about its centre so a
     * part turns in place rather than swinging about the canvas centre.
     */
    bbox(setName, slotIndex, partIndex) {
        const slot = this.slots(setName)[slotIndex];
        if (!slot) return null;
        const part = slot.parts[this._wrap(partIndex, slot.parts.length)];
        return (part && part.bbox) || null;
    }

    /** Upstream filename of a part — shown in the genome panel. */
    partName(setName, slotIndex, partIndex) {
        const slot = this.slots(setName)[slotIndex];
        if (!slot) return '?';
        const part = slot.parts[this._wrap(partIndex, slot.parts.length)];
        return part ? part.src : '?';
    }

    /** True once every part of the set has resolved (loaded or failed). */
    ready(setName) {
        const slots = this.slots(setName);
        for (let s = 0; s < slots.length; s++) {
            for (let i = 0; i < slots[s].parts.length; i++) {
                if (!this._images.has(this._key(setName, s, i))) return false;
            }
        }
        return slots.length > 0;
    }

    // --- internals -------------------------------------------------------

    _key(setName, slotIndex, partIndex) { return `${setName}/${slotIndex}/${partIndex}`; }

    _wrap(i, n) {
        if (!n) return 0;
        const k = Math.floor(i) % n;
        return k < 0 ? k + n : k;
    }

    _request(setName, slotIndex, partIndex) {
        const key = this._key(setName, slotIndex, partIndex);
        if (this._requested.has(key)) return;
        this._requested.add(key);

        const set = this.set(setName);
        const slot = this.slots(setName)[slotIndex];
        if (!set || !slot || typeof document === 'undefined') return;
        const part = slot.parts[partIndex];
        if (!part) return;

        const img = new Image();
        img.onload = () => { this._images.set(key, img); this._scheduleBump(); };
        img.onerror = () => { this._images.set(key, 'failed'); this._scheduleBump(); };
        img.src = `${set.dir}/${slot.name}/${part.file}`;
    }

    // Coalesce a burst of arrivals into one version bump + one re-render, so
    // loading 66 parts costs one redraw of the grid rather than 66.
    _scheduleBump() {
        if (this._bumpPending) return;
        this._bumpPending = true;
        setTimeout(() => {
            this._bumpPending = false;
            this._version++;
            this._rerenderIfActive();
        }, 60);
    }

    // Redraw only if a population that uses these parts is actually on screen.
    // Keeps the population — this is new pixels for the same genomes.
    _rerenderIfActive() {
        const fw = (typeof window !== 'undefined') && window.framework;
        if (!fw || !fw.ea || !fw.ea.population || typeof fw.invalidateAndRender !== 'function') return;
        const sample = fw.ea.population[0];
        if (sample && typeof sample.usesRoboParts === 'function' && sample.usesRoboParts()) {
            fw.invalidateAndRender();
        }
    }
}

// App-level singleton (mirrors window.Palette / window.Photo).
window.RoboParts = new RoboParts();

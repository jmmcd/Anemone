/**
 * Photo — an app-level, individual-agnostic image service (mirrors Palette).
 *
 * `window.Photo` holds ONE source image shared by every PhotoFilterIndividual.
 * The image is deliberately NOT part of any genome: individuals evolve a filter
 * *chain*, and all of them filter this same shared photo. Replacing the photo
 * therefore bumps a version counter and invalidates render caches, but leaves
 * the population (and its evolutionary history) untouched — so the user can swap
 * in a new photo and keep evolving the filters they already have.
 *
 * `sourceImageData(w, h)` returns the source scaled to cover w×h (centre-cropped),
 * cached per size for the current version so all 16 same-size grid tiles share one
 * decode. The returned ImageData is treated as read-only by callers (they copy it
 * into their own output buffer before filtering), so the cache can be shared.
 *
 * The default image is scikit-image's "coffee" — a standard, cleanly-licensed
 * image-processing demo photo — fetched in the background over a generated
 * gradient placeholder (which also serves as the offline fallback).
 */

// Standard demo photo: scikit-image's "coffee", pinned to a release tag and
// served with CORS by jsDelivr so its pixels stay readable (getImageData) after
// cross-origin load. Falls back to the gradient placeholder if it can't be
// fetched (e.g. offline). The whole app already loads d3/three from CDNs.
const DEFAULT_PHOTO_URL = 'https://cdn.jsdelivr.net/gh/scikit-image/scikit-image@v0.19.3/skimage/data/coffee.png';

class Photo {
    constructor() {
        this._version = 0;
        this._userLoaded = false;
        this._name = 'built-in gradient';
        this._source = this._createDefaultImage(); // immediate placeholder + offline fallback
        this._cache = new Map();                    // "WxH" → ImageData (for _cacheVersion)
        this._cacheVersion = 0;

        // Upgrade the placeholder to the standard "coffee" demo photo when it arrives.
        this._loadDefaultImage();
    }

    /** Bumps whenever the source changes — used in render cache keys. */
    version() { return this._version; }

    /** Display name of the current source (filename, or the default's label). */
    name() { return this._name; }

    /** True once the *user* has loaded their own photo (vs. the default). */
    hasImage() { return this._userLoaded; }

    // A colourful placeholder so PhotoFilterIndividuals show something evolvable
    // before any photo is loaded (and so the type is self-contained for demos).
    _createDefaultImage() {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 320;
        const ctx = c.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 320, 320);
        grad.addColorStop(0, '#1b3a6b');
        grad.addColorStop(0.5, '#c94b8e');
        grad.addColorStop(1, '#f6c453');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 320, 320);

        // A few shapes give the filters some edges/tones to work with.
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(210, 110, 62, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(30,180,120,0.9)';
        ctx.fillRect(40, 180, 130, 100);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(20, 60); ctx.lineTo(300, 240); ctx.stroke();

        return c;
    }

    /** Source pixels scaled to cover w×h (centre-cropped). Cached; read-only. */
    sourceImageData(width, height) {
        if (this._cacheVersion !== this._version) {
            this._cache.clear();
            this._cacheVersion = this._version;
        }
        const key = width + 'x' + height;
        if (this._cache.has(key)) return this._cache.get(key);

        const tmp = document.createElement('canvas');
        tmp.width = width; tmp.height = height;
        const ctx = tmp.getContext('2d');

        const s = this._source;
        const scale = Math.max(width / s.width, height / s.height); // cover
        const dw = s.width * scale, dh = s.height * scale;
        ctx.drawImage(s, (width - dw) / 2, (height - dh) / 2, dw, dh);

        const imageData = ctx.getImageData(0, 0, width, height);
        this._cache.set(key, imageData);
        return imageData;
    }

    /**
     * Replace the source with a user-selected image file. Resolves once the new
     * image is decoded and installed (version bumped); the caller then re-renders.
     */
    async setImageFromFile(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = await this._loadImage(url);
            this._installImage(img, file.name || 'photo', true);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    // Rescale (capping the long edge so filtering stays fast) and install `img`
    // as the source, bumping the version and dropping the size cache.
    _installImage(img, name, userLoaded) {
        const maxDim = 1024;
        const sc = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);

        this._source = c;
        this._name = name;
        if (userLoaded) this._userLoaded = true;
        this._version++;
        this._cache.clear();
    }

    // Fetch the standard demo photo in the background; keep the gradient on failure.
    _loadDefaultImage() {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // so getImageData() can read the cross-origin pixels
        img.onload = () => {
            if (this._userLoaded) return; // user already picked their own photo
            try { this._installImage(img, 'coffee (scikit-image)', false); }
            catch (e) { return; }
            this._rerenderIfActive();
        };
        img.onerror = () => { /* offline: keep the gradient placeholder */ };
        img.src = DEFAULT_PHOTO_URL;
    }

    // If a photo-filter population is on screen, redraw it so the late-arriving
    // default photo replaces the gradient. Keeps the population (evolution continues).
    _rerenderIfActive() {
        const fw = window.framework;
        if (!fw || !fw.ea || !fw.ea.population || typeof fw.invalidateAndRender !== 'function') return;
        const sample = fw.ea.population[0];
        if (sample && typeof sample.usesPhoto === 'function' && sample.usesPhoto()) {
            fw.invalidateAndRender();
        }
    }

    _loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Image decode failed'));
            img.src = url;
        });
    }
}

// App-level singleton (mirrors window.Palette).
window.Photo = new Photo();

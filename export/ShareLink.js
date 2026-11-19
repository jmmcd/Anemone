/*
 * ShareLink.js — a URL that carries one individual, so a picture or a drum loop
 * can be sent to a friend the way `#DrumMachine` sends the app.
 *
 * Link shape:  <app>#DrumMachine/<payload>
 *
 * The part before the slash is the ordinary type deep link, so code that only
 * knows about `#Type` still lands on the right type. The payload is one format
 * character followed by the body; format '1' is base64url(deflate-raw(UTF-8
 * JSON)) of
 *
 *     { app, type, phenoSig, sigVersion, genome, settings }
 *
 * — the same provenance a saved PNG embeds (ImageSave.metaFor), minus the
 * phenotype snapshot, id and timestamp, which a link has no use for. Compression
 * matters: a step sequencer's full PTO trace is ~30 KB of JSON but ~3.5 KB once
 * deflated, because the trace's names and distribution records are highly
 * repetitive. A new encoding (e.g. values-only, replayed positionally through
 * the tracer) gets a new format character; old links keep decoding.
 *
 * The fragment is never sent to a server, so the genome stays between the
 * sender and the recipient, and there is no server-side length limit to meet.
 *
 * `settings` carries the framework state the genome alone does not determine
 * but that changes what the sender saw or heard: the palette (for a type that
 * uses one) and the Performance dials the type declares (a drum loop at another
 * tempo is another loop). A user-loaded photo or audio clip cannot travel, so
 * the link carries its filename and a fingerprint of its bytes instead
 * (`photo`/`clip`: { name, fp }): the recipient is told which file to load,
 * and when they load one the fingerprint says whether it really is the same
 * file — a name alone can't (every phone has an IMG_0001.jpg).
 *
 * Sharing never changes anything on the sender's side; reconstruction and the
 * "is this still the same individual?" check are ImageSave.reconstruct, shared
 * with file load. Exposed as the global `window.ShareLink`.
 */
(function () {
    'use strict';

    const FORMAT = '1';

    // CompressionStream is the one capability the format needs (Safari 16.4+,
    // and every current Chrome/Firefox); without it the Share button hides.
    function supported() {
        return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
    }

    async function pipe(bytes, stream) {
        const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
        return new Uint8Array(await out.arrayBuffer());
    }

    function toBase64Url(bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function fromBase64Url(text) {
        const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    // ---- File fingerprint -----------------------------------------------
    // The first 8 hex digits of SHA-256 over the file's BYTES — not its decoded
    // pixels/samples, which a browser's decoder and our resize may not reproduce
    // exactly elsewhere. Null where crypto.subtle is unavailable (an insecure
    // context): the name still travels, the match just can't be confirmed.
    async function fingerprint(bytes) {
        if (typeof crypto === 'undefined' || !crypto.subtle) return null;
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        return Array.from(digest.subarray(0, 4), b => b.toString(16).padStart(2, '0')).join('');
    }

    // ---- Settings that travel with the genome ---------------------------
    function settingsFor(individual, framework) {
        const settings = {};
        if (individual.usesColorPalette && individual.usesColorPalette() && framework && framework.settings) {
            settings.palette = framework.settings.colorPalette;
        }
        const pc = window.PerformanceControls;
        if (pc && individual.usesPerformanceControls && individual.usesPerformanceControls()) {
            settings.dials = {};
            for (const name of individual.performanceDials()) {
                const d = pc.dials[name];
                if (d) settings.dials[name] = { on: d.on, value: d.value };
            }
        }
        if (individual.usesPhoto && individual.usesPhoto() && window.Photo && window.Photo.hasImage()) {
            settings.photo = { name: window.Photo.name(), fp: window.Photo.fingerprint() };
        }
        if (individual.usesAudio && individual.usesAudio() && window.AudioClip && window.AudioClip.hasClip()) {
            settings.clip = { name: window.AudioClip.name(), fp: window.AudioClip.fingerprint() };
        }
        return settings;
    }

    // Apply a link's settings before the run is built, so the panels mount
    // showing them. Every value is checked: a link is untrusted input.
    function applySettings(settings, framework) {
        if (!settings || typeof settings !== 'object') return;
        const palette = window.Palette;
        if (typeof settings.palette === 'string' && framework && framework.settings &&
            (!palette || !palette.getPaletteList || palette.getPaletteList().includes(settings.palette))) {
            framework.settings.colorPalette = settings.palette;
        }
        const pc = window.PerformanceControls;
        if (pc && settings.dials && typeof settings.dials === 'object') {
            for (const name of Object.keys(settings.dials)) {
                const d = pc.dials[name];
                const s = settings.dials[name];
                if (!d || !s || typeof s.value !== 'number' || !isFinite(s.value)) continue;
                d.on = !!s.on;
                d.value = Math.min(d.max, Math.max(d.min, s.value));
            }
        }
    }

    // ---- Encode / decode ------------------------------------------------
    async function encode(individual, framework) {
        const meta = {
            app: 'Anemone',
            type: individual.constructor.name,
            phenoSig: window.ImageSave.phenotypeSignature(individual),
            sigVersion: window.ImageSave.SIG_VERSION,
            genome: individual.genome,
            settings: settingsFor(individual, framework),
        };
        const json = new TextEncoder().encode(JSON.stringify(meta));
        return FORMAT + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
    }

    // Payload → metadata object. Throws on anything malformed or of an unknown
    // format; the caller turns that into a toast.
    async function decode(payload) {
        if (typeof payload !== 'string' || payload[0] !== FORMAT) {
            throw new Error('Unknown share-link format');
        }
        const bytes = await pipe(fromBase64Url(payload.slice(1)), new DecompressionStream('deflate-raw'));
        const meta = JSON.parse(new TextDecoder().decode(bytes));
        if (!meta || meta.app !== 'Anemone' || typeof meta.type !== 'string' || meta.genome == null) {
            throw new Error('Not an Anemone share link');
        }
        return meta;
    }

    // The full link: this page, with the type's deep-link token and the payload.
    async function linkFor(individual, framework) {
        const base = location.href.split('#')[0];
        const token = individual.constructor.name.replace(/Individual$/, '');
        return `${base}#${token}/${await encode(individual, framework)}`;
    }

    window.ShareLink = { supported, encode, decode, linkFor, settingsFor, applySettings, fingerprint };
})();

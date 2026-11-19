// ExportManager — save/export of the zoomed individual (PNG/STL/WAV/MIDI),
// bulk population/liked-run exports, PNG-load reconstruction + the placement
// flow, share links (sending from the zoom, and arrival), and the toast helper.
//
// Partial class: these methods are authored here but merged onto
// InteractiveEAFramework.prototype (below), so `this` is the framework instance
// and every call site (this.foo(), framework.foo()) is unchanged. Loaded after
// framework/Anemone.js. See CLAUDE.md > Project Layout.
(function () {
    // The user-loaded sources a share link can name but not carry.
    const SHARED_SOURCES = {
        photo: { service: 'Photo', noun: 'photo' },
        clip: { service: 'AudioClip', noun: 'sound clip' },
    };

    const ext = class {
    // Save the currently-zoomed individual as a PNG with its genome embedded
    // as reproducible metadata (see ImageSave.js). One-tap, no dialog.
    saveCurrentImage() {
        const individual = this.currentIndividual;
        if (!individual || !this.lightboxCanvas || !window.ImageSave) return;
        window.ImageSave.saveCanvas(this.lightboxCanvas, individual)
            .then((filename) => this.showToast(`Saved ${filename}`))
            .catch((err) => {
                console.warn('Image save failed:', err);
                this.showToast('Could not save image');
            });
    }

    // Short, filesystem-safe stem for the current individual type, e.g.
    // AnemoneIndividual -> "anemone". Shared by the population/liked exports.
    typeStem(typeName) {
        return window.ExportNaming.stem(typeName);
    }

    // The natural single-file export format for an individual: audio types save
    // their sound (WAV if renderable, else MIDI for note sequences), everything
    // else saves its image. Keeps the bulk exports from writing PNGs of sound.
    individualExportKind(individual) {
        if (window.AudioExport && window.AudioExport.canExport(individual)) return 'wav';
        if (window.MidiExport && window.MidiExport.canExport(individual)) return 'mid';
        return 'png';
    }

    // Render one individual to its natural artefact bytes: { ext, bytes }. Shared
    // by both bulk exports; each artefact embeds the same reproducible metadata as
    // the single-file exports (WAV anmn chunk / MIDI meta event / PNG iTXt chunk).
    async exportArtifactFor(individual, canvas) {
        const meta = () => JSON.stringify(window.ImageSave.metaFor(individual));
        const kind = this.individualExportKind(individual);
        if (kind === 'wav') {
            const buffer = await window.AudioExport.renderToBuffer(individual);
            return { ext: 'wav', bytes: new Uint8Array(window.AudioExport.encodeWAV(buffer, meta())) };
        }
        if (kind === 'mid') {
            return { ext: 'mid', bytes: window.MidiExport.buildSMF(individual.toMIDISequence(), meta()) };
        }
        individual.visualize(canvas); // 2D draws directly; 3D draws a static frame via the shared renderer
        return { ext: 'png', bytes: await window.ImageSave.buildPngBytes(canvas, individual) };
    }

    // Bundle a set of individuals into one ZIP, each as its natural artefact
    // (PNG/WAV/MIDI), plus a manifest.json carrying the full reproducible metadata.
    async buildIndividualsZip(individuals, zipName) {
        if (!window.ImageSave) return;
        this.showToast(`Building ${zipName} (${individuals.length})…`);
        try {
            const off = document.createElement('canvas');
            off.width = 256; off.height = 256;
            const entries = [];
            const manifest = [];
            const counts = {};
            for (const ind of individuals) {
                const { ext, bytes } = await this.exportArtifactFor(ind, off);
                const stem = this.typeStem(ind.constructor && ind.constructor.name);
                counts[stem] = (counts[stem] || 0) + 1;
                const name = `anemone-${stem}-${String(counts[stem]).padStart(3, '0')}.${ext}`;
                entries.push({ name, bytes });
                manifest.push(Object.assign({ file: name }, window.ImageSave.metaFor(ind)));
            }
            entries.push({ name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
            const zip = window.ImageSave.buildZip(entries);
            window.ImageSave.download(new Blob([zip], { type: 'application/zip' }), zipName);
            this.showToast(`Saved ${zipName} (${individuals.length})`);
        } catch (err) {
            console.warn('ZIP export failed:', err);
            this.showToast('Could not build ZIP');
        }
    }

    // Save the whole current population. Visual types → one bordered PNG montage of
    // the on-screen tiles (captures exactly what's shown, 2D and 3D alike). Audio
    // types → a ZIP of each member's sound file (a montage image is meaningless).
    async savePopulationImage() {
        const pop = (this.ea && this.ea.population || []).filter(Boolean);
        if (pop.length === 0) { this.showToast('Nothing to save'); return; }
        const stem = this.typeStem(this.individualClass && this.individualClass.name);

        if (this.individualExportKind(pop[0]) !== 'png') {
            await this.buildIndividualsZip(pop, `anemone-${stem}-population.zip`);
            return;
        }
        if (!window.ImageSave || !this.grid) return;
        const canvases = Array.from(this.grid.children)
            .map(div => div.querySelector('canvas'))
            .filter(Boolean);
        if (canvases.length === 0) { this.showToast('Nothing to save'); return; }
        try {
            const montage = window.ImageSave.composeMontage(canvases, { border: 8, gap: 8, background: '#111' });
            const name = `anemone-${stem}-population.png`;
            montage.toBlob((blob) => {
                if (!blob) { this.showToast('Could not save population'); return; }
                window.ImageSave.download(blob, name);
                this.showToast(`Saved ${name}`);
            }, 'image/png');
        } catch (err) {
            console.warn('Population save failed:', err);
            this.showToast('Could not save population');
        }
    }

    // Export every individual liked during the whole run as a ZIP of natural
    // artefacts (each re-loads via Load…), plus a manifest.json.
    async saveLikedRunZip() {
        if (!window.ImageSave || !this.ea) return;
        // Dedup by phenotype signature: an elite that stays liked recurs across
        // generations as distinct instances but identical art/sound — save it once.
        const seen = new Set();
        const liked = [];
        (this.ea.likedArchive || []).forEach((ind) => {
            let key;
            try { key = window.ImageSave.phenotypeSignature(ind); } catch (e) { key = null; }
            key = key || ('id:' + (ind && ind.id));
            if (!seen.has(key)) { seen.add(key); liked.push(ind); }
        });
        if (liked.length === 0) { this.showToast('No liked individuals yet'); return; }

        const stem = this.typeStem(this.individualClass && this.individualClass.name);
        await this.buildIndividualsZip(liked, `anemone-${stem}-liked.zip`);
    }

    // Export the currently-zoomed individual's mesh as a binary STL for 3D
    // printing (see MeshExport.js). Only wired for 3D types; the button is
    // hidden otherwise in openZoom().
    exportCurrentSTL() {
        const individual = this.currentIndividual;
        if (!individual || typeof individual.generate3DPoints !== 'function' || !window.MeshExport) return;
        try {
            const filename = window.MeshExport.downloadSTL(individual);
            this.showToast(`Exported ${filename}`);
        } catch (err) {
            console.warn('STL export failed:', err);
            this.showToast('Could not export STL');
        }
    }

    // Export the currently-zoomed audio individual's filtered clip as a .wav
    // (see AudioExport.js — an offline render of its effects graph). Only wired
    // for audio types; the button is hidden otherwise in openZoom().
    exportCurrentWav() {
        const individual = this.currentIndividual;
        if (!individual || !window.AudioExport) return;
        this.showToast('Rendering WAV…');
        window.AudioExport.downloadWAV(individual)
            .then((filename) => this.showToast(`Exported ${filename}`))
            .catch((err) => {
                console.warn('WAV export failed:', err);
                this.showToast('Could not export WAV');
            });
    }

    // Export the currently-zoomed individual's note sequence as a .mid (see
    // MidiExport.js). Only wired for individuals that expose toMIDISequence()
    // (drum machine, melody); the button is hidden otherwise in openZoom().
    exportCurrentMidi() {
        const individual = this.currentIndividual;
        if (!individual || !window.MidiExport) return;
        try {
            const filename = window.MidiExport.downloadMIDI(individual);
            this.showToast(`Exported ${filename}`);
        } catch (err) {
            console.warn('MIDI export failed:', err);
            this.showToast('Could not export MIDI');
        }
    }

    // Brief, self-dismissing confirmation message.
    showToast(message, ms = 2200) {
        let toast = this._toastEl;
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            document.body.appendChild(toast);
            this._toastEl = toast;
        }
        toast.textContent = message;
        // Force reflow so re-triggering restarts the transition.
        void toast.offsetWidth;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
    }

    // ---- Load a saved PNG / WAV / MIDI back into an individual --------------
    // All three export formats embed the same {type, genome, phenotype, phenoSig}
    // provenance (see ImageSave.metaFor), so load is format-agnostic: pick the
    // reader by extension, then reconstruct + verify + place identically.
    async loadIndividualFromFile(file) {
        if (!file) return;
        const name = (file.name || '').toLowerCase();
        let reader = null;
        if (name.endsWith('.png') && window.ImageSave) reader = window.ImageSave;
        else if (name.endsWith('.wav') && window.AudioExport) reader = window.AudioExport;
        else if ((name.endsWith('.mid') || name.endsWith('.midi')) && window.MidiExport) reader = window.MidiExport;
        else { this.showToast('Load a saved Anemone .png, .wav or .mid'); return; }

        let meta;
        try {
            meta = await reader.readMetadataFromFile(file);
        } catch (err) {
            console.warn('File read failed:', err);
            this.showToast('Could not read that file');
            return;
        }
        this.reconstructAndPlace(meta);
    }

    // Shared reconstruct/verify/place path for a decoded metadata object.
    reconstructAndPlace(meta) {
        if (!meta || meta.app !== 'Anemone' || !meta.type || meta.genome == null) {
            this.showToast('No Anemone individual found in that file');
            return;
        }
        // Cross-type load is refused: a mixed-type population would break the
        // EA's crossover (different types have incompatible PTO traces).
        if (meta.type !== this.individualClass.name) {
            this.showToast(`That file is a ${meta.type}; current run is ${this.individualClass.name}`);
            return;
        }
        const C = this.individualTypeMap()[meta.type];
        if (!C) { this.showToast(`Unknown individual type: ${meta.type}`); return; }

        // Reconstruct from the saved genome (the PTO trace) — revive + signature
        // self-check, shared with share links (ImageSave.reconstruct).
        let result;
        try {
            result = window.ImageSave.reconstruct(meta, C, this.midiOutput);
        } catch (err) {
            console.warn('Reconstruction failed:', err);
            this.showToast('Could not reconstruct that individual');
            return;
        }

        // Refuse rather than silently load a different-looking individual into a
        // run the user is curating (a share link, arriving fresh, warns instead).
        if (!result.faithful) {
            this.showToast(`This ${meta.type} can't be faithfully reproduced (saved by a different version?)`);
            return;
        }

        this.enterPlacementMode(result.individual);
    }

    // ---- Share links (export/ShareLink.js) ----------------------------------
    // The link is built when the zoom opens (and again after an edit), not on
    // the click: encoding is async, and navigator.share / clipboard writes must
    // happen inside the click's user activation, which an await can outlive.
    _prepareShareLink(individual) {
        this._shareLink = null;
        if (!this.lightboxShare) return;
        const ok = !!(window.ShareLink && window.ShareLink.supported());
        this.lightboxShare.style.display = ok ? '' : 'none';
        if (!ok) return;
        const request = this._shareRequest = {};
        window.ShareLink.linkFor(individual, this)
            .then((url) => { if (this._shareRequest === request) this._shareLink = url; })
            .catch((err) => console.warn('Share link failed:', err));
    }

    // Touch devices get the native share sheet (Messages, WhatsApp, …); with a
    // mouse, copying the link is what's wanted.
    shareCurrent() {
        const url = this._shareLink;
        if (!url) { this.showToast('Preparing the link — try again in a moment'); return; }
        const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (touch && navigator.share) {
            const entry = (window.INDIVIDUAL_TYPES || []).find(t => t.name === this.individualClass.name);
            const text = `A ${entry ? entry.label : 'creature'} I evolved in Anemone`;
            navigator.share({ title: 'Anemone', text, url }).catch((err) => {
                if (err && err.name !== 'AbortError') this._copyShareLink(url);
            });
            return;
        }
        this._copyShareLink(url);
    }

    _copyShareLink(url) {
        const fallback = () => window.prompt('Copy this link to share:', url);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(() => this.showToast('Link copied — paste it to share'), fallback);
        } else {
            fallback();
        }
    }

    // Arrival: decode the payload, apply its settings, start a run of its type
    // with the shared individual in slot 0 and mutants of it around it, and
    // open it in the zoom. The run switch replaceStates the URL down to #Type,
    // so a refresh after evolving doesn't jump back to the shared individual.
    async openSharedLink(payload) {
        if (this._sharePending === payload) return; // hashchange + popstate both fire
        this._sharePending = payload;
        try {
            let meta = null;
            try { meta = await window.ShareLink.decode(payload); }
            catch (err) { console.warn('Share link decode failed:', err); }
            const C = meta && this.individualTypeMap()[meta.type];
            let result = null;
            if (C) {
                window.ShareLink.applySettings(meta.settings, this);
                try { result = window.ImageSave.reconstruct(meta, C, this.midiOutput); }
                catch (err) { console.warn('Share link reconstruction failed:', err); }
            }
            if (!result) {
                this.showToast('That share link could not be opened');
                this._fallBackFromShareLink();
                return;
            }
            this.hideLanding({ render: false });
            this.setIndividualType(C, { seed: result.individual, family: true });
            this.openZoom(result.individual);
            const settings = meta.settings || {};
            this._sharedSources = { photo: settings.photo || null, clip: settings.clip || null };
            const notes = [];
            if (!result.faithful) notes.push('this link was made with a different version of Anemone, so it may not be exactly as shared');
            for (const kind of ['photo', 'clip']) {
                const shared = this._sharedSources[kind];
                if (!shared || this._sharedSourceMatches(kind)) continue;
                const { noun } = SHARED_SOURCES[kind];
                notes.push(`it was made with the sender's ${noun} “${shared.name}” — load it to see this exactly as shared`);
            }
            this.showToast(notes.length
                ? 'Shared with you — but ' + notes.join('; ')
                : 'Shared with you — close to see its relatives', notes.length ? 6000 : 3500);
        } finally {
            this._sharePending = null;
        }
    }

    // Does the recipient's current photo/clip match the one a share link was
    // made with? Only a fingerprint can say yes; a name match alone cannot.
    _sharedSourceMatches(kind) {
        const shared = this._sharedSources && this._sharedSources[kind];
        const service = window[SHARED_SOURCES[kind].service];
        if (!shared || !shared.fp || !service || !service.fingerprint) return false;
        return service.fingerprint() === shared.fp;
    }

    // Called by the photo/clip panels after the user loads a file: if this run
    // came from a share link made with a file of the user's own, say whether
    // this is that file.
    checkSharedSource(kind) {
        const shared = this._sharedSources && this._sharedSources[kind];
        if (!shared) return;
        const { noun, service } = SHARED_SOURCES[kind];
        const mine = window[service];
        if (this._sharedSourceMatches(kind)) {
            this.showToast(`That's the ${noun} this was shared with`, 3500);
        } else if (shared.fp && mine && mine.fingerprint && mine.fingerprint()) {
            const same = mine.name() === shared.name;
            this.showToast(same
                ? `Same name, but a different ${noun} from the one shared`
                : `Not the ${noun} this was shared with (“${shared.name}”)`, 4500);
        }
    }

    // A link that cannot be opened still names a type: go there (or to the
    // start page), and drop the payload from the URL.
    _fallBackFromShareLink() {
        const { token } = InteractiveEAFramework.parseHash(location.hash);
        const cls = InteractiveEAFramework.resolveIndividualType(token);
        if (history.replaceState) history.replaceState(null, '', cls ? '#' + cls.name.replace(/Individual$/, '') : '#');
        if (!cls) { if (!this.landingOpen) this.showLanding(); return; }
        if (cls !== this.individualClass) { this.hideLanding({ render: false }); this.setIndividualType(cls); }
        else this.hideLanding();
    }

    enterPlacementMode(individual) {
        this.pendingLoad = individual;
        if (this.placePreview) {
            try { individual.visualize(this.placePreview); } catch (e) { /* preview is best-effort */ }
        }
        if (this.placeBanner) this.placeBanner.classList.add('open');
        if (this.grid) this.grid.classList.add('placing');
        // Close the drawer so the grid is visible/clickable.
        if (this.drawer) this.drawer.classList.remove('open');
        if (this.drawerScrim) this.drawerScrim.classList.remove('open');
    }

    exitPlacementMode() {
        if (!this.pendingLoad) return;
        this.pendingLoad = null;
        if (this.placeBanner) this.placeBanner.classList.remove('open');
        if (this.grid) this.grid.classList.remove('placing');
    }

    // Replace the chosen grid tile with the loaded individual, then zoom it so
    // the user can confirm it matches the file.
    placeLoadedIndividual(index) {
        const individual = this.pendingLoad;
        if (!individual) return;
        const old = this.ea.population[index];
        if (old) {
            if (old.stopMIDI) old.stopMIDI();
            if (old.stopDAG) old.stopDAG();
            if (old.is3D && old.is3D()) this.removeMeshFromScene(old.id);
            if (old.selected) this.ea.toggleLike(old); // drop it from the liked set
        }
        if (this.currentlyPlaying === old) this.currentlyPlaying = null;
        this.ea.population[index] = individual;
        this.currentIndividual = individual;
        this.exitPlacementMode();
        this.render();
        this.openZoom(individual);
        this.showToast('Loaded individual placed');
    }
    };
    const descriptors = Object.getOwnPropertyDescriptors(ext.prototype);
    delete descriptors.constructor;
    Object.defineProperties(InteractiveEAFramework.prototype, descriptors);
})();

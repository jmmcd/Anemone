// Lightbox — the zoom overlay: openZoom/closeZoom, the genome/phenotype panel,
// grid-editing wiring for step sequencers, the zoom animation loop, 3D auto-
// rotation, and the sequencer-length / play-pause transport helpers.
//
// Partial class: these methods are authored here but merged onto
// InteractiveEAFramework.prototype (below), so `this` is the framework instance
// and every call site (this.foo(), framework.foo()) is unchanged. Loaded after
// framework/Anemone.js. See CLAUDE.md > Project Layout.
(function () {
    const ext = class {
    // Zoom lightbox: a larger render plus the genome/phenotype description.
    openZoom(individual) {
        if (!this.lightbox) return;
        this.currentIndividual = individual;
        try {
            individual.visualize(this.lightboxCanvas);
        } catch (err) {
            console.warn('Zoom render failed:', err);
        }
        const gridEditable = typeof individual.isGridEditable === 'function' && individual.isGridEditable();
        this._renderLightboxInfo(individual, gridEditable);
        // STL export only makes sense for individuals with a triangle mesh
        // (the 3D types expose generate3DPoints()).
        if (this.lightboxExportStl) {
            const exportable = typeof individual.generate3DPoints === 'function';
            this.lightboxExportStl.style.display = exportable ? '' : 'none';
        }
        // Audio-producing individuals export a .wav instead of a .png; hide the
        // PNG Save for them and show ⤓ WAV. Gated on the render capability, not
        // usesAudio() (the drum machine produces audio but loads no clip panel).
        // Save is also hidden for types that opt out via usesImageSave() (e.g.
        // Melody, whose artefact is the MIDI, not the piano-roll tile).
        const audioOut = window.AudioExport && window.AudioExport.canExport(individual);
        const savesImage = !audioOut && (individual.usesImageSave ? individual.usesImageSave() : true);
        if (this.lightboxExportWav) this.lightboxExportWav.style.display = audioOut ? '' : 'none';
        if (this.lightboxSave) this.lightboxSave.style.display = savesImage ? '' : 'none';
        // MIDI export shows for any individual that can produce a note sequence
        // (drum machine, melody); independent of the WAV/PNG gate above.
        const midiOut = window.MidiExport && window.MidiExport.canExport(individual);
        if (this.lightboxExportMidi) this.lightboxExportMidi.style.display = midiOut ? '' : 'none';
        this.lightbox.classList.add('open');
        // The one-shot visualize() above draws a static frame; keep the zoomed
        // 3D view rotating too.
        this.startZoomAnimation(individual);
        // Wire click/drag editing for grid-editable types (e.g. the drum machine).
        this.teardownGridEditing();
        if (gridEditable) this.setupGridEditing(individual);
    }

    // Render the zoom info panel, appending a one-line hint when the tile is a
    // directly-editable grid. Re-called after each edit so the ASCII grid updates.
    _renderLightboxInfo(individual, gridEditable) {
        if (!this.lightboxInfo) return;
        let html = individual.describe();
        if (gridEditable) {
            html += '<div class="edit-hint">Click or drag cells to edit the loop — edits evolve with it.</div>';
        }
        this.lightboxInfo.innerHTML = html;
    }

    // Turn the zoom canvas into an editable step grid: click toggles a cell,
    // drag paints (the first cell sets whether the drag turns cells on or off).
    // Each edit is folded into the individual's genome by the individual itself
    // (setCellHit → representation.setGene), so evolution continues from it. If the
    // loop is playing, the audio is refreshed when the gesture ends.
    setupGridEditing(individual) {
        const canvas = this.lightboxCanvas;
        if (!canvas) return;
        this._gridEditAbort = new AbortController();
        const signal = this._gridEditAbort.signal;
        canvas.style.cursor = 'pointer';

        let painting = false, paintOn = null, lastKey = null;
        const cellAt = (e) => {
            const rect = canvas.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (canvas.width / rect.width);
            const py = (e.clientY - rect.top) * (canvas.height / rect.height);
            return individual.cellAtCanvasXY(canvas, px, py);
        };
        const apply = (cell, on) => {
            const key = cell.c + ',' + cell.s;
            if (key === lastKey) return;         // don't re-fire within the same cell during a drag
            lastKey = key;
            individual.setCellHit(cell.c, cell.s, on);
            individual.visualize(canvas);
            this._renderLightboxInfo(individual, true);
        };
        canvas.addEventListener('pointerdown', (e) => {
            const cell = cellAt(e);
            if (!cell) return;
            e.preventDefault();
            try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
            painting = true; lastKey = null;
            paintOn = !individual.cellOn(cell.c, cell.s);   // toggle sets the paint direction
            apply(cell, paintOn);
        }, { signal });
        canvas.addEventListener('pointermove', (e) => {
            if (!painting) return;
            const cell = cellAt(e);
            if (cell) apply(cell, paintOn);
        }, { signal });
        const end = () => {
            if (!painting) return;
            painting = false; lastKey = null;
            // Keep the small grid tile in sync with the edited genome.
            if (individual._tileCanvas) {
                try { individual.visualize(individual._tileCanvas); } catch (_) { }
            }
            // Refresh the audible loop if this individual is the one playing.
            if (this.currentlyPlaying === individual && typeof individual.playMIDI === 'function') {
                individual.playMIDI();
            }
        };
        canvas.addEventListener('pointerup', end, { signal });
        canvas.addEventListener('pointercancel', end, { signal });
    }

    teardownGridEditing() {
        if (this._gridEditAbort) { this._gridEditAbort.abort(); this._gridEditAbort = null; }
        if (this.lightboxCanvas) this.lightboxCanvas.style.cursor = '';
    }

    // Rotate the zoomed 3D view. The grid tiles idle while the lightbox is open
    // (see animate3DWithSharedScene), so only this loop drives the renderer. A
    // token supersedes any previous zoom loop and stops it on close.
    startZoomAnimation(individual) {
        const token = {};
        this._zoomAnimToken = token;
        if (!(individual.is3D && individual.is3D()) || !this.shared3D || !this.lightboxCanvas) return;
        const canvas = this.lightboxCanvas;
        // Some 3D types animate their *geometry*, not just the camera (Jenn's 4D
        // rotation continuously reprojects the mesh). For those, rebuild the mesh
        // each frame from the current clock; otherwise reuse the cached mesh and
        // only orbit the camera (far cheaper). Only the single zoomed object is
        // rebuilt — doing this across the whole grid would be too heavy.
        const animatesGeom = individual.animatesGeometry && individual.animatesGeometry()
            && typeof individual.setAnimationTime === 'function';
        const animate = () => {
            if (this._zoomAnimToken !== token) return;                 // superseded / closed
            if (!this.lightbox.classList.contains('open')) return;      // closed
            if (animatesGeom) {
                individual.setAnimationTime(this.rotationTime());       // pauses with the clock
                try { individual.visualize(canvas); } catch (e) { /* keep the loop alive */ }
            } else {
                const mesh = this.shared3D.meshes.get(individual.id);
                if (mesh) this.renderMeshToCanvas(canvas, individual.id, mesh);
            }
            requestAnimationFrame(animate);
        };
        animate();
    }

    // Seconds of "rotation time" for the 3D camera. Advances with the wall clock while
    // rotationEnabled; while paused it holds the value at the moment of pausing, and on
    // resume the paused span is added to the offset so the angle continues seamlessly.
    rotationTime() {
        const now = Date.now();
        const base = this.rotationEnabled ? now : this._rotPausedAtMs;
        return (base - this._rotPauseOffsetMs) * 0.001;
    }

    // Start/stop 3D auto-rotation (the play/pause hotkey in a 3D run).
    toggleRotation() {
        if (this.rotationEnabled) {
            this.rotationEnabled = false;
            this._rotPausedAtMs = Date.now();
        } else {
            this.rotationEnabled = true;
            this._rotPauseOffsetMs += Date.now() - this._rotPausedAtMs; // credit the paused span
            this._rotPausedAtMs = null;
        }
        this.showToast(this.rotationEnabled ? 'Rotating' : 'Rotation paused');
    }

    // A representative individual of the current run (for capability checks).
    _sampleIndividual() {
        return (this.ea && this.ea.population && this.ea.population[0]) || null;
    }

    // The [ and ] hotkeys nudge the global sequencer Length (locking the override so it
    // takes effect) for step-sequencer runs, redrawing tiles + refreshing any playing
    // loop. (For 3D runs the same keys stay the camera zoom — dispatched in keydown.)
    adjustSequencerLength(delta) {
        const pc = window.PerformanceControls;
        if (!pc || !pc.dials.length) return;
        const d = pc.dials.length;
        const v = Math.max(d.min, Math.min(d.max, Math.round(d.value) + delta));
        pc.update('length', { on: true, value: v }); // lock + set → re-render + audio refresh
        // Keep the Performance panel controls in sync if it's mounted.
        const cb = document.getElementById('perf-dial-length'); if (cb) cb.checked = true;
        const sl = document.getElementById('perf-slider-length'); if (sl) { sl.disabled = false; sl.value = v; }
        const ro = document.getElementById('perf-readout-length'); if (ro) ro.textContent = d.fmt(v);
        this.showToast(`Length ${v} steps`);
    }

    // Play/pause hotkey. In a 3D run it toggles auto-rotation; in a sound run it
    // pauses whatever is playing, or plays the current (last-clicked) individual —
    // works for every sound type, MouseMusic included (all expose playMIDI/stopMIDI).
    togglePlayPauseOrRotation() {
        const sample = this._sampleIndividual();
        if (sample && sample.is3D && sample.is3D()) { this.toggleRotation(); return; }
        if (this.currentlyPlaying && this.currentlyPlaying.stopMIDI) {
            this.currentlyPlaying.stopMIDI();
            this.currentlyPlaying = null;
            this.refreshPlayButtons();
            return;
        }
        const ind = this.currentIndividual || sample;
        if (ind && typeof ind.playMIDI === 'function') {
            ind.playMIDI();
            this.currentlyPlaying = ind;
            this.refreshPlayButtons();
        }
    }

    closeZoom() {
        this._zoomAnimToken = null; // stop the zoom rotation loop
        // If the zoomed individual animated its geometry (Jenn 4D rotation), return
        // it to the static genome pose and refresh its grid tile so it isn't left
        // frozen mid-morph at reduced detail.
        const ind = this.currentIndividual;
        if (ind && typeof ind.resetAnimation === 'function') {
            ind.resetAnimation();
            if (ind._tileCanvas) { try { ind.visualize(ind._tileCanvas); } catch (e) { /* ignore */ } }
        }
        this.teardownGridEditing();
        if (this.lightbox) this.lightbox.classList.remove('open');
    }
    };
    const descriptors = Object.getOwnPropertyDescriptors(ext.prototype);
    delete descriptors.constructor;
    Object.defineProperties(InteractiveEAFramework.prototype, descriptors);
})();

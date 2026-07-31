class InteractiveEAFramework {
    constructor(individualClass = GridIndividual) {
        // Publish the instance immediately, before anything the constructor kicks
        // off can look for it. main.js also assigns window.framework, but only
        // AFTER `new` returns — too late for the constructor's own initializeShared3D
        // + first render(). When a 3D type is the startup type (e.g. deep-linked via
        // the #Type hash the app sets on use), that first render runs while
        // window.framework is still undefined, so every 3D individual's visualize()
        // fell back to the 2D path and never built a shared-scene mesh: tiles showed
        // a static wireframe (no faces) and their rotation loop found no mesh, until
        // a zoom rebuilt it. Setting it here closes that window.
        if (typeof window !== 'undefined') window.framework = this;
        this.individualClass = individualClass;
        this.midiOutput = null;
        this.midiInput = null; // MIDI Clock input for window.MIDISync (see initializeMIDI)
        this.audioContext = null;
        this.currentIndividual = null; // Track the last clicked individual

        // Shared output modalities for all sound individuals (one owner per medium,
        // avoiding per-individual duplication). Mirrors the shared 3D scene/renderer.
        // sharedMIDI: note events (Melody/MouseMusic/EEG); sharedAudio: rendered
        // buffers / live graphs (DrumMachine/AudioFilter, over AudioClip's context).
        this.sharedMIDI = new MIDIModality();
        this.sharedAudio = new AudioModality();
        this.currentlyPlaying = null; // The individual currently producing sound

        // Framework settings
        this.settings = {
            colorPalette: 'forest'
        };

        // Extension system
        this.extensions = {};
        this.uiExtensions = [];

        // Shared 3D resources for WebGL context management
        this.shared3D = null;

        // Supersampling factor for 3D tiles/zoom (see renderMeshToCanvas): the
        // scene is rendered at ss× the target canvas and downsampled for cheap
        // anti-aliasing. 2 is a big smoothness win at 4× the fragment cost (same
        // geometry); raise for even smoother edges if the GPU has headroom.
        this.superSample3D = 2;

        // User-adjustable multiplier on the 3D camera framing distance (see
        // renderMeshToCanvas). 1.0 = default framing; the [ and ] hotkeys step
        // it so the user can pull back when a self-intersecting radial surface
        // has geometry closer to the camera than its bounding-box centre (which
        // otherwise puts the camera "inside" a lobe). Default is 2 [ steps
        // closer-in than 1.0 (1/1.15²) for a larger view.
        this.cameraDistanceFactor = 1 / (1.15 * 1.15);

        // 3D camera field of view in degrees (the "focal length"). Lower = more
        // telephoto = less foreshortening/perspective distortion; the framing
        // distance is derived from this (renderMeshToCanvas) so the sculpture
        // keeps the same on-screen size when the FOV changes. The - and = hotkeys
        // step it. 30° is gentler than Three's 75° default.
        this.cameraFOV = 30;

        // 3D auto-rotation, toggled by the play/pause hotkey (see rotationTime()).
        // Implemented as an offset subtracted from the wall clock, so pausing freezes
        // the angle and resuming continues from it with no jump.
        this.rotationEnabled = true;
        this._rotPauseOffsetMs = 0; // total paused wall-time
        this._rotPausedAtMs = null; // wall time at which we paused (null while running)

        // Build the UI and first generation immediately — nothing here needs MIDI,
        // so the grid renders without waiting on MIDI access / port opening (which
        // can be slow, or hang, on some systems). Sound only happens on user
        // interaction, long after this.
        this.ea = new EvolutionaryAlgorithm(individualClass, 16, this.midiOutput);
        this.initializeShared3D();
        this.loadExtensions();
        this.setupUI();
        this.render();

        // Connect MIDI in the background: initializeMIDI() wires framework.sharedMIDI
        // (every sound individual references it) when it resolves, and falls back to
        // Web Audio otherwise — so it's ready well before anyone selects a music app.
        this.initializeMIDI().then(() => {
            if (this.ea) this.ea.midiOutput = this.midiOutput;
        }).catch((err) => console.warn('⚠️ MIDI init failed (Web Audio fallback in use):', err));
    }
    
    async initializeMIDI() {
        console.log('🎹 Framework initializing MIDI...');
        
        // Initialize Web Audio
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🎹 Web Audio initialized');
        } catch (err) {
            console.log('Web Audio API not supported');
        }
        
        // Initialize MIDI
        if (navigator.requestMIDIAccess) {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('MIDI access timeout')), 5000)
                );

                const midiAccess = await Promise.race([
                    navigator.requestMIDIAccess(),
                    timeoutPromise
                ]);
                this.midiAccess = midiAccess; // keep alive — GC of the root object can drop ports in some browsers

                const outputs = Array.from(midiAccess.outputs.values());
                console.log('🎹 MIDI access granted, found outputs:', outputs.length);
                outputs.forEach((output, index) => {
                    console.log(`  ${index}: "${output.name}" (${output.manufacturer}) state=${output.state} conn=${output.connection}`);
                });

                if (outputs.length > 0) {
                    let preferredOutput = outputs.find(output => output.name.includes('IAC Driver'));
                    if (!preferredOutput) preferredOutput = outputs.find(output => output.name.includes('Logic Pro Virtual'));
                    if (!preferredOutput) {
                        preferredOutput = outputs[0];
                        console.log(`⚠️ No IAC Driver / Logic Pro Virtual output found — falling back to first port: "${preferredOutput.name}"`);
                    }

                    this.midiOutput = preferredOutput;
                    console.log(`✓ Framework using MIDI output: ${preferredOutput.name}`);
                    if (preferredOutput.connection === 'closed') {
                        // Guard: on some systems port.open() never resolves. Never let it
                        // stall app init (the whole UI is chained off initializeMIDI) — race
                        // it against a timeout. sendNote works regardless (ports auto-open).
                        await this._openPortSafely(preferredOutput);
                        console.log(`🔧 MIDI port opened: state=${preferredOutput.state} conn=${preferredOutput.connection}`);
                    }
                } else {
                    console.log('⚠️ No MIDI outputs found — will use Web Audio fallback');
                }

                // MIDI input, for MIDI Clock sync (window.MIDISync): lets an external
                // DAW (e.g. GarageBand/Logic sending Beat Clock over the same IAC bus
                // our notes go out on) drive Anemone's tempo/phase — see MIDISync.js.
                // Same preferred-name heuristic as the output, so it's the other end of
                // the same virtual bus by default.
                const inputs = Array.from(midiAccess.inputs.values());
                console.log('🎹 MIDI access granted, found inputs:', inputs.length);
                inputs.forEach((input, index) => {
                    console.log(`  ${index}: "${input.name}" (${input.manufacturer}) state=${input.state} conn=${input.connection}`);
                });

                if (inputs.length > 0) {
                    let preferredInput = inputs.find(input => input.name.includes('IAC Driver'));
                    if (!preferredInput) preferredInput = inputs.find(input => input.name.includes('Logic Pro Virtual'));
                    if (!preferredInput) {
                        preferredInput = inputs[0];
                        console.log(`⚠️ No IAC Driver / Logic Pro Virtual input found — falling back to first port: "${preferredInput.name}"`);
                    }

                    this.midiInput = preferredInput;
                    console.log(`✓ Framework using MIDI input: ${preferredInput.name}`);
                    if (preferredInput.connection === 'closed') await this._openPortSafely(preferredInput);
                    preferredInput.onmidimessage = (event) => {
                        if (window.MIDISync) window.MIDISync.handleMessage(event.data, event.timeStamp);
                    };
                } else {
                    console.log('⚠️ No MIDI inputs found — MIDI clock sync unavailable');
                }
            } catch (error) {
                console.error('❌ MIDI initialization failed:', error);
            }
        } else {
            console.log('Web MIDI API not supported');
        }

        // Wire the resolved output (or null → Web Audio fallback) into the
        // single shared modality that every sound individual references.
        this.sharedMIDI.setMidiOutput(this.midiOutput);
    }

    // Open a MIDI port without ever hanging app init: a port.open() that never
    // resolves (seen on some macOS/IAC setups) would otherwise stall the whole
    // initializeMIDI().then(...) chain and leave the grid unrendered. Resolve on
    // whichever comes first — open() or a short timeout — and swallow errors.
    async _openPortSafely(port, timeoutMs = 2000) {
        try {
            await Promise.race([
                Promise.resolve(port.open()),
                new Promise((resolve) => setTimeout(resolve, timeoutMs))
            ]);
        } catch (err) {
            console.warn(`⚠️ MIDI port open() failed for "${port.name}":`, err);
        }
    }

    // (methods live in framework/Shared3D.js — partial class, prototype-merged)
    
    // Attach UI drawer panels based on the current type's capability flags. Each
    // entry names a boolean capability method the individual may declare and a
    // factory that builds the panel; adding a panel is a one-line addition here.
    // (See CLAUDE.md > Extension System. CodeEditorUI has its own guard below —
    // it keys on editableSections() rather than a usesX() flag.)
    static PANELS = [
        { flag: 'usesColorPalette',        make: (fw) => new PaletteControlUI(fw) },
        { flag: 'usesPhoto',               make: (fw) => new PhotoControlUI(fw) },
        { flag: 'usesAudio',               make: (fw) => new AudioControlUI(fw) },
        { flag: 'usesPerformanceControls', make: (fw, s) => new PerformanceControlsUI(fw, s.performanceDials()) },
        { flag: 'usesMIDISync',            make: (fw) => new MIDISyncUI(fw) },
        { flag: 'usesOSCInput',            make: (fw) => new OSCInputUI(fw) },
    ];

    loadExtensions() {
        const sample = this.ea && this.ea.population && this.ea.population[0];
        if (!sample) return;

        for (const { flag, make } of InteractiveEAFramework.PANELS) {
            if (typeof sample[flag] === 'function' && sample[flag]()) {
                this.uiExtensions.push(make(this, sample));
            }
        }

        // The code-editor panel is attached for every individual that exposes
        // editable code sections (all PTO-backed types do — at minimum their
        // generator), so it keys on editableSections() rather than a usesX() flag.
        if (typeof sample.editableSections === 'function' && sample.editableSections().length > 0) {
            this.uiExtensions.push(new CodeEditorUI(this));
        }
    }

    // Rebuild the population from scratch with the current individual class,
    // keeping the same population size and MIDI wiring. Used when a runtime
    // change to the search space (an edited generator or grammar) invalidates the
    // existing genomes.
    reinitializePopulation() {
        this.cleanupOldIndividuals();
        this.currentIndividual = null;
        this.ea = new EvolutionaryAlgorithm(this.individualClass, this.ea.populationSize, this.midiOutput);
        this.render();
    }

    // Keep the current population but discard cached renders and redraw. Used when
    // a runtime change affects only how genomes are drawn (an edited draw
    // function), so the user's evolved individuals must be preserved.
    invalidateAndRender() {
        if (this.ea && this.ea.population) {
            this.ea.population.forEach(individual => {
                if (individual.invalidateImageCache) individual.invalidateImageCache();
            });
        }
        this.render();
    }
    
    // Method for extensions to update settings
    updateSetting(key, value) {
        this.settings[key] = value;
        console.log(`Framework setting updated: ${key} = ${value}`);
        
        // Invalidate caches when settings change
        if (this.ea && this.ea.population) {
            this.ea.population.forEach(individual => {
                if (individual.invalidateImageCache) {
                    individual.invalidateImageCache();
                }
            });
        }
        
        // Re-render grid if needed
        this.renderGrid();
    }
    
    setupUI() {
        this.grid = document.getElementById('grid');
        this.evolveBtn = document.getElementById('evolve-btn');
        this.evolveFab = document.getElementById('evolve-fab');
        this.resetBtn = document.getElementById('reset-btn');
        this.selectedCount = document.getElementById('selected-count');
        this.selectedCountBar = document.getElementById('selected-count-bar');
        this.selectedCountFab = document.getElementById('selected-count-fab');
        this.generationSpan = document.getElementById('generation');
        this.populationSizeSpan = document.getElementById('population-size');
        this.avgFitnessSpan = document.getElementById('avg-fitness');
        this.historyList = document.getElementById('history-list');

        // Drawer + lightbox chrome
        this.drawer = document.getElementById('drawer');
        this.drawerScrim = document.getElementById('drawer-scrim');
        this.menuBtn = document.getElementById('menu-btn');
        this.drawerClose = document.getElementById('drawer-close');
        this.lightbox = document.getElementById('lightbox');
        this.lightboxCanvas = document.getElementById('lightbox-canvas');
        this.lightboxInfo = document.getElementById('lightbox-info');
        this.lightboxClose = document.getElementById('lightbox-close');
        this.lightboxSave = document.getElementById('lightbox-save');
        this.lightboxExportStl = document.getElementById('lightbox-export-stl');
        this.lightboxExportWav = document.getElementById('lightbox-export-wav');
        this.lightboxExportMidi = document.getElementById('lightbox-export-midi');
        this.aboutLink = document.getElementById('about-link');
        this.aboutModal = document.getElementById('about-modal');
        this.aboutContent = document.getElementById('about-content');
        this.aboutClose = document.getElementById('about-close');
        // App-wide "?" shortcuts overlay, generated from the HOTKEYS table. Built
        // once here rather than attached per type by loadExtensions, since it
        // applies to every type (it just filters its rows by the current one).
        this.helpOverlay = (typeof HelpOverlayUI !== 'undefined') ? new HelpOverlayUI(this) : null;
        this.helpBtn = document.getElementById('help-btn');
        if (this.helpBtn) this.helpBtn.addEventListener('click', () => this.toggleHelp());

        // Load-PNG-to-individual chrome
        this.loadPngBtn = document.getElementById('load-png-btn');
        this.loadPngInput = document.getElementById('load-png-input');
        this.savePopulationBtn = document.getElementById('save-population-btn');
        this.saveLikedBtn = document.getElementById('save-liked-btn');
        this.placeBanner = document.getElementById('place-banner');
        this.placePreview = document.getElementById('place-preview');
        this.placeCancel = document.getElementById('place-cancel');

        // Evolve is triggered from either the FAB (touch/narrow) or the inline
        // app-bar button (wide pointer-fine), and from the Space hotkey; all share
        // this.evolveGeneration() (framework/Hotkeys.js).
        if (this.evolveBtn) this.evolveBtn.addEventListener('click', () => this.evolveGeneration());
        if (this.evolveFab) this.evolveFab.addEventListener('click', () => this.evolveGeneration());

        this.resetBtn.addEventListener('click', () => {
            this.cleanupOldIndividuals();
            this.currentIndividual = null; // Clear current individual on reset
            this.ea.reset();
            this.render();
        });

        // Drawer open/close (openDrawer/closeDrawer are methods in framework/Hotkeys.js;
        // the Escape hotkey shares closeDrawer).
        if (this.menuBtn) this.menuBtn.addEventListener('click', () => this.openDrawer());
        if (this.drawerClose) this.drawerClose.addEventListener('click', () => this.closeDrawer());
        if (this.drawerScrim) this.drawerScrim.addEventListener('click', () => this.closeDrawer());

        // Lightbox close (button, backdrop click, Escape)
        if (this.lightboxClose) this.lightboxClose.addEventListener('click', () => this.closeZoom());
        if (this.lightbox) this.lightbox.addEventListener('click', (e) => {
            if (e.target === this.lightbox) this.closeZoom();
        });

        // About page: opens an overlay (same chrome as the lightbox) that fetches
        // About.md and shows it; closes back to the grid. openAbout/closeAbout are
        // methods in framework/Hotkeys.js (the Escape hotkey shares closeAbout).
        if (this.aboutLink) this.aboutLink.addEventListener('click', (e) => { e.preventDefault(); this.openAbout(); });
        if (this.aboutClose) this.aboutClose.addEventListener('click', () => this.closeAbout());
        if (this.aboutModal) this.aboutModal.addEventListener('click', (e) => {
            if (e.target === this.aboutModal) this.closeAbout();
        });

        // Lightbox save: explicit button (works on mobile + desktop), plus
        // right-click / long-press on the zoomed canvas as a bonus affordance.
        if (this.lightboxSave) this.lightboxSave.addEventListener('click', () => this.saveCurrentImage());
        if (this.lightboxExportStl) this.lightboxExportStl.addEventListener('click', () => this.exportCurrentSTL());
        if (this.lightboxExportWav) this.lightboxExportWav.addEventListener('click', () => this.exportCurrentWav());
        if (this.lightboxExportMidi) this.lightboxExportMidi.addEventListener('click', () => this.exportCurrentMidi());
        if (this.lightboxCanvas) {
            this.lightboxCanvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.saveCurrentImage();
            });
            let lpTimer = null;
            const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
            this.lightboxCanvas.addEventListener('touchstart', () => {
                cancelLp();
                lpTimer = setTimeout(() => { lpTimer = null; this.saveCurrentImage(); }, 550);
            }, { passive: true });
            this.lightboxCanvas.addEventListener('touchend', cancelLp);
            this.lightboxCanvas.addEventListener('touchmove', cancelLp, { passive: true });
        }
        // All keyboard shortcuts are dispatched from the declarative table in
        // framework/Hotkeys.js (InteractiveEAFramework.HOTKEYS) via _handleKeydown,
        // which is also what the ? help overlay reads.
        document.addEventListener('keydown', (e) => this._handleKeydown(e));

        // Individual type switching: changing the selection switches immediately.
        this.individualTypeSelect = document.getElementById('individual-type-select');
        this.populateIndividualTypeSelector();

        // Set current individual type in selector
        this.updateIndividualTypeSelector();

        this.individualTypeSelect.addEventListener('change', () => {
            this.switchIndividualType();
        });

        // Load a saved PNG back into an individual.
        if (this.loadPngBtn && this.loadPngInput) {
            this.loadPngBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.loadPngInput.click();
            });
            this.loadPngInput.addEventListener('change', (e) => {
                if (e.target && e.target.files && e.target.files.length > 0) {
                    this.loadIndividualFromFile(e.target.files[0]);
                }
                this.loadPngInput.value = ''; // allow re-loading the same file
            });
        }
        if (this.placeCancel) this.placeCancel.addEventListener('click', () => this.exitPlacementMode());

        // Bulk exports: the whole population as one image, or every liked
        // individual from the run as a ZIP of reproducible PNGs.
        if (this.savePopulationBtn) this.savePopulationBtn.addEventListener('click', () => this.savePopulationImage());
        if (this.saveLikedBtn) this.saveLikedBtn.addEventListener('click', () => this.saveLikedRunZip());

        // Mount UI extensions
        this.mountUIExtensions();
    }

    mountUIExtensions() {
        const extensionContainer = document.getElementById('extensions-container');
        if (!extensionContainer) {
            console.warn('No extensions-container element found in HTML');
            return;
        }

        this.uiExtensions.forEach(extension => {
            if (extension.mount) {
                extension.mount(extensionContainer);
            }
        });
    }

    cleanupOldIndividuals() {
        console.log('🧹 Cleaning up old individuals...');
        if (this.ea && this.ea.population) {
            this.ea.population.forEach(individual => {
                if (individual.stopMIDI) {
                    individual.stopMIDI();
                }
                if (individual.stopDAG) {
                    individual.stopDAG();
                }
                // Cleanup 3D resources - remove from shared scene
                if (individual.is3D && individual.is3D()) {
                    this.removeMeshFromScene(individual.id);
                }
                // Legacy cleanup for individuals with their own resources
                if (individual.cleanup) {
                    individual.cleanup();
                }
                // Rotation loops self-terminate when their canvas leaves the DOM
                // (see animate3DWithSharedScene); removing the mesh above also
                // makes any in-flight frame a no-op.
            });
        }
        this.currentlyPlaying = null;
    }
    
    render() {
        this.renderGrid();
        this.renderInfo();
        this.renderHistory();
    }
    
    renderGrid() {
        console.time('renderGrid');
        this.grid.innerHTML = '';
        
        console.time('Create DOM elements');
        this.ea.population.forEach((individual, index) => {
            const div = document.createElement('div');
            div.className = 'individual';
            if (individual.selected) {
                div.classList.add('selected');
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            individual._tileCanvas = canvas; // so a lightbox edit can refresh the tile

            div.appendChild(canvas);

            // Zoom affordance (revealed on hover on pointer-fine; on touch the
            // same view is reached by long-press, handled below).
            const zoomBtn = document.createElement('button');
            zoomBtn.className = 'zoom-btn';
            zoomBtn.textContent = '⛶';
            zoomBtn.setAttribute('aria-label', 'Zoom in');
            zoomBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openZoom(individual);
            });
            div.appendChild(zoomBtn);

            // Audio individuals get a play triangle to audition without liking.
            // Because all sound individuals share one MIDIModality, only one
            // plays at a time: starting one stops the current one.
            if (typeof individual.playMIDI === 'function') {
                const playBtn = document.createElement('button');
                playBtn.className = 'play-btn';
                playBtn.textContent = '▶';
                playBtn.setAttribute('aria-label', 'Play');
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.currentlyPlaying === individual) {
                        individual.stopMIDI();
                        this.currentlyPlaying = null;
                    } else {
                        if (this.currentlyPlaying && this.currentlyPlaying.stopMIDI) {
                            this.currentlyPlaying.stopMIDI();
                        }
                        individual.playMIDI();
                        this.currentlyPlaying = individual;
                    }
                    this.refreshPlayButtons();
                });
                div.appendChild(playBtn);
            }

            // Single tap/click = toggle like (binary) + make current.
            // …unless we're placing a loaded individual: then a click drops it
            // onto this tile.
            div.addEventListener('click', () => {
                if (this.pendingLoad) { this.placeLoadedIndividual(index); return; }
                if (div._suppressClick) { div._suppressClick = false; return; }
                this.currentIndividual = individual;
                this.ea.toggleLike(individual);
                div.classList.toggle('selected', individual.selected);
                this.renderInfo();
            });

            // Double-click (pointer-fine) = zoom. The two clicks it also fires
            // toggle like twice (net no change), so like state is preserved.
            div.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.openZoom(individual);
            });

            // Long-press (touch) = zoom. Suppress the click that would follow.
            let pressTimer = null;
            const startPress = () => {
                div._suppressClick = false;
                pressTimer = setTimeout(() => {
                    div._suppressClick = true;
                    this.openZoom(individual);
                }, 500);
            };
            const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
            div.addEventListener('touchstart', startPress, { passive: true });
            div.addEventListener('touchend', cancelPress);
            div.addEventListener('touchmove', cancelPress, { passive: true });

            this.grid.appendChild(div);
        });
        console.timeEnd('Create DOM elements');
        
        console.time('Visualize all individuals');
        this.ea.population.forEach((individual, index) => {
            const canvas = this.grid.children[index].querySelector('canvas');
            
            // Visualize individual - 3D individuals now use shared Three.js scene
            individual.visualize(canvas);
            
            // Start animation loop for 3D individuals using shared scene
            if (individual.is3D && individual.is3D() && this.shared3D) {
                this.animate3DWithSharedScene(individual, canvas);
            }
        });
        console.timeEnd('Visualize all individuals');

        this.refreshPlayButtons();

        console.timeEnd('renderGrid');
    }
    
    // Toggle "like" on the individual at grid position `index` (0-based), the
    // keyboard equivalent of clicking the tile: it also makes that individual
    // current and syncs the tile's selected styling + the info panel.
    toggleSelectByIndex(index) {
        if (this.pendingLoad) return;              // placement mode owns clicks
        const individual = this.ea.population[index];
        const div = this.grid && this.grid.children[index];
        if (!individual || !div) return;
        this.currentIndividual = individual;
        this.ea.toggleLike(individual);
        div.classList.toggle('selected', individual.selected);
        this.renderInfo();
    }

    renderInfo() {
        const count = this.ea.selectedIndividuals.length;
        if (this.selectedCount) this.selectedCount.textContent = count;
        this.generationSpan.textContent = this.ea.generation;
        this.populationSizeSpan.textContent = this.ea.populationSize;
        this.avgFitnessSpan.textContent = this.ea.getAverageFitness().toFixed(2);

        // Selected-count badges on the FAB and inline Evolve button.
        [this.selectedCountBar, this.selectedCountFab].forEach(badge => {
            if (!badge) return;
            badge.textContent = count;
            badge.classList.toggle('empty', count === 0);
        });
    }

    // Reflect playback state on the per-cell play triangles.
    refreshPlayButtons() {
        if (!this.grid) return;
        this.ea.population.forEach((individual, index) => {
            const cell = this.grid.children[index];
            const btn = cell && cell.querySelector('.play-btn');
            if (!btn) return;
            const playing = this.currentlyPlaying === individual;
            btn.classList.toggle('playing', playing);
            btn.textContent = playing ? '■' : '▶';
        });
    }

    // (methods live in framework/Lightbox.js — partial class, prototype-merged)

    // (methods live in framework/ExportManager.js — partial class, prototype-merged)
    
    renderHistory() {
        this.historyList.innerHTML = '';
        
        this.ea.history.forEach((gen, index) => {
            const span = document.createElement('span');
            span.className = 'history-item';
            span.textContent = `Gen ${gen.generation}`;
            
            if (index === this.ea.history.length - 1) {
                span.classList.add('current');
            }
            
            span.addEventListener('click', () => this.goToHistoryIndex(index));

            this.historyList.appendChild(span);
        });
    }

    // Load a stored generation. The single path for time travel — the history
    // strip clicks it, and the undo/redo hotkeys step through it.
    goToHistoryIndex(index) {
        if (index < 0 || index >= this.ea.history.length) return false;
        // Stop any sound before swapping in a different generation.
        if (this.currentlyPlaying && this.currentlyPlaying.stopMIDI) {
            this.currentlyPlaying.stopMIDI();
        }
        this.currentlyPlaying = null;
        this.ea.loadGeneration(index);
        this.render();
        return true;
    }

    // Where in the history the displayed population came from. loadGeneration
    // restores `ea.generation`, so the generation number identifies the entry;
    // fall back to the newest entry (the live population, before any time travel).
    _currentHistoryIndex() {
        const i = this.ea.history.findIndex((h) => h.generation === this.ea.generation);
        return i === -1 ? this.ea.history.length - 1 : i;
    }

    // Undo / redo an evolve step (the z / u and Z hotkeys). No new state: this is
    // the existing generation history, stepped one entry at a time.
    stepGeneration(delta) {
        const target = this._currentHistoryIndex() + delta;
        if (!this.goToHistoryIndex(target)) {
            this.showToast(delta < 0 ? 'No earlier generation' : 'No later generation');
            return false;
        }
        this.showToast(`Generation ${this.ea.generation}`);
        return true;
    }
    
    // Build the <select> options from the registry (INDIVIDUAL_TYPES), skipping
    // hidden entries. The menu order is the registry order.
    populateIndividualTypeSelector() {
        if (!this.individualTypeSelect) return;
        const types = (typeof INDIVIDUAL_TYPES !== 'undefined')
            ? INDIVIDUAL_TYPES
            : (typeof window !== 'undefined' && window.INDIVIDUAL_TYPES) || [];
        this.individualTypeSelect.innerHTML = '';
        for (const t of types) {
            if (t.hidden) continue;
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = t.label;
            this.individualTypeSelect.appendChild(opt);
        }
    }

    updateIndividualTypeSelector() {
        if (this.individualTypeSelect) {
            this.individualTypeSelect.value = this.individualClass.name;
        }
    }
    
    // Map of individual type names → constructors. Shared by the type selector,
    // the load-PNG path (which looks a type up by its saved name), and the
    // deep-link resolver. Static so main.js can resolve a URL token to a class
    // before the framework is constructed. Derived from the single source of
    // truth, INDIVIDUAL_TYPES (IndividualRegistry.js).
    individualTypeMap() { return InteractiveEAFramework.individualTypeMap(); }

    // Resolve a registered type name to its class. Class declarations in classic
    // <script> files are global *lexical* bindings, not properties of `window`,
    // so `window[name]` won't find them; a global-scope Function body can. The
    // name comes from our own registry and is identifier-checked before use.
    static classForName(name) {
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
        try { return new Function('return (typeof ' + name + " !== 'undefined') ? " + name + ' : null;')(); }
        catch (_) { return null; }
    }

    static individualTypeMap() {
        const types = (typeof INDIVIDUAL_TYPES !== 'undefined')
            ? INDIVIDUAL_TYPES
            : (typeof window !== 'undefined' && window.INDIVIDUAL_TYPES) || [];
        const map = {};
        for (const t of types) {
            const cls = InteractiveEAFramework.classForName(t.name);
            if (cls) map[t.name] = cls;
        }
        return map;
    }

    // Resolve a deep-link token (e.g. "DrumMachine", "drummachineindividual",
    // "PetalSphere3DIndividual") to a registered individual class, or null.
    // Matching is case-insensitive and the "Individual" suffix is optional.
    static resolveIndividualType(token) {
        if (!token) return null;
        const norm = s => decodeURIComponent(s).toLowerCase().replace(/individual$/, '');
        const target = norm(token);
        const map = InteractiveEAFramework.individualTypeMap();
        for (const name of Object.keys(map)) {
            if (norm(name) === target) return map[name];
        }
        return null;
    }

    switchIndividualType() {
        const selectedType = this.individualTypeSelect.value;

        const NewIndividualClass = this.individualTypeMap()[selectedType];

        if (NewIndividualClass && NewIndividualClass !== this.individualClass) {
            console.log(`Switching to individual type: ${selectedType}`);

            // Clean up current individuals
            this.cleanupOldIndividuals();
            this.currentIndividual = null; // Clear current individual when switching types
            
            // Cleanup shared 3D if switching away from 3D individuals
            if (this.shared3D) {
                this.cleanupShared3D();
                this.initializeShared3D();
            }
            
            // Update the individual class
            this.individualClass = NewIndividualClass;
            
            // Create new evolutionary algorithm with new individual type
            this.ea = new EvolutionaryAlgorithm(NewIndividualClass, this.ea.populationSize, this.midiOutput);

            // Clear extensions and reload them for new individual type
            this.extensions = {};
            this.uiExtensions = [];
            this.loadExtensions();

            // Remount UI extensions
            const extensionContainer = document.getElementById('extensions-container');
            if (extensionContainer) {
                extensionContainer.innerHTML = '';
                this.mountUIExtensions();
            }

            // Render the new population
            this.render();

            // Keep the URL hash in sync so the current app is shareable/bookmarkable
            // (the "Individual" suffix is dropped for a friendlier link). replaceState
            // avoids spamming browser history on every switch.
            if (typeof history !== 'undefined' && history.replaceState) {
                history.replaceState(null, '', '#' + selectedType.replace(/Individual$/, ''));
            }

            console.log(`Successfully switched to ${selectedType}`);
        } else if (NewIndividualClass === this.individualClass) {
            console.log('Already using the selected individual type');
        } else {
            console.error(`Individual type not found: ${selectedType}`);
        }
    }
    
    // (methods live in framework/Shared3D.js — partial class, prototype-merged)
}
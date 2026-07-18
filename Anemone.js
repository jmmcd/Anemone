class InteractiveEAFramework {
    constructor(individualClass = GridIndividual) {
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

        // EEG data stream (for EEGSonificationIndividual)
        this.eegStream = null;

        // Initialize MIDI first
        this.initializeMIDI().then(() => {
            this.ea = new EvolutionaryAlgorithm(individualClass, 16, this.midiOutput);
            this.initializeShared3D();
            this.loadExtensions();
            this.setupUI();
            this.distributeEEGStream();
            this.render();
        });
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
                        await preferredOutput.open();
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
                    if (preferredInput.connection === 'closed') await preferredInput.open();
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

    initializeShared3D() {
        console.log('🎮 Initializing shared 3D resources...');
        
        try {
            // Create temporary canvas for shared renderer (we'll render to individual canvases)
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 128;
            tempCanvas.height = 128;
            
            // Create shared Three.js scene and renderer
            this.shared3D = {
                scene: new THREE.Scene(),
                renderer: new THREE.WebGLRenderer({
                    canvas: tempCanvas,
                    antialias: true,
                    preserveDrawingBuffer: true,
                    logarithmicDepthBuffer: true
                }),
                camera: new THREE.PerspectiveCamera(75, 1, 0.1, 1000),
                meshes: new Map() // Track individual meshes by ID
            };
            
            // Configure shared renderer
            this.shared3D.renderer.setSize(128, 128);
            this.shared3D.renderer.shadowMap.enabled = true;
            this.shared3D.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            
            // Set up scene background
            this.shared3D.scene.background = new THREE.Color(0x000000);
            
            // Position camera
            this.shared3D.camera.position.set(15, 15, 15);
            this.shared3D.camera.lookAt(0, 0, 0);
            
            // Add comprehensive lighting to shared scene
            // Much brighter ambient light for overall illumination
            const ambientLight = new THREE.AmbientLight(0x404040, 1.2); // Increased from 0.8 to 1.2
            this.shared3D.scene.add(ambientLight);
            
            // Main directional light from top-right (brighter)
            const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0); // Increased from 0.7 to 1.0
            directionalLight1.position.set(20, 20, 20);
            directionalLight1.castShadow = true;
            this.shared3D.scene.add(directionalLight1);
            
            // Secondary directional light from opposite side (brighter)
            const directionalLight2 = new THREE.DirectionalLight(0x8888ff, 0.6); // Increased from 0.4 to 0.6
            directionalLight2.position.set(-15, 10, -15);
            this.shared3D.scene.add(directionalLight2);
            
            // Fill light from below (brighter)
            const fillLight = new THREE.DirectionalLight(0xffaa88, 0.5); // Increased from 0.3 to 0.5
            fillLight.position.set(0, -10, 0);
            this.shared3D.scene.add(fillLight);
            
            console.log('✓ Shared 3D resources initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize shared 3D resources:', error);
        }
    }
    
    
    // Add mesh to shared scene
    addMeshToScene(individualId, mesh) {
        if (!this.shared3D) return;
        
        // Remove existing mesh for this individual
        this.removeMeshFromScene(individualId);
        
        // Add new mesh
        this.shared3D.scene.add(mesh);
        this.shared3D.meshes.set(individualId, mesh);
    }
    
    // Remove mesh from shared scene
    removeMeshFromScene(individualId) {
        if (!this.shared3D) return;
        
        const existingMesh = this.shared3D.meshes.get(individualId);
        if (existingMesh) {
            this.shared3D.scene.remove(existingMesh);
            
            // Dispose geometry and materials
            if (existingMesh.geometry) {
                existingMesh.geometry.dispose();
            }
            if (existingMesh.material) {
                if (Array.isArray(existingMesh.material)) {
                    existingMesh.material.forEach(material => material.dispose());
                } else {
                    existingMesh.material.dispose();
                }
            }
            
            this.shared3D.meshes.delete(individualId);
        }
    }
    
    // Render specific mesh to canvas using shared renderer
    renderMeshToCanvas(canvas, individualId, mesh) {
        if (!this.shared3D || !this.shared3D.renderer) return;
        
        // Create temporary scene for this individual mesh only
        const tempScene = new THREE.Scene();
        tempScene.background = new THREE.Color(0x000000);
        
        // Copy lighting from shared scene to temp scene (brighter)
        tempScene.add(new THREE.AmbientLight(0x404040, 1.2));
        
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight1.position.set(20, 20, 20);
        tempScene.add(directionalLight1);
        
        const directionalLight2 = new THREE.DirectionalLight(0x8888ff, 0.6);
        directionalLight2.position.set(-15, 10, -15);
        tempScene.add(directionalLight2);
        
        const fillLight = new THREE.DirectionalLight(0xffaa88, 0.5);
        fillLight.position.set(0, -10, 0);
        tempScene.add(fillLight);
        
        // Add only this individual's mesh to temp scene
        tempScene.add(mesh);
        
        // Position camera to frame the specific mesh
        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);

        // Create a copy of the camera for this individual, at the user's chosen
        // focal length. Lower FOV = less foreshortening.
        const camera = this.shared3D.camera.clone();
        camera.fov = this.cameraFOV;
        camera.aspect = canvas.width / canvas.height;
        camera.updateProjectionMatrix();

        // Derive the framing distance from the FOV: this is the distance at which
        // maxDim just fills the vertical view, times a margin. Because it scales
        // as 1/tan(fov/2), narrowing the FOV automatically pushes the camera back
        // to keep the sculpture the same on-screen size — only the perspective
        // distortion changes. The margin (<2 keeps the object large in frame) also
        // gives radial surfaces headroom: their near surface can reach past the
        // bounding-box centre toward the camera, which 0.9·maxDim used to put the
        // camera inside. cameraDistanceFactor is the user's [ / ] fine-tune.
        const halfFov = (this.cameraFOV / 2) * Math.PI / 180;
        const distance = (maxDim / 2) / Math.tan(halfFov) * 1.6 * this.cameraDistanceFactor;
        
        // Add rotation based on time for animation (pausable — see rotationTime()).
        const time = this.rotationTime();
        const rotationRadius = distance;
        camera.position.x = center.x + Math.cos(time * 0.5) * rotationRadius;
        camera.position.y = center.y + distance * 0.7;
        camera.position.z = center.z + Math.sin(time * 0.5) * rotationRadius;
        camera.lookAt(center);
        
        // Set render target size to match canvas
        this.shared3D.renderer.setSize(canvas.width, canvas.height, false);
        
        // Render temp scene (with only this mesh) to shared renderer
        this.shared3D.renderer.render(tempScene, camera);
        
        // Copy rendered content to the individual's canvas
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(this.shared3D.renderer.domElement, 0, 0, canvas.width, canvas.height);
        
        // Remove mesh from temp scene (but don't dispose - it's still needed)
        tempScene.remove(mesh);
    }
    
    // Cleanup all 3D resources
    cleanupShared3D() {
        if (!this.shared3D) return;
        
        console.log('🧹 Cleaning up shared 3D resources...');
        
        // Remove all meshes
        for (const [individualId, mesh] of this.shared3D.meshes) {
            this.removeMeshFromScene(individualId);
        }
        
        // Clear the scene
        while (this.shared3D.scene.children.length > 0) {
            this.shared3D.scene.remove(this.shared3D.scene.children[0]);
        }
        
        // Dispose shared renderer
        if (this.shared3D.renderer) {
            this.shared3D.renderer.dispose();
        }
        
        this.shared3D = null;
    }
    
    loadExtensions() {
        // Attach the color-palette UI panel for individuals that use a palette.
        // The capability is declared per individual via usesColorPalette().
        const sample = this.ea && this.ea.population && this.ea.population[0];
        if (sample && typeof sample.usesColorPalette === 'function' && sample.usesColorPalette()) {
            this.uiExtensions.push(new PaletteControlUI(this));
        }

        // Attach the photo-loading UI panel for individuals that filter a shared
        // photo (usesPhoto()), so the user can load/replace it mid-evolution.
        if (sample && typeof sample.usesPhoto === 'function' && sample.usesPhoto()) {
            this.uiExtensions.push(new PhotoControlUI(this));
        }

        // Attach the audio-loading UI panel for individuals that filter a shared
        // audio clip (usesAudio()), so the user can load/replace it mid-evolution.
        if (sample && typeof sample.usesAudio === 'function' && sample.usesAudio()) {
            this.uiExtensions.push(new AudioControlUI(this));
        }

        // Attach the global Performance panel (tempo/swing/…) for step-sequencer
        // individuals that declare usesPerformanceControls() — lets the user drive the
        // whole population from one place (e.g. lock a tempo to jam over). The type
        // chooses which dials to show via performanceDials().
        if (sample && typeof sample.usesPerformanceControls === 'function' && sample.usesPerformanceControls()) {
            this.uiExtensions.push(new PerformanceControlsUI(this, sample.performanceDials()));
        }

        // Attach the MIDI Clock Sync panel for individuals whose sound has a tempo
        // (step sequencers) or a tempo-paced evaluation loop (mouse/EEG DAGs) that can
        // lock to an external MIDI clock (e.g. GarageBand) — see usesMIDISync().
        if (sample && typeof sample.usesMIDISync === 'function' && sample.usesMIDISync()) {
            this.uiExtensions.push(new MIDISyncUI(this));
        }

        // Attach the code-editor panel for individuals that expose editable code
        // sections (all PTO-backed types do — at minimum their generator).
        if (sample && typeof sample.editableSections === 'function' && sample.editableSections().length > 0) {
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
        this.distributeEEGStream();
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
    
    /**
     * Set EEG data stream and distribute to all individuals
     * @param {EEGDataStream} stream - EEG stream object or null
     */
    setEEGStream(stream) {
        try {
            this.eegStream = stream;
            this.distributeEEGStream();
        } catch (error) {
            console.error('Error setting EEG stream:', error);
            this.eegStream = null;
        }
    }

    /**
     * Distribute current EEG stream to all individuals that support it
     */
    distributeEEGStream() {
        if (!this.ea || !this.ea.population) return;

        try {
            this.ea.population.forEach(individual => {
                if (individual && typeof individual.setEEGDataStream === 'function' && this.eegStream) {
                    individual.setEEGDataStream(this.eegStream);
                }
            });
        } catch (error) {
            console.error('Error distributing EEG stream:', error);
        }
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
        this.eegCsvInput = document.getElementById('eeg-csv-input');
        this.eegLoadBtn = document.getElementById('eeg-load-btn');
        this.eegStatusSpan = document.getElementById('eeg-status');

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

        // Load-PNG-to-individual chrome
        this.loadPngBtn = document.getElementById('load-png-btn');
        this.loadPngInput = document.getElementById('load-png-input');
        this.savePopulationBtn = document.getElementById('save-population-btn');
        this.saveLikedBtn = document.getElementById('save-liked-btn');
        this.placeBanner = document.getElementById('place-banner');
        this.placePreview = document.getElementById('place-preview');
        this.placeCancel = document.getElementById('place-cancel');

        // Evolve is triggered from either the FAB (touch/narrow) or the inline
        // app-bar button (wide pointer-fine); both share one handler.
        const doEvolve = () => {
            console.time('Full Evolution Process');

            console.time('Cleanup');
            this.cleanupOldIndividuals();
            console.timeEnd('Cleanup');

            console.time('EA Evolve');
            this.ea.evolve();
            console.timeEnd('EA Evolve');

            // Distribute EEG stream to new individuals
            this.distributeEEGStream();

            // Clear current individual since population has changed
            this.currentIndividual = null;

            console.time('Render');
            this.render();
            console.timeEnd('Render');

            console.timeEnd('Full Evolution Process');
        };
        if (this.evolveBtn) this.evolveBtn.addEventListener('click', doEvolve);
        if (this.evolveFab) this.evolveFab.addEventListener('click', doEvolve);

        this.resetBtn.addEventListener('click', () => {
            this.cleanupOldIndividuals();
            this.currentIndividual = null; // Clear current individual on reset
            this.ea.reset();
            this.render();
        });

        // Drawer open/close
        const openDrawer = () => { this.drawer.classList.add('open'); this.drawerScrim.classList.add('open'); };
        const closeDrawer = () => { this.drawer.classList.remove('open'); this.drawerScrim.classList.remove('open'); };
        if (this.menuBtn) this.menuBtn.addEventListener('click', openDrawer);
        if (this.drawerClose) this.drawerClose.addEventListener('click', closeDrawer);
        if (this.drawerScrim) this.drawerScrim.addEventListener('click', closeDrawer);

        // Lightbox close (button, backdrop click, Escape)
        if (this.lightboxClose) this.lightboxClose.addEventListener('click', () => this.closeZoom());
        if (this.lightbox) this.lightbox.addEventListener('click', (e) => {
            if (e.target === this.lightbox) this.closeZoom();
        });

        // About page: opens an overlay (same chrome as the lightbox) that
        // fetches About.md and shows it; closes back to the grid.
        const openAbout = () => {
            if (!this.aboutModal) return;
            this.aboutModal.classList.add('open');
            if (this.aboutContent) {
                this.aboutContent.textContent = 'Loading…';
                fetch('About.md')
                    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
                    .then((text) => { this.aboutContent.textContent = text; })
                    .catch(() => { this.aboutContent.textContent = 'Could not load About.md.'; });
            }
        };
        const closeAbout = () => { if (this.aboutModal) this.aboutModal.classList.remove('open'); };
        if (this.aboutLink) this.aboutLink.addEventListener('click', (e) => { e.preventDefault(); openAbout(); });
        if (this.aboutClose) this.aboutClose.addEventListener('click', closeAbout);
        if (this.aboutModal) this.aboutModal.addEventListener('click', (e) => {
            if (e.target === this.aboutModal) closeAbout();
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
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { this.closeZoom(); closeDrawer(); closeAbout(); this.exitPlacementMode(); }
            if (this.aboutModal && this.aboutModal.classList.contains('open')) return;
            // 3D camera hotkeys. Distance: [ pulls in, ] pushes out. Focal length
            // (foreshortening): - narrows the FOV (more telephoto/flatter), = widens
            // it. \ resets both. Ignore while typing in the code editor / any input.
            // The 3D animation loops re-render every frame, so changing these takes
            // effect on the next frame with no explicit redraw.
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
            if (typing) return;
            // [ and ] are context-sensitive: they set the sequencer Length in a
            // step-sequencer run (drum/melody), else they zoom the 3D camera.
            const sample = this._sampleIndividual();
            const isSeq = sample && typeof sample.performanceDials === 'function' && sample.performanceDials().includes('length');
            const isAnimPat = sample instanceof AnimatedPatternIndividual;
            // [ / ] are context-sensitive: sequencer length, animated-pattern period, or 3D camera zoom.
            if (e.key === '[') {
                if (isSeq) this.adjustSequencerLength(-1);
                else if (isAnimPat) AnimatedPatternIndividual.adjustPeriodScale(1.3);   // slower
                else this.cameraDistanceFactor = Math.max(0.3, this.cameraDistanceFactor / 1.15);
            } else if (e.key === ']') {
                if (isSeq) this.adjustSequencerLength(1);
                else if (isAnimPat) AnimatedPatternIndividual.adjustPeriodScale(1 / 1.3); // faster
                else this.cameraDistanceFactor = Math.min(4, this.cameraDistanceFactor * 1.15);
            }
            else if (e.key === '-' || e.key === '_') this.cameraFOV = Math.max(8, this.cameraFOV - 5);
            else if (e.key === '=' || e.key === '+') this.cameraFOV = Math.min(100, this.cameraFOV + 5);
            else if (e.key === '\\') { this.cameraDistanceFactor = 1 / (1.15 * 1.15); this.cameraFOV = 30; }
            // . (the > key) = play/pause the current sound individual (3D run: start/stop rotation).
            else if (e.key === '.' || e.key === '>') { e.preventDefault(); if (isAnimPat) AnimatedPatternIndividual.togglePause(); else this.togglePlayPauseOrRotation(); }
            // Space = Evolve. 0-9 / A-F = toggle like on that tile (hex index into
            // the 16-tile grid, matching a left-to-right, top-to-bottom reading).
            else if (e.key === ' ') { e.preventDefault(); if (this.lightbox && this.lightbox.classList.contains('open')) this.closeZoom(); doEvolve(); }
            else if (/^[0-9a-fA-F]$/.test(e.key)) { this.toggleSelectByIndex(parseInt(e.key, 16)); }
        });

        // Individual type switching: changing the selection switches immediately.
        this.individualTypeSelect = document.getElementById('individual-type-select');

        // Set current individual type in selector
        this.updateIndividualTypeSelector();

        this.individualTypeSelect.addEventListener('change', () => {
            this.switchIndividualType();
        });

        // EEG CSV loading
        if (this.eegLoadBtn && this.eegCsvInput) {
            this.eegLoadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.eegCsvInput.click();
            });

            this.eegCsvInput.addEventListener('change', (e) => {
                if (e.target && e.target.files && e.target.files.length > 0) {
                    this.loadEEGCSV(e.target.files[0]);
                }
            });
        }

        // Load a saved PNG back into an individual (mirrors the EEG-CSV pattern).
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

    /**
     * Load EEG CSV file (Muse headband format)
     */
    async loadEEGCSV(file) {
        if (!file) return;

        try {
            // Validate file
            if (!(file instanceof File)) {
                throw new Error('Invalid file object');
            }

            if (this.eegStatusSpan) {
                this.eegStatusSpan.textContent = 'Loading...';
                this.eegStatusSpan.style.color = '#FFA500';
            }

            const content = await file.text();

            if (!content || typeof content !== 'string') {
                throw new Error('File content is empty or invalid');
            }

            const stream = new EEGDataStream();

            // Use Muse-optimized defaults
            stream.loadFromCSV(content, {
                skipHeaders: true,
                timeGridMs: 200,        // 200ms grid for Muse data
                downsampleRate: 5,      // Keep every 5th sample
                bands: ['Alpha', 'Beta', 'Theta']  // Key neuroscience bands
            });

            if (!stream.data || stream.data.length === 0) {
                throw new Error('No valid EEG samples parsed from file');
            }

            this.setEEGStream(stream);

            if (this.eegStatusSpan) {
                const duration = stream.getDuration();
                const durationStr = (duration / 1000).toFixed(1);
                this.eegStatusSpan.textContent = `✓ ${stream.data.length} samples, ${durationStr}s`;
                this.eegStatusSpan.style.color = '#4CAF50';
            }

            // Reset file input to allow re-loading the same file
            if (this.eegCsvInput) {
                this.eegCsvInput.value = '';
            }

            console.log(`✓ EEG stream loaded: ${stream.data.length} samples, duration ${(stream.getDuration() / 1000).toFixed(1)}s`);
        } catch (error) {
            console.error('❌ Failed to load EEG CSV:', error);
            if (this.eegStatusSpan) {
                this.eegStatusSpan.textContent = `✗ ${error.message || 'Error loading'}`;
                this.eegStatusSpan.style.color = '#F44336';
            }
            // Reset eegStream on error
            this.setEEGStream(null);
            // Reset file input
            if (this.eegCsvInput) {
                this.eegCsvInput.value = '';
            }
        }
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
        const animate = () => {
            if (this._zoomAnimToken !== token) return;                 // superseded / closed
            if (!this.lightbox.classList.contains('open')) return;      // closed
            const mesh = this.shared3D.meshes.get(individual.id);
            if (mesh) this.renderMeshToCanvas(canvas, individual.id, mesh);
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
        this.teardownGridEditing();
        if (this.lightbox) this.lightbox.classList.remove('open');
    }

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
    showToast(message) {
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
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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

        // Reconstruct from the saved genome (the PTO trace). The deserialised
        // trace is "dead" (plain objects, no Dist operators), so revive it into
        // a live trace — otherwise it renders but crashes on the next evolve.
        let individual;
        try {
            individual = new C(meta.genome);
            if (individual.representation && individual.representation.revive) {
                individual.genome = individual.representation.revive(individual.genome);
                individual.invalidateImageCache();
            }
            if (individual.setMidiOutput && this.midiOutput) individual.setMidiOutput(this.midiOutput);
        } catch (err) {
            console.warn('Reconstruction failed:', err);
            this.showToast('Could not reconstruct that individual');
            return;
        }

        // Self-check. A known upstream PTO limitation (see
        // pto-trace-roundtrip-bug.js) stops some types — grammar individuals,
        // and Sheep with its per-instance random network — from faithfully
        // round-tripping through a serialised trace. Compare the reconstructed
        // phenotype's signature with the one saved in the image; refuse rather
        // than silently load a different-looking individual.
        if (meta.phenoSig != null) {
            const sig = window.ImageSave.phenotypeSignature(individual);
            if (sig !== meta.phenoSig) {
                this.showToast(`This ${meta.type} can't be faithfully reproduced yet (known limitation)`);
                return;
            }
        }

        this.enterPlacementMode(individual);
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
    
    renderHistory() {
        this.historyList.innerHTML = '';
        
        this.ea.history.forEach((gen, index) => {
            const span = document.createElement('span');
            span.className = 'history-item';
            span.textContent = `Gen ${gen.generation}`;
            
            if (index === this.ea.history.length - 1) {
                span.classList.add('current');
            }
            
            span.addEventListener('click', () => {
                // Stop any sound before swapping in a different generation.
                if (this.currentlyPlaying && this.currentlyPlaying.stopMIDI) {
                    this.currentlyPlaying.stopMIDI();
                }
                this.currentlyPlaying = null;
                this.ea.loadGeneration(index);
                this.render();
            });
            
            this.historyList.appendChild(span);
        });
    }
    
    updateIndividualTypeSelector() {
        if (this.individualTypeSelect) {
            this.individualTypeSelect.value = this.individualClass.name;
        }
    }
    
    // Map of individual type names → constructors. Shared by the type selector,
    // the load-PNG path (which looks a type up by its saved name), and the
    // deep-link resolver. Static so main.js can resolve a URL token to a class
    // before the framework is constructed.
    individualTypeMap() { return InteractiveEAFramework.individualTypeMap(); }

    static individualTypeMap() {
        return {
            'PatternIndividual': PatternIndividual,
            'PatternGrammarIndividual': PatternGrammarIndividual,
            'AnimatedPatternIndividual': AnimatedPatternIndividual,
            'PolarCurveIndividual': PolarCurveIndividual,
            'ShapesIndividual': ShapesIndividual,
            'PhotoFilterIndividual': PhotoFilterIndividual,
            'AudioFilterIndividual': AudioFilterIndividual,
            'DrumMachineIndividual': DrumMachineIndividual,
            'GridIndividual': GridIndividual,
            'AnemoneIndividual': AnemoneIndividual,
            'BranchIndividual': BranchIndividual,
            'SuperShapeIndividual': SuperShapeIndividual,
            'SuperShape3DIndividual': SuperShape3DIndividual,
            'PetalSphere3DIndividual': PetalSphere3DIndividual,
            'FreeSurface3DIndividual': FreeSurface3DIndividual,
            'WarpedSurface3DIndividual': WarpedSurface3DIndividual,
            'RobotIndividual': RobotIndividual,
            'HoxCreatureIndividual': HoxCreatureIndividual,
            'PenroseIndividual': PenroseIndividual,
            'PSystemIndividual': PSystemIndividual,
            'SheepIndividual': SheepIndividual,
            'MelodyIndividual': MelodyIndividual,
            'MouseMusicIndividual': MouseMusicIndividual,
            'EEGSonificationIndividual': EEGSonificationIndividual
        };
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

            // Distribute EEG stream to new individuals if they support it
            this.distributeEEGStream();

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
    
    setup3DCanvas(canvas) {
        // Ensure canvas has proper WebGL context attributes
        const context = canvas.getContext('webgl2', { antialias: true }) || 
                       canvas.getContext('webgl', { antialias: true });
        if (!context) {
            console.warn('WebGL not supported, falling back to 2D canvas');
            return;
        }
    }
    
    animate3DWithSharedScene(individual, canvas) {
        if (!canvas || !(individual.is3D && individual.is3D()) || !this.shared3D) return;

        // One rotation loop per canvas, keyed on the canvas itself. renderGrid
        // creates a FRESH canvas on every rebuild, so the old canvas leaves the
        // DOM (isConnected → false) and its loop self-terminates below, while the
        // new canvas starts its own. (The previous _animationRunning flag lived
        // on the individual and persisted across rebuilds, so after a palette
        // change the guard blocked a restart and the old loop kept drawing to a
        // detached canvas — that was the "rotation stops" bug.)
        if (canvas._anemAnimating) return;
        canvas._anemAnimating = true;

        const animate = () => {
            if (!canvas.isConnected || !this.shared3D) { canvas._anemAnimating = false; return; }
            // Idle (but stay scheduled) while the zoom lightbox is open, so the
            // shared renderer isn't thrashed between the 128px tiles and the
            // 768px zoom canvas every frame; resumes automatically on close.
            if (!this.lightbox || !this.lightbox.classList.contains('open')) {
                const mesh = this.shared3D.meshes.get(individual.id);
                if (mesh) this.renderMeshToCanvas(canvas, individual.id, mesh);
            }
            requestAnimationFrame(animate);
        };
        animate();
    }
    
    animate3D(individual) {
        // Legacy animation method for backwards compatibility
        this.animate3DWithSharedScene(individual, null);
    }
}
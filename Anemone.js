class InteractiveEAFramework {
    constructor(individualClass = GridIndividual) {
        this.individualClass = individualClass;
        this.midiOutput = null;
        this.audioContext = null;
        this.currentIndividual = null; // Track the last clicked individual

        // Single shared MIDIModality for all sound individuals (avoids one
        // AudioContext per individual). Mirrors the shared 3D scene/renderer.
        this.sharedMIDI = new MIDIModality();
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
                
                const outputs = Array.from(midiAccess.outputs.values());
                console.log('🎹 MIDI access granted, found outputs:', outputs.length);
                
                outputs.forEach((output, index) => {
                    console.log(`${index}: ${output.name} (${output.manufacturer}) - State: ${output.state}`);
                });
                
                if (outputs.length > 0) {
                    let preferredOutput = outputs.find(output => output.name.includes('IAC Driver'));
                    if (!preferredOutput) {
                        preferredOutput = outputs.find(output => output.name.includes('Logic Pro Virtual'));
                    }
                    
                    if (preferredOutput) {
                        this.midiOutput = preferredOutput;
                        console.log(`✓ Framework using MIDI output: ${preferredOutput.name}`);
                        
                        // Open the MIDI port
                        if (preferredOutput.connection === 'closed') {
                            await preferredOutput.open();
                            console.log(`🔧 MIDI port opened: ${preferredOutput.state}, connection: ${preferredOutput.connection}`);
                        }
                    }
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
                    preserveDrawingBuffer: true
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
        
        // Position camera to frame the object 
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 0.9; // Close-up view for detailed inspection
        
        // Create a copy of the camera for this individual
        const camera = this.shared3D.camera.clone();
        camera.aspect = canvas.width / canvas.height;
        camera.updateProjectionMatrix();
        
        // Add rotation based on time for animation
        const time = Date.now() * 0.001;
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

        // Load-PNG-to-individual chrome
        this.loadPngBtn = document.getElementById('load-png-btn');
        this.loadPngInput = document.getElementById('load-png-input');
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

        // Lightbox save: explicit button (works on mobile + desktop), plus
        // right-click / long-press on the zoomed canvas as a bonus affordance.
        if (this.lightboxSave) this.lightboxSave.addEventListener('click', () => this.saveCurrentImage());
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
            if (e.key === 'Escape') { this.closeZoom(); closeDrawer(); this.exitPlacementMode(); }
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
                    this.loadIndividualFromPNG(e.target.files[0]);
                }
                this.loadPngInput.value = ''; // allow re-loading the same file
            });
        }
        if (this.placeCancel) this.placeCancel.addEventListener('click', () => this.exitPlacementMode());

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
                if (individual._animationRunning) {
                    individual._animationRunning = false;
                }
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
        if (this.lightboxInfo) this.lightboxInfo.innerHTML = individual.describe();
        this.lightbox.classList.add('open');
    }

    closeZoom() {
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

    // ---- Load a saved PNG back into an individual --------------------------
    // Reads the embedded genome (see ImageSave.js), reconstructs the individual,
    // verifies it actually reproduces, then lets the user place it on the grid.
    async loadIndividualFromPNG(file) {
        if (!file || !window.ImageSave) return;
        let meta;
        try {
            meta = await window.ImageSave.readMetadataFromFile(file);
        } catch (err) {
            console.warn('PNG read failed:', err);
            this.showToast('Could not read that PNG');
            return;
        }
        if (!meta || meta.app !== 'Anemone' || !meta.type || meta.genome == null) {
            this.showToast('No Anemone individual found in that PNG');
            return;
        }
        // Cross-type load is refused: a mixed-type population would break the
        // EA's crossover (different types have incompatible PTO traces).
        if (meta.type !== this.individualClass.name) {
            this.showToast(`That PNG is a ${meta.type}; current run is ${this.individualClass.name}`);
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
    
    // Map of individual type names → constructors. Shared by the type selector
    // and the load-PNG path (which needs to look a type up by its saved name).
    individualTypeMap() {
        return {
            'PatternIndividual': PatternIndividual,
            'PatternGrammarIndividual': PatternGrammarIndividual,
            'PolarCurveIndividual': PolarCurveIndividual,
            'ShapesIndividual': ShapesIndividual,
            'GridIndividual': GridIndividual,
            'AnemoneIndividual': AnemoneIndividual,
            'SuperShapeIndividual': SuperShapeIndividual,
            'SuperShape3DIndividual': SuperShape3DIndividual,
            'RobotIndividual': RobotIndividual,
            'PenroseIndividual': PenroseIndividual,
            'SheepIndividual': SheepIndividual,
            'MelodyIndividual': MelodyIndividual,
            'MouseMusicIndividual': MouseMusicIndividual,
            'EEGSonificationIndividual': EEGSonificationIndividual
        };
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
        // Create animation function for this individual using shared scene
        const animate = () => {
            if (individual._animationRunning && individual.is3D && individual.is3D() && this.shared3D) {
                // Get the mesh for this individual from shared scene
                const mesh = this.shared3D.meshes.get(individual.id);
                if (mesh) {
                    this.renderMeshToCanvas(canvas, individual.id, mesh);
                }
                requestAnimationFrame(animate);
            }
        };
        
        // Start animation if not already running
        if (!individual._animationRunning) {
            individual._animationRunning = true;
            animate();
        }
    }
    
    animate3D(individual) {
        // Legacy animation method for backwards compatibility
        this.animate3DWithSharedScene(individual, null);
    }
}
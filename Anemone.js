class InteractiveEAFramework {
    constructor(individualClass = BinaryPatternIndividual) {
        this.individualClass = individualClass;
        this.midiOutput = null;
        this.audioContext = null;
        
        // Framework settings
        this.settings = {
            colorPalette: 'viridis'
        };
        
        // Extension system
        this.extensions = {};
        this.uiExtensions = [];
        
        // Shared 3D resources for WebGL context management
        this.shared3D = null;
        
        // Initialize MIDI first
        this.initializeMIDI().then(() => {
            this.ea = new EvolutionaryAlgorithm(individualClass, 16, this.midiOutput);
            this.initializeShared3D();
            this.loadExtensions();
            this.setupUI();
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
                        
                        // Test MIDI
                        console.log('🧪 Framework testing MIDI...');
                        preferredOutput.send([0x90, 60, 100]);
                        setTimeout(() => {
                            preferredOutput.send([0x80, 60, 0]);
                            console.log('🧪 Framework MIDI test complete');
                        }, 500);
                    }
                }
            } catch (error) {
                console.error('❌ MIDI initialization failed:', error);
            }
        } else {
            console.log('Web MIDI API not supported');
        }
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
            // Brighter ambient light for overall illumination
            const ambientLight = new THREE.AmbientLight(0x404040, 0.8); // Increased from 0.6 to 0.8
            this.shared3D.scene.add(ambientLight);
            
            // Main directional light from top-right
            const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
            directionalLight1.position.set(20, 20, 20);
            directionalLight1.castShadow = true;
            this.shared3D.scene.add(directionalLight1);
            
            // Secondary directional light from opposite side to reduce dark areas
            const directionalLight2 = new THREE.DirectionalLight(0x8888ff, 0.4);
            directionalLight2.position.set(-15, 10, -15);
            this.shared3D.scene.add(directionalLight2);
            
            // Fill light from below to reduce harsh shadows
            const fillLight = new THREE.DirectionalLight(0xffaa88, 0.3);
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
        
        // Copy lighting from shared scene to temp scene
        tempScene.add(new THREE.AmbientLight(0x404040, 0.8));
        
        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
        directionalLight1.position.set(20, 20, 20);
        tempScene.add(directionalLight1);
        
        const directionalLight2 = new THREE.DirectionalLight(0x8888ff, 0.4);
        directionalLight2.position.set(-15, 10, -15);
        tempScene.add(directionalLight2);
        
        const fillLight = new THREE.DirectionalLight(0xffaa88, 0.3);
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
        // Check if the individual class has framework extensions
        if (this.individualClass.getFrameworkExtensions) {
            const extensions = this.individualClass.getFrameworkExtensions();
            
            // Load UI extensions
            if (extensions.ui) {
                const uiExtension = new extensions.ui(this);
                this.uiExtensions.push(uiExtension);
            }
            
            // Load settings extensions
            if (extensions.settings) {
                extensions.settings.forEach(setting => {
                    if (!(setting in this.settings)) {
                        this.settings[setting] = null;
                    }
                });
            }
            
            // Load hotkeys (for future implementation)
            if (extensions.hotkeys) {
                this.extensions.hotkeys = extensions.hotkeys;
            }
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
    
    setupUI() {
        this.grid = document.getElementById('grid');
        this.evolveBtn = document.getElementById('evolve-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.selectedCount = document.getElementById('selected-count');
        this.generationSpan = document.getElementById('generation');
        this.populationSizeSpan = document.getElementById('population-size');
        this.avgFitnessSpan = document.getElementById('avg-fitness');
        this.historyList = document.getElementById('history-list');
        
        this.evolveBtn.addEventListener('click', () => {
            console.time('Full Evolution Process');
            
            console.time('Cleanup');
            this.cleanupOldIndividuals();
            console.timeEnd('Cleanup');
            
            console.time('EA Evolve');
            this.ea.evolve();
            console.timeEnd('EA Evolve');
            
            console.time('Render');
            this.render();
            console.timeEnd('Render');
            
            console.timeEnd('Full Evolution Process');
        });
        
        this.resetBtn.addEventListener('click', () => {
            this.cleanupOldIndividuals();
            this.ea.reset();
            this.render();
        });
        
        // Individual type switching
        this.individualTypeSelect = document.getElementById('individual-type-select');
        this.switchIndividualTypeBtn = document.getElementById('switch-individual-type-btn');
        
        // Set current individual type in selector
        this.updateIndividualTypeSelector();
        
        this.switchIndividualTypeBtn.addEventListener('click', () => {
            this.switchIndividualType();
        });
        
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
                if (individual._animationRunning) {
                    individual._animationRunning = false;
                }
            });
        }
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
            
            const fitness = document.createElement('div');
            fitness.className = 'fitness';
            fitness.textContent = individual.fitness.toFixed(0);
            
            div.appendChild(canvas);
            div.appendChild(fitness);
            
            div.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Individual clicked:', individual.id);
                console.log('Phenotype:', individual.getPhenotype());
                this.ea.incrementFitness(individual);
                
                // Update visual selection state
                if (individual.selected) {
                    div.classList.add('selected');
                } else {
                    div.classList.remove('selected');
                }
                
                // Update fitness display
                fitness.textContent = individual.fitness.toFixed(0);
                
                // Update info panel only
                this.renderInfo();
                
                // If this is a music individual, play it
                if (individual.playMIDI) {
                    console.log('Calling playMIDI on individual');
                    // Pass MIDI output to individual if it needs it
                    if (individual.setMidiOutput) {
                        individual.setMidiOutput(this.midiOutput);
                    }
                    individual.playMIDI();
                } else {
                    console.log('Individual does not have playMIDI method');
                }
            });
            
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.ea.decrementFitness(individual);
                
                // Update visual selection state
                if (individual.selected) {
                    div.classList.add('selected');
                } else {
                    div.classList.remove('selected');
                }
                
                // Update fitness display
                fitness.textContent = individual.fitness.toFixed(0);
                
                // Update info panel only
                this.renderInfo();
            });
            
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
        
        console.timeEnd('renderGrid');
    }
    
    renderInfo() {
        this.selectedCount.textContent = this.ea.selectedIndividuals.length;
        this.generationSpan.textContent = this.ea.generation;
        this.populationSizeSpan.textContent = this.ea.populationSize;
        this.avgFitnessSpan.textContent = this.ea.getAverageFitness().toFixed(2);
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
    
    switchIndividualType() {
        const selectedType = this.individualTypeSelect.value;
        
        // Map of individual type names to their constructors
        const individualTypes = {
            'GPPatternIndividual': GPPatternIndividual,
            'GrammaticalEvolutionIndividual': GrammaticalEvolutionIndividual,
            'GERadiusDrawingIndividual': GERadiusDrawingIndividual,
            'DrawingCommandIndividual': DrawingCommandIndividual,
            'BinaryPatternIndividual': BinaryPatternIndividual,
            'CreatureIndividual': CreatureIndividual,
            'SuperFormulaIndividual': SuperFormulaIndividual,
            'SuperFormula3DIndividual': SuperFormula3DIndividual,
            'CharacterIndividual': CharacterIndividual,
            'MusicIndividual': MusicIndividual,
            'DAGIndividual': DAGIndividual
        };
        
        const NewIndividualClass = individualTypes[selectedType];
        
        if (NewIndividualClass && NewIndividualClass !== this.individualClass) {
            console.log(`Switching to individual type: ${selectedType}`);
            
            // Clean up current individuals
            this.cleanupOldIndividuals();
            
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
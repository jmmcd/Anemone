// Shared3D — the one THREE.Scene/WebGLRenderer shared by all 3D individuals
// (WebGL context management), plus mesh add/remove/dispose, camera framing +
// supersampled render-to-canvas, and the per-tile 3D animation loop.
//
// Partial class: these methods are authored here but merged onto
// InteractiveEAFramework.prototype (below), so `this` is the framework instance
// and every call site (this.foo(), framework.foo()) is unchanged. Loaded after
// framework/Anemone.js. See CLAUDE.md > Project Layout.
(function () {
    const ext = class {
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

            // Dispose geometry and materials. traverse() covers both a bare Mesh
            // and a Group of meshes (e.g. Jenn's opaque-struts + transparent-faces
            // pair), whose geometry/material live on the children, not the group.
            existingMesh.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
                }
            });

            this.shared3D.meshes.delete(individualId);
        }
    }
    
    // Render specific mesh to canvas using shared renderer
    renderMeshToCanvas(canvas, individualId, mesh) {
        if (!this.shared3D || !this.shared3D.renderer) return;
        
        // Create temporary scene for this individual mesh only. Background is
        // black by default, but an individual can request another (Jenn's glass
        // faces read far better over a light background) by stashing a colour on
        // its mesh/group userData in visualize().
        const tempScene = new THREE.Scene();
        const bg = (mesh.userData && mesh.userData.background3D != null) ? mesh.userData.background3D : 0x000000;
        tempScene.background = new THREE.Color(bg);
        
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

        let maxDim = Math.max(size.x, size.y, size.z);

        // Robust framing override (currently the Jenn polytopes): a stereographic
        // projection can fling a few vertices far out, so the true bounding box is
        // dominated by outliers and the camera zooms out, shrinking the interesting
        // core to a corner. An individual can instead publish a robust centre+radius
        // (over its own inliers) via userData; we frame on that so the core fills the
        // view and the outliers spill off-screen.
        if (mesh.userData && mesh.userData.framingRadius) {
            const fc = mesh.userData.framingCenter || [center.x, center.y, center.z];
            center.set(fc[0], fc[1], fc[2]);
            maxDim = mesh.userData.framingRadius * 2;
        }

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
        
        // Supersample: render at ss× the canvas resolution, then let the 2D
        // drawImage below downscale it. This is cheap anti-aliasing (more
        // fragments, same geometry) on top of the renderer's MSAA — it smooths the
        // stair-stepped silhouettes of edge-heavy meshes (e.g. the Jenn polytopes),
        // whose tiles otherwise rasterise at only 128px. Benefits every 3D type.
        const ss = this.superSample3D || 2;
        this.shared3D.renderer.setSize(canvas.width * ss, canvas.height * ss, false);

        // Render temp scene (with only this mesh) to shared renderer
        this.shared3D.renderer.render(tempScene, camera);

        // Copy rendered content to the individual's canvas, downsampling the
        // supersampled buffer (imageSmoothingEnabled makes the shrink anti-alias).
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
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
    };
    const descriptors = Object.getOwnPropertyDescriptors(ext.prototype);
    delete descriptors.constructor;
    Object.defineProperties(InteractiveEAFramework.prototype, descriptors);
})();

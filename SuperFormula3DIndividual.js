class SuperFormula3DIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.genomeLength = 14; // 14 parameters: 7 for r1(θ), 7 for r2(φ) - each with separate m_num, m_den
        this.genome = genome || this.generateRandomGenome();
        this.thetaPoints = 50; // Number of points along polar angle
        this.phiPoints = 100; // Number of points along azimuthal angle
        // Three.js resources now managed by shared scene - no individual context needed
    }
    
    generateRandomGenome() {
        // Generate 14 parameters: 7 for r1(θ), 7 for r2(φ)
        const params = [];
        
        // r1 parameters (for polar angle θ)
        params.push(Math.floor(Math.random() * 20) + 1);    // m1_numerator: 1-20 (integer)
        params.push(this.generateDenominator());             // m1_denominator: reasonable values (integer)
        params.push(Math.random() * 10 + 0.1);              // n1_1: 0.1-10.1
        params.push(Math.random() * 10 + 0.1);              // n2_1: 0.1-10.1
        params.push(Math.random() * 10 + 0.1);              // n3_1: 0.1-10.1
        params.push(Math.random() * 3 + 0.1);               // a1: 0.1-3.1
        params.push(Math.random() * 3 + 0.1);               // b1: 0.1-3.1
        
        // r2 parameters (for azimuthal angle φ)
        params.push(Math.floor(Math.random() * 20) + 1);    // m2_numerator: 1-20 (integer)
        params.push(this.generateDenominator());             // m2_denominator: reasonable values (integer)
        params.push(Math.random() * 10 + 0.1);              // n1_2: 0.1-10.1
        params.push(Math.random() * 10 + 0.1);              // n2_2: 0.1-10.1
        params.push(Math.random() * 10 + 0.1);              // n3_2: 0.1-10.1
        params.push(Math.random() * 3 + 0.1);               // a2: 0.1-3.1
        params.push(Math.random() * 3 + 0.1);               // b2: 0.1-3.1
        
        return params;
    }
    
    generateDenominator() {
        // Generate reasonable denominators for m = numerator/denominator
        const denominators = [1, 2, 3, 4, 5, 6, 8, 10, 12];
        return denominators[Math.floor(Math.random() * denominators.length)];
    }
    
    getParameters() {
        // Extract parameters from genome: [m1_num, m1_den, n1_1, n2_1, n3_1, a1, b1, m2_num, m2_den, n1_2, n2_2, n3_2, a2, b2]
        
        // r1 parameters (for polar angle θ)
        const m1_numerator = Math.max(1, Math.min(50, Math.round(this.genome[0])));
        const m1_denominator = Math.max(1, Math.min(12, Math.round(this.genome[1])));
        
        const r1Params = {
            m_numerator: m1_numerator,
            m_denominator: m1_denominator,
            m: m1_numerator / m1_denominator,
            n1: Math.max(0.01, Math.min(20, this.genome[2])),
            n2: Math.max(0.01, Math.min(20, this.genome[3])),
            n3: Math.max(0.01, Math.min(20, this.genome[4])),
            a: Math.max(0.01, Math.min(5, this.genome[5])),
            b: Math.max(0.01, Math.min(5, this.genome[6]))
        };
        
        // r2 parameters (for azimuthal angle φ)
        const m2_numerator = Math.max(1, Math.min(50, Math.round(this.genome[7])));
        const m2_denominator = Math.max(1, Math.min(12, Math.round(this.genome[8])));
        
        const r2Params = {
            m_numerator: m2_numerator,
            m_denominator: m2_denominator,
            m: m2_numerator / m2_denominator,
            n1: Math.max(0.01, Math.min(20, this.genome[9])),
            n2: Math.max(0.01, Math.min(20, this.genome[10])),
            n3: Math.max(0.01, Math.min(20, this.genome[11])),
            a: Math.max(0.01, Math.min(5, this.genome[12])),
            b: Math.max(0.01, Math.min(5, this.genome[13]))
        };
        
        return { r1: r1Params, r2: r2Params };
    }
    
    // Gielis superformula calculation
    calculateRadius(angle, params) {
        const { m, n1, n2, n3, a, b } = params;
        
        try {
            // Calculate the angle component
            const angleComponent = (m * angle) / 4.0;
            
            // Calculate the trigonometric components
            const cosValue = Math.cos(angleComponent);
            const sinValue = Math.sin(angleComponent);
            
            // Apply absolute value and scaling
            const cosComponent = Math.abs(cosValue / a);
            const sinComponent = Math.abs(sinValue / b);
            
            // Prevent zero values
            const minComponent = 1e-10;
            const safeCosComponent = Math.max(cosComponent, minComponent);
            const safeSinComponent = Math.max(sinComponent, minComponent);
            
            // Calculate the powers
            const cosPower = Math.pow(safeCosComponent, n2);
            const sinPower = Math.pow(safeSinComponent, n3);
            
            // Calculate the sum
            const sum = cosPower + sinPower;
            
            // Prevent zero or negative values
            if (sum <= 0 || !isFinite(sum)) {
                return 0.1;
            }
            
            // Calculate the final radius
            const radius = Math.pow(sum, -1.0 / n1);
            
            // Final safety checks
            if (!isFinite(radius) || radius <= 0) {
                return 0.1;
            }
            
            return radius; // Remove maxRadius clamp
            
        } catch (error) {
            return 0.1;
        }
    }
    
    calculateAngleRange(m_numerator, m_denominator) {
        // Same formula as 2D: φRange = 8πq/gcd(p,4q)
        const p = Math.round(m_numerator);
        const q = Math.round(m_denominator);
        const gcd_p_4q = this.gcd(p, 4 * q);
        return (8 * Math.PI * q) / gcd_p_4q;
    }
    
    gcd(a, b) {
        while (b !== 0) {
            const temp = b;
            b = a % b;
            a = temp;
        }
        return Math.abs(a);
    }

    generate3DPoints() {
        const params = this.getParameters();
        const vertices = [];
        const indices = [];
        const colors = [];
        
        // Get palette for coloring
        const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
        const palette = this.getPaletteByName(paletteName);
        
        // Calculate proper angle ranges for both angles
        const thetaRange = this.calculateAngleRange(params.r1.m_numerator, params.r1.m_denominator);
        const phiRange = this.calculateAngleRange(params.r2.m_numerator, params.r2.m_denominator);
        
        // Generate vertices using spherical coordinates with proper ranges
        for (let i = 0; i <= this.thetaPoints; i++) {
            const theta = (i / this.thetaPoints) * Math.min(thetaRange, Math.PI); // Clamp theta to π for proper sphere
            const r1 = this.calculateRadius(theta, params.r1);
            
            for (let j = 0; j <= this.phiPoints; j++) {
                const phi = (j / this.phiPoints) * phiRange; // Use full calculated range
                const r2 = this.calculateRadius(phi, params.r2);
                
                // Combined radius using 3D superformula: r(θ,φ) = r1(θ) × r2(φ)
                const r = r1 * r2;
                
                // Convert spherical to Cartesian coordinates with Y as vertical axis
                const x = r * Math.sin(theta) * Math.cos(phi);
                const y = r * Math.cos(theta);  // Y-axis is now the radial symmetry axis (up)
                const z = r * Math.sin(theta) * Math.sin(phi);
                
                vertices.push(x, y, z);
                
                // Color based on position for variety
                const colorT = (i / this.thetaPoints + j / this.phiPoints) / 2;
                const color = this.interpolateColor(palette, colorT);
                colors.push(color.r / 255, color.g / 255, color.b / 255);
            }
        }
        
        // Generate indices for triangular faces
        for (let i = 0; i < this.thetaPoints; i++) {
            for (let j = 0; j < this.phiPoints; j++) {
                const current = i * (this.phiPoints + 1) + j;
                const next = current + this.phiPoints + 1;
                
                // Create two triangles per quad
                indices.push(current, next, current + 1);
                indices.push(next, next + 1, current + 1);
            }
        }
        
        return { vertices, indices, colors };
    }
    
    visualize(canvas) {
        // Check if framework has shared 3D resources
        const framework = window.framework; // Assuming global framework reference
        
        if (framework && framework.shared3D) {
            this.visualizeWithShared3D(canvas, framework);
        } else {
            // Fallback to 2D canvas projection if shared 3D not available
            this.render2DProjection(canvas);
        }
    }
    
    visualizeWithShared3D(canvas, framework) {
        // Generate mesh data
        const { vertices, indices, colors } = this.generate3DPoints();
        
        // Create Three.js geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Create material
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            shininess: 100
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Add mesh to shared scene
        framework.addMeshToScene(this.id, mesh);
        
        // Render mesh to canvas
        framework.renderMeshToCanvas(canvas, this.id, mesh);
    }
    
    render2DProjection(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        // Get palette
        const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
        const palette = this.getPaletteByName(paletteName);
        
        // Fill background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        
        // Generate 3D points
        const { vertices, colors } = this.generate3DPoints();
        
        // Simple 3D to 2D projection
        const time = Date.now() * 0.001; // For rotation
        const projectedPoints = [];
        
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];
            
            // Rotate the point
            const rotY = time * 0.5;
            const rotX = time * 0.3;
            
            // Rotation matrices
            const cosY = Math.cos(rotY);
            const sinY = Math.sin(rotY);
            const cosX = Math.cos(rotX);
            const sinX = Math.sin(rotX);
            
            // Apply Y rotation
            const x1 = x * cosY - z * sinY;
            const z1 = x * sinY + z * cosY;
            
            // Apply X rotation
            const y2 = y * cosX - z1 * sinX;
            const z2 = y * sinX + z1 * cosX;
            
            // Perspective projection
            const distance = 15;
            const focal = 500;
            
            if (z2 + distance > 0.1) {
                const screenX = (x1 * focal) / (z2 + distance) + width / 2;
                const screenY = (y2 * focal) / (z2 + distance) + height / 2;
                const depth = z2 + distance;
                
                projectedPoints.push({
                    x: screenX,
                    y: screenY,
                    z: depth,
                    colorR: colors[i / 3 * 3] * 255,
                    colorG: colors[i / 3 * 3 + 1] * 255,
                    colorB: colors[i / 3 * 3 + 2] * 255
                });
            }
        }
        
        // Sort by depth (painter's algorithm)
        projectedPoints.sort((a, b) => b.z - a.z);
        
        // Draw points
        projectedPoints.forEach(point => {
            if (point.x >= 0 && point.x < width && point.y >= 0 && point.y < height) {
                const size = Math.max(1, 4 - point.z * 0.1);
                ctx.fillStyle = `rgb(${Math.round(point.colorR)}, ${Math.round(point.colorG)}, ${Math.round(point.colorB)})`;
                ctx.beginPath();
                ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }
    
    // Cleanup method - removes this individual's mesh from shared scene
    cleanup() {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            framework.removeMeshFromScene(this.id);
        }
    }
    
    // Legacy methods removed - now using shared Three.js scene
    // Individual Three.js initialization, mesh management, and cleanup 
    // are now handled by the InteractiveEAFramework's shared scene system
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                
                switch (i) {
                    case 0: // m1_numerator (integer mutation)
                    case 7: // m2_numerator (integer mutation)
                        const numeratorDelta = Math.floor(Math.random() * 7) - 3; // -3 to +3
                        this.genome[i] = Math.max(1, Math.min(50, 
                            Math.round(this.genome[i]) + numeratorDelta
                        ));
                        break;
                    case 1: // m1_denominator (integer mutation)
                    case 8: // m2_denominator (integer mutation)
                        this.genome[i] = this.generateDenominator();
                        break;
                    case 2: case 3: case 4: // r1: n1, n2, n3
                    case 9: case 10: case 11: // r2: n1, n2, n3
                        const noise = this.gaussianRandom(0, 1);
                        this.genome[i] = Math.max(0.01, Math.min(20, 
                            this.genome[i] + noise * 0.5
                        ));
                        break;
                    case 5: case 6: // r1: a, b
                    case 12: case 13: // r2: a, b
                        const scaleNoise = this.gaussianRandom(0, 1);
                        this.genome[i] = Math.max(0.01, Math.min(5, 
                            this.genome[i] + scaleNoise * 0.2
                        ));
                        break;
                }
            }
        }
        this.invalidateImageCache();
    }
    
    gaussianRandom(mean = 0, stdDev = 1) {
        if (this._spare !== undefined) {
            const spare = this._spare;
            delete this._spare;
            return spare * stdDev + mean;
        }
        
        const u = Math.random();
        const v = Math.random();
        const mag = stdDev * Math.sqrt(-2.0 * Math.log(u));
        const z0 = mag * Math.cos(2.0 * Math.PI * v) + mean;
        const z1 = mag * Math.sin(2.0 * Math.PI * v) + mean;
        
        this._spare = z1;
        return z0;
    }
    
    crossover(other) {
        const child1Genome = [];
        const child2Genome = [];
        
        for (let i = 0; i < this.genome.length; i++) {
            
            switch (i) {
                case 0: case 7: // m_numerator (integer crossover)
                    if (Math.random() < 0.5) {
                        child1Genome.push(Math.max(1, Math.min(50, Math.round(this.genome[i]))));
                        child2Genome.push(Math.max(1, Math.min(50, Math.round(other.genome[i]))));
                    } else {
                        child1Genome.push(Math.max(1, Math.min(50, Math.round(other.genome[i]))));
                        child2Genome.push(Math.max(1, Math.min(50, Math.round(this.genome[i]))));
                    }
                    break;
                case 1: case 8: // m_denominator (integer crossover)
                    if (Math.random() < 0.5) {
                        child1Genome.push(Math.round(this.genome[i]));
                        child2Genome.push(Math.round(other.genome[i]));
                    } else {
                        child1Genome.push(Math.round(other.genome[i]));
                        child2Genome.push(Math.round(this.genome[i]));
                    }
                    break;
                case 2: case 3: case 4: // r1: n1, n2, n3
                case 9: case 10: case 11: // r2: n1, n2, n3
                    const alpha_n = Math.random();
                    const value1_n = alpha_n * this.genome[i] + (1 - alpha_n) * other.genome[i];
                    const value2_n = (1 - alpha_n) * this.genome[i] + alpha_n * other.genome[i];
                    child1Genome.push(Math.max(0.01, Math.min(20, value1_n)));
                    child2Genome.push(Math.max(0.01, Math.min(20, value2_n)));
                    break;
                case 5: case 6: // r1: a, b
                case 12: case 13: // r2: a, b
                    const alpha_scale = Math.random();
                    const value1_scale = alpha_scale * this.genome[i] + (1 - alpha_scale) * other.genome[i];
                    const value2_scale = (1 - alpha_scale) * this.genome[i] + alpha_scale * other.genome[i];
                    child1Genome.push(Math.max(0.01, Math.min(5, value1_scale)));
                    child2Genome.push(Math.max(0.01, Math.min(5, value2_scale)));
                    break;
            }
        }
        
        const child1 = new SuperFormula3DIndividual(child1Genome);
        const child2 = new SuperFormula3DIndividual(child2Genome);
        
        return [child1, child2];
    }
    
    clone() {
        const clone = new SuperFormula3DIndividual([...this.genome]);
        clone.fitness = this.fitness;
        return clone;
    }
    
    getPhenotype() {
        const params = this.getParameters();
        const thetaRange = this.calculateAngleRange(params.r1.m_numerator, params.r1.m_denominator);
        const phiRange = this.calculateAngleRange(params.r2.m_numerator, params.r2.m_denominator);
        return `r1(θ): m=${params.r1.m_numerator}/${params.r1.m_denominator} (${params.r1.m.toFixed(2)}), θRange=${(thetaRange / Math.PI).toFixed(1)}π | r2(φ): m=${params.r2.m_numerator}/${params.r2.m_denominator} (${params.r2.m.toFixed(2)}), φRange=${(phiRange / Math.PI).toFixed(1)}π`;
    }
    
    // Check if this is a 3D individual
    is3D() {
        return true;
    }
}
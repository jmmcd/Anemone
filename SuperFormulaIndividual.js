class SuperFormulaIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.genomeLength = 7; // 7 parameters: m_numerator, m_denominator, n1, n2, n3, a, b
        this.genome = genome || this.generateRandomGenome();
        this.numPoints = 1000; // Number of points to sample around the curve
        this.phiRange = 2 * Math.PI; // Default φ range (0 to 2π)
    }
    
    generateRandomGenome() {
        // Generate 7 parameters: m_numerator (int), m_denominator (int), n1, n2, n3, a, b (reals)
        return [
            Math.floor(Math.random() * 20) + 1,    // m_numerator: 1-20 (integer)
            this.generateDenominator(),             // m_denominator: reasonable values (integer)
            Math.random() * 10 + 0.1,              // n1: 0.1-10.1 (overall shape)
            Math.random() * 10 + 0.1,              // n2: 0.1-10.1 (cos component)
            Math.random() * 10 + 0.1,              // n3: 0.1-10.1 (sin component)
            Math.random() * 3 + 0.1,               // a: 0.1-3.1 (x-axis scaling)
            Math.random() * 3 + 0.1                // b: 0.1-3.1 (y-axis scaling)
        ];
    }
    
    generateDenominator() {
        // Generate reasonable denominators for m = numerator/denominator
        const denominators = [1, 2, 3, 4, 5, 6, 8, 10, 12];
        return denominators[Math.floor(Math.random() * denominators.length)];
    }
    
    getParameters() {
        // Extract parameters from genome: [m_numerator, m_denominator, n1, n2, n3, a, b]
        const [m_numerator, m_denominator, n1, n2, n3, a, b] = this.genome;
        
        // Ensure integers are valid
        const num = Math.max(1, Math.min(50, Math.round(m_numerator)));
        const den = Math.max(1, Math.min(12, Math.round(m_denominator)));
        
        return {
            m_numerator: num,
            m_denominator: den,
            m: num / den,                            // computed m value
            n1: Math.max(0.01, Math.min(20, n1)),    // n1: 0.01-20 (overall shape)
            n2: Math.max(0.01, Math.min(20, n2)),    // n2: 0.01-20 (cos component)
            n3: Math.max(0.01, Math.min(20, n3)),    // n3: 0.01-20 (sin component)
            a: Math.max(0.01, Math.min(5, a)),       // a: 0.01-5 (x-axis scaling)
            b: Math.max(0.01, Math.min(5, b))        // b: 0.01-5 (y-axis scaling)
        };
    }
    
    // Gielis superformula: r(φ) = [|cos(mφ/4)/a|^n2 + |sin(mφ/4)/b|^n3]^(-1/n1)
    calculateRadius(phi, params) {
        const { m, n1, n2, n3, a, b } = params;
        
        try {
            
            // Calculate the angle component - the key is m*phi/4
            const angle = (m * phi) / 4.0;
            
            // Calculate the trigonometric components
            const cosValue = Math.cos(angle);
            const sinValue = Math.sin(angle);
            
            // Apply absolute value and scaling
            const cosComponent = Math.abs(cosValue / a);
            const sinComponent = Math.abs(sinValue / b);
            
            // Prevent zero values that cause issues
            const minComponent = 1e-10;
            const safeCosComponent = Math.max(cosComponent, minComponent);
            const safeSinComponent = Math.max(sinComponent, minComponent);
            
            // Calculate the powers with safety checks
            let cosPower, sinPower;
            
            if (n2 === 0) {
                cosPower = 1;
            } else {
                cosPower = Math.pow(safeCosComponent, n2);
            }
            
            if (n3 === 0) {
                sinPower = 1;
            } else {
                sinPower = Math.pow(safeSinComponent, n3);
            }
            
            // Calculate the sum
            const sum = cosPower + sinPower;
            
            // Prevent zero or negative values
            if (sum <= 0 || !isFinite(sum)) {
                console.log(`Invalid radius calculated for phi=${phi}: ${radius}`);
                return 0.1;
            }
            
            // Calculate the final radius with safety check for n1
            let radius;
            if (n1 === 0) {
                radius = 1.0;
            } else {
                radius = Math.pow(sum, -1.0 / n1);
            }
            
            // Final safety checks
            if (!isFinite(radius) || radius <= 0) {
                console.log(`Invalid radius calculated for phi=${phi}: ${radius}`);
                return 0.1;
            }
            
            return radius; 
            
        } catch (error) {
            // Return a safe default if calculation fails
            console.log(`Error calculating radius for phi=${phi}:`, error);
            return 0.1;
        }
    }
    
    generatePolarPoints() {
        const params = this.getParameters();
        const points = [];
        
        // Calculate proper φ range using the separate denominator value
        this.phiRange = this.calculatePhiRange(params.m_denominator);
        
        // Generate points from 0 to phiRange, ensuring proper closure
        for (let i = 0; i < this.numPoints; i++) {
            const phi = (i / this.numPoints) * this.phiRange;
            const radius = this.calculateRadius(phi, params);
            
            // Convert to Cartesian coordinates
            const x = radius * Math.cos(phi);
            const y = radius * Math.sin(phi);
            
            points.push({ x, y, phi, radius });
        }
        
        
        return points;
    }
    
    calculatePhiRange(denominator) {
        const params = this.getParameters();
        const p = Math.round(params.m_numerator);
        const q = Math.round(denominator);
        
        // For m = p/q and the superformula using mφ/4:
        // We need mφ/4 to complete full cycles. For closure, we need:
        // φ = 8πq/gcd(p,4q) to ensure both numerator and denominator align properly
        
        const gcd_p_4q = this.gcd(p, 4 * q);
        const phiRange = (8 * Math.PI * q) / gcd_p_4q;
        
        return phiRange;
    }
    
    lcm(a, b) {
        return Math.abs(a * b) / this.gcd(a, b);
    }
    
    gcd(a, b) {
        while (b !== 0) {
            const temp = b;
            b = a % b;
            a = temp;
        }
        return Math.abs(a);
    }
    
    visualize(canvas) {
        this.visualizeWithCache(canvas, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Get palette from framework settings
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            const palette = this.getPaletteByName(paletteName);
            
            // Background color (dark)
            const backgroundColor = this.interpolateColor(palette, 0);
            
            // Fill background
            for (let i = 0; i < data.length; i += 4) {
                data[i] = backgroundColor.r;
                data[i + 1] = backgroundColor.g;
                data[i + 2] = backgroundColor.b;
                data[i + 3] = 255;
            }
            
            // Generate the superformula points
            const points = this.generatePolarPoints();
            
            if (points.length === 0) {
                return imageData;
            }
            
            // Find bounding box for scaling
            const xCoords = points.map(p => p.x);
            const yCoords = points.map(p => p.y);
            const minX = Math.min(...xCoords);
            const maxX = Math.max(...xCoords);
            const minY = Math.min(...yCoords);
            const maxY = Math.max(...yCoords);
            
            // Calculate scaling and centering
            const margin = 20;
            const drawWidth = maxX - minX;
            const drawHeight = maxY - minY;
            
            let scale = 1;
            if (drawWidth > 0 && drawHeight > 0) {
                scale = Math.min(
                    (width - 2 * margin) / drawWidth,
                    (height - 2 * margin) / drawHeight
                );
            }
            
            const offsetX = (width - drawWidth * scale) / 2 - minX * scale;
            const offsetY = (height - drawHeight * scale) / 2 - minY * scale;
            
            // Draw the shape with gradient colors
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                
                // Use angle for color variation
                const colorT = 0.5 + 0.5 * (p1.phi / this.phiRange); 
                const color = this.interpolateColor(palette, colorT);
                
                // Scale and translate coordinates
                const x1 = p1.x * scale + offsetX;
                const y1 = p1.y * scale + offsetY;
                const x2 = p2.x * scale + offsetX;
                const y2 = p2.y * scale + offsetY;
                
                // Draw line segment
                this.drawLine(data, width, height, x1, y1, x2, y2, color, 2);
            }
            
            // Draw filled shape option (uncomment for filled shapes)
            //this.drawFilledShape(data, width, height, points, scale, offsetX, offsetY, palette);
            
            return imageData;
        });
    }
    
    drawLine(data, width, height, x1, y1, x2, y2, color, lineWidth = 1) {
        // Bresenham's line algorithm with thickness
        x1 = Math.round(x1);
        y1 = Math.round(y1);
        x2 = Math.round(x2);
        y2 = Math.round(y2);
        
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        
        let x = x1;
        let y = y1;
        
        while (true) {
            // Draw a small circle at each point for line thickness
            this.drawCircle(data, width, height, x, y, Math.max(1, lineWidth / 2), color);
            
            if (x === x2 && y === y2) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }
    }
    
    drawCircle(data, width, height, cx, cy, radius, color) {
        const r2 = radius * radius;
        for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius); y++) {
            for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius); x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy <= r2) {
                    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                    if (index >= 0 && index < data.length) {
                        data[index] = color.r;
                        data[index + 1] = color.g;
                        data[index + 2] = color.b;
                        data[index + 3] = 255;
                    }
                }
            }
        }
    }
    
    drawFilledShape(data, width, height, points, scale, offsetX, offsetY, palette) {
        // Alternative: filled shape rendering using scanline algorithm
        const scaledPoints = points.map(p => ({
            x: p.x * scale + offsetX,
            y: p.y * scale + offsetY
        }));
        
        // Find bounding box
        const minY = Math.max(0, Math.min(...scaledPoints.map(p => p.y)));
        const maxY = Math.min(height, Math.max(...scaledPoints.map(p => p.y)));
        
        // Scanline fill
        for (let y = minY; y < maxY; y++) {
            const intersections = [];
            
            // Find intersections with polygon edges
            for (let i = 0; i < scaledPoints.length - 1; i++) {
                const p1 = scaledPoints[i];
                const p2 = scaledPoints[i + 1];
                
                if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
                    const x = p1.x + (y - p1.y) * (p2.x - p1.x) / (p2.y - p1.y);
                    intersections.push(x);
                }
            }
            
            // Sort intersections
            intersections.sort((a, b) => a - b);
            
            // Fill between pairs of intersections
            for (let i = 0; i < intersections.length - 1; i += 2) {
                const x1 = Math.max(0, Math.floor(intersections[i]));
                const x2 = Math.min(width, Math.ceil(intersections[i + 1]));
                
                for (let x = x1; x < x2; x++) {
                    const colorT = Math.random(); // Random color variation
                    const color = this.interpolateColor(palette, colorT);
                    
                    const index = (Math.floor(y) * width + x) * 4;
                    if (index >= 0 && index < data.length) {
                        data[index] = color.r;
                        data[index + 1] = color.g;
                        data[index + 2] = color.b;
                        data[index + 3] = 255;
                    }
                }
            }
        }
    }
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                
                switch (i) {
                    case 0: // m_numerator (integer mutation)
                        // Integer mutation: +/- 1 to 3
                        const numeratorDelta = Math.floor(Math.random() * 7) - 3; // -3 to +3
                        this.genome[i] = Math.max(1, Math.min(50, 
                            Math.round(this.genome[i]) + numeratorDelta
                        ));
                        break;
                    case 1: // m_denominator (integer mutation)
                        // Replace with new valid denominator
                        this.genome[i] = this.generateDenominator();
                        break;
                    case 2: // n1 (overall shape) - medium mutations
                    case 3: // n2 (cos component)
                    case 4: // n3 (sin component)
                        // Apply Gaussian noise mutation for real-valued parameters
                        const noise = this.gaussianRandom(0, 1);
                        this.genome[i] = Math.max(0.01, Math.min(20, 
                            this.genome[i] + noise * 0.5
                        ));
                        break;
                    case 5: // a (x-axis scaling) - smaller mutations
                    case 6: // b (y-axis scaling)
                        // Apply Gaussian noise mutation for scaling parameters
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
    
    // Generate Gaussian random number using Box-Muller transformation
    gaussianRandom(mean = 0, stdDev = 1) {
        // Use static variables to generate pairs of random numbers
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
            // Apply bounds checking based on parameter type
            switch (i) {
                case 0: // m_numerator (integer crossover)
                    // For integers, use uniform crossover (pick one parent)
                    if (Math.random() < 0.5) {
                        child1Genome.push(Math.max(1, Math.min(50, Math.round(this.genome[i]))));
                        child2Genome.push(Math.max(1, Math.min(50, Math.round(other.genome[i]))));
                    } else {
                        child1Genome.push(Math.max(1, Math.min(50, Math.round(other.genome[i]))));
                        child2Genome.push(Math.max(1, Math.min(50, Math.round(this.genome[i]))));
                    }
                    break;
                case 1: // m_denominator (integer crossover)
                    // For denominators, pick one parent's valid denominator
                    if (Math.random() < 0.5) {
                        child1Genome.push(Math.round(this.genome[i]));
                        child2Genome.push(Math.round(other.genome[i]));
                    } else {
                        child1Genome.push(Math.round(other.genome[i]));
                        child2Genome.push(Math.round(this.genome[i]));
                    }
                    break;
                case 2: // n1 (overall shape)
                case 3: // n2 (cos component)
                case 4: // n3 (sin component)
                    // Use arithmetic crossover with random blending for real values
                    const alpha_n = Math.random();
                    const value1_n = alpha_n * this.genome[i] + (1 - alpha_n) * other.genome[i];
                    const value2_n = (1 - alpha_n) * this.genome[i] + alpha_n * other.genome[i];
                    child1Genome.push(Math.max(0.01, Math.min(20, value1_n)));
                    child2Genome.push(Math.max(0.01, Math.min(20, value2_n)));
                    break;
                case 5: // a (x-axis scaling)
                case 6: // b (y-axis scaling)
                    // Use arithmetic crossover with random blending for scaling
                    const alpha_scale = Math.random();
                    const value1_scale = alpha_scale * this.genome[i] + (1 - alpha_scale) * other.genome[i];
                    const value2_scale = (1 - alpha_scale) * this.genome[i] + alpha_scale * other.genome[i];
                    child1Genome.push(Math.max(0.01, Math.min(5, value1_scale)));
                    child2Genome.push(Math.max(0.01, Math.min(5, value2_scale)));
                    break;
            }
        }
        
        const child1 = new SuperFormulaIndividual(child1Genome);
        const child2 = new SuperFormulaIndividual(child2Genome);
        
        return [child1, child2];
    }
    
    clone() {
        const clone = new SuperFormulaIndividual([...this.genome]);
        clone.fitness = this.fitness;
        return clone;
    }
    
    getPhenotype() {
        const params = this.getParameters();
        return `m=${params.m_numerator}/${params.m_denominator} (${params.m.toFixed(2)}), φRange=${(this.phiRange /
           + Math.PI).toFixed(1)}π, n1=${params.n1.toFixed(3)}, n2=${params.n2.toFixed(3)}, n3=${params.n3.toFixed(3)}, a=${params.a.toFixed(3)}, b=${params.b.toFixed(3)}`;
    }
    
    getParameterInfo() {
        const params = this.getParameters();
        return {
            genome: this.genome,
            parameters: params,
            description: {
                m: 'Rotational symmetry (higher = more petals/sides)',
                n1: 'Overall shape roundness',
                n2: 'Cosine component influence',
                n3: 'Sine component influence', 
                a: 'Horizontal scaling',
                b: 'Vertical scaling'
            }
        };
    }
}
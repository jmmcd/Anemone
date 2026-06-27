/**
 * SuperFormulaIndividual
 *
 * REFACTORED: Uses FloatRepresentation for basic genome operations.
 * Implements custom mutation/crossover due to mixed integer/float genome.
 * Renders Gielis superformula: r(φ) = [|cos(mφ/4)/a|^n2 + |sin(mφ/4)/b|^n3]^(-1/n1)
 */

class SuperFormulaIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');

        // Configure float representation with bounds for each gene
        this.representation = new FloatRepresentation({
            length: 7,
            bounds: [
                {min: 1, max: 20},    // m_numerator (treated as int)
                {min: 1, max: 12},    // m_denominator (treated as int)
                {min: 0.1, max: 10},  // n1
                {min: 0.1, max: 10},  // n2
                {min: 0.1, max: 10},  // n3
                {min: 0.1, max: 3},   // a
                {min: 0.1, max: 3}    // b
            ]
        });

        this.genome = genome || this.generateRandomGenome();
        this.numPoints = 1000;
        this.phiRange = 2 * Math.PI;
    }

    usesColorPalette() { return true; }
    
    generateRandomGenome() {
        const genome = this.representation.generateRandom();
        // Round first two parameters to integers
        genome[0] = Math.round(genome[0]);  // m_numerator
        genome[1] = this.generateDenominator();  // m_denominator (from preset list)
        return genome;
    }

    generateDenominator() {
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
        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Background color (dark)
            const backgroundColor = window.Palette.color(0);
            
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
                const color = window.Palette.color(colorT);
                
                // Scale and translate coordinates
                const x1 = p1.x * scale + offsetX;
                const y1 = p1.y * scale + offsetY;
                const x2 = p2.x * scale + offsetX;
                const y2 = p2.y * scale + offsetY;
                
                // Draw line segment
                Canvas2DModality.drawThickLine(data, width, height, x1, y1, x2, y2, color, 2);
            }
            
            // Draw filled shape option (uncomment for filled shapes)
            //this.drawFilledShape(data, width, height, points, scale, offsetX, offsetY);
            
            return imageData;
        });
    }
    
    drawFilledShape(data, width, height, points, scale, offsetX, offsetY) {
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
                    const color = window.Palette.color(colorT);
                    
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
                        const noise = this.representation.gaussianRandom(0, 1);
                        this.genome[i] = Math.max(0.01, Math.min(20,
                            this.genome[i] + noise * 0.5
                        ));
                        break;
                    case 5: // a (x-axis scaling) - smaller mutations
                    case 6: // b (y-axis scaling)
                        // Apply Gaussian noise mutation for scaling parameters
                        const scaleNoise = this.representation.gaussianRandom(0, 1);
                        this.genome[i] = Math.max(0.01, Math.min(5,
                            this.genome[i] + scaleNoise * 0.2
                        ));
                        break;
                }
            }
        }
        this.invalidateImageCache();
    }

    crossover(other) {
        // Use FloatRepresentation for blend crossover
        const [child1Genome, child2Genome] = this.representation.crossover(this.genome, other.genome);

        // Round first two parameters to integers (m_numerator and m_denominator)
        child1Genome[0] = Math.round(child1Genome[0]);
        child1Genome[1] = Math.round(child1Genome[1]);
        child2Genome[0] = Math.round(child2Genome[0]);
        child2Genome[1] = Math.round(child2Genome[1]);

        return [new SuperFormulaIndividual(child1Genome), new SuperFormulaIndividual(child2Genome)];
    }
    
    clone() {
        const clone = new SuperFormulaIndividual(this.representation.clone(this.genome));
        clone.fitness = this.fitness;
        return clone;
    }
    
    getPhenotype() {
        const params = this.getParameters();
        return `m=${params.m_numerator}/${params.m_denominator} (${params.m.toFixed(2)}), φRange=${(this.phiRange /
           + Math.PI).toFixed(1)}π, n1=${params.n1.toFixed(3)}, n2=${params.n2.toFixed(3)}, n3=${params.n3.toFixed(3)}, a=${params.a.toFixed(3)}, b=${params.b.toFixed(3)}`;
    }
    
    describeExtra() {
        const p = this.getParameters();
        return `\n<span class="genome-label">Formula:</span>\n${this._formulaLine(p, 'r(φ)')}\n`;
    }

    _formulaLine(p, label) {
        return `${label} = [|cos(${p.m}·φ/4)/${p.a.toFixed(3)}|^${p.n2.toFixed(3)} + |sin(${p.m}·φ/4)/${p.b.toFixed(3)}|^${p.n3.toFixed(3)}]^(-1/${p.n1.toFixed(3)})`;
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
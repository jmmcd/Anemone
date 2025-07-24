class GERadiusDrawingIndividual extends GrammaticalEvolutionIndividual {
    constructor(genome = null, genomeLength = 100) {
        super(genome, genomeLength);
        
        // Override grammar for polar coordinates (t = angle, output = radius)
        this.grammar = Grammar.createPolarDrawingGrammar();
        this.startSymbol = '<polar>';
        this.tMin = 0;
        this.tMax = 10 * Math.PI; // 0 to 10π
        this.numPoints = 500; // Number of points to sample
        this.maxDerivations = 100; // Reduced from 1000 to prevent runaway derivations
    }
    
    // Override visualization for polar coordinate drawing
    visualize(canvas) {
        console.time(`visualize-${this.id}`);
        
        this.visualizeWithCache(canvas, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Get palette from framework settings
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            const palette = this.getPaletteByName(paletteName);
            
            // Background color (first color in palette)
            const backgroundColor = this.interpolateColor(palette, 0);
            
            // Fill background
            for (let i = 0; i < data.length; i += 4) {
                data[i] = backgroundColor.r;     // Red
                data[i + 1] = backgroundColor.g; // Green
                data[i + 2] = backgroundColor.b; // Blue
                data[i + 3] = 255;              // Alpha
            }
            
            // Generate polar coordinates
            const polarPoints = this.generatePolarPoints();
            
            if (polarPoints.length > 0) {
                // Convert to Cartesian and draw
                this.drawPolarCurve(data, width, height, polarPoints, palette);
            }
            
            return imageData;
        });
        
        console.timeEnd(`visualize-${this.id}`);
    }
    
    generatePolarPoints() {
        const points = [];
        const tStep = (this.tMax - this.tMin) / this.numPoints;
        
        for (let i = 0; i <= this.numPoints; i++) {
            const t = this.tMin + i * tStep;
            const r = this.evaluateExpression(t, 0); // y parameter unused for polar
            points.push({ t, r });
        }
        
        return points;
    }
    
    drawPolarCurve(data, width, height, polarPoints, palette) {
        // Find min/max radius for scaling
        const radii = polarPoints.map(p => p.r);
        const minR = Math.min(...radii);
        const maxR = Math.max(...radii);
        
        // Ensure we have valid radii
        if (!isFinite(minR) || !isFinite(maxR) || maxR === minR) {
            console.warn('Invalid radii range, using default circle');
            // Draw a simple circle as fallback
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 4;
            const foregroundColor = this.interpolateColor(palette, 1);
            
            for (let i = 0; i < 100; i++) {
                const angle = (i / 100) * 2 * Math.PI;
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);
                
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                    data[index] = foregroundColor.r;
                    data[index + 1] = foregroundColor.g;
                    data[index + 2] = foregroundColor.b;
                    data[index + 3] = 255;
                }
            }
            return;
        }
        
        // Scale factor to fit in canvas with some padding
        const padding = 20;
        const maxDimension = Math.min(width, height) - 2 * padding;
        const maxRadius = Math.max(Math.abs(minR), Math.abs(maxR));
        const scale = maxRadius > 0 ? maxDimension / (2 * maxRadius) : 1;
        
        // Center point
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Foreground color (last color in palette)
        const foregroundColor = this.interpolateColor(palette, 1);
        
        // Draw the curve
        for (let i = 0; i < polarPoints.length - 1; i++) {
            const p1 = polarPoints[i];
            const p2 = polarPoints[i + 1];
            
            // Convert polar to Cartesian
            const x1 = centerX + p1.r * scale * Math.cos(p1.t);
            const y1 = centerY + p1.r * scale * Math.sin(p1.t);
            const x2 = centerX + p2.r * scale * Math.cos(p2.t);
            const y2 = centerY + p2.r * scale * Math.sin(p2.t);
            
            // Only draw if points are reasonable
            if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
                this.drawLine(data, width, height, x1, y1, x2, y2, foregroundColor);
            }
        }
        
        // Connect last point to first for closed curves
        if (polarPoints.length > 2) {
            const first = polarPoints[0];
            const last = polarPoints[polarPoints.length - 1];
            
            const x1 = centerX + last.r * scale * Math.cos(last.t);
            const y1 = centerY + last.r * scale * Math.sin(last.t);
            const x2 = centerX + first.r * scale * Math.cos(first.t);
            const y2 = centerY + first.r * scale * Math.sin(first.t);
            
            if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
                this.drawLine(data, width, height, x1, y1, x2, y2, foregroundColor);
            }
        }
    }
    
    drawLine(data, width, height, x1, y1, x2, y2, color) {
        // Simple line drawing using Bresenham's algorithm
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
            // Set pixel if within bounds
            if (x >= 0 && x < width && y >= 0 && y < height) {
                const index = (y * width + x) * 4;
                data[index] = color.r;
                data[index + 1] = color.g;
                data[index + 2] = color.b;
                data[index + 3] = 255;
            }
            
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
    
    // Override expression evaluation to work with single parameter t
    evaluateExpression(t, unused) {
        const expression = this.getPhenotype();
        
        try {
            // Pre-compile the expression for faster evaluation
            if (!this._compiledExpression) {
                this._compiledExpression = this.compileExpressionForT(expression);
            }
            
            const result = this._compiledExpression(t);
            
            // Clamp result to reasonable range to prevent extreme values
            return Math.max(-50, Math.min(50, result));
            
        } catch (error) {
            console.warn('Expression evaluation error:', error, 'Expression:', expression);
            return 1.0; // Default radius for errors
        }
    }
    
    compileExpressionForT(expression) {
        try {
            // Create a more efficient compiled function for t variable
            let jsExpression = expression
                .replace(/sin/g, 'Math.sin')
                .replace(/cos/g, 'Math.cos')
                .replace(/tan/g, 'Math.tan')
                .replace(/exp/g, 'Math.exp')
                .replace(/log/g, 'Math.log')
                .replace(/sqrt/g, 'Math.sqrt')
                .replace(/abs/g, 'Math.abs')
                .replace(/floor/g, 'Math.floor')
                .replace(/ceil/g, 'Math.ceil')
                .replace(/3\.14159/g, 'Math.PI')
                .replace(/6\.28318/g, '(2*Math.PI)');
            
            // Protected division and modulo
            jsExpression = jsExpression.replace(/\/([^\/]+)/g, (match, divisor) => {
                return `/(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`;
            });
            
            jsExpression = jsExpression.replace(/%([^%]+)/g, (match, divisor) => {
                return `%(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`;
            });
            
            // Create function that takes t parameter
            const compiledFn = new Function('t', `
                try {
                    const result = ${jsExpression};
                    return isFinite(result) ? result : 1.0;
                } catch (e) {
                    return 1.0;
                }
            `);
            
            return compiledFn;
            
        } catch (error) {
            return () => 1.0;
        }
    }
    
    // Override mutate to invalidate compiled expression
    mutate(rate = 0.1) {
        super.mutate(rate);
        this._compiledExpression = null; // Reset compiled expression for t
    }
    
    // Override crossover to ensure correct type
    crossover(other) {
        const child1Genome = [];
        const child2Genome = [];
        
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(this.genome[i]);
                child2Genome.push(other.genome[i] || Math.floor(Math.random() * 256));
            } else {
                child1Genome.push(other.genome[i] || Math.floor(Math.random() * 256));
                child2Genome.push(this.genome[i]);
            }
        }
        
        const child1 = new GERadiusDrawingIndividual(child1Genome, this.genomeLength);
        const child2 = new GERadiusDrawingIndividual(child2Genome, this.genomeLength);
        
        return [child1, child2];
    }
    
    // Override clone to ensure correct type
    clone() {
        const clone = new GERadiusDrawingIndividual([...this.genome], this.genomeLength);
        clone.fitness = this.fitness;
        clone.grammar = this.grammar;
        clone.startSymbol = this.startSymbol;
        clone.maxDerivations = this.maxDerivations;
        clone.tMin = this.tMin;
        clone.tMax = this.tMax;
        clone.numPoints = this.numPoints;
        return clone;
    }
    
}
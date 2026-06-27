/**
 * GERadiusDrawingIndividual
 *
 * REFACTORED: Uses GrammaticalRepresentation + Canvas2DModality (inherited from parent).
 * Generates polar coordinate curves (radius as function of angle).
 */

class GERadiusDrawingIndividual extends Individual {
    constructor(genome = null, genomeLength = 100) {
        super('SKIP_GENOME_GENERATION');

        // Configure grammatical representation for polar coordinates
        this.representation = new GrammaticalRepresentation({
            length: genomeLength,
            grammar: Grammar.createPolarDrawingGrammar(),
            startSymbol: '<polar>',
            maxDerivations: 100 // Reduced from 1000 to prevent runaway derivations
        });

        this.genome = genome || this.representation.generateRandom();
        this.genomeLength = genomeLength;

        // Polar coordinate parameters
        this.tMin = 0;
        this.tMax = 10 * Math.PI; // 0 to 10π
        this.numPoints = 500; // Number of points to sample
    }

    getPhenotype() {
        return this.representation.derivePhenotype(this.genome);
    }

    usesColorPalette() { return true; }

    // Override visualization for polar coordinate drawing
    visualize(canvas) {
        console.time(`visualize-${this.id}`);

        Canvas2DModality.renderCached(canvas, this, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            // Background color (first color in palette)
            const backgroundColor = window.Palette.color(0);

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
                this.drawPolarCurve(data, width, height, polarPoints);
            }

            // Soften and add a palette-coloured glow over the finished render.
            Canvas2DModality.bloom(imageData, { radius: 2, strength: 2.0, background: backgroundColor });

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
    
    drawPolarCurve(data, width, height, polarPoints) {
        // Find min/max radius for scaling. (Per-point values are already finite:
        // the compiled expression maps Infinity/NaN to a safe number.)
        const radii = polarPoints.map(p => p.r);
        const minR = Math.min(...radii);
        const maxR = Math.max(...radii);
        const maxRadius = Math.max(Math.abs(minR), Math.abs(maxR));

        // Scale factor to fit in canvas with some padding
        const padding = 20;
        const maxDimension = Math.min(width, height) - 2 * padding;

        // Only bail to a placeholder when the curve is degenerate (essentially
        // r = 0 everywhere). A constant non-zero radius is a perfectly good
        // circle and is drawn by the normal path below — not the placeholder.
        if (!isFinite(maxRadius) || maxRadius < 1e-6) {
            this.drawCircleOutline(data, width, height, Math.min(width, height) / 4);
            return;
        }

        const scale = maxDimension / (2 * maxRadius);
        
        // Center point
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Foreground color (last color in palette). Smoothing/glow is applied
        // afterwards as a bloom post-filter (see visualize()).
        const foregroundColor = window.Palette.color(1);

        const toXY = (p) => ({
            x: centerX + p.r * scale * Math.cos(p.t),
            y: centerY + p.r * scale * Math.sin(p.t)
        });

        // Build the list of Cartesian segments to draw.
        const segments = [];
        for (let i = 0; i < polarPoints.length - 1; i++) {
            const a = toXY(polarPoints[i]);
            const b = toXY(polarPoints[i + 1]);
            if (isFinite(a.x) && isFinite(a.y) && isFinite(b.x) && isFinite(b.y)) {
                segments.push([a.x, a.y, b.x, b.y]);
            }
        }

        // Close the curve only if its ends actually meet. Samples run over
        // t ∈ [0, 10π], so the first (t=0) and last (t=10π) points both sit on
        // the +x axis (angle ≡ 0). When r differs there — e.g. a spiral — a chord
        // back to the start is a spurious radial line. So add the closing segment
        // only when the endpoints nearly coincide (a genuinely closed, periodic
        // curve); otherwise leave the curve open. The small tolerance means a
        // near-closure shows at most a couple-pixel gap rather than a long chord.
        if (polarPoints.length > 2) {
            const a = toXY(polarPoints[polarPoints.length - 1]);
            const b = toXY(polarPoints[0]);
            const gap = Math.hypot(b.x - a.x, b.y - a.y);
            const closeTolerance = Math.max(2, 0.05 * maxDimension);
            if (gap <= closeTolerance && isFinite(a.x) && isFinite(a.y) && isFinite(b.x) && isFinite(b.y)) {
                segments.push([a.x, a.y, b.x, b.y]);
            }
        }

        for (const [x1, y1, x2, y2] of segments) {
            Canvas2DModality.drawLine(data, width, height, x1, y1, x2, y2, foregroundColor);
        }
    }

    // Connected placeholder circle for degenerate (≈ zero-radius) curves.
    drawCircleOutline(data, width, height, radius) {
        const centerX = width / 2;
        const centerY = height / 2;
        const foregroundColor = window.Palette.color(1);
        const steps = 120;
        let prev = null;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            if (prev) Canvas2DModality.drawLine(data, width, height, prev.x, prev.y, x, y, foregroundColor);
            prev = { x, y };
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

            // Note: division/modulo by zero produces Infinity/NaN, which the
            // isFinite guard below maps to a safe value. We deliberately do NOT
            // rewrite '/' and '%' with a regex — that can't balance parentheses
            // and would mangle most expressions into uncompilable code.

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
    
    mutate(rate = 0.1) {
        this.representation.mutate(this.genome, rate);
        this._compiledExpression = null; // Reset compiled expression for t
        this.invalidateImageCache();
    }

    crossover(other) {
        const [child1Genome, child2Genome] = this.representation.crossover(this.genome, other.genome);
        return [new GERadiusDrawingIndividual(child1Genome, this.genomeLength), new GERadiusDrawingIndividual(child2Genome, this.genomeLength)];
    }

    clone() {
        const clone = new GERadiusDrawingIndividual(this.representation.clone(this.genome), this.genomeLength);
        clone.fitness = this.fitness;
        return clone;
    }
    
}
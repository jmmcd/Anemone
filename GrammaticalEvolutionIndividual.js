class GrammaticalEvolutionIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null, genomeLength = 100) {
        // Call super with special flag to prevent automatic genome generation
        super('SKIP_GENOME_GENERATION');
        
        this.genomeLength = genomeLength;
        this.grammar = Grammar.createImagePatternGrammar();
        this.startSymbol = '<pattern>';
        this.maxDerivations = 1000;
        this._phenotype = null;
        this._expression = null;
        
        // Now generate genome manually
        this.genome = genome || this.generateRandomGenome();
    }
    
    generateRandomGenome() {
        return Array.from({length: this.genomeLength}, () => Math.floor(Math.random() * 256));
    }
    
    getPhenotype() {
        if (this._phenotype === null) {
            this._phenotype = this.derivePhenotype();
        }
        return this._phenotype;
    }
    
    derivePhenotype() {
        const derivation = this.grammar.derive(this.startSymbol, this.genome, this.maxDerivations, 15);
        this._expression = this.grammar.derivesToString(derivation);
        
        // If expression is too complex, simplify it
        if (this._expression.length > 200) {
            console.warn('Expression too complex, using fallback:', this._expression.substring(0, 50) + '...');
            this._expression = '1.0 + 0.5 * sin(t)'; // Simple fallback
        }
        
        return this._expression;
    }
    
    evaluateExpression(x, y) {
        const expression = this.getPhenotype();
        
        try {
            // Pre-compile the expression for faster evaluation
            if (!this._compiledExpression) {
                this._compiledExpression = this.compileExpression(expression);
            }
            
            return this._compiledExpression(x, y);
            
        } catch (error) {
            return 0.0;
        }
    }
    
    compileExpression(expression) {
        try {
            // Create a more efficient compiled function
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
                .replace(/ifpos\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($1) > 0 ? ($2) : ($3))')
                .replace(/\br\b/g, 'Math.sqrt(x*x + y*y)')
                .replace(/\btheta\b/g, 'Math.atan2(y, x)')
                .replace(/3\.14159/g, 'Math.PI')
                .replace(/6\.28318/g, '(2*Math.PI)');
            
            // Protected division and modulo
            jsExpression = jsExpression.replace(/\/([^\/]+)/g, (match, divisor) => {
                return `/(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`;
            });
            
            jsExpression = jsExpression.replace(/%([^%]+)/g, (match, divisor) => {
                return `%(Math.abs(${divisor}) > 1e-6 ? ${divisor} : 1.0)`;
            });
            
            // Create function that takes x, y parameters
            const compiledFn = new Function('x', 'y', `
                try {
                    const result = ${jsExpression};
                    return isFinite(result) ? result : 0.0;
                } catch (e) {
                    return 0.0;
                }
            `);
            
            return compiledFn;
            
        } catch (error) {
            return () => 0.0;
        }
    }
    
    visualize(canvas) {
        console.time(`visualize-${this.id}`);
        
        this.visualizeWithCache(canvas, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Get palette from framework settings
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            const palette = this.getPaletteByName(paletteName);
            
            for (let py = 0; py < height; py++) {
                for (let px = 0; px < width; px++) {
                    // Normalize coordinates to [-1, 1]
                    const x = (px / width) * 2 - 1;
                    const y = (py / height) * 2 - 1;
                    
                    // Evaluate expression
                    const value = this.evaluateExpression(x, y);
                    
                    // Normalize value to [0, 1] for palette lookup
                    const normalizedValue = (Math.tanh(value) + 1) / 2;
                    
                    // Get color from palette
                    const color = this.interpolateColor(palette, normalizedValue);
                    
                    const index = (py * width + px) * 4;
                    data[index] = color.r;       // Red
                    data[index + 1] = color.g;   // Green
                    data[index + 2] = color.b;   // Blue
                    data[index + 3] = 255;      // Alpha
                }
            }
            
            return imageData;
        });
        
        console.timeEnd(`visualize-${this.id}`);
    }
    
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                this.genome[i] = Math.floor(Math.random() * 256);
            }
        }
        this._phenotype = null; // Reset cached phenotype
        this._expression = null;
        this._compiledExpression = null; // Reset compiled expression
        this.invalidateImageCache();
    }
    
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
        
        const child1 = new GrammaticalEvolutionIndividual(child1Genome, this.genomeLength);
        const child2 = new GrammaticalEvolutionIndividual(child2Genome, this.genomeLength);
        
        return [child1, child2];
    }
    
    clone() {
        const clone = new GrammaticalEvolutionIndividual([...this.genome], this.genomeLength);
        clone.fitness = this.fitness;
        clone.grammar = this.grammar;
        clone.startSymbol = this.startSymbol;
        clone.maxDerivations = this.maxDerivations;
        return clone;
    }
    
    getExpressionString() {
        return this.getPhenotype();
    }
    
    // Helper method to get a more readable expression
    getReadableExpression() {
        const expr = this.getPhenotype();
        return expr.length > 100 ? expr.substring(0, 100) + '...' : expr;
    }
    
}
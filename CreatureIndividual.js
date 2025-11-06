class Turtle {
    constructor(x = 0, y = 0, heading = 0, penWidth = 2, colorIndex = 0, stepSize = 10) {
        this.x = x;
        this.y = y;
        this.heading = heading; // angle in degrees
        this.penWidth = penWidth;
        this.colorIndex = colorIndex;
        this.stepSize = stepSize;
        this.path = []; // Store drawing commands
    }
    
    copy() {
        const turtle = new Turtle(this.x, this.y, this.heading, this.penWidth, this.colorIndex, this.stepSize);
        turtle.path = [...this.path];
        return turtle;
    }
    
    moveForward() {
        const radians = (this.heading * Math.PI) / 180;
        const newX = this.x + Math.cos(radians) * this.stepSize;
        const newY = this.y + Math.sin(radians) * this.stepSize;
        
        // Always draw a line since pen is always down
        this.path.push({
            type: 'line',
            x1: this.x,
            y1: this.y,
            x2: newX,
            y2: newY,
            width: this.penWidth,
            colorIndex: this.colorIndex
        });
        
        this.x = newX;
        this.y = newY;
    }
    
    turn(angle) {
        this.heading = (this.heading + angle) % 360;
    }
    
    changePenWidth(delta) {
        this.penWidth = Math.max(1, Math.min(5, this.penWidth + delta));
    }
    
    changeStepSize(delta) {
        this.stepSize = Math.max(2, Math.min(30, this.stepSize + delta));
    }
    
    changeColor() {
        this.colorIndex = (this.colorIndex + 1) % 8; // Cycle through 8 colors
    }
}

class CreatureIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.minGenomeLength = 12;
        this.maxGenomeLength = 200;
        this.initialMinLength = 12;
        this.initialMaxLength = 22;
        this.genome = genome || this.generateRandomGenome();
        
        // Command mapping
        this.commands = {
            'F': 'moveForward',
            'B': 'branch',
            'L': 'loop',
            '+': 'turnRight',
            '-': 'turnLeft', 
            'R': 'turnRightLarge',
            'T': 'turnLeftLarge',
            'U': 'turnAround',
            'W': 'penWidthIncrease',
            'w': 'penWidthDecrease',
            'C': 'changeColor',
            'S': 'stepSizeIncrease',
            's': 'stepSizeDecrease'
        };
        
        // Available characters for genome generation
        this.characters = Object.keys(this.commands);
    }
    
    generateRandomGenome() {
        const length = Math.floor(Math.random() * (this.initialMaxLength - this.initialMinLength + 1)) + this.initialMinLength;
        return Array.from({length}, () => 
            Math.floor(Math.random() * 256)
        );
    }
    
    integerToCharacter(value) {
        return this.characters[value % this.characters.length];
    }
    
    executeGenome() {
        const turtle = new Turtle(0, 0, 0, 2, 0, 10);
        const turtles = [turtle];
        
        this.executeGenomeOnTurtles(turtles, this.genome, 0);
        
        // Collect all paths from all turtles
        const allPaths = [];
        turtles.forEach(t => allPaths.push(...t.path));
        
        return allPaths;
    }
    
    executeGenomeOnTurtles(turtles, genome, startIndex) {
        let index = startIndex;
        
        while (index < genome.length && turtles.length > 0) {
            const value = genome[index];
            const character = this.integerToCharacter(value);
            
            if (character === 'B') {
                // Branch: spawn new turtle for each existing turtle
                const newTurtles = [];
                turtles.forEach(turtle => {
                    // Get branch angle from next integer
                    const angleValue = index + 1 < genome.length ? genome[index + 1] : 128;
                    const branchAngle = (angleValue / 255) * 90 - 45; // -45 to +45 degrees
                    
                    // Create branched turtle
                    const branchedTurtle = turtle.copy();
                    branchedTurtle.turn(branchAngle);
                    newTurtles.push(branchedTurtle);
                });
                
                turtles.push(...newTurtles);
                index += 2; // Skip the angle parameter
                
            } else if (character === 'L') {
                // Loop: repeat next 5 commands
                const loopCount = index + 1 < genome.length ? 
                    Math.max(1, Math.min(5, Math.floor((genome[index + 1] / 255) * 5) + 1)) : 2;
                
                const loopCommands = [];
                for (let i = 0; i < 5 && index + 2 + i < genome.length; i++) {
                    loopCommands.push(genome[index + 2 + i]);
                }
                
                // Execute loop commands for each iteration
                for (let i = 0; i < loopCount; i++) {
                    this.executeGenomeOnTurtles(turtles, loopCommands, 0);
                }
                
                index += 7; // Skip loop count + 5 commands
                
            } else {
                // Regular command: execute on all turtles
                turtles.forEach(turtle => {
                    this.executeCommand(turtle, character);
                });
                index++;
            }
            
            // Limit number of turtles to prevent explosion
            if (turtles.length > 20) {
                turtles.splice(20);
            }
        }
    }
    
    executeCommand(turtle, character) {
        switch (character) {
            case 'F':
                turtle.moveForward();
                break;
            case '+':
                turtle.turn(15);
                break;
            case '-':
                turtle.turn(-15);
                break;
            case 'R':
                turtle.turn(45);
                break;
            case 'T':
                turtle.turn(-45);
                break;
            case 'U':
                turtle.turn(180);
                break;
            case 'W':
                turtle.changePenWidth(1);
                break;
            case 'w':
                turtle.changePenWidth(-1);
                break;
            case 'C':
                turtle.changeColor();
                break;
            case 'S':
                turtle.changeStepSize(2);
                break;
            case 's':
                turtle.changeStepSize(-2);
                break;
        }
    }
    
    visualize(canvas) {
        this.visualizeWithCache(canvas, (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;
            
            // Get palette from framework settings (for creature colors only)
            const paletteName = this.getFrameworkSetting('colorPalette') || 'viridis';
            const palette = this.getPaletteByName(paletteName);
            
            // Always use black background
            const backgroundColor = { r: 0, g: 0, b: 0 };
            
            // Fill background with black
            for (let i = 0; i < data.length; i += 4) {
                data[i] = backgroundColor.r;       // Red = 0
                data[i + 1] = backgroundColor.g;   // Green = 0
                data[i + 2] = backgroundColor.b;   // Blue = 0
                data[i + 3] = 255;                // Alpha = 255
            }
            
            // Execute genome to get drawing commands
            const paths = this.executeGenome();
            
            if (paths.length === 0) {
                return imageData;
            }
            
            // Find bounding box for scaling
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            paths.forEach(path => {
                minX = Math.min(minX, path.x1, path.x2);
                maxX = Math.max(maxX, path.x1, path.x2);
                minY = Math.min(minY, path.y1, path.y2);
                maxY = Math.max(maxY, path.y1, path.y2);
            });
            
            // Calculate scaling and offset
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
            
            // Draw all paths
            paths.forEach(path => {
                // Get color from palette
                const colorIndex = path.colorIndex / 7; // Normalize to [0,1]
                const color = this.interpolateColor(palette, colorIndex);
                
                // Scale and translate coordinates
                const x1 = path.x1 * scale + offsetX;
                const y1 = path.y1 * scale + offsetY;
                const x2 = path.x2 * scale + offsetX;
                const y2 = path.y2 * scale + offsetY;
                
                // Draw line with appropriate width
                this.drawLine(data, width, height, x1, y1, x2, y2, color, path.width);
            });
            
            return imageData;
        });
    }
    
    drawLine(data, width, height, x1, y1, x2, y2, color, lineWidth = 1) {
        // Use Bresenham's algorithm for the line, with thickness
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
            // Draw a circle at each point for line thickness
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
    
    mutate(rate = 0.1) {
        const mutationTypes = ['change', 'insert', 'delete'];
        
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                const mutationType = mutationTypes[Math.floor(Math.random() * mutationTypes.length)];
                
                switch (mutationType) {
                    case 'change':
                        // Standard point mutation - change the value
                        this.genome[i] = Math.floor(Math.random() * 256);
                        break;
                        
                    case 'insert':
                        // Insert a new random integer at this position
                        if (this.genome.length < this.maxGenomeLength) {
                            const newValue = Math.floor(Math.random() * 256);
                            this.genome.splice(i, 0, newValue);
                            i++; // Skip the newly inserted element
                        }
                        break;
                        
                    case 'delete':
                        // Delete the integer at this position
                        if (this.genome.length > this.minGenomeLength) {
                            this.genome.splice(i, 1);
                            i--; // Adjust index after deletion
                        }
                        break;
                }
            }
        }
        
        // Additional insertion mutations at the end (for growth)
        if (Math.random() < rate && this.genome.length < this.maxGenomeLength) {
            const newValue = Math.floor(Math.random() * 256);
            this.genome.push(newValue);
        }
        
        this.invalidateImageCache();
    }
    
    crossover(other) {
        // Two-point crossover with independently generated cut-points
        const parent1 = this.genome;
        const parent2 = other.genome;
        
        // Generate cut-points independently for each parent
        const cutPoint1_P1 = Math.floor(Math.random() * (parent1.length + 1));
        const cutPoint2_P1 = Math.floor(Math.random() * (parent1.length + 1));
        const cutPoint1_P2 = Math.floor(Math.random() * (parent2.length + 1));
        const cutPoint2_P2 = Math.floor(Math.random() * (parent2.length + 1));
        
        // Ensure cut-points are in order (start <= end)
        const start1 = Math.min(cutPoint1_P1, cutPoint2_P1);
        const end1 = Math.max(cutPoint1_P1, cutPoint2_P1);
        const start2 = Math.min(cutPoint1_P2, cutPoint2_P2);
        const end2 = Math.max(cutPoint1_P2, cutPoint2_P2);
        
        // Create child genomes
        const child1Genome = [
            ...parent1.slice(0, start1),          // Beginning from parent 1
            ...parent2.slice(start2, end2),       // Middle from parent 2
            ...parent1.slice(end1)                // End from parent 1
        ];
        
        const child2Genome = [
            ...parent2.slice(0, start2),          // Beginning from parent 2
            ...parent1.slice(start1, end1),       // Middle from parent 1
            ...parent2.slice(end2)                // End from parent 2
        ];
        
        // Ensure minimum and maximum length constraints
        const clampedChild1 = this.clampGenomeLength(child1Genome);
        const clampedChild2 = this.clampGenomeLength(child2Genome);
        
        const child1 = new CreatureIndividual(clampedChild1);
        const child2 = new CreatureIndividual(clampedChild2);
        
        return [child1, child2];
    }
    
    clampGenomeLength(genome) {
        // Ensure genome is within length constraints
        if (genome.length < this.minGenomeLength) {
            // Pad with random values if too short
            while (genome.length < this.minGenomeLength) {
                genome.push(Math.floor(Math.random() * 256));
            }
        } else if (genome.length > this.maxGenomeLength) {
            // Truncate if too long
            genome = genome.slice(0, this.maxGenomeLength);
        }
        return genome;
    }
    
    clone() {
        const clone = new CreatureIndividual([...this.genome]);
        clone.fitness = this.fitness;
        // Copy length constraints in case they were modified
        clone.minGenomeLength = this.minGenomeLength;
        clone.maxGenomeLength = this.maxGenomeLength;
        clone.initialMinLength = this.initialMinLength;
        clone.initialMaxLength = this.initialMaxLength;
        return clone;
    }
    
    getPhenotype() {
        return this.genome.map(val => this.integerToCharacter(val)).join('');
    }
    
    getGenomeInfo() {
        return {
            length: this.genome.length,
            phenotype: this.getPhenotype(),
            lengthConstraints: {
                min: this.minGenomeLength,
                max: this.maxGenomeLength,
                initialMin: this.initialMinLength,
                initialMax: this.initialMaxLength
            }
        };
    }
}
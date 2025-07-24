class CharacterIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.genomeLength = 43; // Fixed-length genome for character features
        this.genome = genome || this.generateRandomGenome();
    }
    
    generateRandomGenome() {
        return [
            // Head (4 params)
            Math.random() * 0.3 + 0.6,      // 0: head size (0.6-0.9)
            Math.random() * 0.2 + 0.4,      // 1: head x position (0.4-0.6)
            Math.random() * 0.15 + 0.15,    // 2: head y position (0.15-0.3)
            Math.random(),                   // 3: head shape (0=circle, 1=oval)
            
            // Head color (3 params)
            Math.random(),                   // 4: head color R
            Math.random(),                   // 5: head color G  
            Math.random(),                   // 6: head color B
            
            // Eyes (6 params)
            Math.random(),                   // 7: eye type (0-1 for different styles)
            Math.random() * 0.1 + 0.35,     // 8: left eye x (0.35-0.45)
            Math.random() * 0.1 + 0.2,      // 9: left eye y (0.2-0.3)
            Math.random() * 0.1 + 0.55,     // 10: right eye x (0.55-0.65)
            Math.random() * 0.1 + 0.2,      // 11: right eye y (0.2-0.3)
            Math.random() * 0.05 + 0.02,    // 12: eye size (0.02-0.07)
            
            // Mouth (3 params)
            Math.random(),                   // 13: mouth type (0-1 for different styles)
            Math.random() * 0.1 + 0.45,     // 14: mouth x (0.45-0.55)
            Math.random() * 0.1 + 0.35,     // 15: mouth y (0.35-0.45)
            
            // Body (4 params)
            Math.random() * 0.2 + 0.3,      // 16: body width (0.3-0.5)
            Math.random() * 0.3 + 0.3,      // 17: body height (0.3-0.6)
            Math.random() * 0.1 + 0.45,     // 18: body x (0.45-0.55)
            Math.random() * 0.1 + 0.5,      // 19: body y (0.5-0.6)
            
            // Body color (3 params)
            Math.random(),                   // 20: body color R
            Math.random(),                   // 21: body color G
            Math.random(),                   // 22: body color B
            
            // Arms (5 params)
            Math.random() * 0.15 + 0.25,    // 23: left arm start x (0.25-0.4)
            Math.random() * 0.1 + 0.55,     // 24: left arm start y (0.55-0.65)
            Math.random() * 0.15 + 0.6,     // 25: right arm start x (0.6-0.75)
            Math.random() * 0.1 + 0.55,     // 26: right arm start y (0.55-0.65)
            Math.random() * 0.03 + 0.01,    // 27: arm thickness (0.01-0.04)
            
            // Legs (5 params)
            Math.random() * 0.1 + 0.4,      // 28: left leg start x (0.4-0.5)
            Math.random() * 0.1 + 0.75,     // 29: left leg start y (0.75-0.85)
            Math.random() * 0.1 + 0.5,      // 30: right leg start x (0.5-0.6)
            Math.random() * 0.1 + 0.75,     // 31: right leg start y (0.75-0.85)
            Math.random() * 0.03 + 0.01,    // 32: leg thickness (0.01-0.04)
            
            // Limb color (3 params)
            Math.random(),                   // 33: limb color R
            Math.random(),                   // 34: limb color G
            Math.random(),                   // 35: limb color B
            
            // Optional features flags (4 params)
            Math.random(),                   // 36: hair flag (>0.5 = has hair)
            Math.random(),                   // 37: ears flag (>0.5 = has ears)
            Math.random(),                   // 38: teeth flag (>0.5 = has teeth)
            Math.random(),                   // 39: hat flag (>0.5 = has hat)
            
            // Accessories (4 params)
            Math.random(),                   // 40: sword flag (>0.5 = has sword)
            Math.random(),                   // 41: hair/hat color
            Math.random(),                   // 42: accessory color
        ];
    }
    
    getParameters() {
        return {
            // Head
            headSize: this.genome[0],
            headX: this.genome[1],
            headY: this.genome[2],
            headShape: this.genome[3],
            headColor: {
                r: Math.floor(this.genome[4] * 255),
                g: Math.floor(this.genome[5] * 255),
                b: Math.floor(this.genome[6] * 255)
            },
            
            // Eyes
            eyeType: Math.floor(this.genome[7] * 3), // 3 eye types
            leftEyeX: this.genome[8],
            leftEyeY: this.genome[9],
            rightEyeX: this.genome[10],
            rightEyeY: this.genome[11],
            eyeSize: this.genome[12],
            
            // Mouth
            mouthType: Math.floor(this.genome[13] * 4), // 4 mouth types
            mouthX: this.genome[14],
            mouthY: this.genome[15],
            
            // Body
            bodyWidth: this.genome[16],
            bodyHeight: this.genome[17],
            bodyX: this.genome[18],
            bodyY: this.genome[19],
            bodyColor: {
                r: Math.floor(this.genome[20] * 255),
                g: Math.floor(this.genome[21] * 255),
                b: Math.floor(this.genome[22] * 255)
            },
            
            // Arms
            leftArmX: this.genome[23],
            leftArmY: this.genome[24],
            rightArmX: this.genome[25],
            rightArmY: this.genome[26],
            armThickness: this.genome[27],
            
            // Legs
            leftLegX: this.genome[28],
            leftLegY: this.genome[29],
            rightLegX: this.genome[30],
            rightLegY: this.genome[31],
            legThickness: this.genome[32],
            
            // Limb color
            limbColor: {
                r: Math.floor(this.genome[33] * 255),
                g: Math.floor(this.genome[34] * 255),
                b: Math.floor(this.genome[35] * 255)
            },
            
            // Features
            hasHair: this.genome[36] > 0.5,
            hasEars: this.genome[37] > 0.5,
            hasTeeth: this.genome[38] > 0.5,
            hasHat: this.genome[39] > 0.5,
            hasSword: this.genome[40] > 0.5,
            
            // Colors
            hairColor: Math.floor(this.genome[41] * 360), // Hue for hair/hat
            accessoryColor: Math.floor(this.genome[42] * 360) // Hue for accessories
        };
    }
    
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Set canvas to 32x32 for pixel art style
        const scale = Math.min(width, height) / 32;
        ctx.save();
        ctx.scale(scale, scale);
        ctx.imageSmoothingEnabled = false; // Crisp pixel art
        
        const params = this.getParameters();
        
        // Helper function to draw filled circle
        const drawCircle = (x, y, radius, color) => {
            ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.beginPath();
            ctx.arc(x * 32, y * 32, radius * 32, 0, Math.PI * 2);
            ctx.fill();
        };
        
        // Helper function to draw line with thickness
        const drawThickLine = (x1, y1, x2, y2, thickness, color) => {
            ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.lineWidth = thickness * 32;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1 * 32, y1 * 32);
            ctx.lineTo(x2 * 32, y2 * 32);
            ctx.stroke();
        };
        
        // Draw body first (behind everything)
        const bodyX = params.bodyX * 32;
        const bodyY = params.bodyY * 32;
        const bodyW = params.bodyWidth * 32;
        const bodyH = params.bodyHeight * 32;
        
        ctx.fillStyle = `rgb(${params.bodyColor.r}, ${params.bodyColor.g}, ${params.bodyColor.b})`;
        ctx.fillRect(bodyX - bodyW/2, bodyY - bodyH/2, bodyW, bodyH);
        
        // Draw arms
        const armEndY = params.leftArmY + 0.15; // Arms extend down
        drawThickLine(params.leftArmX, params.leftArmY, params.leftArmX - 0.1, armEndY, params.armThickness, params.limbColor);
        drawThickLine(params.rightArmX, params.rightArmY, params.rightArmX + 0.1, armEndY, params.armThickness, params.limbColor);
        
        // Draw legs
        const legEndY = params.leftLegY + 0.2; // Legs extend down
        drawThickLine(params.leftLegX, params.leftLegY, params.leftLegX, legEndY, params.legThickness, params.limbColor);
        drawThickLine(params.rightLegX, params.rightLegY, params.rightLegX, legEndY, params.legThickness, params.limbColor);
        
        // Draw feet (small circles at end of legs)
        drawCircle(params.leftLegX, legEndY + 0.02, 0.02, params.limbColor);
        drawCircle(params.rightLegX, legEndY + 0.02, 0.02, params.limbColor);
        
        // Draw hands (small circles at end of arms)
        drawCircle(params.leftArmX - 0.1, armEndY, 0.015, params.limbColor);
        drawCircle(params.rightArmX + 0.1, armEndY, 0.015, params.limbColor);
        
        // Draw head
        const headRadius = params.headSize * 0.15;
        if (params.headShape > 0.5) {
            // Oval head
            ctx.fillStyle = `rgb(${params.headColor.r}, ${params.headColor.g}, ${params.headColor.b})`;
            ctx.save();
            ctx.translate(params.headX * 32, params.headY * 32);
            ctx.scale(1, 1.2);
            ctx.beginPath();
            ctx.arc(0, 0, headRadius * 32, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            // Round head
            drawCircle(params.headX, params.headY, headRadius, params.headColor);
        }
        
        // Draw ears if enabled
        if (params.hasEars) {
            const earSize = headRadius * 0.3;
            drawCircle(params.headX - headRadius * 0.8, params.headY, earSize, params.headColor);
            drawCircle(params.headX + headRadius * 0.8, params.headY, earSize, params.headColor);
        }
        
        // Draw hair if enabled
        if (params.hasHair && !params.hasHat) {
            ctx.fillStyle = `hsl(${params.hairColor}, 60%, 40%)`;
            ctx.beginPath();
            ctx.arc(params.headX * 32, (params.headY - headRadius * 0.8) * 32, headRadius * 32 * 1.1, 0, Math.PI);
            ctx.fill();
        }
        
        // Draw hat if enabled
        if (params.hasHat) {
            ctx.fillStyle = `hsl(${params.hairColor}, 70%, 30%)`;
            const hatY = (params.headY - headRadius * 0.9) * 32;
            ctx.fillRect((params.headX - headRadius * 1.2) * 32, hatY - 8, headRadius * 2.4 * 32, 12);
            ctx.fillRect((params.headX - headRadius * 0.8) * 32, hatY - 15, headRadius * 1.6 * 32, 8);
        }
        
        // Draw eyes
        const eyeColor = { r: 0, g: 0, b: 0 }; // Black eyes
        const eyeSize = params.eyeSize;
        
        switch (params.eyeType) {
            case 0: // Dots
                drawCircle(params.leftEyeX, params.leftEyeY, eyeSize, eyeColor);
                drawCircle(params.rightEyeX, params.rightEyeY, eyeSize, eyeColor);
                break;
            case 1: // Larger circles
                drawCircle(params.leftEyeX, params.leftEyeY, eyeSize * 1.5, { r: 255, g: 255, b: 255 });
                drawCircle(params.leftEyeX, params.leftEyeY, eyeSize * 0.8, eyeColor);
                drawCircle(params.rightEyeX, params.rightEyeY, eyeSize * 1.5, { r: 255, g: 255, b: 255 });
                drawCircle(params.rightEyeX, params.rightEyeY, eyeSize * 0.8, eyeColor);
                break;
            case 2: // Winking
                drawCircle(params.leftEyeX, params.leftEyeY, eyeSize, eyeColor);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(params.rightEyeX * 32, params.rightEyeY * 32, eyeSize * 32, 0, Math.PI);
                ctx.stroke();
                break;
        }
        
        // Draw mouth
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        const mouthX = params.mouthX * 32;
        const mouthY = params.mouthY * 32;
        const mouthSize = 6;
        
        switch (params.mouthType) {
            case 0: // Smile
                ctx.beginPath();
                ctx.arc(mouthX, mouthY - 2, mouthSize, 0, Math.PI);
                ctx.stroke();
                break;
            case 1: // Straight line
                ctx.beginPath();
                ctx.moveTo(mouthX - mouthSize, mouthY);
                ctx.lineTo(mouthX + mouthSize, mouthY);
                ctx.stroke();
                break;
            case 2: // Open mouth (circle)
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(mouthX, mouthY, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 3: // Frown
                ctx.beginPath();
                ctx.arc(mouthX, mouthY + 2, mouthSize, Math.PI, 0);
                ctx.stroke();
                break;
        }
        
        // Draw teeth if enabled and mouth is open
        if (params.hasTeeth && params.mouthType === 2) {
            ctx.fillStyle = 'white';
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(mouthX - 2 + i * 1.5, mouthY - 1, 1, 2);
            }
        }
        
        // Draw sword if enabled
        if (params.hasSword) {
            ctx.strokeStyle = `hsl(${params.accessoryColor}, 60%, 40%)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo((params.rightArmX + 0.1) * 32, (armEndY - 0.05) * 32);
            ctx.lineTo((params.rightArmX + 0.15) * 32, (armEndY + 0.1) * 32);
            ctx.stroke();
            
            // Sword handle
            ctx.strokeStyle = `hsl(${params.accessoryColor + 60}, 60%, 30%)`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo((params.rightArmX + 0.15) * 32, (armEndY + 0.1) * 32);
            ctx.lineTo((params.rightArmX + 0.15) * 32, (armEndY + 0.13) * 32);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                // Add Gaussian noise for smooth mutations
                const noise = (Math.random() - 0.5) * 0.2;
                this.genome[i] = Math.max(0, Math.min(1, this.genome[i] + noise));
            }
        }
        this.invalidateImageCache();
    }
    
    crossover(other) {
        const child1Genome = [];
        const child2Genome = [];
        
        // Use uniform crossover
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(this.genome[i]);
                child2Genome.push(other.genome[i]);
            } else {
                child1Genome.push(other.genome[i]);
                child2Genome.push(this.genome[i]);
            }
        }
        
        const child1 = new CharacterIndividual(child1Genome);
        const child2 = new CharacterIndividual(child2Genome);
        
        return [child1, child2];
    }
    
    clone() {
        const clone = new CharacterIndividual([...this.genome]);
        clone.fitness = this.fitness;
        return clone;
    }
    
    getPhenotype() {
        const params = this.getParameters();
        const features = [];
        
        if (params.hasHair) features.push("hair");
        if (params.hasEars) features.push("ears");
        if (params.hasTeeth) features.push("teeth");
        if (params.hasHat) features.push("hat");
        if (params.hasSword) features.push("sword");
        
        const eyeTypes = ["dots", "big", "wink"];
        const mouthTypes = ["smile", "line", "open", "frown"];
        
        return `Character: ${eyeTypes[params.eyeType]} eyes, ${mouthTypes[params.mouthType]} mouth${features.length > 0 ? ", " + features.join(", ") : ""}`;
    }
}
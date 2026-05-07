class CharacterIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.genomeLength = 43; // Fixed-length genome for character features
        this.genome = genome || this.generateRandomGenome();
    }
    
    generateRandomGenome() {
        return [
            // Head (4 params)
            Math.random() * 0.2 + 0.6,      // 0: head size (0.6-0.8)
            Math.random() * 0.2 + 0.4,      // 1: head x position (0.4-0.6)
            Math.random() * 0.1 + 0.1,      // 2: head y position (0.1-0.2, will be calculated relative to body)
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
            Math.random() * 0.15 + 0.15,    // 16: body width (0.15-0.3)
            Math.random() * 0.15 + 0.2,     // 17: body height (0.2-0.35)
            Math.random() * 0.2 + 0.4,      // 18: body x (0.4-0.6)
            Math.random() * 0.1 + 0.45,     // 19: body y (0.45-0.55)
            
            // Body color (3 params)
            Math.random(),                   // 20: body color R
            Math.random(),                   // 21: body color G
            Math.random(),                   // 22: body color B
            
            // Arms (5 params)
            Math.random() * 0.1 + 0.2,      // 23: left arm start x (0.2-0.3, relative to body)
            Math.random() * 0.05 + 0.45,    // 24: left arm start y (0.45-0.5, at body top)
            Math.random() * 0.1 + 0.5,      // 25: right arm start x (0.5-0.6, relative to body)
            Math.random() * 0.05 + 0.45,    // 26: right arm start y (0.45-0.5, at body top)
            Math.random() * 0.02 + 0.008,   // 27: arm thickness (0.008-0.028)
            
            // Legs (5 params)
            Math.random() * 0.06 + 0.37,    // 28: left leg start x (0.37-0.43, at body bottom left)
            Math.random() * 0.05 + 0.58,    // 29: left leg start y (0.58-0.63, at body bottom)
            Math.random() * 0.06 + 0.57,    // 30: right leg start x (0.57-0.63, at body bottom right)
            Math.random() * 0.05 + 0.58,    // 31: right leg start y (0.58-0.63, at body bottom)
            Math.random() * 0.02 + 0.008,   // 32: leg thickness (0.008-0.028)
            
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

        const params = this.getParameters();

        // Helper function to draw filled circle
        const drawCircle = (x, y, radius, color) => {
            ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        };

        // Helper function to draw line with thickness
        const drawThickLine = (x1, y1, x2, y2, thickness, color) => {
            ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.lineWidth = thickness;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        };

        // Calculate positions in pixel space (canvas coordinates)
        const scale = Math.min(width, height);

        // Body in pixel space
        const bodyX = params.bodyX * scale;
        const bodyY = params.bodyY * scale;
        const bodyW = params.bodyWidth * scale;
        const bodyH = params.bodyHeight * scale;

        // Head positioned on top of body
        const headRadius = (params.headSize * 0.12) * scale;
        const headX = params.headX * scale;
        const headY = (params.bodyY - params.bodyHeight * 0.5 - headRadius * 0.15) * scale;

        // Draw body first (behind everything)
        ctx.fillStyle = `rgb(${params.bodyColor.r}, ${params.bodyColor.g}, ${params.bodyColor.b})`;
        ctx.fillRect(bodyX - bodyW/2, bodyY - bodyH/2, bodyW, bodyH);

        // Draw arms
        const leftArmStartX = params.leftArmX * scale;
        const leftArmStartY = params.leftArmY * scale;
        const rightArmStartX = params.rightArmX * scale;
        const rightArmStartY = params.rightArmY * scale;
        const armThickness = params.armThickness * scale;
        const armLength = 0.15 * scale;

        drawThickLine(leftArmStartX, leftArmStartY, leftArmStartX - armLength, leftArmStartY + armLength * 0.6, armThickness, params.limbColor);
        drawThickLine(rightArmStartX, rightArmStartY, rightArmStartX + armLength, rightArmStartY + armLength * 0.6, armThickness, params.limbColor);

        // Draw legs
        const leftLegStartX = params.leftLegX * scale;
        const leftLegStartY = params.leftLegY * scale;
        const rightLegStartX = params.rightLegX * scale;
        const rightLegStartY = params.rightLegY * scale;
        const legThickness = params.legThickness * scale;
        const legLength = 0.25 * scale;

        drawThickLine(leftLegStartX, leftLegStartY, leftLegStartX, leftLegStartY + legLength, legThickness, params.limbColor);
        drawThickLine(rightLegStartX, rightLegStartY, rightLegStartX, rightLegStartY + legLength, legThickness, params.limbColor);

        // Draw feet
        drawCircle(leftLegStartX, leftLegStartY + legLength + 0.01 * scale, 0.015 * scale, params.limbColor);
        drawCircle(rightLegStartX, rightLegStartY + legLength + 0.01 * scale, 0.015 * scale, params.limbColor);

        // Draw hands
        const leftHandX = leftArmStartX - armLength;
        const leftHandY = leftArmStartY + armLength * 0.6;
        const rightHandX = rightArmStartX + armLength;
        const rightHandY = rightArmStartY + armLength * 0.6;
        drawCircle(leftHandX, leftHandY, 0.012 * scale, params.limbColor);
        drawCircle(rightHandX, rightHandY, 0.012 * scale, params.limbColor);

        // Draw head
        if (params.headShape > 0.5) {
            // Oval head
            ctx.fillStyle = `rgb(${params.headColor.r}, ${params.headColor.g}, ${params.headColor.b})`;
            ctx.save();
            ctx.translate(headX, headY);
            ctx.scale(1, 1.2);
            ctx.beginPath();
            ctx.arc(0, 0, headRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            // Round head
            drawCircle(headX, headY, headRadius, params.headColor);
        }

        // Draw ears if enabled
        if (params.hasEars) {
            const earSize = headRadius * 0.4;
            drawCircle(headX - headRadius * 0.9, headY, earSize, params.headColor);
            drawCircle(headX + headRadius * 0.9, headY, earSize, params.headColor);
        }

        // Draw hair if enabled
        if (params.hasHair && !params.hasHat) {
            ctx.fillStyle = `hsl(${params.hairColor}, 60%, 40%)`;
            ctx.beginPath();
            ctx.arc(headX, headY - headRadius * 0.7, headRadius * 1.15, 0, Math.PI);
            ctx.fill();
        }

        // Draw hat if enabled
        if (params.hasHat) {
            ctx.fillStyle = `hsl(${params.hairColor}, 70%, 30%)`;
            const hatTopY = headY - headRadius * 1.1;
            const hatWidth = headRadius * 2.4;
            const hatBrimHeight = headRadius * 0.35;
            const hatTopHeight = headRadius * 0.45;
            // Brim
            ctx.fillRect(headX - hatWidth/2, hatTopY, hatWidth, hatBrimHeight);
            // Crown
            ctx.fillRect(headX - hatWidth * 0.35, hatTopY - hatTopHeight, hatWidth * 0.7, hatTopHeight);
        }
        
        // Draw eyes
        const eyeColor = { r: 0, g: 0, b: 0 };
        const eyeSize = params.eyeSize * scale * 0.5;
        const leftEyeX = params.leftEyeX * scale;
        const leftEyeY = params.leftEyeY * scale;
        const rightEyeX = params.rightEyeX * scale;
        const rightEyeY = params.rightEyeY * scale;

        switch (params.eyeType) {
            case 0: // Dots
                drawCircle(leftEyeX, leftEyeY, eyeSize, eyeColor);
                drawCircle(rightEyeX, rightEyeY, eyeSize, eyeColor);
                break;
            case 1: // Larger circles with pupils
                drawCircle(leftEyeX, leftEyeY, eyeSize * 1.8, { r: 255, g: 255, b: 255 });
                drawCircle(leftEyeX, leftEyeY, eyeSize * 0.7, eyeColor);
                drawCircle(rightEyeX, rightEyeY, eyeSize * 1.8, { r: 255, g: 255, b: 255 });
                drawCircle(rightEyeX, rightEyeY, eyeSize * 0.7, eyeColor);
                break;
            case 2: // Winking
                drawCircle(leftEyeX, leftEyeY, eyeSize, eyeColor);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = eyeSize * 0.4;
                ctx.beginPath();
                ctx.arc(rightEyeX, rightEyeY, eyeSize * 1.2, 0, Math.PI);
                ctx.stroke();
                break;
        }

        // Draw mouth
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(1, scale * 0.015);
        ctx.lineCap = 'round';

        const mouthX = params.mouthX * scale;
        const mouthY = params.mouthY * scale;
        const mouthSize = scale * 0.04;

        switch (params.mouthType) {
            case 0: // Smile
                ctx.beginPath();
                ctx.arc(mouthX, mouthY, mouthSize, 0, Math.PI);
                ctx.stroke();
                break;
            case 1: // Straight line
                ctx.beginPath();
                ctx.moveTo(mouthX - mouthSize, mouthY);
                ctx.lineTo(mouthX + mouthSize, mouthY);
                ctx.stroke();
                break;
            case 2: // Open mouth
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(mouthX, mouthY, mouthSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 3: // Frown
                ctx.beginPath();
                ctx.arc(mouthX, mouthY, mouthSize, Math.PI, 0);
                ctx.stroke();
                break;
        }

        // Draw teeth if enabled and mouth is open
        if (params.hasTeeth && params.mouthType === 2) {
            ctx.fillStyle = 'white';
            const toothWidth = mouthSize * 0.3;
            const toothHeight = mouthSize * 0.5;
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(mouthX - mouthSize*0.7 + i * toothWidth * 1.5, mouthY - toothHeight*0.3, toothWidth, toothHeight);
            }
        }

        // Draw sword if enabled
        if (params.hasSword) {
            const swordBaseX = rightHandX;
            const swordBaseY = rightHandY;
            const swordLength = 0.2 * scale;
            const swordAngle = -Math.PI / 4; // 45 degree angle upward

            const swordTipX = swordBaseX + Math.cos(swordAngle) * swordLength;
            const swordTipY = swordBaseY + Math.sin(swordAngle) * swordLength;

            // Sword blade
            ctx.strokeStyle = `hsl(${params.accessoryColor}, 80%, 50%)`;
            ctx.lineWidth = Math.max(2, scale * 0.02);
            ctx.beginPath();
            ctx.moveTo(swordBaseX, swordBaseY);
            ctx.lineTo(swordTipX, swordTipY);
            ctx.stroke();

            // Sword handle/guard
            ctx.strokeStyle = `hsl(${(params.accessoryColor + 60) % 360}, 70%, 30%)`;
            ctx.lineWidth = Math.max(2.5, scale * 0.025);
            const guardStartX = swordBaseX + Math.cos(swordAngle) * swordLength * 0.2;
            const guardStartY = swordBaseY + Math.sin(swordAngle) * swordLength * 0.2;
            const guardLength = scale * 0.04;
            ctx.beginPath();
            ctx.moveTo(guardStartX - guardLength, guardStartY);
            ctx.lineTo(guardStartX + guardLength, guardStartY);
            ctx.stroke();
        }
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
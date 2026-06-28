// PTO generator: builds the 43-gene parameter vector, each gene drawn from its
// own range (same ranges as the old generateRandomGenome). PTORepresentation's
// default 'fine' mutation is Gaussian creep within each gene's range — the
// interactive feel the old FloatRepresentation had.
const robotGenerator = (rnd) => [
    // Head (4)
    rnd.uniform(0.6, 0.9),   // 0: head size
    rnd.uniform(0.4, 0.6),   // 1: head x
    rnd.uniform(0.15, 0.30), // 2: head y
    rnd.uniform(0, 1),       // 3: head shape
    // Head color (3)
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), // 4-6
    // Eyes (6)
    rnd.uniform(0, 1),       // 7: eye type
    rnd.uniform(0.35, 0.45), // 8: left eye x
    rnd.uniform(0.2, 0.3),   // 9: left eye y
    rnd.uniform(0.55, 0.65), // 10: right eye x
    rnd.uniform(0.2, 0.3),   // 11: right eye y
    rnd.uniform(0.02, 0.07), // 12: eye size
    // Mouth (3)
    rnd.uniform(0, 1),       // 13: mouth type
    rnd.uniform(0.45, 0.55), // 14: mouth x
    rnd.uniform(0.35, 0.45), // 15: mouth y
    // Body (4)
    rnd.uniform(0.3, 0.5),   // 16: body width
    rnd.uniform(0.3, 0.6),   // 17: body height
    rnd.uniform(0.45, 0.55), // 18: body x
    rnd.uniform(0.5, 0.6),   // 19: body y
    // Body color (3)
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), // 20-22
    // Arms (5)
    rnd.uniform(0.25, 0.4),  // 23: left arm x
    rnd.uniform(0.55, 0.65), // 24: left arm y
    rnd.uniform(0.6, 0.75),  // 25: right arm x
    rnd.uniform(0.55, 0.65), // 26: right arm y
    rnd.uniform(0.01, 0.04), // 27: arm thickness
    // Legs (5)
    rnd.uniform(0.4, 0.5),   // 28: left leg x
    rnd.uniform(0.75, 0.85), // 29: left leg y
    rnd.uniform(0.5, 0.6),   // 30: right leg x
    rnd.uniform(0.75, 0.85), // 31: right leg y
    rnd.uniform(0.01, 0.04), // 32: leg thickness
    // Limb color (3)
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), // 33-35
    // Feature flags (4): hair, ears, teeth, hat
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), // 36-39
    // Accessories (3): sword flag, hair/hat color, accessory color
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1) // 40-42
];

const robotRepresentation = new PTORepresentation(robotGenerator);

class RobotIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = robotRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    getParameters() {
        return {
            // Head
            headSize: this.phenotype[0],
            headX: this.phenotype[1],
            headY: this.phenotype[2],
            headShape: this.phenotype[3],
            headColor: {
                r: Math.floor(this.phenotype[4] * 255),
                g: Math.floor(this.phenotype[5] * 255),
                b: Math.floor(this.phenotype[6] * 255)
            },
            
            // Eyes
            eyeType: Math.floor(this.phenotype[7] * 3), // 3 eye types
            leftEyeX: this.phenotype[8],
            leftEyeY: this.phenotype[9],
            rightEyeX: this.phenotype[10],
            rightEyeY: this.phenotype[11],
            eyeSize: this.phenotype[12],
            
            // Mouth
            mouthType: Math.floor(this.phenotype[13] * 4), // 4 mouth types
            mouthX: this.phenotype[14],
            mouthY: this.phenotype[15],
            
            // Body
            bodyWidth: this.phenotype[16],
            bodyHeight: this.phenotype[17],
            bodyX: this.phenotype[18],
            bodyY: this.phenotype[19],
            bodyColor: {
                r: Math.floor(this.phenotype[20] * 255),
                g: Math.floor(this.phenotype[21] * 255),
                b: Math.floor(this.phenotype[22] * 255)
            },
            
            // Arms
            leftArmX: this.phenotype[23],
            leftArmY: this.phenotype[24],
            rightArmX: this.phenotype[25],
            rightArmY: this.phenotype[26],
            armThickness: this.phenotype[27],
            
            // Legs
            leftLegX: this.phenotype[28],
            leftLegY: this.phenotype[29],
            rightLegX: this.phenotype[30],
            rightLegY: this.phenotype[31],
            legThickness: this.phenotype[32],
            
            // Limb color
            limbColor: {
                r: Math.floor(this.phenotype[33] * 255),
                g: Math.floor(this.phenotype[34] * 255),
                b: Math.floor(this.phenotype[35] * 255)
            },
            
            // Features
            hasHair: this.phenotype[36] > 0.5,
            hasEars: this.phenotype[37] > 0.5,
            hasTeeth: this.phenotype[38] > 0.5,
            hasHat: this.phenotype[39] > 0.5,
            hasSword: this.phenotype[40] > 0.5,
            
            // Colors
            hairColor: Math.floor(this.phenotype[41] * 360), // Hue for hair/hat
            accessoryColor: Math.floor(this.phenotype[42] * 360) // Hue for accessories
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
class SheepIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.genomeLength = 8; // 8 input genes for neural network
        this.genome = genome || this.generateRandomGenome();
        
        // Neural network architecture: 8 inputs -> 6 hidden -> 8 outputs
        this.hiddenSize = 6;
        this.outputSize = 8;
        
        // Initialize random neural network weights
        this.initializeNeuralNetwork();
    }
    
    generateRandomGenome() {
        // 8 input genes (will be fed to neural network)
        return Array(8).fill(0).map(() => Math.random());
    }
    
    initializeNeuralNetwork() {
        // Weights from input (8) to hidden (6)
        this.weightsInputHidden = [];
        for (let h = 0; h < this.hiddenSize; h++) {
            this.weightsInputHidden[h] = [];
            for (let i = 0; i < this.genomeLength; i++) {
                this.weightsInputHidden[h][i] = (Math.random() - 0.5) * 2; // Range: -1 to 1
            }
        }
        
        // Hidden layer biases
        this.hiddenBiases = Array(this.hiddenSize).fill(0).map(() => (Math.random() - 0.5) * 2);
        
        // Weights from hidden (6) to output (8)
        this.weightsHiddenOutput = [];
        for (let o = 0; o < this.outputSize; o++) {
            this.weightsHiddenOutput[o] = [];
            for (let h = 0; h < this.hiddenSize; h++) {
                this.weightsHiddenOutput[o][h] = (Math.random() - 0.5) * 2; // Range: -1 to 1
            }
        }
        
        // Output layer biases
        this.outputBiases = Array(this.outputSize).fill(0).map(() => (Math.random() - 0.5) * 2);
    }
    
    // Tanh activation function
    tanh(x) {
        return Math.tanh(x);
    }
    
    // Forward pass through neural network
    forwardPass(inputs) {
        // Calculate hidden layer activations
        const hiddenActivations = [];
        for (let h = 0; h < this.hiddenSize; h++) {
            let sum = this.hiddenBiases[h];
            for (let i = 0; i < inputs.length; i++) {
                sum += inputs[i] * this.weightsInputHidden[h][i];
            }
            hiddenActivations[h] = this.tanh(sum);
        }
        
        // Calculate output layer activations
        const outputs = [];
        for (let o = 0; o < this.outputSize; o++) {
            let sum = this.outputBiases[o];
            for (let h = 0; h < this.hiddenSize; h++) {
                sum += hiddenActivations[h] * this.weightsHiddenOutput[o][h];
            }
            outputs[o] = this.tanh(sum);
        }
        
        return outputs;
    }
    
    // Convert neural network outputs to sheep phenotype
    getPhenotype() {
        const outputs = this.forwardPass(this.genome);
        
        return {
            woolColor: Math.max(0.2, Math.min(0.9, (outputs[0] + 1) / 2)), // 0.2-0.9 (light gray to white)
            curliness: Math.max(0, Math.min(1, (outputs[1] + 1) / 2)), // 0-1 (straight to very curly)
            faceColor: Math.max(0.3, Math.min(1, (outputs[2] + 1) / 2)), // 0.3-1 (gray to white)
            smileAmount: Math.max(0, Math.min(1, (outputs[3] + 1) / 2)), // 0-1 (frown to big smile)
            legLength: Math.max(0.6, Math.min(1.4, outputs[4] + 1)), // 0.6-1.4 (short to long legs)
            bodySize: Math.max(0.7, Math.min(1.3, outputs[5] + 1)), // 0.7-1.3 (small to large body)
            earShape: Math.max(0, Math.min(1, (outputs[6] + 1) / 2)), // 0-1 (pointy to floppy ears)
            tailCurl: Math.max(0, Math.min(1, (outputs[7] + 1) / 2)) // 0-1 (straight to curly tail)
        };
    }
    
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const phenotype = this.getPhenotype();
        
        // Set up coordinate system (sheep facing right)
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = Math.min(width, height) / 200; // Base scale
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        
        // Draw sheep with cartoon outline style
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        this.drawSheep(ctx, phenotype);
        
        ctx.restore();
    }
    
    drawSheep(ctx, phenotype) {
        const bodySize = phenotype.bodySize;
        const legLength = phenotype.legLength;
        
        // Colors
        const woolGray = Math.floor(phenotype.woolColor * 255);
        const faceGray = Math.floor(phenotype.faceColor * 255);
        const woolColor = `rgb(${woolGray}, ${woolGray}, ${woolGray})`;
        const faceColor = `rgb(${faceGray}, ${faceGray}, ${faceGray})`;
        
        // Draw back legs first (behind body)
        this.drawBackLegs(ctx, legLength);
        
        // Draw fluffy body with organic curves
        this.drawFluffyBody(ctx, bodySize, phenotype.curliness, woolColor);
        
        // Draw front legs (in front of body)
        this.drawFrontLegs(ctx, legLength);
        
        // Draw expressive head with character
        this.drawCartoonHead(ctx, faceColor, phenotype.smileAmount, phenotype.earShape);
        
        // Draw integrated tail as part of body silhouette
        this.drawFluffyTail(ctx, phenotype.tailCurl, woolColor);
    }
    
    drawBackLegs(ctx, legLength) {
        const legColor = '#2C3E50';
        ctx.fillStyle = legColor;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        // Back legs (left and right)
        const backLegPositions = [
            [-15, 25], // Back left
            [5, 25]    // Back right
        ];
        
        backLegPositions.forEach(([x, y]) => {
            // Organic leg shape using curves
            const legHeight = 35 * legLength;
            const legWidth = 12;
            
            ctx.beginPath();
            ctx.moveTo(x - legWidth/2, y);
            ctx.quadraticCurveTo(x - legWidth/2, y + legHeight/2, x - legWidth/3, y + legHeight - 8);
            ctx.lineTo(x + legWidth/3, y + legHeight - 8);
            ctx.quadraticCurveTo(x + legWidth/2, y + legHeight/2, x + legWidth/2, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Cute hooves with rounded shape
            ctx.beginPath();
            ctx.ellipse(x, y + legHeight - 3, 8, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }
    
    drawFrontLegs(ctx, legLength) {
        const legColor = '#2C3E50';
        ctx.fillStyle = legColor;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        // Front legs positioned more forward
        const frontLegPositions = [
            [25, 25], // Front left
            [40, 25]  // Front right
        ];
        
        frontLegPositions.forEach(([x, y]) => {
            // Organic leg shape
            const legHeight = 35 * legLength;
            const legWidth = 12;
            
            ctx.beginPath();
            ctx.moveTo(x - legWidth/2, y);
            ctx.quadraticCurveTo(x - legWidth/2, y + legHeight/2, x - legWidth/3, y + legHeight - 8);
            ctx.lineTo(x + legWidth/3, y + legHeight - 8);
            ctx.quadraticCurveTo(x + legWidth/2, y + legHeight/2, x + legWidth/2, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Hooves
            ctx.beginPath();
            ctx.ellipse(x, y + legHeight - 3, 8, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }
    
    drawFluffyBody(ctx, bodySize, curliness, woolColor) {
        ctx.fillStyle = woolColor;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        const baseWidth = 50 * bodySize;
        const baseHeight = 35 * bodySize;
        
        // Create fluffy cloud-like body using bezier curves
        ctx.beginPath();
        
        // Start at top and create bumpy, fluffy outline
        const fluffiness = 0.3 + curliness * 0.4; // More curly = more bumps
        const numBumps = 12;
        
        for (let i = 0; i <= numBumps; i++) {
            const angle = (i / numBumps) * Math.PI * 2;
            const nextAngle = ((i + 1) / numBumps) * Math.PI * 2;
            
            // Base radius with variation for body shape
            let radiusX = baseWidth * (0.7 + 0.3 * Math.cos(angle * 2));
            let radiusY = baseHeight * (0.8 + 0.2 * Math.sin(angle * 3));
            
            // Add fluffy bumps
            const bumpSize = fluffiness * 12;
            radiusX += bumpSize * Math.sin(angle * 7);
            radiusY += bumpSize * Math.cos(angle * 5);
            
            const x = radiusX * Math.cos(angle);
            const y = radiusY * Math.sin(angle);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                // Use bezier curves for smooth, organic transitions
                const prevAngle = ((i - 1) / numBumps) * Math.PI * 2;
                const prevRadiusX = baseWidth * (0.7 + 0.3 * Math.cos(prevAngle * 2)) + bumpSize * Math.sin(prevAngle * 7);
                const prevRadiusY = baseHeight * (0.8 + 0.2 * Math.sin(prevAngle * 3)) + bumpSize * Math.cos(prevAngle * 5);
                
                const cp1x = prevRadiusX * Math.cos(prevAngle) * 1.1;
                const cp1y = prevRadiusY * Math.sin(prevAngle) * 1.1;
                const cp2x = radiusX * Math.cos(angle) * 1.1;
                const cp2y = radiusY * Math.sin(angle) * 1.1;
                
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
            }
        }
        
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Add integrated wool texture for high curliness
        if (curliness > 0.5) {
            this.drawWoolTexture(ctx, bodySize, curliness, woolColor);
        }
    }
    
    drawWoolTexture(ctx, bodySize, curliness, woolColor) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.fillStyle = woolColor;
        
        // Draw organic wool swirls instead of circles
        const numSwirls = Math.floor(curliness * 6);
        for (let i = 0; i < numSwirls; i++) {
            const x = (Math.random() - 0.5) * 60 * bodySize;
            const y = (Math.random() - 0.5) * 40 * bodySize;
            const size = 4 + curliness * 8;
            const turns = 1 + curliness * 2;
            
            // Draw spiral wool curl
            ctx.beginPath();
            for (let t = 0; t <= turns * Math.PI * 2; t += 0.3) {
                const r = size * (1 - t / (turns * Math.PI * 2));
                const spiralX = x + r * Math.cos(t);
                const spiralY = y + r * Math.sin(t);
                
                if (t === 0) {
                    ctx.moveTo(spiralX, spiralY);
                } else {
                    ctx.lineTo(spiralX, spiralY);
                }
            }
            ctx.stroke();
        }
    }
    
    drawCartoonHead(ctx, faceColor, smileAmount, earShape) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        // Head positioned to emerge from body
        const headX = 45;
        const headY = -15;
        
        // Draw ears first (behind head)
        this.drawCartoonEars(ctx, headX, headY, earShape, faceColor);
        
        // Draw rounded, cartoon head shape
        ctx.fillStyle = faceColor;
        ctx.beginPath();
        ctx.moveTo(headX - 22, headY);
        ctx.bezierCurveTo(headX - 22, headY - 18, headX - 5, headY - 25, headX + 8, headY - 22);
        ctx.bezierCurveTo(headX + 25, headY - 18, headX + 28, headY - 5, headX + 25, headY + 8);
        ctx.bezierCurveTo(headX + 20, headY + 18, headX, headY + 20, headX - 15, headY + 15);
        ctx.bezierCurveTo(headX - 25, headY + 8, headX - 22, headY - 5, headX - 22, headY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw expressive cartoon eyes
        this.drawCartoonEyes(ctx, headX, headY, smileAmount);
        
        // Draw cute nose
        this.drawSheepNose(ctx, headX, headY);
        
        // Draw expressive mouth
        this.drawCartoonMouth(ctx, headX, headY, smileAmount);
    }
    
    drawCartoonEars(ctx, headX, headY, earShape, faceColor) {
        ctx.fillStyle = faceColor;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        if (earShape < 0.4) {
            // Perky pointed ears
            ctx.beginPath();
            ctx.moveTo(headX - 18, headY - 12);
            ctx.bezierCurveTo(headX - 22, headY - 20, headX - 20, headY - 28, headX - 15, headY - 25);
            ctx.bezierCurveTo(headX - 12, headY - 22, headX - 14, headY - 15, headX - 16, headY - 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(headX - 5, headY - 12);
            ctx.bezierCurveTo(headX - 9, headY - 20, headX - 7, headY - 28, headX - 2, headY - 25);
            ctx.bezierCurveTo(headX + 1, headY - 22, headX - 1, headY - 15, headX - 3, headY - 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (earShape < 0.7) {
            // Medium floppy ears
            ctx.beginPath();
            ctx.moveTo(headX - 18, headY - 12);
            ctx.bezierCurveTo(headX - 25, headY - 15, headX - 28, headY - 8, headX - 25, headY + 2);
            ctx.bezierCurveTo(headX - 20, headY + 5, headX - 15, headY - 2, headX - 16, headY - 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(headX - 5, headY - 12);
            ctx.bezierCurveTo(headX - 12, headY - 15, headX - 15, headY - 8, headX - 12, headY + 2);
            ctx.bezierCurveTo(headX - 7, headY + 5, headX - 2, headY - 2, headX - 3, headY - 8);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Very floppy, droopy ears
            ctx.beginPath();
            ctx.moveTo(headX - 18, headY - 8);
            ctx.bezierCurveTo(headX - 28, headY - 5, headX - 30, headY + 8, headX - 22, headY + 15);
            ctx.bezierCurveTo(headX - 18, headY + 12, headX - 15, headY + 5, headX - 16, headY - 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(headX - 5, headY - 8);
            ctx.bezierCurveTo(headX - 15, headY - 5, headX - 17, headY + 8, headX - 9, headY + 15);
            ctx.bezierCurveTo(headX - 5, headY + 12, headX - 2, headY + 5, headX - 3, headY - 5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }
    
    drawCartoonEyes(ctx, headX, headY, smileAmount) {
        // Eye whites
        ctx.fillStyle = '#FFF';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        // Left eye
        ctx.beginPath();
        ctx.ellipse(headX + 5, headY - 8, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Right eye
        ctx.beginPath();
        ctx.ellipse(headX + 18, headY - 8, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Eye pupils (affected by smile - happy eyes are different)
        ctx.fillStyle = '#000';
        const pupilOffset = smileAmount > 0.6 ? 2 : 0; // Happy eyes look slightly up
        
        ctx.beginPath();
        ctx.arc(headX + 7, headY - 8 - pupilOffset, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(headX + 20, headY - 8 - pupilOffset, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye highlights (makes them look alive)
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(headX + 8, headY - 10 - pupilOffset, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(headX + 21, headY - 10 - pupilOffset, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawSheepNose(ctx, headX, headY) {
        // Pink sheep nose
        ctx.fillStyle = '#FFB6C1';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.ellipse(headX + 12, headY - 2, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Nostrils
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(headX + 10, headY - 2, 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(headX + 14, headY - 2, 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawCartoonMouth(ctx, headX, headY, smileAmount) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        const mouthY = headY + 5;
        
        if (smileAmount < 0.3) {
            // Sad/neutral mouth
            ctx.beginPath();
            ctx.moveTo(headX + 8, mouthY);
            ctx.quadraticCurveTo(headX + 12, mouthY + 3, headX + 16, mouthY);
            ctx.stroke();
        } else if (smileAmount < 0.7) {
            // Slight smile
            ctx.beginPath();
            ctx.moveTo(headX + 8, mouthY);
            ctx.quadraticCurveTo(headX + 12, mouthY - 2, headX + 16, mouthY);
            ctx.stroke();
        } else {
            // Big happy smile
            ctx.beginPath();
            ctx.moveTo(headX + 6, mouthY);
            ctx.quadraticCurveTo(headX + 12, mouthY - 5, headX + 18, mouthY);
            ctx.stroke();
            
            // Add a little tongue for extra cuteness
            ctx.fillStyle = '#FFB6C1';
            ctx.beginPath();
            ctx.ellipse(headX + 12, mouthY - 1, 2, 1.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
    
    drawFluffyTail(ctx, tailCurl, woolColor) {
        ctx.fillStyle = woolColor;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        
        const tailX = -45;
        const tailY = 5;
        
        if (tailCurl < 0.3) {
            // Short, fluffy straight tail
            ctx.beginPath();
            ctx.moveTo(tailX - 8, tailY - 3);
            ctx.bezierCurveTo(tailX - 12, tailY - 8, tailX - 10, tailY + 8, tailX - 6, tailY + 5);
            ctx.bezierCurveTo(tailX - 2, tailY + 8, tailX + 4, tailY + 6, tailX + 6, tailY + 2);
            ctx.bezierCurveTo(tailX + 8, tailY - 2, tailX + 6, tailY - 6, tailX + 2, tailY - 5);
            ctx.bezierCurveTo(tailX - 2, tailY - 8, tailX - 6, tailY - 6, tailX - 8, tailY - 3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Curly, fluffy tail with organic shape
            ctx.beginPath();
            const curlRadius = 12 + tailCurl * 8;
            const spiralTurns = tailCurl * 2;
            
            // Create curvy tail path with varying thickness
            for (let t = 0; t <= spiralTurns * Math.PI * 2; t += 0.15) {
                const progress = t / (spiralTurns * Math.PI * 2);
                const r = curlRadius * (1 - progress * 0.6); // Tail gets smaller towards end
                const thickness = 6 * (1 - progress * 0.5); // Varying thickness
                
                const centerX = tailX + r * Math.cos(t);
                const centerY = tailY + r * Math.sin(t);
                
                // Create fluffy outline points
                const fluffiness = 2 + tailCurl * 3;
                const numFluffPoints = 8;
                
                if (t === 0) {
                    ctx.moveTo(centerX + thickness, centerY);
                } else {
                    // Add small fluffy bumps around the spiral
                    for (let f = 0; f < numFluffPoints; f++) {
                        const fluffAngle = (f / numFluffPoints) * Math.PI * 2;
                        const fluffRadius = thickness + Math.sin(t * 5 + fluffAngle * 3) * fluffiness;
                        const fluffX = centerX + fluffRadius * Math.cos(fluffAngle);
                        const fluffY = centerY + fluffRadius * Math.sin(fluffAngle);
                        
                        if (f === 0 && t === 0.15) {
                            ctx.moveTo(fluffX, fluffY);
                        } else {
                            ctx.bezierCurveTo(
                                centerX + (fluffRadius * 0.8) * Math.cos(fluffAngle - 0.3),
                                centerY + (fluffRadius * 0.8) * Math.sin(fluffAngle - 0.3),
                                centerX + (fluffRadius * 0.8) * Math.cos(fluffAngle + 0.3),
                                centerY + (fluffRadius * 0.8) * Math.sin(fluffAngle + 0.3),
                                fluffX, fluffY
                            );
                        }
                    }
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Add extra fluffy texture to curly tails
            if (tailCurl > 0.6) {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                
                // Small wool curls on tail
                for (let i = 0; i < 3; i++) {
                    const t = (i / 3) * spiralTurns * Math.PI * 2;
                    const r = curlRadius * (1 - (i / 3) * 0.6);
                    const curlX = tailX + r * Math.cos(t);
                    const curlY = tailY + r * Math.sin(t);
                    
                    // Small spiral wool texture
                    ctx.beginPath();
                    for (let s = 0; s <= Math.PI * 3; s += 0.4) {
                        const sr = 2 * (1 - s / (Math.PI * 3));
                        const sx = curlX + sr * Math.cos(s);
                        const sy = curlY + sr * Math.sin(s);
                        
                        if (s === 0) {
                            ctx.moveTo(sx, sy);
                        } else {
                            ctx.lineTo(sx, sy);
                        }
                    }
                    ctx.stroke();
                }
            }
        }
    }
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                // Gaussian mutation
                const noise = (Math.random() - 0.5) * 0.3;
                this.genome[i] = Math.max(0, Math.min(1, this.genome[i] + noise));
            }
        }
        this.invalidateImageCache();
    }
    
    crossover(other) {
        const child1Genome = [];
        const child2Genome = [];
        
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < 0.5) {
                child1Genome.push(this.genome[i]);
                child2Genome.push(other.genome[i]);
            } else {
                child1Genome.push(other.genome[i]);
                child2Genome.push(this.genome[i]);
            }
        }
        
        const child1 = new SheepIndividual(child1Genome);
        const child2 = new SheepIndividual(child2Genome);
        
        // Children inherit parents' neural networks (could also mutate these)
        child1.initializeNeuralNetwork();
        child2.initializeNeuralNetwork();
        
        return [child1, child2];
    }
    
    clone() {
        const clone = new SheepIndividual([...this.genome]);
        clone.fitness = this.fitness;
        // Clone gets same neural network architecture but new random weights
        clone.initializeNeuralNetwork();
        return clone;
    }
    
    getPhenotypeString() {
        const p = this.getPhenotype();
        return `Sheep: wool=${p.woolColor.toFixed(2)}, smile=${p.smileAmount.toFixed(2)}, legs=${p.legLength.toFixed(2)}`;
    }
}
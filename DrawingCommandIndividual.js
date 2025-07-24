class DrawingCommandIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super(genome);
        // Remove hardcoded palette - will use framework palette instead
    }
    
    generateRandomGenome() {
        const length = 60;
        return Array.from({length}, () => Math.floor(Math.random() * 256));
    }
    
    getPhenotype() {
        const commands = [];
        const genome = this.genome;
        
        for (let i = 0; i < genome.length - 7; i += 8) {
            const commandType = genome[i] % 5; // Now 5 types
            const x = genome[i + 1] / 255;
            const y = genome[i + 2] / 255;
            const param1 = genome[i + 3] / 255;
            const param2 = genome[i + 4] / 255;
            const param3 = genome[i + 5] / 255;
            const param4 = genome[i + 6] / 255;
            const colorIndex = genome[i + 7] % 5; // Use palette index instead

            switch (commandType) {
                case 0: // CIRCLE
                    commands.push({
                        type: 'CIRCLE',
                        x: x,
                        y: y,
                        radius: param1 * 0.3,
                        colorIndex: colorIndex
                    });
                    break;

                case 1: // LINE
                    commands.push({
                        type: 'LINE',
                        x1: x,
                        y1: y,
                        x2: param1,
                        y2: param2,
                        width: param3 * 10 + 1,
                        colorIndex: colorIndex
                    });
                    break;

                case 2: // RECT
                    commands.push({
                        type: 'RECT',
                        x: x,
                        y: y,
                        width: param1 * 0.5,
                        height: param2 * 0.5,
                        colorIndex: colorIndex
                    });
                    break;

                case 3: // STROKE
                    commands.push({
                        type: 'STROKE',
                        x: x,
                        y: y,
                        width: param1 * 0.5,
                        height: param2 * 0.5,
                        strokeWidth: param3 * 8 + 1,
                        colorIndex: colorIndex
                    });
                    break;

                case 4: // ELLIPSE
                    commands.push({
                        type: 'ELLIPSE',
                        x: x,
                        y: y,
                        radiusX: param1 * 0.3,
                        radiusY: param2 * 0.2,
                        rotation: param3 * Math.PI * 2,
                        colorIndex: colorIndex
                    });
                    break;
            }
        }
        
        return commands;
    }
    
    visualize(canvas) {
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
            
            const commands = this.getPhenotype();
            
            commands.forEach(cmd => {
                // Get color from palette based on colorIndex
                const colorIndex = cmd.colorIndex / 4; // Normalize to [0,1]
                const color = this.interpolateColor(palette, colorIndex);
                
                switch (cmd.type) {
                    case 'CIRCLE':
                        this.drawCircle(data, width, height, 
                            cmd.x * width, 
                            cmd.y * height, 
                            cmd.radius * Math.min(width, height), 
                            color
                        );
                        break;
                        
                    case 'LINE':
                        this.drawLine(data, width, height,
                            cmd.x1 * width, cmd.y1 * height,
                            cmd.x2 * width, cmd.y2 * height,
                            color
                        );
                        break;
                        
                    case 'RECT':
                        this.drawRect(data, width, height,
                            cmd.x * width, cmd.y * height,
                            cmd.width * width, cmd.height * height,
                            color
                        );
                        break;
                        
                    case 'STROKE':
                        this.drawStrokeRect(data, width, height,
                            cmd.x * width, cmd.y * height,
                            cmd.width * width, cmd.height * height,
                            cmd.strokeWidth, color
                        );
                        break;

                    case 'ELLIPSE':
                        this.drawEllipse(data, width, height,
                            cmd.x * width, cmd.y * height,
                            cmd.radiusX * Math.min(width, height),
                            cmd.radiusY * Math.min(width, height),
                            cmd.rotation, color
                        );
                        break;
                }
            });
            
            return imageData;
        });
    }
    
    drawCircle(data, width, height, cx, cy, radius, color) {
        for (let y = Math.max(0, cy - radius); y < Math.min(height, cy + radius); y++) {
            for (let x = Math.max(0, cx - radius); x < Math.min(width, cx + radius); x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy <= radius * radius) {
                    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                    data[index] = color.r;
                    data[index + 1] = color.g;
                    data[index + 2] = color.b;
                    data[index + 3] = 255;
                }
            }
        }
    }
    
    drawRect(data, width, height, x, y, w, h, color) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py++) {
            for (let px = Math.max(0, x); px < Math.min(width, x + w); px++) {
                const index = (Math.floor(py) * width + Math.floor(px)) * 4;
                data[index] = color.r;
                data[index + 1] = color.g;
                data[index + 2] = color.b;
                data[index + 3] = 255;
            }
        }
    }
    
    drawStrokeRect(data, width, height, x, y, w, h, strokeWidth, color) {
        // Draw top and bottom edges
        for (let i = 0; i < strokeWidth; i++) {
            this.drawRect(data, width, height, x, y + i, w, 1, color);
            this.drawRect(data, width, height, x, y + h - i - 1, w, 1, color);
        }
        // Draw left and right edges
        for (let i = 0; i < strokeWidth; i++) {
            this.drawRect(data, width, height, x + i, y, 1, h, color);
            this.drawRect(data, width, height, x + w - i - 1, y, 1, h, color);
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
    
    drawEllipse(data, width, height, cx, cy, rx, ry, rotation, color) {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        
        for (let y = Math.max(0, cy - ry); y < Math.min(height, cy + ry); y++) {
            for (let x = Math.max(0, cx - rx); x < Math.min(width, cx + rx); x++) {
                const dx = x - cx;
                const dy = y - cy;
                
                // Apply rotation
                const rotX = dx * cos - dy * sin;
                const rotY = dx * sin + dy * cos;
                
                // Check if point is inside ellipse
                if ((rotX * rotX) / (rx * rx) + (rotY * rotY) / (ry * ry) <= 1) {
                    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
                    data[index] = color.r;
                    data[index + 1] = color.g;
                    data[index + 2] = color.b;
                    data[index + 3] = 255;
                }
            }
        }
    }
    
    valuesMutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                this.genome[i] = Math.floor(Math.random() * 256);
            }
        }
    }
    
    orderMutate() {
        const commandSize = 8; // Updated to 8
        const numCommands = Math.floor(this.genome.length / commandSize);
        
        if (numCommands >= 2) {
            const cmd1 = Math.floor(Math.random() * numCommands);
            let cmd2 = Math.floor(Math.random() * numCommands);
            while (cmd2 === cmd1) {
                cmd2 = Math.floor(Math.random() * numCommands);
            }
            
            const start1 = cmd1 * commandSize;
            const start2 = cmd2 * commandSize;
            
            for (let i = 0; i < commandSize; i++) {
                const temp = this.genome[start1 + i];
                this.genome[start1 + i] = this.genome[start2 + i];
                this.genome[start2 + i] = temp;
            }
        }
    }
    
    mutate(rate = 0.1) {
        if (Math.random() < 0.5) {
            this.valuesMutate(rate);
        } else {
            this.orderMutate();
        }
    }
}
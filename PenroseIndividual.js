class PenroseIndividual extends withPaletteExtensions(Individual) {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.genomeLength = 8;
        this.genome = genome || this.generateRandomGenome();
        
        // Golden ratio
        this.phi = (1 + Math.sqrt(5)) / 2;
        
        // Standard tile size
        this.tileSize = 1.0;
    }
    
    generateRandomGenome() {
        return [
            Math.random() * 2 * Math.PI,    // 0: rotation
            Math.random() * 2 - 1,          // 1: x offset
            Math.random() * 2 - 1,          // 2: y offset
            Math.random() * 0.5 + 0.8,      // 3: scale
            Math.floor(Math.random() * 30) + 40, // 4: num tiles (40-69)
            Math.random(),                  // 5: kite hue
            Math.random(),                  // 6: dart hue
            Math.random() * 0.5 + 0.6       // 7: brightness
        ];
    }
    
    getParameters() {
        return {
            rotation: this.genome[0],
            offsetX: this.genome[1],
            offsetY: this.genome[2],
            scale: this.genome[3],
            numTiles: Math.floor(this.genome[4]),
            kiteHue: this.genome[5] * 360,
            dartHue: this.genome[6] * 360,
            brightness: this.genome[7]
        };
    }
    
    // Create standard kite vertices (unit size)
    createKite(x, y, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Kite dimensions based on golden ratio
        const longEdge = this.phi;
        const shortEdge = 1.0;
        
        // Vertices in local coordinates (tip pointing up)
        const localVertices = [
            [0, longEdge],                    // tip
            [-shortEdge * 0.309, shortEdge * 0.951],  // left (cos(72°), sin(72°))
            [0, -longEdge / this.phi],        // base
            [shortEdge * 0.309, shortEdge * 0.951]    // right
        ];
        
        // Transform to world coordinates
        return localVertices.map(([vx, vy]) => [
            x + vx * cos - vy * sin,
            y + vx * sin + vy * cos
        ]);
    }
    
    // Create standard dart vertices (unit size)
    createDart(x, y, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Dart dimensions
        const longEdge = this.phi;
        const tipLength = 1.0 / this.phi;
        
        // Vertices in local coordinates (tip pointing up)
        const localVertices = [
            [0, tipLength],                   // tip
            [-longEdge * 0.809, -longEdge * 0.588],  // left (cos(144°), sin(144°))
            [0, -tipLength],                  // base
            [longEdge * 0.809, -longEdge * 0.588]    // right
        ];
        
        // Transform to world coordinates
        return localVertices.map(([vx, vy]) => [
            x + vx * cos - vy * sin,
            y + vx * sin + vy * cos
        ]);
    }
    
    // Check if two edges are compatible (can be placed together)
    edgesMatch(edge1, edge2, tolerance = 0.1) {
        const [p1, p2] = edge1;
        const [q1, q2] = edge2;
        
        // Edges match if they have same length and can be aligned
        const len1 = Math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2);
        const len2 = Math.sqrt((q2[0] - q1[0])**2 + (q2[1] - q1[1])**2);
        
        return Math.abs(len1 - len2) < tolerance;
    }
    
    // Generate tiling using a growth algorithm
    generateTiling(params) {
        const tiles = [];
        const { rotation, offsetX, offsetY, scale, numTiles } = params;
        
        // Start with one central kite
        const centerTile = {
            type: 'kite',
            x: offsetX,
            y: offsetY,
            angle: rotation,
            vertices: this.createKite(offsetX, offsetY, rotation).map(v => [v[0] * scale, v[1] * scale])
        };
        tiles.push(centerTile);
        
        // Try to add tiles around existing ones
        const attempts = numTiles * 3; // Allow multiple attempts
        let placedTiles = 1;
        
        for (let attempt = 0; attempt < attempts && placedTiles < numTiles; attempt++) {
            // Pick a random existing tile to extend from
            const baseTile = tiles[Math.floor(Math.random() * tiles.length)];
            
            // Try to place a new tile adjacent to one of its edges
            const edgeIndex = Math.floor(Math.random() * 4);
            const edge = [
                baseTile.vertices[edgeIndex], 
                baseTile.vertices[(edgeIndex + 1) % 4]
            ];
            
            // Calculate position for new tile
            const edgeCenter = [
                (edge[0][0] + edge[1][0]) / 2,
                (edge[0][1] + edge[1][1]) / 2
            ];
            
            const edgeAngle = Math.atan2(
                edge[1][1] - edge[0][1],
                edge[1][0] - edge[0][0]
            );
            
            // Try placing both kite and dart
            const newTypes = ['kite', 'dart'];
            const offsetDistance = scale * 0.8;
            
            for (const newType of newTypes) {
                // Position new tile on the opposite side of the edge
                const newX = edgeCenter[0] + offsetDistance * Math.cos(edgeAngle + Math.PI/2);
                const newY = edgeCenter[1] + offsetDistance * Math.sin(edgeAngle + Math.PI/2);
                const newAngle = edgeAngle + Math.PI + (Math.random() - 0.5) * 0.5;
                
                let newVertices;
                if (newType === 'kite') {
                    newVertices = this.createKite(newX, newY, newAngle).map(v => [v[0] * scale, v[1] * scale]);
                } else {
                    newVertices = this.createDart(newX, newY, newAngle).map(v => [v[0] * scale, v[1] * scale]);
                }
                
                // Check if new tile overlaps with existing tiles
                let overlaps = false;
                for (const existingTile of tiles) {
                    if (this.tilesOverlap(newVertices, existingTile.vertices)) {
                        overlaps = true;
                        break;
                    }
                }
                
                // Check if tile is within reasonable bounds
                const tileCenter = [
                    newVertices.reduce((sum, v) => sum + v[0], 0) / 4,
                    newVertices.reduce((sum, v) => sum + v[1], 0) / 4
                ];
                
                const distanceFromOrigin = Math.sqrt(tileCenter[0]**2 + tileCenter[1]**2);
                
                if (!overlaps && distanceFromOrigin < 5.0 * scale) {
                    tiles.push({
                        type: newType,
                        x: newX,
                        y: newY,
                        angle: newAngle,
                        vertices: newVertices
                    });
                    placedTiles++;
                    break;
                }
            }
        }
        
        return tiles;
    }
    
    // Check if two tiles overlap
    tilesOverlap(vertices1, vertices2, tolerance = 0.1) {
        // Simple overlap check - see if any vertex of one tile is inside the other
        for (const vertex of vertices1) {
            if (this.pointInPolygon(vertex, vertices2)) {
                return true;
            }
        }
        for (const vertex of vertices2) {
            if (this.pointInPolygon(vertex, vertices1)) {
                return true;
            }
        }
        return false;
    }
    
    // Point in polygon test
    pointInPolygon(point, polygon) {
        const [x, y] = point;
        let inside = false;
        
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const [xi, yi] = polygon[i];
            const [xj, yj] = polygon[j];
            
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        return inside;
    }
    
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const params = this.getParameters();
        const tiles = this.generateTiling(params);
        
        // Setup transform
        const centerX = width / 2;
        const centerY = height / 2;
        const viewScale = Math.min(width, height) / 12;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(viewScale, viewScale);
        
        // Draw tiles
        for (const tile of tiles) {
            const { vertices, type } = tile;
            
            if (vertices.length !== 4) continue;
            
            // Create path
            ctx.beginPath();
            ctx.moveTo(vertices[0][0], vertices[0][1]);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i][0], vertices[i][1]);
            }
            ctx.closePath();
            
            // Color based on type
            const hue = type === 'kite' ? params.kiteHue : params.dartHue;
            const brightness = params.brightness * 100;
            
            ctx.fillStyle = `hsl(${hue}, 70%, ${brightness}%)`;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            
            // Outline
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.03;
            ctx.stroke();
        }
        
        ctx.restore();
        
        // Debug info
        ctx.fillStyle = '#333';
        ctx.font = '10px monospace';
        ctx.fillText(`Tiles: ${tiles.length}/${params.numTiles}`, 5, height - 5);
    }
    
    mutate(rate = 0.1) {
        for (let i = 0; i < this.genome.length; i++) {
            if (Math.random() < rate) {
                const noise = (Math.random() - 0.5) * 0.3;
                
                if (i === 0) { // rotation
                    this.genome[i] = (this.genome[i] + noise) % (2 * Math.PI);
                } else if (i === 4) { // numTiles
                    this.genome[i] = Math.max(20, Math.min(80, this.genome[i] + (Math.random() - 0.5) * 10));
                } else {
                    this.genome[i] = Math.max(0, Math.min(1, this.genome[i] + noise * 0.3));
                }
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
        
        return [new PenroseIndividual(child1Genome), new PenroseIndividual(child2Genome)];
    }
    
    clone() {
        const clone = new PenroseIndividual([...this.genome]);
        clone.fitness = this.fitness;
        return clone;
    }
    
    getPhenotype() {
        const params = this.getParameters();
        return `Penrose: ${params.numTiles} tiles, rot=${(params.rotation * 180 / Math.PI).toFixed(0)}°`;
    }
}
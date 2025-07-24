class BinaryPatternIndividual extends Individual {
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const gridSize = 8;
        const cellWidth = width / gridSize;
        const cellHeight = height / gridSize;
        
        const phenotype = this.getPhenotype();
        
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const index = i * gridSize + j;
                const value = phenotype[index] || 0;
                
                ctx.fillStyle = value ? '#00ff88' : '#333';
                ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
                
                ctx.strokeStyle = '#666';
                ctx.strokeRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            }
        }
    }
    
    getPhenotype() {
        return this.genome;
    }
}
/**
 * Canvas2DModality
 *
 * Helper for rendering 2D patterns to canvas using pixel-level evaluation.
 * Handles common 2D rendering patterns with palette support.
 */

class Canvas2DModality {
    constructor(config = {}) {
        this.evaluator = config.evaluator; // Function(x, y) -> value
        this.colorMapper = config.colorMapper; // Function(value) -> {r, g, b}
        this.normalizer = config.normalizer || this.defaultNormalizer;
        this.coordinateMapper = config.coordinateMapper || this.defaultCoordinateMapper;
    }

    /**
     * Default coordinate mapper: normalize to [-1, 1]
     */
    defaultCoordinateMapper(px, py, width, height) {
        return {
            x: (px / width) * 2 - 1,
            y: (py / height) * 2 - 1
        };
    }

    /**
     * Default normalizer: tanh to map to [0, 1]
     */
    defaultNormalizer(value) {
        return (Math.tanh(value) + 1) / 2;
    }

    /**
     * Render a pattern to canvas using pixel-by-pixel evaluation
     */
    render(canvas, evaluator, colorMapper) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        // Use provided evaluator and colorMapper, or fall back to configured ones
        const evalFunc = evaluator || this.evaluator;
        const colorFunc = colorMapper || this.colorMapper;

        if (!evalFunc || !colorFunc) {
            throw new Error('Canvas2DModality requires evaluator and colorMapper functions');
        }

        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                // Map pixel coordinates to normalized coordinates
                const coords = this.coordinateMapper(px, py, width, height);

                // Evaluate at this point
                const value = evalFunc(coords.x, coords.y);

                // Normalize value to [0, 1] range for color lookup
                const normalizedValue = this.normalizer(value);

                // Get color from palette
                const color = colorFunc(normalizedValue);

                // Write pixel
                const index = (py * width + px) * 4;
                data[index] = color.r;
                data[index + 1] = color.g;
                data[index + 2] = color.b;
                data[index + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Render with caching support
     * Returns a function that can be used with Individual.visualizeWithCache()
     */
    createCachedRenderer(evaluator, colorMapper) {
        return (ctx, width, height) => {
            const imageData = ctx.createImageData(width, height);
            const data = imageData.data;

            for (let py = 0; py < height; py++) {
                for (let px = 0; px < width; px++) {
                    const coords = this.coordinateMapper(px, py, width, height);
                    const value = evaluator(coords.x, coords.y);
                    const normalizedValue = this.normalizer(value);
                    const color = colorMapper(normalizedValue);

                    const index = (py * width + px) * 4;
                    data[index] = color.r;
                    data[index + 1] = color.g;
                    data[index + 2] = color.b;
                    data[index + 3] = 255;
                }
            }

            return imageData;
        };
    }
}

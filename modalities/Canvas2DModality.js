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

    // --- Shared raw-ImageData drawing helpers ---
    // These operate directly on an ImageData `data` buffer (Uint8ClampedArray),
    // for individuals that draw paths/shapes rather than evaluating per pixel.

    /** Filled circle centred at (cx, cy). */
    static drawCircle(data, width, height, cx, cy, radius, color) {
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

    /** Single-pixel-wide Bresenham line. */
    static drawLine(data, width, height, x1, y1, x2, y2, color) {
        x1 = Math.round(x1); y1 = Math.round(y1);
        x2 = Math.round(x2); y2 = Math.round(y2);

        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        let x = x1, y = y1;

        while (true) {
            if (x >= 0 && x < width && y >= 0 && y < height) {
                const index = (y * width + x) * 4;
                data[index] = color.r;
                data[index + 1] = color.g;
                data[index + 2] = color.b;
                data[index + 3] = 255;
            }
            if (x === x2 && y === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
        }
    }

    /** Bresenham line with thickness, stamping a circle at each step. */
    static drawThickLine(data, width, height, x1, y1, x2, y2, color, lineWidth = 1) {
        x1 = Math.round(x1); y1 = Math.round(y1);
        x2 = Math.round(x2); y2 = Math.round(y2);

        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        let x = x1, y = y1;

        while (true) {
            Canvas2DModality.drawCircle(data, width, height, x, y, Math.max(1, lineWidth / 2), color);
            if (x === x2 && y === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx) { err += dx; y += sy; }
        }
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

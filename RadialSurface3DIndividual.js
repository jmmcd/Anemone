/**
 * RadialSurface3DIndividual — shared base for evolved radial surfaces r(θ,φ).
 *
 * A radial surface is meshed on a sphere: for each (θ,φ) a radius r is computed
 * and mapped to Cartesian via spherical coordinates (Y as the vertical axis).
 * What differs between subclasses is ONLY how r is produced — an expression (or
 * pair of expressions) that the subclass's PTO generator emits. Everything
 * downstream lives here: compiling expressions, building the mesh, rendering via
 * the shared Three.js scene, the 2D fallback, and the genome panel.
 *
 * A subclass supplies `this.representation` (a PTORepresentation over its own
 * top-level generator — it must be top-level, not a closure, for PTO's
 * structural naming) and, if it has a grammar, exposes it via editableSections().
 * The generator's phenotype is read here and may be:
 *   - separable:  { meridianExpr, crossExpr }  → r = r₁(θ) · r₂(φ)
 *   - bivariate:  { biExpr }                   → r = f(θ,φ)
 * and may optionally carry { thetaRange, phiRange } (defaults π and 2π). That
 * optional range is how SuperShape3D reintroduces the superformula's extended
 * angle range with NO method override. Expressions use `a` (separable) or
 * `theta`/`phi` (bivariate) and the sin/cos/tan/exp/log/sqrt/abs/pow vocabulary.
 *
 * Positivity/finiteness is handled at evaluation (|f| + radiusEps, NaN/Inf →
 * safe, clamp). radiusEps defaults to 0.05 (keeps degenerate GE shapes visible);
 * SuperShape3D sets it to 0 since the Gielis formula is already well-behaved.
 *
 * STL export (MeshExport.js) and the rotation loop (Anemone.js) key off
 * generate3DPoints()/is3D(), so every subclass gets both for free.
 */
class RadialSurface3DIndividual extends Individual {
    constructor() {
        super('SKIP_GENOME_GENERATION');
        this.threeDModality = new ThreeDModality();
        this.thetaPoints = 50;
        this.phiPoints = 100;
        // |f| + radiusEps keeps the surface a proper radial one (no folds through
        // the origin) and avoids a fully collapsed radius. Subclasses may override
        // after super() (SuperShape3D sets 0).
        this.radiusEps = 0.05;
        // Subclasses set this.representation and this.genome after super().
    }

    is3D() { return true; }
    usesColorPalette() { return true; }

    // --- Expression → numeric function ------------------------------------
    // Compile an expression over the given variable names to a numeric function,
    // caching by the expression string (auto-invalidates when the genome
    // changes, since a new genome yields a new expression string).
    compileExpr(expr, varNames) {
        this._compiled = this._compiled || {};
        if (!this._compiled[expr]) this._compiled[expr] = this._buildFn(expr, varNames);
        return this._compiled[expr];
    }

    _buildFn(expr, varNames) {
        try {
            const js = expr
                .replace(/sin/g, 'Math.sin')
                .replace(/cos/g, 'Math.cos')
                .replace(/tan/g, 'Math.tan')
                .replace(/exp/g, 'Math.exp')
                .replace(/log/g, 'Math.log')
                .replace(/sqrt/g, 'Math.sqrt')
                .replace(/abs/g, 'Math.abs')
                .replace(/pow/g, 'Math.pow');
            return new Function(...varNames, `
                try {
                    const result = ${js};
                    return isFinite(result) ? result : 0;
                } catch (e) {
                    return 0;
                }
            `);
        } catch (error) {
            return () => 0;
        }
    }

    _clampR(v) { return Math.max(0, Math.min(5000, v)); }

    // Build the radius function r(θ,φ) for whichever phenotype is active. The
    // clamp tames blow-ups from the free (non-periodic) grammars.
    radiusFunction() {
        const p = this.phenotype;
        const eps = this.radiusEps;
        if (p.biExpr !== undefined) {                       // bivariate
            const f = this.compileExpr(p.biExpr, ['theta', 'phi']);
            return (theta, phi) => this._clampR(Math.abs(f(theta, phi)) + eps);
        }
        const f1 = this.compileExpr(p.meridianExpr, ['a']); // separable r₁(θ)·r₂(φ)
        const f2 = this.compileExpr(p.crossExpr, ['a']);
        return (theta, phi) =>
            this._clampR((Math.abs(f1(theta)) + eps) * (Math.abs(f2(phi)) + eps));
    }

    // Spherical meshing. θ sweeps [0, thetaRange], φ sweeps [0, phiRange]
    // (defaults π and 2π; SuperShape3D supplies an extended phiRange). Returns
    // flat vertex/index/color arrays — also consumed by STL export.
    generate3DPoints() {
        const p = this.phenotype;
        const radiusAt = this.radiusFunction();
        const thetaRange = (typeof p.thetaRange === 'number') ? p.thetaRange : Math.PI;
        const phiRange = (typeof p.phiRange === 'number') ? p.phiRange : 2 * Math.PI;

        const vertices = [];
        const indices = [];
        const colors = [];

        for (let i = 0; i <= this.thetaPoints; i++) {
            const theta = (i / this.thetaPoints) * thetaRange;
            for (let j = 0; j <= this.phiPoints; j++) {
                const phi = (j / this.phiPoints) * phiRange;
                const r = radiusAt(theta, phi);

                const x = r * Math.sin(theta) * Math.cos(phi);
                const y = r * Math.cos(theta);
                const z = r * Math.sin(theta) * Math.sin(phi);
                vertices.push(x, y, z);

                const colorT = (i / this.thetaPoints + j / this.phiPoints) / 2;
                const color = window.Palette.color(colorT);
                colors.push(color.r / 255, color.g / 255, color.b / 255);
            }
        }

        for (let i = 0; i < this.thetaPoints; i++) {
            for (let j = 0; j < this.phiPoints; j++) {
                const current = i * (this.phiPoints + 1) + j;
                const next = current + this.phiPoints + 1;
                indices.push(current, next, current + 1);
                indices.push(next, next + 1, current + 1);
            }
        }

        return { vertices, indices, colors };
    }

    visualize(canvas) {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            const { vertices, indices, colors } = this.generate3DPoints();
            this.threeDModality.render(canvas, this.id, vertices, indices, colors, framework);
        } else {
            this.render2DProjection(canvas);
        }
    }

    // 2D-canvas fallback when shared 3D isn't available (rotating point cloud).
    render2DProjection(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const { vertices, colors } = this.generate3DPoints();
        const time = Date.now() * 0.001;
        const projectedPoints = [];

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];

            const rotY = time * 0.5;
            const rotX = time * 0.3;
            const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
            const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

            const x1 = x * cosY - z * sinY;
            const z1 = x * sinY + z * cosY;
            const y2 = y * cosX - z1 * sinX;
            const z2 = y * sinX + z1 * cosX;

            const distance = 15;
            const focal = 500;
            if (z2 + distance > 0.1) {
                projectedPoints.push({
                    x: (x1 * focal) / (z2 + distance) + width / 2,
                    y: (y2 * focal) / (z2 + distance) + height / 2,
                    z: z2 + distance,
                    colorR: colors[i / 3 * 3] * 255,
                    colorG: colors[i / 3 * 3 + 1] * 255,
                    colorB: colors[i / 3 * 3 + 2] * 255
                });
            }
        }

        projectedPoints.sort((a, b) => b.z - a.z);
        projectedPoints.forEach(point => {
            if (point.x >= 0 && point.x < width && point.y >= 0 && point.y < height) {
                const size = Math.max(1, 4 - point.z * 0.1);
                ctx.fillStyle = `rgb(${Math.round(point.colorR)}, ${Math.round(point.colorG)}, ${Math.round(point.colorB)})`;
                ctx.beginPath();
                ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    cleanup() {
        const framework = window.framework;
        if (framework && framework.shared3D) {
            framework.removeMeshFromScene(this.id);
        }
    }

    // Separable → { meridianExpr, crossExpr }; bivariate → { biExpr }. The
    // displayed phenotype is the expression(s). (Subclasses whose expressions
    // are unwieldy, e.g. SuperShape3D, override this for a readable summary.)
    getPhenotype() {
        const p = this.phenotype;
        if (p.biExpr !== undefined) return `r(θ,φ) = ${p.biExpr}`;
        return `r₁(θ) = ${p.meridianExpr} | r₂(φ) = ${p.crossExpr}`;
    }

    // renderKey must fold in every input that changes the pixels; the base would
    // return the phenotype object (→ "[object Object]") and collide, so build a
    // string key by hand. The expression strings encode all parameters/ranges.
    renderKey() {
        const p = this.phenotype;
        if (p.biExpr !== undefined) return `bi::${p.biExpr}`;
        return `${p.meridianExpr}::${p.crossExpr}`;
    }

    describeExtra() {
        const p = this.phenotype;
        let s = `\n<span class="genome-label">Formulas:</span>\n`;
        if (p.biExpr !== undefined) {
            s += `  r(θ,φ) = |${p.biExpr}| + ${this.radiusEps}\n`;
        } else {
            s += `  r₁(θ) = |${p.meridianExpr}| + ${this.radiusEps}\n`;
            s += `  r₂(φ) = |${p.crossExpr}| + ${this.radiusEps}\n`;
            s += `\nCombined: r(θ,φ) = r₁(θ) × r₂(φ)\n`;
        }
        return s;
    }
}

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
    static capabilities = {
        is3D: true,
        usesColorPalette: true,
    };
    // The SURFACE preset qualifies `pow` and leaves `theta` alone — here it is a
    // variable, not a derived quantity as in the x,y pattern grammars. Separable
    // expressions are over the raw angle `a`; a bivariate one passes theta,phi.
    static expression = { vars: ['a'], preset: 'SURFACE' };

    constructor(genome = null) {
        super(genome);
        this.thetaPoints = 50;
        this.phiPoints = 100;
        // |f| + radiusEps keeps the surface a proper radial one (no folds through
        // the origin) and avoids a fully collapsed radius. Subclasses may override
        // after super() (SuperShape3D sets 0).
        this.radiusEps = 0.05;
    }

    _clampR(v) { return Math.max(0, Math.min(5000, v)); }

    // Build the radius function r(θ,φ) for whichever phenotype is active. The
    // clamp tames blow-ups from the free (non-periodic) grammars.
    radiusFunction() {
        const p = this.phenotype;
        const eps = this.radiusEps;
        if (p.biExpr !== undefined) {                       // bivariate
            const f = this.expressionFn(p.biExpr, ['theta', 'phi']);
            return (theta, phi) => this._clampR(Math.abs(f(theta, phi)) + eps);
        }
        const f1 = this.expressionFn(p.meridianExpr); // separable r₁(θ)·r₂(φ)
        const f2 = this.expressionFn(p.crossExpr);
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

    // Separable → { meridianExpr, crossExpr }; bivariate → { biExpr }. The
    // displayed phenotype is the expression(s). (Subclasses whose expressions
    // are unwieldy, e.g. SuperShape3D, override this for a readable summary.)
    summary() {
        const p = this.phenotype;
        if (p.biExpr !== undefined) return `r(θ,φ) = ${p.biExpr}`;
        return `r₁(θ) = ${p.meridianExpr} | r₂(φ) = ${p.crossExpr}`;
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

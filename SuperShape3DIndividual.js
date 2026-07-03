/**
 * SuperShape3DIndividual — the Gielis superformula as a special case of
 * RadialSurface3DIndividual.
 *
 * Conceptually it's a "grammar" with a single fixed production: the generator
 * always emits the superformula expression for each direction, with its
 * parameters (m, n1, n2, n3, a, b) baked in as numeric literals drawn by rnd. So
 * PTO's fine mutation gives the familiar smooth parameter creep — the search is
 * over the continuous parameters, not over structure. Two blocks are drawn (7
 * genes each, mirroring the original), one for the meridian r₁(θ) and one for
 * the cross-section r₂(φ).
 *
 * The cross-section carries the extended angle range 8πq/gcd(p,4q) in the
 * phenotype (that's what produces the rose/star cross-sections); the meridian
 * sweeps a plain half-turn [0,π]. The base reads phenotype.thetaRange/phiRange,
 * so no method override is needed for the meshing. radiusEps is set to 0 because
 * the Gielis formula is already positive and bounded.
 *
 * The class keeps its name (SuperShape3DIndividual) so PNGs saved before this
 * refactor still identify their type.
 */
const superShape3DDenominators = [1, 2, 3, 4, 5, 6, 8, 10, 12];

const superShape3DGenerator = (rnd) => {
    // A block draws the 7 superformula genes. Returned as an array (the proven
    // structural-naming shape — the two call sites give the blocks distinct gene
    // names); toParams just labels them.
    const block = () => [
        rnd.randint(1, 20),                   // m numerator (integer)
        rnd.choice(superShape3DDenominators), // m denominator (preset)
        rnd.uniform(0.1, 10),                 // n1
        rnd.uniform(0.1, 10),                 // n2
        rnd.uniform(0.1, 10),                 // n3
        rnd.uniform(0.1, 3),                  // a
        rnd.uniform(0.1, 3)                   // b
    ];
    const toParams = (v) => ({ mNum: v[0], mDen: v[1], n1: v[2], n2: v[3], n3: v[4], A: v[5], B: v[6] });

    // Gielis superformula r(a) as an expression string with parameters as
    // literals: [ |cos(m·a/4)/A|^n2 + |sin(m·a/4)/B|^n3 ] ^ (-1/n1). Built with
    // string concatenation (kept simple for the PTO name-compiler).
    const f = (x) => x.toFixed(6);
    const expr = (b) =>
        'pow(pow(abs(cos((' + b.mNum + '/' + b.mDen + '/4)*a)/' + f(b.A) + '),' + f(b.n2) + ')' +
        '+pow(abs(sin((' + b.mNum + '/' + b.mDen + '/4)*a)/' + f(b.B) + '),' + f(b.n3) + '),' +
        f(-1 / b.n1) + ')';

    // Extended cross-section range (same formula as the original 2D/3D shapes).
    const gcd = (x, y) => { x = Math.abs(x); y = Math.abs(y); while (y) { const t = y; y = x % y; x = t; } return x; };
    const angleRange = (p, q) => (8 * Math.PI * q) / gcd(p, 4 * q);

    const meridian = toParams(block());
    const cross = toParams(block());
    return {
        meridianExpr: expr(meridian),
        crossExpr: expr(cross),
        thetaRange: Math.PI,                            // meridian is a half-turn
        phiRange: angleRange(cross.mNum, cross.mDen),   // extended cross-section
        meridianParams: meridian,                       // kept for a readable panel
        crossParams: cross
    };
};
const superShape3DRepresentation = new PTORepresentation(superShape3DGenerator);

class SuperShape3DIndividual extends RadialSurface3DIndividual {
    constructor(genome = null) {
        super();
        this.representation = superShape3DRepresentation;
        this.radiusEps = 0; // Gielis formula is already positive/bounded
        this.genome = genome || this.representation.generateRandom();
    }

    // Readable summary instead of the raw superformula strings.
    getPhenotype() {
        const p = this.phenotype;
        const fmt = (b) =>
            `m=${b.mNum}/${b.mDen}, n=[${b.n1.toFixed(2)}, ${b.n2.toFixed(2)}, ${b.n3.toFixed(2)}], a=${b.A.toFixed(2)}, b=${b.B.toFixed(2)}`;
        return `r₁(θ): ${fmt(p.meridianParams)} | r₂(φ): ${fmt(p.crossParams)}`;
    }

    describeExtra() {
        const p = this.phenotype;
        const line = (b, label) =>
            `  ${label} = [|cos(${b.mNum}/${b.mDen}·a/4)/${b.A.toFixed(2)}|^${b.n2.toFixed(2)} + ` +
            `|sin(${b.mNum}/${b.mDen}·a/4)/${b.B.toFixed(2)}|^${b.n3.toFixed(2)}]^(-1/${b.n1.toFixed(2)})\n`;
        let s = `\n<span class="genome-label">Superformula:</span>\n`;
        s += line(p.meridianParams, 'r₁(θ)');
        s += line(p.crossParams, 'r₂(φ)');
        s += `\nCombined: r(θ,φ) = r₁(θ) × r₂(φ), φ range ${(p.phiRange / Math.PI).toFixed(1)}π\n`;
        return s;
    }
}

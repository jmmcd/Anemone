/**
 * WarpedSurface3DIndividual — general bivariate radial surface r(θ,φ).
 *
 * One free expression in BOTH `theta` and `phi` (not a product of two univariate
 * factors), so shapes need not be separable — maximum freedom, and the most
 * "warped". Also non-periodic (possible φ seam) and can blow up more (the base's
 * clamp handles it). The base detects the { biExpr } phenotype and switches to
 * the bivariate radius path. See RadialSurface3DIndividual for the shared
 * machinery; this file supplies only the grammar + derivation generator.
 */
const warpedSurfaceGrammar = new Grammar({
    '<expr>': [
        ['<expr>', '<op>', '<expr>'],
        ['<func>', '(', '<expr>', ')'],
        ['<var>'],
        ['<const>']
    ],
    '<op>': [['+'], ['-'], ['*'], ['/']],
    '<func>': [['sin'], ['cos'], ['tan'], ['exp'], ['log'], ['sqrt'], ['abs']],
    '<var>': [['theta'], ['phi'], ['(theta*2)'], ['(phi*2)'], ['(theta*3)'], ['(phi*3)']],
    '<const>': [['1.0'], ['2.0'], ['3.0'], ['0.5'], ['0.1'], ['5.0']]
});
const warpedSurfaceGenerator = (rnd) => {
    const expand = (symbol, depth) => {
        if (!warpedSurfaceGrammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0 ? warpedSurfaceGrammar.getProductions(symbol) : warpedSurfaceGrammar.shortestProductions(symbol);
        const prod = rnd.choice(choices);
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    const biExpr = expand('<expr>', 5);
    return { biExpr };  // bivariate phenotype
};
const warpedSurfaceRepresentation = new PTORepresentation(warpedSurfaceGenerator);

class WarpedSurface3DIndividual extends RadialSurface3DIndividual {
    constructor(genome = null) {
        super();
        this.representation = warpedSurfaceRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    editableSections() {
        return [
            Individual.grammarSection(warpedSurfaceGrammar),
            Individual.generatorSection(this.representation),
        ];
    }
}

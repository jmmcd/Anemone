/**
 * FreeSurface3DIndividual — free (unconstrained) separable radial surface.
 *
 * Still r = r₁(θ)·r₂(φ), but each factor is a free expression in the raw angle
 * `a` with the full function set and division. Far more variety than
 * PetalSphere3D — but NOT periodic, so a shape can show a seam where φ wraps at
 * 0/2π (that's expected, not a bug). See RadialSurface3DIndividual for the shared
 * machinery; this file supplies only the grammar + derivation generator.
 */
const freeSurfaceGrammar = new Grammar({
    '<expr>': [
        ['<expr>', '<op>', '<expr>'],
        ['<func>', '(', '<expr>', ')'],
        ['<var>'],
        ['<const>']
    ],
    '<op>': [['+'], ['-'], ['*'], ['/']],
    '<func>': [['sin'], ['cos'], ['tan'], ['exp'], ['log'], ['sqrt'], ['abs']],
    '<var>': [['a'], ['(a*2)'], ['(a/2)'], ['(a*3)']],
    '<const>': [['1.0'], ['2.0'], ['3.0'], ['0.5'], ['0.1'], ['5.0']]
});
const freeSurfaceGenerator = (rnd) => {
    const expand = (symbol, depth) => {
        if (!freeSurfaceGrammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0 ? freeSurfaceGrammar.getProductions(symbol) : freeSurfaceGrammar.shortestProductions(symbol);
        const idx = rnd.randint(0, choices.length - 1);
        const prod = choices[idx];
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    const meridianExpr = expand('<expr>', 5);
    const crossExpr = expand('<expr>', 5);
    return { meridianExpr, crossExpr };  // separable phenotype
};
const freeSurfaceRepresentation = new PTORepresentation(freeSurfaceGenerator);

class FreeSurface3DIndividual extends RadialSurface3DIndividual {
    constructor(genome = null) {
        super();
        this.representation = freeSurfaceRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    editableSections() {
        return [
            Individual.grammarSection(freeSurfaceGrammar),
            Individual.generatorSection(this.representation),
        ];
    }
}

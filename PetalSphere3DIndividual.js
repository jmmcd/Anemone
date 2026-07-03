/**
 * PetalSphere3DIndividual — trig-constrained separable radial surface.
 *
 * The only angle-dependent terminals are sin(k·a)/cos(k·a) with integer k, so
 * every expression is automatically 2π-periodic ⇒ the mesh wraps seamlessly (no
 * seam). Narrow vocabulary, but it reliably yields petals / succulents / vases.
 * See RadialSurface3DIndividual for all the shared machinery; this file supplies
 * only the grammar + derivation generator (which, per PTO structural naming, must
 * live at top level and reference the grammar by its top-level name).
 */
const petalSphereGrammar = new Grammar({
    '<expr>': [
        ['<term>'],
        ['<expr>', '<op>', '<term>'],
        ['pow(abs(', '<term>', '),', '<pexp>', ')']
    ],
    '<term>': [
        ['<trig>', '(', '<k>', '*a)'],
        ['<const>']
    ],
    '<trig>': [['sin'], ['cos']],
    '<op>': [['+'], ['-'], ['*']],
    '<k>': [['1'], ['2'], ['3'], ['4'], ['5'], ['6']],
    '<pexp>': [['0.5'], ['1'], ['2'], ['3']],
    '<const>': [['0.2'], ['0.5'], ['1.0'], ['2.0']]
});
const petalSphereGenerator = (rnd) => {
    const expand = (symbol, depth) => {
        if (!petalSphereGrammar.isNonTerminal(symbol)) return symbol;
        const choices = depth > 0 ? petalSphereGrammar.getProductions(symbol) : petalSphereGrammar.shortestProductions(symbol);
        const prod = rnd.choice(choices);
        let out = '';
        for (let i = 0; i < prod.length; i++) out += expand(prod[i], depth - 1);
        return out;
    };
    const meridianExpr = expand('<expr>', 5);
    const crossExpr = expand('<expr>', 5);
    return { meridianExpr, crossExpr };  // separable phenotype
};
const petalSphereRepresentation = new PTORepresentation(petalSphereGenerator);

class PetalSphere3DIndividual extends RadialSurface3DIndividual {
    constructor(genome = null) {
        super();
        this.representation = petalSphereRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    // The interesting knob is the grammar; expose it first, then the generator.
    editableSections() {
        return [
            Individual.grammarSection(petalSphereGrammar),
            Individual.generatorSection(this.representation),
        ];
    }
}

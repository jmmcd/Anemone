// StructuralInformationContinuousIndividual
//
// An A/B variant of StructuralInformationIndividual with a CONTINUOUS
// length/angle alphabet instead of the discrete, commensurable 45° one. The
// code language and everything downstream — the I/S/A tree, decoding, turtle
// rendering, the structural-information-load report — are inherited unchanged,
// so this isolates exactly one variable for comparison: discrete primitives
// (turns ∈ multiples of 45°, lengths ∈ {1,√2,2}) vs continuous ones.
//
// Trade-off being compared: the discrete alphabet guarantees closure (polygons
// and diagonals meet up), giving crisp geometric ornament; the continuous one
// loses that (no √2-style commensurability) but gains organic variety and
// smooth Gaussian-creep evolution — PTO 'fine' mutation creeps a real-valued
// gene, whereas on a discrete `choice` gene it resamples in jumps.
//
// The generator is a byte-for-byte copy of sitGenerator with only the two leaf
// draws changed (rnd.choice → rnd.uniform); kept as a full copy (rather than a
// shared factory) because PTO structural naming compiles the generator in
// isolation and forbids closure variables.
//
// EASY TO REMOVE (revert to discrete-only): delete this file and its four
// one-line registrations — index.html (<script> + <option>), Anemone.js
// (individualTypeMap), tests/harness.js (SOURCES + INDIVIDUAL_CLASSES). The
// discrete original is untouched apart from a defaultRepresentation() hook.

const SIT_TURN_RANGE = 135;                 // continuous turn ∈ [-135, 135]°
const SIT_LEN_MIN = 0.7, SIT_LEN_MAX = 2.0; // continuous length range

const sitContinuousGenerator = (rnd) => {
    const build = (depth) => {
        if (depth <= 1 || rnd.random() < 0.25) {
            return {
                kind: 'prim',
                turn: rnd.uniform(-SIT_TURN_RANGE, SIT_TURN_RANGE), // continuous angle
                len: rnd.uniform(SIT_LEN_MIN, SIT_LEN_MAX),          // continuous length
                mode: rnd.choice(SIT_MODES),                         // stroke / dot / pen-up
            };
        }
        const r = rnd.random();
        if (r < 0.30) {
            const n = rnd.randint(2, 3);
            const children = [];
            for (let i = 0; i < n; i++) children.push(build(depth - 1));
            return { kind: 'seq', children };
        } else if (r < 0.62) {
            // Anchored (push/pop) rosette/row vs chained — see the discrete twin.
            const anchored = rnd.random() < 0.5;
            const tKind = anchored ? rnd.choice(['turn', 'move']) : 'turn';
            const tVal = !anchored ? 0
                : (tKind === 'turn' ? rnd.uniform(-SIT_TURN_RANGE, SIT_TURN_RANGE)
                    : rnd.uniform(SIT_LEN_MIN, SIT_LEN_MAX));
            return { kind: 'iter', n: rnd.randint(3, 7), child: build(depth - 1), anchored, tKind, tVal };
        } else if (r < 0.85) {
            return { kind: 'sym', child: build(depth - 1), mirror: rnd.random() < 0.5 };
        }
        const n = rnd.randint(2, 4);
        const series = [];
        for (let i = 0; i < n; i++) series.push(build(depth - 1));
        return { kind: 'alt', constant: build(depth - 1), series };
    };
    const parts = rnd.randint(2, 3);
    const roots = [];
    for (let i = 0; i < parts; i++) roots.push(build(SIT_MAX_DEPTH));
    return { kind: 'seq', children: roots };
};

const sitContinuousRepresentation = new PTORepresentation(sitContinuousGenerator);

class StructuralInformationContinuousIndividual extends StructuralInformationIndividual {
    // Only difference from the discrete parent: the representation (hence the
    // generator / search space). All rendering and reporting are inherited.
    defaultRepresentation() { return sitContinuousRepresentation; }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StructuralInformationContinuousIndividual;
}

/*
 * IndividualRegistry.js — the single source of truth for the app's individual
 * types and their menu order/labels.
 *
 * One ordered list drives:
 *   - the Individual-Type <select> in the drawer (built at startup, hidden entries skipped)
 *   - InteractiveEAFramework.individualTypeMap() / resolveIndividualType() (name → class)
 *   - the test harness's INDIVIDUAL_CLASSES (tests/harness.js requires this file)
 *
 * The one list that can't be generated is the <script> tag block in index.html
 * (no build step), but tests/run.js asserts every entry here has a matching
 * <script> tag and resolves to a class — so a forgotten registration fails the
 * suite instead of silently breaking the app.
 *
 * Entries carry the class *name* as a string (not the class object) so this file
 * loads before/without the class definitions and stays JSON-simple. Order = menu
 * order. `hidden: true` = registered and deep-linkable (#Name) but not shown in
 * the menu.
 *
 * To add a type: add an entry here, add its <script> tag in index.html, and run
 * `npm test` — it will tell you if you missed a step.
 */
const INDIVIDUAL_TYPES = [
    { name: 'PatternIndividual',                        label: 'Pattern' },
    { name: 'PatternGrammarIndividual',                 label: 'Pattern (Grammar)' },
    { name: 'AnimatedPatternIndividual',                label: 'Animated Pattern', hidden: true }, // too heavy for mobile/old hardware
    { name: 'PolarCurveIndividual',                     label: 'Polar Curve' },
    { name: 'ShapesIndividual',                         label: 'Shapes' },
    { name: 'PhotoFilterIndividual',                    label: 'Photo Filter' },
    { name: 'AntRenderingIndividual',                   label: 'Ant Rendering' },
    { name: 'AudioFilterIndividual',                    label: 'Audio Filter' },
    { name: 'DrumMachineIndividual',                    label: 'Drum Machine' },
    { name: 'GridIndividual',                           label: 'Grid' },
    { name: 'SuperShapeIndividual',                     label: 'Supershape' },
    { name: 'SuperShape3DIndividual',                   label: 'Supershape 3D' },
    { name: 'PetalSphere3DIndividual',                  label: 'Petal Sphere 3D' },
    { name: 'FreeSurface3DIndividual',                  label: 'Free Surface 3D' },
    { name: 'WarpedSurface3DIndividual',                label: 'Warped Surface 3D' },
    { name: 'JennPolytopeIndividual',                   label: 'Jenn Polytope 4D' },
    { name: 'EndlessFormsIndividual',                   label: 'Endless Forms' },
    { name: 'AnemoneIndividual',                        label: 'Anemone' },
    { name: 'BranchIndividual',                         label: 'Branch' },
    { name: 'LSystemIndividual',                        label: 'L-System' },
    { name: 'StructuralInformationIndividual',          label: 'Structural Information' },
    { name: 'StructuralInformationContinuousIndividual', label: 'Structural Information (continuous)' },
    { name: 'SITCodeIndividual',                        label: 'Leeuwenberg Code 2D' },
    { name: 'SITCode3DIndividual',                      label: 'Leeuwenberg Code 3D' },
    { name: 'BlindWatchmakerIndividual',                label: 'Blind Watchmaker' },
    { name: 'RobotIndividual',                          label: 'Robot' },
    { name: 'WonkyGuysIndividual',                      label: 'Wonky Guys' },
    { name: 'HoxCreatureIndividual',                    label: 'Bug' },
    { name: 'SheepIndividual',                          label: 'Sheep' },
    { name: 'PenroseIndividual',                        label: 'Penrose' },
    { name: 'PSystemIndividual',                        label: 'P-System' },
    { name: 'MelodyIndividual',                         label: 'Melody Grid' },
    { name: 'MouseMusicIndividual',                     label: 'Mouse Music' },
    { name: 'EEGSonificationIndividual',                label: 'EEG Sonification' },
];

if (typeof window !== 'undefined') window.INDIVIDUAL_TYPES = INDIVIDUAL_TYPES;
if (typeof module !== 'undefined' && module.exports) module.exports = INDIVIDUAL_TYPES;

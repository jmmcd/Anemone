/*
 * CartoonFaceIndividual — evolvable cartoon faces with a *structured prior*.
 *
 * Inspired by the interactive evolutionary algorithm in the Nintendo Wii's Mii
 * Channel ("Choose a look-alike"): you were shown a screenful of randomly
 * generated faces, picked the closest one, were shown a smaller screenful of
 * variations on it, and picked again. Mutation-only IEC with truncation
 * selection over a population of one — and, with ~101M consoles sold, plausibly
 * the most-used interactive EA ever built.
 *
 * That code was never released. What *has* been recovered is the library the
 * games linked against, RFL (Revolution Face Library), via the Wii Sports
 * matching decompilation at https://github.com/doldecomp/ogws — in particular
 * `src/RVLFaceLib/RFL_MakeRandomFace.c`. That file is the population-*initialisation*
 * half of the algorithm, and it is the interesting half, because it is not a
 * uniform random draw:
 *
 *   RFLi_MakeRandomFace(info, sex, age, race) picks each feature by indexing a
 *   frequency-weighted lookup table keyed on the 18 sex x age x race classes
 *   (facelineTypeTable[18][10], hair_parts[18][72], ...), then applies hand-written
 *   conditional rules on top (a beard only for adult/elder males, and then only
 *   with probability 2/10; mouth colour only on female faces; vertical offsets
 *   for female and child faces).
 *
 * That *genotype prior* is what makes a random draw look like a person rather
 * than like noise, and it is what this type borrows. Two things are ours:
 *
 *   - All artwork. Nintendo's part meshes/textures are not available (and not
 *     ours to use), so every part here is drawn from scratch as vector paths on
 *     a 2D canvas. The part vocabulary is therefore our own — the ids below
 *     don't correspond to Nintendo's, only the *shape* of the prior does.
 *   - The weights. Nintendo's tables address their 72 hair meshes and so on, and
 *     are meaningless without that art; these are hand-authored over our parts.
 *
 * Two deliberate simplifications of RFL's 18-class scheme:
 *   - Shape features are conditioned on sex x age (6 classes). RFL conditions
 *     them on sex x age x race as well; here the third axis only drives colour,
 *     which is where it does the real work in RFL too (RFLi_GetFaceColor(sex,race),
 *     RFLi_GetHairColor(age,race), RFLi_GetEyeColor(race)).
 *   - That third axis is a *skin-tone family* (`tone`), not RFL's race enum: the
 *     job here is to keep skin/hair/eye colour mutually plausible, which a tone
 *     family does without encoding racial categories into the part vocabulary.
 *
 * The Mii genome schema is worth copying more literally, and it is: RFLiCharInfo
 * gives every part a *type* plus *colour, scale, rotation and position*, so most
 * of the expressiveness lives in continuous placement of a small discrete part
 * vocabulary. That is exactly why the look-alike step worked — a small mutation
 * nudges eye spacing and brow angle instead of swapping the whole face.
 *
 * We need no perturbation function: PTO gives us one. The type genes are
 * rnd.choice (fine mutation = like-for-like resample, honouring the weights,
 * since a repeated entry is proportionally represented) and the placement genes
 * are rnd.randint (fine mutation = creep). Selecting a face and evolving *is*
 * "choose a look-alike", with crossover and unlimited generations on top.
 *
 * One nice consequence of PTO's structural naming: sex/age/tone are ordinary
 * genes, and every downstream rnd.choice reads a *different table* depending on
 * them. So when `sex` mutates, the hair/eye/brow call sites see a new domain,
 * PTO's repair fires, and the face re-draws its features from the new class's
 * vocabulary — a homeotic-style cascade from a single gene, in the spirit of
 * HoxCreatureIndividual. (Every id below is drawable under every class, so a
 * repaired or carried-over value is always renderable.)
 *
 * "Mii" and "Wii" are trademarks of Nintendo; this type is an homage, not
 * affiliated with or endorsed by them, and contains none of their assets.
 */

// ---------------------------------------------------------------------------
// Part vocabularies and the class-conditioned frequency tables.
//
// Each table maps a class key to an array of part ids in which *repeats are the
// weights* — the same trick RFL's frequency tables use, and the one PTO wants:
// rnd.choice over an array with repeats both samples and mutates proportionally.
// Shape tables are keyed `sex-age` (m/f x c/a/e); colour tables by tone and age.
// ---------------------------------------------------------------------------

// Faceline outline shapes, as parameters to one shared path builder: half-widths
// at temple/cheek/jaw (fractions of the head half-width), chin depth (fraction of
// the head half-height) and how square the jaw corner is (0 = square, 1 = round).
const CF_FACE_SHAPES = {
    round:  { top: 0.92, cheek: 1.00, jaw: 0.86, chin: 1.00, round: 0.90 },
    oval:   { top: 0.86, cheek: 0.95, jaw: 0.74, chin: 1.06, round: 0.85 },
    square: { top: 0.96, cheek: 1.00, jaw: 0.96, chin: 0.98, round: 0.35 },
    heart:  { top: 1.00, cheek: 0.98, jaw: 0.66, chin: 1.02, round: 0.55 },
    long:   { top: 0.84, cheek: 0.90, jaw: 0.76, chin: 1.18, round: 0.80 },
    wide:   { top: 1.02, cheek: 1.08, jaw: 0.92, chin: 0.88, round: 0.85 },
    point:  { top: 0.90, cheek: 0.96, jaw: 0.60, chin: 1.10, round: 0.25 },
    pear:   { top: 0.78, cheek: 0.92, jaw: 1.00, chin: 0.96, round: 0.80 },
};

const CF_FACE_BY_CLASS = {
    'm-c': ['round', 'round', 'round', 'round', 'wide', 'wide', 'wide', 'oval', 'oval', 'pear', 'pear', 'square', 'heart'],
    'f-c': ['round', 'round', 'round', 'round', 'round', 'oval', 'oval', 'oval', 'wide', 'wide', 'heart', 'heart', 'point'],
    'm-a': ['square', 'square', 'square', 'oval', 'oval', 'oval', 'round', 'round', 'long', 'long', 'wide', 'wide', 'pear', 'heart', 'point'],
    'f-a': ['oval', 'oval', 'oval', 'oval', 'round', 'round', 'round', 'heart', 'heart', 'heart', 'point', 'point', 'long', 'long', 'wide'],
    'm-e': ['long', 'long', 'long', 'square', 'square', 'square', 'pear', 'pear', 'pear', 'oval', 'oval', 'round', 'wide'],
    'f-e': ['oval', 'oval', 'oval', 'long', 'long', 'long', 'round', 'round', 'pear', 'pear', 'heart', 'square'],
};

// Hair styles. One shared construction — an outer crown curve from temple to
// temple, closed by a fringe curve — plus per-style extras (back mass, bun,
// ponytail, spikes, ...). `crown` is the cap's outward swell (0 = no cap at all),
// `fy` the fringe height as a fraction of the head half-height.
const CF_HAIR_STYLES = {
    bald:     { crown: 0,    fringe: null },
    ring:     { crown: 0,    fringe: null, ring: true },
    buzz:     { crown: 1.03, fringe: 'straight', fy: -0.70 },
    short:    { crown: 1.08, fringe: 'straight', fy: -0.60 },
    part:     { crown: 1.09, fringe: 'part',     fy: -0.58 },
    spiky:    { crown: 1.10, fringe: 'straight', fy: -0.64, spikes: true },
    bowl:     { crown: 1.12, fringe: 'straight', fy: -0.44 },
    mop:      { crown: 1.14, fringe: 'wavy',     fy: -0.50 },
    curly:    { crown: 1.16, fringe: 'straight', fy: -0.58, puff: true },
    wave:     { crown: 1.10, fringe: 'wavy',     fy: -0.54, back: 'mid' },
    long:     { crown: 1.10, fringe: 'straight', fy: -0.54, back: 'long' },
    longwave: { crown: 1.12, fringe: 'wavy',     fy: -0.52, back: 'longwave' },
    pony:     { crown: 1.06, fringe: 'part',     fy: -0.60, pony: true },
    bun:      { crown: 1.05, fringe: 'part',     fy: -0.62, bun: true },
    bob:      { crown: 1.10, fringe: 'straight', fy: -0.52, back: 'bob' },
    pigtails: { crown: 1.06, fringe: 'straight', fy: -0.54, pigtails: true },
    mohawk:   { crown: 0,    fringe: null, mohawk: true },
};

const CF_HAIR_BY_CLASS = {
    'm-c': ['short', 'short', 'short', 'short', 'spiky', 'spiky', 'spiky', 'bowl', 'bowl', 'bowl', 'mop', 'mop', 'buzz', 'buzz', 'curly', 'part'],
    'f-c': ['bob', 'bob', 'bob', 'bob', 'pigtails', 'pigtails', 'pigtails', 'pony', 'pony', 'pony', 'long', 'long', 'bowl', 'bowl', 'curly', 'wave'],
    'm-a': ['short', 'short', 'short', 'short', 'short', 'part', 'part', 'part', 'part', 'buzz', 'buzz', 'buzz', 'spiky', 'spiky', 'mop', 'mop', 'curly', 'bald', 'mohawk', 'wave'],
    'f-a': ['long', 'long', 'long', 'long', 'bob', 'bob', 'bob', 'bob', 'wave', 'wave', 'wave', 'pony', 'pony', 'pony', 'bun', 'bun', 'longwave', 'longwave', 'short', 'curly'],
    'm-e': ['bald', 'bald', 'bald', 'bald', 'ring', 'ring', 'ring', 'ring', 'buzz', 'buzz', 'part', 'part', 'short', 'short', 'mop'],
    'f-e': ['bob', 'bob', 'bob', 'bun', 'bun', 'bun', 'short', 'short', 'short', 'wave', 'wave', 'curly', 'pony'],
};

const CF_EYE_BY_CLASS = {
    'm-c': ['round', 'round', 'round', 'round', 'wide', 'wide', 'wide', 'oval', 'oval', 'happy', 'happy', 'dot'],
    'f-c': ['round', 'round', 'round', 'round', 'lash', 'lash', 'lash', 'wide', 'wide', 'happy', 'happy', 'oval', 'oval'],
    'm-a': ['oval', 'oval', 'oval', 'narrow', 'narrow', 'narrow', 'round', 'round', 'squint', 'squint', 'angry', 'angry', 'sleepy', 'dot'],
    'f-a': ['lash', 'lash', 'lash', 'lash', 'oval', 'oval', 'oval', 'round', 'round', 'round', 'happy', 'happy', 'narrow', 'sleepy'],
    'm-e': ['narrow', 'narrow', 'narrow', 'sleepy', 'sleepy', 'sleepy', 'squint', 'squint', 'squint', 'oval', 'oval', 'happy'],
    'f-e': ['sleepy', 'sleepy', 'sleepy', 'happy', 'happy', 'happy', 'narrow', 'narrow', 'oval', 'oval', 'lash'],
};

const CF_BROW_BY_CLASS = {
    'm-c': ['flat', 'flat', 'flat', 'thick', 'thick', 'arch', 'arch', 'short', 'short', 'angry'],
    'f-c': ['arch', 'arch', 'arch', 'thin', 'thin', 'thin', 'flat', 'flat', 'short'],
    'm-a': ['thick', 'thick', 'thick', 'thick', 'flat', 'flat', 'flat', 'angry', 'angry', 'bushy', 'bushy', 'arch', 'short'],
    'f-a': ['thin', 'thin', 'thin', 'thin', 'arch', 'arch', 'arch', 'arch', 'flat', 'flat', 'sad', 'thick'],
    'm-e': ['bushy', 'bushy', 'bushy', 'bushy', 'thick', 'thick', 'thick', 'flat', 'flat', 'sad'],
    'f-e': ['thin', 'thin', 'thin', 'arch', 'arch', 'flat', 'flat', 'sad', 'sad'],
};

const CF_NOSE_BY_CLASS = {
    'm-c': ['dot', 'dot', 'dot', 'button', 'button', 'button', 'round', 'round', 'tri', 'line'],
    'f-c': ['dot', 'dot', 'dot', 'dot', 'button', 'button', 'button', 'line', 'line', 'round'],
    'm-a': ['round', 'round', 'round', 'wide', 'wide', 'wide', 'long', 'long', 'hook', 'hook', 'tri', 'tri', 'button', 'dot'],
    'f-a': ['button', 'button', 'button', 'button', 'dot', 'dot', 'dot', 'round', 'round', 'tri', 'line'],
    'm-e': ['long', 'long', 'long', 'hook', 'hook', 'hook', 'wide', 'wide', 'round', 'round', 'tri'],
    'f-e': ['button', 'button', 'button', 'round', 'round', 'long', 'long', 'dot', 'dot', 'hook'],
};

const CF_MOUTH_BY_CLASS = {
    'm-c': ['smile', 'smile', 'smile', 'smile', 'wide', 'wide', 'wide', 'grin', 'grin', 'teeth', 'teeth', 'small', 'wavy'],
    'f-c': ['smile', 'smile', 'smile', 'smile', 'small', 'small', 'small', 'wide', 'wide', 'grin', 'grin', 'wavy'],
    'm-a': ['line', 'line', 'line', 'smile', 'smile', 'smile', 'smirk', 'smirk', 'frown', 'frown', 'wide', 'wide', 'teeth', 'grin'],
    'f-a': ['smile', 'smile', 'smile', 'smile', 'small', 'small', 'small', 'pout', 'pout', 'line', 'line', 'wide', 'smirk'],
    'm-e': ['line', 'line', 'line', 'frown', 'frown', 'frown', 'smirk', 'smirk', 'smile', 'smile', 'wavy'],
    'f-e': ['smile', 'smile', 'smile', 'line', 'line', 'line', 'small', 'small', 'pout', 'wavy'],
};

// The faceline *texture* overlay — RFL's faceline.texture, i.e. what is painted
// on the skin rather than drawn as a part.
const CF_TEXTURE_BY_CLASS = {
    'm-c': ['none', 'none', 'none', 'none', 'none', 'none', 'freckles', 'freckles', 'freckles', 'blush'],
    'f-c': ['none', 'none', 'none', 'none', 'blush', 'blush', 'blush', 'blush', 'freckles', 'freckles', 'freckles', 'rosy'],
    'm-a': ['none', 'none', 'none', 'none', 'none', 'none', 'shadow', 'shadow', 'shadow', 'lines', 'lines'],
    'f-a': ['none', 'none', 'none', 'none', 'none', 'blush', 'blush', 'blush', 'rosy', 'rosy', 'freckles'],
    'm-e': ['wrinkles', 'wrinkles', 'wrinkles', 'wrinkles', 'wrinkles', 'lines', 'lines', 'lines', 'none', 'none'],
    'f-e': ['wrinkles', 'wrinkles', 'wrinkles', 'wrinkles', 'lines', 'lines', 'lines', 'none', 'none', 'rosy'],
};

// Glasses are conditioned on age alone, exactly as RFLi_GetGlassType(age) is.
const CF_GLASS_BY_AGE = {
    c: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'round', 'square'],
    a: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'round', 'round', 'square', 'square', 'thick', 'sun'],
    e: ['none', 'none', 'none', 'none', 'round', 'round', 'round', 'half', 'half', 'half', 'square', 'square', 'thick'],
};

// Colour tables. Skin by tone family; hair by age x tone (elders grey); eyes by tone.
const CF_SKIN_BY_TONE = {
    0: ['#f8d7bd', '#f3c9a4', '#eeba93', '#f6d0ae'],
    1: ['#deA97f', '#d0956c', '#c28059', '#d59f76'],
    2: ['#9c623f', '#804d30', '#653a22', '#8d5636'],
};

const CF_HAIR_COLORS = {
    'c-0': ['#2e2622', '#5a3a22', '#8a5a2b', '#c99a4a', '#e8c87a', '#a83c1e'],
    'a-0': ['#2e2622', '#3f2d21', '#5a3a22', '#8a5a2b', '#c99a4a', '#a83c1e'],
    'e-0': ['#dedede', '#c2c2c2', '#a4a4a4', '#efefef', '#8a7f76', '#5a3a22'],
    'c-1': ['#1d1512', '#33231a', '#4a2f1f', '#6b4327', '#8a5a2b'],
    'a-1': ['#1d1512', '#33231a', '#4a2f1f', '#6b4327', '#8a5a2b'],
    'e-1': ['#d5d0cb', '#b3aca6', '#928a83', '#e8e4e0', '#4a2f1f'],
    'c-2': ['#120d0b', '#1d1512', '#2b1d16', '#3a2419'],
    'a-2': ['#120d0b', '#1d1512', '#2b1d16', '#3a2419'],
    'e-2': ['#cfc9c4', '#a9a19b', '#7d746d', '#e6e2de', '#2b1d16'],
};

const CF_EYE_COLORS = {
    0: ['#4a3a2a', '#3b6ea5', '#4f7f4a', '#6a5a3a', '#2b2b2b', '#5f8fbf'],
    1: ['#3a2a1e', '#4a3524', '#2b2b2b', '#3b6ea5'],
    2: ['#2a1c14', '#1a1210', '#3a2a1e'],
};

// The Wii let you pick a favourite colour; it showed up as the shirt.
const CF_SHIRT_COLORS = ['#d0342c', '#e8720c', '#e8b806', '#4f9e2f', '#1f6b34',
    '#2f6fd0', '#63c0e8', '#e069a8', '#7a3fb0', '#8a5a2b', '#f0f0f0', '#26262c'];

const CF_BEARD_STYLES = ['mustache', 'goatee', 'chinstrap', 'full'];

// ---------------------------------------------------------------------------
// Generator: the RFL prior, as a PTO search space.
//
// Self-contained (top-level consts only, no closure variables, no `new`), as
// structural naming requires. The class genes come first and every later choice
// indexes a table through them, which is what makes them regulatory.
// ---------------------------------------------------------------------------
const cartoonFaceGenerator = (rnd) => {
    const p = {};

    // --- Class genes (RFL's sex / age / race triple). Adults are commonest, as
    // in the Mii Channel's own mix. `tone` is a skin-tone family, see header.
    p.sex = rnd.choice(['m', 'f']);
    p.age = rnd.choice(['c', 'c', 'a', 'a', 'a', 'a', 'a', 'e', 'e']);
    p.tone = rnd.choice([0, 0, 0, 1, 1, 2]);
    const cls = p.sex + '-' + p.age;

    // --- Part types, each drawn from its class's frequency-weighted table.
    p.faceline = rnd.choice(CF_FACE_BY_CLASS[cls]);
    p.texture = rnd.choice(CF_TEXTURE_BY_CLASS[cls]);
    p.hair = rnd.choice(CF_HAIR_BY_CLASS[cls]);
    p.eye = rnd.choice(CF_EYE_BY_CLASS[cls]);
    p.brow = rnd.choice(CF_BROW_BY_CLASS[cls]);
    p.nose = rnd.choice(CF_NOSE_BY_CLASS[cls]);
    p.mouth = rnd.choice(CF_MOUTH_BY_CLASS[cls]);
    p.glasses = rnd.choice(CF_GLASS_BY_AGE[p.age]);

    // --- Colours: skin from the tone family, hair from age x tone, eyes from tone.
    p.skinColor = rnd.choice(CF_SKIN_BY_TONE[p.tone]);
    p.hairColor = rnd.choice(CF_HAIR_COLORS[p.age + '-' + p.tone]);
    p.eyeColor = rnd.choice(CF_EYE_COLORS[p.tone]);
    p.shirtColor = rnd.choice(CF_SHIRT_COLORS);
    p.hairFlip = rnd.choice([0, 1]);

    // --- Placement genes: small ints, like RFL's 4-6 bit fields. PTO's fine
    // mutation creeps an int, which is precisely the "look-alike" perturbation.
    p.eyeScale = rnd.randint(0, 8);
    p.eyeRotate = rnd.randint(0, 8);
    p.eyeX = rnd.randint(0, 10);
    p.eyeY = rnd.randint(0, 10);
    p.browScale = rnd.randint(0, 8);
    p.browRotate = rnd.randint(0, 8);
    p.browX = rnd.randint(0, 10);
    p.browY = rnd.randint(0, 10);
    p.noseScale = rnd.randint(0, 8);
    p.noseY = rnd.randint(0, 10);
    p.mouthScale = rnd.randint(0, 8);
    p.mouthY = rnd.randint(0, 10);
    p.glassScale = rnd.randint(0, 6);
    p.glassY = rnd.randint(0, 8);

    // --- Facial hair: RFL's rule is adult/elder males only, and then rarely.
    p.beard = 'none';
    if (p.sex === 'm' && (p.age === 'a' || p.age === 'e') && rnd.random() < 0.35) {
        p.beard = rnd.choice(CF_BEARD_STYLES);
        p.beardScale = rnd.randint(0, 6);
    }

    // --- Mole: one optional blemish, anywhere on the face.
    p.mole = 0;
    if (rnd.random() < 0.12) {
        p.mole = 1;
        p.moleX = rnd.randint(0, 12);
        p.moleY = rnd.randint(0, 12);
    }

    // --- Body: two genes, as RFLiCharInfo has (height, build).
    p.height = rnd.randint(0, 8);
    p.build = rnd.randint(0, 8);

    return p;
};

const cartoonFaceRepresentation = new PTORepresentation(cartoonFaceGenerator);

// ---------------------------------------------------------------------------
// The draw. Everything is expressed in head units — hw/hh are the head's half
// width/height — so the whole figure scales with the canvas and the tile and the
// 6x zoom lightbox are the same picture. Held in an Editable slot so the code
// editor can swap the artwork live (see editableSections).
//
// Layer order matters and is the usual portrait one: body, back hair, ears,
// faceline, skin texture, features, front hair, glasses.
// ---------------------------------------------------------------------------
const cartoonFaceDraw = new Editable(function (self, ctx, width, height) {
    const p = self.getParameters();
    const S = Math.min(width, height);

    // Head frame. `height` shifts the whole figure, `build` widens the shoulders.
    // The vertical layout below is in head units off cy: hairline about -0.5,
    // brows -0.2, eyes 0, nose +0.3, mouth +0.6, chin +1. Offsets *below* the eyes
    // are scaled by shape.chin so they track a long or a short face.
    const hw = S * 0.285;
    const hh = S * 0.305;
    const cx = width / 2;
    const cy = height * 0.42 - (p.height - 0.5) * S * 0.03;

    const shape = CF_FACE_SHAPES[p.faceline] || CF_FACE_SHAPES.round;

    // --- tiny drawing helpers -------------------------------------------------
    const path = (pts, close) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (close) ctx.closePath();
    };
    const fillPoly = (pts, style) => { path(pts, true); ctx.fillStyle = style; ctx.fill(); };
    const ellipse = (x, y, rx, ry, style, rot) => {
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
        ctx.fillStyle = style;
        ctx.fill();
    };
    const strokeEllipse = (x, y, rx, ry, w, style, rot) => {
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
        ctx.strokeStyle = style; ctx.lineWidth = w; ctx.stroke();
    };
    const stroke = (style, w) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); };
    const shade = (hex, f) => {
        const n = parseInt(hex.slice(1), 16);
        const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
        return `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
    };

    // Half-width of the faceline at a given y, over its upper half, found by
    // sampling the very bezier facePath draws. The hair's side edges have to track
    // this: the head tapers in towards the crown, so an edge held at a fixed
    // fraction of the cheek width sits outside the face up there and leaves a
    // triangle of background between hair and head.
    const faceHalfWidth = (y) => {
        const tw = shape.top * hw, cwF = shape.cheek * hw;
        const px = [0, tw * 0.88, cwF, cwF];
        const py = [cy - hh, cy - hh, cy - hh * 0.55, cy - hh * 0.05];
        let prevX = px[0], prevY = py[0];
        for (let i = 1; i <= 24; i++) {
            const t = i / 24, u = 1 - t;
            const bx = u * u * u * px[0] + 3 * u * u * t * px[1] + 3 * u * t * t * px[2] + t * t * t * px[3];
            const by = u * u * u * py[0] + 3 * u * u * t * py[1] + 3 * u * t * t * py[2] + t * t * t * py[3];
            if ((y >= prevY && y <= by) || (y <= prevY && y >= by)) {
                const f = by === prevY ? 0 : (y - prevY) / (by - prevY);
                return prevX + f * (bx - prevX);
            }
            prevX = bx; prevY = by;
        }
        return cwF;   // below the sampled span the cheek is the widest point
    };

    // The faceline outline, as a closed path: crown, temples, cheeks, jaw, chin.
    // `round` widens/narrows the flat of the chin, which is what reads as a square
    // jaw versus a pointed one.
    const facePath = (grow) => {
        const g = grow || 1;
        const tw = shape.top * hw * g, cw = shape.cheek * hw * g, jw = shape.jaw * hw * g;
        const top = cy - hh * g, chin = cy + hh * shape.chin * g;
        const jawY = cy + hh * 0.40 * g;
        const flat = jw * (0.30 + 0.55 * (1 - shape.round));   // half-width of the chin
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.bezierCurveTo(cx + tw * 0.88, top, cx + cw, cy - hh * 0.55 * g, cx + cw, cy - hh * 0.05 * g);
        ctx.bezierCurveTo(cx + cw, cy + hh * 0.20 * g, cx + jw, jawY, cx + flat, chin - hh * 0.06 * g);
        ctx.quadraticCurveTo(cx + flat * 0.5, chin, cx, chin);
        ctx.quadraticCurveTo(cx - flat * 0.5, chin, cx - flat, chin - hh * 0.06 * g);
        ctx.bezierCurveTo(cx - jw, jawY, cx - cw, cy + hh * 0.20 * g, cx - cw, cy - hh * 0.05 * g);
        ctx.bezierCurveTo(cx - cw, cy - hh * 0.55 * g, cx - tw * 0.88, top, cx, top);
        ctx.closePath();
    };

    // --- background -----------------------------------------------------------
    ctx.fillStyle = '#e9eef2';
    ctx.fillRect(0, 0, width, height);

    // --- hair, back layer -----------------------------------------------------
    // Before the body: long hair falls *behind* the shoulders, and the neck then
    // covers the strands that would otherwise hang under the chin like a beard.
    const hair = CF_HAIR_STYLES[p.hair] || CF_HAIR_STYLES.short;
    const hairDark = shade(p.hairColor, 0.82);
    // Every hair shape carries a thin darker edge. White and grey hair (elders)
    // is close enough to the background to vanish into it otherwise; on dark hair
    // the outline is simply invisible, so one rule covers both.
    const hairOutline = shade(p.hairColor, 0.76);
    const edge = S * 0.006;
    const hairBlob = (x, y, rx, ry, rot) => {
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
        ctx.fillStyle = p.hairColor;
        ctx.fill();
        stroke(hairOutline, edge);
    };
    if (hair.back) {
        const drop = shape.chin * (hair.back === 'bob' ? 0.74 : (hair.back === 'mid' ? 1.08 : 1.55));
        const flare = hair.back === 'bob' ? 1.08 : 1.14;
        ctx.fillStyle = p.hairColor;
        ctx.beginPath();
        ctx.moveTo(cx - hw * 1.00, cy - hh * 0.58);
        ctx.bezierCurveTo(cx - hw * flare, cy + hh * drop * 0.5, cx - hw * (flare * 0.86), cy + hh * drop, cx - hw * 0.55, cy + hh * drop);
        ctx.lineTo(cx + hw * 0.55, cy + hh * drop);
        ctx.bezierCurveTo(cx + hw * (flare * 0.86), cy + hh * drop, cx + hw * flare, cy + hh * drop * 0.5, cx + hw * 1.00, cy - hh * 0.58);
        ctx.closePath();
        ctx.fill();
        stroke(hairOutline, edge);
        if (hair.back === 'longwave' || hair.back === 'mid') {
            // A couple of curl scallops along the hem, so waves read as waves.
            for (let i = -2; i <= 2; i++) {
                ellipse(cx + i * hw * 0.42, cy + hh * drop, hw * 0.26, hh * 0.16, p.hairColor);
            }
        }
    }
    if (hair.pigtails) {
        for (const s of [-1, 1]) {
            hairBlob(cx + s * hw * 1.06, cy + hh * 0.02, hw * 0.28, hh * 0.32);
            ellipse(cx + s * hw * 0.94, cy - hh * 0.42, hw * 0.18, hh * 0.15, hairDark);
        }
    }
    if (hair.pony) {
        const s = p.hairFlip ? 1 : -1;
        hairBlob(cx + s * hw * 0.98, cy + hh * 0.14, hw * 0.26, hh * 0.48, s * 0.22);
        ellipse(cx + s * hw * 0.86, cy - hh * 0.46, hw * 0.18, hh * 0.14, hairDark);
    }
    if (hair.bun) hairBlob(cx, cy - hh * 1.04, hw * 0.38, hh * 0.30);

    // --- body: neck, shoulders, shirt ----------------------------------------
    const shoulderY = cy + hh * (shape.chin + 0.34);
    const shoulderW = hw * (1.20 + p.build * 0.55);
    const neckW = hw * 0.26;
    ctx.fillStyle = shade(p.skinColor, 0.93);
    ctx.beginPath();
    // The neck runs *below* the collar's dip (shoulderY + 0.24hh), or the
    // neckline curve leaves a crescent of background under the chin.
    ctx.moveTo(cx - neckW, cy + hh * (shape.chin - 0.12));
    ctx.lineTo(cx - neckW, shoulderY + hh * 0.34);
    ctx.lineTo(cx + neckW, shoulderY + hh * 0.34);
    ctx.lineTo(cx + neckW, cy + hh * (shape.chin - 0.12));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.shirtColor;
    ctx.beginPath();
    ctx.moveTo(cx - neckW * 1.9, shoulderY);
    ctx.bezierCurveTo(cx - shoulderW, shoulderY + hh * 0.12, cx - shoulderW, shoulderY + hh * 0.5, cx - shoulderW, height + hh);
    ctx.lineTo(cx + shoulderW, height + hh);
    ctx.bezierCurveTo(cx + shoulderW, shoulderY + hh * 0.5, cx + shoulderW, shoulderY + hh * 0.12, cx + neckW * 1.9, shoulderY);
    ctx.bezierCurveTo(cx + neckW * 0.9, shoulderY + hh * 0.24, cx - neckW * 0.9, shoulderY + hh * 0.24, cx - neckW * 1.9, shoulderY);
    ctx.closePath();
    ctx.fill();
    // Same reason as the hair outline: a white or very pale shirt is otherwise
    // indistinguishable from the background. The hem runs below the canvas so
    // this edge only ever traces the shoulders and collar.
    stroke(shade(p.shirtColor, 0.80), S * 0.006);

    // --- ears -----------------------------------------------------------------
    for (const s of [-1, 1]) {
        ellipse(cx + s * shape.cheek * hw * 1.01, cy + hh * 0.06, hw * 0.13, hh * 0.16, p.skinColor);
        strokeEllipse(cx + s * shape.cheek * hw * 1.03, cy + hh * 0.06, hw * 0.06, hh * 0.08, S * 0.006, shade(p.skinColor, 0.80));
    }

    // --- faceline -------------------------------------------------------------
    facePath(1);
    ctx.fillStyle = p.skinColor;
    ctx.fill();
    stroke(shade(p.skinColor, 0.74), S * 0.007);

    // --- skin texture ---------------------------------------------------------
    const eyeY = cy + hh * (-0.02 + p.eyeY * 0.16);
    const eyeDX = hw * (0.34 + p.eyeX * 0.16);
    if (p.texture === 'blush' || p.texture === 'rosy') {
        const a = p.texture === 'rosy' ? 0.26 : 0.17;
        for (const s of [-1, 1]) {
            ctx.globalAlpha = a;
            ellipse(cx + s * hw * shape.cheek * 0.60, eyeY + hh * 0.26, hw * 0.17, hh * 0.10, '#e0605a');
            ctx.globalAlpha = 1;
        }
    } else if (p.texture === 'freckles') {
        for (let i = 0; i < 10; i++) {
            const s = i % 2 === 0 ? -1 : 1;
            const t = Math.floor(i / 2);
            ellipse(cx + s * hw * (0.34 + t * 0.10), eyeY + hh * (0.26 + (t % 2) * 0.09), hw * 0.026, hw * 0.026, shade(p.skinColor, 0.68));
        }
    } else if (p.texture === 'wrinkles' || p.texture === 'lines') {
        ctx.lineCap = 'round';
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + s * hw * 0.44, eyeY + hh * 0.30);
            ctx.quadraticCurveTo(cx + s * hw * 0.56, eyeY + hh * 0.44, cx + s * hw * 0.44, eyeY + hh * 0.58);
            stroke(shade(p.skinColor, 0.80), S * 0.008);
        }
        if (p.texture === 'wrinkles') {
            for (let i = 0; i < 2; i++) {
                ctx.beginPath();
                ctx.moveTo(cx - hw * 0.40, cy - hh * (0.52 + i * 0.11));
                ctx.quadraticCurveTo(cx, cy - hh * (0.60 + i * 0.11), cx + hw * 0.40, cy - hh * (0.52 + i * 0.11));
                stroke(shade(p.skinColor, 0.82), S * 0.007);
            }
        }
    } else if (p.texture === 'shadow') {
        // Kept well inside the jaw: there is no clip in this render path, so an
        // ellipse sized to the whole lower face spills onto the background.
        ctx.globalAlpha = 0.16;
        ellipse(cx, cy + hh * (shape.chin - 0.40), hw * shape.jaw * 0.66, hh * 0.26, '#3a2a20');
        ctx.globalAlpha = 1;
    }

    // --- eyes -----------------------------------------------------------------
    const eyeR = hw * 0.20 * p.eyeScale;
    const eyeRot = p.eyeRotate * Math.PI / 180;
    const irisR = eyeR * 0.52;
    for (const s of [-1, 1]) {
        const ex = cx + s * eyeDX;
        const rot = s * eyeRot;
        if (p.eye === 'happy') {
            // Closed, upward arc — no sclera.
            ctx.beginPath();
            ctx.moveTo(ex - eyeR, eyeY + eyeR * 0.25);
            ctx.quadraticCurveTo(ex, eyeY - eyeR * 0.75, ex + eyeR, eyeY + eyeR * 0.25);
            stroke('#2b2b2b', S * 0.014);
            continue;
        }
        if (p.eye === 'dot') {
            ellipse(ex, eyeY, eyeR * 0.34, eyeR * 0.34, '#2b2b2b');
            continue;
        }
        if (p.eye === 'squint') {
            ctx.beginPath();
            ctx.moveTo(ex - eyeR, eyeY);
            ctx.lineTo(ex + eyeR, eyeY - s * eyeR * 0.12);
            stroke('#2b2b2b', S * 0.016);
            ellipse(ex, eyeY - eyeR * 0.02, irisR * 0.5, irisR * 0.22, p.eyeColor);
            continue;
        }
        // Open eyes: sclera shape varies by type, iris + pupil + highlight on top.
        let rx = eyeR, ry = eyeR * 0.86;
        if (p.eye === 'oval') { ry = eyeR * 0.70; }
        else if (p.eye === 'narrow') { ry = eyeR * 0.48; }
        else if (p.eye === 'wide') { rx = eyeR * 1.02; ry = eyeR * 0.98; }
        else if (p.eye === 'sleepy') { ry = eyeR * 0.56; }
        else if (p.eye === 'angry') { ry = eyeR * 0.66; }
        else if (p.eye === 'lash') { ry = eyeR * 0.82; }
        ellipse(ex, eyeY, rx, ry, '#ffffff', rot);
        ellipse(ex, eyeY, irisR, Math.min(ry * 0.95, irisR), p.eyeColor, rot);
        ellipse(ex, eyeY, irisR * 0.45, Math.min(ry * 0.6, irisR * 0.45), '#1a1a1a', rot);
        ellipse(ex - irisR * 0.32, eyeY - irisR * 0.34, irisR * 0.22, irisR * 0.22, '#ffffff');
        // Upper lid line, and the extras that distinguish sleepy/angry/lash.
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, rx, ry, rot, Math.PI * 1.02, Math.PI * 1.98);
        stroke('#2b2b2b', S * 0.010);
        if (p.eye === 'sleepy') {
            ctx.beginPath();
            ctx.moveTo(ex - rx, eyeY - ry * 0.35);
            ctx.lineTo(ex + rx, eyeY - ry * 0.15);
            stroke('#2b2b2b', S * 0.012);
        } else if (p.eye === 'angry') {
            fillPoly([[ex - rx * 1.05, eyeY - ry * (s > 0 ? 1.5 : 0.6)],
                [ex + rx * 1.05, eyeY - ry * (s > 0 ? 0.6 : 1.5)],
                [ex + rx * 1.05, eyeY - ry * 0.55], [ex - rx * 1.05, eyeY - ry * 0.55]], p.skinColor);
        } else if (p.eye === 'lash') {
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.moveTo(ex + i * rx * 0.6, eyeY - ry * 0.9);
                ctx.lineTo(ex + i * rx * 0.78 + s * rx * 0.16, eyeY - ry * 1.5);
                stroke('#2b2b2b', S * 0.011);
            }
        }
    }

    // --- eyebrows -------------------------------------------------------------
    const browY = eyeY - hh * (0.16 + p.browY * 0.12);
    const browDX = eyeDX * (0.92 + p.browX * 0.18);
    const browW = hw * 0.24 * p.browScale;
    const browT = S * (p.brow === 'bushy' ? 0.030 : p.brow === 'thick' ? 0.022 : p.brow === 'thin' ? 0.010 : 0.016);
    for (const s of [-1, 1]) {
        const bx = cx + s * browDX;
        const tilt = s * (p.brow === 'angry' ? 0.30 : p.brow === 'sad' ? -0.26 : 0) + s * (p.browRotate - 0.5) * 0.34;
        const w = browW * (p.brow === 'short' ? 0.62 : 1);
        ctx.beginPath();
        ctx.moveTo(bx - w, browY + w * tilt);
        if (p.brow === 'arch') ctx.quadraticCurveTo(bx, browY - w * 0.44, bx + w, browY - w * tilt);
        else if (p.brow === 'flat' || p.brow === 'short') ctx.quadraticCurveTo(bx, browY - w * 0.14 + w * tilt * 0, bx + w, browY - w * tilt);
        else ctx.quadraticCurveTo(bx, browY - w * 0.34, bx + w, browY - w * tilt);
        stroke(hairDark, browT);
        if (p.brow === 'bushy') {
            ctx.beginPath();
            ctx.moveTo(bx - w, browY + w * tilt + browT * 0.6);
            ctx.quadraticCurveTo(bx, browY - w * 0.20, bx + w, browY - w * tilt + browT * 0.5);
            stroke(hairDark, browT * 0.7);
        }
    }

    // --- nose -----------------------------------------------------------------
    const noseY = eyeY + hh * shape.chin * (0.22 + p.noseY * 0.12);
    const noseS = hw * 0.20 * p.noseScale;
    const noseCol = shade(p.skinColor, 0.72);
    if (p.nose === 'dot') {
        ellipse(cx, noseY, noseS * 0.26, noseS * 0.26, noseCol);
    } else if (p.nose === 'button') {
        ellipse(cx, noseY, noseS * 0.42, noseS * 0.34, shade(p.skinColor, 0.90));
        ellipse(cx, noseY + noseS * 0.08, noseS * 0.30, noseS * 0.20, noseCol);
    } else if (p.nose === 'round') {
        ellipse(cx, noseY, noseS * 0.46, noseS * 0.44, shade(p.skinColor, 0.90));
        for (const s of [-1, 1]) ellipse(cx + s * noseS * 0.30, noseY + noseS * 0.18, noseS * 0.12, noseS * 0.09, noseCol);
    } else if (p.nose === 'wide') {
        ellipse(cx, noseY, noseS * 0.66, noseS * 0.34, shade(p.skinColor, 0.90));
        for (const s of [-1, 1]) ellipse(cx + s * noseS * 0.42, noseY + noseS * 0.10, noseS * 0.14, noseS * 0.10, noseCol);
    } else if (p.nose === 'long') {
        ctx.beginPath();
        ctx.moveTo(cx - noseS * 0.10, noseY - noseS * 0.70);
        ctx.quadraticCurveTo(cx - noseS * 0.16, noseY + noseS * 0.10, cx - noseS * 0.30, noseY + noseS * 0.30);
        ctx.quadraticCurveTo(cx, noseY + noseS * 0.56, cx + noseS * 0.30, noseY + noseS * 0.30);
        stroke(noseCol, S * 0.011);
    } else if (p.nose === 'hook') {
        ctx.beginPath();
        ctx.moveTo(cx - noseS * 0.10, noseY - noseS * 0.72);
        ctx.quadraticCurveTo(cx + noseS * 0.42, noseY - noseS * 0.10, cx + noseS * 0.16, noseY + noseS * 0.34);
        ctx.quadraticCurveTo(cx - noseS * 0.06, noseY + noseS * 0.46, cx - noseS * 0.26, noseY + noseS * 0.28);
        stroke(noseCol, S * 0.012);
    } else if (p.nose === 'tri') {
        fillPoly([[cx, noseY - noseS * 0.56], [cx + noseS * 0.42, noseY + noseS * 0.28],
            [cx - noseS * 0.42, noseY + noseS * 0.28]], shade(p.skinColor, 0.86));
    } else { // line
        ctx.beginPath();
        ctx.moveTo(cx - noseS * 0.26, noseY + noseS * 0.16);
        ctx.quadraticCurveTo(cx, noseY + noseS * 0.30, cx + noseS * 0.26, noseY + noseS * 0.16);
        stroke(noseCol, S * 0.010);
    }

    // --- mouth ----------------------------------------------------------------
    const mouthY = noseY + hh * shape.chin * (0.20 + p.mouthY * 0.10);
    const mw = hw * 0.33 * p.mouthScale;
    const lip = '#a8443c';
    const dark = '#5c2b26';
    if (p.mouth === 'smile' || p.mouth === 'wide') {
        const w = p.mouth === 'wide' ? mw * 1.22 : mw;
        ctx.beginPath();
        ctx.moveTo(cx - w, mouthY - mw * 0.12);
        ctx.quadraticCurveTo(cx, mouthY + mw * 0.62, cx + w, mouthY - mw * 0.12);
        stroke(dark, S * 0.014);
    } else if (p.mouth === 'grin') {
        ctx.beginPath();
        ctx.moveTo(cx - mw, mouthY - mw * 0.10);
        ctx.quadraticCurveTo(cx, mouthY + mw * 0.86, cx + mw, mouthY - mw * 0.10);
        ctx.closePath();
        ctx.fillStyle = dark; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - mw * 0.88, mouthY - mw * 0.02);
        ctx.quadraticCurveTo(cx, mouthY + mw * 0.22, cx + mw * 0.88, mouthY - mw * 0.02);
        ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (p.mouth === 'teeth') {
        ellipse(cx, mouthY + mw * 0.16, mw * 0.78, mw * 0.44, dark);
        // The teeth stay *inside* the mouth ellipse — there is no clip here, and a
        // full-width band reads as a white bar stuck across the face.
        ellipse(cx, mouthY - mw * 0.10, mw * 0.62, mw * 0.15, '#ffffff');
    } else if (p.mouth === 'line') {
        ctx.beginPath();
        ctx.moveTo(cx - mw * 0.86, mouthY);
        ctx.lineTo(cx + mw * 0.86, mouthY);
        stroke(dark, S * 0.013);
    } else if (p.mouth === 'frown') {
        ctx.beginPath();
        ctx.moveTo(cx - mw, mouthY + mw * 0.30);
        ctx.quadraticCurveTo(cx, mouthY - mw * 0.36, cx + mw, mouthY + mw * 0.30);
        stroke(dark, S * 0.014);
    } else if (p.mouth === 'small') {
        ellipse(cx, mouthY, mw * 0.34, mw * 0.30, lip);
    } else if (p.mouth === 'pout') {
        ellipse(cx, mouthY, mw * 0.52, mw * 0.34, lip);
        ctx.beginPath();
        ctx.moveTo(cx - mw * 0.52, mouthY);
        ctx.lineTo(cx + mw * 0.52, mouthY);
        stroke(dark, S * 0.008);
    } else if (p.mouth === 'smirk') {
        ctx.beginPath();
        ctx.moveTo(cx - mw * 0.80, mouthY + mw * 0.16);
        ctx.quadraticCurveTo(cx + mw * 0.10, mouthY + mw * 0.42, cx + mw * 0.86, mouthY - mw * 0.24);
        stroke(dark, S * 0.014);
    } else { // wavy
        ctx.beginPath();
        ctx.moveTo(cx - mw * 0.86, mouthY);
        ctx.quadraticCurveTo(cx - mw * 0.42, mouthY + mw * 0.40, cx, mouthY);
        ctx.quadraticCurveTo(cx + mw * 0.42, mouthY - mw * 0.40, cx + mw * 0.86, mouthY);
        stroke(dark, S * 0.013);
    }

    // --- facial hair ----------------------------------------------------------
    if (p.beard !== 'none') {
        const bs = p.beardScale;
        ctx.fillStyle = p.hairColor;
        if (p.beard === 'mustache' || p.beard === 'full') {
            // Sits in the gap between nose and mouth, whatever those genes chose —
            // sized off the mouth alone it can end up spread across the nose.
            const my = Math.max(noseY + noseS * 0.42, mouthY - mw * 0.50);
            const mwid = Math.min(mw * 0.62 * bs, hw * 0.42);
            ctx.beginPath();
            ctx.moveTo(cx - mwid, my);
            ctx.quadraticCurveTo(cx, my + mw * 0.22, cx + mwid, my);
            ctx.quadraticCurveTo(cx, my - mw * 0.18, cx - mwid, my);
            ctx.closePath();
            ctx.fill();
            stroke(shade(p.hairColor, 0.76), S * 0.005);
        }
        if (p.beard === 'goatee' || p.beard === 'full') {
            // Anchored to the chin, not hung off the mouth — a low mouth gene would
            // otherwise float the goatee down onto the neck.
            // Fitted into the gap between the mouth and the chin, and shrunk if
            // that gap is small. Hanging it off the mouth puts it on the chin or
            // past it; clamping it to the chin puts it on the mouth. The genes
            // that set mouth height and face length are independent, so only
            // solving for the gap itself survives both.
            const gapTop = mouthY + mw * 0.45;
            const gapBottom = cy + hh * (shape.chin - 0.06);
            const gr = Math.max(hh * 0.03, Math.min(mw * 0.40 * bs, (gapBottom - gapTop) / 2));
            const gw = Math.min(mw * 0.38 * bs, gr * 1.2);
            const gyc = (gapTop + gapBottom) / 2;
            // A tuft, not a disc: narrow under the lip, rounded at the chin.
            ctx.beginPath();
            ctx.moveTo(cx - gw * 0.55, gyc - gr);
            ctx.quadraticCurveTo(cx - gw * 1.15, gyc + gr * 0.35, cx, gyc + gr);
            ctx.quadraticCurveTo(cx + gw * 1.15, gyc + gr * 0.35, cx + gw * 0.55, gyc - gr);
            ctx.closePath();
            ctx.fillStyle = p.hairColor;
            ctx.fill();
            stroke(shade(p.hairColor, 0.76), S * 0.005);
        }
        if (p.beard === 'chinstrap' || p.beard === 'full') {
            // A ring between the faceline and an inset copy of it, built from the
            // same control points facePath uses. Stroking a hand-placed curve
            // instead (the obvious way) puts half the pen width outside the jaw,
            // so the beard hangs off the side of the face.
            const cwO = shape.cheek * hw, jwO = shape.jaw * hw;
            const chinO = cy + hh * shape.chin;
            const flatO = jwO * (0.30 + 0.55 * (1 - shape.round));
            const t = 0.16 + 0.14 * (bs - 0.80) / 0.50;          // beardScale → thickness
            const cwI = cwO * (1 - t), jwI = jwO * (1 - t * 1.3), flatI = flatO * (1 - t * 1.3);
            const chinI = chinO - hh * t * 1.1;
            ctx.beginPath();
            ctx.moveTo(cx + cwO, cy - hh * 0.05);
            ctx.bezierCurveTo(cx + cwO, cy + hh * 0.20, cx + jwO, cy + hh * 0.40, cx + flatO, chinO - hh * 0.06);
            ctx.quadraticCurveTo(cx + flatO * 0.5, chinO, cx, chinO);
            ctx.quadraticCurveTo(cx - flatO * 0.5, chinO, cx - flatO, chinO - hh * 0.06);
            ctx.bezierCurveTo(cx - jwO, cy + hh * 0.40, cx - cwO, cy + hh * 0.20, cx - cwO, cy - hh * 0.05);
            ctx.lineTo(cx - cwI, cy + hh * 0.02);
            ctx.bezierCurveTo(cx - cwI, cy + hh * 0.24, cx - jwI, cy + hh * 0.40, cx - flatI, chinI - hh * 0.05);
            ctx.quadraticCurveTo(cx - flatI * 0.5, chinI, cx, chinI);
            ctx.quadraticCurveTo(cx + flatI * 0.5, chinI, cx + flatI, chinI - hh * 0.05);
            ctx.bezierCurveTo(cx + jwI, cy + hh * 0.40, cx + cwI, cy + hh * 0.24, cx + cwI, cy + hh * 0.02);
            ctx.closePath();
            ctx.fillStyle = p.hairColor;
            ctx.fill();
            stroke(shade(p.hairColor, 0.76), S * 0.005);
        }
    }

    // --- mole -----------------------------------------------------------------
    if (p.mole) {
        ellipse(cx + (p.moleX - 0.5) * hw * shape.cheek * 1.3, cy + (p.moleY - 0.35) * hh * 0.9,
            S * 0.011, S * 0.011, '#4a3226');
    }

    // --- hair, front layer ----------------------------------------------------
    if (hair.crown > 0) {
        const flip = p.hairFlip ? -1 : 1;
        const g = hair.crown;
        const tw = shape.top * hw * g, cw = shape.cheek * hw * g;
        const top = cy - hh * g;
        const fy = cy + hh * hair.fy;
        // The cap runs from ear level on one side, over the crown, down to ear level
        // on the other, then back up the side of the head to the fringe and across.
        // The two *side* edges have to hug the face (inW, just inside the outline)
        // rather than cut straight across: a straight edge leaves a wedge of
        // background against the curving face, but ending the cap at the fringe
        // instead — the obvious way to avoid that wedge — shaves the sides off and
        // leaves every style looking like a severe undercut.
        const earY = cy + hh * 0.10;
        const fringeY = fy + hh * 0.06;
        // Both side edges are pulled *just inside* the faceline at their own
        // height, so the hair always overlaps the head's outline instead of
        // standing off it.
        const inW = faceHalfWidth(fringeY) * 0.96;
        const midY = (fringeY + earY) / 2;
        const midW = faceHalfWidth(midY) * 0.97;
        ctx.beginPath();
        ctx.moveTo(cx - cw, earY);
        ctx.bezierCurveTo(cx - cw, cy - hh * 0.74, cx - tw * 0.90, top, cx, top);
        ctx.bezierCurveTo(cx + tw * 0.90, top, cx + cw, cy - hh * 0.74, cx + cw, earY);
        ctx.quadraticCurveTo(cx + midW, midY, cx + inW, fringeY);
        // ...and back along the fringe.
        if (hair.fringe === 'part') {
            ctx.quadraticCurveTo(cx + flip * hw * 0.36, fy - hh * 0.20, cx - flip * hw * 0.28, fy + hh * 0.14);
            ctx.quadraticCurveTo(cx - inW * 0.70, fy + hh * 0.16, cx - inW, fringeY);
        } else if (hair.fringe === 'wavy') {
            ctx.quadraticCurveTo(cx + inW * 0.62, fy - hh * 0.20, cx + inW * 0.22, fy + hh * 0.04);
            ctx.quadraticCurveTo(cx - inW * 0.22, fy + hh * 0.20, cx - inW * 0.62, fy - hh * 0.04);
            ctx.quadraticCurveTo(cx - inW * 0.90, fy - hh * 0.16, cx - inW, fringeY);
        } else {
            ctx.quadraticCurveTo(cx, fy - hh * 0.24, cx - inW, fringeY);
        }
        ctx.quadraticCurveTo(cx - midW, midY, cx - cw, earY);
        ctx.closePath();
        ctx.fillStyle = p.hairColor;
        ctx.fill();
        stroke(hairOutline, edge);
        if (hair.puff) {
            for (let i = -3; i <= 3; i++) {
                // Filled only: these overlap, and outlining each one turns the
                // curls into a row of separate circles.
                ellipse(cx + i * hw * 0.30, top + hh * (0.06 + Math.abs(i) * 0.12), hw * 0.28, hh * 0.24, p.hairColor);
            }
        }
        if (hair.spikes) {
            // Spikes follow the dome, with their bases inside the cap — set on a
            // straight line they detach from the head and read as a paper crown.
            for (let i = -3; i <= 3; i++) {
                const sx = cx + i * hw * 0.30;
                const base = top + hh * 0.26 * (i * i) / 9 + hh * 0.06;
                fillPoly([[sx - hw * 0.15, base], [sx, base - hh * 0.30],
                    [sx + hw * 0.15, base]], p.hairColor);
                stroke(hairOutline, edge);
            }
        }
    }
    if (hair.ring) {
        // The elder's horseshoe: hair only around the sides and back.
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + s * shape.cheek * hw * 1.00, cy - hh * 0.06);
            ctx.quadraticCurveTo(cx + s * hw * 0.94, cy - hh * 0.62, cx + s * hw * 0.62, cy - hh * 0.70);
            // Outline first, as a slightly fatter stroke underneath: a stroked
            // shape has no path of its own to trace afterwards.
            stroke(hairOutline, S * 0.032 + edge * 2);
            stroke(p.hairColor, S * 0.032);
        }
    }
    if (hair.mohawk) {
        // A crest along the crown, not a rod balanced on top of it.
        ctx.fillStyle = p.hairColor;
        ctx.beginPath();
        ctx.moveTo(cx - hw * 0.62, cy - hh * 0.74);
        ctx.bezierCurveTo(cx - hw * 0.46, cy - hh * 1.36, cx + hw * 0.46, cy - hh * 1.36, cx + hw * 0.62, cy - hh * 0.74);
        ctx.bezierCurveTo(cx + hw * 0.30, cy - hh * 0.94, cx - hw * 0.30, cy - hh * 0.94, cx - hw * 0.62, cy - hh * 0.74);
        ctx.closePath();
        ctx.fill();
        stroke(hairOutline, edge);
    }

    // --- glasses --------------------------------------------------------------
    if (p.glasses !== 'none') {
        const gy = eyeY + hh * (p.glassY - 0.5) * 0.14;
        // Clamped to the eye spacing so the two lenses can't grow into each other.
        const gr = Math.min(eyeR * (1.34 + p.glassScale * 0.5), eyeDX * 0.94);
        const frame = p.glasses === 'thick' ? '#26262c' : p.glasses === 'sun' ? '#1b1b20' : '#6b6b74';
        const lw = S * (p.glasses === 'thick' ? 0.020 : 0.010);
        for (const s of [-1, 1]) {
            const gx = cx + s * eyeDX;
            if (p.glasses === 'sun') {
                ellipse(gx, gy, gr, gr * 0.78, 'rgba(30, 30, 40, 0.86)');
            } else if (p.glasses === 'square' || p.glasses === 'thick') {
                ctx.beginPath();
                ctx.rect(gx - gr, gy - gr * 0.66, gr * 2, gr * 1.32);
                stroke(frame, lw);
            } else if (p.glasses === 'half') {
                ctx.beginPath();
                ctx.ellipse(gx, gy, gr, gr * 0.62, 0, 0, Math.PI);
                stroke(frame, lw);
            } else {
                strokeEllipse(gx, gy, gr, gr * 0.82, lw, frame);
            }
        }
        ctx.beginPath();
        ctx.moveTo(cx - eyeDX + gr * 0.9, gy - gr * 0.1);
        ctx.lineTo(cx + eyeDX - gr * 0.9, gy - gr * 0.1);
        stroke(frame, lw * 0.8);
    }
});

class CartoonFaceIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = cartoonFaceRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    // Colours are semantic here (skin is skin), so the app palette would only
    // wreck them — this type opts out and carries its own tables.
    usesColorPalette() { return false; }

    // The generator is the prior; the draw is the artwork. Both are worth editing,
    // artwork first (a draw edit keeps the evolved population, see CodeEditorUI).
    editableSections() {
        return [
            Individual.functionSection('Draw', cartoonFaceDraw),
            Individual.generatorSection(this.representation),
        ];
    }

    /**
     * Decode layer: the raw phenotype has RFL-style small integers for scale,
     * rotation and position; the draw wants floats. Keeping the mapping here
     * means the draw function reads like drawing code and the genome stays a
     * compact set of bounded ints that PTO can creep.
     */
    getParameters() {
        const p = this.phenotype;
        const unit = (v, n) => (v || 0) / n;                 // 0..n → 0..1
        return Object.assign({}, p, {
            eyeScale: 0.80 + unit(p.eyeScale, 8) * 0.46,
            eyeRotate: (unit(p.eyeRotate, 8) - 0.5) * 22,    // degrees
            eyeX: unit(p.eyeX, 10),
            eyeY: unit(p.eyeY, 10),
            browScale: 0.78 + unit(p.browScale, 8) * 0.50,
            browRotate: unit(p.browRotate, 8),
            browX: unit(p.browX, 10),
            browY: unit(p.browY, 10),
            noseScale: 0.78 + unit(p.noseScale, 8) * 0.54,
            noseY: unit(p.noseY, 10),
            mouthScale: 0.78 + unit(p.mouthScale, 8) * 0.50,
            mouthY: unit(p.mouthY, 10),
            glassScale: unit(p.glassScale, 6),
            glassY: unit(p.glassY, 8),
            beardScale: 0.80 + unit(p.beardScale, 6) * 0.50,
            moleX: unit(p.moleX, 12),
            moleY: unit(p.moleY, 12),
            height: unit(p.height, 8),
            build: unit(p.build, 8),
        });
    }

    visualize(canvas) {
        cartoonFaceDraw.value(this, canvas.getContext('2d'), canvas.width, canvas.height);
    }

    getPhenotype() {
        const p = this.phenotype;
        const sex = p.sex === 'm' ? 'male' : 'female';
        const age = p.age === 'c' ? 'child' : p.age === 'e' ? 'elder' : 'adult';
        return `${sex} ${age}: ${p.faceline} face, ${p.hair} hair, ${p.eye} eyes, ` +
            `${p.brow} brows, ${p.nose} nose, ${p.mouth} mouth` +
            (p.glasses !== 'none' ? `, ${p.glasses} glasses` : '') +
            (p.beard !== 'none' ? `, ${p.beard}` : '') +
            (p.texture !== 'none' ? `, ${p.texture}` : '') +
            (p.mole ? ', mole' : '');
    }

    /**
     * Report the regulatory class and the tables it selected from — the point of
     * this type is the prior, so the genome panel should show it doing its work.
     */
    describeExtra() {
        const p = this.phenotype;
        const cls = p.sex + '-' + p.age;
        const share = (table, id) => {
            const n = table.filter(v => v === id).length;
            return `${id} <span style="opacity:0.6">(${n}/${table.length})</span>`;
        };
        return `<div style="margin:8px 0"><b>Prior class</b>: ` +
            `sex <code>${p.sex}</code> &times; age <code>${p.age}</code> &times; tone <code>${p.tone}</code>` +
            `<div style="opacity:0.75;margin-top:4px">Each part below was drawn from the ` +
            `frequency-weighted table for class <code>${cls}</code>; the fraction is that ` +
            `part's share of the table. Mutating sex or age re-draws them all from the new ` +
            `class's vocabulary.</div>` +
            `<ul style="margin:6px 0 0 0;padding-left:18px">` +
            `<li>faceline: ${share(CF_FACE_BY_CLASS[cls], p.faceline)}</li>` +
            `<li>hair: ${share(CF_HAIR_BY_CLASS[cls], p.hair)}</li>` +
            `<li>eyes: ${share(CF_EYE_BY_CLASS[cls], p.eye)}</li>` +
            `<li>brows: ${share(CF_BROW_BY_CLASS[cls], p.brow)}</li>` +
            `<li>nose: ${share(CF_NOSE_BY_CLASS[cls], p.nose)}</li>` +
            `<li>mouth: ${share(CF_MOUTH_BY_CLASS[cls], p.mouth)}</li>` +
            `<li>glasses: ${share(CF_GLASS_BY_AGE[p.age], p.glasses)}</li>` +
            `</ul></div>`;
    }
}

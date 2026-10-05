#!/usr/bin/env node
/**
 * sit-music.js — hear what the auditory half of Leeuwenberg's language is doing,
 * without opening a browser. The counterpart of `sit-preview.js` (which renders
 * the figures) and `sit-figures.js` (the paper's own plates).
 *
 * It uses the app's *real* code through the test harness's vm sandbox: the same
 * PTO generator, the same `SITLanguage` evaluator, the same turtle, the same
 * `SITAnalysis` dynamic program.
 *
 *   node scripts/sit-music.js                 a page of random codes, as piano rolls
 *   node scripts/sit-music.js analyse         every built-in melody, coded
 *   node scripts/sit-music.js analyse "Ode to Joy" out.mid
 *   node scripts/sit-music.js random out.mid  write one random piece to a .mid
 *
 * `analyse` is the interesting one: it prints, for each melody, the code found,
 * its structural information load against the literal cost, and whether the code
 * survives the round trip into a PTO genome (which is what makes an imported
 * tune evolvable — see SITMusicIndividual.fromCode).
 */
const fs = require('fs');
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'tests', 'harness.js'));

const args = process.argv.slice(2);
const mode = (args[0] === 'analyse' || args[0] === 'random') ? args[0] : 'grid';
const rest = args.slice(1);
const outFile = rest.find(a => /\.mid$/i.test(a));
const which = rest.find(a => !/\.mid$/i.test(a));

const env = load();
const { classes, SITLanguage, SITAnalysis, sandbox } = env;

/** A monospace piano roll, one column per grain. */
function pianoRoll(notes, grains, width = 72) {
    if (!notes.length) return '  (silent)';
    const scale = Math.min(1, width / grains);
    const cols = Math.max(1, Math.ceil(grains * scale));
    const pitches = [...new Set(notes.map(n => n.pitch))].sort((a, b) => b - a);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const name = (m) => (names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)).padStart(4, ' ');
    const lines = [];
    for (const pitch of pitches.slice(0, 20)) {
        const row = new Array(cols).fill('·');
        for (const n of notes) {
            if (n.pitch !== pitch) continue;
            const a = Math.floor(n.start * scale);
            const b = Math.max(a + 1, Math.ceil((n.start + n.dur) * scale));
            for (let i = a; i < Math.min(cols, b); i++) row[i] = (i === a) ? '#' : '=';
        }
        lines.push('  ' + name(pitch) + ' ' + row.join(''));
    }
    return lines.join('\n');
}

function writeMidi(individual, file) {
    const bytes = sandbox.window.MidiExport.buildSMF(individual.toMIDISequence(), null);
    fs.writeFileSync(file, Buffer.from(bytes));
    console.log(`\nwrote ${file} (${bytes.length} bytes)`);
}

function validIndividual(attempts = 200) {
    for (let i = 0; i < attempts; i++) {
        const ind = new classes.SITMusicIndividual();
        if (ind.validate()) return ind;
    }
    throw new Error('no valid individual');
}

if (mode === 'analyse') {
    const titles = which ? [which] : Object.keys(SITAnalysis.melodies);
    for (const title of titles) {
        const result = SITAnalysis.analyseMelody(title);
        if (!result) { console.log(`no such melody: ${title}`); continue; }
        const seed = classes.SITMusicIndividual.fromCode(result.code);
        console.log(`\n=== ${title} ===`);
        console.log(`  ${result.notes.length} notes, ${result.grains} grains,`
            + ` ${result.scaleName} (family ${result.family})`);
        console.log(`  I = ${result.load} coded vs ${result.literalLoad} written out`
            + `  (compression ×${result.ratio.toFixed(2)}), depth ${result.depth}`);
        console.log(`  exact: ${result.exact ? 'yes' : 'NO — that is a bug'}`
            + `   seedable as a genome: ${seed ? 'yes' : 'no'}`);
        console.log(`  vocabulary: ${Object.keys(SITLanguage.vocabulary(result.code.root)).join(', ')}`);
        console.log(`  code: ${SITLanguage.notation(result.code.root)}`);
        if (seed) {
            console.log(pianoRoll(seed.getPhenotype(), seed.grains()));
            if (outFile) writeMidi(seed, outFile);
        }
    }
} else if (mode === 'random') {
    const ind = validIndividual();
    console.log(ind.describeExtra().replace(/<[^>]+>/g, ''));
    console.log(pianoRoll(ind.getPhenotype(), ind.grains()));
    if (outFile) writeMidi(ind, outFile);
} else {
    const n = Number(which) || 6;
    for (let i = 0; i < n; i++) {
        const ind = validIndividual();
        const p = ind.phenotype;
        console.log(`\n--- ${i + 1}: ${ind.scaleName()} on ${ind.midiToNoteName(p.tonic)},`
            + ` ${Math.round(p.bpm)} BPM, I = ${Object.values(SITLanguage.load(p.root)).reduce((a, b) => a + b, 0)},`
            + ` ${ind.polyphony()} voices deep ---`);
        console.log(`  ${SITLanguage.notation(p.root).slice(0, 150)}`);
        console.log(pianoRoll(ind.getPhenotype(), ind.grains()));
    }
}

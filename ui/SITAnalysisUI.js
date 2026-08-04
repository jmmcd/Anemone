/**
 * SITAnalysisUI — drawer panel for the REVERSE map: a melody → a Leeuwenberg
 * code → a genome.
 *
 * Attached by the framework (loadExtensions) whenever the current individual
 * type returns true from `usesSITAnalysis()` — currently `SITMusicIndividual`,
 * the only type that can turn an analysis back into one of its own genomes.
 *
 * The panel is where the two directions of Structural Information Theory meet.
 * Everywhere else Anemone runs SIT generatively: write a code, hear what it
 * decodes to. Here a real tune is taken APART — the direction SIT was actually
 * built for, where the shortest code is the claim about what a listener hears —
 * and then handed back to evolution as a starting population. So you can import
 * Frère Jacques, read its structure off, and breed from it.
 *
 * "Seed population" replaces the whole grid with the analysed melody plus
 * mutated variants of it (via `ea.createValidMutant`, the same path as an evolve
 * step with one liked individual). That is only meaningful because the seed is a
 * genuine genome — see `SITMusicIndividual.fromCode`, which builds the PTO trace
 * by running the generator backwards and verifies it by replay. When it cannot
 * (a melody too deeply structured for the generator's depth budget, or an edited
 * generator), the panel says so and keeps the analysis read-only rather than
 * seeding something that only nearly matches.
 */
class SITAnalysisUI {
    constructor(framework) {
        this.framework = framework;
        this.result = null;      // the current analysis
        this.seed = null;        // the individual built from it, if it could be
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Leeuwenberg Analysis</h3>';

        const hint = document.createElement('div');
        hint.className = 'hotkey-hint';
        hint.textContent = 'Code a melody in the paper’s language, then evolve from it.';

        const select = document.createElement('select');
        for (const name of Object.keys(window.SITAnalysis.melodies)) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }

        const loadBtn = document.createElement('button');
        loadBtn.className = 'secondary-btn';
        loadBtn.textContent = 'Load .mid…';
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/midi,.mid,.midi';
        input.style.display = 'none';

        const report = document.createElement('div');
        report.className = 'genome-content';
        report.style.cssText = 'margin-top:8px;max-height:220px;overflow:auto;font-size:11px;';

        const playBtn = document.createElement('button');
        playBtn.className = 'secondary-btn';
        playBtn.textContent = '▶ Play';
        const seedBtn = document.createElement('button');
        seedBtn.className = 'secondary-btn';
        seedBtn.textContent = 'Seed population';

        select.addEventListener('change', () => this.analyseBuiltIn(select.value, report, seedBtn));
        loadBtn.addEventListener('click', () => input.click());
        input.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            input.value = '';
            if (!file) return;
            report.textContent = 'Reading…';
            try {
                const midi = await window.MidiExport.parseSMFFromFile(file);
                if (!midi || !midi.notes.length) throw new Error('no notes in that file');
                // A grain is a sixteenth note, which is what the individual plays
                // one value per; the analysis quantises the file to that grid.
                const melodic = midi.notes.filter(n => n.channel !== 9);   // drop the drum channel
                const result = window.SITAnalysis.analyse(melodic, {
                    grain: Math.max(1, Math.round(midi.ppq / 4)),
                    bpm: midi.bpm,
                });
                if (!result) throw new Error('nothing to analyse');
                result.title = file.name;
                this.show(result, report, seedBtn);
            } catch (err) {
                console.warn('MIDI analysis failed:', err);
                report.textContent = 'Could not read that file: ' + err.message;
            }
        });

        playBtn.addEventListener('click', () => {
            const fw = this.framework;
            if (fw.currentlyPlaying) {
                if (fw.currentlyPlaying.stopMIDI) fw.currentlyPlaying.stopMIDI();
                fw.currentlyPlaying = null;
                playBtn.textContent = '▶ Play';
                if (fw.refreshPlayButtons) fw.refreshPlayButtons();
                return;
            }
            if (!this.seed) return;
            if (fw.currentlyPlaying && fw.currentlyPlaying.stopMIDI) fw.currentlyPlaying.stopMIDI();
            this.seed.playMIDI();
            fw.currentlyPlaying = this.seed;
            playBtn.textContent = '■ Stop';
            if (fw.refreshPlayButtons) fw.refreshPlayButtons();
        });

        seedBtn.addEventListener('click', () => this.seedPopulation(report, seedBtn));

        section.appendChild(hint);
        section.appendChild(select);
        section.appendChild(loadBtn);
        section.appendChild(input);
        section.appendChild(report);
        section.appendChild(playBtn);
        section.appendChild(seedBtn);
        container.appendChild(section);

        this.analyseBuiltIn(select.value, report, seedBtn);
    }

    analyseBuiltIn(name, report, seedBtn) {
        report.textContent = 'Analysing…';
        // Let the browser paint "Analysing…" before the dynamic program runs.
        setTimeout(() => {
            const result = window.SITAnalysis.analyseMelody(name);
            if (result) this.show(result, report, seedBtn);
            else report.textContent = 'No such melody.';
        }, 0);
    }

    show(result, report, seedBtn) {
        this.result = result;
        this.seed = SITMusicIndividual.fromCode(result.code);
        seedBtn.disabled = !this.seed;

        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lines = [];
        lines.push(`<span class="genome-label">${esc(result.title || 'Melody')}</span>`);
        lines.push(`${result.notes.length} notes · ${result.grains} grains`
            + ` · ${esc(result.scaleName)} on ${this.noteName(result.tonic)}`);
        lines.push('');
        lines.push('<span class="genome-label">Structural information load (I):</span>');
        lines.push(`  coded ${result.load} units, written out ${result.literalLoad}`
            + ` — compression ×${result.ratio.toFixed(2)}`);
        // The load counts non-zero values only ("the value 0, and therefore 0̄ and
        // (0), are not information", p. 331), so held notes and rests are free:
        // what the ratio measures is compression of PITCH structure alone.
        lines.push('  (0 is not information, so held notes and rests cost nothing)');
        lines.push('');
        lines.push('<span class="genome-label">Code:</span>');
        lines.push('  ' + esc(SITLanguage.notation(result.code.root)));
        lines.push('');
        if (!result.exact) {
            lines.push('<span class="genome-label">⚠ inexact</span> — this is a bug, not a rounding.');
        } else if (!this.seed) {
            lines.push('<span class="genome-label">Analysis only.</span> This code is outside what');
            lines.push(result.withinSpan
                ? 'the generator can write (too deeply structured, or the'
                : 'the generator can write (it leaps further than an octave, or');
            lines.push(result.withinSpan
                ? 'generator has been edited), so it cannot become a genome.'
                : 'the generator has been edited), so it cannot become a genome.');
        } else {
            lines.push('Exact: the code replays to this melody note for note.');
        }
        report.innerHTML = lines.join('\n');
    }

    noteName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    }

    /**
     * Replace the population with the analysed melody and mutated variants of
     * it. The melody itself takes tile 0, so the original is always there to
     * come back to (and to breed from) rather than being lost in the first
     * generation.
     */
    seedPopulation(report, seedBtn) {
        if (!this.seed) return;
        const fw = this.framework;
        const ea = fw.ea;
        if (!ea || !ea.population || !ea.population.length) return;

        fw.stopAllPlayback ? fw.stopAllPlayback() : null;
        for (const old of ea.population) {
            if (old && old.stopMIDI) old.stopMIDI();
            if (old && old.selected) ea.toggleLike(old);
        }
        fw.currentlyPlaying = null;

        const seed = SITMusicIndividual.fromCode(this.result.code);
        ea.population[0] = seed;
        for (let i = 1; i < ea.population.length; i++) {
            ea.population[i] = ea.createValidMutant(seed);
        }
        if (ea.saveGeneration) ea.saveGeneration();
        fw.currentIndividual = seed;
        this.seed = seed;
        fw.render();
        if (fw.displayCurrentGenome) fw.displayCurrentGenome();
        if (fw.showToast) fw.showToast(`Seeded from "${this.result.title}" — tile 1 is the melody itself`);
    }
}

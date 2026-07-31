// EvolutionControlsUI — the "Evolution" drawer panel: population size and
// mutation rate.
//
// These are the two knobs of the search itself, as opposed to the per-type
// knobs the other panels expose. Like HelpOverlayUI (and unlike the
// capability-gated panels) it is app-wide, so the framework mounts it once
// rather than loadExtensions attaching it per type.
//
// Population size offers perfect squares only, so the grid stays square: the
// framework publishes the column count as CSS custom properties and styles.css
// reads them per breakpoint, so a narrow screen still gets its 2/3 columns.
// Resizing PRESERVES the evolved population (truncate / pad — see
// EvolutionaryAlgorithm.setPopulationSize); it is not a reset.
//
// Mutation rate is read by the EA on the next evolve, so nothing needs
// re-rendering or cache invalidation when it changes.
class EvolutionControlsUI {
    constructor(framework) {
        this.framework = framework;
    }

    mount(container) {
        if (!container) return;
        const ea = this.framework.ea;
        const sizes = EvolutionaryAlgorithm.POPULATION_SIZES;

        container.innerHTML =
            '<label class="evo-row"><span>Population</span>' +
            '<select id="evo-popsize">' +
            sizes.map(n => `<option value="${n}">${n} (${Math.sqrt(n)}×${Math.sqrt(n)})</option>`).join('') +
            '</select></label>' +
            '<label class="evo-row"><span>Mutation</span>' +
            '<input type="range" id="evo-mutation" min="0.01" max="0.6" step="0.01">' +
            '<output id="evo-mutation-out"></output></label>' +
            `<div class="info-line">Default mutation ${EvolutionaryAlgorithm.DEFAULT_MUTATION_RATE}. ` +
            'Resizing keeps the individuals you have evolved.</div>';

        this.popSelect = container.querySelector('#evo-popsize');
        this.mutSlider = container.querySelector('#evo-mutation');
        this.mutOut = container.querySelector('#evo-mutation-out');

        this.popSelect.value = String(ea.populationSize);
        this.mutSlider.value = String(ea.mutationRate);
        this._showRate();

        this.popSelect.addEventListener('change', () => {
            this.framework.setPopulationSize(parseInt(this.popSelect.value, 10));
        });
        this.mutSlider.addEventListener('input', () => {
            this.framework.ea.mutationRate = parseFloat(this.mutSlider.value);
            this._showRate();
        });
    }

    _showRate() {
        const r = this.framework.ea.mutationRate;
        const dflt = EvolutionaryAlgorithm.DEFAULT_MUTATION_RATE;
        this.mutOut.textContent = r.toFixed(2) + (Math.abs(r - dflt) < 1e-9 ? ' (default)' : '');
    }

    // Keep the controls truthful if something else changes these (e.g. a reset).
    refresh() {
        if (!this.popSelect) return;
        this.popSelect.value = String(this.framework.ea.populationSize);
        this.mutSlider.value = String(this.framework.ea.mutationRate);
        this._showRate();
    }
}

if (typeof window !== 'undefined') window.EvolutionControlsUI = EvolutionControlsUI;
if (typeof module !== 'undefined' && module.exports) module.exports = EvolutionControlsUI;

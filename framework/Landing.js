// Landing — the start page: one live, random individual from each of sixteen
// different types. Clicking a tile starts a run of that type AND seeds that very
// individual into its first generation (slot 0, not liked — choosing a type is
// not a vote), so the thing that caught the user's eye is not lost on arrival.
//
// Partial class: authored here, merged onto InteractiveEAFramework.prototype
// (below). `this` is the framework instance. Loaded after framework/Anemone.js.
//
// Shown when the URL names no type (main.js), and whenever the hash is cleared —
// the app title links to "#". It is an overlay over the run, not a replacement:
// going to it and pressing Back returns to the same evolved population. The tiles
// are NOT an EA population (their types' PTO traces cannot be crossed), so they
// live in their own list and grid, and are drawn with EvolutionaryAlgorithm.
// createValid exactly as a population's would be. Which types are eligible is
// the registry's call (`landing: false` in IndividualRegistry.js).
(function () {
    const LANDING_COUNT = 16;

    const ext = class {
        setupLanding() {
            this.landing = document.getElementById('landing');
            this.landingGrid = document.getElementById('landing-grid');
            this.landingOpen = false;
            this._landingTiles = [];
            const shuffle = document.getElementById('landing-shuffle');
            if (shuffle) shuffle.addEventListener('click', () => this._renderLanding());
            // Back/Forward, the title link and a hand-edited URL all arrive here.
            // A traversal can fire both events; _syncToHash is idempotent.
            const sync = () => this._syncToHash();
            window.addEventListener('hashchange', sync);
            window.addEventListener('popstate', sync);
        }

        // Types eligible for a tile: the menu's types, less `landing: false`.
        landingPool() {
            const map = this.individualTypeMap();
            return (window.INDIVIDUAL_TYPES || [])
                .filter(t => !t.hidden && t.landing !== false && map[t.name])
                .map(t => ({ label: t.label, cls: map[t.name] }));
        }

        showLanding() {
            if (!this.landing) return;
            // Silence and close whatever the run underneath had open.
            if (this.currentlyPlaying && this.currentlyPlaying.stopMIDI) this.currentlyPlaying.stopMIDI();
            this.currentlyPlaying = null;
            this.refreshPlayButtons();
            if (this.lightbox && this.lightbox.classList.contains('open')) this.closeZoom();
            this.closeDrawer();
            this.exitPlacementMode();
            this.landingOpen = true;
            document.body.classList.add('landing-open');
            this._renderLanding();
        }

        // `render: false` when a type switch is about to draw the grid anyway.
        hideLanding({ render = true } = {}) {
            if (!this.landingOpen) return;
            this.landingOpen = false;
            document.body.classList.remove('landing-open');
            this._clearLanding();
            // Opened at startup, the run underneath has never been drawn.
            if (render && this.grid && this.grid.children.length === 0) this.render();
        }

        chooseLandingIndividual(cls, individual) {
            this.hideLanding({ render: false });
            this.setIndividualType(cls, { seed: individual, pushHistory: true });
            this.showToast('Your pick is in the top-left tile');
        }

        // Follow the URL: no hash → the start page; a type → that run (the one
        // underneath if it is already that type, so Back keeps the population).
        // An unknown token also lands on the start page.
        _syncToHash() {
            const token = (location.hash || '').replace(/^#/, '');
            const cls = InteractiveEAFramework.resolveIndividualType(token);
            if (!cls) { if (!this.landingOpen) this.showLanding(); return; }
            if (cls === this.individualClass) { this.hideLanding(); return; }
            this.hideLanding({ render: false });
            this.setIndividualType(cls);
        }

        _renderLanding() {
            this._clearLanding();
            const pool = this.landingPool();
            // A random sixteen, in random order, so each visit shows a new page.
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            for (const { label, cls } of pool) {
                if (this._landingTiles.length >= LANDING_COUNT) break;
                let individual;
                try { individual = EvolutionaryAlgorithm.createValid(cls, this.midiOutput); }
                catch (err) { console.warn(`Landing: could not create ${cls.name}:`, err); continue; }

                const tile = document.createElement('button');
                tile.className = 'landing-tile';
                tile.setAttribute('aria-label', `Start evolving: ${label}`);
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                canvas._landing = true; // lets the 3D rotation loop tell these from the hidden grid's
                const caption = document.createElement('span');
                caption.className = 'landing-label';
                caption.textContent = label;
                tile.append(canvas, caption);
                tile.addEventListener('click', () => this.chooseLandingIndividual(cls, individual));
                this.landingGrid.appendChild(tile);
                this._landingTiles.push({ individual, canvas });

                try {
                    individual.visualize(canvas);
                    if (individual.is3D && individual.is3D() && this.shared3D) {
                        this.animate3DWithSharedScene(individual, canvas);
                    }
                } catch (err) {
                    console.warn(`Landing: could not draw ${cls.name}:`, err);
                }
            }
        }

        _clearLanding() {
            for (const { individual, canvas } of this._landingTiles) {
                canvas._animOwner = null; // stops a continuously-animating type's loop
                if (individual.is3D && individual.is3D()) this.removeMeshFromScene(individual.id);
            }
            this._landingTiles = [];
            // Detaching the canvases ends their 3D rotation loops.
            if (this.landingGrid) this.landingGrid.innerHTML = '';
        }
    };
    const descriptors = Object.getOwnPropertyDescriptors(ext.prototype);
    delete descriptors.constructor;
    Object.defineProperties(InteractiveEAFramework.prototype, descriptors);
})();

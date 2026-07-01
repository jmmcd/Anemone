// CodeEditorUI
//
// A UI panel, attached by the framework for every individual that exposes
// editable code sections (all PTO-backed types do — at minimum their generator).
//
// Each individual declares its editable *sections* via editableSections() — named
// stages of its generator → phenotype → visualize pipeline (see Individual.js).
// Most types expose just the generator; some expose more (grammar types expose
// their grammar; Robot exposes its draw function). This panel is stage-agnostic:
// it shows a selector when there is more than one section and edits whichever is
// chosen. Applying a section that changes the *search space* (generator/grammar)
// rebuilds the population; a section that only changes drawing (a draw function)
// keeps the population and just re-renders.
//
// The sidebar is narrow, so the panel itself is just a button + status line; the
// actual editing happens in a full-screen modal (built lazily, appended to
// <body>) with a large textarea.
class CodeEditorUI {
    constructor(framework) {
        this.framework = framework;
        this.container = null;
        this.status = null;       // sidebar status line
        this.modal = null;        // lazily-built overlay
        this.selector = null;     // section <select>
        this.textarea = null;
        this.modalStatus = null;
        this.sections = [];       // current individual's editable sections
        this.activeIndex = 0;
        this._onKeydown = (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); };
    }

    mount(container) {
        this.container = container;

        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Code</h3>';

        const openButton = document.createElement('button');
        openButton.className = 'secondary-btn';
        openButton.textContent = 'Edit Code…';
        openButton.addEventListener('click', () => this.open());
        section.appendChild(openButton);

        const status = document.createElement('div');
        status.className = 'code-editor-status';
        this.status = status;
        section.appendChild(status);

        this.container.appendChild(section);
    }

    // The editable sections of the currently-selected individual type. Read from a
    // sample individual (they all share the type's representation/slots).
    currentSections() {
        const pop = this.framework.ea && this.framework.ea.population;
        const sample = pop && pop[0];
        return (sample && typeof sample.editableSections === 'function') ? sample.editableSections() : [];
    }

    // Build the modal once, on first open, and append it to <body> (so it
    // overlays the whole app rather than being clipped inside the sidebar). Any
    // stale modal from a previous individual type's panel is removed first.
    buildModal() {
        const existing = document.getElementById('code-editor-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'code-modal';
        modal.id = 'code-editor-modal';

        const inner = document.createElement('div');
        inner.className = 'code-modal-inner';

        const header = document.createElement('div');
        header.className = 'code-modal-header';
        header.innerHTML = '<h3>Edit Code</h3>';

        const selector = document.createElement('select');
        selector.className = 'code-modal-section';
        selector.addEventListener('change', () => {
            this.activeIndex = selector.selectedIndex;
            this.loadActiveSection();
        });
        this.selector = selector;
        header.appendChild(selector);

        const closeButton = document.createElement('button');
        closeButton.className = 'icon-btn code-modal-close';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.textContent = '✕';
        closeButton.addEventListener('click', () => this.close());
        header.appendChild(closeButton);
        inner.appendChild(header);

        const textarea = document.createElement('textarea');
        textarea.className = 'code-modal-textarea';
        textarea.spellcheck = false;
        // Insert a real indent on Tab instead of moving focus out of the editor.
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.slice(0, start) + '    ' + textarea.value.slice(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
            }
        });
        this.textarea = textarea;
        inner.appendChild(textarea);

        const footer = document.createElement('div');
        footer.className = 'code-modal-footer';

        const applyButton = document.createElement('button');
        applyButton.className = 'code-editor-apply';
        applyButton.textContent = 'Apply';
        applyButton.addEventListener('click', () => this.apply());
        footer.appendChild(applyButton);

        const resetButton = document.createElement('button');
        resetButton.className = 'code-editor-reset';
        resetButton.textContent = 'Reset to default';
        resetButton.addEventListener('click', () => this.reset());
        footer.appendChild(resetButton);

        const modalStatus = document.createElement('div');
        modalStatus.className = 'code-editor-status';
        this.modalStatus = modalStatus;
        footer.appendChild(modalStatus);

        inner.appendChild(footer);
        modal.appendChild(inner);

        // Close on backdrop click (but not when clicking inside the panel).
        modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });

        document.body.appendChild(modal);
        this.modal = modal;
    }

    isOpen() {
        return this.modal && this.modal.classList.contains('open');
    }

    open() {
        this.sections = this.currentSections();
        if (this.sections.length === 0) {
            this.showStatus('This individual type has no editable code.', true);
            return;
        }
        if (!this.modal) this.buildModal();

        // Populate the section selector; hide it for single-section types.
        this.selector.innerHTML = '';
        this.sections.forEach((s, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = s.label;
            this.selector.appendChild(opt);
        });
        this.selector.style.display = this.sections.length > 1 ? '' : 'none';
        this.activeIndex = 0;
        this.selector.selectedIndex = 0;

        this.loadActiveSection();
        this.showStatus('', false);
        this.modal.classList.add('open');
        document.addEventListener('keydown', this._onKeydown);
        setTimeout(() => this.textarea && this.textarea.focus(), 0); // defer until visible
    }

    close() {
        if (this.modal) this.modal.classList.remove('open');
        document.removeEventListener('keydown', this._onKeydown);
    }

    activeSection() {
        return this.sections[this.activeIndex];
    }

    loadActiveSection() {
        const section = this.activeSection();
        if (section && this.textarea) this.textarea.value = section.read();
        this.showStatus('', false);
    }

    reset() {
        const section = this.activeSection();
        if (section && this.textarea) {
            this.textarea.value = section.reset();
            this.showStatus('Reset to default — Apply to use it.', false);
        }
    }

    apply() {
        const section = this.activeSection();
        if (!section) { this.showStatus('Nothing to edit.', true); return; }

        // Remember the current source so we can restore it if the edit is broken.
        const previousText = section.read();
        try {
            section.apply(this.textarea.value);
        } catch (err) {
            this.showStatus(`Error: ${err.message}`, true);
            return;
        }

        // Validate end-to-end by probe-rendering one fresh individual; revert the
        // section if the new code (or its now-differently-shaped phenotype) throws.
        try {
            this.probeRender();
        } catch (err) {
            try { section.apply(previousText); } catch (_) { /* best effort */ }
            this.showStatus(`Error: ${err.message}`, true);
            return;
        }

        if (section.rebuild) {
            // Generator/grammar changed the search space → new genomes.
            this.framework.reinitializePopulation();
        } else {
            // Only the drawing changed → keep the evolved population, just redraw.
            this.framework.invalidateAndRender();
        }
        this.showStatus('Applied.', false);
    }

    // Construct one individual of the current type and render it to an offscreen
    // canvas, to surface generator/draw/phenotype errors before they reach the grid.
    probeRender() {
        const C = this.framework.individualClass;
        const probe = new C();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        try {
            probe.visualize(canvas);
        } finally {
            // 3D probes add a mesh to the shared scene; don't leak it.
            if (probe.is3D && probe.is3D() && this.framework.removeMeshFromScene) {
                this.framework.removeMeshFromScene(probe.id);
            }
        }
    }

    // Mirror status to both the modal (if open) and the sidebar line.
    showStatus(message, isError) {
        for (const el of [this.modalStatus, this.status]) {
            if (!el) continue;
            el.textContent = message;
            el.classList.toggle('error', !!isError);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CodeEditorUI;
}

// CodeEditorUI
//
// A UI panel, attached by the framework for every PTO-backed individual type,
// that lets the user view and edit that type's generator source — the
// `generator(rnd)` function passed to its PTORepresentation. Every individual
// holds its generator in `this.representation`, and `generator.toString()`
// recovers the exact source, so the editor is fully generic: it reads the
// current type's generator, and on "Apply" swaps in the user's edited version
// (PTORepresentation.setGenerator) and reinitialises the population.
//
// The sidebar is narrow, so the panel itself is just a button + status line; the
// actual editing happens in a full-screen modal (built lazily, appended to
// <body>) with a large textarea.
class CodeEditorUI {
    constructor(framework) {
        this.framework = framework;
        this.container = null;
        this.status = null;      // sidebar status line
        this.modal = null;       // lazily-built overlay
        this.textarea = null;
        this.modalStatus = null;
        this._onKeydown = (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); };
    }

    mount(container) {
        this.container = container;

        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Generator Code</h3>';

        const openButton = document.createElement('button');
        openButton.className = 'secondary-btn';
        openButton.textContent = 'Edit Generator Code…';
        openButton.addEventListener('click', () => this.open());
        section.appendChild(openButton);

        const status = document.createElement('div');
        status.className = 'code-editor-status';
        this.status = status;
        section.appendChild(status);

        this.container.appendChild(section);
    }

    // The PTORepresentation of the currently-selected individual type (a shared
    // singleton, so editing it in place affects all individuals of the type).
    currentRepresentation() {
        const pop = this.framework.ea && this.framework.ea.population;
        const sample = pop && pop[0];
        return sample && sample.representation;
    }

    // Turn editor text into a generator function. Generators are normally a
    // single expression (arrow `(rnd) => …` or a `function` form), so evaluating
    // the parenthesised text yields the function directly; otherwise the text is
    // treated as a body that defines a `generator`.
    compileSource(src) {
        const trimmed = src.trim();
        try {
            const fn = (0, eval)(`(${trimmed})`);
            if (typeof fn === 'function') return fn;
        } catch (_) { /* not a bare expression — fall through */ }

        const fn = new Function(
            `"use strict";\n${src}\n; return typeof generator !== 'undefined' ? generator : undefined;`
        )();
        if (typeof fn !== 'function') {
            throw new Error('Code must be a generator function "(rnd) => …", or define one named "generator".');
        }
        return fn;
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
        header.innerHTML = '<h3>Generator Code</h3>';
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
        applyButton.textContent = 'Apply & Regenerate';
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
        const rep = this.currentRepresentation();
        if (!rep || typeof rep.setGenerator !== 'function') {
            this.showStatus('This individual type has no editable generator.', true);
            return;
        }
        if (!this.modal) this.buildModal();
        this.textarea.value = rep.sourceText();
        this.showStatus('', false);
        this.modal.classList.add('open');
        document.addEventListener('keydown', this._onKeydown);
        setTimeout(() => this.textarea && this.textarea.focus(), 0); // defer until visible
    }

    close() {
        if (this.modal) this.modal.classList.remove('open');
        document.removeEventListener('keydown', this._onKeydown);
    }

    reset() {
        const rep = this.currentRepresentation();
        if (rep && this.textarea) {
            this.textarea.value = rep.originalSourceText();
            this.showStatus('Reset to the default generator — Apply to use it.', false);
        }
    }

    apply() {
        const rep = this.currentRepresentation();
        if (!rep) { this.showStatus('No editable generator for this type.', true); return; }

        let fn;
        try {
            fn = this.compileSource(this.textarea.value);
        } catch (err) {
            this.showStatus(`Error: ${err.message}`, true);
            return;
        }

        // Swap the generator in, then validate end-to-end by probe-rendering one
        // fresh individual. If anything throws (the generator errors, or its
        // phenotype no longer fits the individual's visualize()), revert so the
        // app keeps working and report the error.
        const previous = rep.generator;
        rep.setGenerator(fn);
        try {
            this.probeRender();
        } catch (err) {
            rep.setGenerator(previous);
            this.showStatus(`Error: ${err.message}`, true);
            return;
        }

        this.framework.reinitializePopulation();
        // Keep the modal open so the user can keep iterating; the grid behind it
        // already shows the new population.
        this.showStatus('Applied — new population generated.', false);
    }

    // Construct one individual of the current type and render it to an offscreen
    // canvas, to surface generator/phenotype errors before they reach the grid.
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

// HelpOverlayUI — the "?" shortcuts overlay.
//
// The content is GENERATED from InteractiveEAFramework.HOTKEYS, so the overlay
// cannot drift from the dispatcher: adding a binding to that table is all it
// takes to document it. Bindings are grouped by their `group`, and only the
// groups that can apply to the *current* type are shown — [ and ] mean the loop
// length on a step sequencer, the animation speed on an animated pattern, and
// the camera zoom otherwise, so showing all three at once would be a lie.
// General (always-on) rows come first.
//
// It also lists the pointer gestures, which have no hotkey binding to generate
// them from but are the least discoverable part of the app.
//
// Unlike the other ui/ panels this is not a drawer panel attached by capability
// flag: it is app-wide, so the framework builds it once (see setupUI) rather
// than loadExtensions attaching it per type.
const HELP_GESTURES = [
    ['Click a tile', 'Like / unlike it — liked tiles are the parents of the next generation'],
    ['Double-click / ⛶', 'Open the zoom view (long-press on touch)'],
    ['Drag in the zoom', 'Edit the phenotype directly, where a type allows it (the step sequencers)'],
    ['Drag up / down', 'On a step sequencer cell: its velocity'],
];

class HelpOverlayUI {
    constructor(framework) {
        this.framework = framework;
        this.el = null;
    }

    // Build the overlay lazily, mirroring the About modal's markup/classes.
    _ensure() {
        if (this.el) return this.el;
        const el = document.createElement('div');
        el.id = 'help-modal';
        el.className = 'lightbox about-modal';
        el.innerHTML =
            '<div class="lightbox-inner about-inner">' +
            '<button class="icon-btn lightbox-close" aria-label="Close">✕</button>' +
            '<div id="help-content" class="help-content"></div>' +
            '</div>';
        el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
        el.querySelector('.lightbox-close').addEventListener('click', () => this.close());
        document.body.appendChild(el);
        this.el = el;
        return el;
    }

    // Which hotkey groups are reachable for the type currently on screen. A
    // binding with no `when` is always reachable; one with a `when` is included
    // only if its predicate holds for the current context.
    _groups() {
        const fw = this.framework;
        const ctx = (typeof fw._hotkeyContext === 'function') ? fw._hotkeyContext() : {};
        const groups = new Map();
        for (const b of (InteractiveEAFramework.HOTKEYS || [])) {
            if (b.when && !b.when(ctx)) continue;
            if (!groups.has(b.group)) groups.set(b.group, []);
            groups.get(b.group).push({
                keys: b.displayKeys || b.keys.map(k => (k === ' ' ? 'Space' : k)).join(' / '),
                desc: b.desc,
            });
        }
        // General first, the rest in table order.
        return [...groups.entries()].sort((a, b) => (a[0] === 'General' ? -1 : b[0] === 'General' ? 1 : 0));
    }

    _render() {
        // Keys render as keycaps; gestures are phrases, not keys, so they get
        // plain emphasis instead (a <kbd> around "Double-click / ⛶" reads wrong).
        const rows = (items, tag) => items
            .map(i => `<div class="help-row"><${tag}>${escapeHTML(i.keys)}</${tag}>` +
                      `<span>${escapeHTML(i.desc)}</span></div>`)
            .join('');
        let html = '<h2 class="help-title">Keyboard &amp; pointer</h2>';
        for (const [group, items] of this._groups()) {
            html += `<h3 class="help-group">${escapeHTML(group)}</h3>${rows(items, 'kbd')}`;
        }
        html += '<h3 class="help-group">Pointer</h3>' +
            rows(HELP_GESTURES.map(([keys, desc]) => ({ keys, desc })), 'em');
        this.el.querySelector('#help-content').innerHTML = html;
    }

    isOpen() { return !!(this.el && this.el.classList.contains('open')); }

    open() {
        this._ensure();
        this._render();               // re-generate: the groups depend on the current type
        this.el.classList.add('open');
    }

    close() { if (this.el) this.el.classList.remove('open'); }

    toggle() { this.isOpen() ? this.close() : this.open(); }
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

if (typeof window !== 'undefined') window.HelpOverlayUI = HelpOverlayUI;
if (typeof module !== 'undefined' && module.exports) module.exports = { HelpOverlayUI, HELP_GESTURES };

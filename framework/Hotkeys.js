// Hotkeys — the declarative keyboard-shortcut table, its dispatcher, and the
// drawer / about / evolve action methods the table and the app-bar buttons share.
//
// Partial class: authored here, merged onto InteractiveEAFramework.prototype
// (below). `this` is the framework instance. Loaded after framework/Anemone.js.
//
// InteractiveEAFramework.HOTKEYS is the single source of truth for shortcuts and
// also feeds the ? help overlay. Each binding is:
//   { keys, group, desc, when?(ctx), global?, displayKeys?, run(fw, e) }
// The dispatcher walks the table in order and fires the first binding whose key
// matches and whose `when(ctx)` holds. Order matters: context-branched keys
// ([ ] .) list their sequencer / animated-pattern / default variants in that
// order, so the right one wins — reproducing the old if/else chain exactly.
(function () {
    const ext = class {
        // The one evolve entry point (FAB, app-bar button, Space hotkey).
        evolveGeneration() {
            console.time('Full Evolution Process');
            console.time('Cleanup');
            this.cleanupOldIndividuals();
            console.timeEnd('Cleanup');
            console.time('EA Evolve');
            this.ea.evolve();
            console.timeEnd('EA Evolve');
            this.currentIndividual = null; // population changed
            console.time('Render');
            this.render();
            console.timeEnd('Render');
            console.timeEnd('Full Evolution Process');
        }

        openDrawer() { this.drawer.classList.add('open'); this.drawerScrim.classList.add('open'); }
        closeDrawer() { this.drawer.classList.remove('open'); this.drawerScrim.classList.remove('open'); }

        openAbout() {
            if (!this.aboutModal) return;
            this.aboutModal.classList.add('open');
            if (this.aboutContent) {
                this.aboutContent.textContent = 'Loading…';
                fetch('About.md')
                    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
                    .then((text) => { this.aboutContent.textContent = text; })
                    .catch(() => { this.aboutContent.textContent = 'Could not load About.md.'; });
            }
        }
        closeAbout() { if (this.aboutModal) this.aboutModal.classList.remove('open'); }

        // The ? overlay, generated from this very table (see ui/HelpOverlayUI.js).
        toggleHelp() { if (this.helpOverlay) this.helpOverlay.toggle(); }
        closeHelp() { if (this.helpOverlay) this.helpOverlay.close(); }

        // The current type's context, computed once per keydown. `[ ] .` mean
        // different things for a step sequencer, an animated pattern, or otherwise.
        _hotkeyContext() {
            const s = this._sampleIndividual();
            return {
                sequencer: !!(s && typeof s.performanceDials === 'function' && s.performanceDials().includes('length')),
                animatedPattern: !!(typeof AnimatedPatternIndividual !== 'undefined' && s instanceof AnimatedPatternIndividual),
            };
        }

        _handleKeydown(e) {
            // Escape (a `global` binding) works even while typing or with the About
            // overlay open; every other shortcut is suppressed in those states, so
            // typing in the code editor never triggers a hotkey.
            const t = e.target;
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t && t.tagName) || (t && t.isContentEditable);
            const aboutOpen = this.aboutModal && this.aboutModal.classList.contains('open');
            const ctx = this._hotkeyContext();
            for (const b of InteractiveEAFramework.HOTKEYS) {
                if (!b.keys.includes(e.key)) continue;
                if (b.when && !b.when(ctx)) continue;
                if (!b.global && (typing || aboutOpen)) return; // guards block all but Escape
                b.run(this, e);
                return;
            }
        }
    };
    const descriptors = Object.getOwnPropertyDescriptors(ext.prototype);
    delete descriptors.constructor;
    Object.defineProperties(InteractiveEAFramework.prototype, descriptors);

    // Hex tile-selection keys (0–9 a–f, plus shifted A–F); parseInt(key,16) → index.
    const HEX = '0123456789abcdefABCDEF'.split('');

    InteractiveEAFramework.HOTKEYS = [
        { keys: ['Escape'], global: true, group: 'General', desc: 'Close zoom / drawer / about / placement',
          run: (fw) => { fw.closeZoom(); fw.closeDrawer(); fw.closeAbout(); fw.closeHelp(); fw.exitPlacementMode(); } },

        // [ and ] — context-sensitive (sequencer length, animation speed, or camera zoom).
        { keys: ['['], group: 'Step sequencer', when: (c) => c.sequencer, desc: 'Shorten loop (−1 step)',
          run: (fw) => fw.adjustSequencerLength(-1) },
        { keys: [']'], group: 'Step sequencer', when: (c) => c.sequencer, desc: 'Lengthen loop (+1 step)',
          run: (fw) => fw.adjustSequencerLength(1) },
        { keys: ['['], group: 'Animated pattern', when: (c) => c.animatedPattern, desc: 'Slow the animation',
          run: () => AnimatedPatternIndividual.adjustPeriodScale(1.3) },
        { keys: [']'], group: 'Animated pattern', when: (c) => c.animatedPattern, desc: 'Speed the animation',
          run: () => AnimatedPatternIndividual.adjustPeriodScale(1 / 1.3) },
        { keys: ['['], group: '3D camera', when: (c) => !c.sequencer && !c.animatedPattern, desc: 'Zoom camera in',
          run: (fw) => { fw.cameraDistanceFactor = Math.max(0.3, fw.cameraDistanceFactor / 1.15); } },
        { keys: [']'], group: '3D camera', when: (c) => !c.sequencer && !c.animatedPattern, desc: 'Zoom camera out',
          run: (fw) => { fw.cameraDistanceFactor = Math.min(4, fw.cameraDistanceFactor * 1.15); } },

        // Camera focal length / reset — harmless for 2D types (no visible effect).
        { keys: ['-', '_'], group: '3D camera', desc: 'Narrow field of view (more telephoto)',
          run: (fw) => { fw.cameraFOV = Math.max(8, fw.cameraFOV - 5); } },
        { keys: ['=', '+'], group: '3D camera', desc: 'Widen field of view',
          run: (fw) => { fw.cameraFOV = Math.min(100, fw.cameraFOV + 5); } },
        { keys: ['\\'], group: '3D camera', desc: 'Reset camera',
          run: (fw) => { fw.cameraDistanceFactor = 1 / (1.15 * 1.15); fw.cameraFOV = 30; } },

        // . / > — play/pause (animation, or sound / 3D rotation).
        { keys: ['.', '>'], group: 'Animated pattern', when: (c) => c.animatedPattern, desc: 'Play / pause animation',
          run: (fw, e) => { e.preventDefault(); AnimatedPatternIndividual.togglePause(); } },
        { keys: ['.', '>'], group: 'Playback', when: (c) => !c.animatedPattern, desc: 'Play / pause sound (or 3D rotation)',
          run: (fw, e) => { e.preventDefault(); fw.togglePlayPauseOrRotation(); } },

        { keys: ['?'], group: 'General', desc: 'Show / hide this shortcuts list',
          run: (fw, e) => { e.preventDefault(); fw.toggleHelp(); } },
        { keys: [' '], group: 'General', desc: 'Evolve next generation',
          run: (fw, e) => { e.preventDefault(); if (fw.lightbox && fw.lightbox.classList.contains('open')) fw.closeZoom(); fw.evolveGeneration(); } },
        { keys: HEX, displayKeys: '0–9 a–f', group: 'General', desc: 'Like / unlike a tile',
          run: (fw, e) => fw.toggleSelectByIndex(parseInt(e.key, 16)) },
    ];
})();

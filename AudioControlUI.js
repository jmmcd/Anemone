/**
 * AudioControlUI — drawer panel to load / replace the shared audio clip.
 *
 * Attached by the framework (loadExtensions) whenever the current individual type
 * returns true from usesAudio() — mirroring PhotoControlUI for usesPhoto(). Loading
 * a clip updates the shared window.AudioClip service and then calls
 * framework.invalidateAndRender(), which redraws every tile (the shared waveform)
 * but KEEPS the evolved population — so evolution continues on the new clip rather
 * than restarting. A ▶ button auditions the raw (unfiltered) source clip.
 */
class AudioControlUI {
    constructor(framework) {
        this.framework = framework;
        this._preview = null; // raw-clip playback node while auditioning
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Audio</h3>';

        const btn = document.createElement('button');
        btn.className = 'secondary-btn';
        btn.textContent = window.AudioClip.hasClip() ? 'Replace Clip…' : 'Load Clip…';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.style.display = 'none';

        const playBtn = document.createElement('button');
        playBtn.className = 'secondary-btn';
        playBtn.textContent = '▶ Source';
        playBtn.style.marginLeft = '6px';

        const preview = document.createElement('canvas');
        preview.width = 220; preview.height = 56;
        preview.style.cssText = 'display:block;margin-top:8px;border-radius:6px;width:220px;height:56px;background:#111;';

        const status = document.createElement('div');
        status.className = 'hotkey-hint';
        status.textContent = window.AudioClip.name();

        btn.addEventListener('click', () => input.click());

        input.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            input.value = ''; // allow re-loading the same file
            if (!file) return;
            status.textContent = 'Loading…';
            try {
                await window.AudioClip.setClipFromFile(file);
                btn.textContent = 'Replace Clip…';
                status.textContent = window.AudioClip.name();
                this.drawPreview(preview);
                this.framework.invalidateAndRender();
            } catch (err) {
                console.warn('Audio load failed:', err);
                status.textContent = 'Could not load that clip';
            }
        });

        playBtn.addEventListener('click', () => this.toggleSource(playBtn));

        section.appendChild(btn);
        section.appendChild(input);
        section.appendChild(playBtn);
        section.appendChild(preview);
        section.appendChild(status);
        container.appendChild(section);

        this.drawPreview(preview);
    }

    // Audition the raw source clip (looping) — independent of any individual.
    toggleSource(btn) {
        const clip = window.AudioClip;
        if (this._preview) {
            try { this._preview.stop(); } catch (_) { }
            this._preview = null;
            btn.textContent = '▶ Source';
            return;
        }
        const buffer = clip.buffer();
        if (!buffer) return;
        const ctx = clip.context();
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createBufferSource();
        src.buffer = buffer; src.loop = true;
        src.connect(ctx.destination);
        src.onended = () => { this._preview = null; btn.textContent = '▶ Source'; };
        src.start();
        this._preview = src;
        btn.textContent = '■ Source';
    }

    drawPreview(canvas) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
        const peaks = window.AudioClip.peaks(w);
        const mid = h / 2, amp = h * 0.44;
        ctx.strokeStyle = '#6cf'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
            ctx.moveTo(x + 0.5, mid - peaks.max[x] * amp);
            ctx.lineTo(x + 0.5, mid - peaks.min[x] * amp);
        }
        ctx.stroke();
    }
}

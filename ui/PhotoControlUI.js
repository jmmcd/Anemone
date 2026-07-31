/**
 * PhotoControlUI — drawer panel to load / replace the shared photo.
 *
 * Attached by the framework (loadExtensions) whenever the current individual type
 * returns true from usesPhoto() — mirroring how PaletteControlUI is attached for
 * usesColorPalette(). Loading a photo updates the shared window.Photo service and
 * then calls framework.invalidateAndRender(), which discards cached renders and
 * redraws but KEEPS the evolved population — so evolution continues on the new
 * photo rather than restarting.
 */
class PhotoControlUI {
    constructor(framework) {
        this.framework = framework;
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>Photo</h3>';

        const btn = document.createElement('button');
        btn.className = 'secondary-btn';
        btn.textContent = window.Photo.hasImage() ? 'Replace Photo…' : 'Load Photo…';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        const preview = document.createElement('canvas');
        preview.width = 96;
        preview.height = 96;
        preview.style.cssText = 'display:block;margin-top:8px;border-radius:6px;width:96px;height:96px;';

        const status = document.createElement('div');
        status.className = 'hotkey-hint';
        status.textContent = window.Photo.hasImage() ? window.Photo.name() : 'Default: ' + window.Photo.name();

        btn.addEventListener('click', () => input.click());

        input.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            input.value = ''; // allow re-loading the same file
            if (!file) return;
            status.textContent = 'Loading…';
            try {
                await window.Photo.setImageFromFile(file);
                btn.textContent = 'Replace Photo…';
                status.textContent = window.Photo.name();
                this.drawPreview(preview);
                // Keep the population; just re-render every individual on the new photo.
                this.framework.invalidateAndRender();
            } catch (err) {
                console.warn('Photo load failed:', err);
                status.textContent = 'Could not load that image';
            }
        });

        section.appendChild(btn);
        section.appendChild(input);
        section.appendChild(preview);
        section.appendChild(status);
        container.appendChild(section);

        this.drawPreview(preview);
    }

    drawPreview(canvas) {
        const src = window.Photo.sourceImageData(canvas.width, canvas.height);
        // Copy into a fresh buffer so we never hand the shared cache to putImageData
        // as something that could be mutated elsewhere.
        const ctx = canvas.getContext('2d');
        const out = ctx.createImageData(canvas.width, canvas.height);
        out.data.set(src.data);
        ctx.putImageData(out, 0, 0);
    }
}

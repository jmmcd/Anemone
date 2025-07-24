class PaletteControlUI {
    constructor(framework) {
        this.framework = framework;
        this.container = null;
        this.paletteOptions = this.loadPaletteOptions();
    }
    
    loadPaletteOptions() {
        if (!window.continuousPaletteSystem) {
            // Fallback palettes if continuous system isn't available
            return [
                { id: 'viridis', name: 'Viridis' },
                { id: 'plasma', name: 'Plasma' },
                { id: 'inferno', name: 'Inferno' },
                { id: 'blues', name: 'Blues' },
                { id: 'reds', name: 'Reds' }
            ];
        }
        
        const palettes = [];
        const paletteList = window.continuousPaletteSystem.getPaletteList();
        
        for (const paletteName of paletteList) {
            const info = window.continuousPaletteSystem.getPaletteInfo(paletteName);
            palettes.push({
                id: paletteName,
                name: info.description,
                type: info.type
            });
        }
        
        // Sort by type for better organization
        palettes.sort((a, b) => {
            if (a.type !== b.type) {
                const typeOrder = { 'sequential': 0, 'diverging': 1, 'custom': 2, 'cyclical': 3 };
                return (typeOrder[a.type] || 4) - (typeOrder[b.type] || 4);
            }
            return a.name.localeCompare(b.name);
        });
        
        return palettes;
    }
    
    mount(container) {
        this.container = container;
        this.createPaletteControl();
    }
    
    createPaletteControl() {
        // Create palette control section
        const paletteSection = document.createElement('div');
        paletteSection.className = 'extension-section';
        paletteSection.innerHTML = '<h3>Color Palette</h3>';
        
        // Create palette selector with organized groups
        const paletteSelector = document.createElement('select');
        paletteSelector.id = 'palette-selector';
        paletteSelector.className = 'palette-selector';
        
        // Group palettes by type
        const groupedPalettes = {};
        this.paletteOptions.forEach(option => {
            const type = option.type || 'other';
            if (!groupedPalettes[type]) {
                groupedPalettes[type] = [];
            }
            groupedPalettes[type].push(option);
        });
        
        // Add palettes in organized groups
        const typeLabels = {
            'sequential': 'Sequential',
            'diverging': 'Diverging',
            'custom': 'Custom',
            'cyclical': 'Cyclical',
            'other': 'Other'
        };
        
        Object.entries(groupedPalettes).forEach(([type, options]) => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = typeLabels[type] || type;
            
            options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.id;
                optionElement.textContent = option.name;
                if (option.id === this.framework.settings.colorPalette) {
                    optionElement.selected = true;
                }
                optgroup.appendChild(optionElement);
            });
            
            paletteSelector.appendChild(optgroup);
        });
        
        paletteSelector.addEventListener('change', (e) => {
            this.framework.updateSetting('colorPalette', e.target.value);
            this.updatePalettePreview(e.target.value);
        });
        
        paletteSection.appendChild(paletteSelector);
        
        // Create palette preview
        const palettePreview = document.createElement('div');
        palettePreview.id = 'palette-preview';
        palettePreview.className = 'palette-preview';
        this.updatePalettePreview(this.framework.settings.colorPalette);
        paletteSection.appendChild(palettePreview);
        
        // Add hotkey hint
        const hotkey = document.createElement('div');
        hotkey.className = 'hotkey-hint';
        hotkey.textContent = 'Press P to cycle palettes';
        paletteSection.appendChild(hotkey);
        
        this.container.appendChild(paletteSection);
        
        // Add keyboard shortcut
        this.addKeyboardShortcut();
    }
    
    updatePalettePreview(paletteId) {
        const preview = document.getElementById('palette-preview');
        if (!preview) return;
        
        preview.innerHTML = '';
        
        let colors = [];
        
        if (window.continuousPaletteSystem) {
            // Get color swatch from continuous palette system
            colors = window.continuousPaletteSystem.getColorSwatch(paletteId, 8);
        } else {
            // Fallback for when continuous system isn't available
            const palette = this.paletteOptions.find(p => p.id === paletteId);
            if (palette && palette.colors) {
                colors = palette.colors.map(color => ({ hex: color }));
            }
        }
        
        colors.forEach((color, index) => {
            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'color-swatch';
            colorSwatch.style.backgroundColor = color.hex || color.css || color;
            colorSwatch.title = `${color.hex || color.css || color} (${index + 1}/8)`;
            preview.appendChild(colorSwatch);
        });
    }
    
    addKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'p' || e.key === 'P') {
                e.preventDefault();
                this.cyclePalette();
            }
        });
    }
    
    cyclePalette() {
        const currentPalette = this.framework.settings.colorPalette;
        const currentIndex = this.paletteOptions.findIndex(p => p.id === currentPalette);
        const nextIndex = (currentIndex + 1) % this.paletteOptions.length;
        const nextPalette = this.paletteOptions[nextIndex];
        
        // Update framework setting
        this.framework.updateSetting('colorPalette', nextPalette.id);
        
        // Update UI
        const selector = document.getElementById('palette-selector');
        if (selector) {
            selector.value = nextPalette.id;
        }
        
        this.updatePalettePreview(nextPalette.id);
        
        console.log(`Palette cycled to: ${nextPalette.name}`);
    }
}
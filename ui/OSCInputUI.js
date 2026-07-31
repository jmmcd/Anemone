/**
 * OSCInputUI — the drawer panel for window.OSCInput. A WebSocket URL field, a
 * "Receive OSC" checkbox, and a live status readout (Off / Connecting… / Receiving OSC).
 * Attached by the framework (loadExtensions) for individuals returning true from
 * usesOSCInput() — currently EEGSonificationIndividual, which reads its 5 feature
 * inputs from window.OSCInput.sample().
 *
 * Like MIDISyncUI, the status readout polls on a short interval (the connection state
 * changes on WebSocket callbacks the UI has no other hook into) and self-cancels once
 * its row leaves the document (e.g. the user switches individual type).
 */
class OSCInputUI {
    constructor(framework) {
        this.framework = framework;
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>OSC Input</h3>' +
            '<div class="hotkey-hint">Stream EEG features into this individual over OSC-via-WebSocket. ' +
            'Replay an EEG CSV with <code>node scripts/eeg-osc-sender.js your.csv</code>, or point any OSC ' +
            'source at address <code>/eeg</code> with 5 float args.</div>';

        const urlRow = document.createElement('div');
        urlRow.className = 'drum-dial';

        const url = document.createElement('input');
        url.type = 'text';
        url.id = 'osc-input-url';
        url.value = window.OSCInput.url;
        url.className = 'drum-dial-readout';
        url.style.flex = '1';

        urlRow.appendChild(url);
        section.appendChild(urlRow);

        const row = document.createElement('div');
        row.className = 'drum-dial';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = 'osc-input-toggle';
        toggle.checked = window.OSCInput.enabled;

        const label = document.createElement('label');
        label.htmlFor = toggle.id;
        label.className = 'drum-dial-label';
        label.textContent = 'Receive OSC';

        const status = document.createElement('span');
        status.className = 'drum-dial-readout';
        status.textContent = window.OSCInput.status();

        toggle.addEventListener('change', () => {
            if (toggle.checked) window.OSCInput.connect(url.value.trim());
            else window.OSCInput.disconnect();
            status.textContent = window.OSCInput.status();
        });

        // Editing the URL while connected re-points the socket.
        url.addEventListener('change', () => {
            if (window.OSCInput.enabled) window.OSCInput.connect(url.value.trim());
        });

        row.appendChild(toggle);
        row.appendChild(label);
        row.appendChild(status);
        section.appendChild(row);
        container.appendChild(section);

        const poll = setInterval(() => {
            if (!document.body.contains(status)) { clearInterval(poll); return; }
            status.textContent = window.OSCInput.status();
        }, 400);
    }
}

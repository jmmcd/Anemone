/**
 * MIDISyncUI — the drawer panel for window.MIDISync. One checkbox ("Sync to MIDI
 * Clock") plus a live status readout (Off / Waiting for clock… / Locked @ N BPM).
 * Attached by the framework (loadExtensions) for individuals returning true from
 * usesMIDISync() — the step sequencers (tempo comes from the clock) and the mouse/EEG
 * DAG individuals (their evaluation cadence paces to the clock; see MIDIModality.start).
 *
 * The readout polls on a short interval rather than being event-driven, since clock
 * pulses/Start/Stop arrive on a MIDI input callback the UI has no other hook into.
 * The poll self-cancels once its row leaves the document (e.g. the user switches
 * individual type and the extensions container is rebuilt) rather than requiring an
 * explicit unmount call, which no panel in this app currently has.
 */
class MIDISyncUI {
    constructor(framework) {
        this.framework = framework;
    }

    mount(container) {
        const section = document.createElement('div');
        section.className = 'extension-section';
        section.innerHTML = '<h3>MIDI Clock Sync</h3>' +
            '<div class="hotkey-hint">Lock tempo to an external MIDI clock (e.g. GarageBand/Logic over the same IAC bus Anemone\'s notes use) so evolving loops play in time with a DAW transport.</div>';

        const row = document.createElement('div');
        row.className = 'drum-dial';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = 'midi-sync-toggle';
        toggle.checked = window.MIDISync.enabled;

        const label = document.createElement('label');
        label.htmlFor = toggle.id;
        label.className = 'drum-dial-label';
        label.textContent = 'Sync to MIDI Clock';

        const status = document.createElement('span');
        status.className = 'drum-dial-readout';
        status.textContent = window.MIDISync.status();

        toggle.addEventListener('change', () => {
            window.MIDISync.enabled = toggle.checked;
            status.textContent = window.MIDISync.status();
        });

        row.appendChild(toggle);
        row.appendChild(label);
        row.appendChild(status);
        section.appendChild(row);
        container.appendChild(section);

        const poll = setInterval(() => {
            if (!document.body.contains(status)) { clearInterval(poll); return; }
            status.textContent = window.MIDISync.status();
        }, 400);
    }
}

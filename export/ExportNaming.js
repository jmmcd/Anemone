/**
 * ExportNaming — one place for download filenames, so the convention can't drift
 * across the save/export services (ImageSave PNG, MeshExport STL, AudioExport WAV).
 *
 * Single-file exports are named `anemone-<type>-<timestamp>.<ext>`, e.g.
 * `anemone-audiofilter-2026-07-04T12-30-45-123.wav`. The timestamp (millisecond
 * ISO, ':'/'.' → '-') is stateless and collision-free across sessions/machines and
 * sorts chronologically — unlike a localStorage counter, which resets in private
 * mode or when storage is cleared and then overwrites earlier saves.
 *
 * (Batch/zip exports still use a per-archive index for entry names — ordering
 * within one archive, not global uniqueness — so they don't go through here.)
 */
window.ExportNaming = {
    // AnemoneIndividual -> "anemone"; SuperShape3DIndividual -> "supershape3d".
    stem(typeName) {
        return String(typeName || 'individual')
            .replace(/Individual$/, '')
            .replace(/[^A-Za-z0-9]+/g, '')
            .toLowerCase() || 'individual';
    },

    // Millisecond ISO timestamp, filesystem-safe (2026-07-04T12-30-45-123).
    timestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
    },

    // Full download name for a single exported individual.
    filename(individual, ext) {
        const type = this.stem(individual && individual.constructor && individual.constructor.name);
        return `anemone-${type}-${this.timestamp()}.${ext}`;
    }
};

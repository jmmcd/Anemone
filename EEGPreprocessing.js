/**
 * EEGDataStream
 *
 * Represents a stream of EEG data with preprocessing and feature extraction.
 * Handles Muse headband CSV format (frequency bands + raw channels).
 * Supports both real-time input and CSV replay.
 */
class EEGDataStream {
    constructor() {
        this.data = []; // Array of timestamped samples
        this.currentIndex = 0;
        this.startTime = Date.now();
        this.replayRate = 1.0; // Playback speed multiplier
        this.columnHeaders = []; // Store column headers for feature extraction
    }

    /**
     * Load EEG data from Muse CSV
     * @param {string} csvContent - Raw CSV content
     * @param {Object} options - { skipHeaders, timeGridMs, downsampleRate, bands }
     */
    loadFromCSV(csvContent, options = {}) {
        try {
            const {
                skipHeaders = true,
                timeGridMs = 200,  // Align to 200ms grid for Muse data
                downsampleRate = 5, // Keep every 5th sample
                bands = ['Alpha', 'Beta', 'Theta'] // Frequency bands to extract
            } = options;

            if (!csvContent || typeof csvContent !== 'string') {
                throw new Error('Invalid CSV content');
            }

            const lines = csvContent.trim().split('\n');
            this.data = [];

            // Parse header
            if (skipHeaders && lines.length > 0) {
                this.columnHeaders = lines[0].split(',').map(h => h.trim());
            }

            // Find indices for frequency bands (Muse format: Band_Channel)
            const bandIndices = this.findBandIndices(bands);
            console.log(`🧠 Found bands: ${Object.keys(bandIndices).join(', ')}`);

            let sampleIndex = 0;
            let firstTimestamp = null;

            for (let i = (skipHeaders ? 1 : 0); i < lines.length; i++) {
                try {
                    const line = lines[i].trim();
                    if (!line) continue;

                    // Skip event lines (last column contains "/" suggesting event)
                    if (this.isEventLine(line)) {
                        console.log(`⏭ Skipping event: ${line.substring(0, 60)}`);
                        continue;
                    }

                    // Parse CSV line
                    const parts = line.split(',').map(v => v.trim());
                    if (parts.length < 2) continue;

                    // Extract timestamp (first column, format: YYYY-MM-DD HH:MM:SS.mmm)
                    const timestamp = this.parseTimestamp(parts[0]);
                    if (timestamp === null) continue;

                    // Record first timestamp for relative timing
                    if (firstTimestamp === null) {
                        firstTimestamp = timestamp;
                    }

                    // Downsample
                    if (sampleIndex % downsampleRate !== 0) {
                        sampleIndex++;
                        continue;
                    }

                    // Extract band values
                    const channels = this.extractBandValues(parts, bandIndices);

                    if (channels.length === 0) continue;

                    // Compute features from channels
                    const features = this.extractFeatures(channels);

                    // Relative time in ms from start of recording
                    const relativeTime = timestamp - firstTimestamp;

                    // Align to time grid
                    const alignedTime = Math.round(relativeTime / timeGridMs) * timeGridMs;

                    this.data.push({
                        timestamp,
                        relativeTime,
                        alignedTime,
                        channels,
                        features
                    });

                    sampleIndex++;
                } catch (lineError) {
                    // Skip problematic lines and continue
                    console.warn(`Skipped line ${i + 1}:`, lineError.message);
                    continue;
                }
            }

            console.log(`📊 Loaded ${this.data.length} EEG samples (duration: ${(this.getDuration() / 1000).toFixed(1)}s)`);
            this.currentIndex = 0;
            this.startTime = Date.now();
        } catch (error) {
            console.error('Error loading EEG CSV:', error);
            this.data = [];
            throw error;
        }
    }

    /**
     * Parse Muse timestamp format: YYYY-MM-DD HH:MM:SS.mmm → milliseconds
     */
    parseTimestamp(timestampStr) {
        try {
            // Format: "2025-05-27 09:14:39.652"
            if (!timestampStr || typeof timestampStr !== 'string') {
                return null;
            }
            const date = new Date(timestampStr);
            const time = date.getTime();
            // Check if date is valid
            if (isNaN(time)) {
                return null;
            }
            return time;
        } catch (e) {
            return null;
        }
    }

    /**
     * Find column indices for requested frequency bands
     */
    findBandIndices(bands) {
        const indices = {};

        for (const band of bands) {
            const channels = ['TP9', 'AF7', 'AF8', 'TP10'];
            const bandIndices = [];

            for (let colIdx = 0; colIdx < this.columnHeaders.length; colIdx++) {
                const header = this.columnHeaders[colIdx];
                // Look for Band_Channel pattern (e.g., Alpha_TP9)
                if (header.startsWith(band + '_')) {
                    const channel = header.substring(band.length + 1);
                    if (channels.includes(channel)) {
                        bandIndices.push(colIdx);
                    }
                }
            }

            if (bandIndices.length > 0) {
                indices[band] = bandIndices;
            }
        }

        return indices;
    }

    /**
     * Extract numeric values for selected bands
     */
    extractBandValues(parts, bandIndices) {
        const values = [];

        for (const band of Object.keys(bandIndices)) {
            for (const idx of bandIndices[band]) {
                if (idx < parts.length) {
                    const val = parseFloat(parts[idx]);
                    if (!isNaN(val)) {
                        values.push(val);
                    }
                }
            }
        }

        return values;
    }

    /**
     * Check if line is an event/metadata line
     * Events have "/" in the last non-empty column
     */
    isEventLine(line) {
        const parts = line.split(',');
        // Find last non-empty column
        for (let i = parts.length - 1; i >= 0; i--) {
            const val = parts[i].trim();
            if (val.length > 0) {
                // If it contains "/" it's likely an event marker
                if (val.includes('/')) {
                    return true;
                }
                // Try parsing as number - if fails, might be event
                if (isNaN(parseFloat(val))) {
                    return true;
                }
                return false;
            }
        }
        return true; // All empty columns
    }

    /**
     * Extract 5 key features from EEG frequency bands
     * Normalizes to [-1, 1] range
     */
    extractFeatures(channels) {
        if (channels.length === 0) {
            return [0, 0, 0, 0, 0];
        }

        // Feature 0: Mean of all bands (overall brain activity)
        const mean = channels.reduce((a, b) => a + b, 0) / channels.length;
        const feat0 = Math.tanh(mean / 5); // Normalize for band values

        // Feature 1: Variance across bands
        const variance = channels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / channels.length;
        const stdDev = Math.sqrt(variance);
        const feat1 = Math.tanh(stdDev / 5);

        // Feature 2: Max band value (peak activity)
        const max = Math.max(...channels);
        const feat2 = Math.tanh(max / 5);

        // Feature 3: Min band value (baseline)
        const min = Math.min(...channels);
        const feat3 = Math.tanh(min / 5);

        // Feature 4: Band asymmetry (left/right difference) if we have 4+ channels
        let feat4 = 0;
        if (channels.length >= 4) {
            // Assuming pattern: [Band1_TP9, Band1_AF7, Band1_AF8, Band1_TP10, Band2_TP9, ...]
            const chansPerBand = Math.floor(channels.length / 3); // 3 bands
            if (chansPerBand >= 4) {
                const leftAvg = (channels[1] + channels[0]) / 2; // AF7 + TP9
                const rightAvg = (channels[3] + channels[2]) / 2; // TP10 + AF8
                feat4 = Math.tanh((leftAvg - rightAvg) / 5);
            }
        }

        return [feat0, feat1, feat2, feat3, feat4];
    }

    /**
     * Get current sample for real-time streaming
     */
    getCurrentSample() {
        try {
            if (!this.data || this.data.length === 0) {
                return null;
            }

            // Bound currentIndex
            if (this.currentIndex >= this.data.length) {
                this.currentIndex = this.data.length - 1;
            }
            if (this.currentIndex < 0) {
                this.currentIndex = 0;
            }

            // Advance based on elapsed time
            const elapsed = Date.now() - this.startTime;
            const dataTime = elapsed * this.replayRate;

            // Get the duration of the entire dataset
            const totalDuration = this.getDuration();

            // If we've gone past the end of the data, loop back to the beginning
            if (dataTime > totalDuration && totalDuration > 0) {
                // Loop the playback
                const loopedTime = dataTime % (totalDuration + 1);
                const loopedElapsed = loopedTime / this.replayRate;
                this.startTime = Date.now() - loopedElapsed;
                console.log(`🔄 EEG stream looped`);
            }

            // Find sample at current time
            while (this.currentIndex < this.data.length - 1) {
                const nextSample = this.data[this.currentIndex + 1];
                if (nextSample && nextSample.alignedTime <= dataTime) {
                    this.currentIndex++;
                } else {
                    break;
                }
            }

            const sample = this.data[this.currentIndex];
            return sample && sample.features ? sample : null;
        } catch (error) {
            console.error('Error in getCurrentSample:', error);
            return null;
        }
    }

    /**
     * Reset to beginning
     */
    reset() {
        this.currentIndex = 0;
        this.startTime = Date.now();
    }

    /**
     * Get total duration of loaded data in ms
     */
    getDuration() {
        if (this.data.length === 0) return 0;
        const first = this.data[0];
        const last = this.data[this.data.length - 1];
        return last.relativeTime - first.relativeTime;
    }
}

/**
 * EEGPreprocessor
 * Static utilities for EEG data preprocessing
 */
class EEGPreprocessor {
    /**
     * Simple PCA dimensionality reduction (not yet implemented)
     * Placeholder for future dimensionality reduction
     */
    static pcaReduce(data, numComponents) {
        // TODO: implement PCA
        return data;
    }

    /**
     * Normalize data to [-1, 1] range
     */
    static normalize(values) {
        if (values.length === 0) return values;
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min || 1;
        return values.map(v => ((v - min) / range) * 2 - 1);
    }

    /**
     * Downsample array by keeping every nth sample
     */
    static downsample(data, factor) {
        return data.filter((_, i) => i % factor === 0);
    }
}

/**
 * MusicIndividual
 *
 * REFACTORED: Uses BinaryRepresentation for genome operations.
 * Generates MIDI note sequences encoded as binary genome (8 bits per note).
 */

class MusicIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');

        // Configure binary representation
        this.binaryRep = new BinaryRepresentation({
            length: 64 // 8 notes × 8 bits per note
        });

        this.genome = genome || this.binaryRep.generateRandom();

        this.midiModality = new MIDIModality();

        this.diatonicScale = [60, 62, 64, 65, 67, 69, 71, 72]; // C major scale (C4 to C5)
        this.timeStep = 250; // milliseconds per beat
        this.isPlaying = false;
        this.playbackTimer = null;

        console.log(`🎵 Creating MusicIndividual ${this.id}`);
    }

    setMidiOutput(midiOutput) {
        this.midiModality.setMidiOutput(midiOutput);
        console.log(`🔧 MusicIndividual ${this.id} MIDI set to: ${midiOutput?.name || 'none'}`);
    }
    
    getPhenotype() {
        const notes = [];
        const segmentSize = 8; // 8 bits per note
        
        for (let i = 0; i < this.genome.length; i += segmentSize) {
            const segment = this.genome.slice(i, i + segmentSize);
            
            // Convert 8-bit segment to decimal
            const value = segment.reduce((acc, bit, index) => acc + bit * Math.pow(2, 7 - index), 0);
            
            // Map to diatonic scale
            const scaleIndex = value % this.diatonicScale.length;
            const pitch = this.diatonicScale[scaleIndex];
            
            // Use remaining bits for note properties
            const velocity = Math.max(40, (value % 64) + 64); // 64-127 velocity range
            const duration = this.timeStep * (1 + (value % 4)); // 1-4 beats
            
            notes.push({
                pitch: pitch,
                velocity: velocity,
                duration: duration,
                time: i / segmentSize * this.timeStep
            });
        }
        
        return notes;
    }
    
    visualize(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        const notes = this.getPhenotype();
        const maxTime = Math.max(...notes.map(n => n.time)) + this.timeStep;
        const minPitch = Math.min(...this.diatonicScale);
        const maxPitch = Math.max(...this.diatonicScale);
        
        // Draw grid lines
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        
        // Horizontal lines (pitches)
        for (let i = 0; i < this.diatonicScale.length; i++) {
            const y = height - (i / (this.diatonicScale.length - 1)) * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Vertical lines (time)
        for (let i = 0; i < 8; i++) {
            const x = (i / 7) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Draw notes
        notes.forEach((note, index) => {
            const x = (note.time / maxTime) * width;
            const pitchIndex = this.diatonicScale.indexOf(note.pitch);
            const y = height - (pitchIndex / (this.diatonicScale.length - 1)) * height;
            
            // Note color based on velocity
            const intensity = note.velocity / 127;
            const hue = 120 + (pitchIndex * 30); // Green to blue spectrum
            ctx.fillStyle = `hsl(${hue}, 70%, ${30 + intensity * 50}%)`;
            
            // Draw note as circle
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw note duration as line
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (note.duration / maxTime) * width * 0.8, y);
            ctx.stroke();
        });
        
        // Draw pitch labels
        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        this.diatonicScale.forEach((pitch, index) => {
            const y = height - (index / (this.diatonicScale.length - 1)) * height;
            const noteName = this.midiToNoteName(pitch);
            ctx.fillText(noteName, width - 5, y + 4);
        });
    }
    
    midiToNoteName(midi) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const note = notes[midi % 12];
        return note + octave;
    }
    
    playMIDI() {
        if (this.isPlaying) {
            this.stopMIDI();
            return;
        }

        this.isPlaying = true;
        const notes = this.getPhenotype();
        let currentNoteIndex = 0;
        
        // console.log('Starting playback with', notes.length, 'notes');
        
        const playNext = () => {
            if (!this.isPlaying || currentNoteIndex >= notes.length) {
                // Loop back to start
                currentNoteIndex = 0;
                if (this.isPlaying) {
                    this.playbackTimer = setTimeout(playNext, this.timeStep);
                }
                return;
            }
            
            const note = notes[currentNoteIndex];
            this.sendMIDINote(note.pitch, note.velocity, note.duration);
            
            currentNoteIndex++;
            this.playbackTimer = setTimeout(playNext, this.timeStep);
        };
        
        playNext();
    }
    
    stopMIDI() {
        this.isPlaying = false;
        if (this.playbackTimer) {
            clearTimeout(this.playbackTimer);
            this.playbackTimer = null;
        }
        this.midiModality.allNotesOff();
    }

    sendMIDINote(pitch, velocity, duration) {
        this.midiModality.sendNote(pitch, velocity, duration);
    }

    mutate(rate = 0.1) {
        this.binaryRep.mutate(this.genome, rate);
    }

    crossover(other) {
        const [child1Genome, child2Genome] = this.binaryRep.crossover(this.genome, other.genome);
        return [new MusicIndividual(child1Genome), new MusicIndividual(child2Genome)];
    }

    clone() {
        const clone = new MusicIndividual(this.binaryRep.clone(this.genome));
        clone.fitness = this.fitness;
        clone.midiModality.setMidiOutput(this.midiModality.midiOutput);
        return clone;
    }
}
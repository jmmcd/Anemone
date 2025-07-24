class MusicIndividual extends Individual {
    constructor(genome = null) {
        super(genome);
        this.diatonicScale = [60, 62, 64, 65, 67, 69, 71, 72]; // C major scale (C4 to C5)
        this.timeStep = 250; // milliseconds per beat
        this.isPlaying = false;
        this.playbackTimer = null;
        this.midiOutput = null;
        this.audioContext = null;
        
        console.log(`🎵 Creating MusicIndividual ${this.id}`);
        
        // Initialize Web Audio only
        this.initWebAudio();
    }
    
    setMidiOutput(midiOutput) {
        this.midiOutput = midiOutput;
        console.log(`🔧 MusicIndividual ${this.id} MIDI set to: ${midiOutput?.name || 'none'}`);
    }
    
    generateRandomGenome() {
        return Array.from({length: 64}, () => Math.random() < 0.5 ? 1 : 0);
    }
    
    
    initWebAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (err) {
            console.log('Web Audio API not supported');
        }
    }
    
    midiToFrequency(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    
    playWebAudioNote(pitch, velocity, duration) {
        if (!this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.frequency.setValueAtTime(this.midiToFrequency(pitch), this.audioContext.currentTime);
        oscillator.type = 'sine';
        
        const volume = velocity / 127 * 0.3;
        gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration / 1000);
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
        console.log('playMIDI called on individual:', this.id);
        console.log('Audio context state:', this.audioContext?.state);
        console.log('MIDI output:', this.midiOutput?.name || 'none');
        
        if (this.isPlaying) {
            console.log('Stopping currently playing individual');
            this.stopMIDI();
            return;
        }
        
        // Resume audio context if suspended
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
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
        
        // Send all notes off
        if (this.midiOutput) {
            this.midiOutput.send([0xB0, 0x7B, 0x00]); // All notes off
        }
    }
    
    sendMIDINote(pitch, velocity, duration) {
        if (this.midiOutput) {
            // Send MIDI with detailed byte logging
            const noteOnBytes = [0x90, pitch, velocity];
            const noteOffBytes = [0x80, pitch, 0];
            
            // console.log(`🎵 MIDI Note ON  to "${this.midiOutput.name}": [${noteOnBytes.map(b => '0x' + b.toString(16).toUpperCase()).join(', ')}] = Channel 1, Note ${pitch} (${this.midiToNoteName(pitch)}), Velocity ${velocity}`);
            
            try {
                this.midiOutput.send(noteOnBytes);
                
                setTimeout(() => {
                    // console.log(`🎵 MIDI Note OFF to "${this.midiOutput.name}": [${noteOffBytes.map(b => '0x' + b.toString(16).toUpperCase()).join(', ')}] = Channel 1, Note ${pitch}, Velocity 0`);
                    this.midiOutput.send(noteOffBytes);
                }, duration);
            } catch (error) {
                console.error(`❌ MIDI send error:`, error);
            }
        } else {
            // Disable Web Audio fallback for debugging
            console.log(`❌ NO MIDI OUTPUT AVAILABLE - Note ${pitch} velocity ${velocity} NOT PLAYED`);
            // this.playWebAudioNote(pitch, velocity, duration);
        }
    }
    
    clone() {
        const clone = new this.constructor();
        clone.genome = [...this.genome];
        clone.fitness = this.fitness;
        return clone;
    }
}
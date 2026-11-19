class Turtle {
    constructor(x = 0, y = 0, heading = 0, penWidth = 2, colorIndex = 0, stepSize = 10) {
        this.x = x;
        this.y = y;
        this.heading = heading; // angle in degrees
        this.penWidth = penWidth;
        this.colorIndex = colorIndex;
        this.stepSize = stepSize;
        this.path = []; // Store drawing commands
    }
    
    copy() {
        const turtle = new Turtle(this.x, this.y, this.heading, this.penWidth, this.colorIndex, this.stepSize);
        turtle.path = [...this.path];
        return turtle;
    }
    
    moveForward() {
        const radians = (this.heading * Math.PI) / 180;
        const newX = this.x + Math.cos(radians) * this.stepSize;
        const newY = this.y + Math.sin(radians) * this.stepSize;
        
        // Always draw a line since pen is always down
        this.path.push({
            type: 'line',
            x1: this.x,
            y1: this.y,
            x2: newX,
            y2: newY,
            width: this.penWidth,
            colorIndex: this.colorIndex
        });
        
        this.x = newX;
        this.y = newY;
    }
    
    turn(angle) {
        this.heading = (this.heading + angle) % 360;
    }
    
    changePenWidth(delta) {
        this.penWidth = Math.max(1, Math.min(5, this.penWidth + delta));
    }
    
    changeStepSize(delta) {
        this.stepSize = Math.max(2, Math.min(30, this.stepSize + delta));
    }
    
    changeColor() {
        this.colorIndex = (this.colorIndex + 1) % 8; // Cycle through 8 colors
    }
}

// This individual is backed by PTORepresentation (Program Trace Optimisation):
// the generic mutate/crossover/clone operators live there, and the only
// Anemone-specific piece is the generator below — it defines the search space.
//
// The generator builds a variable-length array of bytes (0-255), the same shape
// as the old hand-rolled genome, but routing all randomness through PTO's `rnd`
// so each decision is recorded in the trace (the genotype PTO evolves).
//
// NOTE (revisit later): genome length is bounded to the generator's randint
// range — it cannot grow indefinitely via incremental inserts the way the old
// mutation did (which grew up to 200). Keeping it simple for the pilot.
const ANEMONE_INIT_MIN_LEN = 12;
const ANEMONE_INIT_MAX_LEN = 22;

// Explicit for-loop (not Array.from): structural naming only instruments real
// loops, so each byte gets a counter-indexed gene name. With Array.from the
// element callbacks collide to a positional fallback, which misaligns badly when
// the length gene changes a variable-length genome. See PTORepresentation.
const anemoneGenerator = (rnd) => {
    const length = rnd.randint(ANEMONE_INIT_MIN_LEN, ANEMONE_INIT_MAX_LEN);
    const bytes = [];
    for (let i = 0; i < length; i++) bytes.push(rnd.randint(0, 255));
    return bytes;
};

// One shared, stateless representation for all AnemoneIndividuals (it lazily
// builds a single PTO Op on first use).
const anemoneRepresentation = new PTORepresentation(anemoneGenerator);

class AnemoneIndividual extends Individual {
    static representation = anemoneRepresentation;
    static capabilities = {
        usesColorPalette: true,
    };

    // this.genome is the PTO trace (the genotype). this.phenotype (inherited,
    // derived by the representation) is the byte array the generator produced.
    // mutate/crossover/clone are inherited from Individual and delegate to
    // this.representation (PTORepresentation), so there are no operator overrides.
    constructor(genome = null) {
        super(genome);

        // Command mapping
        this.commands = {
            'F': 'moveForward',
            'B': 'branch',
            'L': 'loop',
            '+': 'turnRight',
            '-': 'turnLeft', 
            'R': 'turnRightLarge',
            'T': 'turnLeftLarge',
            'U': 'turnAround',
            'W': 'penWidthIncrease',
            'w': 'penWidthDecrease',
            'C': 'changeColor',
            'S': 'stepSizeIncrease',
            's': 'stepSizeDecrease'
        };
        
        // Available characters for genome generation
        this.characters = Object.keys(this.commands);
    }

    validate() {
        return this.executeGenome().length > 0;
    }

    integerToCharacter(value) {
        return this.characters[value % this.characters.length];
    }

    executeGenome() {
        return this.derive('paths', (p) => {
            const turtle = new Turtle(0, 0, 0, 2, 0, 10);
            const turtles = [turtle];

            this.executeGenomeOnTurtles(turtles, p, 0);
        
            // Collect all paths from all turtles
            const allPaths = [];
            turtles.forEach(t => allPaths.push(...t.path));
        
            return allPaths;
        });
    }
    
    executeGenomeOnTurtles(turtles, genome, startIndex) {
        let index = startIndex;
        
        while (index < genome.length && turtles.length > 0) {
            const value = genome[index];
            const character = this.integerToCharacter(value);
            
            if (character === 'B') {
                // Branch: spawn new turtle for each existing turtle
                const newTurtles = [];
                turtles.forEach(turtle => {
                    // Get branch angle from next integer
                    const angleValue = index + 1 < genome.length ? genome[index + 1] : 128;
                    const branchAngle = (angleValue / 255) * 90 - 45; // -45 to +45 degrees
                    
                    // Create branched turtle
                    const branchedTurtle = turtle.copy();
                    branchedTurtle.turn(branchAngle);
                    newTurtles.push(branchedTurtle);
                });
                
                turtles.push(...newTurtles);
                index += 2; // Skip the angle parameter
                
            } else if (character === 'L') {
                // Loop: repeat next 5 commands
                const loopCount = index + 1 < genome.length ? 
                    Math.max(1, Math.min(5, Math.floor((genome[index + 1] / 255) * 5) + 1)) : 2;
                
                const loopCommands = [];
                for (let i = 0; i < 5 && index + 2 + i < genome.length; i++) {
                    loopCommands.push(genome[index + 2 + i]);
                }
                
                // Execute loop commands for each iteration
                for (let i = 0; i < loopCount; i++) {
                    this.executeGenomeOnTurtles(turtles, loopCommands, 0);
                }
                
                index += 7; // Skip loop count + 5 commands
                
            } else {
                // Regular command: execute on all turtles
                turtles.forEach(turtle => {
                    this.executeCommand(turtle, character);
                });
                index++;
            }
            
            // Limit number of turtles to prevent explosion
            if (turtles.length > 20) {
                turtles.splice(20);
            }
        }
    }
    
    executeCommand(turtle, character) {
        switch (character) {
            case 'F':
                turtle.moveForward();
                break;
            case '+':
                turtle.turn(15);
                break;
            case '-':
                turtle.turn(-15);
                break;
            case 'R':
                turtle.turn(45);
                break;
            case 'T':
                turtle.turn(-45);
                break;
            case 'U':
                turtle.turn(180);
                break;
            case 'W':
                turtle.changePenWidth(1);
                break;
            case 'w':
                turtle.changePenWidth(-1);
                break;
            case 'C':
                turtle.changeColor();
                break;
            case 'S':
                turtle.changeStepSize(2);
                break;
            case 's':
                turtle.changeStepSize(-2);
                break;
        }
    }
    
    // Bioluminescent: palette-coloured strokes glowing against black, like
    // underwater life. Pen widths and glow are in tile pixels.
    visualize(canvas) {
        Canvas2DModality.renderSegments(canvas, this, {
            segments: () => this.executeGenome(),
            color: (p) => window.Palette.color(p.colorIndex / 7),
            width: (p, px) => Math.max(1, Math.round(p.width * px)),
            bloom: { radius: 2, strength: 1.5 },
        });
    }

    // The decoded turtle program: the meaningful phenotype, shown by the base
    // describe() as "Phenotype:". (this.phenotype is the raw byte array — the same
    // values as the genotype trace — so it isn't shown separately.)
    /** What visualize() draws: the turtle paths (see executeGenome). */
    getPhenotype() { return this.executeGenome(); }

    summary() {
        return this.phenotype.map(val => this.integerToCharacter(val)).join('');
    }
}
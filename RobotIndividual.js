// PTO generator: builds the 43-gene parameter vector, each gene drawn from its
// own range. PTORepresentation's default 'fine' mutation is Gaussian creep
// within each gene's range — the interactive feel the old FloatRepresentation had.
//
// The geometry genes are *relative*: limbs are expressed as angles/lengths
// hanging off the body, and facial features as offsets within the head, so the
// robot always holds together as a figure no matter how the genes drift.
const robotGenerator = (rnd) => [
    // Head (4)
    rnd.uniform(0.5, 1.0),   // 0: head size (relative to body width)
    rnd.uniform(0.35, 0.65), // 1: head x lean (0.5 = centered on body)
    rnd.uniform(0.0, 1.0),   // 2: neck length
    rnd.uniform(0, 1),       // 3: head shape (<0.5 round, else boxy)
    // Head color (3)
    rnd.uniform(0.2, 1), rnd.uniform(0.2, 1), rnd.uniform(0.2, 1), // 4-6
    // Eyes (6)
    rnd.uniform(0, 1),       // 7: eye type (dots / LED / wink)
    rnd.uniform(0.3, 0.7),   // 8: eye spacing (fraction of head width)
    rnd.uniform(0.2, 0.5),   // 9: eye height on face
    rnd.uniform(0, 1),       // 10: LED eye hue
    rnd.uniform(0.3, 0.9),   // 11: pupil size factor
    rnd.uniform(0.08, 0.2),  // 12: eye size (fraction of head radius)
    // Mouth (3)
    rnd.uniform(0, 1),       // 13: mouth type (smile / line / open / frown)
    rnd.uniform(0.3, 0.8),   // 14: mouth width (fraction of head width)
    rnd.uniform(0.35, 0.65), // 15: mouth height on lower face
    // Body (4)
    rnd.uniform(0.16, 0.30), // 16: body width
    rnd.uniform(0.20, 0.34), // 17: body height
    rnd.uniform(0.45, 0.55), // 18: body x
    rnd.uniform(0.48, 0.56), // 19: body y
    // Body color (3)
    rnd.uniform(0.2, 1), rnd.uniform(0.2, 1), rnd.uniform(0.2, 1), // 20-22
    // Arms (5)
    rnd.uniform(0, 1),       // 23: left arm angle (0 = hang down, 1 = raised out)
    rnd.uniform(0.5, 1.0),   // 24: arm length factor
    rnd.uniform(0, 1),       // 25: right arm angle
    rnd.uniform(0, 1),       // 26: hand size factor
    rnd.uniform(0.012, 0.035), // 27: arm thickness
    // Legs (5)
    rnd.uniform(0.3, 1.0),   // 28: leg spread (fraction of body width)
    rnd.uniform(0, 1),       // 29: left leg splay
    rnd.uniform(0, 1),       // 30: right leg splay
    rnd.uniform(0.5, 1.0),   // 31: leg length factor
    rnd.uniform(0.014, 0.04), // 32: leg thickness
    // Limb color (3)
    rnd.uniform(0.15, 0.9), rnd.uniform(0.15, 0.9), rnd.uniform(0.15, 0.9), // 33-35
    // Feature flags (4): antenna, side bolts, mouth grill, hat
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1), // 36-39
    // Accessories (3): sword flag, antenna/hat hue, accessory hue
    rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 1) // 40-42
];

const robotRepresentation = new PTORepresentation(robotGenerator);

// The whole robot lives in this draw function — not the flat 43-float
// generator — and it runs once per render (not per pixel), so it is the natural
// thing to edit for this type. It is held in an Editable slot so the code editor
// can swap it live (see editableSections / Individual.functionSection). Signature
// is (individual, ctx, width, height); it reads the decoded parameters via
// individual.getParameters().
const robotDraw = new Editable(function (self, ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    const params = self.getParameters();
    const scale = Math.min(width, height);

    const rgb = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;
    const darker = (c, f = 0.6) => `rgb(${Math.floor(c.r * f)}, ${Math.floor(c.g * f)}, ${Math.floor(c.b * f)})`;

    const drawCircle = (x, y, radius, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    };

    const drawThickLine = (x1, y1, x2, y2, thickness, style) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    // The test harness's canvas stub has no roundRect, so build one from arcs.
    const roundedRect = (x, y, w, h, r, style) => {
        r = Math.min(r, w / 2, h / 2);
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    };

    // --- Body (torso) ---
    const bodyX = params.bodyX * scale;
    const bodyY = params.bodyY * scale;
    const bodyW = params.bodyWidth * scale;
    const bodyH = params.bodyHeight * scale;

    // --- Head geometry, anchored above the torso ---
    const headRadius = params.headSize * bodyW * 0.42;
    const neckLen = (0.01 + params.neckLength * 0.025) * scale;
    const headX = bodyX + (params.headLean - 0.5) * bodyW * 0.4;
    const headY = bodyY - bodyH / 2 - neckLen - headRadius;

    // --- Legs, hanging from the torso's underside ---
    const legLen = (0.10 + params.legLength * 0.13) * scale;
    const legThickness = params.legThickness * scale;
    const legSpread = params.legSpread * bodyW * 0.5;
    const hipY = bodyY + bodyH / 2 - legThickness / 2;
    const leftHipX = bodyX - legSpread;
    const rightHipX = bodyX + legSpread;
    const leftFootX = leftHipX - (params.leftLegSplay - 0.5) * legLen * 0.5;
    const rightFootX = rightHipX + (params.rightLegSplay - 0.5) * legLen * 0.5;
    const footY = hipY + legLen;

    drawThickLine(leftHipX, hipY, leftFootX, footY, legThickness, rgb(params.limbColor));
    drawThickLine(rightHipX, hipY, rightFootX, footY, legThickness, rgb(params.limbColor));
    // Feet: little pads
    roundedRect(leftFootX - legThickness, footY - legThickness * 0.4, legThickness * 2.2, legThickness * 0.9, legThickness * 0.3, darker(params.limbColor));
    roundedRect(rightFootX - legThickness * 1.2, footY - legThickness * 0.4, legThickness * 2.2, legThickness * 0.9, legThickness * 0.3, darker(params.limbColor));

    // --- Arms, hinged at the torso's shoulders ---
    const armLen = (0.09 + params.armLength * 0.10) * scale;
    const armThickness = params.armThickness * scale;
    const shoulderY = bodyY - bodyH * 0.32;
    const leftShoulderX = bodyX - bodyW / 2;
    const rightShoulderX = bodyX + bodyW / 2;
    // Angle 0 → arm hangs straight down; 1 → raised almost to horizontal.
    // A sword-bearer keeps the sword arm at least partly raised so the
    // accessory reads clearly instead of dangling along the leg.
    const leftAngle = params.leftArmAngle * Math.PI * 0.45;
    const rightArmPose = params.hasSword ? 0.5 + params.rightArmAngle * 0.5 : params.rightArmAngle;
    const rightAngle = rightArmPose * Math.PI * 0.45;
    const leftHandX = leftShoulderX - Math.sin(leftAngle) * armLen;
    const leftHandY = shoulderY + Math.cos(leftAngle) * armLen;
    const rightHandX = rightShoulderX + Math.sin(rightAngle) * armLen;
    const rightHandY = shoulderY + Math.cos(rightAngle) * armLen;

    drawThickLine(leftShoulderX, shoulderY, leftHandX, leftHandY, armThickness, rgb(params.limbColor));
    drawThickLine(rightShoulderX, shoulderY, rightHandX, rightHandY, armThickness, rgb(params.limbColor));

    // Hands: gripper circles
    const handR = armThickness * (0.7 + params.handSize * 0.6);
    drawCircle(leftHandX, leftHandY, handR, darker(params.limbColor));
    drawCircle(rightHandX, rightHandY, handR, darker(params.limbColor));

    // --- Torso on top of limbs ---
    roundedRect(bodyX - bodyW / 2, bodyY - bodyH / 2, bodyW, bodyH, bodyW * 0.15, rgb(params.bodyColor));
    // Chest panel: inset darker plate with an indicator light
    const panelW = bodyW * 0.55;
    const panelH = bodyH * 0.4;
    roundedRect(bodyX - panelW / 2, bodyY - panelH / 2, panelW, panelH, panelW * 0.12, darker(params.bodyColor, 0.55));
    drawCircle(bodyX, bodyY - panelH * 0.15, panelW * 0.1, `hsl(${params.accessoryColor}, 90%, 60%)`);
    drawThickLine(bodyX - panelW * 0.28, bodyY + panelH * 0.22, bodyX + panelW * 0.28, bodyY + panelH * 0.22,
        Math.max(1, panelH * 0.08), darker(params.bodyColor, 0.35));

    // --- Neck ---
    ctx.fillStyle = darker(params.headColor, 0.6);
    ctx.fillRect(headX - headRadius * 0.22, headY + headRadius * 0.5, headRadius * 0.44, (bodyY - bodyH / 2) - (headY + headRadius * 0.5) + 2);

    // --- Head ---
    if (params.headShape > 0.5) {
        // Boxy robot head
        roundedRect(headX - headRadius, headY - headRadius * 0.9, headRadius * 2, headRadius * 1.8, headRadius * 0.25, rgb(params.headColor));
    } else {
        drawCircle(headX, headY, headRadius, rgb(params.headColor));
    }

    // Side bolts (robot "ears")
    if (params.hasBolts) {
        const boltR = headRadius * 0.22;
        drawCircle(headX - headRadius * 1.05, headY, boltR, darker(params.headColor, 0.5));
        drawCircle(headX + headRadius * 1.05, headY, boltR, darker(params.headColor, 0.5));
    }

    // Antenna with ball tip
    if (params.hasAntenna && !params.hasHat) {
        const antX = headX;
        const antBaseY = headY - headRadius * 0.95;
        const antTopY = antBaseY - headRadius * 0.6;
        drawThickLine(antX, antBaseY, antX, antTopY, Math.max(1.5, headRadius * 0.08), darker(params.headColor, 0.5));
        drawCircle(antX, antTopY, headRadius * 0.14, `hsl(${params.antennaColor}, 80%, 55%)`);
    }

    // Hat: brim + crown, proportional to the head
    if (params.hasHat) {
        ctx.fillStyle = `hsl(${params.antennaColor}, 70%, 35%)`;
        const brimY = headY - headRadius * 0.85;
        const brimW = headRadius * 2.5;
        const brimH = headRadius * 0.28;
        const crownW = headRadius * 1.5;
        const crownH = headRadius * 0.75;
        roundedRect(headX - brimW / 2, brimY - brimH / 2, brimW, brimH, brimH * 0.4, `hsl(${params.antennaColor}, 70%, 35%)`);
        roundedRect(headX - crownW / 2, brimY - brimH / 2 - crownH, crownW, crownH, crownH * 0.2, `hsl(${params.antennaColor}, 70%, 30%)`);
    }

    // --- Eyes, placed symmetrically within the head ---
    const eyeOffsetX = params.eyeSpacing * headRadius * 0.9;
    const eyeY = headY - (params.eyeHeight - 0.35) * headRadius;
    const eyeR = params.eyeSize * headRadius * 2.2;
    const leftEyeX = headX - eyeOffsetX;
    const rightEyeX = headX + eyeOffsetX;

    switch (params.eyeType) {
        case 0: // Simple dots
            drawCircle(leftEyeX, eyeY, eyeR, 'black');
            drawCircle(rightEyeX, eyeY, eyeR, 'black');
            break;
        case 1: { // Glowing LED eyes
            const led = `hsl(${params.ledHue}, 90%, 55%)`;
            drawCircle(leftEyeX, eyeY, eyeR * 1.4, darker(params.headColor, 0.4));
            drawCircle(rightEyeX, eyeY, eyeR * 1.4, darker(params.headColor, 0.4));
            drawCircle(leftEyeX, eyeY, eyeR * params.pupilSize, led);
            drawCircle(rightEyeX, eyeY, eyeR * params.pupilSize, led);
            break;
        }
        case 2: // Winking: one dot, one closed (horizontal line) eye
            drawCircle(leftEyeX, eyeY, eyeR, 'black');
            drawThickLine(rightEyeX - eyeR, eyeY, rightEyeX + eyeR, eyeY, Math.max(1.5, eyeR * 0.5), 'black');
            break;
    }

    // --- Mouth, on the lower face ---
    const mouthX = headX;
    const mouthY = headY + (0.25 + params.mouthHeight * 0.4) * headRadius;
    const mouthW = params.mouthWidth * headRadius * 0.9;

    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(1.5, headRadius * 0.09);
    ctx.lineCap = 'round';

    if (params.hasGrill) {
        // Robot speaker-grill mouth: box with vertical slats
        const grillH = headRadius * 0.32;
        roundedRect(mouthX - mouthW, mouthY - grillH / 2, mouthW * 2, grillH, grillH * 0.25, darker(params.headColor, 0.45));
        ctx.strokeStyle = darker(params.headColor, 0.25);
        ctx.lineWidth = Math.max(1, grillH * 0.15);
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(mouthX + i * mouthW * 0.5, mouthY - grillH * 0.3);
            ctx.lineTo(mouthX + i * mouthW * 0.5, mouthY + grillH * 0.3);
            ctx.stroke();
        }
    } else {
        switch (params.mouthType) {
            case 0: // Smile
                ctx.beginPath();
                ctx.arc(mouthX, mouthY - mouthW * 0.3, mouthW, 0.15 * Math.PI, 0.85 * Math.PI);
                ctx.stroke();
                break;
            case 1: // Straight line
                ctx.beginPath();
                ctx.moveTo(mouthX - mouthW, mouthY);
                ctx.lineTo(mouthX + mouthW, mouthY);
                ctx.stroke();
                break;
            case 2: // Open mouth
                drawCircle(mouthX, mouthY, mouthW * 0.45, 'black');
                break;
            case 3: // Frown
                ctx.beginPath();
                ctx.arc(mouthX, mouthY + mouthW * 0.5, mouthW, 1.15 * Math.PI, 1.85 * Math.PI);
                ctx.stroke();
                break;
        }
    }

    // --- Sword, gripped in the right hand ---
    if (params.hasSword) {
        // Blade continues the line of the arm (shoulder → hand), so it always
        // points away from the body instead of slashing across the torso.
        const armDX = rightHandX - rightShoulderX;
        const armDY = rightHandY - shoulderY;
        const armD = Math.sqrt(armDX * armDX + armDY * armDY) || 1;
        const bladeLen = 0.16 * scale;
        const dirX = armDX / armD, dirY = armDY / armD;
        // Grip extends slightly behind the hand
        const gripX = rightHandX - dirX * bladeLen * 0.15;
        const gripY = rightHandY - dirY * bladeLen * 0.15;
        const tipX = rightHandX + dirX * bladeLen;
        const tipY = rightHandY + dirY * bladeLen;
        // Cross-guard just above the hand, perpendicular to the blade
        const guardX = rightHandX + dirX * bladeLen * 0.12;
        const guardY = rightHandY + dirY * bladeLen * 0.12;
        const guardLen = bladeLen * 0.22;

        drawThickLine(gripX, gripY, guardX, guardY, Math.max(2.5, scale * 0.02), `hsl(${(params.accessoryColor + 60) % 360}, 60%, 30%)`);
        drawThickLine(guardX, guardY, tipX, tipY, Math.max(2, scale * 0.014), `hsl(${params.accessoryColor}, 25%, 65%)`);
        drawThickLine(guardX - dirY * guardLen, guardY + dirX * guardLen,
            guardX + dirY * guardLen, guardY - dirX * guardLen,
            Math.max(2, scale * 0.016), `hsl(${(params.accessoryColor + 60) % 360}, 60%, 40%)`);
    }
});

class RobotIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = robotRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    // The generator is a flat parameter vector (still worth tweaking); the draw
    // function is where the character actually lives. Expose both, draw first.
    editableSections() {
        return [
            Individual.functionSection('Draw', robotDraw),
            Individual.generatorSection(this.representation),
        ];
    }

    getParameters() {
        return {
            // Head
            headSize: this.phenotype[0],
            headLean: this.phenotype[1],
            neckLength: this.phenotype[2],
            headShape: this.phenotype[3],
            headColor: {
                r: Math.floor(this.phenotype[4] * 255),
                g: Math.floor(this.phenotype[5] * 255),
                b: Math.floor(this.phenotype[6] * 255)
            },

            // Eyes
            eyeType: Math.min(2, Math.floor(this.phenotype[7] * 3)), // 3 eye types
            eyeSpacing: this.phenotype[8],
            eyeHeight: this.phenotype[9],
            ledHue: Math.floor(this.phenotype[10] * 360),
            pupilSize: this.phenotype[11],
            eyeSize: this.phenotype[12],

            // Mouth
            mouthType: Math.min(3, Math.floor(this.phenotype[13] * 4)), // 4 mouth types
            mouthWidth: this.phenotype[14],
            mouthHeight: this.phenotype[15],

            // Body
            bodyWidth: this.phenotype[16],
            bodyHeight: this.phenotype[17],
            bodyX: this.phenotype[18],
            bodyY: this.phenotype[19],
            bodyColor: {
                r: Math.floor(this.phenotype[20] * 255),
                g: Math.floor(this.phenotype[21] * 255),
                b: Math.floor(this.phenotype[22] * 255)
            },

            // Arms
            leftArmAngle: this.phenotype[23],
            armLength: this.phenotype[24],
            rightArmAngle: this.phenotype[25],
            handSize: this.phenotype[26],
            armThickness: this.phenotype[27],

            // Legs
            legSpread: this.phenotype[28],
            leftLegSplay: this.phenotype[29],
            rightLegSplay: this.phenotype[30],
            legLength: this.phenotype[31],
            legThickness: this.phenotype[32],

            // Limb color
            limbColor: {
                r: Math.floor(this.phenotype[33] * 255),
                g: Math.floor(this.phenotype[34] * 255),
                b: Math.floor(this.phenotype[35] * 255)
            },

            // Features
            hasAntenna: this.phenotype[36] > 0.5,
            hasBolts: this.phenotype[37] > 0.5,
            hasGrill: this.phenotype[38] > 0.5,
            hasHat: this.phenotype[39] > 0.5,
            hasSword: this.phenotype[40] > 0.5,

            // Colors
            antennaColor: Math.floor(this.phenotype[41] * 360), // Hue for antenna/hat
            accessoryColor: Math.floor(this.phenotype[42] * 360) // Hue for accessories
        };
    }

    visualize(canvas) {
        robotDraw.value(this, canvas.getContext('2d'), canvas.width, canvas.height);
    }

    getPhenotype() {
        const params = this.getParameters();
        const features = [];

        if (params.hasAntenna) features.push("antenna");
        if (params.hasBolts) features.push("bolts");
        if (params.hasGrill) features.push("grill");
        if (params.hasHat) features.push("hat");
        if (params.hasSword) features.push("sword");

        const eyeTypes = ["dot", "LED", "wink"];
        const mouthTypes = ["smile", "line", "open", "frown"];

        return `Robot: ${eyeTypes[params.eyeType]} eyes, ${mouthTypes[params.mouthType]} mouth${features.length > 0 ? ", " + features.join(", ") : ""}`;
    }
}

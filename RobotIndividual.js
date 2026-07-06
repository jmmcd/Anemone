// PTO generator: builds a structured parameter object. The trace records every
// rnd decision by call-site path (structural naming), so *conditional* genes are
// fine: a robot only has wheel genes if its locomotion gene chose wheels, leg
// genes only if it chose legs, and so on — mutation and crossover align the
// genes that both parents actually have. PTORepresentation's default 'fine'
// mutation is Gaussian creep for the uniforms and a resample for the choices.
//
// The geometry genes are *relative*: limbs are expressed as angles/lengths
// hanging off the body, and facial features as offsets within the head, so the
// robot always holds together as a figure no matter how the genes drift.
const robotGenerator = (rnd) => {
    const p = {};

    // --- Torso ---
    p.bodyShape = rnd.choice(['box', 'barrel', 'trapezoid', 'flared', 'capsule']);
    p.bodyWidth = rnd.uniform(0.17, 0.32);
    p.bodyHeight = rnd.uniform(0.20, 0.36);
    p.bodyX = rnd.uniform(0.46, 0.54);
    p.bodyY = rnd.uniform(0.46, 0.54);
    // Metallic robots are common; colourful ones still appear.
    if (rnd.random() < 0.4) {
        const v = rnd.uniform(0.45, 0.85);
        p.bodyColor = { r: v * 0.95, g: v, b: Math.min(1, v * 1.08) };
    } else {
        p.bodyColor = { r: rnd.uniform(0.2, 1), g: rnd.uniform(0.2, 1), b: rnd.uniform(0.2, 1) };
    }

    // --- Front panel ---
    p.panelType = rnd.choice(['screen', 'gauge', 'buttons', 'vents', 'reels', 'lamp', 'none']);
    p.panelSize = rnd.uniform(0.45, 0.75);
    p.panelHue = rnd.uniform(0, 1);

    // --- Head ---
    p.headShape = rnd.choice(['round', 'box', 'dome', 'cylinder']);
    p.headSize = rnd.uniform(0.5, 1.0);
    p.headLean = rnd.uniform(0.35, 0.65);
    p.neckLength = rnd.uniform(0, 1);
    if (rnd.random() < 0.4) {
        const v = rnd.uniform(0.45, 0.85);
        p.headColor = { r: v * 0.95, g: v, b: Math.min(1, v * 1.08) };
    } else {
        p.headColor = { r: rnd.uniform(0.2, 1), g: rnd.uniform(0.2, 1), b: rnd.uniform(0.2, 1) };
    }

    // --- Eyes ---
    p.eyeType = rnd.choice(['dot', 'led', 'wink', 'visor']);
    p.eyeSpacing = rnd.uniform(0.3, 0.7);
    p.eyeHeight = rnd.uniform(0.2, 0.5);
    p.eyeSize = rnd.uniform(0.08, 0.2);
    p.ledHue = rnd.uniform(0, 1);
    p.pupilSize = rnd.uniform(0.3, 0.9);

    // --- Mouth ---
    p.mouthType = rnd.choice(['smile', 'line', 'open', 'frown', 'grill']);
    p.mouthWidth = rnd.uniform(0.3, 0.8);
    p.mouthHeight = rnd.uniform(0.35, 0.65);

    // --- Limbs ---
    p.limbColor = { r: rnd.uniform(0.15, 0.9), g: rnd.uniform(0.15, 0.9), b: rnd.uniform(0.15, 0.9) };

    // --- Arms & hands ---
    p.leftArmAngle = rnd.uniform(0, 1);
    p.rightArmAngle = rnd.uniform(0, 1);
    p.armLength = rnd.uniform(0.5, 1.0);
    p.armThickness = rnd.uniform(0.012, 0.04);
    p.handStyle = rnd.choice(['ball', 'claw', 'pincer', 'magnet']);
    p.handSize = rnd.uniform(0.3, 1.0);

    // --- Locomotion: the choice decides which genes exist ---
    p.locomotion = rnd.choice(['legs', 'legs', 'legs', 'wheels', 'tracks', 'monowheel']);
    if (p.locomotion === 'legs') {
        p.legStyle = rnd.choice(['spindle', 'chunky', 'piston']);
        p.legSpread = rnd.uniform(0.3, 1.0);
        p.legLength = rnd.uniform(0.5, 1.0);
        if (p.legStyle === 'chunky') {
            p.legThickness = rnd.uniform(0.035, 0.06);
        } else if (p.legStyle === 'piston') {
            p.legThickness = rnd.uniform(0.025, 0.045);
        } else {
            p.legThickness = rnd.uniform(0.012, 0.024);
        }
        p.leftLegSplay = rnd.uniform(0, 1);
        p.rightLegSplay = rnd.uniform(0, 1);
    } else if (p.locomotion === 'wheels') {
        p.wheelCount = rnd.choice([2, 3]);
        p.wheelRadius = rnd.uniform(0.045, 0.075);
    } else if (p.locomotion === 'tracks') {
        p.trackHeight = rnd.uniform(0.05, 0.09);
    } else { // monowheel
        p.wheelRadius = rnd.uniform(0.08, 0.13);
    }

    // --- Accessories: one optional slot per anchor point ---
    p.headAcc = 'none';
    if (rnd.random() < 0.6) {
        p.headAcc = rnd.choice(['antenna', 'propeller', 'crown', 'headphones',
            'dish', 'bulb', 'partyhat', 'tophat', 'horns', 'periscope']);
    }
    p.faceAcc = 'none';
    if (rnd.random() < 0.35) {
        p.faceAcc = rnd.choice(['monocle', 'glasses', 'moustache', 'eyepatch']);
    }
    p.bodyAcc = 'none';
    if (rnd.random() < 0.5) {
        p.bodyAcc = rnd.choice(['bowtie', 'necktie', 'badge', 'jetpack',
            'cape', 'toolbelt', 'wings']);
    }
    p.handAcc = 'none';
    if (rnd.random() < 0.55) {
        p.handAcc = rnd.choice(['sword', 'shield', 'wrench', 'hammer', 'flag',
            'balloon', 'umbrella', 'raygun', 'flower', 'torch', 'broom', 'magnifier']);
    }
    p.accHue = rnd.uniform(0, 1);
    p.accHue2 = rnd.uniform(0, 1);

    return p;
};

const robotRepresentation = new PTORepresentation(robotGenerator);

// The whole robot lives in this draw function — not the generator — and it runs
// once per render (not per pixel), so it is the natural thing to edit for this
// type. It is held in an Editable slot so the code editor can swap it live (see
// editableSections / Individual.functionSection). Signature is
// (individual, ctx, width, height); it reads the decoded parameters via
// individual.getParameters().
const robotDraw = new Editable(function (self, ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    const params = self.getParameters();
    const scale = Math.min(width, height);

    const rgb = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;
    const darker = (c, f = 0.6) => `rgb(${Math.floor(c.r * f)}, ${Math.floor(c.g * f)}, ${Math.floor(c.b * f)})`;
    const accCol = `hsl(${params.accHue}, 75%, 50%)`;
    const accCol2 = `hsl(${params.accHue2}, 70%, 45%)`;
    const metal = 'rgb(165, 170, 180)';
    const metalDark = 'rgb(95, 100, 110)';

    const drawCircle = (x, y, radius, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    };

    const strokeCircle = (x, y, radius, w, style) => {
        ctx.strokeStyle = style;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
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

    const polygon = (pts, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fill();
    };

    // ================= Geometry =================
    // Nudge the torso down when the head stack (neck + head + accessory) would
    // poke out of the top of the canvas, so tall robots stay in frame.
    // 3.0 × headR covers the tallest stack (cylinder head + top hat).
    const headStackF = (0.01 + params.neckLength * 0.025)
        + params.headSize * params.bodyWidth * 0.42 * 3.0;
    const minBodyYF = Math.min(0.60, 0.01 + params.bodyHeight / 2 + headStackF);
    const bodyX = params.bodyX * scale;
    const bodyY = Math.max(params.bodyY, minBodyYF) * scale;
    const bodyW = params.bodyWidth * scale;
    const bodyH = params.bodyHeight * scale;
    const bodyTop = bodyY - bodyH / 2;
    const bodyBottom = bodyY + bodyH / 2;

    // Torso half-width at a given canvas y, following the chosen silhouette,
    // so shoulders/hips attach to the actual outline of every body shape.
    const halfWidthAt = (yy) => {
        const t = Math.max(0, Math.min(1, (yy - bodyTop) / bodyH)); // 0 top → 1 bottom
        switch (params.bodyShape) {
            case 'trapezoid': return (0.62 + 0.43 * t) * bodyW / 2;
            case 'flared': return (1.05 - 0.45 * t) * bodyW / 2;
            case 'barrel': {
                const dy = (yy - bodyY) / (bodyH * 0.52);
                return bodyW * 0.58 * Math.sqrt(Math.max(0.05, 1 - dy * dy));
            }
            default: return bodyW / 2;
        }
    };

    // Head
    const headRadius = params.headSize * bodyW * 0.42;
    const neckLen = (0.01 + params.neckLength * 0.025) * scale;
    const headX = bodyX + (params.headLean - 0.5) * bodyW * 0.4;
    const headY = bodyTop - neckLen - headRadius;
    const headTopY = headY - headRadius * (params.headShape === 'cylinder' ? 1.15 : 0.95);

    // Arms: pose angles; a held accessory keeps that arm partly raised so the
    // accessory reads clearly instead of dangling along the leg.
    const heldInRight = ['sword', 'wrench', 'hammer', 'flag', 'balloon', 'umbrella',
        'raygun', 'flower', 'torch', 'broom', 'magnifier'].indexOf(params.handAcc) >= 0;
    const heldInLeft = params.handAcc === 'shield';
    const armLen = (0.09 + params.armLength * 0.10) * scale;
    const armThickness = params.armThickness * scale;
    const shoulderY = bodyY - bodyH * 0.30;
    const leftShoulderX = bodyX - halfWidthAt(shoulderY) + armThickness * 0.2;
    const rightShoulderX = bodyX + halfWidthAt(shoulderY) - armThickness * 0.2;
    const leftPose = heldInLeft ? 0.4 + params.leftArmAngle * 0.6 : params.leftArmAngle;
    const rightPose = heldInRight ? 0.5 + params.rightArmAngle * 0.5 : params.rightArmAngle;
    const leftAngle = leftPose * Math.PI * 0.45;   // 0 = hang down, 1 = near horizontal
    const rightAngle = rightPose * Math.PI * 0.45;
    const leftHandX = leftShoulderX - Math.sin(leftAngle) * armLen;
    const leftHandY = shoulderY + Math.cos(leftAngle) * armLen;
    const rightHandX = rightShoulderX + Math.sin(rightAngle) * armLen;
    const rightHandY = shoulderY + Math.cos(rightAngle) * armLen;
    const handR = armThickness * (0.7 + params.handSize * 0.6);
    // Unit direction each arm points (shoulder → hand), for hands & held items.
    const rArmAng = Math.atan2(rightHandY - shoulderY, rightHandX - rightShoulderX);
    const lArmAng = Math.atan2(leftHandY - shoulderY, leftHandX - leftShoulderX);

    // ================= Behind-body accessories =================
    if (params.bodyAcc === 'cape') {
        polygon([
            [bodyX - halfWidthAt(bodyTop + bodyH * 0.1) - bodyW * 0.05, bodyTop + bodyH * 0.1],
            [bodyX + halfWidthAt(bodyTop + bodyH * 0.1) + bodyW * 0.05, bodyTop + bodyH * 0.1],
            [bodyX + bodyW * 0.8, bodyBottom + bodyH * 0.25],
            [bodyX - bodyW * 0.8, bodyBottom + bodyH * 0.25],
        ], accCol);
    } else if (params.bodyAcc === 'jetpack') {
        const jw = bodyW * 0.22, jh = bodyH * 0.6;
        roundedRect(bodyX - halfWidthAt(bodyY) - jw * 0.8, bodyY - jh / 2, jw, jh, jw * 0.4, metalDark);
        roundedRect(bodyX + halfWidthAt(bodyY) - jw * 0.2, bodyY - jh / 2, jw, jh, jw * 0.4, metalDark);
        // Little exhaust flames
        polygon([[bodyX - halfWidthAt(bodyY) - jw * 0.3, bodyY + jh / 2],
            [bodyX - halfWidthAt(bodyY) - jw * 0.55, bodyY + jh / 2 + jh * 0.25],
            [bodyX - halfWidthAt(bodyY) - jw * 0.05, bodyY + jh / 2]], 'orange');
        polygon([[bodyX + halfWidthAt(bodyY) + jw * 0.3, bodyY + jh / 2],
            [bodyX + halfWidthAt(bodyY) + jw * 0.55, bodyY + jh / 2 + jh * 0.25],
            [bodyX + halfWidthAt(bodyY) + jw * 0.05, bodyY + jh / 2]], 'orange');
    } else if (params.bodyAcc === 'wings') {
        polygon([[bodyX - halfWidthAt(shoulderY), shoulderY],
            [bodyX - bodyW * 1.1, shoulderY - bodyH * 0.35],
            [bodyX - bodyW * 0.75, shoulderY + bodyH * 0.15]], 'rgb(230, 235, 245)');
        polygon([[bodyX + halfWidthAt(shoulderY), shoulderY],
            [bodyX + bodyW * 1.1, shoulderY - bodyH * 0.35],
            [bodyX + bodyW * 0.75, shoulderY + bodyH * 0.15]], 'rgb(230, 235, 245)');
    }

    // ================= Locomotion =================
    if (params.locomotion === 'legs') {
        const legLen = (0.10 + params.legLength * 0.13) * scale;
        const legThickness = params.legThickness * scale;
        const hipHalf = halfWidthAt(bodyBottom - legThickness);
        const legSpread = params.legSpread * hipHalf * 0.9;
        const hipY = bodyBottom - legThickness / 2;
        const leftHipX = bodyX - legSpread;
        const rightHipX = bodyX + legSpread;
        const footY = hipY + legLen;

        if (params.legStyle === 'chunky') {
            // Solid columns with a knee bolt and wide foot pads
            roundedRect(leftHipX - legThickness / 2, hipY, legThickness, legLen, legThickness * 0.35, rgb(params.limbColor));
            roundedRect(rightHipX - legThickness / 2, hipY, legThickness, legLen, legThickness * 0.35, rgb(params.limbColor));
            drawCircle(leftHipX, hipY + legLen * 0.5, legThickness * 0.28, darker(params.limbColor));
            drawCircle(rightHipX, hipY + legLen * 0.5, legThickness * 0.28, darker(params.limbColor));
            roundedRect(leftHipX - legThickness * 1.1, footY - legThickness * 0.2, legThickness * 2.2, legThickness * 0.7, legThickness * 0.25, darker(params.limbColor));
            roundedRect(rightHipX - legThickness * 1.1, footY - legThickness * 0.2, legThickness * 2.2, legThickness * 0.7, legThickness * 0.25, darker(params.limbColor));
        } else if (params.legStyle === 'piston') {
            // Thick upper cylinder, thinner lower rod telescoping out of it
            const midY = hipY + legLen * 0.55;
            drawThickLine(leftHipX, hipY, leftHipX, midY, legThickness, rgb(params.limbColor));
            drawThickLine(rightHipX, hipY, rightHipX, midY, legThickness, rgb(params.limbColor));
            drawThickLine(leftHipX, midY, leftHipX, footY, legThickness * 0.5, metal);
            drawThickLine(rightHipX, midY, rightHipX, footY, legThickness * 0.5, metal);
            roundedRect(leftHipX - legThickness, footY - legThickness * 0.2, legThickness * 2, legThickness * 0.6, legThickness * 0.2, darker(params.limbColor));
            roundedRect(rightHipX - legThickness, footY - legThickness * 0.2, legThickness * 2, legThickness * 0.6, legThickness * 0.2, darker(params.limbColor));
        } else {
            // Spindle: thin splayed lines with small foot pads
            const leftFootX = leftHipX - (params.leftLegSplay - 0.5) * legLen * 0.5;
            const rightFootX = rightHipX + (params.rightLegSplay - 0.5) * legLen * 0.5;
            drawThickLine(leftHipX, hipY, leftFootX, footY, legThickness, rgb(params.limbColor));
            drawThickLine(rightHipX, hipY, rightFootX, footY, legThickness, rgb(params.limbColor));
            roundedRect(leftFootX - legThickness, footY - legThickness * 0.4, legThickness * 2.2, legThickness * 0.9, legThickness * 0.3, darker(params.limbColor));
            roundedRect(rightFootX - legThickness * 1.2, footY - legThickness * 0.4, legThickness * 2.2, legThickness * 0.9, legThickness * 0.3, darker(params.limbColor));
        }
    } else if (params.locomotion === 'wheels') {
        const r = params.wheelRadius * scale;
        const wy = bodyBottom + r * 0.75;
        const xs = params.wheelCount === 3
            ? [bodyX - halfWidthAt(bodyBottom) * 0.75, bodyX, bodyX + halfWidthAt(bodyBottom) * 0.75]
            : [bodyX - halfWidthAt(bodyBottom) * 0.6, bodyX + halfWidthAt(bodyBottom) * 0.6];
        // Axle housing connecting body to wheels
        roundedRect(xs[0] - r * 0.3, bodyBottom - r * 0.2, (xs[xs.length - 1] - xs[0]) + r * 0.6, r * 0.7, r * 0.2, metalDark);
        for (let i = 0; i < xs.length; i++) {
            drawCircle(xs[i], wy, r, 'rgb(40, 40, 45)');
            drawCircle(xs[i], wy, r * 0.45, metal);
            drawCircle(xs[i], wy, r * 0.12, metalDark);
        }
    } else if (params.locomotion === 'tracks') {
        const th = params.trackHeight * scale;
        const tw = Math.max(bodyW * 1.15, th * 2.5);
        const ty = bodyBottom - th * 0.15;
        roundedRect(bodyX - tw / 2, ty, tw, th, th / 2, 'rgb(40, 40, 45)');
        // Road wheels peeking through the tread
        const n = 3;
        for (let i = 0; i < n; i++) {
            const wx = bodyX - tw / 2 + th / 2 + (tw - th) * (i / (n - 1));
            drawCircle(wx, ty + th / 2, th * 0.28, metal);
        }
    } else { // monowheel
        const R = params.wheelRadius * scale;
        const wy = bodyBottom + R * 0.75;
        // Fork struts from the body down to the hub
        drawThickLine(bodyX - halfWidthAt(bodyBottom) * 0.5, bodyBottom, bodyX, wy, Math.max(2, R * 0.16), metalDark);
        drawThickLine(bodyX + halfWidthAt(bodyBottom) * 0.5, bodyBottom, bodyX, wy, Math.max(2, R * 0.16), metalDark);
        drawCircle(bodyX, wy, R, 'rgb(40, 40, 45)');
        drawCircle(bodyX, wy, R * 0.55, rgb(params.limbColor));
        drawCircle(bodyX, wy, R * 0.15, metalDark);
    }

    // ================= Arms (behind torso) =================
    drawThickLine(leftShoulderX, shoulderY, leftHandX, leftHandY, armThickness, rgb(params.limbColor));
    drawThickLine(rightShoulderX, shoulderY, rightHandX, rightHandY, armThickness, rgb(params.limbColor));
    // Elbow joints
    drawCircle((leftShoulderX + leftHandX) / 2, (shoulderY + leftHandY) / 2, armThickness * 0.42, darker(params.limbColor));
    drawCircle((rightShoulderX + rightHandX) / 2, (shoulderY + rightHandY) / 2, armThickness * 0.42, darker(params.limbColor));

    // ================= Torso =================
    ctx.fillStyle = rgb(params.bodyColor);
    switch (params.bodyShape) {
        case 'barrel':
            ctx.beginPath();
            ctx.ellipse(bodyX, bodyY, bodyW * 0.58, bodyH * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'trapezoid':
            polygon([[bodyX - bodyW * 0.31, bodyTop], [bodyX + bodyW * 0.31, bodyTop],
                [bodyX + bodyW * 0.525, bodyBottom], [bodyX - bodyW * 0.525, bodyBottom]], rgb(params.bodyColor));
            break;
        case 'flared':
            polygon([[bodyX - bodyW * 0.525, bodyTop], [bodyX + bodyW * 0.525, bodyTop],
                [bodyX + bodyW * 0.3, bodyBottom], [bodyX - bodyW * 0.3, bodyBottom]], rgb(params.bodyColor));
            break;
        case 'capsule':
            roundedRect(bodyX - bodyW / 2, bodyTop, bodyW, bodyH, Math.min(bodyW, bodyH) * 0.5, rgb(params.bodyColor));
            break;
        default: // box
            roundedRect(bodyX - bodyW / 2, bodyTop, bodyW, bodyH, bodyW * 0.12, rgb(params.bodyColor));
    }

    // ================= Front panel =================
    if (params.panelType !== 'none') {
        const pw = Math.min(halfWidthAt(bodyY) * 2 * 0.75, bodyW * params.panelSize);
        const ph = bodyH * 0.4;
        const px = bodyX - pw / 2, py = bodyY - ph / 2;
        const panelCol = `hsl(${params.panelHue}, 80%, 60%)`;
        switch (params.panelType) {
            case 'screen':
                roundedRect(px, py, pw, ph, pw * 0.1, 'rgb(25, 30, 35)');
                drawThickLine(px + pw * 0.15, py + ph * 0.4, px + pw * 0.4, py + ph * 0.4, Math.max(1, ph * 0.08), panelCol);
                drawThickLine(px + pw * 0.15, py + ph * 0.65, px + pw * 0.7, py + ph * 0.65, Math.max(1, ph * 0.08), panelCol);
                break;
            case 'gauge':
                roundedRect(px, py, pw, ph, pw * 0.1, darker(params.bodyColor, 0.55));
                drawCircle(bodyX, bodyY, Math.min(pw, ph) * 0.38, 'rgb(240, 240, 235)');
                drawThickLine(bodyX, bodyY, bodyX + Math.min(pw, ph) * 0.28, bodyY - Math.min(pw, ph) * 0.2, Math.max(1, ph * 0.07), 'rgb(200, 40, 40)');
                drawCircle(bodyX, bodyY, Math.min(pw, ph) * 0.06, 'rgb(40, 40, 40)');
                break;
            case 'buttons': {
                roundedRect(px, py, pw, ph, pw * 0.1, darker(params.bodyColor, 0.55));
                const cols = ['rgb(220,70,70)', 'rgb(240,200,60)', 'rgb(80,200,120)',
                    panelCol, 'rgb(240,240,240)', accCol2];
                for (let i = 0; i < 6; i++) {
                    const bx = px + pw * (0.25 + (i % 3) * 0.25);
                    const by = py + ph * (0.3 + Math.floor(i / 3) * 0.4);
                    drawCircle(bx, by, Math.min(pw, ph) * 0.11, cols[i]);
                }
                break;
            }
            case 'vents':
                roundedRect(px, py, pw, ph, pw * 0.1, darker(params.bodyColor, 0.55));
                for (let i = 0; i < 3; i++) {
                    drawThickLine(px + pw * 0.15, py + ph * (0.25 + i * 0.25), px + pw * 0.85, py + ph * (0.25 + i * 0.25),
                        Math.max(1.5, ph * 0.1), darker(params.bodyColor, 0.3));
                }
                break;
            case 'reels': {
                roundedRect(px, py, pw, ph, pw * 0.1, darker(params.bodyColor, 0.55));
                const rr = Math.min(pw, ph) * 0.26;
                drawCircle(px + pw * 0.3, bodyY, rr, 'rgb(35, 35, 40)');
                drawCircle(px + pw * 0.7, bodyY, rr, 'rgb(35, 35, 40)');
                drawCircle(px + pw * 0.3, bodyY, rr * 0.4, metal);
                drawCircle(px + pw * 0.7, bodyY, rr * 0.4, metal);
                break;
            }
            case 'lamp':
                roundedRect(px, py, pw, ph, pw * 0.1, darker(params.bodyColor, 0.55));
                drawCircle(bodyX, bodyY, Math.min(pw, ph) * 0.3, panelCol);
                drawCircle(bodyX - Math.min(pw, ph) * 0.08, bodyY - Math.min(pw, ph) * 0.08, Math.min(pw, ph) * 0.08, 'rgba(255,255,255,0.7)');
                break;
        }
    }

    // ================= Front body accessories =================
    if (params.bodyAcc === 'bowtie') {
        const s = bodyW * 0.16;
        const byT = bodyTop + s * 0.5;
        polygon([[bodyX - s, byT - s * 0.6], [bodyX, byT], [bodyX - s, byT + s * 0.6]], accCol);
        polygon([[bodyX + s, byT - s * 0.6], [bodyX, byT], [bodyX + s, byT + s * 0.6]], accCol);
        drawCircle(bodyX, byT, s * 0.22, accCol2);
    } else if (params.bodyAcc === 'necktie') {
        const s = bodyW * 0.12;
        polygon([[bodyX - s, bodyTop], [bodyX + s, bodyTop], [bodyX, bodyTop + s * 1.2]], accCol2);
        polygon([[bodyX - s * 0.7, bodyTop + s], [bodyX + s * 0.7, bodyTop + s],
            [bodyX + s * 0.9, bodyY + bodyH * 0.18], [bodyX, bodyY + bodyH * 0.28], [bodyX - s * 0.9, bodyY + bodyH * 0.18]], accCol);
    } else if (params.bodyAcc === 'badge') {
        const bx = bodyX - halfWidthAt(bodyY - bodyH * 0.25) * 0.55;
        const by = bodyY - bodyH * 0.25;
        const r1 = bodyW * 0.09, r2 = r1 * 0.45;
        ctx.fillStyle = 'gold';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rr = (i % 2 === 0) ? r1 : r2;
            const a = -Math.PI / 2 + i * Math.PI / 5;
            if (i === 0) ctx.moveTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
            else ctx.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
    } else if (params.bodyAcc === 'toolbelt') {
        const beltY = bodyBottom - bodyH * 0.16;
        const hw = halfWidthAt(beltY);
        ctx.fillStyle = 'rgb(90, 60, 30)';
        ctx.fillRect(bodyX - hw, beltY - bodyH * 0.05, hw * 2, bodyH * 0.1);
        roundedRect(bodyX - bodyW * 0.06, beltY - bodyH * 0.07, bodyW * 0.12, bodyH * 0.14, 2, 'gold');
    }

    // ================= Neck & Head =================
    ctx.fillStyle = darker(params.headColor, 0.6);
    ctx.fillRect(headX - headRadius * 0.22, headY + headRadius * 0.5, headRadius * 0.44, bodyTop - (headY + headRadius * 0.5) + 2);

    switch (params.headShape) {
        case 'box':
            roundedRect(headX - headRadius, headY - headRadius * 0.9, headRadius * 2, headRadius * 1.8, headRadius * 0.25, rgb(params.headColor));
            break;
        case 'dome': // flat-bottomed dome
            ctx.fillStyle = rgb(params.headColor);
            ctx.beginPath();
            ctx.arc(headX, headY + headRadius * 0.35, headRadius * 1.05, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(headX - headRadius * 1.05, headY + headRadius * 0.3, headRadius * 2.1, headRadius * 0.35);
            break;
        case 'cylinder':
            roundedRect(headX - headRadius * 0.8, headY - headRadius * 1.15, headRadius * 1.6, headRadius * 2.3, headRadius * 0.35, rgb(params.headColor));
            break;
        default: // round
            drawCircle(headX, headY, headRadius, rgb(params.headColor));
    }

    // ================= Head accessory =================
    const haS = headRadius; // accessory scale
    switch (params.headAcc) {
        case 'antenna':
            drawThickLine(headX, headTopY, headX, headTopY - haS * 0.6, Math.max(1.5, haS * 0.08), darker(params.headColor, 0.5));
            drawCircle(headX, headTopY - haS * 0.6, haS * 0.14, accCol);
            break;
        case 'propeller':
            drawThickLine(headX, headTopY, headX, headTopY - haS * 0.35, Math.max(1.5, haS * 0.08), metalDark);
            ctx.fillStyle = accCol;
            ctx.beginPath();
            ctx.ellipse(headX - haS * 0.45, headTopY - haS * 0.4, haS * 0.45, haS * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = accCol2;
            ctx.beginPath();
            ctx.ellipse(headX + haS * 0.45, headTopY - haS * 0.4, haS * 0.45, haS * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
            drawCircle(headX, headTopY - haS * 0.4, haS * 0.1, metalDark);
            break;
        case 'crown': {
            const cw = haS * 1.1, chh = haS * 0.42;
            ctx.fillStyle = 'gold';
            ctx.fillRect(headX - cw / 2, headTopY - chh * 0.55, cw, chh * 0.55);
            polygon([[headX - cw / 2, headTopY - chh * 0.55], [headX - cw * 0.33, headTopY - chh * 1.15], [headX - cw * 0.17, headTopY - chh * 0.55]], 'gold');
            polygon([[headX - cw * 0.17, headTopY - chh * 0.55], [headX, headTopY - chh * 1.25], [headX + cw * 0.17, headTopY - chh * 0.55]], 'gold');
            polygon([[headX + cw * 0.17, headTopY - chh * 0.55], [headX + cw * 0.33, headTopY - chh * 1.15], [headX + cw / 2, headTopY - chh * 0.55]], 'gold');
            drawCircle(headX, headTopY - chh * 0.28, chh * 0.14, 'rgb(200, 40, 60)');
            break;
        }
        case 'headphones':
            ctx.strokeStyle = metalDark;
            ctx.lineWidth = Math.max(2, haS * 0.12);
            ctx.beginPath();
            ctx.arc(headX, headY, headRadius * 1.12, Math.PI * 1.05, Math.PI * 1.95);
            ctx.stroke();
            drawCircle(headX - headRadius * 1.05, headY, haS * 0.28, accCol);
            drawCircle(headX + headRadius * 1.05, headY, haS * 0.28, accCol);
            break;
        case 'dish':
            drawThickLine(headX, headTopY, headX, headTopY - haS * 0.3, Math.max(1.5, haS * 0.08), metalDark);
            ctx.fillStyle = metal;
            ctx.beginPath();
            ctx.arc(headX, headTopY - haS * 0.38, haS * 0.42, Math.PI * 0.85, Math.PI * 2.15);
            ctx.closePath();
            ctx.fill();
            drawCircle(headX, headTopY - haS * 0.62, haS * 0.08, 'rgb(200, 60, 60)');
            break;
        case 'bulb':
            ctx.fillStyle = metalDark;
            ctx.fillRect(headX - haS * 0.12, headTopY - haS * 0.22, haS * 0.24, haS * 0.22);
            drawCircle(headX, headTopY - haS * 0.45, haS * 0.25, 'rgb(255, 235, 120)');
            break;
        case 'partyhat':
            polygon([[headX - haS * 0.45, headTopY + haS * 0.05], [headX + haS * 0.45, headTopY + haS * 0.05], [headX, headTopY - haS * 0.85]], accCol);
            drawCircle(headX, headTopY - haS * 0.85, haS * 0.12, accCol2);
            break;
        case 'tophat': {
            const brimY = headTopY + haS * 0.1;
            roundedRect(headX - haS * 1.25, brimY - haS * 0.14, haS * 2.5, haS * 0.28, haS * 0.1, `hsl(${params.accHue}, 70%, 35%)`);
            roundedRect(headX - haS * 0.75, brimY - haS * 0.14 - haS * 0.75, haS * 1.5, haS * 0.75, haS * 0.12, `hsl(${params.accHue}, 70%, 30%)`);
            break;
        }
        case 'horns':
            polygon([[headX - haS * 0.75, headTopY + haS * 0.25], [headX - haS * 0.45, headTopY + haS * 0.15], [headX - haS * 0.8, headTopY - haS * 0.4]], darker(params.headColor, 0.45));
            polygon([[headX + haS * 0.75, headTopY + haS * 0.25], [headX + haS * 0.45, headTopY + haS * 0.15], [headX + haS * 0.8, headTopY - haS * 0.4]], darker(params.headColor, 0.45));
            break;
        case 'periscope':
            ctx.fillStyle = metalDark;
            ctx.fillRect(headX - haS * 0.1, headTopY - haS * 0.6, haS * 0.2, haS * 0.6);
            ctx.fillRect(headX - haS * 0.1, headTopY - haS * 0.78, haS * 0.45, haS * 0.22);
            drawCircle(headX + haS * 0.33, headTopY - haS * 0.67, haS * 0.08, 'rgb(120, 200, 255)');
            break;
    }

    // ================= Face =================
    const eyeOffsetX = params.eyeSpacing * headRadius * 0.9;
    const eyeY = headY - (params.eyeHeight - 0.35) * headRadius;
    const eyeR = params.eyeSize * headRadius * 2.2;
    const leftEyeX = headX - eyeOffsetX;
    const rightEyeX = headX + eyeOffsetX;
    const led = `hsl(${params.ledHue}, 90%, 55%)`;

    switch (params.eyeType) {
        case 'dot':
            drawCircle(leftEyeX, eyeY, eyeR, 'black');
            drawCircle(rightEyeX, eyeY, eyeR, 'black');
            break;
        case 'led':
            drawCircle(leftEyeX, eyeY, eyeR * 1.4, darker(params.headColor, 0.4));
            drawCircle(rightEyeX, eyeY, eyeR * 1.4, darker(params.headColor, 0.4));
            drawCircle(leftEyeX, eyeY, eyeR * params.pupilSize, led);
            drawCircle(rightEyeX, eyeY, eyeR * params.pupilSize, led);
            break;
        case 'wink':
            drawCircle(leftEyeX, eyeY, eyeR, 'black');
            drawThickLine(rightEyeX - eyeR, eyeY, rightEyeX + eyeR, eyeY, Math.max(1.5, eyeR * 0.5), 'black');
            break;
        case 'visor': {
            const vw = eyeOffsetX + eyeR * 1.6;
            roundedRect(headX - vw, eyeY - eyeR * 0.9, vw * 2, eyeR * 1.8, eyeR * 0.8, 'rgb(25, 28, 34)');
            drawCircle(leftEyeX, eyeY, eyeR * 0.55, led);
            drawCircle(rightEyeX, eyeY, eyeR * 0.55, led);
            break;
        }
    }

    // Mouth
    const mouthX = headX;
    const mouthY = headY + (0.25 + params.mouthHeight * 0.4) * headRadius;
    const mouthW = params.mouthWidth * headRadius * 0.9;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.max(1.5, headRadius * 0.09);
    ctx.lineCap = 'round';

    switch (params.mouthType) {
        case 'smile':
            ctx.beginPath();
            ctx.arc(mouthX, mouthY - mouthW * 0.3, mouthW, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
            break;
        case 'line':
            ctx.beginPath();
            ctx.moveTo(mouthX - mouthW, mouthY);
            ctx.lineTo(mouthX + mouthW, mouthY);
            ctx.stroke();
            break;
        case 'open':
            drawCircle(mouthX, mouthY, mouthW * 0.45, 'black');
            break;
        case 'frown':
            ctx.beginPath();
            ctx.arc(mouthX, mouthY + mouthW * 0.5, mouthW, 1.15 * Math.PI, 1.85 * Math.PI);
            ctx.stroke();
            break;
        case 'grill': {
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
            break;
        }
    }

    // ================= Face accessory =================
    switch (params.faceAcc) {
        case 'monocle':
            strokeCircle(rightEyeX, eyeY, eyeR * 1.7, Math.max(1.5, eyeR * 0.3), 'gold');
            drawThickLine(rightEyeX + eyeR * 1.2, eyeY + eyeR * 1.2, rightEyeX + eyeR * 1.6, eyeY + eyeR * 3, Math.max(1, eyeR * 0.15), 'gold');
            break;
        case 'glasses':
            strokeCircle(leftEyeX, eyeY, eyeR * 1.6, Math.max(1.5, eyeR * 0.28), 'rgb(40, 40, 45)');
            strokeCircle(rightEyeX, eyeY, eyeR * 1.6, Math.max(1.5, eyeR * 0.28), 'rgb(40, 40, 45)');
            drawThickLine(leftEyeX + eyeR * 1.6, eyeY, rightEyeX - eyeR * 1.6, eyeY, Math.max(1.5, eyeR * 0.28), 'rgb(40, 40, 45)');
            break;
        case 'moustache':
            ctx.strokeStyle = 'rgb(50, 35, 25)';
            ctx.lineWidth = Math.max(2, headRadius * 0.13);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(mouthX - headRadius * 0.22, mouthY - headRadius * 0.28, headRadius * 0.22, 0.2 * Math.PI, 1.1 * Math.PI, true);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(mouthX + headRadius * 0.22, mouthY - headRadius * 0.28, headRadius * 0.22, 1.9 * Math.PI, 0.8 * Math.PI, false);
            ctx.stroke();
            break;
        case 'eyepatch':
            drawCircle(rightEyeX, eyeY, eyeR * 1.5, 'rgb(20, 20, 22)');
            drawThickLine(headX - headRadius, eyeY - eyeR * 0.9, rightEyeX - eyeR, eyeY - eyeR * 0.4, Math.max(1.5, eyeR * 0.25), 'rgb(20, 20, 22)');
            drawThickLine(rightEyeX + eyeR, eyeY - eyeR * 0.4, headX + headRadius, eyeY - eyeR * 0.9, Math.max(1.5, eyeR * 0.25), 'rgb(20, 20, 22)');
            break;
    }

    // ================= Hands =================
    const drawHand = (x, y, ang) => {
        switch (params.handStyle) {
            case 'claw':
                // Open "C" gripper: an arc with the gap facing along the arm
                ctx.strokeStyle = darker(params.limbColor);
                ctx.lineWidth = Math.max(2, handR * 0.7);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(x, y, handR, ang + 0.55, ang - 0.55 + Math.PI * 2);
                ctx.stroke();
                break;
            case 'pincer': {
                // Two straight fingers splayed around the arm direction
                const fl = handR * 2.1;
                drawThickLine(x, y, x + Math.cos(ang - 0.45) * fl, y + Math.sin(ang - 0.45) * fl, Math.max(2, handR * 0.6), darker(params.limbColor));
                drawThickLine(x, y, x + Math.cos(ang + 0.45) * fl, y + Math.sin(ang + 0.45) * fl, Math.max(2, handR * 0.6), darker(params.limbColor));
                drawCircle(x, y, handR * 0.6, darker(params.limbColor, 0.45));
                break;
            }
            case 'magnet':
                // Red horseshoe with pale pole tips
                ctx.strokeStyle = 'rgb(200, 45, 45)';
                ctx.lineWidth = Math.max(2.5, handR * 0.75);
                ctx.lineCap = 'butt';
                ctx.beginPath();
                ctx.arc(x, y, handR, ang + 0.6, ang - 0.6 + Math.PI * 2);
                ctx.stroke();
                drawCircle(x + Math.cos(ang + 0.6) * handR, y + Math.sin(ang + 0.6) * handR, handR * 0.32, 'rgb(230, 230, 230)');
                drawCircle(x + Math.cos(ang - 0.6) * handR, y + Math.sin(ang - 0.6) * handR, handR * 0.32, 'rgb(230, 230, 230)');
                break;
            default:
                drawCircle(x, y, handR, darker(params.limbColor));
        }
    };
    drawHand(leftHandX, leftHandY, lArmAng);
    drawHand(rightHandX, rightHandY, rArmAng);

    // ================= Held accessory =================
    if (params.handAcc !== 'none') {
        const gx = rightHandX + Math.cos(rArmAng) * handR * 1.2;
        const gy = rightHandY + Math.sin(rArmAng) * handR * 1.2;
        const dirX = Math.cos(rArmAng), dirY = Math.sin(rArmAng);
        const L = 0.14 * scale;
        const lw = Math.max(2, scale * 0.014);

        switch (params.handAcc) {
            case 'sword': {
                const guardX = gx + dirX * L * 0.12, guardY = gy + dirY * L * 0.12;
                drawThickLine(gx - dirX * L * 0.15, gy - dirY * L * 0.15, guardX, guardY, lw * 1.5, `hsl(${(params.accHue + 60) % 360}, 60%, 30%)`);
                drawThickLine(guardX, guardY, gx + dirX * L, gy + dirY * L, lw, `hsl(${params.accHue}, 25%, 65%)`);
                drawThickLine(guardX - dirY * L * 0.22, guardY + dirX * L * 0.22, guardX + dirY * L * 0.22, guardY - dirX * L * 0.22, lw * 1.2, `hsl(${(params.accHue + 60) % 360}, 60%, 40%)`);
                break;
            }
            case 'shield': {
                // On the left hand
                const sx = leftHandX, sy = leftHandY, sr = 0.055 * scale;
                drawCircle(sx, sy, sr, accCol);
                strokeCircle(sx, sy, sr, Math.max(2, sr * 0.18), accCol2);
                drawCircle(sx, sy, sr * 0.3, accCol2);
                break;
            }
            case 'wrench':
                drawThickLine(gx, gy, gx + dirX * L * 0.75, gy + dirY * L * 0.75, lw, metal);
                strokeCircle(gx + dirX * L * 0.85, gy + dirY * L * 0.85, L * 0.15, lw * 0.9, metal);
                break;
            case 'hammer': {
                const hx = gx + dirX * L * 0.8, hy = gy + dirY * L * 0.8;
                drawThickLine(gx, gy, hx, hy, lw, 'rgb(150, 105, 60)');
                drawThickLine(hx - dirY * L * 0.25, hy + dirX * L * 0.25, hx + dirY * L * 0.25, hy - dirX * L * 0.25, lw * 2.6, metalDark);
                break;
            }
            case 'flag': {
                const topY = gy - L * 1.1;
                drawThickLine(gx, gy, gx, topY, lw * 0.8, metalDark);
                ctx.fillStyle = accCol;
                ctx.fillRect(gx, topY, L * 0.55, L * 0.35);
                break;
            }
            case 'balloon': {
                const bx = gx + L * 0.1, by = gy - L * 0.95;
                drawThickLine(gx, gy, bx, by + L * 0.28, 1, 'rgb(200, 200, 210)');
                ctx.fillStyle = accCol;
                ctx.beginPath();
                ctx.ellipse(bx, by, L * 0.22, L * 0.27, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'umbrella': {
                const topY = gy - L * 0.95;
                drawThickLine(gx, gy, gx, topY, lw * 0.7, metalDark);
                ctx.fillStyle = accCol;
                ctx.beginPath();
                ctx.arc(gx, topY, L * 0.42, Math.PI, 0);
                ctx.closePath();
                ctx.fill();
                drawThickLine(gx, topY - L * 0.42, gx, topY - L * 0.5, lw * 0.7, metalDark);
                break;
            }
            case 'raygun': {
                roundedRect(gx - L * 0.08, gy - L * 0.14, L * 0.3, L * 0.2, L * 0.05, accCol2);
                drawThickLine(gx + L * 0.22, gy - L * 0.05, gx + dirX * L * 0.7 + L * 0.22, gy - L * 0.05 + dirY * L * 0.2, lw, metal);
                drawCircle(gx + dirX * L * 0.75 + L * 0.22, gy - L * 0.05 + dirY * L * 0.22, lw * 0.9, accCol);
                break;
            }
            case 'flower': {
                const fx = gx, fy = gy - L * 0.55;
                drawThickLine(gx, gy, fx, fy, lw * 0.6, 'rgb(60, 140, 60)');
                for (let i = 0; i < 5; i++) {
                    const a = i * Math.PI * 2 / 5;
                    drawCircle(fx + Math.cos(a) * L * 0.13, fy + Math.sin(a) * L * 0.13, L * 0.11, accCol);
                }
                drawCircle(fx, fy, L * 0.09, 'rgb(250, 220, 90)');
                break;
            }
            case 'torch': {
                const tx = gx, ty = gy - L * 0.4;
                drawThickLine(gx, gy, tx, ty, lw * 1.4, 'rgb(120, 80, 45)');
                drawCircle(tx, ty - L * 0.12, L * 0.14, 'orange');
                drawCircle(tx, ty - L * 0.22, L * 0.09, 'rgb(255, 225, 110)');
                break;
            }
            case 'broom': {
                const bx = gx + dirX * L * 0.95, by = gy + dirY * L * 0.95;
                drawThickLine(gx - dirX * L * 0.35, gy - dirY * L * 0.35, bx, by, lw * 0.8, 'rgb(150, 105, 60)');
                polygon([[bx - dirY * L * 0.14, by + dirX * L * 0.14],
                    [bx + dirY * L * 0.14, by - dirX * L * 0.14],
                    [bx + dirX * L * 0.35 + dirY * L * 0.22, by + dirY * L * 0.35 - dirX * L * 0.22],
                    [bx + dirX * L * 0.35 - dirY * L * 0.22, by + dirY * L * 0.35 + dirX * L * 0.22]], 'rgb(210, 180, 100)');
                break;
            }
            case 'magnifier': {
                const mx = gx + dirX * L * 0.55, my = gy + dirY * L * 0.55;
                drawThickLine(gx, gy, mx, my, lw, metalDark);
                strokeCircle(mx + dirX * L * 0.2, my + dirY * L * 0.2, L * 0.2, lw, metalDark);
                ctx.fillStyle = 'rgba(160, 210, 240, 0.5)';
                ctx.beginPath();
                ctx.arc(mx + dirX * L * 0.2, my + dirY * L * 0.2, L * 0.2, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
        }
    }
});

class RobotIndividual extends Individual {
    constructor(genome = null) {
        super('SKIP_GENOME_GENERATION');
        this.representation = robotRepresentation;
        this.genome = genome || this.representation.generateRandom();
    }

    // The generator defines the search space; the draw function is where the
    // robot actually lives. Expose both, draw first.
    editableSections() {
        return [
            Individual.functionSection('Draw', robotDraw),
            Individual.generatorSection(this.representation),
        ];
    }

    // Decode layer: the phenotype object with colours scaled to 0-255 and hues
    // to degrees, ready for the draw function.
    getParameters() {
        const p = this.phenotype;
        const c255 = (col) => ({
            r: Math.floor(col.r * 255),
            g: Math.floor(col.g * 255),
            b: Math.floor(col.b * 255)
        });
        return Object.assign({}, p, {
            headColor: c255(p.headColor),
            bodyColor: c255(p.bodyColor),
            limbColor: c255(p.limbColor),
            ledHue: Math.floor(p.ledHue * 360),
            panelHue: Math.floor(p.panelHue * 360),
            accHue: Math.floor(p.accHue * 360),
            accHue2: Math.floor(p.accHue2 * 360),
        });
    }

    visualize(canvas) {
        robotDraw.value(this, canvas.getContext('2d'), canvas.width, canvas.height);
    }

    getPhenotype() {
        const p = this.phenotype;
        const accs = [p.headAcc, p.faceAcc, p.bodyAcc, p.handAcc].filter(a => a !== 'none');
        return `Robot: ${p.bodyShape} body on ${p.locomotion}, ${p.headShape} head, ` +
            `${p.eyeType} eyes, ${p.mouthType} mouth, ${p.panelType} panel` +
            (accs.length ? `, with ${accs.join(', ')}` : '');
    }
}

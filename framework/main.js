// Deep-link support: example.com/#DrumMachine (or ?app=DrumMachine) opens that
// app directly. Hash-based so it works on static hosting and file:// with no
// server rewrite. The "Individual" suffix is optional and matching is
// case-insensitive. With no (or an unknown) token the app opens on the landing
// page (framework/Landing.js) instead, over an undrawn default run.
function startIndividualType() {
    const params = new URLSearchParams(location.search);
    const token = (location.hash || '').replace(/^#/, '') || params.get('app');
    return InteractiveEAFramework.resolveIndividualType(token);
}

const startType = startIndividualType();
const framework = new InteractiveEAFramework(startType || AnemoneIndividual, { landing: !startType });

// Make framework globally accessible for 3D individuals
window.framework = framework;

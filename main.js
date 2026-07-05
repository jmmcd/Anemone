// Deep-link support: example.com/#DrumMachine (or ?app=DrumMachine) opens that
// app directly, skipping the side menu. Hash-based so it works on static hosting
// and file:// with no server rewrite. The "Individual" suffix is optional and
// matching is case-insensitive; an unknown/empty token falls back to the default.
function startIndividualType() {
    const params = new URLSearchParams(location.search);
    const token = (location.hash || '').replace(/^#/, '') || params.get('app');
    return InteractiveEAFramework.resolveIndividualType(token) || AnemoneIndividual;
}

const framework = new InteractiveEAFramework(startIndividualType());

// Make framework globally accessible for 3D individuals
window.framework = framework;

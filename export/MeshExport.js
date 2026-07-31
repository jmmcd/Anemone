/**
 * MeshExport — an app-level service that turns a 3D individual's triangle mesh
 * into a downloadable file. Mirrors the shape of window.ImageSave (a small
 * global object with one entry point), and like it is medium-specific plumbing
 * kept out of the individuals.
 *
 * Any individual that exposes generate3DPoints() → { vertices, indices } can be
 * exported (any RadialSurface3DIndividual subclass). `vertices` is a
 * flat [x,y,z, …] array; `indices` a flat triangle-index array. Colors are
 * ignored — STL is geometry only (the 3D-printing standard).
 *
 * Printability note: the mesh is exactly what's rendered, so self-intersecting
 * or non-periodic (seam) shapes are not watertight/manifold and want a repair
 * pass in a slicer or Blender. Coordinates are in the model's own units (a few
 * units across) — scale up in the slicer.
 */
window.MeshExport = {
    // Build a binary STL ArrayBuffer from flat vertex/index arrays.
    // Binary STL layout: 80-byte header, uint32 triangle count, then per
    // triangle 12 little-endian float32 (normal + 3 vertices) + uint16 attr.
    buildBinarySTL(vertices, indices) {
        const triCount = Math.floor(indices.length / 3);
        const buffer = new ArrayBuffer(84 + triCount * 50);
        const view = new DataView(buffer);

        // Header (80 bytes) — arbitrary ASCII, must NOT begin with "solid".
        const header = 'Anemone STL export';
        for (let i = 0; i < 80; i++) {
            view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0x20);
        }
        view.setUint32(80, triCount, true);

        let offset = 84;
        for (let t = 0; t < triCount; t++) {
            const ia = indices[t * 3] * 3;
            const ib = indices[t * 3 + 1] * 3;
            const ic = indices[t * 3 + 2] * 3;

            const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
            const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
            const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

            // Face normal = normalize((b-a) × (c-a)); (0,0,0) if degenerate
            // (slivers at the poles) — most slicers recompute normals anyway.
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz);
            if (len > 1e-12) { nx /= len; ny /= len; nz /= len; } else { nx = ny = nz = 0; }

            view.setFloat32(offset, nx, true);
            view.setFloat32(offset + 4, ny, true);
            view.setFloat32(offset + 8, nz, true);
            view.setFloat32(offset + 12, ax, true);
            view.setFloat32(offset + 16, ay, true);
            view.setFloat32(offset + 20, az, true);
            view.setFloat32(offset + 24, bx, true);
            view.setFloat32(offset + 28, by, true);
            view.setFloat32(offset + 32, bz, true);
            view.setFloat32(offset + 36, cx, true);
            view.setFloat32(offset + 40, cy, true);
            view.setFloat32(offset + 44, cz, true);
            view.setUint16(offset + 48, 0, true); // attribute byte count
            offset += 50;
        }
        return buffer;
    },

    // Export the individual's mesh as a downloaded .stl file. Returns the filename.
    downloadSTL(individual) {
        if (!individual || typeof individual.generate3DPoints !== 'function') {
            throw new Error('Individual has no exportable mesh');
        }
        const { vertices, indices } = individual.generate3DPoints();
        const buffer = this.buildBinarySTL(vertices, indices);

        const filename = window.ExportNaming.filename(individual, 'stl');

        const blob = new Blob([buffer], { type: 'model/stl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return filename;
    }
};

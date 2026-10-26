/**
 * ThreeDModality
 *
 * Wraps the Three.js mesh creation and shared-scene rendering pipeline.
 * Any 3D individual delegates mesh construction and rendering here,
 * keeping its own code focused on geometry generation.
 */

class ThreeDModality {
    /**
     * Build a Three.js Mesh from raw geometry arrays.
     * @param {number[]} vertices - Flat [x,y,z, x,y,z, ...] array
     * @param {number[]} indices  - Triangle indices
     * @param {number[]} colors   - Flat [r,g,b, r,g,b, ...] array (values 0-1)
     */
    createMesh(vertices, indices, colors) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            shininess: 100
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    /**
     * Full pipeline: build mesh, register with shared scene, render to canvas.
     * Requires the framework's shared 3D scene to be available.
     * @param {HTMLCanvasElement} canvas
     * @param {string} id - Individual id (used as mesh key in shared scene)
     * @param {number[]} vertices
     * @param {number[]} indices
     * @param {number[]} colors
     * @param {object} framework - window.framework reference
     */
    render(canvas, id, vertices, indices, colors, framework) {
        const mesh = this.createMesh(vertices, indices, colors);
        framework.addMeshToScene(id, mesh);
        framework.renderMeshToCanvas(canvas, id, mesh);
    }

    // --- Shared rod-and-ball geometry -------------------------------------------
    // Static helpers for graph-like 3D types (nodes as balls, edges as rods). They
    // append into an `out = { vertices, indices, colors }` bucket (the same flat
    // arrays createMesh and MeshExport take) and colour through window.Palette, so
    // a type just walks its graph and calls these.

    /**
     * Sweep a round tube along a polyline. The cross-section frame is carried by
     * parallel transport (re-orthogonalising the previous normal against each new
     * tangent) rather than recomputed from a fixed up-vector, so a bending tube
     * never flips its roll and pinches. `ts` are palette positions per point (the
     * last is reused if `ts` is shorter than `points`).
     */
    static emitTube(points, ts, radius, sides, out) {
        const n = points.length;
        if (n < 2) return;
        const base = out.vertices.length / 3;
        const tangentAt = (i) => ThreeDModality._norm(
            i === 0 ? ThreeDModality._sub(points[1], points[0])
                : i === n - 1 ? ThreeDModality._sub(points[n - 1], points[n - 2])
                    : ThreeDModality._sub(points[i + 1], points[i - 1]));
        const t0 = tangentAt(0);
        const seed = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        let n1 = ThreeDModality._norm(ThreeDModality._cross(t0, seed));
        for (let i = 0; i < n; i++) {
            const tan = tangentAt(i);
            const d = n1[0] * tan[0] + n1[1] * tan[1] + n1[2] * tan[2];
            n1 = ThreeDModality._norm([n1[0] - tan[0] * d, n1[1] - tan[1] * d, n1[2] - tan[2] * d]);
            const n2 = ThreeDModality._cross(tan, n1);
            const col = window.Palette.color(ts[Math.min(i, ts.length - 1)]);
            for (let s = 0; s < sides; s++) {
                const ang = (s / sides) * 2 * Math.PI;
                const ca = Math.cos(ang) * radius, sa = Math.sin(ang) * radius;
                out.vertices.push(
                    points[i][0] + ca * n1[0] + sa * n2[0],
                    points[i][1] + ca * n1[1] + sa * n2[1],
                    points[i][2] + ca * n1[2] + sa * n2[2]);
                out.colors.push(col.r / 255, col.g / 255, col.b / 255);
            }
        }
        for (let i = 0; i < n - 1; i++)
            for (let s = 0; s < sides; s++) {
                const sn = (s + 1) % sides;
                const a = base + i * sides + s, b = base + i * sides + sn;
                const c = base + (i + 1) * sides + s, d = base + (i + 1) * sides + sn;
                out.indices.push(a, c, b, b, c, d);
            }
    }

    /** A small icosahedral ball at point `p`, palette-coloured at `t`. */
    static emitBall(p, radius, t, out) {
        const base = out.vertices.length / 3;
        const col = window.Palette.color(t);
        for (const v of ThreeDModality.ICO.verts) {
            out.vertices.push(p[0] + v[0] * radius, p[1] + v[1] * radius, p[2] + v[2] * radius);
            out.colors.push(col.r / 255, col.g / 255, col.b / 255);
        }
        for (const f of ThreeDModality.ICO.faces) out.indices.push(base + f[0], base + f[1], base + f[2]);
    }

    static _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    static _cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    static _norm(a) {
        const n = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / n, a[1] / n, a[2] / n];
    }
}

// Unit icosahedron (12 verts, 20 faces) for emitBall.
ThreeDModality.ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2;
    const raw = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
        [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    const verts = raw.map(v => ThreeDModality._norm(v));
    const faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { verts, faces };
})();

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
}

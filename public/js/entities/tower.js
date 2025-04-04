// A tower made of a ring of stones
class Tower {
    constructor(id = null, position = new THREE.Vector3(), level = 1) {
        this.id = id || generateId('tower_');
        this.position = position.clone();
        this.level = level;
        this.createdBy = null;
        this.mesh = null;
        
        // Create the mesh
        this.createTowerMesh();
    }
    
    createTowerMesh() {
        // Clean up old mesh if it exists
        if (this.mesh) {
            // Remove all children and dispose of geometries/materials
            while (this.mesh.children.length > 0) {
                const child = this.mesh.children[0];
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
                this.mesh.remove(child);
            }

            // Remove mesh from parent if it exists
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
        }

        // Create a new group to hold all stones
        this.mesh = new THREE.Group();
        
        // Position the tower on the terrain
        const terrainHeight = Game.getHeightAtPosition(this.position.x, this.position.z);
        this.position.y = terrainHeight + 0.4;
        this.mesh.position.copy(this.position);
        
        // Create stone geometry
        const stoneGeometry = new THREE.BoxGeometry(
            CONFIG.STONE.width,
            CONFIG.STONE.height,
            CONFIG.STONE.depth
        );
        
        // Create base material
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x777777,
            roughness: 0.9,
            metalness: 0.1,
            bumpScale: 0.05
        });
        
        // Load texture once and reuse
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg',
            (bumpMap) => {
                baseMaterial.bumpMap = bumpMap;
                baseMaterial.needsUpdate = true;
                
                // Update all stone materials
                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.material.bumpMap = bumpMap;
                        child.material.needsUpdate = true;
                    }
                });
            }
        );
        
        // Create rings of stones for each level
        for (let level = 0; level < this.level; level++) {
            // Each level has 4 vertical layers
            for (let verticalLayer = 0; verticalLayer < 4; verticalLayer++) {
                const ringY = (level * 4 + verticalLayer) * CONFIG.STONE.depth;
                
                // Create concentric rings at each height, in this case just one ring
                const ringRadii = [CONFIG.TOWER.baseRadius];
                for (let ringIndex = 0; ringIndex < ringRadii.length; ringIndex++) {
                    // Add rotation offset for each level, layer, and ring to interleave stones
                    const levelRotationOffset = (level * Math.PI / CONFIG.TOWER.blockCount);
                    const layerRotationOffset = (verticalLayer * Math.PI / (CONFIG.TOWER.blockCount * 2));
                    const ringRotationOffset = (ringIndex * Math.PI / (CONFIG.TOWER.blockCount * 2));
                    
                    // Create a ring of stones
                    const stoneCount = CONFIG.TOWER.blockCount;
                    const radius = ringRadii[ringIndex];
                    for (let i = 0; i < stoneCount; i++) {
                        // Calculate angle for this stone
                        const angle = (i / stoneCount) * Math.PI * 2 + levelRotationOffset + layerRotationOffset + ringRotationOffset;
                        
                        // Skip stones in the entrance area for first two levels
                        if (level < 2) {
                            // Define entrance angle range (20% of circle)
                            const entranceStart = -Math.PI * 0.2; // -36 degrees
                            const entranceEnd = Math.PI * 0.2;    // +36 degrees
                            
                            // Normalize angle to -PI to PI range
                            let normalizedAngle = angle % (Math.PI * 2);
                            if (normalizedAngle > Math.PI) normalizedAngle -= Math.PI * 2;
                            if (normalizedAngle < -Math.PI) normalizedAngle += Math.PI * 2;
                            
                            // Skip if in entrance range
                            if (normalizedAngle >= entranceStart && normalizedAngle <= entranceEnd) {
                                continue;
                            }
                        }
                        
                        // Calculate stone position
                        const x = Math.cos(angle) * radius;
                        const z = Math.sin(angle) * radius;
                        
                        // Create stone with cloned material
                        const stoneMaterial = baseMaterial.clone();
                        const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);

                        // Enable shadows
                        stone.castShadow = true;
                        stone.receiveShadow = true;
                        
                        // Position stone
                        stone.position.set(x, ringY, z);
                        
                        // Add rotation variations
                        const rotationVariation = (Math.cos(angle * 3 + level) * 0.1);
                        stone.rotation.y = angle + Math.PI/2 + rotationVariation;
                        
                        // Add random tilts
                        const xTilt = Math.sin(i * 0.7 + level * 1.3) * 0.05;
                        const zTilt = Math.cos(i * 0.9 + level * 1.7) * 0.05;
                        stone.rotation.x = xTilt;
                        stone.rotation.z = zTilt;
                        
                        // Scale stones slightly smaller for inner rings
                        const scale = 0.8 + (ringIndex * 0.1);
                        stone.scale.set(scale, scale, scale);
                        
                        // Add stone to mesh
                        this.mesh.add(stone);
                    }
                }
            }
        }
        
        // Add to scene
        if (Game.scene) {
            Game.scene.add(this.mesh);
        }
    }
    
    // Handle tower updates
    updateFromData(data) {
        if (data.newLevel && data.newLevel !== this.level) {
            // Update level
            this.level = data.newLevel;

            // Remove old mesh
            if (this.mesh && this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }

            // Create new mesh with updated level
            this.createTowerMesh();
        }
    }
    
    // Convert to JSON
    toJSON() {
        return {
            id: this.id,
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            },
            level: this.level,
            createdBy: this.createdBy
        };
    }
    
    // Create from JSON data
    static fromJSON(data) {
        // Position
        let position;
        if (data.position) {
            position = new THREE.Vector3(
                data.position.x || 0,
                data.position.y || 0,
                data.position.z || 0
            );
        } else {
            position = new THREE.Vector3(0, 0, 0);
        }
        
        // Create new tower with data
        const tower = new Tower(
            data.id || null,
            position,
            data.level || 1
        );
        if (data.createdBy) {
            tower.createdBy = data.createdBy;
        }

        // Return tower
        return tower;
    }

} 
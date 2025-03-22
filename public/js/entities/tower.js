// Tower entity with original appearance
class Tower {
    constructor(id = null, position = new THREE.Vector3(), level = 1) {
        this.id = id || generateId('tower_');
        this.position = position.clone();
        this.level = level;
        this.mesh = null;
        this.createdBy = null;
        this.createdAt = Date.now();
        
        this.createMesh();
    }
    
    createMesh() {
        // Create a group to hold all tower parts
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);
        
        // Create tower base material - gray stone like in original
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,  // Medium gray color
            roughness: 0.9,   // Very rough surface
            metalness: 0.1,   // Slight metallic quality
            flatShading: true // Use flat shading for a more rugged look
        });
        
        // Create tower base (cylinder)
        const baseGeometry = new THREE.CylinderGeometry(
            CONFIG.TOWER.baseRadius, 
            CONFIG.TOWER.baseRadius * 1.2, 
            CONFIG.TOWER.baseHeight, 
            16
        );
        
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = CONFIG.TOWER.baseHeight / 2;
        base.castShadow = true;
        base.receiveShadow = true;
        this.mesh.add(base);
        
        // Add tower levels
        for (let i = 0; i < this.level; i++) {
            this.addLevel(i + 1);
        }
        
        // Add to scene
        Game.scene.add(this.mesh);
    }
    
    addLevel(level) {
        // Create level material - gray stone like in original
        const levelMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,  // Medium gray color
            roughness: 0.9,   // Very rough surface
            metalness: 0.1,   // Slight metallic quality
            flatShading: true // Use flat shading for a more rugged look
        });
        
        // Calculate level height
        const levelHeight = CONFIG.TOWER.baseHeight + (level - 1) * CONFIG.STONE.blockHeight;
        
        // Create a ring of blocks for this level
        const blockCount = CONFIG.TOWER.blockCount;
        const radius = CONFIG.TOWER.baseRadius * 0.8;
        
        for (let i = 0; i < blockCount; i++) {
            // Calculate block position around the circle
            const angle = (i / blockCount) * Math.PI * 2;
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;
            
            // Create block geometry with slight randomization
            const blockGeometry = new THREE.BoxGeometry(
                CONFIG.STONE.blockWidth,
                CONFIG.STONE.blockHeight,
                CONFIG.STONE.blockDepth
            );
            
            // Apply slight random variations to vertices for a more natural look
            const positionAttribute = blockGeometry.attributes.position;
            const vertices = positionAttribute.array;
            
            for (let j = 0; j < vertices.length; j += 3) {
                vertices[j] += (Math.random() - 0.5) * 0.04;   // x
                vertices[j + 1] += (Math.random() - 0.5) * 0.04;  // y
                vertices[j + 2] += (Math.random() - 0.5) * 0.04;  // z
            }
            
            // Update geometry
            positionAttribute.needsUpdate = true;
            blockGeometry.computeVertexNormals();
            
            // Create block mesh
            const block = new THREE.Mesh(blockGeometry, levelMaterial);
            
            // Position block
            block.position.set(
                x,
                levelHeight + CONFIG.STONE.blockHeight / 2,
                z
            );
            
            // Rotate block to face center
            block.rotation.y = angle + Math.PI / 2;
            
            // Add shadows
            block.castShadow = true;
            block.receiveShadow = true;
            
            // Add to tower mesh
            this.mesh.add(block);
        }
    }
    
    destroy() {
        // Remove from scene
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }
    
    toJSON() {
        return {
            id: this.id,
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            },
            level: this.level,
            createdBy: this.createdBy,
            createdAt: this.createdAt
        };
    }
    
    static fromJSON(data) {
        const position = new THREE.Vector3(
            data.position.x,
            data.position.y,
            data.position.z
        );
        
        const tower = new Tower(data.id, position, data.level);
        tower.createdBy = data.createdBy;
        tower.createdAt = data.createdAt;
        
        return tower;
    }
} 
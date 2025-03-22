// Create a simple tower with a ring of stones that match regular stones
class Tower {
    constructor(id = null, position = new THREE.Vector3(), level = 1) {
        this.id = id || generateId('tower_');
        this.position = position.clone();
        this.level = level;
        this.createdBy = null;
        this.mesh = null;
        
        // Create the mesh immediately
        this.createSimpleStoneRing();
    }
    
    createSimpleStoneRing() {
        // Create a group to hold all stones
        this.mesh = new THREE.Group();
        
        // Position the tower at a visible height
        this.position.y = 0.5; // Just above ground level
        this.mesh.position.copy(this.position);
        
        // Use the same stone dimensions as regular stones
        const stoneGeometry = new THREE.BoxGeometry(
            CONFIG.STONE.width,
            CONFIG.STONE.height,
            CONFIG.STONE.depth
        );
        
        // Use the same stone material as regular stones
        const stoneMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.9,
            metalness: 0.1
        });
        
        // Create rings of stones for each level
        for (let level = 0; level < this.level; level++) {
            const ringY = level * CONFIG.STONE.height * 1.2; // Slight spacing between levels
            
            // Create a ring of stones
            const stoneCount = 8; // Fixed number for consistent appearance
            const radius = 2; // Fixed radius for consistent appearance
            
            for (let i = 0; i < stoneCount; i++) {
                // Calculate position around the circle
                const angle = (i / stoneCount) * Math.PI * 2;
                const x = Math.sin(angle) * radius;
                const z = Math.cos(angle) * radius;
                
                // Create stone
                const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
                
                // Position stone
                stone.position.set(x, ringY, z);
                
                // Rotate stone to face center
                stone.rotation.y = angle + Math.PI / 2;
                
                // Add to group
                this.mesh.add(stone);
            }
        }
        
        // Add to scene
        if (Game.scene) {
            Game.scene.add(this.mesh);
        }
    }
    
    // Convert to JSON for network transmission
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
        const position = new THREE.Vector3(
            data.position.x,
            data.position.y,
            data.position.z
        );
        
        const tower = new Tower(data.id, position, data.level);
        tower.createdBy = data.createdBy;
        
        return tower;
    }
    
    // Remove tower
    remove() {
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }
} 
// Create a simple tower with a ring of stones that match regular stones
class Tower {
    constructor(id = null, position = new THREE.Vector3(), level = 1) {
        this.id = id || generateId('tower_');
        this.position = position.clone();
        this.level = level;
        this.createdBy = null;
        this.mesh = null;
        
        // Create the mesh immediately
        this.createSimpleTower();
    }
    
    createSimpleTower() {
        // Create a group to hold all stones
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
        
        // Create stone material - matching Stone class exactly
        const stoneMaterial = new THREE.MeshStandardMaterial({
            color: 0x777777,  // Medium-dark gray
            roughness: 0.9,   // Very rough surface
            metalness: 0.1,   // Low metalness
            bumpMap: null,    // No bump map initially
            bumpScale: 0.05   // Bump scale for when map is loaded
        });
        
        // Load bump map texture asynchronously
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg',
            (texture) => {
                stoneMaterial.bumpMap = texture;
                stoneMaterial.needsUpdate = true;
            }
        );
        
        // Create rings of stones for each level
        for (let level = 0; level < this.level; level++) {
            const ringY = level * CONFIG.STONE.height; // Stack directly on top
            
            // Add rotation offset for each level to interleave stones
            const levelRotationOffset = (level * Math.PI / CONFIG.TOWER.blockCount);
            
            // Create a ring of stones
            const stoneCount = CONFIG.TOWER.blockCount; // Use config value
            const radius = CONFIG.TOWER.baseRadius;
            
            for (let i = 0; i < stoneCount; i++) {
                const angle = (i / stoneCount) * Math.PI * 2 + levelRotationOffset;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                
                // Create stone with unique material instance
                const stone = new THREE.Mesh(stoneGeometry, stoneMaterial.clone());
                
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
                
                this.mesh.add(stone);
            }
        }
        
        // Add to scene
        if (Game.scene) {
            Game.scene.add(this.mesh);
        }
    }
    
    // Add a new level to the tower
    addLevel() {
        this.level++;
        // Remove old mesh
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        // Create new mesh with updated levels
        this.createSimpleTower();
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
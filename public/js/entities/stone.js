// Stone entity with exact original appearance from main.js
class Stone {
    constructor(id = null) {
        this.id = id || generateId('stone_');
        this.mesh = null;
        this.velocity = new THREE.Vector3();
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = false;
        this.throwTime = 0;
        this.isStatic = false;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create stone geometry - use BoxGeometry as in original
        const geometry = new THREE.BoxGeometry(
            CONFIG.STONE.width, 
            CONFIG.STONE.height, 
            CONFIG.STONE.depth
        );
        
        // Create stone material - gray color with no texture map, only bump map
        const material = new THREE.MeshStandardMaterial({
            color: 0x777777,  // Medium-dark gray
            roughness: 0.9,   // Very rough surface
            metalness: 0.1,   // Low metalness
            bumpMap: null,    // No bump map initially
            bumpScale: 0.05   // Bump scale for when map is loaded
        });
        
        // Create mesh
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Store reference to this stone in the mesh
        this.mesh.userData.stone = this;
        
        // Add to scene
        Game.scene.add(this.mesh);
        
        // Load bump map texture asynchronously
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg',
            (texture) => {
                // Apply as bump map only, not color map
                material.bumpMap = texture;
                material.needsUpdate = true;
            }
        );
        
        return this.mesh;
    }
    
    update(deltaTime) {
        if (this.isHeld || !this.mesh) return;
        
        // Apply gravity
        this.velocity.y -= CONFIG.WORLD.gravity * deltaTime;
        
        // Update position
        this.mesh.position.x += this.velocity.x * deltaTime;
        this.mesh.position.y += this.velocity.y * deltaTime;
        this.mesh.position.z += this.velocity.z * deltaTime;
        
        // Check ground collision
        if (this.mesh.position.y < CONFIG.STONE.blockHeight / 2) {
            this.mesh.position.y = CONFIG.STONE.blockHeight / 2;
            
            // Bounce with damping
            if (Math.abs(this.velocity.y) > 0.1) {
                this.velocity.y = -this.velocity.y * 0.5;
                
                // Apply friction to horizontal movement
                this.velocity.x *= 0.8;
                this.velocity.z *= 0.8;
            } else {
                this.velocity.y = 0;
                this.isStatic = true;
            }
        }
        
        // Apply air resistance
        this.velocity.multiplyScalar(0.99);
        
        // Check if stone is stationary
        if (this.isThrown && this.velocity.lengthSq() < 0.01 && this.mesh.position.y <= CONFIG.STONE.blockHeight / 2 + 0.1) {
            this.isStatic = true;
            
            // Check if stone should transform into a tower
            if (Date.now() - this.throwTime > 1000) {
                Game.checkStoneForTowerTransformation(this);
            }
        }
    }
    
    pickup(playerId) {
        if (this.isHeld) return false;
        
        this.isHeld = true;
        this.heldBy = playerId;
        this.isThrown = false;
        this.isStatic = false;
        
        // Remove from scene
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        
        return true;
    }
    
    drop(position, rotation, velocity) {
        this.isHeld = false;
        this.heldBy = null;
        
        // Update position and rotation
        this.mesh.position.copy(position);
        this.mesh.rotation.copy(rotation);
        this.velocity.copy(velocity);
        
        // Add to scene
        Game.scene.add(this.mesh);
        
        return this;
    }
    
    throw(position, direction, upwardForce = CONFIG.STONE.throwUpward) {
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = true;
        this.throwTime = Date.now();
        this.isStatic = false;
        
        // Position stone
        this.mesh.position.copy(position);
        
        // Set velocity
        this.velocity.copy(direction).multiplyScalar(CONFIG.STONE.throwForce);
        this.velocity.y = upwardForce;
        
        // Add to scene
        Game.scene.add(this.mesh);
        
        return this;
    }
    
    toJSON() {
        return {
            id: this.id,
            position: {
                x: this.mesh.position.x,
                y: this.mesh.position.y,
                z: this.mesh.position.z
            },
            rotation: {
                x: this.mesh.rotation.x,
                y: this.mesh.rotation.y,
                z: this.mesh.rotation.z
            },
            velocity: {
                x: this.velocity.x,
                y: this.velocity.y,
                z: this.velocity.z
            },
            isHeld: this.isHeld,
            heldBy: this.heldBy,
            isThrown: this.isThrown,
            throwTime: this.throwTime,
            isStatic: this.isStatic
        };
    }
    
    static fromJSON(data) {
        const stone = new Stone(data.id);
        
        stone.mesh.position.set(
            data.position.x,
            data.position.y,
            data.position.z
        );
        
        stone.mesh.rotation.set(
            data.rotation.x,
            data.rotation.y,
            data.rotation.z
        );
        
        stone.velocity.set(
            data.velocity.x,
            data.velocity.y,
            data.velocity.z
        );
        
        stone.isHeld = data.isHeld;
        stone.heldBy = data.heldBy;
        stone.isThrown = data.isThrown;
        stone.throwTime = data.throwTime;
        stone.isStatic = data.isStatic;
        
        return stone;
    }
} 
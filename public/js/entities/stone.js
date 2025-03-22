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
        // Skip if held by player
        if (this.isHeld || !this.mesh) return;
        
        // Apply gravity
        this.velocity.y -= 0.01;
        
        // Apply velocity
        this.mesh.position.x += this.velocity.x;
        this.mesh.position.y += this.velocity.y;
        this.mesh.position.z += this.velocity.z;
        
        // Calculate distance from center
        const distanceFromCenter = Math.sqrt(
            this.mesh.position.x * this.mesh.position.x + 
            this.mesh.position.z * this.mesh.position.z
        );
        
        // Calculate world radius and beach position
        const worldHalfSize = CONFIG.WORLD.size / 2;
        const beachDistance = worldHalfSize * 0.9; // Beach is at 90% of world radius
        
        // Check if in water (below sea level or beyond beach)
        const isInWater = this.mesh.position.y < 0 || distanceFromCenter > beachDistance;
        
        // Apply moderate wave force if in water
        if (isInWater) {
            // Calculate direction toward island center
            const directionToCenter = new THREE.Vector3(
                -this.mesh.position.x,
                0,
                -this.mesh.position.z
            ).normalize();
            
            // Apply wave force - MODERATE
            this.velocity.x += directionToCenter.x * 0.03;
            this.velocity.z += directionToCenter.z * 0.03;
            
            // Add random bobbing in water with moderate upward bias
            this.velocity.y += 0.02;
            
            // Create small water ripples occasionally
            if (Math.random() < 0.05) {
                Game.createSplashEffect(this.mesh.position.clone());
            }
        }
        
        // Check ground collision
        const groundHeight = Game.getHeightAtPosition(this.mesh.position.x, this.mesh.position.z);
        
        if (this.mesh.position.y < groundHeight + 0.5) {
            // Place on ground
            this.mesh.position.y = groundHeight + 0.5;
            
            // Bounce with damping - MODERATE BOUNCE
            if (this.velocity.y < -0.05) {
                this.velocity.y = -this.velocity.y * 0.5;
                
                // Create impact effect if significant impact
                if (-this.velocity.y > 0.1) {
                    // TODO: Add impact effect
                }
            } else {
                this.velocity.y = 0;
            }
            
            // Apply friction - MODERATE FRICTION
            this.velocity.x *= 0.95;
            this.velocity.z *= 0.95;
        }
        
        // Apply air resistance - MODERATE AIR RESISTANCE
        this.velocity.multiplyScalar(0.99);
        
        // Check if stone has stopped
        if (Math.abs(this.velocity.x) < 0.01 && 
            Math.abs(this.velocity.y) < 0.01 && 
            Math.abs(this.velocity.z) < 0.01) {
            
            this.velocity.set(0, 0, 0);
            this.isStatic = true;
            
            // Make sure the stone stays visible and in the scene
            if (this.mesh) {
                this.mesh.visible = true;
            }
        } else {
            this.isStatic = false;
        }
        
        // Update rotation based on movement
        if (!this.isStatic) {
            // Calculate rotation axis perpendicular to movement direction
            const movementDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
            if (movementDir.length() > 0.01) {
                const rotationAxis = new THREE.Vector3(-movementDir.z, 0, movementDir.x);
                
                // Calculate rotation amount based on speed
                const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                const rotationSpeed = speed * 2;
                
                // Apply rotation
                const quaternion = new THREE.Quaternion();
                quaternion.setFromAxisAngle(rotationAxis, rotationSpeed);
                this.mesh.quaternion.premultiply(quaternion);
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
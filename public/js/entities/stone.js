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
        const beachDistance = worldHalfSize * 0.95; // Beach edge is at 95% of world radius
        
        // Check if in water (beyond beach boundary)
        const isInWater = distanceFromCenter > beachDistance;
        
        // Apply gentle wave force if in water
        if (isInWater) {
            // Calculate direction toward island center
            const directionToCenter = new THREE.Vector3(
                -this.mesh.position.x,
                0,
                -this.mesh.position.z
            ).normalize();
            
            // Apply wave force
            this.velocity.x += directionToCenter.x * 0.01;
            this.velocity.z += directionToCenter.z * 0.01;
            
            // Add random bobbing in water with gentle upward bias
            this.velocity.y += 0.008;
        }
        
        // Check ground collision and calculate slope
        const groundHeight = Game.getHeightAtPosition(this.mesh.position.x, this.mesh.position.z);
        
        // Sample heights around the stone to determine slope
        const sampleDistance = 2.0;
        const heightNorth = Game.getHeightAtPosition(this.mesh.position.x, this.mesh.position.z - sampleDistance);
        const heightSouth = Game.getHeightAtPosition(this.mesh.position.x, this.mesh.position.z + sampleDistance);
        const heightEast = Game.getHeightAtPosition(this.mesh.position.x + sampleDistance, this.mesh.position.z);
        const heightWest = Game.getHeightAtPosition(this.mesh.position.x - sampleDistance, this.mesh.position.z);
        
        // Calculate slope vector
        const slopeX = (heightWest - heightEast) / (2 * sampleDistance);
        const slopeZ = (heightNorth - heightSouth) / (2 * sampleDistance);
        
        // Calculate slope magnitude (steepness)
        const slopeMagnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
        
        // Place stone directly on ground
        const stoneRadius = CONFIG.STONE.height / 2;
        if (this.mesh.position.y < groundHeight + stoneRadius) {
            // Place directly on ground
            this.mesh.position.y = groundHeight + stoneRadius;
            
            // Bounce with damping
            if (this.velocity.y < -0.05) {
                this.velocity.y = -this.velocity.y * 0.3;
            } else {
                this.velocity.y = 0;
            }
            
            // Apply friction - variable based on slope
            const frictionFactor = Math.max(0.75, 0.95 - slopeMagnitude * 5);
            this.velocity.x *= frictionFactor;
            this.velocity.z *= frictionFactor;
            
            // Apply slope force for valley rolling
            const rollFactor = CONFIG.STONE.rollFactor * 2;
            this.velocity.x += slopeX * rollFactor;
            this.velocity.z += slopeZ * rollFactor;
            
            // Add extra downhill acceleration on steeper slopes
            if (slopeMagnitude > 0.05) {
                const downhillDirection = new THREE.Vector3(slopeX, 0, slopeZ).normalize();
                const downhillFactor = slopeMagnitude * 0.1;
                
                this.velocity.x += downhillDirection.x * downhillFactor;
                this.velocity.z += downhillDirection.z * downhillFactor;
            }
        }
        
        // Apply air resistance
        const speed = this.velocity.length();
        const airResistanceFactor = Math.max(0.95, 0.99 - speed * 0.1);
        this.velocity.multiplyScalar(airResistanceFactor);
        
        // Cap maximum velocity
        if (speed > CONFIG.STONE.maxVelocity) {
            this.velocity.normalize().multiplyScalar(CONFIG.STONE.maxVelocity);
        }
        
        // Check if stone has stopped
        if (Math.abs(this.velocity.x) < CONFIG.STONE.stopThreshold && 
            Math.abs(this.velocity.y) < CONFIG.STONE.stopThreshold && 
            Math.abs(this.velocity.z) < CONFIG.STONE.stopThreshold) {
            
            this.velocity.set(0, 0, 0);
            this.isStatic = true;
            
            // Make sure the stone stays visible
            if (this.mesh) {
                this.mesh.visible = true;
            }
        } else {
            this.isStatic = false;
        }
        
        // Update rotation based on movement - FIX ROTATION DIRECTION
        if (!this.isStatic) {
            const movementDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
            if (movementDir.length() > 0.01) {
                // FIX: Invert the rotation axis to make stones roll forward
                const rotationAxis = new THREE.Vector3(movementDir.z, 0, -movementDir.x);
                
                const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                const rotationSpeed = speed * 2 / CONFIG.STONE.width;
                
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
// Stone entity with exact original appearance from main.js
class Stone {
    constructor(id = null, position = null, velocity = null) {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.position = position || new THREE.Vector3(0, 0, 0);
        this.velocity = velocity || new THREE.Vector3(0, 0, 0);
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = false;
        this.throwTime = 0;
        this.isStatic = false;
        this.lastUpdateTime = Date.now();

        // Create mesh with proper texture
        const geometry = new THREE.BoxGeometry(
            CONFIG.STONE.width,
            CONFIG.STONE.height,
            CONFIG.STONE.depth
        );
        
        // Load texture from Three.js examples
        const textureLoader = new THREE.TextureLoader();
        const stoneTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
        
        const material = new THREE.MeshStandardMaterial({
            roughness: 0.9,
            metalness: 0.1,
            color: 0x808080,
            bumpMap: stoneTexture,
            bumpScale: 0.5
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Set initial mesh position
        if (position) {
            this.mesh.position.copy(position);
        }
    }

    update(deltaTime) {
        if (!this.mesh) return;

        // Only update visual rotation for rolling stones
        if (!this.isStatic && !this.isHeld) {
            const movementDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).normalize();
            if (movementDir.length() > 0.01) {
                const rotationAxis = new THREE.Vector3(movementDir.z, 0, -movementDir.x);
                const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                const rotationSpeed = speed * 2 / CONFIG.STONE.width;
                
                const quaternion = new THREE.Quaternion();
                quaternion.setFromAxisAngle(rotationAxis, rotationSpeed);
                this.mesh.quaternion.premultiply(quaternion);
            }
        }

        // Update mesh position
        this.mesh.position.copy(this.position);
    }

    // Used when receiving server updates
    updateFromServer(data) {
        this.position.set(data.position.x, data.position.y, data.position.z);
        this.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        this.isHeld = data.isHeld;
        this.heldBy = data.heldBy;
        this.isThrown = data.isThrown;
        this.isStatic = data.isStatic;
    }

    remove() {
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
    }
    
    pickup(playerId) {
        if (this.isHeld) return false;
        
        this.isHeld = true;
        this.heldBy = playerId;
        this.isThrown = false;
        this.isStatic = false;
        this.velocity.set(0, 0, 0);
        
        // Scale down when held
        this.mesh.scale.set(0.7, 0.7, 0.7);
        
        return true;
    }
    
    drop() {
        this.isHeld = false;
        this.heldBy = null;
        this.isStatic = false;
        
        // Reset scale
        this.mesh.scale.set(1, 1, 1);
    }
    
    throw(position, direction, upwardForce = CONFIG.STONE.throwUpward) {
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = true;
        this.throwTime = Date.now();
        this.isStatic = false;
        
        // Position stone
        this.position.copy(position);
        this.mesh.position.copy(position);
        
        // Set velocity
        this.velocity.copy(direction).multiplyScalar(CONFIG.STONE.throwForce);
        this.velocity.y = upwardForce;
        
        // Notify server
        Network.sendStoneThrown(this);
        
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
        const stone = new Stone(data);
        
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
    
    // Start settling animation
    startSettlingAnimation() {
        // Calculate target quaternion (flat position)
        const targetQuaternion = this.calculateFlatQuaternion();
        
        // Store current quaternion
        const startQuaternion = this.mesh.quaternion.clone();
        
        // Setup animation parameters
        this.settlingAnimation = {
            startQuaternion: startQuaternion,
            targetQuaternion: targetQuaternion,
            duration: 500, // Animation duration in milliseconds
            startTime: Date.now(),
            progress: 0
        };
    }
    
    // Update settling animation
    updateSettlingAnimation(deltaTime) {
        if (!this.settlingAnimation) return;
        
        // Calculate progress
        const elapsed = Date.now() - this.settlingAnimation.startTime;
        this.settlingAnimation.progress = Math.min(1, elapsed / this.settlingAnimation.duration);
        
        // Use easeOutQuad for smooth deceleration
        const t = 1 - (1 - this.settlingAnimation.progress) * (1 - this.settlingAnimation.progress);
        
        // Use non-deprecated quaternion interpolation
        this.mesh.quaternion.copy(this.settlingAnimation.startQuaternion).slerp(
            this.settlingAnimation.targetQuaternion,
            t
        );
        
        // Check if animation is complete
        if (this.settlingAnimation.progress >= 1) {
            this.settlingAnimation = null;
        }
    }
    
    // Calculate quaternion for flat position
    calculateFlatQuaternion() {
        // Calculate the slope at the stone's position
        const sampleDistance = 2.0;
        const x = this.mesh.position.x;
        const z = this.mesh.position.z;
        
        const heightNorth = Game.getHeightAtPosition(x, z - sampleDistance);
        const heightSouth = Game.getHeightAtPosition(x, z + sampleDistance);
        const heightEast = Game.getHeightAtPosition(x + sampleDistance, z);
        const heightWest = Game.getHeightAtPosition(x - sampleDistance, z);
        
        // Calculate slope normal vector
        const slopeX = (heightWest - heightEast) / (2 * sampleDistance);
        const slopeZ = (heightNorth - heightSouth) / (2 * sampleDistance);
        
        // Create normal vector (perpendicular to slope)
        const normal = new THREE.Vector3(slopeX, 1, slopeZ).normalize();
        
        // Create a rotation that aligns the stone's up vector with the normal
        const upVector = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        
        // Only apply rotation if slope is significant
        if (Math.abs(slopeX) > 0.05 || Math.abs(slopeZ) > 0.05) {
            quaternion.setFromUnitVectors(upVector, normal);
        } else {
            // On flat ground, just set to identity quaternion (no rotation)
            quaternion.identity();
            
            // Add a very slight tilt for natural look
            const tiltAxis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            const tiltAngle = Math.random() * 0.05; // Very small random tilt
            const tiltQuaternion = new THREE.Quaternion();
            tiltQuaternion.setFromAxisAngle(tiltAxis, tiltAngle);
            
            quaternion.multiply(tiltQuaternion);
        }
        
        return quaternion;
    }

    // Method to update stone properties from server data
    updateFromData(data) {
        this.position.set(data.position.x, data.position.y, data.position.z);
        this.mesh.position.copy(this.position);
        
        // Add rotation update from server
        if (data.rotation) {
            this.mesh.rotation.set(
                data.rotation.x,
                data.rotation.y,
                data.rotation.z
            );
        }
        
        this.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        this.isHeld = data.isHeld;
        this.heldBy = data.heldBy;
        this.isThrown = data.isThrown;
        this.isStatic = data.isStatic;
    }
} 
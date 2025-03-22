class Player {
    constructor(id = null, username = 'Player') {
        this.id = id || generateId('player_');
        this.username = username;
        this.position = new THREE.Vector3(0, CONFIG.PLAYER.height, 0);
        this.rotation = new THREE.Euler();
        this.velocity = new THREE.Vector3();
        this.isGrounded = false;
        this.isJumping = false;
        this.mesh = null;
        this.camera = null;
        this.heldStones = [];
        this.lastUpdate = Date.now();
        this.isLocal = false;
        
        // Create mesh for remote players only
        if (!this.isLocal) {
            this.createMesh();
        }
    }
    
    createMesh() {
        // Create a group to hold all player parts
        this.mesh = new THREE.Group();
        
        // Create body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.8;
        this.mesh.add(body);
        
        // Add neck to connect head and body
        const neckGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.15, 8);
        const neckMaterial = new THREE.MeshStandardMaterial({
            color: 0xE0AC69,
            roughness: 0.7,
            metalness: 0.1
        });
        const neck = new THREE.Mesh(neckGeometry, neckMaterial);
        neck.position.y = 1.35; // Position between head and body
        this.mesh.add(neck);
        
        // Create head (sphere)
        const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xE0AC69,
            roughness: 0.7,
            metalness: 0.1
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.6; // Raised slightly to accommodate neck
        this.mesh.add(head);
        
        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.05, 6, 6);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        // Left eye
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.1, 1.65, -0.25);
        this.mesh.add(leftEye);
        
        // Right eye
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.1, 1.65, -0.25);
        this.mesh.add(rightEye);
        
        // Mouth
        const mouthGeometry = new THREE.BoxGeometry(0.15, 0.03, 0.03);
        const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
        mouth.position.set(0, 1.55, -0.28);
        this.mesh.add(mouth);
        
        // Create arms
        const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.1
        });
        
        // Left arm
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.4, 1.0, 0);
        leftArm.rotation.z = Math.PI / 4; // Angle outward
        this.mesh.add(leftArm);
        
        // Right arm
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.4, 1.0, 0);
        rightArm.rotation.z = -Math.PI / 4; // Angle outward
        this.mesh.add(rightArm);
        
        // Create legs (cylinders)
        const legGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 6);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321, // Darker brown for pants
            roughness: 0.8,
            metalness: 0.1
        });
        
        // Left leg
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.2, 0.1, 0);
        this.mesh.add(leftLeg);
        
        // Right leg
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.2, 0.1, 0);
        this.mesh.add(rightLeg);
        
        // Add nametag
        this.createNametag();
        
        // Raise the entire player slightly off the ground
        this.mesh.position.y = 0.2;
        
        // Store reference to this player in the mesh
        this.mesh.userData.player = this;
        
        return this.mesh;
    }
    
    createNametag() {
        // Create canvas for nametag
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Draw background
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw text
        context.font = '32px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(this.username, canvas.width / 2, canvas.height / 2);
        
        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        
        // Create material
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        
        // Create sprite
        const sprite = new THREE.Sprite(material);
        sprite.position.y = 2.2;
        sprite.scale.set(2, 0.5, 1);
        
        // Add to mesh
        this.mesh.add(sprite);
    }
    
    update(deltaTime) {
        // Update position based on velocity
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;
        
        // Update mesh position
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.copy(this.rotation);
        }
    }
    
    updateFromData(data) {
        // Update position
        this.position.set(
            data.position.x,
            data.position.y,
            data.position.z
        );
        
        // Update rotation
        this.rotation.set(
            data.rotation.x,
            data.rotation.y,
            data.rotation.z
        );
        
        // Update held stones
        this.heldStones = data.heldStones || [];
        
        // Update last update time
        this.lastUpdate = data.lastUpdate || Date.now();
        
        // Update mesh
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.copy(this.rotation);
        }
    }
    
    pickupStone(stone) {
        // Check if player can pick up more stones
        if (this.heldStones.length >= CONFIG.STONE.maxHeld) {
            return false;
        }
        
        // Add stone to held stones
        this.heldStones.push(stone.id);
        
        // Mark stone as held
        stone.pickup(this.id);
        
        return true;
    }
    
    dropStone() {
        if (this.heldStones.length === 0) {
            return null;
        }
        
        const stoneId = this.heldStones.pop();
        const stone = Game.getStoneById(stoneId);
        
        if (!stone) {
            return null;
        }
        
        // Position in front of player
        const direction = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);
        const position = this.position.clone().add(direction.multiplyScalar(1.5));
        position.y = this.position.y - 0.5; // Slightly below eye level
        
        // Drop stone
        stone.drop(position, this.rotation, new THREE.Vector3());
        
        return stone;
    }
    
    throwStone() {
        if (this.heldStones.length === 0) {
            return null;
        }
        
        const stoneId = this.heldStones.pop();
        const stone = Game.getStoneById(stoneId);
        
        if (!stone) {
            return null;
        }
        
        // Position in front of player
        const direction = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);
        const position = this.position.clone().add(direction.multiplyScalar(1.5));
        position.y = this.position.y - 0.5; // Slightly below eye level
        
        // Throw stone
        stone.throw(position, direction);
        
        return stone;
    }
    
    toJSON() {
        return {
            id: this.id,
            username: this.username,
            position: {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            },
            rotation: {
                x: this.rotation.x,
                y: this.rotation.y,
                z: this.rotation.z
            },
            heldStones: this.heldStones,
            lastUpdate: this.lastUpdate
        };
    }
    
    static fromJSON(data) {
        const player = new Player(data.id, data.username);
        player.updateFromData(data);
        return player;
    }
}

// Local player extends Player
class LocalPlayer extends Player {
    constructor(id = null, username = 'Player') {
        super(id, username);
        this.isLocal = true;
        this.camera = null;
        this.cameraPitch = 0;
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            throw: false
        };
        this.heldStones = [];
        this.maxStones = CONFIG.PLAYER.maxStones;
    }
    
    setCamera(camera) {
        this.camera = camera;
        
        // Initialize camera position and rotation
        if (this.camera) {
            this.camera.position.copy(this.position);
            this.camera.position.y += CONFIG.PLAYER.height;
            this.camera.rotation.y = this.rotation.y;
            this.camera.rotation.x = this.cameraPitch;
        }
    }
    
    update(deltaTime) {
        // Apply gravity
        if (!this.isGrounded) {
            this.velocity.y -= CONFIG.PLAYER.gravity * deltaTime;
        } else if (!this.controls.jump) {
            this.velocity.y = 0;
        }
        
        // Handle jumping
        if (this.controls.jump && this.isGrounded) {
            this.velocity.y = CONFIG.PLAYER.jumpForce;
            this.isGrounded = false;
            this.isJumping = true;
        }
        
        // Calculate movement direction
        let moveForward = 0;
        let turnAmount = 0;
        
        // Fix the movement direction - forward should move forward
        if (this.controls.forward) moveForward += 1;
        if (this.controls.backward) moveForward -= 1;
        if (this.controls.left) turnAmount += 1;
        if (this.controls.right) turnAmount -= 1;
        
        // Apply turning - rotate player based on left/right controls
        if (turnAmount !== 0) {
            // Get rotation from camera
            this.rotation.y += turnAmount * 2 * deltaTime;
            
            // Update camera rotation to match
            if (this.camera) {
                this.camera.rotation.y = this.rotation.y;
            }
        }
        
        // Apply forward/backward movement in the direction player is facing
        if (moveForward !== 0) {
            // Create movement vector in the direction player is facing
            const moveDirection = new THREE.Vector3(
                -Math.sin(this.rotation.y) * moveForward,
                0,
                -Math.cos(this.rotation.y) * moveForward
            );
            
            // Apply movement speed
            moveDirection.multiplyScalar(CONFIG.PLAYER.speed * deltaTime);
            
            // Update velocity (horizontal only)
            this.velocity.x = moveDirection.x;
            this.velocity.z = moveDirection.z;
        } else {
            // Stop horizontal movement
            this.velocity.x = 0;
            this.velocity.z = 0;
        }
        
        // Update position
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z;
        
        // Check ground collision and adjust to terrain height
        const terrainHeight = Game.getHeightAtPosition(this.position.x, this.position.z);
        const playerHeight = CONFIG.PLAYER.height;
        
        if (this.position.y < terrainHeight + playerHeight) {
            this.position.y = terrainHeight + playerHeight;
            this.isGrounded = true;
            this.isJumping = false;
        } else {
            this.isGrounded = false;
        }
        
        // Update camera position
        if (this.camera) {
            this.camera.position.copy(this.position);
            this.camera.position.y = this.position.y + CONFIG.PLAYER.height - 0.2;
            
            // Ensure camera rotation matches player rotation and pitch
            this.camera.rotation.y = this.rotation.y;
            this.camera.rotation.x = this.cameraPitch;
        }
        
        // Check for tower collisions
        this.checkTowerCollisions();
        
        // Check for stone pickups
        this.checkStonePickups();
    }
    
    checkTowerCollisions() {
        // Check if player is on a tower
        for (const tower of Game.towers) {
            const horizontalDistance = new THREE.Vector2(
                this.position.x - tower.position.x,
                this.position.z - tower.position.z
            ).length();
            
            // If player is within tower radius
            if (horizontalDistance < CONFIG.TOWER.baseRadius) {
                // If player is at the right height
                const towerHeight = tower.level * CONFIG.STONE.blockHeight;
                if (Math.abs(this.position.y - towerHeight - CONFIG.PLAYER.height) < 0.5) {
                    // Player is on the tower
                    this.isGrounded = true;
                    this.position.y = towerHeight + CONFIG.PLAYER.height;
                }
            }
        }
    }
    
    checkStonePickups() {
        // Only check if player can pick up more stones
        if (this.heldStones.length >= CONFIG.STONE.maxHeld) return;
        
        // Check for nearby stones
        for (const stone of Game.stones) {
            // Skip stones that are held or not static
            if (stone.isHeld || !stone.isStatic) continue;
            
            // Calculate distance to stone
            const distance = this.position.distanceTo(stone.mesh.position);
            
            // If player is close enough to pick up
            if (distance < 2) {
                // Try to pick up stone
                if (this.pickupStone(stone)) {
                    // Notify network
                    Network.sendStonePickedUp(stone.id);
                    break;
                }
            }
        }
    }
} 
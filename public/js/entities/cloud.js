// Cloud entity with exact original cartoon-style appearance
class Cloud {
    constructor(id = null, position = new THREE.Vector3()) {
        this.id = id || generateId('cloud_');
        this.position = position.clone();
        this.mesh = null;
        this.speed = 0.5 + Math.random() * 1.5;
        this.direction = new THREE.Vector3(
            Math.random() * 2 - 1,
            0,
            Math.random() * 2 - 1
        ).normalize();
        
        this.createMesh();
    }
    
    createMesh() {
        // Load circle texture for cartoon-style clouds
        const textureLoader = new THREE.TextureLoader();
        const cloudTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/circle.png');
        
        // Create a group to hold all parts of the cloud
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);
        
        // Create cloud material with circle texture and additive blending for the outline effect
        const cloudMaterial = new THREE.MeshBasicMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,  // Use additive blending for the glow effect
            color: 0xffffff
        });
        
        // Create several circular planes to form a cloud
        const circleCount = 20 + Math.floor(Math.random() * 5);
        for (let i = 0; i < circleCount; i++) {
            const size = 8 + Math.random() * 8;
            const geometry = new THREE.PlaneGeometry(size, size);
            const circle = new THREE.Mesh(geometry, cloudMaterial);
            
            // Position randomly within cloud
            circle.position.set(
                (Math.random() * 2 - 1) * 10,
                (Math.random() * 2 - 1) * 1.5,
                (Math.random() * 2 - 1) * 3
            );
            
            // Random rotation
            circle.rotation.z = Math.random() * Math.PI;

            // Add
            this.mesh.add(circle);
        }
        
        // Store reference to this cloud in the mesh
        this.mesh.userData.cloud = this;
        return this.mesh;
    }
    
    update(deltaTime) {
        // Move cloud
        this.position.x += this.direction.x * this.speed * deltaTime;
        this.position.z += this.direction.z * this.speed * deltaTime;
        
        // Update mesh position
        this.mesh.position.copy(this.position);
        
        // Make cloud circles face the camera (billboarding)
        if (Game.camera) {
            for (const child of this.mesh.children) {
                child.lookAt(Game.camera.position);
            }
        }
        
        // Check world boundaries
        const worldSize = CONFIG.WORLD.size / 2;
        let bounced = false;
        if (this.position.x > worldSize) {
            this.direction.x = -Math.abs(this.direction.x);
            bounced = true;
        } else if (this.position.x < -worldSize) {
            this.direction.x = Math.abs(this.direction.x);
            bounced = true;
        }
        if (this.position.z > worldSize) {
            this.direction.z = -Math.abs(this.direction.z);
            bounced = true;
        } else if (this.position.z < -worldSize) {
            this.direction.z = Math.abs(this.direction.z);
            bounced = true;
        }
        
        // If bounced, slightly change direction
        if (bounced) {
            this.direction.x += (Math.random() * 0.2 - 0.1);
            this.direction.z += (Math.random() * 0.2 - 0.1);
            this.direction.normalize();
        }
        
        // Check for tower destruction
        this.checkTowerDestruction();
    }
    
    checkTowerDestruction() {
        // Get local player
        const player = Game.localPlayer;
        if (!player) return;
        
        // Check if player is on a tower
        let playerTower = null;
        let playerTowerIndex = -1;
        
        for (let i = 0; i < Game.towers.length; i++) {
            const tower = Game.towers[i];
            const horizontalDistance = new THREE.Vector2(
                player.position.x - tower.position.x,
                player.position.z - tower.position.z
            ).length();
            
            if (horizontalDistance < CONFIG.TOWER.baseRadius) {
                playerTower = tower;
                playerTowerIndex = i;
                break;
            }
        }
        
        // If player is on a tower and close to cloud
        if (playerTower) {
            const distanceToCloud = player.position.distanceTo(this.position);
            
            // If player is close enough to the cloud
            if (distanceToCloud < 15) {
                // Destroy the tower
                Game.destroyTower(playerTowerIndex);
            }
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
            direction: {
                x: this.direction.x,
                y: this.direction.y,
                z: this.direction.z
            },
            speed: this.speed
        };
    }
    
    static fromJSON(data) {
        const position = new THREE.Vector3(
            data.position.x,
            data.position.y,
            data.position.z
        );
        
        const cloud = new Cloud(data.id, position);
        
        cloud.direction.set(
            data.direction.x,
            data.direction.y,
            data.direction.z
        );
        
        cloud.speed = data.speed;
        
        return cloud;
    }
} 
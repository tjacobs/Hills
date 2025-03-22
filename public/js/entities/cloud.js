// Cloud entity
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
        // Create a group to hold all parts of the cloud
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);
        
        // Create cloud material
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8
        });
        
        // Create several spheres to form a cloud
        const sphereCount = 5 + Math.floor(Math.random() * 5);
        
        for (let i = 0; i < sphereCount; i++) {
            const size = 2 + Math.random() * 3;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const sphere = new THREE.Mesh(geometry, cloudMaterial);
            
            // Position randomly within cloud
            sphere.position.set(
                (Math.random() * 2 - 1) * 3,
                (Math.random() * 2 - 1) * 1.5,
                (Math.random() * 2 - 1) * 3
            );
            
            this.mesh.add(sphere);
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
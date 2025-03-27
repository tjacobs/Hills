// Cloud
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
            blending: THREE.AdditiveBlending,
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
        // The server will handle position updates, we just sync mesh position
        this.mesh.position.copy(this.position);
        
        // Handle billboarding (make cloud circles face the camera)
        if (Game.camera) {
            for (const child of this.mesh.children) {
                child.lookAt(Game.camera.position);
            }
        }
        
        // Tower destruction is now handled on the server
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
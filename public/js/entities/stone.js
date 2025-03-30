// Static texture loader
const stoneTexture = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');

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

        // Create mesh with texture
        const geometry = new THREE.BoxGeometry(
            CONFIG.STONE.width,
            CONFIG.STONE.height,
            CONFIG.STONE.depth
        );
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
 
    // Update stone from server data
    updateFromData(data) {
        // Update position
        if (data.isHeld) console.log('Updating stone from data:', data);
        this.position.set(data.position.x, data.position.y, data.position.z);
        this.mesh.position.copy(this.position);
        
        // Update rotation
        if (data.rotation) {
            this.mesh.rotation.set(
                data.rotation.x,
                data.rotation.y,
                data.rotation.z
            );
        }

        // Update velocity
        this.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        this.isHeld = data.isHeld;
        this.heldBy = data.heldBy;
        this.isThrown = data.isThrown;
        this.isStatic = data.isStatic;
    }
}

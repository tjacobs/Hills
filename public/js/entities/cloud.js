// Cloud
class Cloud {
    constructor(id = null, position = new THREE.Vector3()) {
        this.id = id || generateId('cloud_');
        this.position = position.clone();
        this.direction = new THREE.Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1).normalize();
        this.speed = 0.5 + Math.random() * 1.5;
        this.mesh = null;
        
        // Animation state
        this.isAnimating = false;
        this.animationPhase = null; // 'moving', 'raining', 'flooding'
        this.targetTower = null;
        this.rainParticles = null;
        this.floodEffect = null;
        
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
        // The server handles position updates, we just sync mesh position
        this.mesh.position.copy(this.position);
        
        // Handle billboarding (make cloud circles face the camera)
        if (Game.camera) {
            for (const child of this.mesh.children) {
                child.lookAt(Game.camera.position);
            }
        }
        
        // Update animation effects if active
        if (this.isAnimating) {
            this.updateAnimationEffects(deltaTime);
        }
    }
    
    // New method for animation effects
    updateAnimationEffects(deltaTime) {
        if (!this.animationPhase) return;
        
        switch (this.animationPhase) {
            case 'raining':
                this.updateRainEffect(deltaTime);
                break;
            case 'flooding':
                this.updateFloodEffect(deltaTime);
                break;
        }
    }
    
    // Create rain particle effect
    createRainEffect() {
        if (this.rainParticles) this.removeRainEffect();
        
        // Create particle system for rain
        const particleCount = 500;
        const rainGeometry = new THREE.BufferGeometry();
        const rainMaterial = new THREE.PointsMaterial({
            color: 0x9999ff,
            size: 0.2,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        // Create particle positions
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        
        // Initialize particles in cloud shape
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            // Position within cloud (random distribution in cloud shape)
            const radius = 3 + Math.random() * 2;
            const angle = Math.random() * Math.PI * 2;
            positions[i3] = Math.cos(angle) * radius;
            positions[i3 + 1] = -Math.random() * 2; // Start slightly below cloud
            positions[i3 + 2] = Math.sin(angle) * radius;
            
            // Random downward velocity
            velocities[i3] = (Math.random() - 0.5) * 0.3;
            velocities[i3 + 1] = -5 - Math.random() * 5; // Downward speed
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.3;
        }
        
        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        rainGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        
        // Create particle system
        this.rainParticles = new THREE.Points(rainGeometry, rainMaterial);
        this.rainParticles.userData.velocities = velocities;
        this.rainParticles.userData.initialPositions = positions.slice();
        
        // Position at cloud
        this.mesh.add(this.rainParticles);
    }
    
    // Update rain animation
    updateRainEffect(deltaTime) {
        if (!this.rainParticles) return;
        
        const positions = this.rainParticles.geometry.attributes.position.array;
        const velocities = this.rainParticles.userData.velocities;
        const initialPositions = this.rainParticles.userData.initialPositions;
        
        // Update each particle
        for (let i = 0; i < positions.length; i += 3) {
            // Apply velocity
            positions[i] += velocities[i] * deltaTime;
            positions[i + 1] += velocities[i + 1] * deltaTime;
            positions[i + 2] += velocities[i + 2] * deltaTime;
            
            // Reset particles that go too low
            if (positions[i + 1] < -20) {
                // Reset to initial position
                positions[i] = initialPositions[i] + (Math.random() - 0.5);
                positions[i + 1] = initialPositions[i + 1];
                positions[i + 2] = initialPositions[i + 2] + (Math.random() - 0.5);
            }
        }
        
        this.rainParticles.geometry.attributes.position.needsUpdate = true;
    }
    
    // Remove rain effect
    removeRainEffect() {
        if (this.rainParticles) {
            this.mesh.remove(this.rainParticles);
            this.rainParticles.geometry.dispose();
            this.rainParticles.material.dispose();
            this.rainParticles = null;
        }
    }
    
    // Create flood effect around tower
    createFloodEffect(tower) {
        if (this.floodEffect) this.removeFloodEffect();
        
        if (!tower || !tower.mesh) return;
        
        // Create expanding water circle
        const geometry = new THREE.CircleGeometry(1, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x3399ff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        
        this.floodEffect = new THREE.Mesh(geometry, material);
        this.floodEffect.rotation.x = -Math.PI / 2; // Make it horizontal
        
        // Position at tower base
        this.floodEffect.position.copy(tower.position);
        this.floodEffect.position.y += 0.1; // Slightly above ground
        
        // Add to scene
        Game.scene.add(this.floodEffect);
        
        // Store initial time for animation
        this.floodEffect.userData.startTime = Date.now();
        this.floodEffect.userData.duration = 2000; // 2 seconds
    }
    
    // Update flood animation
    updateFloodEffect(deltaTime) {
        if (!this.floodEffect) return;
        
        const now = Date.now();
        const elapsed = now - this.floodEffect.userData.startTime;
        const duration = this.floodEffect.userData.duration;
        const progress = Math.min(1.0, elapsed / duration);
        
        // Expand circle
        const targetRadius = 8;
        this.floodEffect.scale.set(progress * targetRadius, progress * targetRadius, 1);
        
        // Fade in then out
        let opacity = 0.6;
        if (progress < 0.3) {
            // Fade in
            opacity = progress * 2;
        } else if (progress > 0.7) {
            // Fade out
            opacity = 0.6 * (1 - ((progress - 0.7) / 0.3));
        }
        
        this.floodEffect.material.opacity = opacity;
        
        // Remove when done
        if (progress >= 1.0) {
            this.removeFloodEffect();
        }
    }
    
    // Remove flood effect
    removeFloodEffect() {
        if (this.floodEffect) {
            Game.scene.remove(this.floodEffect);
            this.floodEffect.geometry.dispose();
            this.floodEffect.material.dispose();
            this.floodEffect = null;
        }
    }
    
    // Start destruction animation
    startDestructionAnimation(phase, targetTowerId) {
        this.isAnimating = true;
        this.animationPhase = phase;
        
        // Find target tower
        if (targetTowerId) {
            this.targetTower = Game.getTowerById(targetTowerId);
        }
        
        // Set up effects based on phase
        if (phase === 'raining') {
            this.createRainEffect();
        } else if (phase === 'flooding' && this.targetTower) {
            this.createFloodEffect(this.targetTower);
            // Stop rain
            this.removeRainEffect();
        }
    }
    
    // Stop all animations
    stopAnimations() {
        this.isAnimating = false;
        this.animationPhase = null;
        this.targetTower = null;
        this.removeRainEffect();
        this.removeFloodEffect();
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
        const cloud = new Cloud(data.id, new THREE.Vector3(data.position.x, data.position.y, data.position.z));
        cloud.direction.set(data.direction.x, data.direction.y, data.direction.z);
        cloud.speed = data.speed;
        return cloud;
    }
} 
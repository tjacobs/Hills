// Main game class
const Game = {
    // Scene objects
    scene: null,
    camera: null,
    renderer: null,
    
    // Game entities
    localPlayer: null,
    players: {},
    towers: [],
    stones: [],
    clouds: [],
    
    // Game state
    isRunning: false,
    lastTime: 0,
    lastStoneSpawnTime: null,
    
    // Initialize game
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);
        
        // Setup lighting
        this.setupLighting();
        
        // Add fog for distance fade
        this.scene.fog = new THREE.Fog(0xffffff, 100, 500);
        
        // Create sky
        this.createSky();
        
        // Create ground
        this.createGround();
        
        // Create water
        this.createWater();
        
        // Create clouds
        this.createClouds();
        
        // Create local player
        this.localPlayer = new LocalPlayer();
        this.players[this.localPlayer.id] = this.localPlayer;
        
        // Set camera to player
        this.camera.position.copy(this.localPlayer.position);
        this.camera.position.y += CONFIG.PLAYER.height;
        this.localPlayer.camera = this.camera;
        
        // Initialize input
        Input.init();
        
        // Initialize network
        Network.init();
        
        // Initialize physics
        Physics.init();
        
        // Start game loop
        this.lastTime = performance.now();
        this.isRunning = true;
        this.update(this.lastTime);
        log(`Started game`, 'info');
    },
    
    // Handle window resize
    handleResize() {
        // Update camera aspect ratio
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },
    
    // Setup lighting
    setupLighting() {
        // Clear any existing lights
        this.scene.children = this.scene.children.filter(child => !(child instanceof THREE.Light));
        
        // Add ambient light to see the texture (matches original)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Add directional light for better visibility (matches original)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        
        // Configure shadow properties
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        
        this.scene.add(directionalLight);
        
        // Add a secondary directional light from another angle
        const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.3);
        secondaryLight.position.set(-5, 3, -5);
        this.scene.add(secondaryLight);
        
        // Enable shadows in the renderer
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    },
    
    // Create sky with gradient to match original
    createSky() {
        const vertexShader = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`;
        
        const fragmentShader = `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize(vWorldPosition + offset).y;
            gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }`;
        
        const uniforms = {
            topColor: { value: new THREE.Color(0x0077ff) },  // Light blue
            bottomColor: { value: new THREE.Color(0xffffff) },  // White
            offset: { value: 33 },
            exponent: { value: 0.6 }
        };
        
        const skyGeo = new THREE.SphereGeometry(400, 32, 15);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide
        });
        
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
    },
    
    // Create ground with hills and textures matching the original implementation
    createGround() {
        // Load textures first
        const textureLoader = new THREE.TextureLoader();
        const grassTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
        
        // Configure grass texture to repeat seamlessly across the terrain
        grassTexture.wrapS = THREE.RepeatWrapping; // Horizontal wrapping
        grassTexture.wrapT = THREE.RepeatWrapping; // Vertical wrapping
        
        // Create ground geometry with hills
        const groundSize = CONFIG.WORLD.size;
        const segments = 200; // Match original resolution
        const geometry = new THREE.PlaneGeometry(
            groundSize, 
            groundSize, 
            segments, 
            segments
        );
        
        // Generate heightmap for hills based on original code
        const vertices = geometry.attributes.position.array;
        const maxHeight = 5; // Maximum height of terrain hills
        const xs = 8; // X-scale factor for terrain undulation
        const ys = 8; // Y-scale factor for terrain undulation
        const shoreRadius = 0.9; // Percentage where beach/water transition occurs
        
        for (let i = 0; i <= segments; i++) {
            for (let j = 0; j <= segments; j++) {
                const index = (i * (segments + 1) + j) * 3;
                
                // Calculate normalized coordinates (-1 to 1)
                const nx = (i / segments) * 2 - 1;
                const ny = (j / segments) * 2 - 1;
                
                // Calculate distance from center (0 to 1)
                const distFromCenter = Math.max(Math.abs(nx), Math.abs(ny));
                
                // Create sharper edge falloff factor (1 in center, 0 at edges)
                const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, 3));
                
                // Apply height with edge falloff
                vertices[index + 2] = Math.sin(i / xs) * Math.sin(j / ys) * maxHeight * edgeFalloff;
            }
        }
        
        // Update normals for proper lighting
        geometry.computeVertexNormals();
        
        // Create custom shader material for ground with beach transition and texture
        const groundMaterial = new THREE.ShaderMaterial({
            uniforms: {
                grassTexture: { value: grassTexture },
                centerDistance: { value: shoreRadius },    // Distance from center where beach starts (0-1)
                transitionWidth: { value: 0.05 }   // Width of the beach transition
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec2 vPosition;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                
                void main() {
                    vUv = uv * 32.0; // Scale UV coordinates for smaller texture
                    vPosition = position.xy / ${groundSize.toFixed(1)}; // Normalize by size
                    
                    // Calculate view-space position and normal for lighting
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    vNormal = normalMatrix * normal;
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D grassTexture;
                uniform float centerDistance;
                uniform float transitionWidth;
                
                varying vec2 vUv;
                varying vec2 vPosition;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                
                void main() {
                    vec4 grassColor = texture2D(grassTexture, vUv);
                    vec4 sandColor = vec4(0.76, 0.70, 0.50, 1.0); // Sandy color
                    
                    // Calculate distance from center (0-1)
                    float distFromCenter = max(abs(vPosition.x), abs(vPosition.y)) * 2.0;
                    
                    // Create smooth transition at the edges
                    float blend = smoothstep(centerDistance, centerDistance + transitionWidth, distFromCenter);
                    
                    // Mix grass and sand colors
                    vec4 baseColor = mix(grassColor, sandColor, blend);
                    
                    // Basic lighting calculation
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(vViewPosition);
                    
                    // Ambient light
                    float ambientStrength = 0.3;
                    vec3 ambient = ambientStrength * vec3(1.0);
                    
                    // Diffuse light (sun-like)
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(normal, lightDir), 0.0);
                    vec3 diffuse = diff * vec3(1.0);
                    
                    // Combine lighting
                    vec3 lighting = ambient + diffuse;
                    
                    gl_FragColor = vec4(baseColor.rgb * lighting, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });
        
        // Create ground mesh
        const ground = new THREE.Mesh(geometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        ground.receiveShadow = true;
        
        // Store ground for height calculations
        this.ground = ground;
        
        // Create heightmap for efficient height lookups
        this.createHeightmap(vertices, segments);
        
        // Add to scene
        this.scene.add(ground);
        
        // Create water
        this.createWater();
    },
    
    // Create water plane
    createWater() {
        const borderSize = CONFIG.WORLD.size * 10;
        const borderGeometry = new THREE.PlaneGeometry(borderSize, borderSize);
        const borderMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x5588ff,  // Vibrant blue color for water
            side: THREE.DoubleSide,
            metalness: 0.2,   // High metalness for water shine
            roughness: 0.1,   // Low roughness for water shine
            transparent: true,
            opacity: 0.9      // Slight transparency
        });
        
        const water = new THREE.Mesh(borderGeometry, borderMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -6; // Position below the terrain
        
        this.scene.add(water);
    },
    
    // Create heightmap for efficient height lookups
    createHeightmap(vertices, segments) {
        this.heightMap = [];
        
        for (let i = 0; i <= segments; i++) {
            this.heightMap[i] = [];
            for (let j = 0; j <= segments; j++) {
                const index = (i * (segments + 1) + j) * 3;
                this.heightMap[i][j] = vertices[index + 2];
            }
        }
        
        this.segments = segments;
        this.groundSize = CONFIG.WORLD.size;
    },
    
    // Create clouds
    createClouds() {
        // Create some clouds
        for (let i = 0; i < 10; i++) {
            // Create cloud
            const position = new THREE.Vector3(
                (Math.random() * 2 - 1) * CONFIG.WORLD.size / 2,
                CONFIG.WORLD.cloudHeight + (Math.random() * 10 - 5),
                (Math.random() * 2 - 1) * CONFIG.WORLD.size / 2
            );
            
            const cloud = new Cloud(null, position);
            
            // Add to game
            this.addCloud(cloud);
        }
    },
    
    // Update game
    update(time) {
        if (!this.isRunning) return;
        
        // Calculate delta time
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;
        
        // Cap delta time to prevent large jumps
        const cappedDeltaTime = Math.min(deltaTime, 0.1);
        
        // Update game state
        this.updateGameState(cappedDeltaTime);
        
        // Update entities
        this.updateEntities(cappedDeltaTime);
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
        
        // Request next frame
        requestAnimationFrame(this.update.bind(this));
    },
    
    // Update game state
    updateGameState(deltaTime) {
        // Update water
        this.updateWater(deltaTime);
        
        // Spawn stones from ocean - one per second
        if (!this.lastStoneSpawnTime) {
            this.lastStoneSpawnTime = performance.now();
        }
        
        const now = performance.now();
        const timeSinceLastSpawn = now - this.lastStoneSpawnTime;
        
        if (timeSinceLastSpawn > 1000 && this.stones.length < CONFIG.STONE.maxCount) {
            this.spawnStoneFromOcean();
            this.lastStoneSpawnTime = now;
        }        
    },
    
    // Update entities
    updateEntities(deltaTime) {
        // Update local player
        if (this.localPlayer) {
            this.localPlayer.update(deltaTime);

            // Send network update
            Network.sendPlayerUpdate();
        }
        
        // Update remote players
        for (const id in this.players) {
            if (id !== this.localPlayer.id) {
                this.players[id].update(deltaTime);
            }
        }
        
        // Update stones
        for (let i = this.stones.length - 1; i >= 0; i--) {
            this.stones[i].update(deltaTime);
        }
        
        // Update towers
        for (let i = this.towers.length - 1; i >= 0; i--) {
            //this.towers[i].update(deltaTime);
        }
        
        // Update clouds
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            this.clouds[i].update(deltaTime);
        }
    },
    
    // Add stone to game
    addStone(stone) {
        this.stones.push(stone);
        return stone;
    },
    
    // Remove stone from game
    removeStone(stone) {
        const index = this.stones.indexOf(stone);
        if (index !== -1) {
            this.stones.splice(index, 1);
            
            // Remove from scene if it has a mesh
            if (stone.mesh) {
                if (stone.mesh.parent) {
                    stone.mesh.parent.remove(stone.mesh);
                }
                // Dispose of geometry and material to prevent memory leaks
                if (stone.mesh.geometry) stone.mesh.geometry.dispose();
                if (stone.mesh.material) {
                    if (Array.isArray(stone.mesh.material)) {
                        stone.mesh.material.forEach(material => material.dispose());
                    } else {
                        stone.mesh.material.dispose();
                    }
                }
            }
        }
    },
    
    // Clear all stones
    clearStones() {
        // Remove all stones from scene
        for (const stone of this.stones) {
            this.scene.remove(stone.mesh);
        }
        
        // Clear stones array
        this.stones.length = 0;
    },
    
    // Get stone by ID
    getStoneById(id) {
        return this.stones.find(stone => stone.id === id);
    },
    
    // Add tower to game
    addTower(tower, notifyNetwork = true) {
        this.towers.push(tower);
        updateUI();  // Update UI when tower is added
        
        // Log tower addition
        if (tower.createdBy) {
            const creatorName = tower.createdBy === this.localPlayer.id ? 
                'You' : 
                (this.players[tower.createdBy]?.username || 'Another player');
            
            log(`${creatorName} created a level ${tower.level} tower!`, 'info');
        } else {
            log(`A level ${tower.level} tower was created!`, 'info');
        }
        
        // Notify network if needed
        if (notifyNetwork) {
            Network.sendTowerCreated(tower);
        }
        
        return tower;
    },
    
    // Remove tower from game
    removeTower(tower) {
        // Remove from scene
        this.scene.remove(tower.mesh);
        
        // Remove from towers array
        const index = this.towers.indexOf(tower);
        
        if (index !== -1) {
            this.towers.splice(index, 1);
        }
        
        updateUI();  // Update UI when tower is removed
    },
    
    // Destroy tower at index
    destroyTower(index, notify = true) {
        // Check if index is valid
        if (index < 0 || index >= this.towers.length) {
            return;
        }
        
        // Get tower
        const tower = this.towers[index];
        
        // Create explosion effect
        this.createExplosionEffect(tower.position);
        
        // Remove tower
        this.removeTower(tower);
        
        // Notify network if requested
        if (notify && Network.isConnected) {
            Network.sendTowerDestroyed(index);
        }
    },
    
    // Clear all towers
    clearTowers() {
        // Remove all towers from scene
        for (const tower of this.towers) {
            this.scene.remove(tower.mesh);
        }
        
        // Clear towers array
        this.towers.length = 0;
        
        // Update UI
        updateUI();
    },
    
    // Add cloud to game
    addCloud(cloud) {
        // Add to clouds array
        this.clouds.push(cloud);
        
        // Add to scene
        this.scene.add(cloud.mesh);
        
        return cloud;
    },
    
    // Remove cloud from game
    removeCloud(cloud) {
        // Remove from scene
        this.scene.remove(cloud.mesh);
        
        // Remove from clouds array
        const index = this.clouds.indexOf(cloud);
        
        if (index !== -1) {
            this.clouds.splice(index, 1);
        }
    },
    
    // Clear all clouds
    clearClouds() {
        // Remove all clouds from scene
        for (const cloud of this.clouds) {
            this.scene.remove(cloud.mesh);
        }
        
        // Clear clouds array
        this.clouds.length = 0;
    },
    
    // Update remote player
    updateRemotePlayer(data) {
        // Check if player exists
        if (this.players[data.id]) {
            // Update existing player
            this.players[data.id].updateFromData(data);
        } else {
            // Create new player
            const player = new Player(data.id, data.username);
            player.updateFromData(data);
            
            // Add to players
            this.players[data.id] = player;
            
            // Add to scene
            this.scene.add(player.mesh);
            
            // Update UI
            updateUI();
        }
    },
    
    // Remove remote player
    removeRemotePlayer(id) {
        // Check if player exists
        if (this.players[id]) {
            // Remove from scene
            this.scene.remove(this.players[id].mesh);
            
            // Remove from players
            delete this.players[id];
            
            // Update UI
            updateUI();
        }
    },
    
    // Get player by ID
    getPlayerById(id) {
        return this.players[id];
    },
    
    // Create explosion effect
    createExplosionEffect(position) {
        // Create particle system for explosion
        const particleCount = 100;
        const particles = new THREE.BufferGeometry();
        
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        const color = new THREE.Color();
        
        for (let i = 0; i < particleCount; i++) {
            // Random position within sphere
            const radius = 2 + Math.random() * 2;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            
            positions[i * 3] = position.x + radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = position.y + radius * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = position.z + radius * Math.cos(phi);
            
            // Random color (orange to red)
            color.setHSL(0.05 + Math.random() * 0.05, 1.0, 0.5 + Math.random() * 0.3);
            
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            // Random size
            sizes[i] = 0.5 + Math.random() * 0.5;
        }
        
        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        // Create material
        const material = new THREE.PointsMaterial({
            size: 1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        // Create particle system
        const particleSystem = new THREE.Points(particles, material);
        
        // Add to scene
        this.scene.add(particleSystem);
        
        // Animate explosion
        const startTime = performance.now();
        const duration = 1000; // 1 second
        
        const animateExplosion = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Scale particles outward
            for (let i = 0; i < particleCount; i++) {
                const px = positions[i * 3];
                const py = positions[i * 3 + 1];
                const pz = positions[i * 3 + 2];
                
                const dx = px - position.x;
                const dy = py - position.y;
                const dz = pz - position.z;
                
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const direction = new THREE.Vector3(dx, dy, dz).normalize();
                
                positions[i * 3] = position.x + direction.x * distance * (1 + progress * 2);
                positions[i * 3 + 1] = position.y + direction.y * distance * (1 + progress * 2);
                positions[i * 3 + 2] = position.z + direction.z * distance * (1 + progress * 2);
            }
            
            // Update opacity
            material.opacity = 0.8 * (1 - progress);
            
            // Update particle positions
            particles.attributes.position.needsUpdate = true;
            
            // Continue animation if not complete
            if (progress < 1) {
                requestAnimationFrame(animateExplosion);
            } else {
                // Remove from scene
                this.scene.remove(particleSystem);
            }
        };
        
        // Start animation
        requestAnimationFrame(animateExplosion);
    },
    
    // Get height at position using the heightmap
    getHeightAtPosition(x, z) {
        if (!this.heightMap) return 0;
        
        // Convert world coordinates to heightmap indices
        const halfSize = this.groundSize / 2;
        const normalizedX = (x + halfSize) / this.groundSize;
        const normalizedZ = (z + halfSize) / this.groundSize;
        
        // Calculate grid indices
        const gridX = Math.floor(normalizedX * this.segments);
        const gridZ = Math.floor(normalizedZ * this.segments);
        
        // Ensure indices are within bounds
        if (gridX < 0 || gridX >= this.segments || 
            gridZ < 0 || gridZ >= this.segments) {
            return 0;
        }
        
        // Get heights at the four corners of the grid cell
        const h00 = this.heightMap[gridX][gridZ];
        const h10 = this.heightMap[Math.min(gridX + 1, this.segments)][gridZ];
        const h01 = this.heightMap[gridX][Math.min(gridZ + 1, this.segments)];
        const h11 = this.heightMap[Math.min(gridX + 1, this.segments)][Math.min(gridZ + 1, this.segments)];
        
        // Calculate fractional position within the grid cell
        const fx = normalizedX * this.segments - gridX;
        const fz = normalizedZ * this.segments - gridZ;
        
        // Bilinear interpolation
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        const height = h0 * (1 - fz) + h1 * fz;
        
        return height;
    },
    
    // Update stone spawning with even slower movement
    spawnStoneFromOcean() {
        // Choose a random side of the island
        const side = Math.floor(Math.random() * 4);
        
        // Calculate spawn position on the edge of the water
        const worldHalfSize = CONFIG.WORLD.size / 2;
        const spawnDistance = worldHalfSize * 1.2; // Spawn further out
        
        let spawnX, spawnZ;
        
        switch (side) {
            case 0: // North
                spawnX = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                spawnZ = -spawnDistance;
                break;
            case 1: // East
                spawnX = spawnDistance;
                spawnZ = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                break;
            case 2: // South
                spawnX = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                spawnZ = spawnDistance;
                break;
            case 3: // West
                spawnX = -spawnDistance;
                spawnZ = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                break;
        }
        
        // Create stone
        const stone = new Stone();
        stone.mesh.position.set(spawnX, 0, spawnZ);
        
        // Calculate direction toward island center
        const directionToCenter = new THREE.Vector3(-spawnX, 0, -spawnZ).normalize();
        
        // Incoming!
        const horizontalSpeed = 0.5;
        const verticalSpeed = 0.6;
        
        // Set velocity components
        stone.velocity.x = directionToCenter.x * horizontalSpeed;
        stone.velocity.z = directionToCenter.z * horizontalSpeed;
        stone.velocity.y = verticalSpeed;
        
        // Add to game
        this.addStone(stone);
        
        // Create splash effect
        this.createSplashEffect(stone.mesh.position.clone());
        
        return stone;
    },
    
    // Add splash effect method
    createSplashEffect(position) {
        // Create particle system for splash
        const particleCount = 30;
        const particleGeometry = new THREE.BufferGeometry();
        const particleMaterial = new THREE.PointsMaterial({
            color: 0x5588ff,
            size: 0.8,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        // Create particle positions
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        
        for (let i = 0; i < particleCount; i++) {
            // Random position around the splash center
            positions[i * 3] = position.x + (Math.random() * 2 - 1) * 0.5;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z + (Math.random() * 2 - 1) * 0.5;
            
            // Random velocity upward and outward
            velocities.push(new THREE.Vector3(
                (Math.random() * 2 - 1) * 0.1,
                0.1 + Math.random() * 0.2,
                (Math.random() * 2 - 1) * 0.1
            ));
        }
        
        // Set geometry attributes
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Create particle system
        const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
        
        // Add to scene
        this.scene.add(particleSystem);
        
        // Animate splash
        const startTime = performance.now();
        const duration = 1000; // 1 second
        
        const animateSplash = (time) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Update particle positions
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += velocities[i].x;
                positions[i * 3 + 1] += velocities[i].y;
                positions[i * 3 + 2] += velocities[i].z;
                
                // Add gravity
                velocities[i].y -= 0.01;
            }
            
            // Update opacity
            particleMaterial.opacity = 0.8 * (1 - progress);
            
            // Update particle positions
            particleGeometry.attributes.position.needsUpdate = true;
            
            // Continue animation if not complete
            if (progress < 1) {
                requestAnimationFrame(animateSplash);
            } else {
                // Remove from scene
                this.scene.remove(particleSystem);
            }
        };
        
        // Start animation
        requestAnimationFrame(animateSplash);
    },
    
    // Add missing updateWater method
    updateWater(deltaTime) {
        // Simple water animation - update water material time
        if (this.waterMaterial) {
            // Update water time uniform if it exists
            if (this.waterMaterial.uniforms && this.waterMaterial.uniforms.time) {
                this.waterMaterial.uniforms.time.value += deltaTime;
            }
        }
    },
    
    // Add missing findNearbyStonesForTower method
    findNearbyStonesForTower(stone) {
        const result = [stone];
        const maxDistance = 3; // Maximum distance between stones to form a tower
        
        for (const otherStone of this.stones) {
            // Skip if same stone or not static
            if (otherStone === stone || !otherStone.isStatic) continue;
            
            // Check distance
            const distance = stone.mesh.position.distanceTo(otherStone.mesh.position);
            if (distance < maxDistance) {
                result.push(otherStone);
            }
        }
        
        return result;
    },

    // Player management
    addPlayer(player) {
        console.log('Adding player:', player.id);
        this.players[player.id] = player;
        
        // Add player mesh to scene if it exists
        if (player.mesh) {
            this.scene.add(player.mesh);
        }
    },

    removePlayer(playerId) {
        const player = this.players[playerId];
        if (player) {
            console.log('Removing player:', playerId);
            // Remove mesh from scene
            if (player.mesh && player.mesh.parent) {
                player.mesh.parent.remove(player.mesh);
            }
            // Clean up player resources
            player.remove();
            // Remove from players object
            delete this.players[playerId];
        }
    }
};

// Initialize game when page loads
window.addEventListener('load', () => {
    Game.init();
}); 
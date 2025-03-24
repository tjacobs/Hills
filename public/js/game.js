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
        
        // Add window resize listener
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Start game loop
        this.lastTime = performance.now();
        this.isRunning = true;
        this.update(this.lastTime);
        //log(`Started game`, 'info');
        
        // Update UI after player is created
        updateUI();
    },
    
    // Handle window resize
    handleResize() {
        // Update camera
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
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
    
    // Create sky with gradient
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
    
    // Create ground with hills
    createGround() {
        // Load textures first
        const textureLoader = new THREE.TextureLoader();
        const grassTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
        
        // Configure grass texture to repeat seamlessly across the terrain
        grassTexture.wrapS = THREE.RepeatWrapping; // Horizontal wrapping
        grassTexture.wrapT = THREE.RepeatWrapping; // Vertical wrapping
        
        // Create ground geometry with hills
        const groundSize = CONFIG.WORLD.size;
        const segments = 200;
        const geometry = new THREE.PlaneGeometry(
            groundSize, 
            groundSize, 
            segments, 
            segments
        );
        
        // Generate heightmap for hills
        const vertices = geometry.attributes.position.array;
        const maxHeight = CONFIG.WORLD.maxTerrainHeight;
        const xs = CONFIG.WORLD.terrainXScale;
        const ys = CONFIG.WORLD.terrainYScale;
        const shoreRadius = CONFIG.WORLD.shoreRadius;
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
                centerDistance: { value: shoreRadius },
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
        // Don't update if game is not running
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
/*        // Spawn stones from ocean - one per second
        if (!this.lastStoneSpawnTime) {
            this.lastStoneSpawnTime = performance.now();
        }
        
        const now = performance.now();
        const timeSinceLastSpawn = now - this.lastStoneSpawnTime;
        
        // Spawn stones from ocean - one per second
        if (timeSinceLastSpawn > 1000 && this.stones.length < 100) {
            this.spawnStoneFromOcean();
            this.lastStoneSpawnTime = now;
        }  
            */      
    },
    
    // Update entities
    updateEntities(deltaTime) {
        // Update physics
        Physics.update(deltaTime);
        
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
    },
    
    // Add stone to game
    addStone(stone) {
        if (!this.stones.includes(stone)) {
            this.stones.push(stone);
            this.scene.add(stone.mesh);
            updateUI(); // Update counts immediately
        }
    },
    
    // Remove stone from game
    removeStone(stone) {
        const index = this.stones.indexOf(stone);
        if (index > -1) {
            this.stones.splice(index, 1);
            if (stone.mesh && stone.mesh.parent) {
                stone.mesh.parent.remove(stone.mesh);
            }
            updateUI(); // Update counts immediately
        }
    },

    // Get stone by ID
    getStoneById(id) {
        return this.stones.find(stone => stone.id === id);
    },
    
    // Add tower to game
    addTower(tower, notifyNetwork = true) {
        if (!this.towers.includes(tower)) {
            this.towers.push(tower);
            this.scene.add(tower.mesh);
            updateUI(); // Update counts immediately
            
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
        }
        return tower;
    },

    // Destroy tower at index
    destroyTower(index, notify = true) {
        // Check if index is valid
        if (index < 0 || index >= this.towers.length) {
            return;
        }
        
        // Get tower
        const tower = this.towers[index];
        
        // Remove tower
        this.scene.remove(tower.mesh);
        
        // Remove from towers array
        if (index !== -1) {
            this.towers.splice(index, 1);
        }
        
        // Update UI when tower is removed
        updateUI(); 

        // Notify network if requested
        if (notify && Network.isConnected) {
            Network.sendTowerDestroyed(index);
        }
    },
    
    // Add cloud to game
    addCloud(cloud) {
        // Add to clouds array
        this.clouds.push(cloud);
        
        // Add to scene
        this.scene.add(cloud.mesh);
        return cloud;
    },

    // Get player by ID
    getPlayerById(id) {
        return this.players[id];
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
    
    // Add splash effect
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
        const player = this.getPlayerById(playerId);
        if (!player) return;

        // Remove player mesh from scene
        if (player.mesh) {
            this.scene.remove(player.mesh);
            player.remove();
        }

        // Remove from players object
        delete this.players[playerId];
        
        console.log(`Removed player: ${playerId}`);
    },

    // Add this method to the Game object
    getTowerById(id) {
        return this.towers.find(tower => tower.id === id);
    },

    removeTower(tower) {
        const index = this.towers.indexOf(tower);
        if (index > -1) {
            this.towers.splice(index, 1);
            if (tower.mesh && tower.mesh.parent) {
                tower.mesh.parent.remove(tower.mesh);
            }
            updateUI(); // Update counts immediately
        }
    }
};

// Initialize game when page loads
window.addEventListener('load', () => {
    Game.init();
});

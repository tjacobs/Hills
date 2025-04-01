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
    
    // Portal objects
    startPortal: null,
    exitPortal: null,
    startPortalBox: null,
    exitPortalBox: null,
    
    // Game state
    isRunning: false,
    lastTime: 0,
    
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
        
        // Create portals if needed
        if (new URLSearchParams(window.location.search).get('portal')) {
            this.createStartPortal();
        }
        this.createExitPortal();
        
        // Create local player
        this.localPlayer = new LocalPlayer();
        this.players[this.localPlayer.id] = this.localPlayer;
        
        // Set camera to player
        this.camera.position.copy(this.localPlayer.position);
        this.localPlayer.camera = this.camera;
        
        // Initialize input
        Input.init();
        
        // Initialize network
        Network.init();
        
        // Add window resize listener
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Start game loop
        this.lastTime = performance.now();
        this.isRunning = true;
        this.update(this.lastTime);
        
        // Update UI after player is created
        updateUI();

        // Initialize sounds
        initSounds();
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
                const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, CONFIG.WORLD.edgeFalloff));
                
                // Apply height with edge falloff and ensure minimum height
                vertices[index + 2] = Math.max(CONFIG.WORLD.minTerrainHeight, Math.sin(i / xs) * Math.sin(j / ys) * maxHeight * edgeFalloff);
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
                // Get height directly from the vertex array
                const index = (i * (segments + 1) + j) * 3;
                // The height is stored in the Z component (index + 2)
                this.heightMap[i][j] = vertices[index + 2];
            }
        }
        this.segments = segments;
        this.groundSize = CONFIG.WORLD.size;
    },
    
    // Create clouds (modified to not actually create any - they'll come from server)
    createClouds() {
        // Clouds will be created on the server and sent to the client
        this.clouds = [];
    },
    
    // Create start portal for incoming players
    createStartPortal() {
        // Create portal group to contain all portal elements
        const startPortalGroup = new THREE.Group();
        startPortalGroup.position.set(0, 2, 0); // Position near spawn point
        startPortalGroup.rotation.x = 0.35;
        startPortalGroup.rotation.y = 0;

        // Create portal effect
        const startPortalGeometry = new THREE.TorusGeometry(15, 2, 16, 100);
        const startPortalMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            transparent: true,
            opacity: 0.8
        });
        const startPortal = new THREE.Mesh(startPortalGeometry, startPortalMaterial);
        startPortalGroup.add(startPortal);
                        
        // Create portal inner surface
        const startPortalInnerGeometry = new THREE.CircleGeometry(13, 32);
        const startPortalInnerMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const startPortalInner = new THREE.Mesh(startPortalInnerGeometry, startPortalInnerMaterial);
        startPortalGroup.add(startPortalInner);

        // Create particle system for portal effect
        const startPortalParticleCount = 1000;
        const startPortalParticles = new THREE.BufferGeometry();
        const startPortalPositions = new Float32Array(startPortalParticleCount * 3);
        const startPortalColors = new Float32Array(startPortalParticleCount * 3);

        for (let i = 0; i < startPortalParticleCount * 3; i += 3) {
            // Create particles in a ring around the portal
            const angle = Math.random() * Math.PI * 2;
            const radius = 15 + (Math.random() - 0.5) * 4;
            startPortalPositions[i] = Math.cos(angle) * radius;
            startPortalPositions[i + 1] = Math.sin(angle) * radius;
            startPortalPositions[i + 2] = (Math.random() - 0.5) * 4;

            // Red color with slight variation
            startPortalColors[i] = 0.8 + Math.random() * 0.2;
            startPortalColors[i + 1] = 0;
            startPortalColors[i + 2] = 0;
        }

        startPortalParticles.setAttribute('position', new THREE.BufferAttribute(startPortalPositions, 3));
        startPortalParticles.setAttribute('color', new THREE.BufferAttribute(startPortalColors, 3));

        const startPortalParticleMaterial = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.6
        });

        const startPortalParticleSystem = new THREE.Points(startPortalParticles, startPortalParticleMaterial);
        startPortalGroup.add(startPortalParticleSystem);

        // Add portal group to scene
        this.scene.add(startPortalGroup);

        // Create portal collision box
        this.startPortalBox = new THREE.Box3().setFromObject(startPortalGroup);
        this.startPortal = startPortalGroup;

        // Animate particles and portal
        function animateStartPortal() {
            const positions = startPortalParticles.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
            }
            startPortalParticles.attributes.position.needsUpdate = true;
            if (startPortalInnerMaterial.uniforms && startPortalInnerMaterial.uniforms.time) {
                startPortalInnerMaterial.uniforms.time.value = Date.now() * 0.001;
            }
            requestAnimationFrame(animateStartPortal);
        }
        animateStartPortal();
    },

    // Create exit portal for players to leave
    createExitPortal() {
        // Create portal group to contain all portal elements
        const exitPortalGroup = new THREE.Group();
        exitPortalGroup.position.set(-200, 200, -300); // Position at edge of world
        exitPortalGroup.rotation.x = 0.35;
        exitPortalGroup.rotation.y = 0;

        // Create portal effect
        const exitPortalGeometry = new THREE.TorusGeometry(15, 2, 16, 100);
        const exitPortalMaterial = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            emissive: 0x00ff00,
            transparent: true,
            opacity: 0.8
        });
        const exitPortal = new THREE.Mesh(exitPortalGeometry, exitPortalMaterial);
        exitPortalGroup.add(exitPortal);

        // Create portal inner surface
        const exitPortalInnerGeometry = new THREE.CircleGeometry(13, 32);
        const exitPortalInnerMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const exitPortalInner = new THREE.Mesh(exitPortalInnerGeometry, exitPortalInnerMaterial);
        exitPortalGroup.add(exitPortalInner);
        
        // Add portal label
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 64;
        context.fillStyle = '#00ff00';
        context.font = 'bold 32px Arial';
        context.textAlign = 'center';
        context.fillText('VIBEVERSE PORTAL', canvas.width/2, canvas.height/2);
        const texture = new THREE.CanvasTexture(canvas);
        const labelGeometry = new THREE.PlaneGeometry(30, 5);
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        label.position.y = 20;
        exitPortalGroup.add(label);

        // Create particle system for portal effect
        const exitPortalParticleCount = 1000;
        const exitPortalParticles = new THREE.BufferGeometry();
        const exitPortalPositions = new Float32Array(exitPortalParticleCount * 3);
        const exitPortalColors = new Float32Array(exitPortalParticleCount * 3);

        for (let i = 0; i < exitPortalParticleCount * 3; i += 3) {
            // Create particles in a ring around the portal
            const angle = Math.random() * Math.PI * 2;
            const radius = 15 + (Math.random() - 0.5) * 4;
            exitPortalPositions[i] = Math.cos(angle) * radius;
            exitPortalPositions[i + 1] = Math.sin(angle) * radius;
            exitPortalPositions[i + 2] = (Math.random() - 0.5) * 4;

            // Green color with slight variation
            exitPortalColors[i] = 0;
            exitPortalColors[i + 1] = 0.8 + Math.random() * 0.2;
            exitPortalColors[i + 2] = 0;
        }

        exitPortalParticles.setAttribute('position', new THREE.BufferAttribute(exitPortalPositions, 3));
        exitPortalParticles.setAttribute('color', new THREE.BufferAttribute(exitPortalColors, 3));

        const exitPortalParticleMaterial = new THREE.PointsMaterial({
            size: 0.2,
            vertexColors: true,
            transparent: true,
            opacity: 0.6
        });

        const exitPortalParticleSystem = new THREE.Points(exitPortalParticles, exitPortalParticleMaterial);
        exitPortalGroup.add(exitPortalParticleSystem);

        // Add portal group to scene
        this.scene.add(exitPortalGroup);

        // Create portal collision box
        this.exitPortalBox = new THREE.Box3().setFromObject(exitPortalGroup);
        this.exitPortal = exitPortalGroup;

        // Animate particles and portal
        function animateExitPortal() {
            const positions = exitPortalParticles.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += 0.05 * Math.sin(Date.now() * 0.001 + i);
            }
            exitPortalParticles.attributes.position.needsUpdate = true;
            if (exitPortalInnerMaterial.uniforms && exitPortalInnerMaterial.uniforms.time) {
                exitPortalInnerMaterial.uniforms.time.value = Date.now() * 0.001;
            }
            requestAnimationFrame(animateExitPortal);
        }
        animateExitPortal();
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

        // Update visual effects
        this.updateEffects(cappedDeltaTime);

        // Check portal collisions
        this.checkPortalCollisions();

        // Render scene
        this.renderer.render(this.scene, this.camera);

        // Request next frame
        requestAnimationFrame(this.update.bind(this));
    },
    
    // Update game state
    updateGameState(deltaTime) {
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
        
        // Update clouds
        for (const cloud of this.clouds) {
            cloud.update(deltaTime);
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
        }
        return tower;
    },

    // Destroy tower at index
    destroyTower(index, notify = true) {
        // Check if index is valid
        if (index < 0 || index >= this.towers.length) {
            log(`Invalid tower index: ${index}`, 'error');
            return;
        }
        
        // Get tower
        const tower = this.towers[index];
        
        // Remove tower
        this.scene.remove(tower.mesh);
        log(`Tower at index ${index} removed from scene`, 'info');
        
        // Remove from towers array
        if (index !== -1) {
            this.towers.splice(index, 1);
            log(`Tower at index ${index} removed from towers array`, 'info');
        }
        
        // Update UI when tower is removed
        updateUI(); 
        log(`UI updated after tower removal`, 'info');
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
        const normalizedX = (z + halfSize) / this.groundSize;
        const normalizedZ = (x + halfSize) / this.groundSize;
        
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
        
        // Return height
        return height;
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
    },

    clearAllStones() {
        // Remove all stone meshes from the scene and dispose of resources
        this.stones.forEach(stone => {
            if (stone.mesh) {
                // Remove from scene
                this.scene.remove(stone.mesh);
                
                // Dispose of geometry and materials
                if (stone.mesh.geometry) stone.mesh.geometry.dispose();
                if (stone.mesh.material) {
                    if (Array.isArray(stone.mesh.material)) {
                        stone.mesh.material.forEach(material => material.dispose());
                    } else {
                        stone.mesh.material.dispose();
                    }
                }
            }
        });
        
        // Clear the stones array
        this.stones = [];
        
        // Update UI to reflect zero stones
        updateUI();
    },

    // Add to Game object
    activeEffects: [],

    // Add the updateEffects method to your Game object
    updateEffects(deltaTime) {
        // Update active effects and remove completed ones
        if (this.activeEffects) {
            for (let i = this.activeEffects.length - 1; i >= 0; i--) {
                const effect = this.activeEffects[i];
                
                // Call update method
                const completed = effect.update(deltaTime);
                
                // Remove if completed
                if (completed) {
                    // Call clean-up method if available
                    if (effect.remove) {
                        effect.remove();
                    }
                    
                    // Remove from active effects
                    this.activeEffects.splice(i, 1);
                }
            }
        }
    },

    // Check portal collisions
    checkPortalCollisions() {
        if (!this.localPlayer) return;

        // Check start portal collision if it exists
        if (this.startPortal && this.startPortalBox) {
            const playerBox = new THREE.Box3().setFromObject(this.localPlayer.mesh);
            const portalDistance = playerBox.getCenter(new THREE.Vector3()).distanceTo(this.startPortalBox.getCenter(new THREE.Vector3()));
            
            if (portalDistance < 50) {
                // Get ref from URL params
                const urlParams = new URLSearchParams(window.location.search);
                const refUrl = urlParams.get('ref');
                if (refUrl) {
                    // Add https if not present and include query params
                    let url = refUrl;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }
                    const currentParams = new URLSearchParams(window.location.search);
                    const newParams = new URLSearchParams();
                    for (const [key, value] of currentParams) {
                        if (key !== 'ref') { // Skip ref param since it's in the base URL
                            newParams.append(key, value);
                        }
                    }
                    const paramString = newParams.toString();
                    window.location.href = url + (paramString ? '?' + paramString : '');
                }
            }
        }

        // Check exit portal collision
        if (this.exitPortal && this.exitPortalBox) {
            const playerBox = new THREE.Box3().setFromObject(this.localPlayer.mesh);
            const portalDistance = playerBox.getCenter(new THREE.Vector3()).distanceTo(this.exitPortalBox.getCenter(new THREE.Vector3()));
            
            if (portalDistance < 50) {
                // Start loading the next page in the background
                const currentParams = new URLSearchParams(window.location.search);
                const newParams = new URLSearchParams();
                newParams.append('portal', 'true');
                newParams.append('username', this.localPlayer.username);
                newParams.append('color', 'white');
                newParams.append('speed', this.localPlayer.moveSpeed);

                for (const [key, value] of currentParams) {
                    newParams.append(key, value);
                }
                const paramString = newParams.toString();
                const nextPage = 'http://portal.pieter.com' + (paramString ? '?' + paramString : '');

                // Create hidden iframe to preload next page
                if (!document.getElementById('preloadFrame')) {
                    const iframe = document.createElement('iframe');
                    iframe.id = 'preloadFrame';
                    iframe.style.display = 'none';
                    iframe.src = nextPage;
                    document.body.appendChild(iframe);
                }

                // Only redirect once actually in the portal
                if (playerBox.intersectsBox(this.exitPortalBox)) {
                    window.location.href = nextPage;
                }
            }
        }
    }
};

// Initialize game when page loads
window.addEventListener('load', () => {
    Game.init();
});

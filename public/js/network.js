// Network communication
const Network = {
    // Server host
    SERVER_HOST: 'ramparty.fly.dev',

    // WebSocket connection
    socket: null,
    isConnected: false,
    reconnectAttempts: 0,
    enabled: true,
    
    // Initialize network
    init() {        
        if (this.enabled) {
            this.connect();
        }
    },
    
    // Connect to server
    connect() {
        // Close existing connection if any
        if (this.socket) {
            this.socket.close();
        }

        // Connect to server
        try {
            // Use protocol and host from current window location
            const host = window.location.host || this.SERVER_HOST;
            const wsUrl = `wss://${host}`;
            console.log('Connecting to:', wsUrl);
            this.socket = new WebSocket(wsUrl);
            this.setupSocketHandlers();
            
            // Set up event handlers
            this.socket.onopen = () => {
                console.log('Connected to server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Send join message with player ID right after connection
                this.sendJoin();
            };
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.handleDisconnect();
        }
    },
    
    setupSocketHandlers() {
        // Handle connection close
        this.socket.onclose = () => this.handleDisconnect();
        
        // Handle incoming messages
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    // Game events
                    case 'welcome':
                        //this.handleWelcome(data);
                        break;
                    case 'initial_state':
                        this.handleInitialState(data);
                        break;

                    // Player events
                    case 'player_join':
                        //this.handlePlayerJoin(data);
                        break;
                    case 'player_leave':
                        this.handlePlayerLeave(data);
                        break;
                    case 'player_update':
                        this.handlePlayerUpdate(data);
                        break;

                    // Stone events
                    case 'stone_spawned':
                        this.handleStoneSpawned(data);
                        break;
                    case 'stone_update':
                        this.handleStoneUpdate(data);
                        break;
                    case 'stone_pickup':
                        this.handleStonePickup(data);
                        break;
                    case 'stone_throw':
                        this.handleStoneThrow(data);
                        break;

                    // Cloud events
                    case 'cloud_update':
                        this.handleCloudUpdate(data);
                        break;

                    // Tower events
                    case 'tower_create':
                        //this.handleTowerCreate(data);
                        break;
                    case 'tower_destroy':
                        //this.handleTowerDestroy(data);
                        break;
                    case 'tower_update':
                        this.handleTowerUpdate(data);
                        break;
                    case 'tower_start_destruction':
                        this.handleTowerStartDestruction(data);
                        break;
                    case 'tower_update_destruction':
                        this.handleTowerUpdateDestruction(data);
                        break;

                    // King events
                    case 'king_update':
                        this.handleKingUpdate(data);
                        break;

                    // Unknown message
                    default:
                        console.warn(`Unknown message type: ${data.type}`);
                }
            } catch (e) {
                console.error('Error handling message:', e);
            }
        };
    },
        
    // Helper to send messages
    sendMessage(message) {
        // Check if connected
        if (!this.isConnected) return;

        // Send message
        try {
            const json = JSON.stringify(message);
            this.socket.send(json);
        } catch (e) {
            console.error('Error sending message:', e);
        }
    },
    
    // Handle disconnect
    handleDisconnect() {
        console.log('Disconnected from server');
        this.isConnected = false;
        
        // Clear all on disconnect
        Game.clearAllStones();
        //Game.clearAllTowers();
        //Game.clearAllClouds();
        //Game.clearAllPlayers();
        //Game.clearAllEffects();

        // Try to reconnect
        if (this.reconnectAttempts < CONFIG.NETWORK.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting (attempt ${this.reconnectAttempts})...`);
            setTimeout(() => {
                this.connect();
            }, CONFIG.NETWORK.reconnectInterval);
        } else {
            console.log('Failed to reconnect to server');
        }
    },
    
    // Handle initial state
    handleInitialState(message) {
        // Handle players
        message.players.forEach(playerData => {
            // Skip if this is our local player or if player already exists
            if (playerData.playerId === Game.localPlayer.id || Game.getPlayerById(playerData.playerId)) {
                return;
            }
            
            // Create new player
            const player = new Player(playerData.playerId, playerData.username);
            player.position.set(
                playerData.position.x,
                playerData.position.y,
                playerData.position.z
            );
            player.rotation.set(
                playerData.rotation.x,
                playerData.rotation.y,
                playerData.rotation.z,
                'YXZ'
            );
            Game.addPlayer(player);
        });
        
        // Handle stones
        message.stones.forEach(stoneData => {
            if (!Game.getStoneById(stoneData.id)) {
                const stone = new Stone(stoneData.id);
                stone.updateFromData(stoneData);
                Game.addStone(stone);
            }
        });
        
        // Handle towers
        message.towers.forEach(towerData => {
            const tower = Tower.fromJSON(towerData);
            Game.addTower(tower);
        });
    },
    
    // Send regular updates for local player
    sendPlayerUpdate() {
        if (!this.isConnected || !Game.localPlayer) return;

        // Send player update
        this.sendMessage({
            type: 'player_update',
            playerId: Game.localPlayer.id,
            position: Game.localPlayer.position,
            rotation: {
                x: Game.localPlayer.rotation.x,
                y: Game.localPlayer.rotation.y,
                z: Game.localPlayer.rotation.z
            },
            heldStones: Game.localPlayer.heldStones.map(stone => stone.id)
        });
    },
    
    // Send join message
    sendJoin() {
        this.sendMessage({
            type: 'player_join',
            playerId: Game.localPlayer.id,
            username: Game.localPlayer.username,
            position: {
                x: Game.localPlayer.position.x,
                y: Game.localPlayer.position.y,
                z: Game.localPlayer.position.z
            },
            rotation: {
                x: Game.localPlayer.rotation.x,
                y: Game.localPlayer.rotation.y,
                z: Game.localPlayer.rotation.z
            }
        });
    },

    // Handle player updates from server
    handlePlayerUpdate(message) {
        // Get player ID
        const playerId = message.playerId;
        
        // Skip if this is our own update
        if (playerId === Game.localPlayer.id) return;
        
        // Get player from Game
        let player = Game.getPlayerById(playerId);
        if (!player) {
            // Create new player if we don't have them yet
            console.log(`Creating player from update: ${playerId}`);
            player = new Player(playerId, '');
            Game.addPlayer(player);
        }
        
        // Update player position and rotation
        player.updateFromData({
            position: message.position,
            rotation: message.rotation,
            heldStones: message.heldStones
        });
    },

    // Player leaves
    handlePlayerLeave(data) {
        // Get player
        const player = Game.getPlayerById(data.playerId);
        if (player) {
            // Drop all stones held by disconnected player
            player.heldStones.forEach(stone => {
                stone.isHeld = false;
                stone.heldBy = null;
                stone.isThrown = false;
                stone.throwTime = Date.now();
                stone.isStatic = false;
            });
            
            // Remove player from game
            Game.removePlayer(data.playerId);
        }
    },
        
    // Send stone pickup
    sendStonePickup(stoneId) {
        this.sendMessage({
            type: 'stone_pickup',
            stoneId: stoneId,
            playerId: Game.localPlayer.id
        });
    },
    
    // Send stone throw
    sendStoneThrow(stone) {
        this.sendMessage({
            type: 'stone_throw',
            stoneId: stone.id,
            playerId: Game.localPlayer.id,
            position: {
                x: stone.position.x,
                y: stone.position.y,
                z: stone.position.z
            },
            velocity: {
                x: stone.velocity.x,
                y: stone.velocity.y,
                z: stone.velocity.z
            }
        });
    },

    // Stone pickup
    handleStonePickup(data) {
        const stone = Game.getStoneById(data.stoneId);
        if (stone) {
            stone.isHeld = true;
            stone.heldBy = data.playerId;
            stone.isStatic = false;
            
            // Only track held stones for local player
            if (data.playerId === Game.localPlayer.id) {
                Game.localPlayer.addHeldStone(stone);
            }
        }
    },

    // Handle stone thrown message
    handleStoneThrow(data) {
        const stone = Game.getStoneById(data.stoneId);
        if (stone) {
            stone.position.copy(data.position);
            stone.velocity.copy(data.velocity);
            stone.isHeld = false;
            stone.heldBy = null;
            stone.isThrown = true;
            stone.throwTime = Date.now();
            stone.isStatic = false;

            // Only remove from local player's held stones
            if (data.playerId === Game.localPlayer.id) {
                Game.localPlayer.removeHeldStone(stone);
            }
        }
    },

    // Stone spawned
    handleStoneSpawned(data) {
        const stone = new Stone(data.stone.id);
        stone.position.set(data.stone.position.x, data.stone.position.y, data.stone.position.z);
        stone.mesh.position.copy(stone.position);
        Game.addStone(stone);
    },
    
    // Update stones
    handleStoneUpdate(data) {
        // Update stones
        data.stones.forEach(stoneData => {
            // Get stone
            let stone = Game.getStoneById(stoneData.id);
            if (stone) {
                // Update stone from data
                stone.updateFromData(stoneData);
            } else {
                // Create new stone if we don't have it
                stone = new Stone(stoneData.id);
                stone.position.set(stoneData.position.x, stoneData.position.y, stoneData.position.z);
                stone.velocity.set(stoneData.velocity.x, stoneData.velocity.y, stoneData.velocity.z);
                stone.isHeld = stoneData.isHeld;
                stone.heldBy = stoneData.heldBy;
                stone.isThrown = stoneData.isThrown;
                stone.isStatic = stoneData.isStatic;
                Game.addStone(stone);
            }
        });
    },
        
    // Cloud updates
    handleCloudUpdate(message) {
        // Check message
        if (!message.clouds || !Array.isArray(message.clouds)) return;
        
        // Update existing clouds or create new ones
        for (const cloudData of message.clouds) {
            let cloud = Game.clouds.find(c => c.id === cloudData.id);
            if (cloud) {
                // Update existing cloud position and direction
                cloud.position.set(cloudData.position.x, cloudData.position.y, cloudData.position.z);
                cloud.direction.set(cloudData.direction.x, cloudData.direction.y, cloudData.direction.z);
                cloud.speed = cloudData.speed;
                cloud.mesh.position.copy(cloud.position);
            } else {
                // Create new cloud
                cloud = Cloud.fromJSON(cloudData);
                Game.addCloud(cloud);
            }
        }
        
        // Remove clouds that don't exist on server
        const serverCloudIds = message.clouds.map(c => c.id);
        for (let i = Game.clouds.length - 1; i >= 0; i--) {
            if (!serverCloudIds.includes(Game.clouds[i].id)) {
                const cloud = Game.clouds[i];
                Game.scene.remove(cloud.mesh);
                Game.clouds.splice(i, 1);
            }
        }
    },
    
    // Tower update
    handleTowerUpdate(message) {
        const tower = Game.getTowerById(message.towerId);
        if (tower) {
            // Update tower level
            tower.level = message.newLevel;
            
            // Refresh the tower mesh
            tower.createTowerMesh();
            
            // Handle tower level up
            if (message.removedStoneIds && Array.isArray(message.removedStoneIds)) {
                // Remove all stones that were used to level up the tower
                message.removedStoneIds.forEach(stoneId => {
                    const stone = Game.getStoneById(stoneId);
                    if (stone) {
                        Game.removeStone(stone);
                    }
                });
                
                // Log the level up
                log(`Tower leveled up to level ${message.newLevel}!`);
            }
            // Handle level down
            else if (message.wasDestacked) {
                // Log the destack
                log(`Tower leveled down to level ${message.newLevel}!`);
            }
            
            // Update UI
            updateUI();
        }
    },

    // Player is on a tower and wants to level it down and grab the stones from it
    sendTowerDestack(towerId) {
        // Check if connected
        if (!this.isConnected) return;

        // Send tower destack
        this.socket.send(JSON.stringify({
            type: 'tower_destack',
            playerId: Game.localPlayer.id,
            towerId: towerId
        }));
        
        // Log
        log('Sent tower destack request');
    },
    
    // Handle tower start destruction
    handleTowerStartDestruction(message) {
        // Get the cloud and tower
        const cloud = Game.clouds.find(c => c.id === message.sequence.cloud);
        const tower = Game.getTowerById(message.sequence.tower);        
        if (!cloud || !tower) {
            console.warn('Could not find cloud or tower for destruction sequence');
            return;
        }
        
        // Log the event
        log(`Cloud is attacking a level ${tower.level} tower!`, 'warning');
        
        // Clouds will just follow server position, no need to animate movement
        cloud.startDestructionAnimation('moving', tower.id);
    },

    handleTowerUpdateDestruction(message) {
        // Find the cloud
        const cloud = Game.clouds.find(c => c.id === message.cloudId);
        if (!cloud) return;
        
        // Update animation phase
        cloud.startDestructionAnimation(message.phase, message.towerId);

        // Play sound
        if (message.phase === 'raining') {
            // Play rain sound
            playSound('rain', 0.7, false);
            
            // Log status
            log(`Cloud is raining on the tower!`);
        } 
        else if (message.phase === 'flooding') {
            // Play flood sound
            playSound('flood', 0.7, false);
            
            // Log status
            log(`Tower is being flooded!`);
        }
        else if (message.phase === 'exploding') {
            // Play explosion sound
            playSound('explosion', 1.0, false);
            
            // Log status
            log(`Tower is exploding!`);

            // Explode the tower
            createTowerDestructionEffect(message.towerId);
        }
    },

    // Create tower destruction explosion
    createTowerDestructionEffect(tower) {
        if (!tower || !tower.mesh) return;
        
        // Create explosion particles
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.PointsMaterial({
            color: 0xffaa00,
            size: 0.8,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        
        // Create particle positions and velocities
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        
        // Initialize particles at tower position
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = tower.position.x;
            positions[i3 + 1] = tower.position.y + Math.random() * 5;
            positions[i3 + 2] = tower.position.z;
            
            // Random outward velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            velocities.push({
                x: Math.cos(angle) * speed,
                y: 3 + Math.random() * 7,
                z: Math.sin(angle) * speed
            });
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Create particle system
        const particles = new THREE.Points(geometry, material);
        particles.userData.velocities = velocities;
        particles.userData.startTime = Date.now();
        particles.userData.duration = 2000; // 2 seconds
        
        // Add to scene
        Game.scene.add(particles);
        
        // Store in active effects
        if (!Game.activeEffects) Game.activeEffects = [];
        Game.activeEffects.push({
            type: 'explosion',
            object: particles,
            update: function(deltaTime) {
                const positions = particles.geometry.attributes.position.array;
                const velocities = particles.userData.velocities;
                
                // Apply gravity
                for (let i = 0; i < velocities.length; i++) {
                    velocities[i].y -= 9.8 * deltaTime;
                }
                
                // Update each particle
                for (let i = 0; i < positions.length; i += 3) {
                    const vi = i / 3;
                    positions[i] += velocities[vi].x * deltaTime;
                    positions[i + 1] += velocities[vi].y * deltaTime;
                    positions[i + 2] += velocities[vi].z * deltaTime;
                }
                
                particles.geometry.attributes.position.needsUpdate = true;
                
                // Fade out over time
                const elapsed = Date.now() - particles.userData.startTime;
                const progress = Math.min(1.0, elapsed / particles.userData.duration);
                particles.material.opacity = 0.8 * (1 - progress);
                
                // Return true if effect should be removed
                return progress >= 1.0;
            },
            remove: function() {
                Game.scene.remove(particles);
                particles.geometry.dispose();
                particles.material.dispose();
            }
        });
    },

    // Handle king status update
    handleKingUpdate(message) {
        // Get king ID
        const kingId = message.kingId;
        
        // Update all players' king status
        for (const playerId in Game.players) {
            // Get player
            const player = Game.players[playerId];
            const isKing = playerId === kingId;
            
            // Update king status
            player.setKingStatus(isKing);
        }
        
        // Update UI
        updateUI();
        
        // Log king change if it's a new king
        if (kingId) {
            const kingName = kingId === Game.localPlayer.id ? 
                'You are' : 
                `${kingId} is`;
            log(`${kingName} now the king!`);
        } else {
            log('The kingdom is vacant! Climb the tallest tower to become king.');
        }
    }
};

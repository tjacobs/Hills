// Network communication
const Network = {
    // WebSocket connection
    socket: null,
    isConnected: false,
    reconnectAttempts: 0,
    enabled: true, // Flag to enable/disable network
    
    // Initialize network
    init() {        
        if (this.enabled) {
            this.connect();
        }
    },
    
    // Connect to server
    connect() {
        if (!this.enabled) return;
        
        // Close existing connection if any
        if (this.socket) {
            this.socket.close();
        }
        
        try {
            // Use protocol and host from current window location, fallback to localhost if not available
            const host = window.location.host || 'ramparty.fly.dev';
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
                
                // Call onConnect callback if exists
                if (this.onConnect) this.onConnect();
            };
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.handleDisconnect();
        }
    },
    
    setupSocketHandlers() {
        this.socket.onclose = () => this.handleDisconnect();
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            // Clear stones on socket error as well
            Game.clearAllStones();
        };
        
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Comment out the log
                // console.log('Received message:', data);
                
                switch (data.type) {
                    case 'welcome':
                        this.handleWelcome(data);
                        break;
                    case 'player_joined':
                        this.handlePlayerJoined(data);
                        break;
                    case 'player_left':
                        this.handlePlayerLeft(data);
                        break;
                    case 'player_update':
                        this.handlePlayerUpdate(data);
                        break;
                    case 'initial_state':
                        this.handleInitialState(data);
                        break;
                    case 'stone_update':
                        this.handleStoneUpdate(data);
                        break;
                    case 'tower_update':
                        this.handleTowerUpdate(data);
                        break;
                    case 'stone_spawned':
                        this.handleStoneSpawned(data);
                        break;
                    case 'player_updated':
                        this.handlePlayerUpdated(data);
                        break;
                    case 'stone_positions':
                        this.handleStonePositions(data);
                        break;
                    case 'tower_removed':
                        this.handleTowerRemoved(data);
                        break;
                    case 'stone_throw':
                        this.handleStoneThrow(data);
                        break;
                    case 'tower_created':
                        this.handleTowerCreated(data);
                        break;
                    case 'stone_pickup':
                        this.handleStonePickup(data);
                        break;
                    case 'player_disconnected':
                        this.handlePlayerDisconnected(data);
                        break;
                    case 'cloud_positions':
                        this.handleCloudPositions(data);
                        break;
                    case 'tower_destroyed':
                        this.handleTowerDestroyed(data);
                        break;
                    case 'tower_destruction_start':
                        this.handleTowerDestructionStart(data);
                        break;
                    case 'tower_destruction_phase':
                        this.handleTowerDestructionPhase(data);
                        break;
                    case 'king_status':
                        this.handleKingStatus(data);
                        break;
                    default:
                        console.warn(`Unknown message type: ${data.type}`);
                }
            } catch (e) {
                console.error('Error handling message:', e);
            }
        };
    },
    
    handleDisconnect() {
        console.log('Disconnected from server');
        this.isConnected = false;
        
        // Clear all stones immediately on disconnect
        Game.clearAllStones();
        
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
    
    handleInitialState(message) {
        // Handle players
        message.players.forEach(playerData => {
            // Skip if this is our local player or if player already exists
            if (playerData.playerId === Game.localPlayer.id || Game.getPlayerById(playerData.playerId)) {
                return;
            }
            
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
        
        const updateData = {
            type: 'player_update',
            playerId: Game.localPlayer.id,
            position: {
                x: Game.localPlayer.position.x,
                y: Game.localPlayer.position.y,
                z: Game.localPlayer.position.z
            },
            rotation: {
                x: Game.localPlayer.rotation.x,
                y: Game.localPlayer.rotation.y,
                z: Game.localPlayer.rotation.z
            },
            heldStones: Game.localPlayer.heldStones.map(stone => stone.id)
        };
        
        this.sendMessage(updateData);
    },
    
    // Send stone updates when thrown or picked up
    sendStoneUpdate(stone) {
        if (!this.isConnected) return;
        this.sendMessage({
            type: 'stone_update',
            id: stone.id,
            position: stone.mesh.position.toJSON(),
            velocity: stone.velocity?.toJSON(),
            isStatic: stone.isStatic
        });
    },
    
    // Send tower updates when created or modified
    sendTowerUpdate(tower) {
        if (!this.isConnected) return;
        
        this.sendMessage({
            type: 'tower_update',
            tower: {
                id: tower.id,
                position: {
                    x: tower.mesh.position.x,
                    y: tower.mesh.position.y,
                    z: tower.mesh.position.z
                },
                level: tower.level
            }
        });
    },
    
    // Helper to send messages
    sendMessage(message) {
        if (!this.isConnected) return;
        
        try {
            // Comment out the log
            // console.log(`Sending message type: ${message.type}`);
            
            const json = JSON.stringify(message);
            this.socket.send(json);
        } catch (e) {
            console.error('Error sending message:', e);
        }
    },
    
    // Handle welcome message
    handleWelcome(message) {
        // Update local player's ID with server-assigned ID
        Game.localPlayer.id = message.playerId;

        // Add existing players if provided
        if (message.players) {
            message.players.forEach(playerData => {
                // Skip if this is our local player or if player already exists
                if (playerData.playerId === message.playerId || Game.getPlayerById(playerData.playerId)) {
                    return;
                }
                
                const player = new Player(playerData.playerId, playerData.username);
                player.position.copy(playerData.position);
                player.rotation.copy(playerData.rotation);
                Game.addPlayer(player);
            });
        }

        // Request initial state for other game objects
        this.sendMessage({
            type: 'request_state'
        });
    },
    
    // Handle full state message
    handleFullState(message) {
        log('Received game state');
        
        // Update players
        if (message.players && Array.isArray(message.players)) {
            for (const playerData of message.players) {
                // Skip local player
                if (playerData.id === Game.localPlayer.id) continue;
                
                // Create or update remote player
                let player = Game.players[playerData.id];
                if (!player) {
                    player = new Player(playerData.id, playerData.username);
                    Game.addPlayer(player);
                }
                
                // Update player position and rotation
                player.position.set(
                    playerData.position.x,
                    playerData.position.y,
                    playerData.position.z
                );
                player.rotation.set(
                    playerData.rotation.x,
                    playerData.rotation.y,
                    playerData.rotation.z
                );
                
                // Update held stones
                player.heldStones = playerData.heldStones || [];
            }
        }
        
        // Update towers
        if (message.towers && Array.isArray(message.towers)) {
            // Add new towers
            for (const towerData of message.towers) {
                const tower = Tower.fromJSON(towerData);
                Game.addTower(tower);
            }
        }
        
        // Update stones
        if (message.stones) {
            // Ensure stones is an array before iterating
            const stonesArray = Array.isArray(message.stones) ? message.stones : [];
            
            // Clear existing stones
            for (const stone of Game.stones) {
                if (stone.mesh && stone.mesh.parent) {
                    stone.mesh.parent.remove(stone.mesh);
                }
            }
            Game.stones = [];
            
            // Add new stones
            for (const stoneData of stonesArray) {
                const stone = Stone.fromJSON(stoneData);
                Game.addStone(stone);
            }
        }
        
        // Update clouds
        if (message.clouds) {
            // Ensure clouds is an array before iterating
            const cloudsArray = Array.isArray(message.clouds) ? message.clouds : [];
            
            // Clear existing clouds
            for (const cloud of Game.clouds) {
                if (cloud.mesh && cloud.mesh.parent) {
                    cloud.mesh.parent.remove(cloud.mesh);
                }
            }
            Game.clouds = [];
            
            // Add new clouds
            for (const cloudData of cloudsArray) {
                const cloud = Cloud.fromJSON(cloudData);
                Game.addCloud(cloud);
            }
        }
        
        // Update UI
        updateUI();
    },
    
    // Handle player joined message
    handlePlayerJoined(message) {
        const playerId = message.playerId;
        
        // Skip if this is our own join message or if player already exists
        if (playerId === Game.localPlayer.id || Game.getPlayerById(playerId)) {
            console.log(`Skipping player join: ${playerId}`);
            return;
        }
        
        // Create new player
        //console.log(`Adding player from join: ${playerId}`);
        const player = new Player(playerId, message.username);
        player.position.set(
            message.position.x,
            message.position.y,
            message.position.z
        );
        player.rotation.set(
            message.rotation.x,
            message.rotation.y,
            message.rotation.z,
            'YXZ'
        );
        
        // Add player to game
        Game.addPlayer(player);
    },
    
    // Handle player left message
    handlePlayerLeft(message) {
        const playerId = message.playerId;
        Game.removePlayer(playerId);
    },
    
    // Handle player update message
    handlePlayerUpdate(message) {
        // Skip local player
        if (message.playerId === Game.localPlayer.id) return;
        
        const player = Game.players[message.playerId];
        if (player) {
            player.updateFromData({
                position: message.position,
                rotation: message.rotation,
                heldStones: message.heldStones
            });            
            player.lastUpdate = Date.now();
        }
    },
    
    // Handle tower created message
    handleTowerCreated(message) {
        // Skip if this is our own tower
        if (message.createdBy === Game.localPlayer.id) return;
        
        log(`Player ${message.createdBy} created a tower`);
        
        // Remove stones that were used to create the tower
        message.removedStones.forEach(stoneId => {
            const stone = Game.getStoneById(stoneId);
            if (stone) {
                Game.removeStone(stone);
            }
        });
        
        // Create tower from data
        const tower = Tower.fromJSON(message.tower);
        
        // Add to game
        Game.addTower(tower, false);
        
        // Update UI
        updateUI();
    },
    
    // Handle tower destroyed message
    handleTowerDestroyed(message) {
        // Find the tower index
        const index = message.index;
        if (index < 0 || index >= Game.towers.length) {
            console.warn(`Invalid tower index: ${index}`);
            return;
        }
        
        // Get the tower before removing
        const tower = Game.towers[index];
        
        // Play destruction sound
        playSound('towerDestroy', 1.0, false);
        
        // Create explosion effect
        this.createTowerDestructionEffect(tower);
        
        // Destroy tower (doesn't send network message)
        Game.destroyTower(index, false);
        
        // Log tower destruction
        log(`A tower has been destroyed!`, 'warning');
    },
    
    // Handle stone picked up message
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
    
    // Handle stone dropped message
    handleStoneDropped(message) {
        // Skip if this is our own action
        if (message.playerId === Game.localPlayer.id) return;
        
        log(`Player ${message.playerId} dropped a stone`);
        
        // Create or update stone
        const stone = Stone.fromJSON(message.stone);
        
        // Add to game
        Game.addStone(stone);
        
        // Update remote player's held stones
        const player = Game.getPlayerById(message.playerId);
        
        if (player) {
            // Remove stone from player's held stones
            const index = player.heldStones.indexOf(stone.id);
            
            if (index !== -1) {
                player.heldStones.splice(index, 1);
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
    
    // Send tower created
    sendTowerCreated(tower) {
        if (!this.isConnected) return;
        
        this.sendMessage({
            type: 'tower_created',
            tower: {
                id: tower.id,
                position: {
                    x: tower.mesh.position.x,
                    y: tower.mesh.position.y,
                    z: tower.mesh.position.z
                },
                level: tower.level,
                createdBy: tower.createdBy
            }
        });
    },
    
    // Send tower destroyed
    sendTowerDestroyed(towerIndex) {
        this.sendMessage({
            type: 'tower_destroyed',
            playerId: Game.localPlayer.id,
            towerIndex: towerIndex
        });
    },
    
    // Send stone picked up
    sendStonePickup(stoneId) {
        this.sendMessage({
            type: 'stone_pickup',
            stoneId: stoneId,
            playerId: Game.localPlayer.id
        });
    },
    
    // Send stone dropped
    sendStoneDropped(stone) {
        this.sendMessage({
            type: 'stone_dropped',
            playerId: Game.localPlayer.id,
            stone: stone.toJSON()
        });
    },
    
    // Send stone thrown
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
    
    // Handle player updated message
    handlePlayerUpdated(message) {
        const playerId = message.playerId;
        
        // Skip if this is our own update
        if (playerId === Game.localPlayer.id) return;
        
        // Get player from Game
        let player = Game.getPlayerById(playerId);
        
        if (!player) {
            // Create new player if we don't have them yet
            console.log(`Creating player from update: ${playerId}`);
            player = new Player(playerId, 'Player');  // Default username until we get a proper join
            Game.addPlayer(player);
        }
        
        // Update player position and rotation with interpolation
        player.updateFromData({
            position: message.position,
            rotation: message.rotation,
            heldStones: message.heldStones
        });
    },
    
    // Handle stone spawned message
    handleStoneSpawned(data) {
        const stone = new Stone(data.stone.id);
        stone.position.set(data.stone.position.x, data.stone.position.y, data.stone.position.z);
        stone.mesh.position.copy(stone.position);
        Game.addStone(stone);
    },
    
    // Handle stone positions message
    handleStonePositions(data) {
        data.stones.forEach(stoneData => {
            let stone = Game.getStoneById(stoneData.id);
            if (stone) {
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
    
    // Add tower update handler
    handleTowerUpdate(message) {
        const tower = Game.getTowerById(message.towerId);
        if (tower) {
            // Update tower level
            tower.level = message.newLevel;
            
            // Refresh the tower mesh
            tower.createTowerMesh();
            
            // Handle regular tower update (from a level up)
            if (message.removedStoneIds && Array.isArray(message.removedStoneIds)) {
                // Remove all stones that were used to level up the tower
                message.removedStoneIds.forEach(stoneId => {
                    const stone = Game.getStoneById(stoneId);
                    if (stone) {
                        Game.removeStone(stone);
                    }
                });
                
                // Log the level up
                log(`Tower leveled up to level ${message.newLevel}!`, 'info');
            }
            // Handle single stone update (for backward compatibility)
            else if (message.removedStoneId) {
                const stone = Game.getStoneById(message.removedStoneId);
                if (stone) {
                    Game.removeStone(stone);
                }
                
                // Log the level up
                log(`Tower leveled up to level ${message.newLevel}!`, 'info');
            }
            // Handle destack operation
            else if (message.wasDestacked) {
                // Log the destack
                log(`Tower destacked to level ${message.newLevel}!`, 'info');
            }
            
            // Update UI
            updateUI();
        }
    },
    
    // Add tower removal handler
    handleTowerRemoved(message) {
        const tower = Game.getTowerById(message.towerId);
        if (tower) {
            Game.removeTower(tower);
        }
    },
    
    handlePlayerDisconnected(data) {
        const player = Game.getPlayerById(data.playerId);
        if (player) {
            // Drop all stones held by disconnected player
            player.heldStones.forEach(stone => {
                stone.isHeld = false;
                stone.heldBy = null;
                stone.isThrown = true;
                stone.throwTime = Date.now();
                stone.isStatic = false;
            });
            
            // Remove player from game
            Game.removePlayer(data.playerId);
        }
    },
    
    handleCloudPositions(message) {
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
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.isConnected = false;
            
            // Clear all stones when disconnected
            Game.clearAllStones();
            
            // Log disconnection
            log('Disconnected from server', 'error');
        }
    },
    
    // Add this method to the Network object
    sendTowerDestack(towerId) {
        if (!this.isConnected) return;
        
        this.socket.send(JSON.stringify({
            type: 'tower_destack',
            playerId: Game.localPlayer.id,
            towerId: towerId
        }));
        
        log('Sent tower destack request');
    },
    
    // Add these handler methods
    handleTowerDestructionStart(message) {
        // Get the cloud and tower
        const cloud = Game.clouds.find(c => c.id === message.sequence.cloud);
        const tower = Game.getTowerById(message.sequence.tower);
        
        if (!cloud || !tower) {
            console.warn('Could not find cloud or tower for destruction sequence');
            return;
        }
        
        // Log the event
        log(`Cloud is attacking a level ${tower.level} tower!`, 'warning');
        
        // Make the camera look at the tower if it's far away
        this.maybeShowTowerDestruction(tower);
        
        // Clouds will just follow server position, no need to animate movement
        cloud.startDestructionAnimation('moving', tower.id);
    },

    handleTowerDestructionPhase(message) {
        // Find the cloud
        const cloud = Game.clouds.find(c => c.id === message.cloudId);
        if (!cloud) return;
        
        // Update animation phase
        cloud.startDestructionAnimation(message.phase, message.towerId);
        
        if (message.phase === 'raining') {
            // Play rain sound
            playSound('rain', 0.5, false);
            
            // Log status
            log(`Cloud is raining on the tower!`, 'info');
        } 
        else if (message.phase === 'flooding') {
            // Play flood sound
            playSound('flood', 0.7, false);
            
            // Log status
            log(`Tower is being flooded!`, 'warning');
        }
    },

    // Add method to create tower destruction explosion
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

    // Add method to move camera to view tower destruction
    maybeShowTowerDestruction(tower) {
        // Only show if tower is far away
        const distToPlayer = tower.position.distanceTo(Game.localPlayer.position);
        if (distToPlayer > 50) {
            // Create a temporary camera position to view the destruction
            const lookDirection = new THREE.Vector3().subVectors(tower.position, Game.camera.position).normalize();
            const distance = 30; // Distance to view from
            
            const cameraPos = new THREE.Vector3().copy(tower.position).sub(
                lookDirection.multiplyScalar(distance)
            );
            
            // Raise camera up to look down at tower
            cameraPos.y += 20;
            
            // Store original camera state
            const originalPos = Game.camera.position.clone();
            const originalRot = Game.camera.rotation.clone();
            
            // Add to active effects
            if (!Game.activeEffects) Game.activeEffects = [];
            Game.activeEffects.push({
                type: 'cameraMove',
                startTime: Date.now(),
                duration: 5000, // 5 seconds
                targetPos: cameraPos,
                targetTower: tower.position.clone(),
                originalPos: originalPos,
                originalRot: originalRot,
                update: function(deltaTime) {
                    const elapsed = Date.now() - this.startTime;
                    const duration = this.duration;
                    const progress = Math.min(1.0, elapsed / duration);
                    
                    // Move to view tower for first half
                    if (progress < 0.5) {
                        const p = progress * 2; // Scale to 0-1
                        // Smooth transition
                        const t = 0.5 - 0.5 * Math.cos(p * Math.PI);
                        
                        // Interpolate position
                        Game.camera.position.lerpVectors(this.originalPos, this.targetPos, t);
                        
                        // Look at tower
                        Game.camera.lookAt(this.targetTower);
                    }
                    // Return to player in second half
                    else {
                        const p = (progress - 0.5) * 2; // Scale to 0-1
                        // Smooth transition
                        const t = 0.5 - 0.5 * Math.cos(p * Math.PI);
                        
                        // Interpolate back to original position
                        Game.camera.position.lerpVectors(this.targetPos, this.originalPos, t);
                        
                        // Interpolate back to original rotation
                        if (p > 0.8) {
                            const rotProgress = (p - 0.8) * 5; // Scale 0.8-1.0 to 0-1
                            Game.camera.rotation.set(
                                this.originalRot.x * rotProgress,
                                this.originalRot.y * rotProgress,
                                this.originalRot.z * rotProgress
                            );
                        }
                    }
                    
                    return progress >= 1.0;
                }
            });
        }
    }
}; 
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
        log(`Tower ${message.towerIndex} destroyed by player ${message.playerId}`);
        
        // Destroy tower
        Game.destroyTower(message.towerIndex, false); // Don't notify network
        
        // Update UI
        updateUI();
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
            // Update tower
            tower.updateFromData(message);
            
            // Remove the stone that was used to level up
            if (message.removedStoneId) {
                const stone = Game.getStoneById(message.removedStoneId);
                if (stone) {
                    Game.removeStone(stone);
                }
            }
            
            // Log the level up
            log(`Tower leveled up to level ${message.newLevel}!`, 'info');
            
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
    }
}; 
// Network communication
const Network = {
    // WebSocket connection
    socket: null,
    
    // Connection state
    isConnected: false,
    reconnectAttempts: 0,
    enabled: false, // Flag to enable/disable network
    
    // Initialize network
    init() {
        //console.log("Network updates temporarily disabled");
        this.enabled = false; // Set to true to enable networking
        
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
        
        // Create new WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.socket = new WebSocket(wsUrl);
        
        // Set up event handlers
        this.socket.onopen = this.handleOpen.bind(this);
        this.socket.onclose = this.handleClose.bind(this);
        this.socket.onerror = this.handleError.bind(this);
        this.socket.onmessage = this.handleMessageEvent.bind(this);
        
        console.log('Connecting to server...');
    },
    
    // Handle WebSocket open
    handleOpen() {
        log('Connected to server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Send join message
        this.sendJoin();
        
        // Start sending regular updates
        this.startUpdates();
    },
    
    // Handle WebSocket close
    handleClose() {
        log('Disconnected from server');
        this.isConnected = false;
        
        // Try to reconnect
        if (this.reconnectAttempts < CONFIG.NETWORK.maxReconnectAttempts) {
            this.reconnectAttempts++;
            
            log(`Reconnecting (attempt ${this.reconnectAttempts})...`);
            
            setTimeout(() => {
                this.connect();
            }, CONFIG.NETWORK.reconnectInterval);
        } else {
            log('Failed to reconnect to server');
        }
    },
    
    // Handle WebSocket error
    handleError(error) {
        console.error('WebSocket error:', error);
    },
    
    // Handle WebSocket message
    handleMessageEvent(event) {
        try {
            const message = JSON.parse(event.data);
            
            if (CONFIG.DEBUG.logNetworkMessages) {
                console.log('Received message:', message);
            }
            
            // Handle message based on type
            switch (message.type) {
                case 'welcome':
                    this.handleWelcome(message);
                    break;
                case 'full_state':
                    this.handleFullState(message);
                    break;
                case 'player_joined':
                    this.handlePlayerJoined(message);
                    break;
                case 'player_left':
                    this.handlePlayerLeft(message);
                    break;
                case 'player_update':
                    this.handlePlayerUpdate(message);
                    break;
                case 'tower_created':
                    this.handleTowerCreated(message);
                    break;
                case 'tower_destroyed':
                    this.handleTowerDestroyed(message);
                    break;
                case 'stone_picked_up':
                    this.handleStonePickedUp(message);
                    break;
                case 'stone_dropped':
                    this.handleStoneDropped(message);
                    break;
                case 'stone_thrown':
                    this.handleStoneThrown(message);
                    break;
                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    },
    
    // Send message to server
    sendMessage(message) {
        if (!this.enabled || !this.isConnected || !this.socket) return;
        
        this.socket.send(JSON.stringify(message));
    },
    
    // Start sending regular updates
    startUpdates() {
        setInterval(() => {
            this.sendPlayerUpdate();
        }, 1000 / CONFIG.NETWORK.updateRate);
    },
    
    // Handle welcome message
    handleWelcome(message) {
        log(`Welcome to the server! Your ID: ${message.playerId}`);
        
        // Update local player ID
        Game.localPlayer.id = message.playerId;
    },
    
    // Handle full state message
    handleFullState(message) {
        log('Received full game state');
        
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
            // Clear existing towers
            for (const tower of Game.towers) {
                Game.scene.remove(tower.mesh);
            }
            Game.towers = [];
            
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
        log(`Player joined: ${message.username} (${message.playerId})`);
        
        // Create new remote player
        const player = new Player(message.playerId, message.username);
        player.updateFromData(message);
        
        // Add to game
        Game.addRemotePlayer(player);
        
        // Update UI
        updateUI();
    },
    
    // Handle player left message
    handlePlayerLeft(message) {
        log(`Player left: ${message.playerId}`);
        
        // Remove from game
        Game.removeRemotePlayer(message.playerId);
        
        // Update UI
        updateUI();
    },
    
    // Handle player update message
    handlePlayerUpdate(message) {
        // Skip local player
        if (message.playerId === Game.localPlayer.id) return;
        
        // Update remote player
        Game.updateRemotePlayer(message);
    },
    
    // Handle tower created message
    handleTowerCreated(message) {
        // Skip if this is our own tower
        if (message.createdBy === Game.localPlayer.id) return;
        
        log(`Player ${message.createdBy} created a tower`);
        
        // Create tower from data
        const tower = Tower.fromJSON(message.tower);
        
        // Add to game
        Game.addTower(tower, false); // Don't notify network
        
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
    handleStonePickedUp(message) {
        // Skip if this is our own action
        if (message.playerId === Game.localPlayer.id) return;
        
        log(`Player ${message.playerId} picked up stone ${message.stoneId}`);
        
        // Get stone
        const stone = Game.getStoneById(message.stoneId);
        
        if (stone) {
            // Get remote player
            const player = Game.getPlayerById(message.playerId);
            
            if (player) {
                // Update player's held stones
                player.pickupStone(stone);
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
    handleStoneThrown(message) {
        // Skip if this is our own action
        if (message.playerId === Game.localPlayer.id) return;
        
        log(`Player ${message.playerId} threw a stone`);
        
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
    
    // Send join message
    sendJoin() {
        this.sendMessage({
            type: 'join',
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
    
    // Send player update
    sendPlayerUpdate() {
        if (!Game.localPlayer) return;
        
        this.sendMessage({
            type: 'update',
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
            heldStones: Game.localPlayer.heldStones
        });
    },
    
    // Send tower created
    sendTowerCreated(tower) {
        this.sendMessage({
            type: 'tower_created',
            createdBy: Game.localPlayer.id,
            tower: tower.toJSON()
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
    sendStonePickedUp(stoneId) {
        this.sendMessage({
            type: 'stone_picked_up',
            playerId: Game.localPlayer.id,
            stoneId: stoneId
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
    sendStoneThrown(stone) {
        this.sendMessage({
            type: 'stone_thrown',
            playerId: Game.localPlayer.id,
            stone: stone.toJSON()
        });
    }
}; 
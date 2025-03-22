// Multiplayer functionality for tower building game
// This file handles connections to the multiplayer server and synchronizes game state

// Configuration
const MULTIPLAYER_CONFIG = {
    serverUrl: 'wss://ramparty.fly.dev',
    reconnectInterval: 3000,
    maxReconnectAttempts: 1,
    debug: true
};

// Connection state
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
let playerId = null;
let otherPlayers = {}; // Map of player ID to player data

// Player representation for others
class RemotePlayer {
    constructor(id, initialData) {
        this.id = id;
        this.position = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.mesh = null; // Will hold the 3D representation
        this.username = initialData.username || 'Player';
        this.lastUpdate = Date.now();
        this.heldStones = []; // Stones held by this player
        
        this.createMesh();
        this.updateFromData(initialData);
    }
    
    createMesh() {
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2.0, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x3366FF,
            roughness: 0.7,
            metalness: 0.3
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Add a nametag
        this.createNametag();
        
        // Add to scene
        scene.add(this.mesh);
    }
    
    createNametag() {
        // Create a text sprite for the player's name
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Draw background
        context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw text
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(this.username, canvas.width / 2, canvas.height / 2);
        
        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = 1.5; // Position above player
        
        this.nameTag = sprite;
        this.mesh.add(sprite);
    }
    
    updateFromData(data) {
        // Update position if provided
        if (data.position) {
            this.position.set(
                data.position.x,
                data.position.y,
                data.position.z
            );
            this.mesh.position.copy(this.position);
        }
        
        // Update rotation if provided
        if (data.rotation) {
            this.rotation.set(
                data.rotation.x,
                data.rotation.y,
                data.rotation.z
            );
            this.mesh.rotation.copy(this.rotation);
        }
        
        // Update username if provided
        if (data.username && data.username !== this.username) {
            this.username = data.username;
            this.createNametag(); // Recreate nametag with new name
        }
        
        // Update held stones if provided
        if (data.heldStones) {
            this.updateHeldStones(data.heldStones);
        }
        
        this.lastUpdate = Date.now();
    }
    
    updateHeldStones(stonesData) {
        // Remove existing stone meshes
        for (const stone of this.heldStones) {
            this.mesh.remove(stone);
        }
        
        this.heldStones = [];
        
        // Create new stones based on data
        for (let i = 0; i < stonesData.length; i++) {
            const stoneData = stonesData[i];
            
            // Create a simple stone mesh
            const stoneGeometry = new THREE.DodecahedronGeometry(0.3, 0);
            const stoneMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.8,
                metalness: 0.2
            });
            
            const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
            
            // Position stone in player's hand
            stone.position.set(
                0.5, // Right side of player
                0.2 + (i * 0.2), // Stack stones vertically
                0.7  // In front of player
            );
            
            this.mesh.add(stone);
            this.heldStones.push(stone);
        }
    }
    
    remove() {
        // Remove from scene
        if (this.mesh) {
            scene.remove(this.mesh);
            
            // Clean up geometries and materials
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
            
            // Clean up nametag
            if (this.nameTag) {
                if (this.nameTag.material.map) this.nameTag.material.map.dispose();
                if (this.nameTag.material) this.nameTag.material.dispose();
            }
        }
    }
}

// Initialize multiplayer connection
function initializeMultiplayer(username) {
    if (socket) {
        // Close existing connection if any
        socket.close();
    }
    
    // Generate a unique player ID if not already set
    if (!playerId) {
        playerId = generatePlayerId();
    }
    
    // Store username
    const playerUsername = username || 'Player_' + playerId.substring(0, 5);
    
    // Connect to server
    connectToServer(playerUsername);
    
    // Set up regular state updates
    setInterval(sendPlayerState, 100); // 10 updates per second
    
    // Set up regular cleanup of stale players
    setInterval(cleanupStalePlayers, 5000); // Check every 5 seconds
    
    log('Multiplayer initialized');
}

// Connect to the multiplayer server
function connectToServer(username) {
    try {
        log('Connecting to server...');
        
        // Create WebSocket connection
        socket = new WebSocket(MULTIPLAYER_CONFIG.serverUrl);
        
        // Connection opened
        socket.addEventListener('open', (event) => {
            log('Connected to server');
            isConnected = true;
            reconnectAttempts = 0;
            
            // Send initial player data
            sendJoinMessage(username);
        });
        
        // Listen for messages
        socket.addEventListener('message', (event) => {
            handleServerMessage(event.data);
        });
        
        // Connection closed
        socket.addEventListener('close', (event) => {
            log('Disconnected from server');
            isConnected = false;
            
            // Attempt to reconnect
            if (reconnectAttempts < MULTIPLAYER_CONFIG.maxReconnectAttempts) {
                reconnectAttempts++;
                log(`Reconnecting (attempt ${reconnectAttempts})...`);
                setTimeout(() => connectToServer(username), MULTIPLAYER_CONFIG.reconnectInterval);
            } else {
                log('Max reconnect attempts reached. Please refresh the page.');
            }
        });
        
        // Connection error
        socket.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
        });
        
    } catch (error) {
        console.error('Failed to connect to server:', error);
    }
}

// Send join message to server
function sendJoinMessage(username) {
    if (!isConnected) return;
    
    const joinMessage = {
        type: 'join',
        playerId: playerId,
        username: username,
        position: getPlayerPosition(),
        rotation: getPlayerRotation()
    };
    
    socket.send(JSON.stringify(joinMessage));
}

// Send regular player state updates
function sendPlayerState() {
    if (!isConnected) return;
    
    const stateMessage = {
        type: 'update',
        playerId: playerId,
        position: getPlayerPosition(),
        rotation: getPlayerRotation(),
        heldStones: getHeldStonesData()
    };
    
    socket.send(JSON.stringify(stateMessage));
}

// Send tower creation event
function sendTowerCreated(towerData) {
    if (!isConnected) return;
    
    const towerMessage = {
        type: 'tower_created',
        playerId: playerId,
        tower: towerData
    };
    
    socket.send(JSON.stringify(towerMessage));
}

// Send tower destruction event
function sendTowerDestroyed(towerIndex) {
    if (!isConnected) return;
    
    const destroyMessage = {
        type: 'tower_destroyed',
        playerId: playerId,
        towerIndex: towerIndex
    };
    
    socket.send(JSON.stringify(destroyMessage));
}

// Handle messages from the server
function handleServerMessage(messageData) {
    try {
        const message = JSON.parse(messageData);
        
        switch (message.type) {
            case 'player_joined':
                handlePlayerJoined(message);
                break;
                
            case 'player_left':
                handlePlayerLeft(message);
                break;
                
            case 'player_update':
                handlePlayerUpdate(message);
                break;
                
            case 'tower_created':
                handleTowerCreated(message);
                break;
                
            case 'tower_destroyed':
                handleTowerDestroyed(message);
                break;
                
            case 'full_state':
                handleFullState(message);
                break;
                
            default:
                log('Unknown message type: ' + message.type);
        }
    } catch (error) {
        console.error('Error handling server message:', error);
    }
}

// Handle player joined event
function handlePlayerJoined(message) {
    // Skip if this is our own join message
    if (message.playerId === playerId) return;
    
    log(`Player joined: ${message.username}`);
    
    // Create new remote player
    otherPlayers[message.playerId] = new RemotePlayer(message.playerId, message);
}

// Handle player left event
function handlePlayerLeft(message) {
    const player = otherPlayers[message.playerId];
    if (player) {
        log(`Player left: ${player.username}`);
        player.remove();
        delete otherPlayers[message.playerId];
    }
}

// Handle player update event
function handlePlayerUpdate(message) {
    // Skip if this is our own update
    if (message.playerId === playerId) return;
    
    const player = otherPlayers[message.playerId];
    if (player) {
        player.updateFromData(message);
    } else {
        // If we don't have this player yet, create them
        otherPlayers[message.playerId] = new RemotePlayer(message.playerId, message);
    }
}

// Handle tower created event
function handleTowerCreated(message) {
    // Skip if this is our own tower
    if (message.playerId === playerId) return;
    
    log(`Player ${message.playerId} created a tower`);
    
    // Create the tower based on received data
    createTowerFromData(message.tower);
}

// Handle tower destroyed event
function handleTowerDestroyed(message) {
    // Skip if this is our own tower destruction
    if (message.playerId === playerId) return;
    
    log(`Player ${message.playerId} destroyed tower at index ${message.towerIndex}`);
    
    // Destroy the tower
    destroyTower(message.towerIndex);
}

// Handle full state update
function handleFullState(message) {
    log('Received full game state');
    
    // Update all players
    for (const playerData of message.players) {
        if (playerData.playerId === playerId) continue; // Skip self
        
        if (otherPlayers[playerData.playerId]) {
            otherPlayers[playerData.playerId].updateFromData(playerData);
        } else {
            otherPlayers[playerData.playerId] = new RemotePlayer(playerData.playerId, playerData);
        }
    }
    
    // Update all towers
    updateTowersFromData(message.towers);
}

// Create a tower from received data
function createTowerFromData(towerData) {
    const tower = createTowerBase(
        towerData.position.x,
        towerData.position.y,
        towerData.position.z
    );
    
    // Set tower level if provided
    if (towerData.level) {
        tower.userData.level = towerData.level;
    }
    
    // Set tower rotation if provided
    if (towerData.rotation) {
        tower.rotation.set(
            towerData.rotation.x,
            towerData.rotation.y,
            towerData.rotation.z
        );
    }
    
    return tower;
}

// Update all towers from received data
function updateTowersFromData(towersData) {
    // Clear existing towers
    for (const tower of towerBases) {
        scene.remove(tower);
    }
    
    towerBases.length = 0;
    
    // Create new towers
    for (const towerData of towersData) {
        createTowerFromData(towerData);
    }
}

// Clean up players that haven't sent updates recently
function cleanupStalePlayers() {
    const now = Date.now();
    const timeout = 10000; // 10 seconds
    
    for (const playerId in otherPlayers) {
        const player = otherPlayers[playerId];
        
        if (now - player.lastUpdate > timeout) {
            log(`Player ${player.username} timed out`);
            player.remove();
            delete otherPlayers[playerId];
        }
    }
}

// Helper functions
function getPlayerPosition() {
    const position = new THREE.Vector3();
    camera.getWorldPosition(position);
    
    return {
        x: position.x,
        y: position.y,
        z: position.z
    };
}

function getPlayerRotation() {
    return {
        x: camera.rotation.x,
        y: camera.rotation.y,
        z: camera.rotation.z
    };
}

// Fix the getHeldStonesData function to properly reference the heldStones array
function getHeldStonesData() {
    // If we're using the old single stone system
    if (window.heldStone) {
        return window.heldStone ? [{ size: window.heldStone.geometry.parameters.radius || 0.5 }] : [];
    }
    return []; // Return empty array if no stones are held
    
    // Return data about stones the player is holding
//    return window.heldStones.map(stone => ({
        // Include any relevant stone data here
//        size: stone.geometry.parameters.radius || 0.5
//    }));
}

function generatePlayerId() {
    // Generate a random ID
    return '_' + Math.random().toString(36).substring(2, 15);
}

function log(message) {
    if (MULTIPLAYER_CONFIG.debug) {
        console.log(`[Multiplayer] ${message}`);
    }
}

// Export functions for use in main game
window.initializeMultiplayer = initializeMultiplayer;
window.sendTowerCreated = sendTowerCreated;
window.sendTowerDestroyed = sendTowerDestroyed; 
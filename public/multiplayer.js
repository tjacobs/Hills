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
        // Create a group to hold all player parts
        this.mesh = new THREE.Group();
        
        // Create body (slimmer cylinder)
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513, // Brown for peasant clothing
            roughness: 0.8,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.8;
        this.mesh.add(body);
        
        // Add neck to connect head and body
        const neckGeometry = new THREE.CylinderGeometry(0.12, 0.15, 0.15, 8);
        const neckMaterial = new THREE.MeshStandardMaterial({
            color: 0xE0AC69, // Skin tone (same as head)
            roughness: 0.7,
            metalness: 0.1
        });
        const neck = new THREE.Mesh(neckGeometry, neckMaterial);
        neck.position.y = 1.35; // Position between head and body
        this.mesh.add(neck);
        
        // Create head (sphere)
        const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xE0AC69, // Skin tone
            roughness: 0.7,
            metalness: 0.1
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.6; // Raised slightly to accommodate neck
        this.mesh.add(head);
        
        // Add face features on the opposite side (negative Z)
        
        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.05, 6, 6);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        // Left eye
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.1, 1.65, -0.25); // Adjusted for new head position
        this.mesh.add(leftEye);
        
        // Right eye
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.1, 1.65, -0.25); // Adjusted for new head position
        this.mesh.add(rightEye);
        
        // Mouth
        const mouthGeometry = new THREE.BoxGeometry(0.15, 0.03, 0.03);
        const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
        mouth.position.set(0, 1.55, -0.28); // Adjusted for new head position
        this.mesh.add(mouth);
        
        // Create arms (cylinders)
        const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513, // Same as body
            roughness: 0.8,
            metalness: 0.1
        });
        
        // Left arm
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.4, 1.0, 0);
        leftArm.rotation.z = Math.PI / 4; // Angle outward
        this.mesh.add(leftArm);
        
        // Right arm
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.4, 1.0, 0);
        rightArm.rotation.z = -Math.PI / 4; // Angle outward
        this.mesh.add(rightArm);
        
        // Create legs (cylinders)
        const legGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 6);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321, // Darker brown for pants
            roughness: 0.8,
            metalness: 0.1
        });
        
        // Left leg
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.2, 0.1, 0);
        this.mesh.add(leftLeg);
        
        // Right leg
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.2, 0.1, 0);
        this.mesh.add(rightLeg);
        
        // Add a nametag
        this.createNametag();
        
        // Add to scene
        scene.add(this.mesh);
        
        // Raise the entire player slightly off the ground
        this.mesh.position.y = 0.2;
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
        sprite.position.y = 2.2; // Adjusted position above head (no hat now)
        
        this.nameTag = sprite;
        this.mesh.add(sprite);
    }
    
    updateFromData(data) {
        // Update position if provided
        if (data.position) {
            this.position.set(
                data.position.x,
                data.position.y - 2.8, // Adjusted from 3.0 to 2.8 to raise player slightly
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
            this.mesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
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
    setInterval(sendPlayerState, 33); // 30 updates per second
    
    // Set up regular cleanup of stale players
    setInterval(cleanupStalePlayers, 5000); // Check every 5 seconds    
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
            case 'welcome':
                break;
                
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
    return '' + Math.random().toString(26).substring(2, 6);
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
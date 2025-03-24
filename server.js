// WebSocket server for tower building game
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

// Create app
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Connections
const connections = new Map(); // Map playerId to WebSocket connection

// Game configuration
const CONFIG = {
    // World settings
    WORLD: {
        size: 200,
        maxTerrainHeight: 10,
        terrainXScale: 20,
        terrainYScale: 20,
        shoreRadius: 0.8,
        gravity: -9.8  // Moved from STONE to WORLD
    },
    
    // Stone settings
    STONE: {
        maxCount: 20,  // Maximum number of stones in the world
        bounce: 0.9,
        friction: 0.35,
        rollFactor: 0.25,
        maxVelocity: 0.5,
        stopThreshold: 0.05
    }
};

// Game state
const gameState = {
    players: {},
    towers: [],
    stones: new Map(),
    lastStoneSpawnTime: Date.now(),
    stoneSpawnInterval: 10000
};

// Broadcast message to all clients except sender
function broadcastToAll(message, excludeWs = null) {
    const messageStr = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

// PLAYER-RELATED FUNCTIONS

// Message handlers
function handlePlayerJoin(ws, data) {
    // Get player data
    const playerId = data.playerId;
    const { username, position, rotation } = data;
    console.log(`Player connected: ${playerId}`);
    
    // Store connection
    connections.set(playerId, ws);
    ws.playerId = playerId;
    
    // Add player to game state
    const playerData = {
        playerId: playerId,
        username,
        position,
        rotation,
        heldStones: [],
        lastUpdate: Date.now()
    };
    gameState.players[playerId] = playerData;
    
    // Send welcome message
    const welcomeMessage = {
        type: 'welcome',
        playerId,
        players: Object.values(gameState.players)
    };
    ws.send(JSON.stringify(welcomeMessage));
    
    // Notify other clients
    broadcastToAll({
        type: 'player_joined',
        playerId,
        username,
        position,
        rotation
    }, ws);
}

// Handle player update
function handlePlayerUpdate(ws, data) {
    const playerId = data.playerId;
    
    // Ensure player exists in game state
    if (!gameState.players[playerId]) {
        console.warn(`Update received for unknown player: ${playerId}`);
        return;
    }
    
    // Update player data
    gameState.players[playerId].position = data.position;
    gameState.players[playerId].rotation = data.rotation;
    gameState.players[playerId].lastUpdate = Date.now();
    
    // Broadcast update to all other clients
    broadcastToAll({
        type: 'player_updated',
        playerId: playerId,
        position: data.position,
        rotation: data.rotation,
        heldStones: data.heldStones || []
    }, ws);
}

// STONE-RELATED FUNCTIONS

function handleStoneUpdate(ws, data) {
    const { id, position, velocity, isStatic } = data;
    
    // Find and update stone in game state
    const stoneIndex = gameState.stones.findIndex(s => s.id === id);
    if (stoneIndex !== -1) {
        gameState.stones[stoneIndex] = {
            ...gameState.stones[stoneIndex],
            position,
            velocity,
            isStatic
        };
        
        // Broadcast update to all clients
        broadcastToAll({
            type: 'stone_update',
            stone: gameState.stones[stoneIndex]
        }, ws);
    }
}

function handleStonePickup(data) {
    const stone = gameState.stones.get(data.stoneId);
    if (stone && !stone.isHeld) {
        stone.isHeld = true;
        stone.heldBy = data.playerId;
        stone.isStatic = false;
        stone.velocity = { x: 0, y: 0, z: 0 };
        
        broadcastToAll({
            type: 'stone_pickup',
            stoneId: stone.id,
            playerId: data.playerId
        });
    }
}

function handleStoneThrow(data) {
    const stone = gameState.stones.get(data.stoneId);
    if (stone && stone.isHeld && stone.heldBy === data.playerId) {
        stone.position = data.position;
        stone.velocity = data.velocity;
        stone.isHeld = false;
        stone.heldBy = null;
        stone.isThrown = true;
        stone.throwTime = Date.now();
        stone.isStatic = false;
        
        broadcastToAll({
            type: 'stone_throw',
            stoneId: stone.id,
            position: stone.position,
            velocity: stone.velocity
        });
    }
}

// Function to create a random stone at the beach
function createRandomStone() {
    const beachEdge = CONFIG.WORLD.size / 2; // Define the edge of the world
    const position = {
        x: Math.random() * beachEdge * 2 - beachEdge, // Random x within the beach area
        y: CONFIG.STONE.height / 2, // Start above ground
        z: Math.random() * beachEdge * 2 - beachEdge // Random z within the beach area
    };
    const velocity = {
        x: 0,
        y: 0,
        z: 0
    };
    return new Stone(null, position, velocity);
}

// TOWER-RELATED FUNCTIONS

function handleTowerUpdate(ws, data) {
    const { id, position, level } = data;
    
    // Find or create tower
    let tower = gameState.towers.find(t => t.id === id);
    if (!tower) {
        tower = {
            id,
            position,
            level,
            createdAt: Date.now()
        };
        gameState.towers.push(tower);
    } else {
        tower.position = position;
        tower.level = level;
    }

    // Broadcast tower update to all clients
    broadcastToAll({
        type: 'tower_update',
        tower
    }, ws);
}

function handleTowerCreated(ws, data) {
    const tower = data.tower;
    
    // Add tower to game state
    gameState.towers.push(tower);
    
    // Broadcast to all clients except sender
    broadcastToAll({
        type: 'tower_created',
        tower: tower,
        createdBy: ws.playerId
    }, ws);
}

function handleTowerDestroyed(data) {
    const towerId = data.towerId;
    const towerIndex = gameState.towers.findIndex(t => t.id === towerId);
    if (towerIndex > -1) {
        gameState.towers.splice(towerIndex, 1);
        
        // Broadcast tower removal to all clients
        broadcastToAll({
            type: 'tower_removed',
            towerId: towerId
        });
    }
}

// GENERAL MESSAGE HANDLING

// Handler function
function handleRequestState(ws) {
    // Send current game state to requesting client
    ws.send(JSON.stringify({
        type: 'initial_state',
        players: Object.values(gameState.players),
        towers: gameState.towers,
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    }));
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    //console.log('Client connected');
    let playerId = null;

    // Send welcome message with initial state
    ws.send(JSON.stringify({
        type: 'initial_state',
        players: Object.values(gameState.players),
        towers: gameState.towers,
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    }));

    // Handle messages from clients
    ws.on('message', function(message) {
        try {
            const data = JSON.parse(message);
            
            // Route message to appropriate handler
            switch(data.type) {
                case 'player_join':
                    handlePlayerJoin(ws, data);
                    break;
                case 'player_update':
                    handlePlayerUpdate(ws, data);
                    break;
                case 'request_state':
                    handleRequestState(ws);
                    break;
                case 'stone_update':
                    handleStoneUpdate(ws, { ...data, playerId });
                    break;
                case 'tower_update':
                    handleTowerUpdate(ws, { ...data, playerId });
                    break;
                case 'tower_created':
                    handleTowerCreated(ws, data);
                    break;
                case 'stone_pickup':
                    handleStonePickup(data);
                    break;
                case 'stone_throw':
                    handleStoneThrow(data);
                    break;
                case 'tower_destroyed':
                    handleTowerDestroyed(data);
                    break;
                default:
                    console.log(`Unknown message type: ${data.type}`);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        const playerId = ws.playerId;
        console.log(`Player disconnected: ${playerId}`);
        
        // Remove from connections
        connections.delete(playerId);
        
        // Remove from game state
        delete gameState.players[playerId];
        
        // Notify other clients
        broadcastToAll({
            type: 'player_left',
            playerId: playerId
        });
    });
});

// Game update loop
const TICK_RATE = 60;
const TICK_TIME = 1000 / TICK_RATE;
let lastUpdate = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdate) / 1000;
    lastUpdate = now;

    // Check if we should spawn a new stone
    if (now - gameState.lastStoneSpawnTime > gameState.stoneSpawnInterval && 
        gameState.stones.size < CONFIG.STONE.maxCount) {
        const stone = createRandomStone();
        console.log('Stone created:', {
            id: stone.id,
            position: stone.position,
            isHeld: stone.isHeld,
            isStatic: stone.isStatic
        });
        gameState.stones.set(stone.id, stone);
        gameState.lastStoneSpawnTime = now;

        // Log the stone data being broadcast
        const serializedStone = stone.serialize();
        console.log('Broadcasting stone:', serializedStone);
        
        // Broadcast stone creation
        broadcastToAll({
            type: 'stone_spawned',
            stone: stone.serialize()
        });
    }

    // Update all stones
    for (const stone of gameState.stones.values()) {
        stone.update(deltaTime);
    }

    // Broadcast stone positions
    broadcastToAll({
        type: 'stone_positions',
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    });
}, TICK_TIME);

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
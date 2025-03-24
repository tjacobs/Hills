// WebSocket server for tower building game
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Add at the top with other state
const connections = new Map(); // Map playerId to WebSocket connection

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

// Message handlers
function handlePlayerJoin(ws, data) {
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
  }, ws); // Send to all except sender
}

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
  
  broadcastToAll({
    type: 'tower_update',
    tower
  }, ws);
}

// Broadcast message to all clients except sender
function broadcastToAll(message, excludeWs = null) {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Add the handler function
function handleRequestState(ws) {
    // Send current game state to requesting client
    ws.send(JSON.stringify({
        type: 'initial_state',
        players: Object.values(gameState.players),
        towers: gameState.towers,
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    }));
}

// Add this function to handle tower creation
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

// Stone class definition
class Stone {
    constructor(id = null) {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.position = { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.size = 1;
        this.isHeld = false;
        this.heldBy = null;
    }

    static generateSpawnPosition() {
        const x = (Math.random() - 0.5) * 100;
        const y = -10; // Ocean floor
        const z = (Math.random() - 0.5) * 100;
        return { x, y, z };
    }

    static createRandom() {
        const stone = new Stone();
        const spawnPos = Stone.generateSpawnPosition();
        
        stone.position = spawnPos;
        stone.velocity = {
            x: 0,
            y: 15 + Math.random() * 5, // Initial upward velocity
            z: 0
        };
        
        return stone;
    }

    update(deltaTime) {
        if (this.isHeld) return;

        // Basic physics update
        this.velocity.y -= 9.8 * deltaTime;
        
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Stop at ocean floor
        if (this.position.y < -10) {
            this.position.y = -10;
            this.velocity.y = 0;
        }
    }

    serialize() {
        return {
            id: this.id,
            position: this.position,
            velocity: this.velocity,
            size: this.size,
            isHeld: this.isHeld,
            heldBy: this.heldBy
        };
    }
}

// Game state
const gameState = {
    players: {},
    towers: [],
    stones: new Map(),
    lastStoneSpawnTime: Date.now(),
    stoneSpawnInterval: 2000 // Spawn every 2 seconds
};

// Game update loop
const TICK_RATE = 60;
const TICK_TIME = 1000 / TICK_RATE;
let lastUpdate = Date.now();

setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdate) / 1000;
    lastUpdate = now;

    // Update all stones
    for (const stone of gameState.stones.values()) {
        stone.update(deltaTime);
    }

    // Check if we should spawn a new stone
    if (now - gameState.lastStoneSpawnTime > gameState.stoneSpawnInterval) {
        const stone = Stone.createRandom();
        gameState.stones.set(stone.id, stone);
        gameState.lastStoneSpawnTime = now;

        // Broadcast stone creation
        broadcastToAll({
            type: 'stone_spawned',
            stone: stone.serialize()
        });
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
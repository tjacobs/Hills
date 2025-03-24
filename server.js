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

// Game state
const gameState = {
  players: {},
  towers: [],
  stones: [],
  lastStoneSpawnTime: Date.now()
};

// Add at the top with other state
const connections = new Map(); // Map playerId to WebSocket connection

// Stone spawning configuration
const STONE_SPAWN_CONFIG = {
  interval: 5000,  // Spawn stones every 5 seconds
  maxStones: 20,   // Maximum stones in the world
  spawnRadius: 100 // Radius within which stones can spawn
};

// Spawn stones periodically
if (false)
setInterval(() => {
  if (gameState.stones.length < STONE_SPAWN_CONFIG.maxStones) {
    const stone = spawnStone();
    broadcastToAll({
      type: 'stone_spawned',
      stone: stone
    });
  }
}, STONE_SPAWN_CONFIG.interval);

function generatePlayerId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function spawnStone() {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * STONE_SPAWN_CONFIG.spawnRadius;
  
  const stone = {
    id: generatePlayerId(), // Using same ID generator for stones
    position: {
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius
    },
    velocity: { x: 0, y: 0, z: 0 },
    isStatic: true
  };
  
  gameState.stones.push(stone);
  return stone;
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  let playerId = null;

  // Send welcome message with initial state
  ws.send(JSON.stringify({
    type: 'initial_state',
    players: Object.values(gameState.players),
    towers: gameState.towers,
    stones: gameState.stones
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

// Handle player join
function handlePlayerJoin(ws, data) {
    const playerId = data.playerId;
    const { username, position, rotation } = data;
    
    console.log(`Player ${username} (${playerId}) joined`);
    
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
        stones: gameState.stones
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

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
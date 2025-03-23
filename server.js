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
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Process message based on type
      switch (data.type) {
        case 'player_join':
          handlePlayerJoin(ws, { ...data, playerId });
          break;
          
        case 'player_update':
          handlePlayerUpdate(ws, { ...data, playerId });
          break;
          
        case 'stone_update':
          handleStoneUpdate(ws, { ...data, playerId });
          break;
          
        case 'tower_update':
          handleTowerUpdate(ws, { ...data, playerId });
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle client disconnection
  ws.on('close', () => handlePlayerDisconnect(ws));
});

// Handle player join
function handlePlayerJoin(ws, data) {
  const playerId = generatePlayerId();
  const { username, position, rotation } = data;
  
  // Store connection
  connections.set(playerId, ws);
  ws.playerId = playerId; // Store playerId on socket for disconnect
  
  console.log(`Player ${username} (${playerId}) joined`);
  
  // Add player to game state
  gameState.players[playerId] = {
    playerId,
    username,
    position,
    rotation,
    heldStones: [],
    lastUpdate: Date.now()
  };
  
  // Send welcome message to new player
  console.log('Sending welcome message:', { type: 'welcome', playerId });
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId
  }));
  
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
  const { playerId, position, rotation, heldStones } = data;
  
  // Update player in game state
  if (gameState.players[playerId]) {
    gameState.players[playerId].position = position;
    gameState.players[playerId].rotation = rotation;
    gameState.players[playerId].heldStones = heldStones || [];
    gameState.players[playerId].lastUpdate = Date.now();
    
    // Debug log
    console.log('Broadcasting player update:', playerId, position);
    
    // Broadcast update to other clients
    broadcastToAll({
      type: 'player_update',
      playerId,
      position,
      rotation,
      heldStones
    }, ws);
  }
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

function handlePlayerDisconnect(ws) {
  const playerId = ws.playerId;
  if (playerId) {
    console.log(`Player ${playerId} disconnected`);
    
    // Remove from connections map
    connections.delete(playerId);
    
    // Remove player from game state
    delete gameState.players[playerId];
    
    // Notify other clients
    broadcastToAll({
      type: 'player_left',
      playerId
    });
  }
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

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
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
  towers: []
};

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  let playerId = null;

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to tower building game server'
  }));

  // Handle messages from clients
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Process message based on type
      switch (data.type) {
        case 'join':
          handlePlayerJoin(ws, data);
          playerId = data.playerId;
          break;
          
        case 'update':
          handlePlayerUpdate(ws, data);
          break;
          
        case 'tower_created':
          handleTowerCreated(ws, data);
          break;
          
        case 'tower_destroyed':
          handleTowerDestroyed(ws, data);
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    if (playerId) {
      console.log(`Player ${playerId} disconnected`);
      
      // Remove player from game state
      delete gameState.players[playerId];
      
      // Notify other clients
      broadcastToAll({
        type: 'player_left',
        playerId: playerId
      }, null);
    }
  });
});

// Handle player join
function handlePlayerJoin(ws, data) {
  const { playerId, username, position, rotation } = data;
  
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
  
  // Send full game state to new player
  ws.send(JSON.stringify({
    type: 'full_state',
    players: Object.values(gameState.players),
    towers: gameState.towers
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

// Handle tower creation
function handleTowerCreated(ws, data) {
  const { playerId, tower } = data;
  
  console.log(`Player ${playerId} created a tower`);
  
  // Add tower to game state
  const towerIndex = gameState.towers.length;
  gameState.towers.push({
    ...tower,
    createdBy: playerId,
    createdAt: Date.now()
  });
  
  // Broadcast to other clients
  broadcastToAll({
    type: 'tower_created',
    playerId,
    tower,
    towerIndex
  }, ws);
}

// Handle tower destruction
function handleTowerDestroyed(ws, data) {
  const { playerId, towerIndex } = data;
  
  console.log(`Player ${playerId} destroyed tower at index ${towerIndex}`);
  
  // Remove tower from game state
  if (towerIndex >= 0 && towerIndex < gameState.towers.length) {
    gameState.towers.splice(towerIndex, 1);
    
    // Broadcast to other clients
    broadcastToAll({
      type: 'tower_destroyed',
      playerId,
      towerIndex
    }, ws);
  }
}

// Broadcast message to all clients except sender
function broadcastToAll(message, excludeWs) {
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
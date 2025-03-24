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
        case 'stone_thrown': {
          const stone = gameState.stones.get(data.stoneId);
          if (stone) {
            stone.position = data.position;
            stone.velocity = data.velocity;
            stone.isHeld = false;
            stone.heldBy = null;
            stone.isThrown = true;
            stone.throwTime = Date.now();
            stone.isStatic = false;
            
            // Broadcast the throw to all clients
            broadcastToAll({
              type: 'stone_thrown',
              stoneId: stone.id,
              position: stone.position,
              velocity: stone.velocity
            });
          }
          break;
        }
        case 'tower_destroyed': {
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
          break;
        }
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
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = false;
        this.throwTime = 0;
        this.isStatic = false;
    }

    static createRandom() {
        const stone = new Stone();
        
        // Choose a random side of the island
        const side = Math.floor(Math.random() * 4);
        const worldHalfSize = 100; // Match your world size
        const spawnDistance = worldHalfSize * 0.9; // Spawn from further out

        // Calculate spawn position
        switch (side) {
            case 0: // North
                stone.position.x = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                stone.position.z = -spawnDistance;
                break;
            case 1: // East
                stone.position.x = spawnDistance;
                stone.position.z = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                break;
            case 2: // South
                stone.position.x = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                stone.position.z = spawnDistance;
                break;
            case 3: // West
                stone.position.x = -spawnDistance;
                stone.position.z = (Math.random() * 2 - 1) * worldHalfSize * 0.8;
                break;
        }

        stone.position.y = 0;

        // Calculate direction toward island center
        const dirToCenter = {
            x: -stone.position.x,
            z: -stone.position.z
        };
        const distance = Math.sqrt(dirToCenter.x * dirToCenter.x + dirToCenter.z * dirToCenter.z);
        dirToCenter.x /= distance;
        dirToCenter.z /= distance;

        // Increase velocity for more dramatic arcs
        const horizontalSpeed = 2.0;  // Increased from 0.5
        const verticalSpeed = 3.0;    // Increased from 0.6
        stone.velocity.x = dirToCenter.x * horizontalSpeed;
        stone.velocity.z = dirToCenter.z * horizontalSpeed;
        stone.velocity.y = verticalSpeed;

        return stone;
    }

    update(deltaTime) {
        if (this.isHeld) return;

        // Apply gravity
        this.velocity.y -= 9.8 * deltaTime;

        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Get ground height at current position
        const groundHeight = this.getHeightAtPosition(this.position.x, this.position.z);
        const stoneRadius = 0.5; // Half height of stone
        const groundOffset = 0.05;

        // Ground collision check
        if (this.position.y < groundHeight + stoneRadius + groundOffset) {
            // Calculate slope for rolling physics
            const sampleDistance = 2.0;
            const heightNorth = this.getHeightAtPosition(this.position.x, this.position.z - sampleDistance);
            const heightSouth = this.getHeightAtPosition(this.position.x, this.position.z + sampleDistance);
            const heightEast = this.getHeightAtPosition(this.position.x + sampleDistance, this.position.z);
            const heightWest = this.getHeightAtPosition(this.position.x - sampleDistance, this.position.z);

            // Calculate slope vector
            const slopeX = (heightWest - heightEast) / (2 * sampleDistance);
            const slopeZ = (heightNorth - heightSouth) / (2 * sampleDistance);
            const slopeMagnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

            // Place stone on ground
            this.position.y = groundHeight + stoneRadius + groundOffset;

            // Bounce with damping
            if (this.velocity.y < -0.05) {
                this.velocity.y = -this.velocity.y * 0.3;
            } else {
                this.velocity.y = 0;
            }

            // Apply friction based on slope
            const frictionFactor = Math.max(0.75, 0.95 - slopeMagnitude * 5);
            this.velocity.x *= frictionFactor;
            this.velocity.z *= frictionFactor;

            // Apply slope force for rolling
            const rollFactor = 2; // Adjust this value to control rolling speed
            this.velocity.x += slopeX * rollFactor;
            this.velocity.z += slopeZ * rollFactor;

            // Extra downhill acceleration on steep slopes
            if (slopeMagnitude > 0.05) {
                const downhillDirection = {
                    x: slopeX / slopeMagnitude,
                    z: slopeZ / slopeMagnitude
                };
                const downhillFactor = slopeMagnitude * 0.1;
                
                this.velocity.x += downhillDirection.x * downhillFactor;
                this.velocity.z += downhillDirection.z * downhillFactor;
            }
        }

        // Check for water (beyond beach boundary)
        const distanceFromCenter = Math.sqrt(
            this.position.x * this.position.x + 
            this.position.z * this.position.z
        );
        const worldHalfSize = 100; // Adjust based on your world size
        const beachDistance = worldHalfSize * 0.95;
        
        if (distanceFromCenter > beachDistance) {
            // Calculate direction toward island center
            const dirToCenter = {
                x: -this.position.x / distanceFromCenter,
                z: -this.position.z / distanceFromCenter
            };
            
            // Apply wave force
            this.velocity.x += dirToCenter.x * 0.01;
            this.velocity.z += dirToCenter.z * 0.01;
            this.velocity.y += 0.008; // Gentle upward bobbing
        }

        // Air resistance
        const speed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.y * this.velocity.y +
            this.velocity.z * this.velocity.z
        );
        const airResistanceFactor = Math.max(0.95, 0.99 - speed * 0.1);
        this.velocity.x *= airResistanceFactor;
        this.velocity.y *= airResistanceFactor;
        this.velocity.z *= airResistanceFactor;

        // Check if stone has stopped
        const stopThreshold = 0.01;
        if (Math.abs(this.velocity.x) < stopThreshold && 
            Math.abs(this.velocity.y) < stopThreshold && 
            Math.abs(this.velocity.z) < stopThreshold) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.velocity.z = 0;
            this.isStatic = true;
        } else {
            this.isStatic = false;
        }
    }

    // Helper function to get height at position - this needs to match your terrain generation
    getHeightAtPosition(x, z) {
        // Simple example - replace with your actual terrain height calculation
        const distance = Math.sqrt(x * x + z * z);
        const maxHeight = 10;
        const radius = 100;
        
        if (distance > radius) return -10; // Water level
        
        // Basic island shape
        return maxHeight * (1 - (distance / radius) * (distance / radius));
    }

    serialize() {
        return {
            id: this.id,
            position: this.position,
            velocity: this.velocity,
            isHeld: this.isHeld,
            heldBy: this.heldBy,
            isThrown: this.isThrown,
            throwTime: this.throwTime,
            isStatic: this.isStatic
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
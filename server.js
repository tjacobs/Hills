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

// Add at the top with other state
const connections = new Map(); // Map playerId to WebSocket connection

// Game configuration
const CONFIG = {
    STONE: {
        maxCount: 200,
        gravity: -9.8,
        bounce: 0.9,
        friction: 0.35,
        rollFactor: 0.25,
        maxVelocity: 0.5,
        stopThreshold: 0.05
    },
    WORLD: {
        size: 200,
        maxTerrainHeight: 10,
        terrainXScale: 20,
        terrainYScale: 20,
        shoreRadius: 0.8
    }
};

// Handle WebSocket connections
wss.on('connection', (ws) => {
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
        case 'stone_pickup':
          handleStonePickup(data);
          break;
        case 'stone_throw':
          handleStoneThrow(data);
          break;
        case 'tower_update':
          handleTowerUpdate(ws, { ...data, playerId });
          break;
        case 'tower_created':
          handleTowerCreated(ws, data);
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

  // Broadcast tower update to all clients
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

// Handle tower creation
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

// Handle stone messages
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

// Handle tower destruction
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

class Terrain {
    constructor() {
        this.segments = 200;
        this.groundSize = CONFIG.WORLD.size;
        this.heightMap = [];
        this.createHeightmap();
    }

    createHeightmap() {
        const maxHeight = CONFIG.WORLD.maxTerrainHeight;
        const xs = CONFIG.WORLD.terrainXScale;
        const ys = CONFIG.WORLD.terrainYScale;

        // Initialize heightmap array
        for (let i = 0; i <= this.segments; i++) {
            this.heightMap[i] = [];
            for (let j = 0; j <= this.segments; j++) {
                // Calculate normalized coordinates (-1 to 1)
                const nx = (i / this.segments) * 2 - 1;
                const ny = (j / this.segments) * 2 - 1;
                
                // Calculate distance from center (0 to 1)
                const distFromCenter = Math.max(Math.abs(nx), Math.abs(ny));
                
                // Create sharper edge falloff factor (1 in center, 0 at edges)
                const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, 3));
                
                // Apply height with edge falloff
                this.heightMap[i][j] = Math.sin(i / xs) * Math.sin(j / ys) * maxHeight * edgeFalloff;
            }
        }
    }

    getHeightAtPosition(x, z) {
        // Convert world coordinates to heightmap indices
        const halfSize = this.groundSize / 2;
        const normalizedX = (x + halfSize) / this.groundSize;
        const normalizedZ = (z + halfSize) / this.groundSize;
        
        // Calculate grid indices
        const gridX = Math.floor(normalizedX * this.segments);
        const gridZ = Math.floor(normalizedZ * this.segments);
        
        // Ensure indices are within bounds
        if (gridX < 0 || gridX >= this.segments || 
            gridZ < 0 || gridZ >= this.segments) {
            return -10; // Water level for out of bounds
        }
        
        // Get heights at the four corners of the grid cell
        const h00 = this.heightMap[gridX][gridZ];
        const h10 = this.heightMap[Math.min(gridX + 1, this.segments)][gridZ];
        const h01 = this.heightMap[gridX][Math.min(gridZ + 1, this.segments)];
        const h11 = this.heightMap[Math.min(gridX + 1, this.segments)][Math.min(gridZ + 1, this.segments)];
        
        // Calculate fractional position within the grid cell
        const fx = normalizedX * this.segments - gridX;
        const fz = normalizedZ * this.segments - gridZ;
        
        // Bilinear interpolation
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        const height = h0 * (1 - fz) + h1 * fz;
        
        // Return height
        return height;
    }
}

// Create terrain instance and use it in Stone class
const terrain = new Terrain();

// Stone
class Stone {
    constructor(id = null, position = null, velocity = null) {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.position = position || { x: 0, y: 0, z: 0 };
        this.velocity = velocity || { x: 0, y: 0, z: 0 };
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = false;
        this.throwTime = 0;
        this.isStatic = false;
        this.lastUpdateTime = Date.now();
    }

    update(deltaTime) {
        if (this.isHeld) return;

        // Apply gravity
        this.velocity.y += CONFIG.STONE.gravity * deltaTime;

        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;
        this.position.z += this.velocity.z * deltaTime;

        // Get ground height at current position
        const groundHeight = terrain.getHeightAtPosition(this.position.x, this.position.z);
        const stoneRadius = CONFIG.STONE.height / 2;

        // Ground collision check
        if (this.position.y < groundHeight + stoneRadius) {
            this.position.y = groundHeight + stoneRadius;

            // Calculate slope for rolling
            const sampleDistance = 1.0;
            const heightNorth = terrain.getHeightAtPosition(this.position.x, this.position.z - sampleDistance);
            const heightSouth = terrain.getHeightAtPosition(this.position.x, this.position.z + sampleDistance);
            const heightEast = terrain.getHeightAtPosition(this.position.x + sampleDistance, this.position.z);
            const heightWest = terrain.getHeightAtPosition(this.position.x - sampleDistance, this.position.z);

            // Calculate slope vector
            const slopeX = (heightEast - heightWest) / (2 * sampleDistance);
            const slopeZ = (heightSouth - heightNorth) / (2 * sampleDistance);

            // Bounce with friction
            if (this.velocity.y < -0.1) {
                this.velocity.y = -this.velocity.y * CONFIG.STONE.bounce;
                this.velocity.x *= CONFIG.STONE.bounce;
                this.velocity.z *= CONFIG.STONE.bounce;
            } else {
                this.velocity.y = 0;
                
                // Apply slope force
                this.velocity.x += slopeX * CONFIG.STONE.gravity * deltaTime;
                this.velocity.z += slopeZ * CONFIG.STONE.gravity * deltaTime;
                
                // Apply friction
                const friction = this.isStatic ? CONFIG.STONE.friction * 2 : CONFIG.STONE.friction;
                this.velocity.x *= (1 - friction * deltaTime);
                this.velocity.z *= (1 - friction * deltaTime);
            }

            // Check if stone has come to rest
            const speed = Math.sqrt(
                this.velocity.x * this.velocity.x + 
                this.velocity.y * this.velocity.y + 
                this.velocity.z * this.velocity.z
            );
            
            if (speed < CONFIG.STONE.stopThreshold) {
                this.velocity.x = 0;
                this.velocity.y = 0;
                this.velocity.z = 0;
                this.isStatic = true;
                this.isThrown = false;
            }
        }
    }

    serialize() {
        return {
            id: this.id,
            position: this.position,
            velocity: this.velocity,
            isHeld: this.isHeld,
            heldBy: this.heldBy,
            isThrown: this.isThrown,
            isStatic: this.isStatic
        };
    }
}

// Function to create a random stone at the beach
function createRandomStone() {
    const spawnRadius = 20;
    const spawnHeight = 10;  // Fixed height above ground
    
    const position = {
        x: Math.random() * spawnRadius * 2 - spawnRadius,
        y: spawnHeight,
        z: Math.random() * spawnRadius * 2 - spawnRadius
    };
    
    const velocity = {
        x: 0,
        y: 0,
        z: 0
    };
    
    const stone = new Stone(null, position, velocity);
    
    // Log initial position
    console.log(`New stone created: id=${stone.id} pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
    
    return stone;
}

// Game state
const gameState = {
    players: {},
    towers: [],
    stones: new Map(),
    lastStoneSpawnTime: Date.now(),
    stoneSpawnInterval: 10000
};

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
        console.log(`Stone spawned: id=${stone.id} pos=(${stone.position.x.toFixed(1)}, ${stone.position.y.toFixed(1)}, ${stone.position.z.toFixed(1)})`);
        gameState.stones.set(stone.id, stone);
        gameState.lastStoneSpawnTime = now;

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

    // Log positions of first 3 stones
    const firstThreeStones = Array.from(gameState.stones.values()).slice(0, 3);
    firstThreeStones.forEach(stone => {
        console.log(`Stone update: id=${stone.id} pos=(${stone.position.x.toFixed(1)}, ${stone.position.y.toFixed(1)}, ${stone.position.z.toFixed(1)})`);
    });
}, TICK_TIME);

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
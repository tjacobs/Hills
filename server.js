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

// Connections, map playerId to WebSocket connection
const connections = new Map();

// Game configuration
const CONFIG = {
    STONE: {
        maxCount: 200,          // Maximum number of stones in world
        bounce: 0.9,            // How bouncy stones are on collision
        friction: 0.35,         // Ground friction coefficient
        rollFactor: 0.25,       // How easily stones roll on slopes
        maxVelocity: 0.5,       // Maximum stone velocity
        stopThreshold: 0.05,    // Velocity threshold for coming to rest
        waveStrength: 0.05,     // Strength of water wave effect
        radius: 0.5             // Stone collision radius
    },
    WORLD: {
        gravity: -9.8,          // World gravity constant
        size: 200,              // World size (ground plane dimensions)
        maxTerrainHeight: 5,    // Maximum height of terrain
        terrainXScale: 8,       // Terrain scale X
        terrainYScale: 8,       // Terrain scale Z
        shoreRadius: 0.9        // Radius where beach turns to water (0-1)
    },
    PHYSICS: {
        speedMultiplier: 20     // Global physics speed multiplier
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
          handleStonePickup({ ...data, playerId: ws.playerId });
          break;
        case 'stone_throw':
          handleStoneThrow(ws, data);
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
    console.log('Stone pickup request:', {
        stoneId: data.stoneId,
        playerId: data.playerId
    });
    
    const stone = gameState.stones.get(data.stoneId);
    console.log('Found stone:', stone ? 'yes' : 'no');
    
    if (stone) {
        console.log('Stone state:', {
            isHeld: stone.isHeld,
            heldBy: stone.heldBy,
            isStatic: stone.isStatic
        });
    }
    
    if (stone && !stone.isHeld) {
        stone.isHeld = true;
        stone.heldBy = data.playerId;
        stone.isStatic = false;
        stone.velocity = { x: 0, y: 0, z: 0 };
        
        console.log('Stone pickup successful, broadcasting to all');
        
        broadcastToAll({
            type: 'stone_pickup',
            stoneId: stone.id,
            playerId: data.playerId
        });
    }
}

function handleStoneThrow(ws, data) {
    const stone = gameState.stones.get(data.stoneId);
    console.log('Stone throw request:', {
        stoneId: data.stoneId,
        playerId: data.playerId
    });
    if (stone && stone.heldBy === ws.playerId) {
        stone.position = data.position;
        stone.velocity = data.velocity;
        stone.isHeld = false;
        stone.heldBy = null;
        stone.isThrown = true;
        stone.throwTime = Date.now();
        stone.isStatic = false;
       console.log('Stone thrown:', stone.id);
        broadcastToAll({
            type: 'stone_throw',
            stoneId: stone.id,
            playerId: ws.playerId,
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
        console.log("Creating terrain: segments=", this.segments, "groundSize=", this.groundSize);
        this.createHeightmap();
    }

    getHeightAtPosition(x, z) {
        // Convert world coordinates to heightmap indices
        // IMPORTANT: Swap the Z and X coordinates to account for the plane rotation
        const halfSize = this.groundSize / 2;
        const normalizedX = (z + halfSize) / this.groundSize; // Swap z instead of x
        const normalizedZ = (x + halfSize) / this.groundSize; // Swap x instead of z
        
        // Calculate grid indices
        const gridX = Math.floor(normalizedX * this.segments);
        const gridZ = Math.floor(normalizedZ * this.segments);
        
        // Debug log coordinates
        //console.log("Server height lookup: world(", x.toFixed(1), ",", z.toFixed(1), 
        //           ") -> normalized(", normalizedX.toFixed(2), ",", normalizedZ.toFixed(2), 
        //           ") -> grid(", gridX, ",", gridZ, ")");
        
        // Ensure indices are within bounds
        if (gridX < 0 || gridX >= this.segments || 
            gridZ < 0 || gridZ >= this.segments) {
            return 0;
        }
        
        // Get heights at the four corners of the grid cell
        const h00 = this.heightMap[gridX][gridZ];
        const h10 = this.heightMap[Math.min(gridX + 1, this.segments)][gridZ];
        const h01 = this.heightMap[gridX][Math.min(gridZ + 1, this.segments)];
        const h11 = this.heightMap[Math.min(gridX + 1, this.segments)][Math.min(gridZ + 1, this.segments)];
        
        //console.log("Server heights: h00=", h00.toFixed(1), "h10=", h10.toFixed(1), 
        //           "h01=", h01.toFixed(1), "h11=", h11.toFixed(1));
        
        // Calculate fractional position within the grid cell
        const fx = normalizedX * this.segments - gridX;
        const fz = normalizedZ * this.segments - gridZ;
        
        // Bilinear interpolation
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        const height = h0 * (1 - fz) + h1 * fz;
        
        //console.log("Server interpolated height=", height.toFixed(1), 
        //           "(fx=", fx.toFixed(2), "fz=", fz.toFixed(2), ")");
        
        return height;
    }

    createHeightmap() {
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
                
                // Use the same formula as we want in game.js
                const xs = CONFIG.WORLD.terrainXScale;
                const ys = CONFIG.WORLD.terrainYScale;
                const maxHeight = CONFIG.WORLD.maxTerrainHeight;
                
                // Two-dimensional hills with both sine functions
                this.heightMap[i][j] = Math.sin(i / xs) * Math.sin(j / ys) * maxHeight * edgeFalloff;
            }
        }
    }
}

// Create terrain instance and use it in Stone class
const terrain = new Terrain();

// Stone
class Stone {
    constructor(id = null, position = null, velocity = null) {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.position = position || { x: 0, y: 10, z: 0 };
        this.velocity = velocity || { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.isHeld = false;
        this.heldBy = null;
        this.isThrown = false;
        this.throwTime = 0;
        this.isStatic = false;
        this.radius = 0.5;
    }

    update(deltaTime) {
        if (this.isHeld) return;
        
        const multiplier = CONFIG.PHYSICS.speedMultiplier;
        const gravityMultiplier = multiplier * 0.5;

        // Store previous position for rotation calculation
        const prevX = this.position.x;
        const prevZ = this.position.z;
        
        // Apply gravity with reduced multiplier
        this.velocity.y += CONFIG.WORLD.gravity * deltaTime * gravityMultiplier;
        
        // Update position - use full multiplier for X and Z, reduced for Y
        this.position.x += this.velocity.x * deltaTime * multiplier;
        this.position.y += this.velocity.y * deltaTime * gravityMultiplier;
        this.position.z += this.velocity.z * deltaTime * multiplier;
        
        // Calculate movement direction and speed for rotation
        const dx = this.position.x - prevX;
        const dz = this.position.z - prevZ;
        const moveSpeed = Math.sqrt(dx * dx + dz * dz);
        
        // Calculate rotation based on movement
        // Roll around Z axis when moving in X direction
        this.rotation.z -= dx * 1; // Adjust multiplier for faster/slower rotation
        
        // Roll around X axis when moving in Z direction
        this.rotation.x += dz * 1; // Adjust multiplier for faster/slower rotation
        
        // Normalize rotation angles to stay within 0-2π
        this.rotation.x = this.rotation.x % (Math.PI * 2);
        this.rotation.z = this.rotation.z % (Math.PI * 2);
        
        // Calculate distance from center for water check
        const distanceFromCenter = Math.sqrt(
            this.position.x * this.position.x + 
            this.position.z * this.position.z
        );
        
        const worldHalfSize = CONFIG.WORLD.size / 2;
        const beachDistance = worldHalfSize * CONFIG.WORLD.shoreRadius;
        
        // Check if in water
        const isInWater = distanceFromCenter > beachDistance;
        
        // Apply water forces
        if (isInWater) {
            // Calculate direction toward center
            const magnitude = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
            const dirX = -this.position.x / magnitude;
            const dirZ = -this.position.z / magnitude;
            
            // Apply wave force
            this.velocity.x += dirX * CONFIG.STONE.waveStrength * multiplier;
            this.velocity.z += dirZ * CONFIG.STONE.waveStrength * multiplier;
            this.velocity.y += CONFIG.STONE.waveStrength * (multiplier * 0.16); // Upward bias
        }
        
        // Get ground height and calculate slope
        const groundHeight = terrain.getHeightAtPosition(this.position.x, this.position.z);
        const stoneHeight = 0.5;
        const stoneRadius = stoneHeight / 2;
        const groundOffset = 0.01;
        const collisionThreshold = groundHeight + stoneRadius + groundOffset;
        
        // Sample heights for slope calculation
        const sampleDistance = 2.0;
        const heightNorth = terrain.getHeightAtPosition(this.position.x, this.position.z - sampleDistance);
        const heightSouth = terrain.getHeightAtPosition(this.position.x, this.position.z + sampleDistance);
        const heightEast = terrain.getHeightAtPosition(this.position.x + sampleDistance, this.position.z);
        const heightWest = terrain.getHeightAtPosition(this.position.x - sampleDistance, this.position.z);
        
        // Calculate slope
        const slopeX = (heightWest - heightEast) / (2 * sampleDistance);
        const slopeZ = (heightNorth - heightSouth) / (2 * sampleDistance);
        const slopeMagnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
        
        // Ground collision
        if (this.position.y < collisionThreshold) {
            this.position.y = collisionThreshold;
            
            // Bounce with damping
            if (this.velocity.y < -0.05) {
                this.velocity.y = -this.velocity.y * CONFIG.STONE.bounce;
            } else {
                this.velocity.y = 0;
            }
            
            // Apply friction based on slope
            const frictionFactor = Math.max(0.5, 0.8 - slopeMagnitude * multiplier);
            this.velocity.x *= frictionFactor;
            this.velocity.z *= frictionFactor;
            
            // Apply slope forces
            this.velocity.x += slopeX * CONFIG.STONE.rollFactor * multiplier;
            this.velocity.z += slopeZ * CONFIG.STONE.rollFactor * multiplier;
            
            // Extra downhill acceleration on steep slopes
            if (slopeMagnitude > 0.05) {
                const magnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
                const downhillX = slopeX / magnitude;
                const downhillZ = slopeZ / magnitude;
                const downhillFactor = slopeMagnitude * (multiplier * 0.02);
                
                this.velocity.x += downhillX * downhillFactor;
                this.velocity.z += downhillZ * downhillFactor;
            }
        }
        
        // Cap maximum velocity
        const speed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.y * this.velocity.y +
            this.velocity.z * this.velocity.z
        );
        
        if (speed > CONFIG.STONE.maxVelocity) {
            const scale = CONFIG.STONE.maxVelocity / speed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
            this.velocity.z *= scale;
        }
        
        // Check if stone has stopped
        if (Math.abs(this.velocity.x) < CONFIG.STONE.stopThreshold && 
            Math.abs(this.velocity.y) < CONFIG.STONE.stopThreshold && 
            Math.abs(this.velocity.z) < CONFIG.STONE.stopThreshold) {
            this.velocity = { x: 0, y: 0, z: 0 };
            this.isStatic = true;
        } else {
            this.isStatic = false;
        }
    }

    serialize() {
        return {
            id: this.id,
            position: this.position,
            velocity: this.velocity,
            rotation: this.rotation,
            isHeld: this.isHeld,
            heldBy: this.heldBy,
            isThrown: this.isThrown,
            isStatic: this.isStatic
        };
    }
}

// Function to create a random stone at the beach
function createRandomStone() {
    const worldSize = CONFIG.WORLD.size;
    const shoreRadius = CONFIG.WORLD.shoreRadius;
    const spawnHeight = -8;  // Start deeper below water
    const upwardVelocity = 1.5;  // Stronger upward velocity
    
    // Choose a random edge (0-3: North, East, South, West)
    const edge = Math.floor(Math.random() * 4);
    
    // Calculate spawn position based on chosen edge
    let position = { x: 0, y: spawnHeight, z: 0 };
    let velocity = { x: 0, y: upwardVelocity, z: 0 };
    
    const edgeDistance = (worldSize / 2) * shoreRadius * 1.2; // Much further out from shore
    const randomOffset = (Math.random() - 0.5) * worldSize * 0.6; // Wider spread along edge
    
    switch(edge) {
        case 0: // North
            position.z = -edgeDistance;
            position.x = randomOffset;
            velocity.z = 0.4;
            break;
        case 1: // East
            position.x = edgeDistance;
            position.z = randomOffset;
            velocity.x = -0.4;
            break;
        case 2: // South
            position.z = edgeDistance;
            position.x = randomOffset;
            velocity.z = -0.4;
            break;
        case 3: // West
            position.x = -edgeDistance;
            position.z = randomOffset;
            velocity.x = 0.4;
            break;
    }
    
    // Create stone with position and initial velocity
    const stone = new Stone(null, position, velocity);
    
    // Log initial position
    console.log(`New stone spawned at edge ${edge}: pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
    
    return stone;
}

// Game state
const gameState = {
    players: {},
    towers: [],
    stones: new Map(),
    lastStoneSpawnTime: Date.now(),
    stoneSpawnInterval: 1000
};

// Game update loop
const TICK_RATE = 60;
const TICK_TIME = 1000 / TICK_RATE;
let lastUpdate = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = (now - lastUpdate) / 1000;
    lastUpdate = now;

    // Update held stones positions based on their holders
    for (const stone of gameState.stones.values()) {
        if (stone.isHeld && stone.heldBy) {
            const player = gameState.players[stone.heldBy];
            if (player) {
                // Calculate position in front of player
                const forward = {
                    x: -Math.sin(player.rotation.y),
                    y: 0,
                    z: -Math.cos(player.rotation.y)
                };
                
                // Position stone in front and slightly up from player
                stone.position = {
                    x: player.position.x + (forward.x * 1),
                    y: player.position.y - 1,
                    z: player.position.z + (forward.z * 1)
                };
                
                stone.velocity = { x: 0, y: 0, z: 0 };
            }
        }
    }

    // Check if we should spawn a new stone
    if (now - gameState.lastStoneSpawnTime > gameState.stoneSpawnInterval && 
        gameState.stones.size < CONFIG.STONE.maxCount) {
        const stone = createRandomStone();
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
    //const firstThreeStones = Array.from(gameState.stones.values()).slice(0, 3);
    //firstThreeStones.forEach(stone => {
    //    console.log(`Stone update: id=${stone.id} pos=(${stone.position.x.toFixed(1)}, ${stone.position.y.toFixed(1)}, ${stone.position.z.toFixed(1)})`);
    //});
}, TICK_TIME);

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
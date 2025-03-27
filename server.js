// WebSocket server for tower building game
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

// Load shared config
const CONFIG = require('./public/js/config.js');

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
        case 'stone_pickup':
          handleStonePickup({ ...data, playerId: ws.playerId });
          break;
        case 'stone_throw':
          handleStoneThrow(ws, data);
          break;
        case 'tower_destack':
          handleTowerDestack(ws, data);
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

    handleDisconnect(ws);
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

// Broadcast message to all clients except sender
function broadcastToAll(message, excludeWs = null) {
  const messageStr = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  });
}

// Initial state request
function handleRequestState(ws) {
    // Send current game state to requesting client
    ws.send(JSON.stringify({
        type: 'initial_state',
        players: Object.values(gameState.players),
        towers: gameState.towers,
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    }));
}

// Handle stone messages
function handleStonePickup(data) {
    // Log
    console.log('Stone pickup:', {
        stoneId: data.stoneId,
        playerId: data.playerId
    });

    // Pick up stone
    const stone = gameState.stones.get(data.stoneId);
    if (stone && !stone.isHeld) {
        stone.isHeld = true;
        stone.heldBy = data.playerId;
        stone.isStatic = false;
        stone.velocity = { x: 0, y: 0, z: 0 };
        
        // Set rotation to almost flat but with slight random tilt
        const smallTilt = (Math.random() - 0.5) * 0.2; // Random tilt ±0.1 radians (about ±5.7 degrees)
        stone.rotation = { 
            x: smallTilt,
            y: 0,
            z: smallTilt
        };

        // Broadcast stone pickup
        broadcastToAll({
            type: 'stone_pickup',
            stoneId: stone.id,
            playerId: data.playerId
        });
    }
}

function handleStoneThrow(ws, data) {
    // Get stone
    const stone = gameState.stones.get(data.stoneId);
    if (stone && stone.heldBy === ws.playerId) {
        // Add random spread to velocity
        const spreadAngle = Math.PI / 6; // 30 degrees spread
        const randomSpread = (Math.random() - 0.5) * spreadAngle;
        const throwForce = 5 + Math.random() * 2; // Random force between 5-7
        
        // Calculate velocity with spread and force
        const throwAngle = Math.atan2(data.velocity.x, data.velocity.z) + randomSpread;
        const velocity = {
            x: Math.sin(throwAngle) * throwForce,
            y: 2 + Math.random(), // Random upward force between 2-3
            z: Math.cos(throwAngle) * throwForce
        };
        
        // Set stone state
        stone.position = data.position;
        stone.velocity = velocity;
        stone.isHeld = false;
        stone.heldBy = null;
        stone.isThrown = true;
        stone.throwTime = Date.now();
        stone.isStatic = false;
        
        // Broadcast stone throw
        broadcastToAll({
            type: 'stone_throw',
            stoneId: stone.id,
            playerId: ws.playerId,
            position: stone.position,
            velocity: velocity
        });
    }
}

function handleDisconnect(ws) {
    // Drop all stones held by disconnecting player
    for (const stone of gameState.stones.values()) {
        if (stone.heldBy === ws.playerId) {
            stone.isHeld = false;
            stone.heldBy = null;
            stone.isThrown = true;
            stone.throwTime = Date.now();
            stone.isStatic = false;
            stone.velocity = { x: 0, y: 0, z: 0 };
            
            // Broadcast stone drop to all clients
//            broadcastToAll({
//                type: 'stone_dropped',
//                stoneId: stone.id,
//                playerId: ws.playerId
//            });
        }
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
        const halfSize = this.groundSize / 2;
        const normalizedX = (z + halfSize) / this.groundSize; // Swap z instead of x
        const normalizedZ = (x + halfSize) / this.groundSize; // Swap x instead of z
        
        // Calculate grid indices
        const gridX = Math.floor(normalizedX * this.segments);
        const gridZ = Math.floor(normalizedZ * this.segments);
        
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

    createHeightmap() {
        // Create heightmap
        for (let i = 0; i <= this.segments; i++) {
            this.heightMap[i] = [];
            for (let j = 0; j <= this.segments; j++) {
                // Calculate normalized coordinates (-1 to 1)
                const nx = (i / this.segments) * 2 - 1;
                const ny = (j / this.segments) * 2 - 1;
                
                // Calculate distance from center (0 to 1)
                const distFromCenter = Math.max(Math.abs(nx), Math.abs(ny));
                
                // Create edge falloff factor
                const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, CONFIG.WORLD.edgeFalloff));
                
                // Use the same formula as we want in game.js
                const xs = CONFIG.WORLD.terrainXScale;
                const ys = CONFIG.WORLD.terrainYScale;
                const maxHeight = CONFIG.WORLD.maxTerrainHeight;
                
                // Two-dimensional hills with both sine functions
                this.heightMap[i][j] = Math.max(CONFIG.WORLD.minTerrainHeight, Math.sin(i / xs) * Math.sin(j / ys) * maxHeight * edgeFalloff);
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
        // If stone is held, don't update position
        if (this.isHeld) return;
        
        // Multiplier
        const multiplier = CONFIG.PHYSICS.speedMultiplier;
        const gravityMultiplier = multiplier * 0.2;

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

        // Get sizes
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
            
            // Apply friction to help stones come to rest
            const frictionFactor = CONFIG.STONE.friction;
            this.velocity.x *= frictionFactor;
            this.velocity.z *= frictionFactor;
            
            // Apply slope forces
            this.velocity.x += slopeX * CONFIG.STONE.rollFactor * multiplier;
            this.velocity.z += slopeZ * CONFIG.STONE.rollFactor * multiplier;
            
            // Extra downhill acceleration on steep slopes
            if (false && slopeMagnitude > 0.05) {
                const magnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
                const downhillX = slopeX / magnitude;
                const downhillZ = slopeZ / magnitude;
                const downhillFactor = slopeMagnitude * (multiplier * 0.02);
                this.velocity.x += downhillX * downhillFactor;
                this.velocity.z += downhillZ * downhillFactor;
            }
        }
        
        // Cap velocity
        if (moveSpeed > CONFIG.STONE.maxVelocity) {
            const scale = CONFIG.STONE.maxVelocity / moveSpeed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
            this.velocity.z *= scale;
        }

        // Check if stone has come to rest
        const horizontalVelocity = Math.sqrt(
            this.velocity.x * this.velocity.x + 
            this.velocity.z * this.velocity.z
        );
        
        // Mark as static if horizontal velocity is below threshold
        if (horizontalVelocity < CONFIG.STONE.stopThreshold && !this.isStatic) {
            this.isStatic = true;
        } else if (horizontalVelocity >= CONFIG.STONE.stopThreshold && this.isStatic) {
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

// Create a random stone at the beach
function createRandomStone() {
    const worldSize = CONFIG.WORLD.size;
    const shoreRadius = CONFIG.WORLD.shoreRadius;
    const spawnHeight = -8;
    const upwardVelocity = 1.5;
    
    // Choose a random edge (0-3: North, East, South, West)
    const edge = Math.floor(Math.random() * 4);
    
    // Calculate spawn position based on chosen edge
    let position = { x: 0, y: spawnHeight, z: 0 };
    let velocity = { x: 0, y: upwardVelocity, z: 0 };
    const edgeDistance = (worldSize / 2) * shoreRadius * 1.2;
    const randomOffset = (Math.random() - 0.5) * worldSize * 0.6;
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
    
    // Return stone
    return stone;
}

// Add this function to generate IDs
function generateId(prefix = '') {
    return prefix + Math.random().toString(36).substr(2, 9);
}

// Cloud class for server
class Cloud {
    constructor(id = null, position = { x: 0, y: 0, z: 0 }) {
        this.id = id || generateId('cloud_');
        this.position = position;
        this.speed = 0.5 + Math.random() * 1.5;
        this.direction = normalizeVector({
            x: Math.random() * 2 - 1,
            y: 0,
            z: Math.random() * 2 - 1
        });
    }

    update(deltaTime) {
        // Move cloud
        this.position.x += this.direction.x * this.speed * deltaTime;
        this.position.z += this.direction.z * this.speed * deltaTime;
        
        // Check world boundaries
        const worldSize = CONFIG.WORLD.size / 2;
        let bounced = false;
        if (this.position.x > worldSize) {
            this.direction.x = -Math.abs(this.direction.x);
            bounced = true;
        } else if (this.position.x < -worldSize) {
            this.direction.x = Math.abs(this.direction.x);
            bounced = true;
        }
        if (this.position.z > worldSize) {
            this.direction.z = -Math.abs(this.direction.z);
            bounced = true;
        } else if (this.position.z < -worldSize) {
            this.direction.z = Math.abs(this.direction.z);
            bounced = true;
        }
        
        // If bounced, slightly change direction
        if (bounced) {
            this.direction.x += (Math.random() * 0.2 - 0.1);
            this.direction.z += (Math.random() * 0.2 - 0.1);
            this.direction = normalizeVector(this.direction);
        }
        
        // Check for tower destruction
        this.checkTowerDestruction();
    }
    
    checkTowerDestruction() {
        // Iterate through all players and towers to check for destruction
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            
            // Find if player is on a tower
            for (let i = 0; i < gameState.towers.length; i++) {
                const tower = gameState.towers[i];
                const horizontalDistance = getHorizontalDistance(player.position, tower.position);
                
                if (horizontalDistance < CONFIG.TOWER.baseRadius) {
                    // Player is on tower, check distance to cloud
                    const distanceToCloud = getDistance(player.position, this.position);
                    
                    if (distanceToCloud < 15) {
                        // Destroy tower and notify clients
                        destroyTower(i);
                        break;
                    }
                }
            }
        }
    }
    
    serialize() {
        return {
            id: this.id,
            position: this.position,
            direction: this.direction,
            speed: this.speed
        };
    }
}

// Helper functions
function normalizeVector(vector) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    if (length === 0) return { x: 0, y: 0, z: 0 };
    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length
    };
}

function getHorizontalDistance(pos1, pos2) {
    return Math.sqrt(
        Math.pow(pos1.x - pos2.x, 2) + 
        Math.pow(pos1.z - pos2.z, 2)
    );
}

function getDistance(pos1, pos2) {
    return Math.sqrt(
        Math.pow(pos1.x - pos2.x, 2) + 
        Math.pow(pos1.y - pos2.y, 2) + 
        Math.pow(pos1.z - pos2.z, 2)
    );
}

// Game state
const gameState = {
    players: {},
    towers: [],
    stones: new Map(),
    clouds: [],
    lastStoneSpawnTime: 0,
    stoneSpawnInterval: 1000
};

// Initialize clouds
function initializeClouds() {
    // Create some clouds
    for (let i = 0; i < 10; i++) {
        // Create cloud
        const position = {
            x: (Math.random() * 2 - 1) * CONFIG.WORLD.size / 2,
            y: CONFIG.WORLD.cloudHeight + (Math.random() * 10 - 5),
            z: (Math.random() * 2 - 1) * CONFIG.WORLD.size / 2
        };
        const cloud = new Cloud(null, position);

        // Add to game state
        gameState.clouds.push(cloud);
    }
}

// Call this during server initialization
initializeClouds();

// Game update loop
const TICK_RATE = 60;
const TICK_TIME = 1000 / TICK_RATE;
let lastUpdate = Date.now();
setInterval(() => {
    // Get delta time
    const now = Date.now();
    const deltaTime = (now - lastUpdate) / 1000;
    lastUpdate = now;

    // Update held stones positions based on their holders
    for (const stone of gameState.stones.values()) {
        if (stone.isHeld && stone.heldBy) {
            const player = gameState.players[stone.heldBy];
            if (player) {
                // Get stackIndex
                const playerStones = Array.from(gameState.stones.values()).filter(s => s.heldBy === player.playerId);
                const stackIndex = playerStones.indexOf(stone);

                // Position stone to the right side and more forward for better visibility
                stone.position = {
                    x: player.position.x - (Math.sin(player.rotation.y) * 0.8),
                    y: player.position.y + (-0.5 + (stackIndex * 0.4)),
                    z: player.position.z - (Math.cos(player.rotation.y) * 1.4)
                };
                stone.velocity = { x: 0, y: 0, z: 0 };
            }
        } else {
            // Only update non-held stones with physics
            stone.update(deltaTime);
        }
    }

    // Check if we should spawn a new stone
    if (now - gameState.lastStoneSpawnTime > gameState.stoneSpawnInterval && gameState.stones.size < CONFIG.STONE.maxCount) {
        const stone = createRandomStone();
        gameState.stones.set(stone.id, stone);
        gameState.lastStoneSpawnTime = now;

        // Broadcast stone creation
        broadcastToAll({
            type: 'stone_spawned',
            stone: stone.serialize()
        });
    }

    // Check for potential tower creation
    checkTowerCreation();

    // Broadcast stone positions
    broadcastToAll({
        type: 'stone_positions',
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    });

    // Update clouds
    for (const cloud of gameState.clouds) {
        cloud.update(deltaTime);
    }
    
    // Broadcast cloud positions periodically
    if (now % 100 < TICK_TIME) { // Send updates every ~100ms
        broadcastCloudPositions();
    }

    // Log stone states every 10 seconds
    if (false && now % 10000 < TICK_TIME) {
        const totalStones = gameState.stones.size;
        const heldStones = Array.from(gameState.stones.values()).filter(s => s.isHeld).length;
        const staticStones = Array.from(gameState.stones.values()).filter(s => s.isStatic).length;
        const thrownStones = Array.from(gameState.stones.values()).filter(s => s.isThrown).length;
        console.log(`Stone stats: total=${totalStones}, held=${heldStones}, static=${staticStones}, thrown=${thrownStones}`);
    }
}, TICK_TIME);

function checkTowerCreation() {
    // Get all static thrown stones
    const stationaryStones = Array.from(gameState.stones.values()).filter(stone => !stone.isHeld && stone.isThrown && stone.isStatic);
    
    // First phase: track stones near towers for potential level ups
    const stonesNearTowers = new Map(); // Map of towerId -> array of nearby stones
    
    for (const stone of stationaryStones) {
        // Check each tower
        for (let i = 0; i < gameState.towers.length; i++) {
            const tower = gameState.towers[i];
            
            // Calculate distance to tower
            const dx = stone.position.x - tower.position.x;
            const dz = stone.position.z - tower.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // If stone is close enough to tower
            if (distance < CONFIG.TOWER.groupRadius) {
                // Initialize array if needed
                if (!stonesNearTowers.has(tower.id)) {
                    stonesNearTowers.set(tower.id, []);
                }
                
                // Add stone to the array for this tower
                stonesNearTowers.get(tower.id).push(stone);
            }
        }
    }
    
    // Second phase: process towers that have enough stones nearby to level up
    for (const [towerId, nearbyStones] of stonesNearTowers.entries()) {
        // Only process if we have enough stones to level up (stonesPerLevel)
        if (nearbyStones.length >= CONFIG.TOWER.stonesPerLevel) {
            // Find the tower
            const tower = gameState.towers.find(t => t.id === towerId);
            if (!tower) continue;
            
            console.log(`Tower ${towerId} has ${nearbyStones.length} stones nearby, leveling up`);
            
            // Level up the tower
            tower.level += 1;
            
            // Get the stones we'll use for the level up (limit to stonesPerLevel)
            const usedStones = nearbyStones.slice(0, CONFIG.TOWER.stonesPerLevel);
            
            // Remove the used stones
            for (const stone of usedStones) {
                gameState.stones.delete(stone.id);
            }
            
            // Notify all clients
            broadcastToAll({
                type: 'tower_update',
                towerId: tower.id,
                newLevel: tower.level,
                removedStoneIds: usedStones.map(s => s.id)
            });
            
            // Remove used stones from the stationaryStones consideration
            // for any further tower creation/leveling
            for (const stone of usedStones) {
                const index = stationaryStones.indexOf(stone);
                if (index !== -1) {
                    stationaryStones.splice(index, 1);
                }
            }
        }
    }
    
    // Third phase: check for new tower creation with remaining stones
    // This part is from your updated tower creation code
    for (const stone of stationaryStones) {
        // Skip stones that were already used for leveling
        if (!gameState.stones.has(stone.id)) continue;
        
        // Find nearby stones
        const nearbyStones = stationaryStones.filter(otherStone => {
            if (otherStone === stone || !gameState.stones.has(otherStone.id)) return false;
            const dx = stone.position.x - otherStone.position.x;
            const dz = stone.position.z - otherStone.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            return distance < CONFIG.TOWER.groupRadius;
        });

        // If enough stones are nearby (CONFIG.TOWER.stonesPerLevel total including this one)
        // This means we need stonesPerLevel-1 nearby stones plus the current stone
        if (nearbyStones.length >= CONFIG.TOWER.stonesPerLevel - 1) {
            console.log(`Creating tower from ${nearbyStones.length + 1} stones`);
            
            // Calculate average position
            const position = {
                x: stone.position.x,
                y: stone.position.y,
                z: stone.position.z
            };
            
            // Sum positions
            nearbyStones.forEach(nearbyStone => {
                position.x += nearbyStone.position.x;
                position.y += nearbyStone.position.y;
                position.z += nearbyStone.position.z;
            });
            
            // Calculate average position using the stonesPerLevel config
            position.x /= CONFIG.TOWER.stonesPerLevel;
            position.y /= CONFIG.TOWER.stonesPerLevel;
            position.z /= CONFIG.TOWER.stonesPerLevel;

            // Log tower position
            console.log(`Tower position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);

            // Create tower
            const tower = {
                id: Math.random().toString(36).substr(2, 9),
                position: position,
                level: 1
            };
            
            // For tower creation, use only the required number of stones
            const stonesNeeded = CONFIG.TOWER.stonesPerLevel - 1; // -1 because we already have 'stone'
            const usedStones = [stone, ...nearbyStones.slice(0, stonesNeeded)];
            
            usedStones.forEach(s => {
                console.log(`Removing stone ${s.id} from game state`);
                gameState.stones.delete(s.id);
            });
            
            // Add tower
            gameState.towers.push(tower);
            console.log(`Added tower ${tower.id} to game state, total towers: ${gameState.towers.length}`);
            
            // Notify all clients
            const message = {
                type: 'tower_created',
                tower: tower,
                removedStones: usedStones.map(s => s.id)
            };
            broadcastToAll(message);
            
            // Only create one tower for now
            break; 
        }
    }
}

// Broadcast cloud positions to all connected clients
function broadcastCloudPositions() {
    const cloudData = gameState.clouds.map(cloud => cloud.serialize());
    
    broadcastToAll({
        type: 'cloud_positions',
        clouds: cloudData
    });
}

// Destroy tower at index
function destroyTower(index) {
    // Check if index is valid
    if (index < 0 || index >= gameState.towers.length) {
        return;
    }
    
    // Remove tower from gameState
    gameState.towers.splice(index, 1);
    
    // Notify clients
    broadcastToAll({
        type: 'tower_destroyed',
        index: index
    });
}

// Add this function to handle tower destacking
function handleTowerDestack(ws, data) {
    // Get player ID and tower ID
    const playerId = ws.playerId;
    const towerId = data.towerId;
    
    // Log request
    console.log(`Tower destack request from ${playerId} for tower ${towerId}`);
    
    // Validate tower exists
    const towerIndex = gameState.towers.findIndex(tower => tower.id === towerId);
    if (towerIndex === -1) {
        console.warn(`Tower ${towerId} not found`);
        return;
    }
    const tower = gameState.towers[towerIndex];
    
    // Validate player exists
    const player = gameState.players[playerId];
    if (!player) {
        console.warn(`Player ${playerId} not found`);
        return;
    }
    
    // Validate player is close enough to tower
    const distance = getHorizontalDistance(player.position, tower.position);
    if (distance > CONFIG.TOWER.baseRadius) {
        console.warn(`Player ${playerId} is too far from tower ${towerId}`);
        return;
    }
    
    // Create stones regardless of tower level
    createStonesFromTower(tower.position);
    
    // Handle differently based on tower level
    if (tower.level === 1) {
        // Remove the tower entirely
        gameState.towers.splice(towerIndex, 1);
        
        // Notify clients of tower removal
        broadcastToAll({
            type: 'tower_destroyed',
            index: towerIndex
        });
        
        console.log(`Tower ${towerId} was level 1 and has been completely removed`);
    } else {
        // Lower tower level
        tower.level -= 1;
        
        // Notify clients of level decrease
        broadcastToAll({
            type: 'tower_update',
            towerId: tower.id,
            newLevel: tower.level,
            wasDestacked: true
        });
        
        console.log(`Tower ${towerId} was destacked to level ${tower.level}`);
    }
}

// Helper function to create stones at a position
function createStonesFromTower(position, count = CONFIG.TOWER.stonesPerLevel) {
    const stones = [];
    
    for (let i = 0; i < count; i++) {
        // Calculate position with circular spread
        const angle = Math.PI * 2 * (i / count);
        const radius = 2;
        const stonePosition = {
            x: position.x + Math.cos(angle) * radius,
            y: position.y + 2, // Place stones above the tower
            z: position.z + Math.sin(angle) * radius
        };
        
        // Create stone with position and no initial velocity
        const stone = new Stone(null, stonePosition, { x: 0, y: 0, z: 0 });
        
        // Add stone to game state
        gameState.stones.set(stone.id, stone);
        
        // Add to result array
        stones.push(stone);
        
        // Broadcast each new stone to clients
        broadcastToAll({
            type: 'stone_spawned',
            stone: stone.serialize()
        });
    }
    
    return stones;
}

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

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

// King status tracking
let currentKingId = null;
let lastKingCheckTime = 0;
const DEBUG = {
  kingStatus: false
};

// Handle WebSocket connections
wss.on('connection', (ws) => {
  // Send message with initial state
  sendInitialState(ws);

  // Handle messages from clients
  ws.on('message', function(message) {
    try {
      // Parse message
      const data = JSON.parse(message);
      
      // Route messages
      switch(data.type) {
        case 'player_join':
          handlePlayerJoin(ws, data);
          break;
        case 'player_update':
          handlePlayerUpdate(ws, data);
          break;
        case 'request_state':
          sendInitialState(ws);
          break;
        case 'stone_pickup':
          handleStonePickup(ws, { ...data, playerId: ws.playerId });
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
    // Get player ID
    const playerId = ws.playerId;
    console.log(`Player disconnected: ${playerId}`);
    
    // Remove player from game state
    removePlayer(playerId);
  });
});

// Broadcast message to all clients except sender
function broadcastToAll(message, excludeWs = null) {
    const messageStr = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
}

// Remove player from game state
function removePlayer(playerId) {
    // Remove from connections
    connections.delete(playerId);

        // Drop all stones held by disconnecting player
        for (const stone of gameState.stones.values()) {
        if (stone.heldBy === ws.playerId) {
            stone.isHeld = false;
            stone.heldBy = null;
            stone.isThrown = true;
            stone.throwTime = Date.now();
            stone.isStatic = false;
            stone.velocity = { x: 0, y: 0, z: 0 };
        }
    }

    // Remove from game state
    delete gameState.players[playerId];

    // Notify other clients
    broadcastToAll({
        type: 'player_leave',
        playerId: playerId
    });
}

// Handle player join
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
    
    // Notify other clients
    broadcastToAll({
        type: 'player_join',
        playerId,
        username,
        position,
        rotation
    }, ws);
}

// Handle player update
function handlePlayerUpdate(ws, data) {
  // Get player ID
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
    type: 'player_update',
    playerId: playerId,
    position: data.position,
    rotation: data.rotation,
    heldStones: data.heldStones || []
  }, ws); // Send to all except sender
}

// Initial state request
function sendInitialState(ws) {
    // Send current game state to requesting client
    ws.send(JSON.stringify({
        type: 'initial_state',
        players: Object.values(gameState.players),
        towers: gameState.towers,
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize()),
        clouds: gameState.clouds.map(cloud => cloud.serialize())
    }));
}

// Handle stone messages
function handleStonePickup(ws, data) {
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
        this.rotation.z -= dx * 1;
        
        // Roll around X axis when moving in Z direction
        this.rotation.x += dz * 1;
        
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
        
        // Add a buffer zone beyond the beach where waves don't affect stones
        const waveStartDistance = beachDistance;

        // Check if in water and beyond the buffer zone
        const isInWater = distanceFromCenter > waveStartDistance;
        
        // Apply water forces only if in water
        if (isInWater) {
            // Stones deeper in water experience stronger forces
            const depthFactor = Math.min(1.0, (distanceFromCenter - waveStartDistance) / (worldHalfSize * 0.1));
            
            // Calculate direction toward center
            const magnitude = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
            const dirX = -this.position.x / magnitude;
            const dirZ = -this.position.z / magnitude;
            
            // Apply wave force with depth factor
            this.velocity.x += dirX * CONFIG.STONE.waveStrength * multiplier * depthFactor;
            this.velocity.z += dirZ * CONFIG.STONE.waveStrength * multiplier * depthFactor;
            this.velocity.y += CONFIG.STONE.waveStrength * (multiplier * 0.16) * depthFactor; // Upward bias
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
        
        // Ground collision handling
        if (this.position.y < collisionThreshold) {
            // Set position exactly at ground level
            this.position.y = collisionThreshold;
            
            // Handle bounce
            if (this.velocity.y < -0.05) {
                this.velocity.y = -this.velocity.y * CONFIG.STONE.bounce;
            } else {
                // Zero out small vertical velocities completely to prevent tiny bounces
                this.velocity.y = 0;
            }
            
            // Get the current horizontal velocity magnitude
            const horizontalVelocity = Math.sqrt(
                this.velocity.x * this.velocity.x + 
                this.velocity.z * this.velocity.z
            );
            
            // Apply friction to horizontal movement
            const frictionFactor = CONFIG.STONE.friction;
            this.velocity.x *= frictionFactor;
            this.velocity.z *= frictionFactor;
            
            // If horizontal velocity is very small, zero it out completely
            if (horizontalVelocity < CONFIG.STONE.stopThreshold * 0.5) {
                this.velocity.x = 0;
                this.velocity.z = 0;
                
                // If stone has very low velocity in all directions, set it as completely static
                if (!this.isStatic && Math.abs(this.velocity.y) < 0.01) {
                    this.isStatic = true;
                    
                    // Once static, snap to exact ground height to prevent floating point issues
                    this.position.y = collisionThreshold;
                }
            }
            
            // Apply slope forces - only if the stone still has some momentum
            if (horizontalVelocity > CONFIG.STONE.stopThreshold * 0.5) {
                this.velocity.x += slopeX * CONFIG.STONE.rollFactor * multiplier;
                this.velocity.z += slopeZ * CONFIG.STONE.rollFactor * multiplier;
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
    // Get world info
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
    //console.log(`New stone spawned at edge ${edge}: pos=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`);
    
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
    
    // Clouds themselves check if a player is near a tower and if so, initiate a destruction sequence
    checkTowerDestruction() {
        // Iterate through all players and find those near clouds
        for (const playerId in gameState.players) {
            const player = gameState.players[playerId];
            
            // Find if player is on a tower
            let playerTowerId = null;
            let playerTowerIndex = -1;
            
            // First determine if the player is on a tower
            for (let i = 0; i < gameState.towers.length; i++) {
                const tower = gameState.towers[i];
                const horizontalDistance = getHorizontalDistance(player.position, tower.position);
                
                if (horizontalDistance < CONFIG.TOWER.baseRadius) {
                    playerTowerId = tower.id;
                    playerTowerIndex = i;
                    break;
                }
            }
            
            // Check distance from player to cloud
            const distanceToCloud = getDistance(player.position, this.position);
            
            // If player is near a cloud
            if (distanceToCloud < 15) {
                console.log(`Player ${playerId} triggered cloud near tower ${playerTowerId}`);
                
                // Find the tallest tower that the player is not on
                let tallestTowerIndex = -1;
                let tallestTowerLevel = 0;
                
                for (let i = 0; i < gameState.towers.length; i++) {
                    // Skip the tower the player is on
                    if (i === playerTowerIndex) continue;

                    // Get tower
                    const tower = gameState.towers[i];
                    
                    // Find the tallest tower
                    if (tower.level > tallestTowerLevel) {
                        tallestTowerLevel = tower.level;
                        tallestTowerIndex = i;
                    }
                }
                
                // If we found a tower to destroy
                if (tallestTowerIndex !== -1) {
                    const targetTower = gameState.towers[tallestTowerIndex];
                    console.log(`Targeting tallest tower ${targetTower.id} with level ${targetTower.level} for destruction`);
                    
                    // Start cloud destruction sequence
                    initiateCloudDestructionSequence(this, tallestTowerIndex);
                    break;
                } else {
                    console.log("No suitable tower found for destruction.");
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
    stoneSpawnInterval: 1000,
    activeDestructionSequences: [],
    cloudReturnPaths: []
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
                    // Move forward by -1.0 units and right
                    x: player.position.x - (Math.sin(player.rotation.y) * 1.0) + (Math.sin(player.rotation.y + Math.PI/2) * 0.9),

                    // Adjust vertical position with good spacing between stones
                    y: player.position.y + (-0.5 + (stackIndex * 0.9)),

                    // Same forward and right calculation for z component
                    z: player.position.z - (Math.cos(player.rotation.y) * 1.0) + (Math.cos(player.rotation.y + Math.PI/2) * 0.9)
                };

                // Set stone rotation to match player's view - point the same face toward player
                stone.rotation = {
                    // Keep a slight tilt for visual interest
                    x: 0.2,

                    // Match player's y rotation, offset by 90 degrees so face points to player
                    y: player.rotation.y + Math.PI/2,

                    // Keep a slight tilt for visual interest
                    z: 0.2
                };
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
        type: 'stone_update',
        stones: Array.from(gameState.stones.values()).map(stone => stone.serialize())
    });

    // Update clouds
    for (const cloud of gameState.clouds) {
        // Only update clouds that aren't part of a destruction sequence
        if (!gameState.activeDestructionSequences.some(seq => seq.cloud === cloud.id)) {
            cloud.update(deltaTime);
        }
    }
    
    // Update tower destruction sequences
    updateDestructionSequences();
    
    // Broadcast cloud positions periodically
    if (now % 100 < TICK_TIME) { // Send updates every ~100ms
        broadcastCloudPositions()
    }

    // Check for king status only once per second
    if (now - lastKingCheckTime > 1000) {
        updateKingStatus();
        lastKingCheckTime = now;
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
            
            // Remove used stones from the stationaryStones for any further tower creation/leveling
            for (const stone of usedStones) {
                const index = stationaryStones.indexOf(stone);
                if (index !== -1) {
                    stationaryStones.splice(index, 1);
                }
            }
        }
    }
    
    // Third phase: check for new tower creation with remaining stones
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
            
            // Remove the used stones
            usedStones.forEach(s => {
                console.log(`Removing stone ${s.id}`);
                gameState.stones.delete(s.id);
            });
            
            // Add tower
            gameState.towers.push(tower);
            console.log(`Added tower ${tower.id}, total towers: ${gameState.towers.length}`);
            
            // Notify all clients
            const message = {
                type: 'tower_create',
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
    broadcastToAll({
        type: 'cloud_update',
        clouds: gameState.clouds.map(cloud => cloud.serialize())
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
        type: 'tower_destroy',
        index: index
    });
}

// Handle tower destacking
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

        // Log the removal
        console.log(`Tower ${towerId} was level 1 and has been removed`);
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
        
        // Log the destacking
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
    
    // Return the stones
    return stones;
}

// Handle the cloud destruction sequence
function initiateCloudDestructionSequence(cloud, towerIndex) {
    if (towerIndex < 0 || towerIndex >= gameState.towers.length) return;
    
    const tower = gameState.towers[towerIndex];
    
    // Store the original cloud position for animation path planning
    const originalPosition = { ...cloud.position };
    
    // Create destruction sequence data
    const destructionSequence = {
        cloud: cloud.id,
        tower: tower.id,
        towerIndex: towerIndex,
        towerPosition: tower.position,
        startPosition: originalPosition,
        phase: 'moving', // Phases: moving -> raining -> flooding -> destroying
        startTime: Date.now(),
        duration: {
            moving: 3000,   // 3 seconds to move to tower
            raining: 2000,  // 2 seconds of rain
            flooding: 2000   // 2 seconds of flooding
        }
    };
    
    // Add to active sequences
    gameState.activeDestructionSequences.push(destructionSequence);
    
    // Notify clients to start animation
    broadcastToAll({
        type: 'tower_start_destruction',
        sequence: destructionSequence
    });
    
    console.log(`Initiated destruction sequence for tower ${tower.id} using cloud ${cloud.id}`);
}

// Update all active destruction sequences
function updateDestructionSequences() {
    const now = Date.now();
    const sequences = gameState.activeDestructionSequences;
    
    // Process each active sequence
    for (let i = sequences.length - 1; i >= 0; i--) {
        const seq = sequences[i];
        const elapsedTime = now - seq.startTime;
        
        // Find the cloud and tower involved
        const cloud = gameState.clouds.find(c => c.id === seq.cloud);
        if (!cloud) {
            sequences.splice(i, 1);
            continue;
        }
        
        // Process based on current phase
        switch (seq.phase) {
            case 'moving':
                // Calculate cloud movement (linear interpolation)
                const moveProgress = Math.min(1.0, elapsedTime / seq.duration.moving);
                
                // Update cloud position
                cloud.position = {
                    x: seq.startPosition.x + (seq.towerPosition.x - seq.startPosition.x) * moveProgress,
                    y: seq.startPosition.y, // Keep same height
                    z: seq.startPosition.z + (seq.towerPosition.z - seq.startPosition.z) * moveProgress
                };
                
                // Broadcast cloud position update
                broadcastCloudPositions();
                
                // Check if movement phase is complete
                if (moveProgress >= 1.0) {
                    seq.phase = 'raining';
                    seq.startTime = now;
                    
                    // Notify clients of phase change
                    broadcastToAll({
                        type: 'tower_update_destruction',
                        cloudId: cloud.id,
                        towerId: seq.tower,
                        phase: 'raining'
                    });
                }
                break;
                
            case 'raining':
                // Rain animation is handled by the client
                // Just check if raining phase is complete
                if (elapsedTime >= seq.duration.raining) {
                    seq.phase = 'flooding';
                    seq.startTime = now;
                    
                    // Notify clients of phase change
                    broadcastToAll({
                        type: 'tower_update_destruction',
                        cloudId: cloud.id,
                        towerId: seq.tower,
                        phase: 'flooding'
                    });
                }
                break;
                
            case 'flooding':
                // Flooding animation is handled by the client
                // Check if flooding phase is complete
                if (elapsedTime >= seq.duration.flooding) {
                    // Destroy the tower
                    destroyTower(seq.towerIndex);
                    
                    // Remove this sequence
                    sequences.splice(i, 1);
                    
                    // Reset cloud position (gradually move back to random position)
                    const randomPos = {
                        x: (Math.random() * 2 - 1) * CONFIG.WORLD.size / 3,
                        y: CONFIG.WORLD.cloudHeight,
                        z: (Math.random() * 2 - 1) * CONFIG.WORLD.size / 3
                    };
                    
                    // Create a return path for the cloud
                    const returnPath = {
                        cloud: cloud.id,
                        startPosition: cloud.position,
                        endPosition: randomPos,
                        startTime: now,
                        duration: 5000 // 5 seconds to return
                    };
                    
                    gameState.cloudReturnPaths.push(returnPath);
                }
                break;
        }
    }
    
    // Also update any cloud return paths
    updateCloudReturnPaths();
}

// Helper to update cloud return paths
function updateCloudReturnPaths() {
    const now = Date.now();
    const paths = gameState.cloudReturnPaths;
    
    for (let i = paths.length - 1; i >= 0; i--) {
        const path = paths[i];
        const cloud = gameState.clouds.find(c => c.id === path.cloud);
        
        if (!cloud) {
            paths.splice(i, 1);
            continue;
        }
        
        const elapsed = now - path.startTime;
        const progress = Math.min(1.0, elapsed / path.duration);
        
        // Update cloud position with easing
        cloud.position = {
            x: path.startPosition.x + (path.endPosition.x - path.startPosition.x) * progress,
            y: path.startPosition.y + (path.endPosition.y - path.startPosition.y) * progress,
            z: path.startPosition.z + (path.endPosition.z - path.startPosition.z) * progress
        };
        
        // Remove path when complete
        if (progress >= 1.0) {
            paths.splice(i, 1);
        }
    }
}

// Determine which player is the king
function updateKingStatus() {
    if (DEBUG.kingStatus) console.log("--- Checking king status ---");
    
    // Find the tallest tower
    let tallestTower = null;
    let maxHeight = -Infinity;
    
    // Log all towers if debug is enabled
    if (DEBUG.kingStatus) console.log(`Total towers: ${gameState.towers.length}`);
    
    for (let i = 0; i < gameState.towers.length; i++) {
        const tower = gameState.towers[i];
        const towerHeight = tower.position.y + (tower.level * 4 * CONFIG.STONE.depth);
        
        if (DEBUG.kingStatus) {
            console.log(`Tower ${i}: id=${tower.id}, level=${tower.level}, height=${towerHeight.toFixed(2)}, position=(${tower.position.x.toFixed(1)}, ${tower.position.y.toFixed(1)}, ${tower.position.z.toFixed(1)})`);
        }
        
        if (towerHeight > maxHeight) {
            maxHeight = towerHeight;
            tallestTower = tower;
        }
    }
    
    // If no towers, no king
    if (!tallestTower) {
        if (DEBUG.kingStatus) console.log("No towers found, no king possible");
        
        if (currentKingId) {
            currentKingId = null;
            broadcastKingStatus(null);
        }
        return;
    }
    
    // Check which player is on the tallest tower
    let newKingId = null;
    
    // Log all players if debug is enabled
    if (DEBUG.kingStatus) console.log(`Total players: ${Object.keys(gameState.players).length}`);
    
    for (const playerId in gameState.players) {
        const player = gameState.players[playerId];
        
        // Calculate horizontal distance to tower
        const dx = player.position.x - tallestTower.position.x;
        const dz = player.position.z - tallestTower.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Calculate vertical position relative to tower top
        const towerTopY = tallestTower.position.y + (tallestTower.level * 4 * CONFIG.STONE.depth);
        const playerY = player.position.y - CONFIG.PLAYER.height;
        
        // Tolerances
        const distanceTolerance = CONFIG.TOWER.baseRadius * 1.3;
        const heightTolerance = 3.0;
        
        if (DEBUG.kingStatus) {
            console.log(`Player ${playerId}: position=(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})`);
            console.log(`  Distance to tallest tower: ${distance.toFixed(2)}, height diff: ${Math.abs(playerY - towerTopY).toFixed(2)}`);
            console.log(`  Tower radius check: ${distance < distanceTolerance ? 'PASS' : 'FAIL'}, height check: ${Math.abs(playerY - towerTopY) < heightTolerance ? 'PASS' : 'FAIL'}`);
        }
        
        // Check if player is near the tallest tower with more tolerance
        if (distance < distanceTolerance && 
            Math.abs(playerY - towerTopY) < heightTolerance) {
            if (DEBUG.kingStatus) console.log(`Player ${playerId} is on/near the tallest tower and is the king!`);
            newKingId = playerId;
            break; // First player found on the tower becomes king
        }
    }
    
    if (!newKingId && DEBUG.kingStatus) {
        console.log("No player is on the tallest tower");
    }
    
    // If king has changed, broadcast the change
    if (newKingId !== currentKingId) {
        // This log is important enough to keep even when debug is off
        console.log(`King status changed: ${currentKingId || 'none'} -> ${newKingId || 'none'}`);
        currentKingId = newKingId;
        broadcastKingStatus(newKingId);
    } else if (DEBUG.kingStatus) {
        console.log(`King status unchanged: ${currentKingId || 'none'}`);
    }
    
    if (DEBUG.kingStatus) console.log("--- King status check complete ---");
}

// Send king status to all clients
function broadcastKingStatus(kingId) {
    const message = {
        type: 'king_update',
        kingId: kingId
    };
    
    // Use the existing broadcastToAll function
    broadcastToAll(message);
    
    // Always log when king status is broadcast
    console.log(`King status updated: ${kingId || 'No king'}`);
}

// Start server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

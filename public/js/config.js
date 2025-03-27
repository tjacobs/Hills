// Game configuration
const CONFIG = {
    // Player settings
    PLAYER: {
        // Movement parameters
        maxSpeed: 0.2,            // Maximum movement speed
        strafeSpeed: 0.1,         // Base strafe movement speed
        sprintMultiplier: 2.0,    // Speed multiplier when sprinting
        rotateSpeed: 0.02,        // Base rotation speed
        maxTurnSpeed: 0.03,       // Maximum turning speed
        acceleration: 0.03,       // Movement acceleration
        turnAcceleration: 0.006,  // Turning acceleration
        deceleration: 0.02,       // Movement deceleration
        turnDeceleration: 0.002,  // Turning deceleration

        // Player height
        height: 2.5,              // Eye level height above ground
        meshHeightOffset: 1.5,      // Offset for the player mesh

        // Physics parameters
        jumpForce: 1.0,           // Jump
        gravity: -0.02,           // Gravity force applied to player
        heightSmoothness: 0.05,   // How smoothly player follows terrain
        
        // Interaction parameters
        maxStones: 5,              // Maximum number of stones player can hold
        stonePickupRadius: 4,      // Radius for picking up stones
    },
    
    // Stone settings
    STONE: {
        // Stone size
        width: 1.2,
        height: 1.0,
        depth: 0.8,

        // Interaction parameters
        throwForce: 0.2,
        throwUpward: 0.2,

        // Server: Stone physics parameters
        maxCount: 10,           // Maximum number of stones in world
        bounce: 0.5,            // How bouncy stones are on collision
        friction: 0.7,          // How much friction stones have
        rollFactor: 0.5,        // How easily stones roll on slopes
        maxVelocity: 0.5,       // Maximum stone velocity
        stopThreshold: 0.2,     // Velocity threshold for coming to rest
        waveStrength: 0.05,     // Strength of water wave effect
        radius: 0.5             // Stone collision radius
    },

    // Server
    PHYSICS: {
        speedMultiplier: 10     // Global physics speed multiplier
    },

    // World settings, client and server
    WORLD: {
        size: 200,
        maxTerrainHeight: 5,      // Maximum height of terrain hills
        terrainXScale: 8,         // X-scale factor for terrain undulation
        terrainYScale: 8,         // Y-scale factor for terrain undulation
        minTerrainHeight: -2,     // Minimum height of terrain
        edgeFalloff: 5,           // Edge falloff factor for terrain
        shoreRadius: 0.9,         // Percentage where beach/water transition occurs
        cloudHeight: 20,          // Height of clouds above terrain
        gravity: -9.8,            // World gravity constant
    },
    
    // Tower settings
    TOWER: {
        baseRadius: 3.0,          // Base radius for tower creation
        blockCount: 24            // Number of blocks in each ring in the tower
    },
    
    // Network settings
    NETWORK: {
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
    }
};

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

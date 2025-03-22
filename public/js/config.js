// Game configuration
const CONFIG = {
    // Player settings
    PLAYER: {
        height: 1.7,
        radius: 0.5,
        baseHeight: 3,            // Default height above ground
        
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
        
        // Physics parameters
        jumpForce: 1.0,           // Jump
        gravity: -0.02,           // Gravity force applied to player
        heightSmoothness: 0.1,    // How smoothly camera follows terrain
        
        // Interaction parameters
        maxStones: 3              // Maximum number of stones player can hold
    },
    
    // Stone settings
    STONE: {
        width: 0.5,
        height: 0.3,
        depth: 0.5,

        // Maximum number of stones player can hold
        maxHeld: 5,

        // Offset from ground
        groundCheckOffset: 0.0,
        
        // Physics parameters
        gravity: -9.8,
        bounce: 0.3,
        friction: 0.05,
        rollFactor: 0.05,
        maxVelocity: 0.5,
        stopThreshold: 0.01,
        
        // Interaction parameters
        throwForce: 0.2,
        throwUpward: 0.2,
        
        // Ocean parameters
        waveStrength: 0.01,
        
        // Spawning parameters
        maxCount: 20  // Maximum number of stones in the world
    },
    
    // Tower settings
    TOWER: {
        baseRadius: 3.5,
        blockCount: 24,
        maxLevel: 100
    },
    
    // World settings
    WORLD: {
        size: 200,
        groundY: 0,
        gravity: 9.8,
        cloudHeight: 50
    },
    
    // Input settings
    INPUT: {
        mouseSensitivity: 0.002
    },
    
    // Network settings
    NETWORK: {
        updateRate: 30, // Updates per second
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
    },
    
    // Debug settings
    DEBUG: {
        enabled: false,
        showPhysics: false,
        logNetworkMessages: false
    }
}; 
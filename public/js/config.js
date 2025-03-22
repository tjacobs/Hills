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
        jumpForce: 0.5,           // Initial upward velocity when jumping
        gravity: -0.02,           // Gravity force applied to player
        heightSmoothness: 0.2,    // How smoothly camera follows terrain
        
        // Interaction parameters
        maxStones: 3              // Maximum number of stones player can hold
    },
    
    // Stone settings
    STONE: {
        blockWidth: 0.5,
        blockHeight: 0.3,
        blockDepth: 0.5,
        throwForce: 10.0,
        throwUpward: 5.0,
        pickupDelay: 500,
        maxHeld: 1
    },
    
    // Tower settings
    TOWER: {
        baseRadius: 3.5,
        blockCount: 24,
        maxLevel: 5
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
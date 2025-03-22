// Game configuration
const CONFIG = {
    // Player settings
    PLAYER: {
        height: 1.7,
        speed: 5.0,
        jumpForce: 7.0,
        gravity: 20.0
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
        serverUrl: 'wss://ramparty.fly.dev',
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
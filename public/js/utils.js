// Utility functions

// Generate a unique ID
function generateId(prefix = '') {
    return prefix + Math.random().toString(36).substring(2, 15);
}

// Logger with timestamp
function log(message, type = 'info') {
    if (!CONFIG.DEBUG.enabled && type === 'debug') return;
    
    const timestamp = new Date().toISOString().substring(11, 23);
    const formattedMessage = `[${timestamp}] ${message}`;
    
    console[type](formattedMessage);
    
    // Add to debug container if it exists
    const debugContainer = document.getElementById('debug-container');
    if (debugContainer) {
        const messageElement = document.createElement('div');
        messageElement.textContent = formattedMessage;
        messageElement.className = `log-${type}`;
        debugContainer.appendChild(messageElement);
        
        // Limit number of messages
        while (debugContainer.children.length > 50) {
            debugContainer.removeChild(debugContainer.firstChild);
        }
        
        // Scroll to bottom
        debugContainer.scrollTop = debugContainer.scrollHeight;
    }
}

// Update UI elements
function updateUI() {
    // Update player count
    const playerInfo = document.getElementById('player-info');
    if (playerInfo) {
        const playerCount = Object.keys(Game.players).length;
        playerInfo.textContent = `Players: ${playerCount}`;
    }
    
    // Update tower count
    const towerInfo = document.getElementById('tower-info');
    if (towerInfo) {
        towerInfo.textContent = `Towers: ${Game.towers.length}`;
    }
}

// Load texture
function loadTexture(url) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
            url,
            texture => resolve(texture),
            undefined,
            error => reject(error)
        );
    });
}

// Create a deterministic random number based on seed
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
} 
// Utility functions

// Generate a unique ID
function generateId(prefix = '') {
    return prefix + Math.random().toString(36).substring(2, 15);
}

// Logger with timestamp
function log(message, type = 'debug') {
    // Log to console
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Get debug container
    const debugContainer = document.getElementById('debug-container');
    
    // If debug container exists, add message
    if (debugContainer) {
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `log-message log-${type}`;
        messageElement.textContent = message;
        
        // Add timestamp
        const timestamp = new Date().toLocaleTimeString();
        messageElement.dataset.timestamp = timestamp;
        messageElement.innerHTML = `<span class="log-time"></span> ${message}`;
        
        // Add to container
        debugContainer.appendChild(messageElement);
        
        // Scroll to bottom
        debugContainer.scrollTop = debugContainer.scrollHeight;
        
        // Limit number of messages (keep last 50)
        while (debugContainer.children.length > 50) {
            debugContainer.removeChild(debugContainer.firstChild);
        }
    }
    
    return message;
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
// Utility functions

// Generate a 6-letter lowercase ID
function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
    // Update player count and local player info
    const playerInfo = document.getElementById('player-info');
    if (playerInfo) {
        if (Game.localPlayer && Game.localPlayer.id) {
            const colorInfo = parseColorId(Game.localPlayer.id);
            if (colorInfo) {
                const colorHex = COLOR_HEX[colorInfo.color].toString(16).padStart(6, '0');
                playerInfo.innerHTML = `You are: <span style="color: #${colorHex}">${colorInfo.color} ${colorInfo.number}</span>`;
            }
        }
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

// Player colors and their hex values
const PLAYER_COLORS = [
    'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 
    'Pink', 'Mint', 'Crimson', 'Gold', 'Violet', 'Copper',
    'Amber', 'Teal'
];

const COLOR_HEX = {
    'Red': 0xcc4455,      // Deep rose
    'Blue': 0x446688,     // Navy blue
    'Green': 0x558866,    // Forest green
    'Yellow': 0xccaa44,   // Golden brown
    'Purple': 0x774466,   // Deep plum
    'Orange': 0xcc7744,   // Burnt orange
    'Pink': 0xaa5577,     // Berry pink
    'Mint': 0x55aa77,     // Deep mint
    'Crimson': 0x993344,  // Dark red
    'Gold': 0xaa8833,     // Rich gold
    'Violet': 0x665588,   // Deep violet
    'Copper': 0xaa6633,   // Rich copper
    'Amber': 0x996633,    // Rich amber
    'Teal': 0x447777      // Deep teal
};

function generateColorId() {
    const color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
    const number = Math.floor(Math.random() * 100) + 1;
    return `${color} ${number}`;
}

function parseColorId(id) {
    const [color, numberStr] = id.split(' ');
    if (color && numberStr) {
        return {
            color: color,
            number: parseInt(numberStr)
        };
    }
    return null;
} 
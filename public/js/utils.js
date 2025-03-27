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
                
                let kingStatus = '';
                if (Game.localPlayer.isKing) {
                    kingStatus = ` 👑 <span style="color: gold">You are the king!</span>`;
                }
                
                playerInfo.innerHTML = `You are: <span style="color: #${colorHex}">${colorInfo.color} ${colorInfo.number}</span>${kingStatus}`;
            }
        }
    }
    
    // Update game stats
    const gameStats = document.getElementById('game-stats');
    if (gameStats) {
        gameStats.innerHTML = `Players: ${Object.keys(Game.players).length}<br>
Stones: ${Game.stones.length}<br>
Towers: ${Game.towers.length}`;
    }
    
    // Update instructions on the right side
    const instructionsContainer = document.getElementById('instructions-container');
    if (instructionsContainer) {
        instructionsContainer.innerHTML = `<b></b>
• Collect four stones to make a tower<br>
• Climb the tallest tower to be the king<br>
• Touch a cloud to destroy another tower`;
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

// Add sound handling functions
const SOUNDS = {
    rain: new Audio('audio/rain.mp3'),
    flood: new Audio('audio/flood.mp3'),
    towerDestroy: new Audio('audio/explosion.mp3'),
    crown: new Audio('audio/crown.mp3')
};

// Initialize sounds
function initSounds() {
    // Preload sounds
    for (const sound of Object.values(SOUNDS)) {
        sound.load();
    }
}

// Play a sound
function playSound(name, volume = 1.0, loop = false) {
    const sound = SOUNDS[name];
    if (!sound) return;
    
    // Reset and configure sound
    sound.currentTime = 0;
    sound.volume = volume;
    sound.loop = loop;
    
    // Play sound
    sound.play().catch(e => console.warn(`Error playing sound ${name}:`, e));
}

// Stop a sound
function stopSound(name) {
    const sound = SOUNDS[name];
    if (!sound) return;
    
    sound.pause();
    sound.currentTime = 0;
} 
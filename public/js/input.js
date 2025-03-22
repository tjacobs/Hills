// Input handling
const Input = {
    // Key states
    keys: {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        pickup: false,
        throw: false
    },
    
    // Mouse state
    mouse: {
        x: 0,
        y: 0,
        locked: false
    },
    
    // Initialize input - disable pointer lock
    init() {
        // Set up key listeners
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        
        // Set up mouse listeners for clicks only (not movement)
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        // Disable pointer lock and mouse movement
        // document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        // document.addEventListener('click', this.requestPointerLock.bind(this));
        // document.addEventListener('pointerlockchange', this.handlePointerLockChange.bind(this), false);
        // document.addEventListener('mozpointerlockchange', this.handlePointerLockChange.bind(this), false);        
    },
    
    // Handle key down
    handleKeyDown(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'Space':
                this.keys.jump = true;
                break;
            case 'KeyE':
                this.keys.pickup = true;
                this.handlePickup();
                break;
            case 'KeyF':
                this.keys.throw = true;
                this.handleThrow();
                break;
        }
        
        // Update player controls
        if (Game.localPlayer) {
            Game.localPlayer.controls = {
                forward: this.keys.forward,
                backward: this.keys.backward,
                left: this.keys.left,
                right: this.keys.right,
                jump: this.keys.jump
            };
        }
    },
    
    // Handle key up
    handleKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'Space':
                this.keys.jump = false;
                break;
            case 'KeyE':
                this.keys.pickup = false;
                break;
            case 'KeyF':
                this.keys.throw = false;
                break;
        }
        
        // Update player controls
        if (Game.localPlayer) {
            Game.localPlayer.controls = {
                forward: this.keys.forward,
                backward: this.keys.backward,
                left: this.keys.left,
                right: this.keys.right,
                jump: this.keys.jump
            };
        }
    },
    
    // Handle mouse move - disabled
    handleMouseMove(event) {
        // Disabled for now
        return;
    },
    
    // Handle mouse down
    handleMouseDown(event) {
        if (event.button === 0) {
            // Left click - throw stone
            this.handleThrow();
        } else if (event.button === 2) {
            // Right click - pickup stone
            this.handlePickup();
        }
    },
    
    // Handle mouse up
    handleMouseUp(event) {
        // Nothing to do yet
    },
    
    // Request pointer lock - disabled
    requestPointerLock() {
        // Disabled for now
        return;
    },
    
    // Handle pointer lock change - disabled
    handlePointerLockChange() {
        // Disabled for now
        return;
    },
    
    // Handle pickup action
    handlePickup() {
        if (!Game.localPlayer) return;
        
        // Check if player can pick up more stones
        if (Game.localPlayer.heldStones.length >= CONFIG.STONE.maxHeld) {
            return;
        }
        
        // Find nearest stone
        let nearestStone = null;
        let nearestDistance = Infinity;
        
        for (const stone of Game.stones) {
            // Skip stones that are held or not static
            if (stone.isHeld || !stone.isStatic) continue;
            
            // Calculate distance to stone
            const distance = Game.localPlayer.position.distanceTo(stone.mesh.position);
            
            // If stone is closer than current nearest
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestStone = stone;
            }
        }
        
        // If a stone is found and is close enough
        if (nearestStone && nearestDistance < 2) {
            // Try to pick up stone
            if (Game.localPlayer.pickupStone(nearestStone)) {
                // Notify network
                Network.sendStonePickedUp(nearestStone.id);
            }
        }
    },
    
    // Handle throw action
    handleThrow() {
        if (!Game.localPlayer) return;
        
        // Check if player has stones to throw
        if (Game.localPlayer.heldStones.length === 0) {
            return;
        }
        
        // Throw stone
        const stone = Game.localPlayer.throwStone();
        
        if (stone) {
            // Notify network
            Network.sendStoneThrown(stone);
        }
    }
}; 
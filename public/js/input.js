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
        throw: false,
        sprint: false
    },
    
    // Mouse state
    mouse: {
        x: 0,
        y: 0,
        leftButton: false,
        rightButton: false
    },
    
    // Touch state
    touchStart: { x: 0, y: 0 },
    touchEnd: { x: 0, y: 0 },
    isTouching: false,
    touchThreshold: 20, // Minimum distance for touch movement
    
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
        
        // Add touch handlers with passive option
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        
        // Add virtual jump/throw button for mobile
        this.createVirtualButton();
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
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.sprint = true;
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
                jump: this.keys.jump,
                sprint: this.keys.sprint
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
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.sprint = false;
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
                jump: this.keys.jump,
                sprint: this.keys.sprint
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
            // Skip stones that are already held or in motion
            if (stone.isHeld || stone.isThrown || !stone.isStatic) continue;
            
            // Calculate distance to stone
            const distance = Game.localPlayer.position.distanceTo(stone.mesh.position);
            
            // Update nearest stone if this one is closer
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestStone = stone;
            }
        }
        
        // If a stone is found and is close enough
        if (nearestStone && nearestDistance < 2) {
            Game.localPlayer.pickupStone(nearestStone);
        }
    },
    
    // Handle throw action
    handleThrow() {
        if (!Game.localPlayer) return;
        
        // Check if player has stones to throw
        if (Game.localPlayer.heldStones.length > 0) {
            Game.localPlayer.throwStone();
        }
    },
    
    handleTouchStart(event) {
        event.preventDefault();
        this.isTouching = true;
        this.touchStart.x = event.touches[0].clientX;
        this.touchStart.y = event.touches[0].clientY;
        this.touchEnd.x = this.touchStart.x;
        this.touchEnd.y = this.touchStart.y;
    },
    
    handleTouchMove(event) {
        event.preventDefault();
        if (!this.isTouching) return;
        
        this.touchEnd.x = event.touches[0].clientX;
        this.touchEnd.y = event.touches[0].clientY;
        
        // Update player controls based on touch movement
        if (Game.localPlayer) {
            const dx = this.touchEnd.x - this.touchStart.x;
            const dy = this.touchEnd.y - this.touchStart.y;
            
            // Forward/backward
            Game.localPlayer.controls.forward = dy < -this.touchThreshold;
            Game.localPlayer.controls.backward = dy > this.touchThreshold;
            
            // Left/right rotation
            Game.localPlayer.controls.left = dx < -this.touchThreshold;
            Game.localPlayer.controls.right = dx > this.touchThreshold;
        }
    },
    
    handleTouchEnd(event) {
        this.isTouching = false;
        
        // Reset controls
        if (Game.localPlayer) {
            Game.localPlayer.controls.forward = false;
            Game.localPlayer.controls.backward = false;
            Game.localPlayer.controls.left = false;
            Game.localPlayer.controls.right = false;
        }
    },
    
    createVirtualButton() {
        // Only create button for touch devices
        if (!('ontouchstart' in window)) return;
        
        const button = document.createElement('button');
        button.innerHTML = '';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 30px;
            background: rgba(255, 255, 255, 0.5);
            border: none;
            font-size: 24px;
            z-index: 1000;
            touch-action: none;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
        `;
        
        // Use touchstart/end instead of click for better mobile response
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (Game.localPlayer) {
                Game.localPlayer.handleSpaceBar();
            }
        }, { passive: false });
        
        document.body.appendChild(button);
    },
    
    isKeyPressed(key) {
        return this.keys[key.toLowerCase()] === true;
    }
    
}; 
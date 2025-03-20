// Set up scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create the ground plane
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
const stoneTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(8, 8);

// Set geometry for hills
const size = 200;
const height = 5;
const segments = 200;
const xs = 8;
const ys = xs;

// Create main hilly ground
const groundGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= segments; j++) {
        const vertex = groundGeometry.attributes.position;
        const index = (i * (segments + 1) + j) * 3;
        vertex.array[index + 2] = Math.sin(i / xs) * Math.sin(j / ys) * height;
    }
}
groundGeometry.computeVertexNormals();
const groundMaterial = new THREE.MeshStandardMaterial({ 
    map: grassTexture,
    side: THREE.DoubleSide
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Create flat border ground (much larger)
const borderSize = size * 10;
const borderGeometry = new THREE.PlaneGeometry(borderSize, borderSize);
const borderMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x5588ff,  // More vibrant blue color for water
    side: THREE.DoubleSide,
    metalness: 0.5,   // High metalness for water shine
    roughness: 0.1,   // Low roughness for water shine
    transparent: true,
    opacity: 0.9      // Slight transparency
});
const borderGround = new THREE.Mesh(borderGeometry, borderMaterial);
borderGround.rotation.x = -Math.PI / 2;
borderGround.position.y = -6;
scene.add(borderGround);

// Add ambient light to see the texture
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Add directional light for better visibility
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Position camera
camera.position.set(0, 3, 15);

// Add keyboard controls
const moveSpeed = 0.5;
const rotateSpeed = 0.02;
const sprintMultiplier = 2.0; // Double speed when sprinting
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    Space: false,
    ShiftLeft: false,  // Track left shift
    ShiftRight: false,  // Track right shift
    KeyA: false,  // Add A key
    KeyD: false   // Add D key
};

// Track if keys have been used
let keyboardControlActive = false;

// Player physics parameters
const jumpForce = 0.5;  // Initial upward velocity when jumping
const playerGravity = -0.02;  // Gravity force applied to player
let playerVerticalVelocity = 0;  // Track vertical velocity
let isJumping = false;  // Track jump state

// Track key presses
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = true;
        keyboardControlActive = true;
    }
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = false;
    }
});

// Set initial camera rotation
let cameraAngle = 0;

// Add movement physics
let velocity = {
    forward: 0,
    turning: 0
};
const maxSpeed = 0.5;
const maxTurnSpeed = 0.03;
const acceleration = 0.03;
const turnAcceleration = 0.006;
const deceleration = 0.02;
const turnDeceleration = 0.002;

// Add touch controls
let touchStart = { x: 0, y: 0 };
let touchEnd = { x: 0, y: 0 };
let isTouching = false;

// Check if device is mobile
function isMobileDevice() {
    return (typeof window.orientation !== "undefined") 
        || (navigator.userAgent.indexOf('IEMobile') !== -1)
        || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

// Create touch joystick elements only for mobile
if (isMobileDevice()) {
    const joystickContainer = document.createElement('div');
    joystickContainer.style.cssText = `
        position: fixed;
        bottom: 50px;
        left: 50px;
        width: 100px;
        height: 100px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.4);
        touch-action: none;
    `;
    const joystickKnob = document.createElement('div');
    joystickKnob.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 40px;
        height: 40px;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        transform: translate(-50%, -50%);
    `;
    joystickContainer.appendChild(joystickKnob);
    document.body.appendChild(joystickContainer);

    // Touch event handlers
    joystickContainer.addEventListener('touchstart', (e) => {
        isTouching = true;
        keyboardControlActive = true;
        const touch = e.touches[0];
        touchStart.x = touch.clientX;
        touchStart.y = touch.clientY;
        touchEnd.x = touchStart.x;
        touchEnd.y = touchStart.y;
        e.preventDefault();
    });
    joystickContainer.addEventListener('touchmove', (e) => {
        if (!isTouching) return;
        const touch = e.touches[0];
        touchEnd.x = touch.clientX;
        touchEnd.y = touch.clientY;
        
        // Update joystick knob position
        const deltaX = touchEnd.x - touchStart.x;
        const deltaY = touchEnd.y - touchStart.y;
        const distance = Math.min(50, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
        const angle = Math.atan2(deltaY, deltaX);
        
        joystickKnob.style.left = `${50 + (Math.cos(angle) * distance)}px`;
        joystickKnob.style.top = `${50 + (Math.sin(angle) * distance)}px`;
        
        e.preventDefault();
    });
    joystickContainer.addEventListener('touchend', () => {
        isTouching = false;
        joystickKnob.style.left = '50%';
        joystickKnob.style.top = '50%';
    });
}

// Add sky gradient
const vertexShader = `
varying vec3 vWorldPosition;
void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;
varying vec3 vWorldPosition;
void main() {
    float h = normalize(vWorldPosition + offset).y;
    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
}`;
const uniforms = {
    topColor: { value: new THREE.Color(0x0077ff) },  // Light blue
    bottomColor: { value: new THREE.Color(0xffffff) },  // White
    offset: { value: 33 },
    exponent: { value: 0.6 }
};
const skyGeo = new THREE.SphereGeometry(400, 32, 15);
const skyMat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Add fog for distance fade
scene.fog = new THREE.Fog(0xffffff, 100, 500);

// Add clouds
function createParticleClouds() {
    const cloudParticles = [];
    const particleCount = 300; // Number of particles for denser clouds
    const particleGeometry = new THREE.BufferGeometry();
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 15, // Size for a more solid appearance
        transparent: true,
        opacity: 0.9, // Higher opacity for a solid look
        map: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/circle.png'),
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const positions = new Float32Array(particleCount * 3);
    const scales = new Float32Array(particleCount);

    // Create just 4 large, dense clouds
    const cloudCenters = [
        { x: -50, y: 60, z: -50 },  // Back left
        { x: 50, y: 55, z: -30 },   // Back right
        { x: -30, y: 50, z: 40 },   // Front left
        { x: 40, y: 65, z: 30 }     // Front right
    ];

    for (let i = 0; i < particleCount; i++) {
        // Assign to one of the cloud centers
        const cloudCenter = cloudCenters[Math.floor(i / (particleCount / cloudCenters.length))];
        
        // Position particles tightly around the cluster center
        const radius = Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 2;
        
        // Position particles with natural cloud-like spread, double the width
        positions[i * 3] = cloudCenter.x + (Math.cos(theta) * Math.sin(phi) * radius * 2); // Double width
        positions[i * 3 + 1] = cloudCenter.y + (Math.sin(theta) * Math.sin(phi) * radius);
        positions[i * 3 + 2] = cloudCenter.z + (Math.cos(phi) * radius * 2); // Double width

        // Set all particles to a larger size for a solid appearance
        scales[i] = 1;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
    return particleSystem;
}
const particleClouds = createParticleClouds();

// Function to get terrain height at a specific position
function getTerrainHeight(x, z) {
    const vertex = groundGeometry.attributes.position;
    const segments = groundGeometry.parameters.widthSegments; // Number of segments in the geometry
    const size = groundGeometry.parameters.width; // Size of the ground

    // Calculate the indices based on the position
    const i = Math.floor(((x + size / 2) / size) * segments);
    const j = Math.floor(((z + size / 2) / size) * segments);
    if (i < 0 || i >= segments || j < 0 || j >= segments) {
        return -Infinity; // Out of bounds
    }
    const index = (j * (segments + 1) + i) * 3; // Calculate the index in the vertex array
    return vertex.array[index + 2]; // Return the height (z-coordinate)
}

// Stone parameters
const stoneRadius = 0.5;
const gravity = -0.05;
const rollSpeed = 0.05;  // Reduced from 0.1
const friction = 0.1;    // Increased from 0.03
const minVelocity = 0.01; // Increased from 0.001
const groundCheckOffset = 0.01; // Reduced from 0.1
const maxVelocity = 0.2; // Reduced from 0.3

// Stone management
const stones = [];
const stoneVelocities = [];
let lastStoneDropTime = 0;
const stoneDropInterval = 100; // 10 seconds in milliseconds

function createNewStone() {
    // Create brick-like geometry (width, height, depth)
    const width = stoneRadius * 2;
    const height = stoneRadius * 1.5;
    const depth = stoneRadius * 1;
    const stoneGeometry = new THREE.BoxGeometry(width, height, depth);
    
    // Create stone material with grey color and bump mapping
    const stoneMaterial = new THREE.MeshStandardMaterial({ 
        roughness: 0.9,        // Very rough surface
        metalness: 0.1,        // Low metalness for rock look
        color: 0x808080,       // Pure grey color
        bumpMap: stoneTexture, // Use texture only for bump mapping
        bumpScale: 0.5         // Adjust bump intensity
    });
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    
    // Set fixed rotation so stones always lay flat
    stone.rotation.set(0, 0, 0);
    
    // Random scale variation for more natural look
    const scale = 0.8 + Math.random() * 0.4;
    stone.scale.set(scale, scale, scale);
    
    // Random position within the entire playable area
    const boundary = size * 0.4;
    const x = (Math.random() - 0.5) * boundary * 2;
    const z = (Math.random() - 0.5) * boundary * 2;
    const y = 50;
    stone.position.set(x, y, z);
    scene.add(stone);
    stones.push(stone);
    
    // Initialize velocity with slight random offset
    stoneVelocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        0,
        (Math.random() - 0.5) * 0.1
    ));
}

// Add stone collection tracking
let stonesCollected = 0;

// Create UI for stone count
const stoneCountUI = document.createElement('div');
stoneCountUI.style.position = 'fixed';
stoneCountUI.style.top = '20px';
stoneCountUI.style.right = '20px';
stoneCountUI.style.padding = '10px';
stoneCountUI.style.background = 'rgba(0, 0, 0, 0.5)';
stoneCountUI.style.color = 'white';
stoneCountUI.style.fontFamily = 'Arial, sans-serif';
stoneCountUI.style.fontSize = '20px';
stoneCountUI.style.borderRadius = '5px';
document.body.appendChild(stoneCountUI);

// Update UI function
function updateStoneCountUI() {
    stoneCountUI.textContent = `Stones: ${stonesCollected}`;
}

// Add smooth height transition parameters
let targetHeight = 3;
const heightSmoothness = 0.2; // Adjust this value between 0 and 1 (lower = smoother)

// Add water animation to animate function
function animate() {
    requestAnimationFrame(animate);
    
    // Animate water (border ground)
    const time = Date.now() * 0.001;
    borderGround.position.y = -6 + Math.sin(time) * 0.1; // Gentle bobbing motion around new base height
    
    // Check if it's time to drop a new stone
    const currentTime = Date.now();
    if (currentTime - lastStoneDropTime > stoneDropInterval) {
        createNewStone();
        lastStoneDropTime = currentTime;
    }

    // Animate particle clouds
    const positions = particleClouds.geometry.attributes.position.array;
    const time2 = Date.now() * 0.00002;
    for (let i = 0; i < positions.length; i += 3) {
        //positions[i] += Math.sin(time + i) * 0.005;
        //positions[i + 1] += Math.cos(time + i) * 0.002;
        //positions[i + 2] += Math.sin(time + i * 0.5) * 0.005;
    }
    particleClouds.geometry.attributes.position.needsUpdate = true;

    if (!keyboardControlActive) {
        // Auto-move camera in a circle until controls are used
        const time = Date.now() * 0.001;
        camera.position.x = Math.cos(time * 0.5) * 15;
        camera.position.z = Math.sin(time * 0.5) * 15;
        camera.position.y = 8;
        camera.rotation.y = time * 0.5 + Math.PI / 2;
    } else {
        // Check if either shift key is pressed
        const isSprinting = keys.ShiftLeft || keys.ShiftRight;
        const currentSpeed = isSprinting ? moveSpeed * sprintMultiplier : moveSpeed;
        
        // Handle keyboard and touch movement with acceleration
        if (keys.ArrowLeft || (isTouching && (touchEnd.x - touchStart.x) < -20)) {
            velocity.turning = Math.min(velocity.turning + turnAcceleration, 
                maxTurnSpeed * (isSprinting ? sprintMultiplier : 1));
        } else if (keys.ArrowRight || (isTouching && (touchEnd.x - touchStart.x) > 20)) {
            velocity.turning = Math.max(velocity.turning - turnAcceleration, 
                -maxTurnSpeed * (isSprinting ? sprintMultiplier : 1));
        } else {
            // Decelerate turning
            if (velocity.turning > 0) {
                velocity.turning = Math.max(0, velocity.turning - turnDeceleration);
            } else if (velocity.turning < 0) {
                velocity.turning = Math.min(0, velocity.turning + turnDeceleration);
            }
        }
        
        // Forward/backward movement
        if (keys.ArrowUp || (isTouching && (touchStart.y - touchEnd.y) > 20)) {
            velocity.forward = Math.min(velocity.forward + acceleration, maxSpeed * (isSprinting ? sprintMultiplier : 1));
        } else if (keys.ArrowDown || (isTouching && (touchStart.y - touchEnd.y) < -20)) {
            velocity.forward = Math.max(velocity.forward - acceleration, -maxSpeed * (isSprinting ? sprintMultiplier : 1));
        } else {
            // Decelerate forward/backward
            if (velocity.forward > 0) {
                velocity.forward = Math.max(0, velocity.forward - deceleration);
            } else if (velocity.forward < 0) {
                velocity.forward = Math.min(0, velocity.forward + deceleration);
            }
        }

        // Get terrain height at camera position
        const terrainHeight = getTerrainHeight(camera.position.x, camera.position.z);
        
        // Calculate target height (3 units above terrain)
        targetHeight = terrainHeight + 2;
        
        // Smoothly interpolate current height to target height
        if (!isJumping) {  // Only smooth terrain following when not jumping
            camera.position.y += (targetHeight - camera.position.y) * heightSmoothness;
        }

        // Handle jumping
        if (keys.Space && !isJumping && Math.abs(camera.position.y - targetHeight) < 0.1) {
            playerVerticalVelocity = jumpForce;
            isJumping = true;
        }

        // Apply gravity and update vertical position when jumping
        if (isJumping) {
            playerVerticalVelocity += playerGravity;
            camera.position.y += playerVerticalVelocity;

            // Check for landing
            if (camera.position.y <= targetHeight) {
                camera.position.y = targetHeight;
                playerVerticalVelocity = 0;
                isJumping = false;
            }
        }

        // Apply horizontal movement
        cameraAngle += velocity.turning;
        
        if (velocity.forward !== 0 || keys.KeyA || keys.KeyD) {
            let newX = camera.position.x;
            let newZ = camera.position.z;
            
            // Forward/backward movement
            if (velocity.forward !== 0) {
                newX -= Math.sin(cameraAngle) * velocity.forward;
                newZ -= Math.cos(cameraAngle) * velocity.forward;
            }
            
            // Strafe movement
            const strafeSpeed = moveSpeed * (isSprinting ? sprintMultiplier : 1);
            if (keys.KeyA) {
                newX -= Math.cos(cameraAngle) * strafeSpeed;
                newZ += Math.sin(cameraAngle) * strafeSpeed;
            }
            if (keys.KeyD) {
                newX += Math.cos(cameraAngle) * strafeSpeed;
                newZ -= Math.sin(cameraAngle) * strafeSpeed;
            }
            
            // Simple boundary check without slowdown
            const boundary = size * 0.4;
            camera.position.x = Math.max(-boundary, Math.min(boundary, newX));
            camera.position.z = Math.max(-boundary, Math.min(boundary, newZ));
        }
        camera.rotation.y = cameraAngle;
    }

    // Update all stones
    for (let i = 0; i < stones.length; i++) {
        const stone = stones[i];
        const stoneVelocity = stoneVelocities[i];

        // Apply gravity
        stoneVelocity.y += gravity;

        // Update position
        stone.position.x += stoneVelocity.x;
        stone.position.y += stoneVelocity.y;
        stone.position.z += stoneVelocity.z;

        // Get current terrain height at stone position
        const stoneTerrainHeight = getTerrainHeight(stone.position.x, stone.position.z);

        // Ground collision check
        if (stone.position.y <= stoneTerrainHeight + stoneRadius) {
            stone.position.y = stoneTerrainHeight + stoneRadius + groundCheckOffset;
            stoneVelocity.y = 0;

            // Calculate slopes
            const checkDist = 0.5;
            const slopeFront = getTerrainHeight(stone.position.x, stone.position.z + checkDist) - stoneTerrainHeight;
            const slopeBack = getTerrainHeight(stone.position.x, stone.position.z - checkDist) - stoneTerrainHeight;
            const slopeLeft = getTerrainHeight(stone.position.x - checkDist, stone.position.z) - stoneTerrainHeight;
            const slopeRight = getTerrainHeight(stone.position.x + checkDist, stone.position.z) - stoneTerrainHeight;

            // Only roll if slope is steep enough
            const slopeThreshold = 0.05;
            if (Math.abs(slopeFront) > slopeThreshold || 
                Math.abs(slopeBack) > slopeThreshold || 
                Math.abs(slopeLeft) > slopeThreshold || 
                Math.abs(slopeRight) > slopeThreshold) {
                
                // Find steepest slope direction
                let steepestSlope = 0;
                let rollDirection = new THREE.Vector3(0, 0, 0);
                
                if (slopeFront < steepestSlope) {
                    steepestSlope = slopeFront;
                    rollDirection.set(0, 0, 1);
                }
                if (slopeBack < steepestSlope) {
                    steepestSlope = slopeBack;
                    rollDirection.set(0, 0, -1);
                }
                if (slopeLeft < steepestSlope) {
                    steepestSlope = slopeLeft;
                    rollDirection.set(-1, 0, 0);
                }
                if (slopeRight < steepestSlope) {
                    steepestSlope = slopeRight;
                    rollDirection.set(1, 0, 0);
                }

                // Apply rolling force
                const rollForce = rollSpeed * Math.min(Math.abs(steepestSlope), 0.5);
                stoneVelocity.x += rollDirection.x * rollForce;
                stoneVelocity.z += rollDirection.z * rollForce;
            } else {
                // If slope is not steep enough, stop completely
                stoneVelocity.x = 0;
                stoneVelocity.z = 0;
            }

            // Apply friction
            stoneVelocity.x *= (1 - friction);
            stoneVelocity.z *= (1 - friction);

            // Stop if moving very slowly
            if (Math.abs(stoneVelocity.x) < minVelocity) stoneVelocity.x = 0;
            if (Math.abs(stoneVelocity.z) < minVelocity) stoneVelocity.z = 0;

            // Limit maximum velocity
            const currentVelocity = Math.sqrt(stoneVelocity.x * stoneVelocity.x + stoneVelocity.z * stoneVelocity.z);
            if (currentVelocity > maxVelocity) {
                const scale = maxVelocity / currentVelocity;
                stoneVelocity.x *= scale;
                stoneVelocity.z *= scale;
            }
        }
    }
    
    // Check for stone collection
    const playerRadius = 4;
    for (let i = stones.length - 1; i >= 0; i--) {
        const stone = stones[i];
        
        // Calculate distance between player and stone
        const dx = camera.position.x - stone.position.x;
        const dz = camera.position.z - stone.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // If player is close enough, collect the stone
        if (distance < playerRadius) {
            // Remove stone from scene and arrays
            scene.remove(stone);
            stones.splice(i, 1);
            stoneVelocities.splice(i, 1);
            
            // Increment counter and update UI
            stonesCollected++;
            updateStoneCountUI();
        }
    }
    renderer.render(scene, camera);
}

// Create first stone immediately
createNewStone();
lastStoneDropTime = Date.now();

// Initialize UI
updateStoneCountUI();

// Go
animate();

// Handle window resize
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

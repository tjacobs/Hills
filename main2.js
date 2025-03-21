// Ramparty

// Set up scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Constants for terrain and shore
const TERRAIN = {
    size: 200,
    segments: 200,
    height: 5,
    shoreRadius: 80,    // Radius where the beach/shore begins
    shoreWidth: 20      // Width of the shore/beach area
};

// Constants for stone creation
const STONE_SPAWN = {
    radius: 0.5,
    spawnInterval: 1000, // 10 seconds between stone spawns
    waveStrength: 0.05,   // Base strength of the wave pushing stones
    waterLevel: -5.5      // Water level for stone spawning
};

// Constants for stone handling
const STONE_PHYSICS = {
    pickupRange: 2.0,
    pickupDelay: 500,
    maxHeld: 10,
    throwSpeed: 0.3,
    heldOffset: { forward: 1.2, down: 0.8, scale: 0.5 }
};

// Constants for tower building with improved stacking range
const TOWER_PARAMS = {
    blockWidth: 0.8,
    blockHeight: 1.2,
    blockDepth: 1.2,
    outerRadius: 3.5,
    innerRadius: 2.5,
    stackingRadius: 3.2,
    tooCloseDistance: 8.0,
    stackingDistance: 6.0,       // Increased from 3.5 to 6.0 for easier stacking
    verticalStackingRange: 2.0,  // Increased vertical detection range
    climbRadius: 3.0,
    blockCount: 24,
    decorativeStoneCount: 16,
    ringHeight: 1.0,      // Height of each tower ring
    maxRingStack: 10      // Maximum number of rings that can be stacked
};

// Define global variables
let stones = []; // Array to track all stones
let stoneVelocities = []; // Array to track stone velocities
let heldStones = []; // Array to hold multiple stones
let thrownStones = []; // Array to track thrown stones
let towerBases = []; // Array to track tower bases
let lastStoneDropTime = Date.now(); // Track when the last stone was dropped
let lastThrowTime = 0; // Track when the last stone was thrown
let targetHeight = 3; // Target height for player (camera)
let pickupDelay = STONE_PHYSICS.pickupDelay; // Delay between pickups
let maxHeldStones = STONE_PHYSICS.maxHeld; // Maximum stones that can be held
let stoneDropInterval = STONE_SPAWN.spawnInterval; // Interval between stone spawns


// Create the ground plane
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
const stoneTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(8, 8);

// Create custom shader material for ground
const groundMaterial = new THREE.ShaderMaterial({
    uniforms: {
        grassTexture: { value: grassTexture },
        centerDistance: { value: 0.90 },
        transitionWidth: { value: 0.05 }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec2 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
            vUv = uv * 8.0; // Scale UV coordinates for smaller texture
            vPosition = position.xy / 200.0; // Normalize by size (200)
            
            // Calculate view-space position and normal for lighting
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            vNormal = normalMatrix * normal;
            
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform sampler2D grassTexture;
        uniform float centerDistance;
        uniform float transitionWidth;
        
        varying vec2 vUv;
        varying vec2 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
            vec4 grassColor = texture2D(grassTexture, vUv);
            vec4 sandColor = vec4(0.76, 0.70, 0.50, 1.0); // Sandy color
            
            // Calculate distance from center (0-1)
            float distFromCenter = length(vPosition) * 2.0; // Use actual distance instead of max
            
            // Create smooth transition at the edges
            float blend = smoothstep(centerDistance, centerDistance + transitionWidth, distFromCenter);
            
            // Mix grass and sand colors
            vec4 baseColor = mix(grassColor, sandColor, blend);
            
            // Basic lighting calculation
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            
            // Ambient light
            float ambientStrength = 0.3;
            vec3 ambient = ambientStrength * vec3(1.0);
            
            // Diffuse light (sun-like)
            vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * vec3(1.0);
            
            // Combine lighting
            vec3 lighting = ambient + diffuse;
            
            gl_FragColor = vec4(baseColor.rgb * lighting, 1.0);
        }
    `,
    side: THREE.DoubleSide
});

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
        
        // Calculate normalized coordinates (-1 to 1)
        const nx = (i / segments) * 2 - 1;
        const ny = (j / segments) * 2 - 1;
        
        // Calculate distance from center (0 to 1)
        const distFromCenter = Math.max(Math.abs(nx), Math.abs(ny));
        
        // Create sharper edge falloff factor (1 in center, 0 at edges)
        const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, 3));
        
        // Apply height with edge falloff
        vertex.array[index + 2] = Math.sin(i / xs) * Math.sin(j / ys) * height * edgeFalloff;
    }
}
groundGeometry.computeVertexNormals();
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
const sprintMultiplier = 2.0;
const throwForce = 0.8;
const throwUpward = 0.8;
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    Space: false,
    ShiftLeft: false,
    ShiftRight: false,
    KeyA: false,
    KeyD: false
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
        
        // Handle jumping with space key when not holding a stone
        if (e.code === 'Space') {
            // If holding stones, throw one
            if (heldStones.length > 0) {
                handleThrowAction();
            }
            // Otherwise jump (handled in the animation loop)
        }
        
        // Handle pickup with E key
        if (e.code === 'KeyE') {
            handlePickup();
        }
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
    sideways: 0,
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
    joystickContainer.className = 'joystick-container'; // Add class for identification
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

    // Touch event handlers for joystick
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

// Add cloud animation variables
let centerCloudMoving = false;
let centerCloudIndex = -1;
let centerCloudTargetY = 0;
let centerCloudStartY = 0;
let centerCloudStartTime = 0;
let centerCloudAnimationDuration = 10000; // 10 seconds

// Modify the createParticleClouds function to track individual clouds
function createParticleClouds() {
    const cloudParticles = [];
    const particleCount = 300;
    const particleGeometry = new THREE.BufferGeometry();
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 15,
        transparent: true,
        opacity: 0.9,
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

    // Store cloud particles by cloud index
    const cloudParticleIndices = [[], [], [], []];

    for (let i = 0; i < particleCount; i++) {
        // Assign to one of the cloud centers
        const cloudIndex = Math.floor(i / (particleCount / cloudCenters.length));
        const cloudCenter = cloudCenters[cloudIndex];
        
        // Position particles tightly around the cluster center
        const radius = Math.random() * 5;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 2;
        
        // Position particles with natural cloud-like spread, double the width
        positions[i * 3] = cloudCenter.x + (Math.cos(theta) * Math.sin(phi) * radius * 2);
        positions[i * 3 + 1] = cloudCenter.y + (Math.sin(theta) * Math.sin(phi) * radius);
        positions[i * 3 + 2] = cloudCenter.z + (Math.cos(phi) * radius * 2);

        // Set all particles to a larger size for a solid appearance
        scales[i] = 1;
        
        // Track which particles belong to which cloud
        cloudParticleIndices[cloudIndex].push(i);
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    
    // Store cloud centers and particle indices
    particleSystem.userData.cloudCenters = cloudCenters;
    particleSystem.userData.cloudParticleIndices = cloudParticleIndices;
    
    scene.add(particleSystem);
    return particleSystem;
}
const particleClouds = createParticleClouds();

// Start cloud movement after a delay
setTimeout(() => {
    // Calculate center valley position
    const valleySpacing = size / xs;
    const halfSize = size / 2;
    const centerI = Math.floor(xs / 2);
    const centerJ = Math.floor(ys / 2);
    const centerX = -halfSize + (centerI + 0.5) * valleySpacing;
    const centerZ = -halfSize + (centerJ + 0.5) * valleySpacing;
    const centerY = getTerrainHeight(centerX, centerZ) + 15; // 15 units above terrain
    
    // Choose a cloud to move (cloud index 2 - front left)
    centerCloudIndex = 2;
    centerCloudTargetY = centerY;
    centerCloudStartY = particleClouds.userData.cloudCenters[centerCloudIndex].y;
    centerCloudStartTime = Date.now();
    centerCloudMoving = true;
    
    // Update target position
    particleClouds.userData.cloudCenters[centerCloudIndex].targetX = centerX;
    particleClouds.userData.cloudCenters[centerCloudIndex].targetZ = centerZ;
}, 3000); // Start after 3 seconds

function checkAutoPickup() {
    // If already holding max stones, don't pick up more
    if (heldStones.length >= maxHeldStones) return;
    
    // Use a larger pickup range for more reliable collection
    const pickupRange = STONE_PHYSICS.pickupRange * 2;
    
    // Check each stone
    for (let i = stones.length - 1; i >= 0; i--) {
        // Skip if stone doesn't exist
        if (!stones[i]) continue;
        
        // Calculate distance to player (horizontal distance only for better pickup)
        const dx = stones[i].position.x - camera.position.x;
        const dz = stones[i].position.z - camera.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Also check vertical distance
        const dy = Math.abs(stones[i].position.y - camera.position.y);
        
        // If within pickup range horizontally and not too far vertically
        if (distance < pickupRange && dy < 3) {
            console.log("Picking up stone at distance: " + distance);
            
            // Get the stone
            const stone = stones[i];
            
            // Remove from scene
            scene.remove(stone);
            
            // Remove from arrays
            stones.splice(i, 1);
            stoneVelocities.splice(i, 1);
            
            // Scale down for held appearance
            stone.scale.set(
                STONE_PHYSICS.heldOffset.scale,
                STONE_PHYSICS.heldOffset.scale,
                STONE_PHYSICS.heldOffset.scale
            );
            
            // Add to held stones array
            heldStones.push(stone);
            
            // Update the display of held stones
            updateHeldStonesDisplay();
            
            // Only pick up one stone at a time
            break;
        }
    }
}

function updateHeldStonesDisplay() {
    // Remove all held stones from the scene first
    for (let i = 0; i < heldStones.length; i++) {
        if (heldStones[i].parent) {
            scene.remove(heldStones[i]);
        }
    }
    
    // Only display stones if we have any
    if (heldStones.length === 0) return;
    
    // Position for the first stone
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const down = new THREE.Vector3(0, -1, 0);
    
    // Calculate base position (in front and below camera)
    const basePosition = new THREE.Vector3().copy(camera.position)
        .add(forward.multiplyScalar(STONE_PHYSICS.heldOffset.forward))
        .add(down.multiplyScalar(STONE_PHYSICS.heldOffset.down));
    
    // Add all stones to the scene
    for (let i = 0; i < heldStones.length; i++) {
        const stone = heldStones[i];
        
        // Position stones in a small arc in front of the player
        const angle = (i - (heldStones.length - 1) / 2) * 0.2; // Spread stones in an arc
        const offsetRight = right.clone().multiplyScalar(angle);
        const offsetForward = forward.clone().multiplyScalar(0.1 * Math.abs(angle)); // Curve the arc forward
        
        // Set position
        stone.position.copy(basePosition)
            .add(offsetRight)
            .add(offsetForward);
        
        // Make stone follow camera rotation
        stone.rotation.copy(camera.rotation);
        
        // Add to scene
        scene.add(stone);
    }
}

// Animation loop with improved stone physics
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
    
    // Handle keyboard movement with proper acceleration/deceleration
    if (keyboardControlActive) {
        // Reset acceleration values
        let targetForward = 0;
        let targetSideways = 0;
        let targetTurning = 0;
        
        // Calculate target speeds based on key presses
        if (keys.ArrowUp || keys.KeyW) targetForward = maxSpeed;
        if (keys.ArrowDown || keys.KeyS) targetForward = -maxSpeed;
        if (keys.KeyA) targetSideways = -maxSpeed;
        if (keys.KeyD) targetSideways = maxSpeed;
        if (keys.ArrowLeft) targetTurning = maxTurnSpeed;
        if (keys.ArrowRight) targetTurning = -maxTurnSpeed;
        
        // Apply sprint multiplier if shift is pressed
        if ((keys.ShiftLeft || keys.ShiftRight) && (targetForward !== 0 || targetSideways !== 0)) {
            targetForward *= sprintMultiplier;
            targetSideways *= sprintMultiplier;
        }
        
        // Track current velocities
        let currentForward = 0;
        let currentSideways = 0;
        
        // Apply acceleration/deceleration to forward movement
        if (targetForward > velocity.forward) {
            velocity.forward = Math.min(targetForward, velocity.forward + acceleration);
        } else if (targetForward < velocity.forward) {
            velocity.forward = Math.max(targetForward, velocity.forward - deceleration);
        }
        currentForward = velocity.forward;
        
        // Apply acceleration/deceleration to sideways movement
        if (targetSideways > velocity.sideways) {
            velocity.sideways = Math.min(targetSideways, velocity.sideways + acceleration);
        } else if (targetSideways < velocity.sideways) {
            velocity.sideways = Math.max(targetSideways, velocity.sideways - deceleration);
        }
        currentSideways = velocity.sideways;
        
        // Apply acceleration/deceleration to turning
        if (targetTurning > velocity.turning) {
            velocity.turning = Math.min(targetTurning, velocity.turning + turnAcceleration);
        } else if (targetTurning < velocity.turning) {
            velocity.turning = Math.max(targetTurning, velocity.turning - turnDeceleration);
        }
        
        // Apply rotation (turning) first
        cameraAngle += velocity.turning;
        camera.rotation.y = cameraAngle;
        
        // Then move forward/backward in the direction we're facing
        if (Math.abs(currentForward) > 0.001) {
            const moveDirection = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            camera.position.x += moveDirection.x * currentForward;
            camera.position.z += moveDirection.z * currentForward;
        }
        
        // And move sideways (strafe)
        if (Math.abs(currentSideways) > 0.001) {
            const strafeDirection = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            camera.position.x += strafeDirection.x * currentSideways;
            camera.position.z += strafeDirection.z * currentSideways;
        }
        
        // Handle jumping with space key
        if (keys.Space) {
            // If holding stones, throw one
            if (heldStones.length > 0) {
                handleThrowAction();
            } else if (!isJumping) {
                // Otherwise jump
                playerVerticalVelocity = jumpForce;
                isJumping = true;
            }
            keys.Space = false; // Reset space key to prevent continuous jumping/throwing
        }
        
        // Allow walking to the edge but prevent falling into water
        const distFromCenter = Math.sqrt(
            camera.position.x * camera.position.x + 
            camera.position.z * camera.position.z
        );
        
        // Only prevent going into water, not onto the beach
        const maxAllowedDistance = TERRAIN.size / 2; // Full size of the terrain
        
        if (distFromCenter > maxAllowedDistance) {
            // Move back just enough to stay on land
            const toCenter = new THREE.Vector3(-camera.position.x, 0, -camera.position.z).normalize();
            camera.position.x += toCenter.x * 0.2; // Gentle push back
            camera.position.z += toCenter.z * 0.2;
        }
    }
    
    // Handle touch controls if active
    if (isTouching) {
        // Calculate joystick movement
        const deltaX = touchEnd.x - touchStart.x;
        const deltaY = touchEnd.y - touchStart.y;
        
        // Only move if joystick is moved significantly
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
            // Calculate movement direction and strength
            const angle = Math.atan2(deltaY, deltaX);
            const distance = Math.min(50, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
            const strength = distance / 50; // 0 to 1
            
            // Move forward/backward based on joystick Y
            const forwardAmount = -Math.cos(angle - camera.rotation.y) * strength;
            const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            camera.position.x += forward.x * forwardAmount * moveSpeed;
            camera.position.z += forward.z * forwardAmount * moveSpeed;
            
            // Move left/right based on joystick X
            const rightAmount = Math.sin(angle - camera.rotation.y) * strength;
            const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
            camera.position.x += right.x * rightAmount * moveSpeed;
            camera.position.z += right.z * rightAmount * moveSpeed;
        }
    }
    
    // Apply jumping physics
    if (isJumping || playerVerticalVelocity !== 0) {
        // Apply gravity to vertical velocity
        playerVerticalVelocity += playerGravity;
        
        // Update camera height based on vertical velocity
        camera.position.y += playerVerticalVelocity;
        
        // Get ground height at current position
        const groundHeight = getTerrainHeight(camera.position.x, camera.position.z) + 3; // 3 units above ground
        
        // Check if we've landed
        if (camera.position.y <= groundHeight && playerVerticalVelocity < 0) {
            camera.position.y = groundHeight;
            playerVerticalVelocity = 0;
            isJumping = false;
        }
    } else {
        // Update camera height smoothly when not jumping
        const groundHeight = getTerrainHeight(camera.position.x, camera.position.z) + 3;
        camera.position.y += (groundHeight - camera.position.y) * 0.1;
    }
    
    // Check for automatic stone pickup
    checkAutoPickup();
    
    // Update held stones display
    updateHeldStonesDisplay();
    
    // Update stones with simplified physics
    updateStones();
    
    // Update thrown stones with improved physics
    updateThrownStones();
    
    // Check if player is climbing a tower
    checkTowerClimbing();
    
    // Render the scene
    renderer.render(scene, camera);
}

// Fixed getTerrainHeight function
function getTerrainHeight(x, z) {
    // Calculate normalized coordinates (-1 to 1)
    const nx = x / (TERRAIN.size / 2);
    const nz = z / (TERRAIN.size / 2);
    
    // Calculate distance from center (0 to 1)
    const distFromCenter = Math.sqrt(nx * nx + nz * nz);
    
    // If beyond terrain bounds, return water level
    if (distFromCenter > 1.0) {
        return STONE_SPAWN.waterLevel;
    }
    
    // Create edge falloff factor (1 in center, 0 at edges)
    const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, 3));
    
    // Use sine waves for terrain height
    const i = Math.floor((nx + 1) * TERRAIN.segments / 2);
    const j = Math.floor((nz + 1) * TERRAIN.segments / 2);
    
    // Simple height calculation based on position
    const height = Math.sin(i / 8) * Math.sin(j / 8) * TERRAIN.height * edgeFalloff;
    
    return height;
}

// Update pickup function to fix stone pickup
function handlePickup() {
    // If already holding max stones, don't pick up more
    if (heldStones.length >= maxHeldStones) return;
    
    // Check if enough time has passed since last throw
    if (Date.now() - lastThrowTime < pickupDelay) return;
    
    // Find closest stone within range
    let closestStone = null;
    let closestIndex = -1;
    let closestDistance = Infinity;
    
    for (let i = 0; i < stones.length; i++) {
        const stone = stones[i];
        if (!stone) continue; // Skip if undefined
        
        const distance = stone.position.distanceTo(camera.position);
        
        if (distance < STONE_PHYSICS.pickupRange && distance < closestDistance) {
            closestStone = stone;
            closestIndex = i;
            closestDistance = distance;
        }
    }
    
    // If found a stone to pick up
    if (closestStone) {
        // Remove from scene and physics arrays
        scene.remove(closestStone);
        stones.splice(closestIndex, 1);
        stoneVelocities.splice(closestIndex, 1);
        
        // Scale down for held appearance
        closestStone.scale.set(
            STONE_PHYSICS.heldOffset.scale,
            STONE_PHYSICS.heldOffset.scale,
            STONE_PHYSICS.heldOffset.scale
        );
        
        // Add to held stones array
        heldStones.push(closestStone);
        
        // Update the display of held stones
        updateHeldStonesDisplay();
    }
}

// Add function to update stone physics
function updateStones() {
    // Update stone physics
    for (let i = 0; i < stones.length; i++) {
        const stone = stones[i];
        const velocity = stoneVelocities[i];
        
        // Skip if stone doesn't exist
        if (!stone) continue;
        
        // Apply wave motion to stones in water
        if (stone.position.y < -5) {
            // Calculate wave force based on position and time
            const time = Date.now() * 0.001;
            const waveX = Math.sin(time + stone.position.x * 0.1) * STONE_SPAWN.waveStrength;
            const waveZ = Math.cos(time + stone.position.z * 0.1) * STONE_SPAWN.waveStrength;
            
            // Apply wave force to velocity
            velocity.x += waveX;
            velocity.z += waveZ;
            
            // Apply buoyancy to stones in water
            if (stone.position.y < STONE_SPAWN.waterLevel) {
                velocity.y += 0.01 * (STONE_SPAWN.waterLevel - stone.position.y);
            }
        }
        
        // Apply velocity to position
        stone.position.add(velocity);
        
        // Apply friction to slow down stones
        velocity.multiplyScalar(0.98);
        
        // Check if stone is on ground
        const groundHeight = getTerrainHeight(stone.position.x, stone.position.z);
        
        if (stone.position.y < groundHeight) {
            // Position at ground level
            stone.position.y = groundHeight;
            
            // Bounce with reduced velocity
            if (velocity.y < 0) {
                velocity.y = -velocity.y * 0.3;
            }
            
            // Apply more friction when on ground
            velocity.x *= 0.9;
            velocity.z *= 0.9;
        } else {
            // Apply gravity when above ground
            velocity.y -= 0.005;
        }
    }
}

// Make sure createNewStone creates brick-shaped stones with nice textures
function createNewStone() {
    // Create brick-shaped stone geometry
    const stoneWidth = 0.5;
    const stoneHeight = 0.3;
    const stoneDepth = 0.8;
    const stoneGeometry = new THREE.BoxGeometry(stoneWidth, stoneHeight, stoneDepth);
    
    // Create stone material with a rocky texture and bump map
    const stoneMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xA0A0A0,
        roughness: 0.9,
        metalness: 0.1,
        bumpScale: 0.05
    });
    
    // Add noise texture for more realistic appearance
    const noiseSize = 128;
    const data = new Uint8Array(noiseSize * noiseSize * 4);
    for (let i = 0; i < noiseSize * noiseSize * 4; i += 4) {
        const val = Math.floor(Math.random() * 255);
        data[i] = val;
        data[i+1] = val;
        data[i+2] = val;
        data[i+3] = 255;
    }
    
    // Create the texture
    const noiseTexture = new THREE.DataTexture(data, noiseSize, noiseSize, THREE.RGBAFormat);
    noiseTexture.needsUpdate = true;
    
    // Apply the texture as bump map
    stoneMaterial.bumpMap = noiseTexture;
    
    // Create stone mesh
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    
    // Random position on the shore
    const angle = Math.random() * Math.PI * 2;
    const radius = TERRAIN.shoreRadius + Math.random() * TERRAIN.shoreWidth * 0.8;
    
    stone.position.x = Math.cos(angle) * radius;
    stone.position.z = Math.sin(angle) * radius;
    
    // Position slightly above ground level for better visibility
    const groundHeight = getTerrainHeight(stone.position.x, stone.position.z);
    stone.position.y = groundHeight + 0.2;
    
    // Random rotation for natural look
    stone.rotation.x = Math.random() * Math.PI;
    stone.rotation.y = Math.random() * Math.PI;
    stone.rotation.z = Math.random() * Math.PI;
    
    // Add to scene and arrays
    scene.add(stone);
    stones.push(stone);
    stoneVelocities.push(new THREE.Vector3(0, 0, 0));
    
    console.log("Created new stone at:", stone.position);
    
    return stone;
}

// Stone throwing function with weak throw strength
function handleThrowAction() {
    // Check if we have stones to throw
    if (heldStones.length === 0) return;
    
    // Get the last stone (most recently picked up)
    const stone = heldStones.pop();
    
    // Update the display of remaining held stones
    updateHeldStonesDisplay();
    
    // Calculate throw direction (forward direction of camera)
    const throwDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    
    // Add some upward component to the throw
    throwDirection.y += throwUpward * 0.7; // Reduced upward angle
    throwDirection.normalize();
    
    // Set stone position slightly in front of camera
    stone.position.copy(camera.position);
    stone.position.y -= 0.5; // Throw from slightly lower than camera
    const forward = throwDirection.clone().multiplyScalar(1.0);
    stone.position.add(forward);
    
    // Reset stone scale to original size
    stone.scale.set(1, 1, 1);
    
    // Add to scene
    scene.add(stone);
    
    // Create velocity for the stone (weak throw strength)
    const velocity = throwDirection.multiplyScalar(throwForce * 0.6);
    
    // Add to thrown stones array with velocity
    thrownStones.push({
        stone: stone,
        velocity: velocity,
        throwTime: Date.now(),
        bounceCount: 0,
        rotationSpeed: {
            x: (Math.random() - 0.5) * 0.2,
            y: (Math.random() - 0.5) * 0.2,
            z: (Math.random() - 0.5) * 0.2
        }
    });
    
    // Update last throw time
    lastThrowTime = Date.now();
    
    console.log("Stone thrown with velocity:", velocity);
}

// Improved tower climbing function with direct height setting
function checkTowerClimbing() {
    // Check if we're near any tower bases
    for (let i = 0; i < towerBases.length; i++) {
        const towerBase = towerBases[i];
        
        // Calculate horizontal distance to tower
        const dx = camera.position.x - towerBase.position.x;
        const dz = camera.position.z - towerBase.position.z;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        
        // If we're close enough to the tower
        if (horizontalDist < TOWER_PARAMS.climbRadius) {
            // Get tower height
            const towerHeight = towerBase.userData.height;
            const playerHeight = camera.position.y;
            
            // If we're below the tower top (need to climb)
            if (playerHeight < towerHeight) {
                // Directly set player height to tower top
                camera.position.y = towerHeight + 3;
                playerVerticalVelocity = 0;
                isJumping = false;
                
                // Also update target height
                targetHeight = towerHeight + 3;
                
                return; // Exit after finding a tower to climb
            }
        }
    }
    
    // If not climbing, reset target height to normal ground height
    const groundHeight = getTerrainHeight(camera.position.x, camera.position.z);
    targetHeight = groundHeight + 3;
}

// Update player movement with fixed tower climbing
function updatePlayerMovement(delta) {
    // Get current ground height at player position
    const groundHeight = getTerrainHeight(camera.position.x, camera.position.z);
    
    // Check if player is near a tower to climb (this now directly sets height)
    checkTowerClimbing();
    
    // Apply gravity if player is above target height
    if (camera.position.y > targetHeight + 0.1) {
        playerVerticalVelocity += playerGravity;
        
        // Update vertical position
        camera.position.y += playerVerticalVelocity;
    } else if (camera.position.y < targetHeight - 0.1) {
        // If player is slightly below target height, snap to it
        camera.position.y = targetHeight;
        playerVerticalVelocity = 0;
        isJumping = false;
    } else {
        // At target height
        playerVerticalVelocity = 0;
        camera.position.y = targetHeight;
        isJumping = false;
    }
    
    // Prevent falling below ground level
    if (camera.position.y < groundHeight + 3) {
        camera.position.y = groundHeight + 3;
        playerVerticalVelocity = 0;
        isJumping = false;
    }
    
    // Handle movement based on keyboard input
    if (moveForward) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0; // Keep movement horizontal
        forward.normalize();
        camera.position.add(forward.multiplyScalar(playerSpeed * delta));
    }
    if (moveBackward) {
        const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        backward.y = 0; // Keep movement horizontal
        backward.normalize();
        camera.position.add(backward.multiplyScalar(playerSpeed * delta));
    }
    if (moveLeft) {
        const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(camera.quaternion);
        left.y = 0; // Keep movement horizontal
        left.normalize();
        camera.position.add(left.multiplyScalar(playerSpeed * delta));
    }
    if (moveRight) {
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        right.y = 0; // Keep movement horizontal
        right.normalize();
        camera.position.add(right.multiplyScalar(playerSpeed * delta));
    }
}

// Improved function to check if a thrown stone should stack on a tower
function checkTowerStacking(thrownStone) {
    const stone = thrownStone.stone;
    
    // Check each tower base
    for (let i = 0; i < towerBases.length; i++) {
        const towerBase = towerBases[i];
        
        // Calculate horizontal distance to tower
        const dx = stone.position.x - towerBase.position.x;
        const dz = stone.position.z - towerBase.position.z;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        
        // If stone is close enough to the tower horizontally
        if (horizontalDist < TOWER_PARAMS.stackingDistance) {
            // Calculate vertical distance to top of tower
            const towerTop = towerBase.userData.height;
            const verticalDist = Math.abs(stone.position.y - towerTop);
            
            // If stone is close enough to the top of the tower vertically
            if (verticalDist < TOWER_PARAMS.verticalStackingRange) {
                // Stack a new ring on the tower
                stackTowerRing(towerBase);
                
                // Remove the stone
                scene.remove(stone);
                
                // Create a visual guide line from stone to tower
                createStackingGuideLine(stone.position, new THREE.Vector3(
                    towerBase.position.x,
                    towerTop,
                    towerBase.position.z
                ));
                
                console.log("Stacked new ring on tower at distance:", horizontalDist);
                return true;
            }
        }
    }
    
    return false;
}

// Function to create a visual guide line when stacking
function createStackingGuideLine(startPos, endPos) {
    // Create line geometry
    const points = [];
    points.push(startPos.clone());
    points.push(endPos.clone());
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Create line material
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xffff00,
        linewidth: 2
    });
    
    // Create line
    const line = new THREE.Line(lineGeometry, lineMaterial);
    
    // Add to scene
    scene.add(line);
    
    // Remove after a short time
    setTimeout(() => {
        scene.remove(line);
    }, 500);
}

// Adjusted thrown stone physics with improved tower detection
function updateThrownStones() {
    for (let i = thrownStones.length - 1; i >= 0; i--) {
        const thrownStone = thrownStones[i];
        const stone = thrownStone.stone;
        
        // Apply gravity to velocity
        thrownStone.velocity.y += playerGravity * 1.0;
        
        // Store old position for slope calculation
        const oldY = stone.position.y;
        
        // Update position
        stone.position.add(thrownStone.velocity);
        
        // Add rotation as it flies
        stone.rotation.x += thrownStone.rotationSpeed.x * thrownStone.velocity.length();
        stone.rotation.y += thrownStone.rotationSpeed.y * thrownStone.velocity.length();
        stone.rotation.z += thrownStone.rotationSpeed.z * thrownStone.velocity.length();
        
        // Check for tower stacking even in mid-air (but only after some time has passed)
        const timeSinceThrow = Date.now() - thrownStone.throwTime;
        if (timeSinceThrow > 500) {
            // Check if stone is near any tower tops
            for (let j = 0; j < towerBases.length; j++) {
                const towerBase = towerBases[j];
                
                // Calculate horizontal distance to tower
                const dx = stone.position.x - towerBase.position.x;
                const dz = stone.position.z - towerBase.position.z;
                const horizontalDist = Math.sqrt(dx * dx + dz * dz);
                
                // If stone is very close to the tower horizontally
                if (horizontalDist < TOWER_PARAMS.stackingDistance * 0.7) {
                    // Calculate vertical distance to top of tower
                    const towerTop = towerBase.userData.height;
                    const verticalDist = Math.abs(stone.position.y - towerTop);
                    
                    // If stone is close to the top of the tower vertically
                    if (verticalDist < TOWER_PARAMS.verticalStackingRange * 0.7) {
                        // Apply a slight attraction force toward the tower top
                        const attractionStrength = 0.01;
                        thrownStone.velocity.x += (towerBase.position.x - stone.position.x) * attractionStrength;
                        thrownStone.velocity.z += (towerBase.position.z - stone.position.z) * attractionStrength;
                        thrownStone.velocity.y += (towerTop - stone.position.y) * attractionStrength;
                        
                        // Highlight the tower top with a temporary visual effect
                        if (Math.random() > 0.9) {
                            createStackingTargetEffect(new THREE.Vector3(
                                towerBase.position.x,
                                towerTop,
                                towerBase.position.z
                            ));
                        }
                    }
                }
            }
        }
        
        // Check if stone hit the ground
        const groundHeight = getTerrainHeight(stone.position.x, stone.position.z);
        
        if (stone.position.y < groundHeight) {
            // Position at ground level
            stone.position.y = groundHeight;
            
            // Count this bounce
            thrownStone.bounceCount++;
            
            // Calculate ground slope for more realistic bouncing
            // Get heights at nearby points to estimate slope
            const slopeX = getTerrainHeight(stone.position.x + 1, stone.position.z) - 
                          getTerrainHeight(stone.position.x - 1, stone.position.z);
            const slopeZ = getTerrainHeight(stone.position.x, stone.position.z + 1) - 
                          getTerrainHeight(stone.position.x, stone.position.z - 1);
            
            // Create normal vector from slope
            const normal = new THREE.Vector3(-slopeX, 2.0, -slopeZ).normalize();
            
            // Reflect velocity vector around normal with energy loss
            const dot = thrownStone.velocity.dot(normal);
            if (dot < 0) {
                // Calculate reflection vector with energy loss
                const energyLoss = 0.5 - thrownStone.bounceCount * 0.1;
                thrownStone.velocity.sub(normal.multiplyScalar(2 * dot * energyLoss));
                
                // Add some random variation to bounces
                thrownStone.velocity.x += (Math.random() - 0.5) * 0.05;
                thrownStone.velocity.z += (Math.random() - 0.5) * 0.05;
                
                // If on a slope, add some downhill acceleration
                if (Math.abs(slopeX) > 0.1 || Math.abs(slopeZ) > 0.1) {
                    thrownStone.velocity.x += slopeX * 0.02;
                    thrownStone.velocity.z += slopeZ * 0.02;
                }
            }
            
            // Apply friction to horizontal movement
            thrownStone.velocity.x *= 0.8;
            thrownStone.velocity.z *= 0.8;
            
            // If velocity is very low or too many bounces, stone stops moving
            if (thrownStone.velocity.length() < 0.03 || thrownStone.bounceCount > 8) {
                // Check if stone should create a new tower or stack on existing tower
                
                // First check if stone should stack on an existing tower
                if (checkTowerStacking(thrownStone)) {
                    // Stone was used for stacking, remove from thrown stones
                    thrownStones.splice(i, 1);
                    continue;
                }
                
                // Check if stone should create a new tower base
                let tooClose = false;
                for (let j = 0; j < towerBases.length; j++) {
                    const otherBase = towerBases[j];
                    const dist = stone.position.distanceTo(otherBase.position);
                    
                    if (dist < TOWER_PARAMS.tooCloseDistance) {
                        tooClose = true;
                        break;
                    }
                }
                
                // If not too close to other towers, transform into a tower base
                if (!tooClose) {
                    // Create tower base
                    createTowerBase(stone.position.x, stone.position.z);
                    
                    // Remove the stone
                    scene.remove(stone);
                    
                    // Remove from thrown stones
                    thrownStones.splice(i, 1);
                    continue;
                }
                
                // If not creating or stacking a tower, add back to regular stones
                stones.push(stone);
                stoneVelocities.push(new THREE.Vector3(0, 0, 0));
                
                // Remove from thrown stones
                thrownStones.splice(i, 1);
            }
        }
        
        // Remove stones that fall into water
        if (stone.position.y < -6) {
            scene.remove(stone);
            thrownStones.splice(i, 1);
        }
    }
}

// Function to create a visual target effect for stacking
function createStackingTargetEffect(position) {
    // Create a small ring to highlight the target
    const ringGeometry = new THREE.RingGeometry(0.5, 0.7, 16);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.rotation.x = Math.PI / 2; // Lay flat
    
    // Add to scene
    scene.add(ring);
    
    // Animate and remove
    let scale = 1.0;
    const animate = () => {
        scale += 0.05;
        ring.scale.set(scale, scale, scale);
        ring.material.opacity -= 0.02;
        
        if (ring.material.opacity > 0) {
            requestAnimationFrame(animate);
        } else {
            scene.remove(ring);
        }
    };
    
    animate();
}

// Add screen tap for throwing/jumping on mobile
if (isMobileDevice()) {
    // Add tap area for jumping/throwing (right side of screen)
    const jumpArea = document.createElement('div');
    jumpArea.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 50%;
        height: 100%;
        z-index: 10;
    `;
    document.body.appendChild(jumpArea);
    
    // Add tap event for jumping/throwing
    jumpArea.addEventListener('touchstart', (e) => {
        // If holding stones, throw one
        if (heldStones.length > 0) {
            handleThrowAction();
        } else if (!isJumping) {
            // Otherwise jump
            playerVerticalVelocity = jumpForce;
            isJumping = true;
        }
        e.preventDefault();
    });
}

// Initialize the game
function init() {
    // Set up scene, camera, and renderer
    // ... (your existing setup code)
    
    // Create initial stones
    createNewStone();
    
    // Start animation loop
    animate();
}

// Call init function to start the game
window.addEventListener('DOMContentLoaded', init);

// Handle window resize
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Improved tower base creation function without decorative stones
function createTowerBase(x, z) {
    // Create a group to hold all blocks in the ring
    const towerBase = new THREE.Group();
    
    // Position at specified location
    const groundHeight = getTerrainHeight(x, z);
    towerBase.position.set(x, groundHeight, z);
    
    // Store height data and ring count
    towerBase.userData = {
        baseHeight: groundHeight,
        height: groundHeight + TOWER_PARAMS.ringHeight,  // Top of the first ring
        ringCount: 1,
        lastStackTime: Date.now()
    };
    
    // Create a ring of blocks
    const blockCount = TOWER_PARAMS.blockCount;
    const radius = TOWER_PARAMS.stackingRadius;
    
    // Create the texture once for all blocks
    const noiseSize = 128;
    const data = new Uint8Array(noiseSize * noiseSize * 4);
    for (let i = 0; i < noiseSize * noiseSize * 4; i += 4) {
        const val = Math.floor(Math.random() * 255);
        data[i] = val;
        data[i+1] = val;
        data[i+2] = val;
        data[i+3] = 255;
    }
    
    // Create the texture
    const noiseTexture = new THREE.DataTexture(data, noiseSize, noiseSize, THREE.RGBAFormat);
    noiseTexture.needsUpdate = true;
    
    for (let i = 0; i < blockCount; i++) {
        // Calculate position around the circle
        const angle = (i / blockCount) * Math.PI * 2;
        const blockX = Math.cos(angle) * radius;
        const blockZ = Math.sin(angle) * radius;
        
        // Create block geometry
        const blockGeometry = new THREE.BoxGeometry(
            TOWER_PARAMS.blockWidth,
            TOWER_PARAMS.blockHeight,
            TOWER_PARAMS.blockDepth
        );
        
        // Create block material with texture
        const blockMaterial = new THREE.MeshStandardMaterial({
            color: 0x777777,
            roughness: 0.9,
            metalness: 0.1,
            bumpMap: noiseTexture,
            bumpScale: 0.05
        });
        
        // Create block mesh
        const block = new THREE.Mesh(blockGeometry, blockMaterial);
        
        // Position block
        block.position.set(blockX, TOWER_PARAMS.blockHeight / 2, blockZ);
        
        // Rotate block to face center
        block.rotation.y = angle + Math.PI / 2;
        
        // Add to tower base group
        towerBase.add(block);
    }
    
    // Add to scene and tower bases array
    scene.add(towerBase);
    towerBases.push(towerBase);
    
    console.log("Created tower base at", x, z);
    
    return towerBase;
}

// Function to stack a new ring on a tower with consistent color
function stackTowerRing(towerBase) {
    // Check if tower has reached maximum height
    if (towerBase.userData.ringCount >= TOWER_PARAMS.maxRingStack) {
        console.log("Tower has reached maximum height");
        return;
    }
    
    // Create a new group for the ring
    const ring = new THREE.Group();
    
    // Create a ring of blocks
    const blockCount = TOWER_PARAMS.blockCount;
    const radius = TOWER_PARAMS.stackingRadius;
    
    // Calculate new height for this ring
    const newHeight = towerBase.userData.height;
    ring.position.set(0, newHeight - towerBase.userData.baseHeight, 0);
    
    // Create the texture once for all blocks in this ring
    const noiseSize = 128;
    const data = new Uint8Array(noiseSize * noiseSize * 4);
    for (let i = 0; i < noiseSize * noiseSize * 4; i += 4) {
        const val = Math.floor(Math.random() * 255);
        data[i] = val;
        data[i+1] = val;
        data[i+2] = val;
        data[i+3] = 255;
    }
    
    // Create the texture
    const noiseTexture = new THREE.DataTexture(data, noiseSize, noiseSize, THREE.RGBAFormat);
    noiseTexture.needsUpdate = true;
    
    for (let i = 0; i < blockCount; i++) {
        // Calculate position around the circle
        const angle = (i / blockCount) * Math.PI * 2;
        const blockX = Math.cos(angle) * radius;
        const blockZ = Math.sin(angle) * radius;
        
        // Create block geometry
        const blockGeometry = new THREE.BoxGeometry(
            TOWER_PARAMS.blockWidth,
            TOWER_PARAMS.blockHeight,
            TOWER_PARAMS.blockDepth
        );
        
        // Create block material with same color as base tower and texture
        const blockMaterial = new THREE.MeshStandardMaterial({
            color: 0x777777,
            roughness: 0.9,
            metalness: 0.1,
            bumpMap: noiseTexture,
            bumpScale: 0.05
        });
        
        // Create block mesh
        const block = new THREE.Mesh(blockGeometry, blockMaterial);
        
        // Position block
        block.position.set(blockX, TOWER_PARAMS.blockHeight / 2, blockZ);
        
        // Rotate block to face center
        block.rotation.y = angle + Math.PI / 2;
        
        // Add to ring group
        ring.add(block);
    }
    
    // Add ring to tower base
    towerBase.add(ring);
    
    // Update tower data
    towerBase.userData.height = newHeight + TOWER_PARAMS.ringHeight;
    towerBase.userData.ringCount++;
    towerBase.userData.lastStackTime = Date.now();
    
    // Add some visual effect for stacking
    createStackingEffect(new THREE.Vector3(
        towerBase.position.x,
        newHeight,
        towerBase.position.z
    ));
    
    console.log("Stacked new ring on tower, height now:", towerBase.userData.height);
}

// Function to create a visual effect when stacking
function createStackingEffect(position) {
    // Create particles or light flash effect
    const particles = [];
    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
        // Create small particle geometry
        const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.8
        });
        
        // Create particle mesh
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Position at stacking point
        particle.position.copy(position);
        
        // Add random velocity
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            Math.random() * 0.3,
            (Math.random() - 0.5) * 0.2
        );
        
        // Add to scene and particles array
        scene.add(particle);
        particles.push({
            mesh: particle,
            velocity: velocity,
            life: 1.0  // Life counter (1.0 to 0.0)
        });
    }
    
    // Create animation function for particles
    const animateParticles = function() {
        let allDead = true;
        
        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];
            
            // Update position
            particle.mesh.position.add(particle.velocity);
            
            // Apply gravity
            particle.velocity.y -= 0.01;
            
            // Reduce life
            particle.life -= 0.02;
            
            // Update opacity based on life
            particle.mesh.material.opacity = particle.life;
            
            // Scale down as life decreases
            const scale = particle.life * 0.1;
            particle.mesh.scale.set(scale, scale, scale);
            
            // Check if particle is still alive
            if (particle.life > 0) {
                allDead = false;
            } else {
                // Remove dead particle
                scene.remove(particle.mesh);
                particles.splice(i, 1);
                i--;
            }
        }
        
        // Continue animation if particles still exist
        if (!allDead) {
            requestAnimationFrame(animateParticles);
        }
    };
    
    // Start particle animation
    animateParticles();
}

// Create finer grass texture for the terrain
function createFinerGrassTexture() {
    // Create a finer grass texture with 2x the detail
    const textureSize = 512; // Doubled from typical 256
    const data = new Uint8Array(textureSize * textureSize * 4);
    
    // Generate a more detailed noise pattern
    for (let y = 0; y < textureSize; y++) {
        for (let x = 0; x < textureSize; x++) {
            const i = (y * textureSize + x) * 4;
            
            // Create finer noise patterns
            const largeScale = noise.simplex2(x / 20, y / 20) * 0.5 + 0.5;
            const mediumScale = noise.simplex2(x / 10, y / 10) * 0.25 + 0.5;
            const smallScale = noise.simplex2(x / 5, y / 5) * 0.125 + 0.5;
            
            // Combine different scales for more detail
            const combined = (largeScale + mediumScale + smallScale) / 1.375;
            
            // Create grass color variations
            const r = Math.floor(30 + combined * 40);
            const g = Math.floor(100 + combined * 50);
            const b = Math.floor(10 + combined * 40);
            
            // Add small details
            const detail = (noise.simplex2(x / 2, y / 2) * 0.1 + 0.1) * 
                           (x % 2 === 0 && y % 2 === 0 ? 1 : 0.9);
            
            data[i] = Math.min(255, Math.floor(r * (1 + detail)));
            data[i+1] = Math.min(255, Math.floor(g * (1 + detail)));
            data[i+2] = Math.min(255, Math.floor(b * (1 + detail)));
            data[i+3] = 255;
        }
    }
    
    // Create the texture
    const grassTexture = new THREE.DataTexture(data, textureSize, textureSize, THREE.RGBAFormat);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(8, 8); // Increase repeat for finer appearance
    grassTexture.needsUpdate = true;
    
    return grassTexture;
}

// Apply the finer grass texture to the terrain
function updateTerrainTexture() {
    // Create the finer grass texture
    const finerGrassTexture = createFinerGrassTexture();
    
    // Find the terrain mesh and update its material
    scene.traverse((object) => {
        if (object.isMesh && object.name === 'terrain') {
            // Update the material with the finer texture
            object.material.map = finerGrassTexture;
            object.material.needsUpdate = true;
            console.log("Updated terrain with finer grass texture");
        }
    });
}

// Call this function to update the terrain texture
updateTerrainTexture();

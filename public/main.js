/**
 * main.js - 3D Island Game with Tower Building Mechanics
 * 
 * This file sets up the Three.js environment and implements core game functionality
 * including terrain generation, player movement, and stone interaction.
 */

//=============================================================================
// GAME CONSTANTS AND CONFIGURATION
//=============================================================================

// Terrain parameters
const TERRAIN = {
    size: 200,                // Size of the terrain plane
    segments: 200,            // Resolution of the terrain grid
    height: 5,                // Maximum height of terrain hills
    xs: 8,                    // X-scale factor for terrain undulation
    ys: 8,                    // Y-scale factor for terrain undulation
    shoreRadius: 90,          // Percentage where beach/water transition occurs
    shoreWidth: 5,            // Width of the beach transition band
};

// Player movement parameters
const PLAYER = {
    maxSpeed: 0.2,            // Maximum movement speed
    strafeSpeed: 0.1,         // Base strafe movement speed
    sprintMultiplier: 2.0,    // Speed multiplier when sprinting
    rotateSpeed: 0.02,        // Base rotation speed
    maxTurnSpeed: 0.03,       // Maximum turning speed
    acceleration: 0.03,       // Movement acceleration
    turnAcceleration: 0.006,  // Turning acceleration
    deceleration: 0.02,       // Movement deceleration
    turnDeceleration: 0.002,  // Turning deceleration
    jumpForce: 0.5,           // Initial upward velocity when jumping
    gravity: -0.02,           // Gravity force applied to player
    baseHeight: 3,            // Default height above ground
    heightSmoothness: 0.2,    // How smoothly camera follows terrain (lower = smoother)
};

// Stone physics and appearance parameters
const STONE = {
    // Basic properties
    radius: 0.5,              // Base radius of stones
    width: 0.8,               // Width of stone
    height: 0.4,              // Height of stone
    depth: 0.6,               // Depth of stone
    
    // Block dimensions for tower construction
    blockWidth: 0.8,          // Width of blocks used in towers
    blockHeight: 1.2,         // Height of blocks used in towers
    blockDepth: 1.2,          // Depth of blocks used in towers
    
    // Physics parameters
    gravity: -0.01,           // Gravity force applied to stones
    friction: 0.03,           // Ground friction applied to rolling stones
    groundCheckOffset: 0.1,   // Distance to check for ground below stone
    maxVelocity: 0.24,        // Maximum stone velocity cap
    bounce: 0.2,              // Bounce coefficient (lower = less bouncy)
    stopThreshold: 0.01,      // Velocity threshold for stopping
    rollFactor: 0.03,         // Factor for rolling down hills
    
    // Interaction parameters
    dropInterval: 1000,       // Milliseconds between automatic stone spawns
    pickupDelay: 500,         // Milliseconds delay before pickup is allowed
    throwForce: 0.4,          // Force of the throw
    throwUpward: 0.2,         // Upward component of the throw
    
    // Wave interaction
    waveStrength: 0.18,       // Force of waves pushing stones inland
    
    // Held stone parameters
    held: {
        // Positioning
        offset: {
            forward: 1.2,     // How far in front of player the stone appears
            down: 0.8,        // How far below eye level the stone appears
            scale: 1.0        // Scale factor applied to held stones
        },
        // Physics
        physics: {
            springStrength: 0.35, // How strongly stone is pulled to target position
            dampening: 0.6,   // How quickly oscillations are reduced
            rotationLag: 0.15, // How slowly rotation catches up to movement
            bobStrength: 0.02, // Amplitude of up/down bobbing motion
            swayStrength: 0.03 // Amplitude of side-to-side swaying
        }
    }
};

// Tower building parameters
const TOWER = {
    stackingRadius: 8.5,      // Maximum distance for stacking stones
    minTowerDistance: 18.0,   // Minimum distance between separate towers
    transformDelay: 0,        // Milliseconds before stone transforms to tower
    ringHeight: 2.5,          // Height of each tower ring
    blockCount: 8             // Number of blocks in each tower ring
};

//=============================================================================
// SCENE SETUP
//=============================================================================

// Initialize the Three.js scene, camera and renderer
const scene = new THREE.Scene();

// Create perspective camera with 75° FOV, screen aspect ratio, and view frustum limits
const camera = new THREE.PerspectiveCamera(
    75,                                     // Field of view in degrees
    window.innerWidth / window.innerHeight, // Aspect ratio based on window dimensions
    0.1,                                    // Near clipping plane
    1000                                    // Far clipping plane
);

// Initialize WebGL renderer and add to document
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

//=============================================================================
// TEXTURE LOADING
//=============================================================================

// Create texture loader for loading external image assets
const textureLoader = new THREE.TextureLoader();

// Load grass texture for terrain from Three.js examples repository
const grassTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');

// Load stone texture from Three.js examples repository
const stoneTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');

// Configure grass texture to repeat seamlessly across the terrain
grassTexture.wrapS = THREE.RepeatWrapping; // Horizontal wrapping
grassTexture.wrapT = THREE.RepeatWrapping; // Vertical wrapping

// Create custom shader material for ground
const groundMaterial = new THREE.ShaderMaterial({
    uniforms: {
        grassTexture: { value: grassTexture },
        centerDistance: { value: TERRAIN.shoreRadius / 100 },    // Distance from center where beach starts (0-1)
        transitionWidth: { value: 0.05 }   // Width of the beach transition
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec2 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
            vUv = uv * 32.0; // Scale UV coordinates for smaller texture
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
            float distFromCenter = max(abs(vPosition.x), abs(vPosition.y)) * 2.0;
            
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

// Create main hilly ground
const groundGeometry = new THREE.PlaneGeometry(TERRAIN.size, TERRAIN.size, TERRAIN.segments, TERRAIN.segments);
for (let i = 0; i <= TERRAIN.segments; i++) {
    for (let j = 0; j <= TERRAIN.segments; j++) {
        const vertex = groundGeometry.attributes.position;
        const index = (i * (TERRAIN.segments + 1) + j) * 3;
        
        // Calculate normalized coordinates (-1 to 1)
        const nx = (i / TERRAIN.segments) * 2 - 1;
        const ny = (j / TERRAIN.segments) * 2 - 1;
        
        // Calculate distance from center (0 to 1)
        const distFromCenter = Math.max(Math.abs(nx), Math.abs(ny));
        
        // Create sharper edge falloff factor (1 in center, 0 at edges)
        const edgeFalloff = Math.max(0, 1 - Math.pow(distFromCenter * 1.0, 3));
        
        // Apply height with edge falloff
        vertex.array[index + 2] = Math.sin(i / TERRAIN.xs) * Math.sin(j / TERRAIN.ys) * TERRAIN.height * edgeFalloff;
    }
}
groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Create water
const borderSize = TERRAIN.size * 10;
const borderGeometry = new THREE.PlaneGeometry(borderSize, borderSize);
const borderMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x5588ff,  // More vibrant blue color for water
    side: THREE.DoubleSide,
    metalness: 0.2,   // High metalness for water shine
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
let playerVerticalVelocity = 0;  // Track vertical velocity
let isJumping = false;  // Track jump state

// Track key presses
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = true;
        keyboardControlActive = true;
        
        // Handle jumping with space key when not holding a stone
        if (e.code === 'Space') {
            // If holding a stone, throw it
            if (heldStone) {
                handleThrowAction();
            }
            // Otherwise jump (handled in the animation loop)
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
    turning: 0
};

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
    const valleySpacing = TERRAIN.size / TERRAIN.xs;
    const halfSize = TERRAIN.size / 2;
    const centerI = Math.floor(TERRAIN.xs / 2);
    const centerJ = Math.floor(TERRAIN.ys / 2);
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


// Properly defined function for animating particle clouds with validation
function animateParticleClouds() {
    const deltaTime = 0.016; // Assuming ~60fps
    
    // Update each particle
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        
        // Update position based on velocity
        particle.mesh.position.add(particle.velocity);
        
        // Apply gravity and drag
        particle.velocity.y -= 0.01;
        particle.velocity.multiplyScalar(0.95);
        
        // Reduce life
        particle.life -= deltaTime;
        
        // Scale down as life decreases
        const scale = particle.life * 0.5;
        particle.mesh.scale.set(scale, scale, scale);
        
        // Remove dead particles
        if (particle.life <= 0) {
            scene.remove(particle.mesh);
            particles.splice(i, 1);
        }
    }
    
    // Validate particle cloud geometry if it exists
    if (particleClouds && particleClouds.geometry) {
        validateGeometry(particleClouds.geometry);
    }
}

// Properly defined function for animating center cloud with validation
function animateCenterCloud() {
    if (!centerCloud) return;
    
    // Rotate the center cloud
    centerCloud.rotation.y += 0.005;
    
    // Pulse the center cloud
    const time = Date.now() * 0.001;
    const scale = 1.0 + Math.sin(time) * 0.1;
    centerCloud.scale.set(scale, scale, scale);
    
    // Validate center cloud geometry if it exists
    if (particleClouds && particleClouds.geometry) {
        validateGeometry(particleClouds.geometry);
    }
}

// Helper function for geometry validation
function validateGeometry(geometry) {
    if (geometry.isBufferGeometry) {
        const position = geometry.attributes.position;
        if (position && position.array) {
            // Check for NaN values in position array
            for (let i = 0; i < position.array.length; i++) {
                if (isNaN(position.array[i])) {
                    console.warn('Found NaN in geometry position data');
                    position.array[i] = 0; // Replace with a safe value
                }
            }
            position.needsUpdate = true;
        }
    }
}

// Function to get terrain height at a specific position
function getTerrainHeight(x, z) {
    const vertex = groundGeometry.attributes.position;
    const segments = groundGeometry.parameters.widthSegments; // Number of segments in the geometry
    const size = groundGeometry.parameters.width; // Size of the ground

    // Calculate the indices based on the position
    const i = Math.floor(((x + size / 2) / size) * TERRAIN.segments);
    const j = Math.floor(((z + size / 2) / size) * TERRAIN.segments);
    if (i < 0 || i >= TERRAIN.segments || j < 0 || j >= TERRAIN.segments) {
        return -Infinity; // Out of bounds
    }
    const index = (j * (TERRAIN.segments + 1) + i) * 3; // Calculate the index in the vertex array
    return vertex.array[index + 2]; // Return the height (z-coordinate)
}

// Stone management
const stones = [];
const stoneVelocities = [];
let lastStoneDropTime = 0;
let lastThrowTime = 0;   // Track when the last throw happened

// Add shore stone spawning parameters
const shoreRadius = TERRAIN.size * 0.5;
const shoreWidth = 2;
const waveStrength = 0.28;

// Add held stone tracking with physics
let heldStone = null;

// Add this variable declaration at the appropriate place in your code
// (likely near other stone-related variables)
let heldStonePhysics = {
    velocity: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    targetRot: new THREE.Vector3()
};

function createNewStone() {
    // Create a rectangular stone
    const stoneGeometry = new THREE.BoxGeometry(
        STONE.width, 
        STONE.height, 
        STONE.depth
    );
    
    const stoneMaterial = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        metalness: 0.1,
        color: 0x808080,
        bumpMap: stoneTexture,
        bumpScale: 0.5
    });
    
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    
    // Position stone at the edge of the ocean
    const positionRadius = TERRAIN.size * 0.5; // Keep the further out position
    const angle = Math.random() * Math.PI * 2; // Random angle around the circle
    
    // Calculate position at the edge
    stone.position.x = Math.cos(angle) * positionRadius;
    stone.position.z = Math.sin(angle) * positionRadius;
    
    // Get terrain height at this position and place stone on ground
    const groundHeight = getTerrainHeight(stone.position.x, stone.position.z);
    stone.position.y = groundHeight + STONE.radius; // Start at ground level
    
    // Add a gentler initial velocity toward the center
    const centerDirection = new THREE.Vector3(-stone.position.x, 0, -stone.position.z).normalize();
    const initialVelocity = new THREE.Vector3(
        centerDirection.x * 0.02,
        0.16,                     // Keep moderate upward velocity
        centerDirection.z * 0.02
    );
    
    // Random rotation
    stone.rotation.x = Math.random() * Math.PI;
    stone.rotation.y = Math.random() * Math.PI;
    stone.rotation.z = Math.random() * Math.PI;
    
    // Add to scene and arrays
    scene.add(stone);
    stones.push(stone);
    stoneVelocities.push(initialVelocity); // Start with gentler velocity toward center
    return stone;
}

// Update the simulateWaves function to push stones further inland
function simulateWaves() {
    for (let i = 0; i < stones.length; i++) {
        const stone = stones[i];
        const velocity = stoneVelocities[i];
        
        // Calculate distance from center
        const distanceFromCenter = Math.sqrt(
            stone.position.x * stone.position.x + 
            stone.position.z * stone.position.z
        );
        
        // Apply wave force only to stones very near the edge
        const edgeThreshold = TERRAIN.size * 0.47; // Only affect stones very near the edge
        if (distanceFromCenter > edgeThreshold) {
            // Calculate direction toward center
            const centerDirection = new THREE.Vector3(
                -stone.position.x,
                0,
                -stone.position.z
            ).normalize();
            
            // Apply gentler wave force
            const waveStrength = STONE.waveStrength * 0.7 * 
                (distanceFromCenter - edgeThreshold) / (TERRAIN.size * 0.1);
            
            velocity.x += centerDirection.x * waveStrength;
            velocity.z += centerDirection.z * waveStrength;
            
            // Occasionally add a small upward force for subtle bouncing
            if (Math.random() < 0.03) { // Reduced probability
                velocity.y += 0.02; // Reduced upward force
            }
        }
    }
}

// Enhance water splash effect
function createWaterSplash(position) {
    // Create a particle system for splash
    const particleCount = 40; // More particles
    const particleGeometry = new THREE.BufferGeometry();
    const particleMaterial = new THREE.PointsMaterial({
        color: 0x88CCFF,
        size: 0.3,
        transparent: true,
        opacity: 0.8
    });
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    
    // Initialize particles in a small area around the position
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = position.x + (Math.random() - 0.5) * 0.8;
        positions[i3 + 1] = position.y + (Math.random() - 0.5) * 0.3;
        positions[i3 + 2] = position.z + (Math.random() - 0.5) * 0.8;
        
        // Random velocity for each particle - mostly upward and outward
        const outwardDir = new THREE.Vector3(
            positions[i3] - position.x,
            0,
            positions[i3 + 2] - position.z
        ).normalize();
        
        velocities.push({
            x: outwardDir.x * (Math.random() * 0.1 + 0.05),
            y: Math.random() * 0.2 + 0.1, // Higher upward velocity
            z: outwardDir.z * (Math.random() * 0.1 + 0.05)
        });
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    // Animate the splash particles
    const splashLifetime = 1500; // 1.5 seconds
    const startTime = Date.now();
    
    function animateSplash() {
        const elapsed = Date.now() - startTime;
        if (elapsed > splashLifetime) {
            scene.remove(particles);
            return;
        }
        
        const positions = particles.geometry.attributes.position.array;
        const progress = elapsed / splashLifetime;
        
        // Update particle positions based on velocity and gravity
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] += velocities[i].x;
            positions[i3 + 1] += velocities[i].y - 0.005 * progress; // Stronger gravity effect
            positions[i3 + 2] += velocities[i].z;
        }
        
        // Fade out particles
        particles.material.opacity = 0.8 * (1 - progress);
        
        particles.geometry.attributes.position.needsUpdate = true;
        requestAnimationFrame(animateSplash);
    }
    
    animateSplash();
}

// Add smooth height transition parameters
let targetHeight = 3;

// Add global tracking for thrown stones
const thrownStones = [];

// Add tracking for tower bases
const towerBases = [];

// Throws the most recently picked up stone
function handleThrowAction() {
    // Check if we have any stones to throw
    if (heldStone === null || (Date.now() - lastThrowTime < STONE.pickupDelay)) {
        return false;
    }
    
    // Get the last stone in the array (LIFO - last in, first out)
    const stoneToThrow = heldStone;
    stoneToThrow.visible = true;
    
    // Position stone in front of player
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    
    stoneToThrow.position.copy(camera.position)
        .add(new THREE.Vector3(0, -0.3, 0))  // Slightly below eye level
        .add(forward.clone().multiplyScalar(1.0));
    
    // Add stone back to physics arrays
    stones.push(stoneToThrow);
    
    // Calculate throw direction and force from STONE object
    const throwVelocity = new THREE.Vector3(
        forward.x * STONE.throwForce,
        STONE.throwUpward,
        forward.z * STONE.throwForce
    );
    
    // Add to velocities array
    stoneVelocities.push(throwVelocity);
    
    // Mark stone as thrown for tower building
    stoneToThrow.userData.thrown = true;
    
    // Track this stone as thrown
    thrownStones.push({
        stone: stoneToThrow,
        throwTime: Date.now(),
        lastPosition: new THREE.Vector3().copy(stoneToThrow.position),
        stationaryTime: 0,
        transformed: false
    });
    
    // Track throw time for pickup delay
    lastThrowTime = Date.now();
    
    // Play throw sound if available
    if (typeof playSound === 'function') {
        playSound('throw');
    }
    
    // Clear held stone
    heldStone = null;
    
    return true;
}

// Add function to find nearby tower base
function findNearbyTowerBase(position) {
    // Define distances
    const tooCloseDistance = 8.0; // Minimum distance between towers
    const stackingDistance = 3.5; // Distance for stacking
    
    // Check distance to all tower bases
    for (const tower of towerBases) {
        // Calculate horizontal distance to tower
        const horizontalDistance = new THREE.Vector3()
            .copy(position)
            .sub(tower.position)
            .setY(0) // Ignore Y difference for horizontal distance
            .length();
        
        // If too close to any tower but not close enough to stack, reject immediately
        if (horizontalDistance >= stackingDistance && horizontalDistance < tooCloseDistance) {
            return { tooClose: true, tower: tower };
        }
    }
    
    // If we're here, we're either far enough away from all towers or close enough to stack
    // Now find the closest tower for stacking if we're within stacking distance
    let closestTower = null;
    let closestDistance = Infinity;
    
    for (const tower of towerBases) {
        const horizontalDistance = new THREE.Vector3()
            .copy(position)
            .sub(tower.position)
            .setY(0) // Ignore Y difference for horizontal distance
            .length();
        
        // Only consider for stacking if very close horizontally
        if (horizontalDistance < stackingDistance) {
            // Find the top-most tower in this stack
            let topTower = tower;
            while (topTower.userData.childTower) {
                topTower = topTower.userData.childTower;
            }
            
            // Calculate full 3D distance to the top tower
            const fullDistance = topTower.position.distanceTo(position);
            
            // If this is the closest tower so far
            if (fullDistance < closestDistance) {
                closestTower = topTower;
                closestDistance = fullDistance;
            }
        }
    }
    
    return closestTower;
}

// Add function to transform stone into tower base
function transformStoneToTowerBase(stone, index) {
    // Check if stone is near an existing tower base
    const nearbyResult = findNearbyTowerBase(stone.position);
    
    // If too close to existing tower but not for stacking, don't create a tower
    if (false && nearbyResult && nearbyResult.tooClose === true) {
        console.log("REJECTED: Too close to existing tower, not creating a new tower");
        
        // Create a small dust effect to show rejection
        createDustEffect(stone.position);
        
        // Instead of removing the stone, just return it to its original position
        // with a small bounce effect
        const bounceHeight = 1.0;
        stone.position.y += bounceHeight;
        
        // Give it a small random velocity to bounce away
        stoneVelocities[index].x = (Math.random() - 0.5) * 0.1;
        stoneVelocities[index].y = 0.1; // Small upward velocity
        stoneVelocities[index].z = (Math.random() - 0.5) * 0.1;
        
        return null;
    }
    
    const nearbyTower = nearbyResult; // Normal tower reference if not too close
    let yPosition = 0;
    let parentTower = null;
    
    if (nearbyTower) {
        console.log("STACKING: Found nearby tower for stacking, level: " + nearbyTower.userData.level);
        // Position directly on top of existing tower (no gap)
        yPosition = nearbyTower.position.y + 1.2; // Just the height of one block
        parentTower = nearbyTower;        
    } else {
        // Position on ground - raised higher
        yPosition = getTerrainHeight(stone.position.x, stone.position.z) + 0.3;
        console.log("CREATING NEW: Tower at ground level: " + yPosition);
    }
    
    // Create a group to hold all parts of the tower base
    const towerBase = new THREE.Group();
    
    // Create stone-like material with the same texture as stones
    const stoneMaterial = new THREE.MeshStandardMaterial({ 
        roughness: 0.9,
        metalness: 0.1,
        color: 0x808080,
        bumpMap: stoneTexture,
        bumpScale: 0.5
    });
    
    // Determine radius based on tower level
    let outerRadius = 3.5;
    
    // If stacking, make slightly smaller
    if (nearbyTower) {
        outerRadius = 3.2;
    }
    
    // Create blocks for outer ring
    const blockCount = 24;
    for (let i = 0; i < blockCount; i++) {
        const angle = (i / blockCount) * Math.PI * 2;
        const x = Math.cos(angle) * outerRadius;
        const z = Math.sin(angle) * outerRadius;
        
        // Create a stone block
        const blockGeometry = new THREE.BoxGeometry(STONE.blockWidth, STONE.blockHeight, STONE.blockDepth);
        const block = new THREE.Mesh(blockGeometry, stoneMaterial);
        
        // Position in a ring
        block.position.set(x, STONE.blockHeight/2, z);
        
        // Rotate to face center
        block.rotation.y = angle + Math.PI/2;
        
        // Add slight random rotation for natural look
        block.rotation.x += (Math.random() - 0.5) * 0.1;
        block.rotation.z += (Math.random() - 0.5) * 0.1;
        
        // Add to tower base group
        towerBase.add(block);
    }
    
    // Add stone texture details - small stones around the perimeter
    if (!nearbyTower) { // Only add decorative stones on ground level
        const stoneCount = 16;
        const stoneSize = 0.3;
        
        for (let i = 0; i < stoneCount; i++) {
            const angle = (i / stoneCount) * Math.PI * 2;
            const x = Math.cos(angle) * (outerRadius - stoneSize/2);
            const z = Math.sin(angle) * (outerRadius - stoneSize/2);
            
            const stoneGeometry = new THREE.BoxGeometry(stoneSize, stoneSize*0.6, stoneSize);
            const smallStoneMaterial = stoneMaterial.clone();
            smallStoneMaterial.bumpScale = 0.3;
            const stoneMesh = new THREE.Mesh(stoneGeometry, smallStoneMaterial);
            
            stoneMesh.position.set(x, STONE.blockHeight/2, z);
            stoneMesh.rotation.y = angle + Math.PI/2;
            stoneMesh.rotation.x += (Math.random() - 0.5) * 0.2;
            stoneMesh.rotation.z += (Math.random() - 0.5) * 0.2;
            
            towerBase.add(stoneMesh);
        }
    }
    
    // Position the entire tower base
    if (nearbyTower) {
        // Use the same x,z position as the tower below
        towerBase.position.x = nearbyTower.position.x;
        towerBase.position.z = nearbyTower.position.z;
    } else {
        // Use the stone's position
        towerBase.position.x = stone.position.x;
        towerBase.position.z = stone.position.z;
    }
    towerBase.position.y = yPosition;
    
    // Store reference to parent tower if stacking
    towerBase.userData.parentTower = parentTower;
    towerBase.userData.level = parentTower ? parentTower.userData.level + 1 : 1;
    
    // Update parent to reference this as its child
    if (parentTower) {
        parentTower.userData.childTower = towerBase;
    }
    
    // Add to scene and tracking array
    scene.add(towerBase);
    towerBases.push(towerBase);
    
    // Remove original stone
    scene.remove(stone);
    stones.splice(index, 1);
    stoneVelocities.splice(index, 1);
    
    return towerBase;
}

// Add a simple dust effect function
function createDustEffect(position) {
    // Create a particle system for dust
    const particleCount = 20;
    const particleGeometry = new THREE.BufferGeometry();
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xCCCCCC,
        size: 0.2,
        transparent: true,
        opacity: 0.8
    });
    
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    
    // Initialize particles in a small area around the position
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = position.x + (Math.random() - 0.5) * 0.5;
        positions[i3 + 1] = position.y + (Math.random() - 0.5) * 0.5;
        positions[i3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
        
        // Random velocity for each particle
        velocities.push({
            x: (Math.random() - 0.5) * 0.05,
            y: Math.random() * 0.05 + 0.02,
            z: (Math.random() - 0.5) * 0.05
        });
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    // Animate the dust particles
    const dustLifetime = 1000; // 1 second
    const startTime = Date.now();
    
    function animateDust() {
        const elapsed = Date.now() - startTime;
        if (elapsed > dustLifetime) {
            scene.remove(particles);
            return;
        }
        
        const positions = particles.geometry.attributes.position.array;
        const progress = elapsed / dustLifetime;
        
        // Update particle positions based on velocity and gravity
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] += velocities[i].x;
            positions[i3 + 1] += velocities[i].y - 0.001 * progress; // Add gravity effect
            positions[i3 + 2] += velocities[i].z;
        }
        
        // Fade out particles
        particles.material.opacity = 0.8 * (1 - progress);
        
        particles.geometry.attributes.position.needsUpdate = true;
        requestAnimationFrame(animateDust);
    }
    
    animateDust();
}

// Add function to check thrown stones
function checkThrownStones() {
    for (let i = thrownStones.length - 1; i >= 0; i--) {
        const thrownStone = thrownStones[i];
        
        // Skip if already transformed
        if (thrownStone.transformed) {
            thrownStones.splice(i, 1);
            continue;
        }
        
        // Find stone in stones array
        const stoneIndex = stones.indexOf(thrownStone.stone);
        if (stoneIndex === -1) {
            // Stone no longer exists
            thrownStones.splice(i, 1);
            continue;
        }
        
        // Check if stone has moved
        const stone = thrownStone.stone;
        const movement = new THREE.Vector3()
            .copy(stone.position)
            .sub(thrownStone.lastPosition)
            .length();
        
        // Update last position
        thrownStone.lastPosition.copy(stone.position);
        
        // If stone has barely moved
        if (movement < 0.01) {
            // Increment stationary time
            thrownStone.stationaryTime += 16; // Assuming ~60fps
            
            // If stone has been stationary
            if (thrownStone.stationaryTime > 100) {
                transformStoneToTowerBase(stone, stoneIndex);
                thrownStone.transformed = true;
            }
        } else {
            // Reset stationary time if moving
            thrownStone.stationaryTime = 0;
        }
    }
}

// Update the stone physics to allow rolling down hills
window.updateStones = function() {
    // Define physics constants
    const STONE_GRAVITY = 0.025;       // Gravity strength
    const STONE_BOUNCE = 0.2;          // Bounce coefficient (lower = less bouncy)
    const STONE_FRICTION = 0.85;       // Reduced friction (higher = less friction)
    const STONE_STOP_THRESHOLD = 0.01; // Lower threshold to allow more movement
    const STONE_ROLL_FACTOR = 0.03;    // Increased factor for faster hill rolling (was 0.01)
    
    // Update stone positions based on velocities
    for (let i = 0; i < stones.length; i++) {
        const stone = stones[i];
        const velocity = stoneVelocities[i];
        
        // Skip if stone or velocity is invalid
        if (!stone || !velocity) continue;
        
        // Check if stone is already stopped
        if (velocity.lengthSq() === 0) continue;
        
        // Store previous position for rotation calculation
        const prevPosition = stone.position.clone();
        
        // Apply velocity to position
        stone.position.x += velocity.x;
        stone.position.y += velocity.y;
        stone.position.z += velocity.z;
        
        // Apply gravity to velocity
        velocity.y -= STONE_GRAVITY;
        
        // Check if stone is on or near ground
        const groundHeight = getTerrainHeight ? 
            getTerrainHeight(stone.position.x, stone.position.z) : 
            0;
        
        if (stone.position.y < groundHeight + STONE.radius) {
            // Position stone on ground
            stone.position.y = groundHeight + STONE.radius;
            
            // Bounce with energy loss
            velocity.y = -velocity.y * STONE_BOUNCE;
            
            // Apply friction to horizontal movement
            velocity.x *= STONE_FRICTION;
            velocity.z *= STONE_FRICTION;
            
            // Calculate terrain slope for rolling
            let slopeX = 0;
            let slopeZ = 0;
            
            // Sample terrain at nearby points to determine slope if getTerrainHeight exists
            if (typeof getTerrainHeight === 'function') {
                // Use a larger sample distance to detect slopes better
                const sampleDistance = 0.8; // Increased from 0.5
                const heightRight = getTerrainHeight(stone.position.x + sampleDistance, stone.position.z);
                const heightLeft = getTerrainHeight(stone.position.x - sampleDistance, stone.position.z);
                const heightFront = getTerrainHeight(stone.position.x, stone.position.z + sampleDistance);
                const heightBack = getTerrainHeight(stone.position.x, stone.position.z - sampleDistance);
                
                // Calculate slope components (negative because we want to roll downhill)
                slopeX = (heightLeft - heightRight) * STONE_ROLL_FACTOR;
                slopeZ = (heightBack - heightFront) * STONE_ROLL_FACTOR;
                
                // Enhance slope effect for steeper slopes
                const slopeMagnitude = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);
                if (slopeMagnitude > 0.001) {
                    // Apply a non-linear boost to steeper slopes
                    const slopeBoost = 1.0 + slopeMagnitude * 10.0;
                    slopeX *= slopeBoost;
                    slopeZ *= slopeBoost;
                }
                
                // Add slope-based acceleration (rolling downhill)
                velocity.x += slopeX;
                velocity.z += slopeZ;
                
                // Reduce friction when on slopes to allow faster rolling
                if (slopeMagnitude > 0.002) {
                    // Apply less friction on steeper slopes
                    const slopeFriction = Math.min(0.98, 0.85 + slopeMagnitude * 5.0);
                    velocity.x *= slopeFriction;
                    velocity.z *= slopeFriction;
                }
            }
            
            // Calculate the total horizontal velocity
            const horizontalSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
            
            // If stone is moving very slowly and not on a significant slope, stop it completely
            const significantSlope = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ) > 0.001;
            
            if (horizontalSpeed < STONE_STOP_THRESHOLD && Math.abs(velocity.y) < STONE_STOP_THRESHOLD) {
                if (!significantSlope) {
                    // Stop the stone completely
                    velocity.set(0, 0, 0);
                    continue; // Skip the rest of the loop for this stone
                }
            }
            
            // Additional stopping check for very slow movement
            if (horizontalSpeed < STONE_STOP_THRESHOLD * 0.5) {
                if (!significantSlope) {
                    // Stop horizontal movement
                    velocity.x = 0;
                    velocity.z = 0;
                }
            }
            
            // Stop vertical movement if very small
            if (Math.abs(velocity.y) < STONE_STOP_THRESHOLD * 0.5) {
                velocity.y = 0;
            }
        }
        
        // Check if stone is outside the boundary
        const boundary = TERRAIN.size * 0.49;
        if (Math.abs(stone.position.x) > boundary) {
            stone.position.x = Math.sign(stone.position.x) * boundary;
            velocity.x = -velocity.x * STONE_BOUNCE;
        }
        if (Math.abs(stone.position.z) > boundary) {
            stone.position.z = Math.sign(stone.position.z) * boundary;
            velocity.z = -velocity.z * STONE_BOUNCE;
        }
        
        // Update stone rotation based on movement
        if (velocity.length() > 0.01) {
            const movement = new THREE.Vector3().subVectors(stone.position, prevPosition);
            const rotationAxis = new THREE.Vector3(-movement.z, 0, movement.x).normalize();
            const rotationAmount = movement.length() * 2;
            stone.rotateOnAxis(rotationAxis, rotationAmount);
        }
    }
};

// Add tower climbing functionality
function checkTowerClimbing() {
    // Get player position (camera position)
    const playerPosition = new THREE.Vector3().copy(camera.position);
    
    // Track the highest tower found
    let highestTower = null;
    let highestLevel = 0;
    
    // Check distance to all tower bases
    for (const tower of towerBases) {
        // Calculate horizontal distance to tower
        const distance = new THREE.Vector3()
            .copy(playerPosition)
            .sub(tower.position)
            .setY(0) // Ignore Y difference
            .length();
        
        // If player is inside tower radius
        const climbRadius = 3.0; // Slightly smaller than tower radius
        if (distance < climbRadius) {
            // Find the top-most tower in this stack
            let topTower = tower;
            while (topTower.userData.childTower) {
                topTower = topTower.userData.childTower;
            }
            
            // Check if this is higher than our current highest
            if (!highestTower || topTower.position.y > highestTower.position.y) {
                highestTower = topTower;
                highestLevel = topTower.userData.level || 1;
            }
        }
    }
    
    // If we found a tower to climb
    if (highestTower) {
        // Calculate the exact height - ensure it's a positive value
        const blockHeight = STONE.blockHeight; // This should match the height of blocks in transformStoneToTowerBase
        targetHeight = Math.max(highestTower.position.y + blockHeight, 3) + 1;
        
        return true;
    }
    
    // If not in any tower, set target height to normal walking height
    targetHeight = getTerrainHeight(playerPosition.x, playerPosition.z) + 3;
    return false;
}

// Modify the animate function to handle cloud movement
function animate() {
    requestAnimationFrame(animate);
    
    // Animate water (border ground)
    const time = Date.now() * 0.001;
    borderGround.position.y = -6 + Math.sin(time) * 0.1; // Gentle bobbing motion around new base height
    
    // Check if it's time to drop a new stone
    const currentTime = Date.now();
    if (currentTime - lastStoneDropTime > STONE.dropInterval) {
        createNewStone();
        lastStoneDropTime = currentTime;
    }

    // Animate particle clouds
    if (particleClouds) {
        const positions = particleClouds.geometry.attributes.position.array;
        const time = Date.now() * 0.00001;
        
        // Handle center cloud animation
        if (centerCloudMoving) {
            const elapsed = Date.now() - centerCloudStartTime;
            const progress = Math.min(1.0, elapsed / centerCloudAnimationDuration);
            
            // Ease-in-out function for smooth movement
            const easeProgress = progress < 0.5 
                ? 2 * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            // Update cloud center Y position
            const cloudCenter = particleClouds.userData.cloudCenters[centerCloudIndex];
            const newY = centerCloudStartY + (centerCloudTargetY - centerCloudStartY) * easeProgress;
            
            // Calculate movement delta
            const deltaY = newY - cloudCenter.y;
            cloudCenter.y = newY;
            
            // Calculate horizontal movement
            let deltaX = 0;
            let deltaZ = 0;
            
            if (cloudCenter.targetX !== undefined && cloudCenter.targetZ !== undefined) {
                // Calculate smoother horizontal movement
                const horizontalSpeed = 0.00001;
                deltaX = (cloudCenter.targetX - cloudCenter.x) * horizontalSpeed;
                deltaZ = (cloudCenter.targetZ - cloudCenter.z) * horizontalSpeed;
                cloudCenter.x += deltaX;
                cloudCenter.z += deltaZ;
            }
            
            // Update all particles in this cloud as a group
            const cloudParticles = particleClouds.userData.cloudParticleIndices[centerCloudIndex];
            for (const i of cloudParticles) {
                // Move each particle by the same delta as the center
                positions[i * 3] += deltaX;
                positions[i * 3 + 1] += deltaY;
                positions[i * 3 + 2] += deltaZ;
            }

            // End animation when complete
            if (progress >= 1.0) {
                centerCloudMoving = false;
            }
        }
        
        // Add gentle movement to all clouds while preserving their shape (reduced movement)
        const cloudCenters = particleClouds.userData.cloudCenters;
        const cloudParticleIndices = particleClouds.userData.cloudParticleIndices;
        
        for (let cloudIdx = 0; cloudIdx < cloudCenters.length; cloudIdx++) {
            // Skip the center cloud if it's moving
            if (centerCloudMoving && cloudIdx === centerCloudIndex) continue;
            
            // Calculate gentle movement for this cloud center (reduced amplitude)
            const cloudCenter = cloudCenters[cloudIdx];
            const waveX = Math.sin(time * 50 + cloudIdx * 100) * 0.02; // Reduced from 0.05
            const waveY = Math.cos(time * 30 + cloudIdx * 100) * 0.02; // Reduced from 0.05
            const waveZ = Math.sin(time * 40 + cloudIdx * 100) * 0.02; // Reduced from 0.05
            
            // Move all particles in this cloud together
            const particles = cloudParticleIndices[cloudIdx];
            for (const i of particles) {
                positions[i * 3] += waveX;
                positions[i * 3 + 1] += waveY;
                positions[i * 3 + 2] += waveZ;
            }
        }
        
        particleClouds.geometry.attributes.position.needsUpdate = true;
    }

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
        const currentSpeed = isSprinting ? PLAYER.sprintMultiplier : 1;
        
        // Handle keyboard and touch movement with acceleration
        if (keys.ArrowLeft || (isTouching && (touchEnd.x - touchStart.x) < -20)) {
            velocity.turning = Math.min(velocity.turning + PLAYER.turnAcceleration, 
                PLAYER.maxTurnSpeed * (isSprinting ? PLAYER.sprintMultiplier : 1));
        } else if (keys.ArrowRight || (isTouching && (touchEnd.x - touchStart.x) > 20)) {
            velocity.turning = Math.max(velocity.turning - PLAYER.turnAcceleration, 
                -PLAYER.maxTurnSpeed * (isSprinting ? PLAYER.sprintMultiplier : 1));
        } else {
            // Decelerate turning
            if (velocity.turning > 0) {
                velocity.turning = Math.max(0, velocity.turning - PLAYER.turnDeceleration);
            } else if (velocity.turning < 0) {
                velocity.turning = Math.min(0, velocity.turning + PLAYER.turnDeceleration);
            }
        }
        
        // Forward/backward movement
        if (keys.ArrowUp || (isTouching && (touchStart.y - touchEnd.y) > 20)) {
            velocity.forward = Math.min(velocity.forward + PLAYER.acceleration, PLAYER.maxSpeed * (isSprinting ? PLAYER.sprintMultiplier : 1));
        } else if (keys.ArrowDown || (isTouching && (touchStart.y - touchEnd.y) < -20)) {
            velocity.forward = Math.max(velocity.forward - PLAYER.acceleration, -PLAYER.maxSpeed * (isSprinting ? PLAYER.sprintMultiplier : 1));
        } else {
            // Decelerate forward/backward
            if (velocity.forward > 0) {
                velocity.forward = Math.max(0, velocity.forward - PLAYER.deceleration);
            } else if (velocity.forward < 0) {
                velocity.forward = Math.min(0, velocity.forward + PLAYER.deceleration);
            }
        }

        // Check for tower climbing before handling terrain height
        const isClimbing = checkTowerClimbing();
        
        // Smoothly interpolate current height to target height
        if (!isJumping) {  // Only smooth terrain following when not jumping
            camera.position.y += (targetHeight - camera.position.y) * PLAYER.heightSmoothness;
        }

        // Handle jumping (only if not holding stone and not throwing)
        if (keys.Space && !isJumping && !heldStone && Math.abs(camera.position.y - targetHeight) < 0.1 && (Date.now() - lastThrowTime > STONE.pickupDelay)) {
            playerVerticalVelocity = PLAYER.jumpForce;
            isJumping = true;
        }

        // Apply gravity and update vertical position when jumping
        if (isJumping) {
            playerVerticalVelocity += PLAYER.gravity;
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
            const strafeSpeed = PLAYER.strafeSpeed * (isSprinting ? PLAYER.sprintMultiplier : 1);
            if (keys.KeyA) {
                newX -= Math.cos(cameraAngle) * strafeSpeed;
                newZ += Math.sin(cameraAngle) * strafeSpeed;
            }
            if (keys.KeyD) {
                newX += Math.cos(cameraAngle) * strafeSpeed;
                newZ -= Math.sin(cameraAngle) * strafeSpeed;
            }

            // Limit            
            const boundary = TERRAIN.size * 0.49;
            camera.position.x = Math.max(-boundary, Math.min(boundary, newX));
            camera.position.z = Math.max(-boundary, Math.min(boundary, newZ));
        }
        camera.rotation.y = cameraAngle;
    }

    // Update stones with simplified physics
    updateStones();
    simulateWaves(); // Add wave simulation
    
    // Check thrown stones for transformation
    checkThrownStones();
    
    // Check for stone collection
    const playerRadius = 4;
    for (let i = stones.length - 1; i >= 0; i--) {
        const stone = stones[i];
        
        // Calculate distance between player and stone
        const dx = camera.position.x - stone.position.x;
        const dz = camera.position.z - stone.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // If player is close enough and not holding a stone and enough time has passed since throwing
        if (distance < playerRadius && !heldStone && (currentTime - lastThrowTime > STONE.pickupDelay)) {
            // Remove stone from physics arrays
            stones.splice(i, 1);
            stoneVelocities.splice(i, 1);
            
            // Set as held stone
            heldStone = stone;
            
            // Scale down the held stone
            heldStone.scale.set(
                STONE.held.offset.scale, 
                STONE.held.offset.scale, 
                STONE.held.offset.scale
            );
        }
    }

    // Update held stone position with physics in animate()
    if (heldStone) {
        // Calculate ideal position based on camera
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);
        
        heldStonePhysics.targetPos.set(
            camera.position.x + forward.x * STONE.held.offset.forward,
            camera.position.y - STONE.held.offset.down,
            camera.position.z + forward.z * STONE.held.offset.forward
        );
        
        // Add bobbing based on movement
        const time = Date.now() * 0.003;
        if (velocity.forward !== 0) {
            heldStonePhysics.targetPos.y += Math.sin(time * 5) * STONE.held.physics.bobStrength;
            heldStonePhysics.targetPos.x += Math.cos(time * 2.5) * STONE.held.physics.swayStrength;
        }
        
        // Apply spring physics
        const deltaPos = new THREE.Vector3().subVectors(heldStonePhysics.targetPos, heldStone.position);
        heldStonePhysics.velocity.add(deltaPos.multiplyScalar(STONE.held.physics.springStrength));
        heldStonePhysics.velocity.multiplyScalar(STONE.held.physics.dampening);
        
        // Update position
        heldStone.position.add(heldStonePhysics.velocity);
        
        // Smooth rotation
        heldStonePhysics.targetRot.y = camera.rotation.y;
        heldStone.rotation.y += (heldStonePhysics.targetRot.y - heldStone.rotation.y) * STONE.held.physics.rotationLag;
        
        // Add slight tilt based on movement
        if (velocity.forward !== 0) {
            heldStone.rotation.z = Math.sin(time * 5) * 0.1;
            heldStone.rotation.x = Math.cos(time * 2.5) * 0.1;
        } else {
            heldStone.rotation.z *= 0.95;
            heldStone.rotation.x *= 0.95;
        }
    }

    // Check for cloud-tower interaction
    handleCloudTowerInteraction();

    renderer.render(scene, camera);
}

// Create first stone immediately
createNewStone();
lastStoneDropTime = Date.now();

// Go
animate();

// Handle window resize
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
// Update keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Save game state with Ctrl+S
    if (e.code === 'KeyS' && e.ctrlKey) {
        e.preventDefault(); // Prevent browser save dialog
        saveGameState();
        console.log('Game state saved!');
    }
    
    // Restore towers only with Ctrl+L
    if (e.code === 'KeyL' && e.ctrlKey) {
        e.preventDefault();
        restoreTowersOnly(); // Only restore towers
    }
    
    // Full restore (including stones) with Ctrl+Shift+L
    if (e.code === 'KeyL' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        restoreGameState(); // Full restore
    }
});

// Add key handler for throwing with more force (shift+E)
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') {
        // Check if shift is pressed for power throw
        if (e.shiftKey) {
            // Store original values
            const originalThrowForce = STONE.throwForce;
            const originalThrowUpward = STONE.throwUpward;
            
            // Set higher values for power throw (but still moderate)
            STONE.throwForce = 0.6;  // Stronger than normal but still weak
            STONE.throwUpward = 0.4; // Higher arc but still low
            
            // Throw the stone
            handleThrowAction();
            
            // Restore original values
            STONE.throwForce = originalThrowForce;
            STONE.throwUpward = originalThrowUpward;
        } else {
            // Normal throw
            handleThrowAction();
        }
    }
});

/**
 * Validates a vector to ensure it doesn't contain NaN values
 * @param {THREE.Vector3} vector - The vector to validate
 * @returns {boolean} - True if the vector is valid, false otherwise
 */
function isValidVector(vector) {
    return vector && 
           !isNaN(vector.x) && !isNaN(vector.y) && !isNaN(vector.z) &&
           isFinite(vector.x) && isFinite(vector.y) && isFinite(vector.z);
}

/**
 * Fixes a vector by replacing NaN or infinite values with defaults
 * @param {THREE.Vector3} vector - The vector to fix
 * @returns {THREE.Vector3} - The fixed vector
 */
function fixVector(vector) {
    if (!vector) return new THREE.Vector3();
    
    if (!isValidVector(vector)) {
        if (isNaN(vector.x) || !isFinite(vector.x)) vector.x = 0;
        if (isNaN(vector.y) || !isFinite(vector.y)) vector.y = 0;
        if (isNaN(vector.z) || !isFinite(vector.z)) vector.z = 0;
    }
    return vector;
}

/**
 * Validates and fixes a buffer geometry to prevent NaN errors
 * @param {THREE.BufferGeometry} geometry - The geometry to validate
 */
function validateGeometry(geometry) {
    if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
    
    const positions = geometry.attributes.position.array;
    let fixed = false;
    
    // Check for NaN values in position array
    for (let i = 0; i < positions.length; i++) {
        if (isNaN(positions[i]) || !isFinite(positions[i])) {
            positions[i] = 0;
            fixed = true;
        }
    }
    
    // If we fixed any values, update the attribute
    if (fixed) {
        geometry.attributes.position.needsUpdate = true;
    }
}

/**
 * Validates all geometries in the scene
 */
function validateAllGeometries() {
    // Check all objects in the scene
    scene.traverse(function(object) {
        if (object.geometry) {
            validateGeometry(object.geometry);
        }
    });
}

// Add a specific check for the center cloud animation
if (typeof animateCenterCloud === 'function') {
    const originalAnimateCenterCloud = animateCenterCloud;
    animateCenterCloud = function() {
        // Call the original function
        originalAnimateCenterCloud();
        
        // Validate particle cloud geometry
        if (particleClouds && particleClouds.geometry) {
            validateGeometry(particleClouds.geometry);
        }
    };
}

// Add functions to save and restore game state
function saveGameState() {
    const gameState = {
        stones: [],
        stoneVelocities: [],
        towerBases: [],
        timestamp: Date.now()
    };
    
    // Save stone data
    for (let i = 0; i < stones.length; i++) {
        const stone = stones[i];
        const velocity = stoneVelocities[i];
        
        gameState.stones.push({
            position: {
                x: stone.position.x,
                y: stone.position.y,
                z: stone.position.z
            },
            rotation: {
                x: stone.rotation.x,
                y: stone.rotation.y,
                z: stone.rotation.z
            },
            userData: stone.userData
        });
        
        gameState.stoneVelocities.push({
            x: velocity.x,
            y: velocity.y,
            z: velocity.z
        });
    }
    
    // Save tower data
    for (let i = 0; i < towerBases.length; i++) {
        const tower = towerBases[i];
        
        gameState.towerBases.push({
            position: {
                x: tower.position.x,
                y: tower.position.y,
                z: tower.position.z
            },
            level: tower.userData.level || 1,
            parentIndex: tower.userData.parentTower ? 
                towerBases.indexOf(tower.userData.parentTower) : -1
        });
    }
    
    // Save to localStorage
    localStorage.setItem('stoneGameState', JSON.stringify(gameState));    
    //console.log('Game state saved');
    return gameState;
}

function restoreGameState() {
    // Try to load from localStorage
    const savedState = localStorage.getItem('stoneGameState');
    if (!savedState) {
        return false;
    }
    
    try {
        const gameState = JSON.parse(savedState);
        
        // Clear existing stones and towers
        for (const stone of stones) {
            scene.remove(stone);
        }
        
        // Clear existing towers only
        for (const tower of towerBases) {
            scene.remove(tower);
        }
        
        // Create new array for towers
        const newTowerBases = [];
        
        // Skip stone restoration
        console.log(`Skipping restoration of ${gameState.stones.length} stones`);
        
        // First pass: create tower bases without parent relationships
        const tempTowers = [];
        for (const towerData of gameState.towerBases) {
            const towerBase = createTowerBaseForRestore(
                towerData.position.x,
                towerData.position.y,
                towerData.position.z,
                towerData.level
            );
            
            // Set exact rotation if available
            if (towerData.rotation) {
                towerBase.rotation.set(
                    towerData.rotation.x,
                    towerData.rotation.y,
                    towerData.rotation.z
                );
            }
            
            tempTowers.push(towerBase);
            newTowerBases.push(towerBase);
        }
        
        // Second pass: establish parent-child relationships
        for (let i = 0; i < gameState.towerBases.length; i++) {
            const towerData = gameState.towerBases[i];
            const tower = tempTowers[i];
            
            if (towerData.parentIndex >= 0 && towerData.parentIndex < tempTowers.length) {
                const parentTower = tempTowers[towerData.parentIndex];
                tower.userData.parentTower = parentTower;
                parentTower.userData.childTower = tower;
            }
        }
        
        // Clear and repopulate only the towerBases array
        towerBases.length = 0;
        
        // Add all towers from new array to the original array
        for (const tower of newTowerBases) {
            towerBases.push(tower);
        }
        
        return true;
    } catch (error) {
        console.error('Error restoring game state:', error);
        return false;
    }
}

// Add a function to only restore towers
function restoreTowersOnly() {
    // Try to load from localStorage
    const savedState = localStorage.getItem('stoneGameState');
    if (!savedState) {
        console.log('No saved game state found.');
        return false;
    }
    
    try {
        const gameState = JSON.parse(savedState);
        
        // Clear existing towers
        for (const tower of towerBases) {
            scene.remove(tower);
        }
        
        // Create new array for towers
        const newTowerBases = [];
        
        // First pass: create tower bases without parent relationships
        const tempTowers = [];
        for (const towerData of gameState.towerBases) {
            const towerBase = createTowerBaseForRestore(
                towerData.position.x,
                towerData.position.y,
                towerData.position.z,
                towerData.level
            );
            
            // Set exact rotation if available
            if (towerData.rotation) {
                towerBase.rotation.set(
                    towerData.rotation.x,
                    towerData.rotation.y,
                    towerData.rotation.z
                );
            }
            
            tempTowers.push(towerBase);
            newTowerBases.push(towerBase);
        }
        
        // Second pass: establish parent-child relationships
        for (let i = 0; i < gameState.towerBases.length; i++) {
            const towerData = gameState.towerBases[i];
            const tower = tempTowers[i];
            
            if (towerData.parentIndex >= 0 && towerData.parentIndex < tempTowers.length) {
                const parentTower = tempTowers[towerData.parentIndex];
                tower.userData.parentTower = parentTower;
                parentTower.userData.childTower = tower;
            }
        }
        
        // Clear and repopulate only the towerBases array
        towerBases.length = 0;
        
        // Add all towers from new array to the original array
        for (const tower of newTowerBases) {
            towerBases.push(tower);
        }
        
        return true;
    } catch (error) {
        console.error('Error restoring towers:', error);
        return false;
    }
}

// Helper function to create a tower base for restore operations
function createTowerBaseForRestore(x, y, z, level) {
    // Create a group to hold all parts of the tower base
    const towerBase = new THREE.Group();
    
    // Create stone-like material
    const stoneMaterial = new THREE.MeshStandardMaterial({ 
        roughness: 0.9,
        metalness: 0.1,
        color: 0x808080,
        bumpMap: stoneTexture,
        bumpScale: 0.5
    });
    
    // Determine radius based on tower level
    let outerRadius = level > 1 ? 3.2 : 3.5;
    
    // Create blocks for outer ring
    const blockCount = 24;
    
    // Generate a random rotation for the entire circle
    // Use a deterministic random value based on level for consistency
    const circleRotation = (Math.sin(level * 7919) * 0.5 + 0.5) * Math.PI * 2;
    
    // Generate a rotation offset based on level to stagger blocks
    const levelRotationOffset = (level % 4) * (Math.PI / 12) + circleRotation;
    
    // Add random variation to block positions
    const randomSeed = level * 123.456; // Different seed for each level
    
    for (let i = 0; i < blockCount; i++) {
        // Calculate angle with level-based offset for staggering
        const angle = (i / blockCount) * Math.PI * 2 + levelRotationOffset;
        
        // Add small random variation to radius (different for each block and level)
        const radiusVariation = 0.1;
        const blockRadius = outerRadius + (Math.sin(angle * level + randomSeed) * radiusVariation);
        
        const blockX = Math.cos(angle) * blockRadius;
        const blockZ = Math.sin(angle) * blockRadius;
        
        // Create a stone block
        const blockGeometry = new THREE.BoxGeometry(STONE.blockWidth, STONE.blockHeight, STONE.blockDepth);
        const block = new THREE.Mesh(blockGeometry, stoneMaterial);
        
        // Position in a ring
        block.position.set(blockX, STONE.blockHeight/2, blockZ);
        
        // Rotate to face center with slight variation
        const rotationVariation = (Math.cos(angle * 3 + level) * 0.1);
        block.rotation.y = angle + Math.PI/2 + rotationVariation;
        
        // Add slight random rotation for natural look
        // Use deterministic "random" based on block index and level
        const xTilt = Math.sin(i * 0.7 + level * 1.3) * 0.15;
        const zTilt = Math.cos(i * 0.9 + level * 1.7) * 0.15;
        
        block.rotation.x += xTilt;
        block.rotation.z += zTilt;
        
        // Add to tower base group
        towerBase.add(block);
    }
    
    // Position the entire tower base
    towerBase.position.set(x, y, z);
    
    // Set tower level
    towerBase.userData.level = level || 1;
    
    // Add to scene
    scene.add(towerBase);
    
    return towerBase;
}

// Fix the transformStoneToTowerBase function to ensure consistent stone sizes
if (typeof transformStoneToTowerBase === 'function') {
    const originalTransform = transformStoneToTowerBase;
    window.transformStoneToTowerBase = function(stone, parentTower) {
        // Call the original function
        const newTower = originalTransform(stone, parentTower);
        
        // If we have a new tower, update its blocks to have consistent size and variation
        if (newTower) {
            // Get the level
            const level = newTower.userData.level || 1;
            
            // Generate a random rotation for the entire circle
            const circleRotation = (Math.sin(level * 7919) * 0.5 + 0.5) * Math.PI * 2;
            
            // Generate a rotation offset based on level to stagger blocks
            const levelRotationOffset = (level % 4) * (Math.PI / 12) + circleRotation;
            
            // Add random variation to block positions
            const randomSeed = level * 123.456;

            // Update each block in the tower
            for (let i = 0; i < newTower.children.length; i++) {
                const block = newTower.children[i];
                
                // Skip non-mesh children
                if (!block.isMesh) continue;
                
                // Ensure consistent size for all blocks
                block.scale.set(1, 1, 1);
                
                // Replace geometry if it's not the right size
                if (block.geometry.parameters && 
                    (Math.abs(block.geometry.parameters.width - STONE.blockWidth) > 0.1 ||
                     Math.abs(block.geometry.parameters.height - STONE.blockHeight) > 0.1 ||
                     Math.abs(block.geometry.parameters.depth - STONE.blockDepth) > 0.1)) {
                    
                    // Create new geometry with correct dimensions
                    const newGeometry = new THREE.BoxGeometry(STONE.blockWidth, STONE.blockHeight, STONE.blockDepth);
                    block.geometry.dispose(); // Clean up old geometry
                    block.geometry = newGeometry;
                }
                
                // Calculate the original angle based on block index
                const angle = (i / newTower.children.length) * Math.PI * 2 + levelRotationOffset;
                
                // Add small random variation to radius
                const radiusVariation = 0.1;
                const outerRadius = level > 1 ? 3.2 : 3.5;
                const blockRadius = outerRadius + (Math.sin(angle * level + randomSeed) * radiusVariation);
                
                // Update position
                block.position.x = Math.cos(angle) * blockRadius;
                block.position.z = Math.sin(angle) * blockRadius;
                block.position.y = STONE.blockHeight/2; // Ensure consistent height
                
                // Update rotation with variation
                const rotationVariation = (Math.cos(angle * 3 + level) * 0.1);
                block.rotation.y = angle + Math.PI/2 + rotationVariation;
                
                // Add slight random rotation for natural look
                const xTilt = Math.sin(i * 0.7 + level * 1.3) * 0.15;
                const zTilt = Math.cos(i * 0.9 + level * 1.7) * 0.15;
                
                block.rotation.x = xTilt;
                block.rotation.z = zTilt;
            }
        }
        
        return newTower;
    };
}

// Function to handle space bar action (throw or jump)
function handleSpaceAction() {
    if (heldStone) {
        // Throw the stone
        handleThrowAction();
    } else if (!isJumping && Math.abs(camera.position.y - targetHeight) < 0.1) {
        // Jump if not already jumping and on the ground
        playerVerticalVelocity = PLAYER.jumpForce;
        isJumping = true;
    }
}

// Update keyboard event listener to use the common function
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        handleSpaceAction();
    }
    
    // Keep other keyboard shortcuts
    // ... existing keyboard handlers ...
});

// Add tap handler without overriding existing touch variables
(function() {
    // Track tap detection variables locally to avoid conflicts
    let tapStartX = 0;
    let tapStartY = 0;
    let tapStartTime = 0;
    let isTapInProgress = false;
    const tapThreshold = 200; // ms maximum for a tap
    const moveThreshold = 20; // pixels of movement allowed for a tap
    
    // Check if joystick is being touched
    function isTouchingJoystick(x, y) {
        // If joystick exists and has a defined position
        if (typeof joystick !== 'undefined' && joystick && joystick.position) {
            // Calculate distance from joystick center
            const joystickX = joystick.position.x || window.innerWidth * 0.15; // Default left side
            const joystickY = joystick.position.y || window.innerHeight * 0.75; // Default bottom
            const joystickRadius = joystick.radius || 50; // Default radius
            
            const dx = x - joystickX;
            const dy = y - joystickY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            // Return true if touch is within joystick area
            return distance < joystickRadius * 1.5; // 1.5x radius for better detection
        }
        
        // If no joystick or can't determine position, assume left side of screen is joystick area
        return x < window.innerWidth * 0.3;
    }
    
    // Add tap detection without overriding existing handlers
    function addTapHandler() {
        // Touch start handler
        const touchStartHandler = function(event) {
            // Only process if not already tracking a tap
            if (!isTapInProgress) {
                tapStartX = event.touches[0].clientX;
                tapStartY = event.touches[0].clientY;
                tapStartTime = Date.now();
                isTapInProgress = true;
                
                // Don't process taps in joystick area
                if (isTouchingJoystick(tapStartX, tapStartY)) {
                    isTapInProgress = false;
                }
            }
        };
        
        // Touch move handler
        const touchMoveHandler = function(event) {
            if (isTapInProgress) {
                const currentX = event.touches[0].clientX;
                const currentY = event.touches[0].clientY;
                
                // Calculate movement distance
                const dx = currentX - tapStartX;
                const dy = currentY - tapStartY;
                const distance = Math.sqrt(dx*dx + dy*dy);
                
                // If moved too much, cancel tap
                if (distance > moveThreshold) {
                    isTapInProgress = false;
                }
            }
        };
        
        // Touch end handler
        const touchEndHandler = function(event) {
            if (isTapInProgress) {
                const tapDuration = Date.now() - tapStartTime;
                
                // If this was a quick tap
                if (tapDuration < tapThreshold) {
                    // Don't process taps in joystick area (double check)
                    if (!isTouchingJoystick(tapStartX, tapStartY)) {
                        // Simulate space bar press - throw if holding, jump otherwise
                        handleSpaceAction();
                        
                        // Provide haptic feedback if available
                        if (navigator.vibrate) {
                            navigator.vibrate(50); // 50ms vibration
                        }
                        
                        // Prevent default to avoid accidental clicks
                        event.preventDefault();
                    }
                }
                
                // Reset tap tracking
                isTapInProgress = false;
            }
        };
        
        // Add event listeners with passive: false to allow preventDefault
        document.addEventListener('touchstart', touchStartHandler, { passive: false });
        document.addEventListener('touchmove', touchMoveHandler, { passive: true });
        document.addEventListener('touchend', touchEndHandler, { passive: false });
    }
    
    // Call this function when the page loads
    window.addEventListener('load', function() {
        // Check if this is likely a mobile device
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            // Add tap handler after a short delay to ensure joystick is initialized
            setTimeout(addTapHandler, 500);
        }
    });
})();

// Set up auto-save every 10 seconds
setInterval(function() {
    saveGameState();
}, 10000);

// Try to restore only towers on page load
window.addEventListener('load', () => {
    setTimeout(() => {
        restoreTowersOnly();
    }, 1000); // Delay to ensure all resources are loaded
});

// Add function to handle cloud movement and tower destruction
function handleCloudTowerInteraction() {
    // Check if player is on a tower
    const playerPosition = new THREE.Vector3().copy(camera.position);
    let playerTower = null;
    let playerTowerIndex = -1;
    
    // Find the tower the player is standing on
    for (let i = 0; i < towerBases.length; i++) {
        const tower = towerBases[i];
        const horizontalDistance = new THREE.Vector3()
            .copy(playerPosition)
            .sub(tower.position)
            .setY(0) // Ignore Y difference
            .length();
        
        if (horizontalDistance < 3.0) { // Tower radius
            playerTower = tower;
            playerTowerIndex = i;
            break;
        }
    }
    
    // If player is on a tower and close to cloud
    if (playerTower && window.centerCloud) {
        const distanceToCloud = playerPosition.distanceTo(window.centerCloud.position);
        
        // If player is close enough to the cloud
        if (distanceToCloud < 15) {
            // Find another tower to move the cloud to
            let targetTower = null;
            let targetTowerIndex = -1;
            
            // Find the furthest tower from player
            let maxDistance = 0;
            for (let i = 0; i < towerBases.length; i++) {
                // Skip the tower player is on
                if (i === playerTowerIndex) continue;
                
                const tower = towerBases[i];
                const distance = playerPosition.distanceTo(tower.position);
                
                if (distance > maxDistance) {
                    maxDistance = distance;
                    targetTower = tower;
                    targetTowerIndex = i;
                }
            }
            
            // If we found a target tower
            if (targetTower) {
                console.log("Moving cloud to destroy tower");
                
                // Start cloud movement animation
                window.centerCloudMoving = true;
                window.centerCloudStartTime = Date.now();
                window.centerCloudAnimationDuration = 3000; // 3 seconds
                
                // Store start position
                window.centerCloudStartY = window.centerCloud.position.y;
                
                // Set target position (above target tower)
                window.centerCloudTargetY = targetTower.position.y + 20; // Position above tower
                
                // Store target tower for destruction
                window.centerCloud.userData.targetTowerIndex = targetTowerIndex;
                
                // Set horizontal target directly for the centerCloud
                window.centerCloud.userData.targetX = targetTower.position.x;
                window.centerCloud.userData.targetZ = targetTower.position.z;
                
                // Schedule lightning strike and tower destruction
                setTimeout(() => {
                    // Create lightning effect
                    createLightningEffect(targetTower.position);
                    
                    // Play thunder sound if available
                    if (typeof playSound === 'function') {
                        playSound('thunder');
                    }
                    
                    // Destroy the tower
                    destroyTower(targetTowerIndex);
                }, 2500); // Strike just before animation completes
            }
        }
    }
    
    // Animate cloud movement if it's moving
    if (window.centerCloudMoving && window.centerCloud) {
        const elapsed = Date.now() - window.centerCloudStartTime;
        const progress = Math.min(1.0, elapsed / window.centerCloudAnimationDuration);
        
        // Ease-in-out function for smooth movement
        const easeProgress = progress < 0.5 
            ? 2 * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        // Update cloud Y position
        const newY = window.centerCloudStartY + (window.centerCloudTargetY - window.centerCloudStartY) * easeProgress;
        window.centerCloud.position.y = newY;
        
        // Update horizontal position if target is set
        if (window.centerCloud.userData.targetX !== undefined && window.centerCloud.userData.targetZ !== undefined) {
            // Calculate smoother horizontal movement
            const horizontalSpeed = 0.05;
            window.centerCloud.position.x += (window.centerCloud.userData.targetX - window.centerCloud.position.x) * horizontalSpeed;
            window.centerCloud.position.z += (window.centerCloud.userData.targetZ - window.centerCloud.position.z) * horizontalSpeed;
        }
        
        // End animation when complete
        if (progress >= 1.0) {
            window.centerCloudMoving = false;
        }
    }
}

// Make sure these variables are defined at the global scope
// Add this at the top of your script or in an appropriate scope
window.centerCloud = null;
window.centerCloudMoving = false;
window.centerCloudStartTime = 0;
window.centerCloudAnimationDuration = 3000;
window.centerCloudStartY = 0;
window.centerCloudTargetY = 0;

// Initialize the center cloud - make sure this is called before the animation loop starts
function initializeCenterCloud() {
    
    // Create a simple cloud mesh
    const cloudGeometry = new THREE.SphereGeometry(5, 16, 16);
    const cloudMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.8,
        emissive: 0xCCCCFF,
        emissiveIntensity: 0.2
    });
    
    window.centerCloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
    window.centerCloud.position.set(0, 30, 0); // Position high above center
    scene.add(window.centerCloud);
    
    // Add some particle effects to make it look more cloud-like
    const particleCount = 50;
    const particles = new THREE.Group();
    
    for (let i = 0; i < particleCount; i++) {
        const size = 1 + Math.random() * 2;
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(size, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                transparent: true,
                opacity: 0.6 + Math.random() * 0.3
            })
        );
        
        // Position randomly around center
        const angle = Math.random() * Math.PI * 2;
        const radius = 2 + Math.random() * 4;
        particle.position.set(
            Math.cos(angle) * radius,
            (Math.random() - 0.5) * 3,
            Math.sin(angle) * radius
        );
        
        particles.add(particle);
    }
    
    window.centerCloud.add(particles);
    
    return window.centerCloud;
}

// Make sure to call this function to initialize the cloud
// Add this to your initialization code or at the end of your script
window.addEventListener('load', function() {
    // Wait a short time to ensure Three.js is initialized
    setTimeout(function() {
        initializeCenterCloud();
        initializeMultiplayer();
    }, 100);
});

// Add lightning effect function
function createLightningEffect(position) {
    console.log("Creating lightning effect at", position);
    
    // Create a bright flash
    const flash = new THREE.PointLight(0xFFFFFF, 100, 100);
    flash.position.copy(position);
    flash.position.y += 10; // Position above tower
    scene.add(flash);
    
    // Create lightning bolt geometry
    const points = [];
    const startPoint = new THREE.Vector3(position.x, position.y + 20, position.z);
    const endPoint = new THREE.Vector3(position.x, position.y, position.z);
    
    // Create zigzag pattern
    points.push(startPoint);
    
    const segments = 6;
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const point = new THREE.Vector3()
            .lerpVectors(startPoint, endPoint, t);
        
        // Add random offset for zigzag
        point.x += (Math.random() - 0.5) * 2;
        point.z += (Math.random() - 0.5) * 2;
        
        points.push(point);
    }
    
    points.push(endPoint);
    
    // Create lightning geometry
    const lightningGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lightningMaterial = new THREE.LineBasicMaterial({ 
        color: 0xFFFFFF,
        linewidth: 3
    });
    
    const lightning = new THREE.Line(lightningGeometry, lightningMaterial);
    scene.add(lightning);
    
    // Fade out effect
    let intensity = 1.0;
    const fadeInterval = setInterval(() => {
        intensity -= 0.1;
        flash.intensity = 100 * intensity;
        
        if (intensity <= 0) {
            clearInterval(fadeInterval);
            scene.remove(flash);
            scene.remove(lightning);
        }
    }, 50);
}

// Enhanced tower destruction function to handle the entire stack
function destroyTower(towerIndex) {
    console.log("Destroying tower at index", towerIndex);
    
    if (towerIndex < 0 || towerIndex >= towerBases.length) {
        console.warn("Invalid tower index:", towerIndex);
        return;
    }
    
    const tower = towerBases[towerIndex];
    const towerPosition = tower.position.clone();
    
    // Create explosion effect at the tower position
    createExplosionEffect(towerPosition);
    
    // Check if this tower has child towers (rings above it)
    let currentTower = tower;
    const towersToDestroy = [tower];
    
    // Find all towers in the stack (follow the chain of child towers)
    while (currentTower.userData && currentTower.userData.childTower) {
        currentTower = currentTower.userData.childTower;
        towersToDestroy.push(currentTower);
    }
    
    console.log(`Found ${towersToDestroy.length} towers in the stack to destroy`);
    
    // Destroy all towers in the stack with cascading explosions
    for (let i = 0; i < towersToDestroy.length; i++) {
        const currentTowerToDestroy = towersToDestroy[i];
        
        // Create explosion effect with delay based on position in stack
        setTimeout(() => {
            // Create explosion at this tower's position
            const explosionPosition = currentTowerToDestroy.position.clone();
            createExplosionEffect(explosionPosition);
            
            // Remove from scene
            scene.remove(currentTowerToDestroy);
            
            // Play destruction sound with decreasing volume for higher rings
            if (typeof playSound === 'function') {
                const volume = 1.0 - (i * 0.2); // Decrease volume for higher rings
                playSound('explosion', volume);
            }
        }, i * 200); // Stagger explosions by 200ms
    }
    
    // Remove the base tower from the towerBases array
    towerBases.splice(towerIndex, 1);
    
    // Check if any other towers had this tower as a parent and update their references
    for (let i = 0; i < towerBases.length; i++) {
        const otherTower = towerBases[i];
        if (otherTower.userData && otherTower.userData.parentTower === tower) {
            // Clear the parent reference
            otherTower.userData.parentTower = null;
        }
        
        // Also check if this tower is in the list of towers to destroy
        for (const towerToDestroy of towersToDestroy) {
            if (otherTower === towerToDestroy && i !== towerIndex) {
                // Remove this tower from the towerBases array as well
                towerBases.splice(i, 1);
                i--; // Adjust index since we removed an element
                break;
            }
        }
    }
    
    // Play initial destruction sound
    if (typeof playSound === 'function') {
        playSound('explosion', 1.0);
    }
}

// Alternative implementation that might work better with your tower structure
function destroyTowerAlternative(towerIndex) {
    console.log("Destroying tower at index", towerIndex);
    
    if (towerIndex < 0 || towerIndex >= towerBases.length) {
        console.warn("Invalid tower index:", towerIndex);
        return;
    }
    
    const tower = towerBases[towerIndex];
    
    // First, find all towers that are part of this stack
    // This includes the base tower and all towers above it
    const towersInStack = [];
    
    // Add the base tower
    towersInStack.push(tower);
    
    // Find all towers that have this tower as their parent (directly or indirectly)
    for (let i = 0; i < towerBases.length; i++) {
        if (i === towerIndex) continue; // Skip the base tower
        
        const otherTower = towerBases[i];
        let parent = otherTower.userData?.parentTower;
        
        // Check if this tower is in the same stack
        while (parent) {
            if (parent === tower) {
                // This tower is part of the stack
                towersInStack.push(otherTower);
                break;
            }
            parent = parent.userData?.parentTower;
        }
    }
    
    console.log(`Found ${towersInStack.length} towers in the stack to destroy`);
    
    // Create cascading explosions for all towers in the stack
    for (let i = 0; i < towersInStack.length; i++) {
        const towerToDestroy = towersInStack[i];
        
        // Create explosion with delay
        setTimeout(() => {
            createExplosionEffect(towerToDestroy.position.clone());
            scene.remove(towerToDestroy);
            
            // Play sound
            if (typeof playSound === 'function') {
                const volume = 1.0 - (i * 0.2);
                playSound('explosion', volume);
            }
        }, i * 200);
    }
    
    // Remove all towers in the stack from the towerBases array
    for (let i = towerBases.length - 1; i >= 0; i--) {
        if (towersInStack.includes(towerBases[i])) {
            towerBases.splice(i, 1);
        }
    }
    
    // Play initial sound
    if (typeof playSound === 'function') {
        playSound('explosion', 1.0);
    }
}

// Replace the destroyTower function with the alternative implementation
window.destroyTower = destroyTowerAlternative;

// Enhanced explosion effect with more particles and variation
function createExplosionEffect(position) {
    console.log("Creating explosion effect at", position);
    
    // Create particles for explosion
    const particleCount = 75; // More particles for bigger explosion
    
    for (let i = 0; i < particleCount; i++) {
        // Randomize particle size
        const size = 0.3 + Math.random() * 0.4;
        
        // Randomize particle color (stone-like colors)
        const colorValue = 0.5 + Math.random() * 0.3; // Gray to light gray
        const color = new THREE.Color(colorValue, colorValue, colorValue);
        
        const particle = new THREE.Mesh(
            new THREE.BoxGeometry(size, size, size),
            new THREE.MeshBasicMaterial({ 
                color: color,
                transparent: true,
                opacity: 1.0
            })
        );
        
        // Position at explosion center with slight random offset
        particle.position.copy(position);
        particle.position.x += (Math.random() - 0.5) * 1.0;
        particle.position.y += (Math.random() - 0.5) * 1.0;
        particle.position.z += (Math.random() - 0.5) * 1.0;
        
        // Add random velocity in all directions (stronger explosion)
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.8,
            Math.random() * 0.8,
            (Math.random() - 0.5) * 0.8
        );
        
        // Add random rotation
        particle.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Add random rotation velocity
        const rotationVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        
        // Add to scene and particles array
        scene.add(particle);
        
        if (!window.explosionParticles) {
            window.explosionParticles = [];
        }
        
        window.explosionParticles.push({
            mesh: particle,
            velocity: velocity,
            rotationVelocity: rotationVelocity,
            life: 1.5 + Math.random() * 1.0 // Varied life for particles
        });
    }
}

// Enhanced updateParticleClouds function to handle rotation
function updateParticleClouds() {
    const deltaTime = 0.016; // Assuming ~60fps
    
    // Update regular particles
    if (window.particles && window.particles.length > 0) {
        for (let i = window.particles.length - 1; i >= 0; i--) {
            const particle = window.particles[i];
            
            // Update position based on velocity
            particle.mesh.position.add(particle.velocity);
            
            // Apply gravity and drag
            particle.velocity.y -= 0.01;
            particle.velocity.multiplyScalar(0.95);
            
            // Reduce life
            particle.life -= deltaTime;
            
            // Scale down as life decreases
            const scale = particle.life * 0.5;
            particle.mesh.scale.set(scale, scale, scale);
            
            // Remove dead particles
            if (particle.life <= 0) {
                scene.remove(particle.mesh);
                window.particles.splice(i, 1);
            }
        }
    }
    
    // Update explosion particles
    if (window.explosionParticles && window.explosionParticles.length > 0) {
        for (let i = window.explosionParticles.length - 1; i >= 0; i--) {
            const particle = window.explosionParticles[i];
            
            // Update position
            particle.mesh.position.add(particle.velocity);
            
            // Update rotation if available
            if (particle.rotationVelocity) {
                particle.mesh.rotation.x += particle.rotationVelocity.x;
                particle.mesh.rotation.y += particle.rotationVelocity.y;
                particle.mesh.rotation.z += particle.rotationVelocity.z;
            }
            
            // Apply gravity
            particle.velocity.y -= 0.015;
            
            // Apply drag
            particle.velocity.multiplyScalar(0.98);
            
            // Reduce life
            particle.life -= deltaTime;
            
            // Update opacity
            if (particle.mesh.material.opacity) {
                particle.mesh.material.opacity = particle.life / 1.5;
            }
            
            // Remove dead particles
            if (particle.life <= 0) {
                scene.remove(particle.mesh);
                particle.mesh.material.dispose();
                particle.mesh.geometry.dispose();
                window.explosionParticles.splice(i, 1);
            }
        }
    }
}

// Make sure these functions are available globally
window.createLightningEffect = createLightningEffect;
window.destroyTower = destroyTower;
window.createExplosionEffect = createExplosionEffect;
window.updateParticleClouds = updateParticleClouds;
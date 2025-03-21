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
    shoreRadius: 96,          // Radius where beach/water transition occurs
    shoreWidth: 5,            // Width of the beach transition band
    waterLevel: -6            // Height of the water surface
};

// Stone physics parameters
const STONE = {
    radius: 0.5,              // Base radius of stones
    gravity: -0.01,           // Gravity force applied to stones
    rollSpeed: 0.04,          // How fast stones roll on terrain
    friction: 0.03,           // Ground friction applied to rolling stones
    minVelocity: 0.003,       // Minimum velocity before stone stops moving
    groundCheckOffset: 0.1,   // Distance to check for ground below stone
    maxVelocity: 0.24,        // Maximum stone velocity cap
    heightSmoothingFactor: 0.15, // How smoothly stones follow terrain height
    dropInterval: 1000,       // Milliseconds between automatic stone spawns
    pickupDelay: 500,         // Milliseconds delay before pickup is allowed
    waveStrength: 0.18        // Force of waves pushing stones inland
};

// Player movement parameters
const PLAYER = {
    moveSpeed: 0.5,           // Base movement speed
    rotateSpeed: 0.02,        // Base rotation speed
    sprintMultiplier: 2.0,    // Speed multiplier when sprinting
    jumpForce: 0.5,           // Initial upward velocity when jumping
    gravity: -0.02,           // Gravity force applied to player
    baseHeight: 3,            // Default camera height above ground
    heightSmoothness: 0.2     // How smoothly camera follows terrain (lower = smoother)
};

// Held stone configuration
const HELD_STONE = {
    offset: {
        forward: 1.2,         // How far in front of player the stone appears
        down: 0.8,            // How far below eye level the stone appears
        scale: 0.5            // Scale factor applied to held stones
    },
    physics: {
        springStrength: 0.35, // How strongly stone is pulled to target position
        dampening: 0.6,       // How quickly oscillations are reduced
        rotationLag: 0.15,    // How slowly rotation catches up to movement
        bobStrength: 0.02,    // Amplitude of up/down bobbing motion
        swayStrength: 0.03    // Amplitude of side-to-side swaying
    }
};

// Tower building parameters
const TOWER = {
    stackingRadius: 3.5,      // Maximum distance for stacking stones
    minTowerDistance: 8.0,    // Minimum distance between separate towers
    transformDelay: 2000,     // Milliseconds before stone transforms to tower
    ringHeight: 1.5,          // Height of each tower ring
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
        centerDistance: { value: 0.80 },    // Distance from center where beach starts (0-1)
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
const throwForce = 0.8;  // Add throw force constant
const throwUpward = 0.8; // Add upward throw component
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

// Stone parameters - adjusted for faster rolling
const stoneRadius = 0.5;
const gravity = -0.01;       
const rollSpeed = 0.04;      // Doubled from 0.02 for faster rolling
const friction = 0.03;       
const minVelocity = 0.003;   
const groundCheckOffset = 0.1;
const maxVelocity = 0.24;    // Doubled from 0.12 for faster movement
const heightSmoothingFactor = 0.15;

// Stone management
const stones = [];
const stoneVelocities = [];
let lastStoneDropTime = 0;
const stoneDropInterval = 1000;
const pickupDelay = 500; // 500ms delay before pickup is allowed
let lastThrowTime = 0;   // Track when the last throw happened

// Add shore stone spawning parameters
const shoreRadius = size * 0.48; // Slightly larger than before, right at water's edge
const shoreWidth = 5; // Narrower band at the very edge
const waveStrength = 0.18; // Significantly increased for much further inland movement

// Add held stone tracking with physics
let heldStone = null;
const heldStoneOffset = {
    forward: 1.2,
    down: 0.8,
    scale: 0.5
};
const heldStonePhysics = {
    velocity: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    targetRot: new THREE.Euler(),
    springStrength: 0.35,    // Increased from 0.1 for tighter control
    dampening: 0.6,          // Reduced from 0.8 for heavier feel
    rotationLag: 0.15,       // Increased from 0.1 for slower rotation
    bobStrength: 0.02,       // Reduced from 0.05 for less bouncing
    swayStrength: 0.03       // Reduced from 0.1 for less swaying
};

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
    
    // Generate a random angle around the island
    const angle = Math.random() * Math.PI * 2;
    
    // Position at the very edge of the water
    const spawnRadius = shoreRadius + shoreWidth; // Start in the water
    const x = Math.cos(angle) * spawnRadius;
    const z = Math.sin(angle) * spawnRadius;
    
    // Position slightly below water level
    const waterLevel = -5.5; // Adjust based on your water level
    const y = waterLevel + 0.2; // Just barely visible above water
    
    stone.position.set(x, y, z);
    scene.add(stone);
    stones.push(stone);
    
    // Calculate vector pointing toward island center
    const toCenter = new THREE.Vector3(-x, 0, -z).normalize();
    
    // Initialize velocity with a stronger push from the "wave" toward the island
    // Add a random factor to make some stones go further inland than others
    const inlandFactor = 1.5 + Math.random() * 1.0; // Random factor between 1.5 and 2.5
    stoneVelocities.push(new THREE.Vector3(
        toCenter.x * waveStrength * inlandFactor,
        0.05, // Increased upward component for more dramatic effect
        toCenter.z * waveStrength * inlandFactor
    ));
    
    // Add splash effect at stone position
    createWaterSplash(new THREE.Vector3(x, y, z));
    
    // Add a second, delayed splash as the stone hits the shore
    setTimeout(() => {
        // Calculate approximate shore position
        const shoreDistance = spawnRadius - shoreRadius;
        const shorePosition = new THREE.Vector3(
            x - toCenter.x * shoreDistance * 0.8,
            getTerrainHeight(x - toCenter.x * shoreDistance * 0.8, z - toCenter.z * shoreDistance * 0.8),
            z - toCenter.z * shoreDistance * 0.8
        );
        createWaterSplash(shorePosition);
    }, 1000); // Delay the second splash
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
const heightSmoothness = 0.2; // Adjust this value between 0 and 1 (lower = smoother)

// Add global tracking for thrown stones
const thrownStones = [];

// Add tracking for tower bases
const towerBases = [];

// Add a unified function for throwing stones (via space key or tap)
function handleThrowAction() {
    // Check if we're holding a stone and enough time has passed since last throw
    if (heldStone && (Date.now() - lastThrowTime > pickupDelay)) {
        console.log("Throwing stone via unified throw function");
        
        // Add stone back to physics arrays
        stones.push(heldStone);
        
        // Calculate throw direction and force
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);
        
        // Create initial velocity based on camera direction
        const throwForce = 0.8;
        const throwUpward = 0.8;
        const throwVelocity = new THREE.Vector3(
            forward.x * throwForce,
            throwUpward,
            forward.z * throwForce
        );
        
        // Add to velocities array
        stoneVelocities.push(throwVelocity);
        
        // Track this stone as thrown
        thrownStones.push({
            stone: heldStone,
            throwTime: Date.now(),
            lastPosition: new THREE.Vector3().copy(heldStone.position),
            stationaryTime: 0,
            transformed: false
        });
        
        // Reset stone scale
        heldStone.scale.set(1, 1, 1);
        
        // Clear held stone
        heldStone = null;
        
        // Track throw time for pickup delay
        lastThrowTime = Date.now();
        
        console.log("Stone thrown and tracked");
        return true; // Throw was successful
    }
    return false; // No throw occurred
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
    console.log("Transforming stone to tower base");
    
    // Check if stone is near an existing tower base
    const nearbyResult = findNearbyTowerBase(stone.position);
    
    // If too close to existing tower but not for stacking, don't create a tower
    if (nearbyResult && nearbyResult.tooClose === true) {
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
        
        console.log("Stacking on tower at position: ", 
            nearbyTower.position.x, 
            nearbyTower.position.y, 
            nearbyTower.position.z);
        console.log("New tower will be at height: " + yPosition);
    } else {
        // Position on ground - raised higher
        yPosition = getTerrainHeight(stone.position.x, stone.position.z) + 0.3;
        console.log("CREATING NEW: Tower at ground level: " + yPosition);
    }
    
    // Create a group to hold all parts of the tower base
    const towerBase = new THREE.Group();
    
    // Block dimensions - doubled height
    const blockWidth = 0.8;
    const blockHeight = 1.2;
    const blockDepth = 1.2;
    
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
        const blockGeometry = new THREE.BoxGeometry(blockWidth, blockHeight, blockDepth);
        const block = new THREE.Mesh(blockGeometry, stoneMaterial);
        
        // Position in a ring
        block.position.set(x, blockHeight/2, z);
        
        // Rotate to face center
        block.rotation.y = angle + Math.PI/2;
        
        // Add slight random rotation for natural look
        block.rotation.x += (Math.random() - 0.5) * 0.1;
        block.rotation.z += (Math.random() - 0.5) * 0.1;
        
        // Add to tower base group
        towerBase.add(block);
    }
    
    // No floor - making it hollow
    
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
            
            stoneMesh.position.set(x, blockHeight/2, z);
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
    
    console.log("Transformation complete - Tower level: " + towerBase.userData.level);
    
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
            
            // If stone has been stationary for 0.5 seconds
            if (thrownStone.stationaryTime > 500) {
                transformStoneToTowerBase(stone, stoneIndex);
                thrownStone.transformed = true;
            }
        } else {
            // Reset stationary time if moving
            thrownStone.stationaryTime = 0;
        }
    }
}

// Modify updateStones function to allow stones to travel much further inland
function updateStones() {
    for (let i = stones.length - 1; i >= 0; i--) {
        const stone = stones[i];
        const stoneVelocity = stoneVelocities[i];

        // Update horizontal position first
        stone.position.x += stoneVelocity.x;
        stone.position.z += stoneVelocity.z;

        // Get terrain height at new position
        const targetHeight = getTerrainHeight(stone.position.x, stone.position.z) + stoneRadius + groundCheckOffset;
        
        // Smoothly interpolate height for all stones
        if (!stone.userData.isInitialized) {
            // First frame, just set the height directly
            stone.position.y = targetHeight;
            stone.userData.isInitialized = true;
        } else {
            // Smoothly interpolate to target height
            stone.position.y += (targetHeight - stone.position.y) * heightSmoothingFactor;
        }
        
        // Calculate horizontal velocity based on terrain slope
        const checkDist = 0.3;
        const currentHeight = getTerrainHeight(stone.position.x, stone.position.z);
        const slopeFront = getTerrainHeight(stone.position.x, stone.position.z + checkDist) - currentHeight;
        const slopeBack = getTerrainHeight(stone.position.x, stone.position.z - checkDist) - currentHeight;
        const slopeLeft = getTerrainHeight(stone.position.x - checkDist, stone.position.z) - currentHeight;
        const slopeRight = getTerrainHeight(stone.position.x + checkDist, stone.position.z) - currentHeight;

        // Lower slope threshold for more consistent rolling
        const slopeThreshold = 0.01;
        
        // Reset acceleration
        let accelX = 0;
        let accelZ = 0;
        
        // Apply forces based on slopes
        if (slopeFront < -slopeThreshold) accelZ += -slopeFront * rollSpeed;
        if (slopeBack < -slopeThreshold) accelZ -= -slopeBack * rollSpeed;
        if (slopeLeft < -slopeThreshold) accelX -= -slopeLeft * rollSpeed;
        if (slopeRight < -slopeThreshold) accelX += -slopeRight * rollSpeed;
        
        // Update velocity with acceleration and friction
        stoneVelocity.x += accelX;
        stoneVelocity.z += accelZ;
        
        // Apply reduced friction for stones coming from water to allow them to travel further
        const distanceFromCenter = Math.sqrt(stone.position.x * stone.position.x + stone.position.z * stone.position.z);
        const isNearShore = distanceFromCenter > (shoreRadius * 0.8);
        const frictionFactor = isNearShore ? 0.3 * friction : friction; // Further reduce friction near shore
        
        stoneVelocity.x *= (1 - frictionFactor);
        stoneVelocity.z *= (1 - frictionFactor);
        
        // Calculate current velocity magnitude
        const currentVelocity = Math.sqrt(stoneVelocity.x * stoneVelocity.x + stoneVelocity.z * stoneVelocity.z);
        
        // Check if stone has settled (very low velocity) and was thrown by player
        if (currentVelocity < minVelocity && stone.userData.thrown === true) {
            console.log("Stone has settled naturally, transforming to tower base");
            transformStoneToTowerBase(stone, i);
            continue; // Skip the rest of the loop for this stone
        }
        
        // Stop if moving very slowly
        if (Math.abs(stoneVelocity.x) < minVelocity) stoneVelocity.x = 0;
        if (Math.abs(stoneVelocity.z) < minVelocity) stoneVelocity.z = 0;

        // Limit maximum velocity
        if (currentVelocity > maxVelocity) {
            const scale = maxVelocity / currentVelocity;
            stoneVelocity.x *= scale;
            stoneVelocity.z *= scale;
        }
        
        // Update stone rotation based on movement for visual feedback
        if (currentVelocity > 0.01) {
            // Calculate rotation axis perpendicular to movement direction
            const rotationAxis = new THREE.Vector3(-stoneVelocity.z, 0, stoneVelocity.x).normalize();
            const rotationAmount = currentVelocity * 0.2;
            
            // Apply rotation
            stone.rotateOnAxis(rotationAxis, rotationAmount);
        }
    }
}

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
        const blockHeight = 1.2; // This should match the height of blocks in transformStoneToTowerBase
        targetHeight = Math.max(highestTower.position.y + blockHeight, 3);
        
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
    if (currentTime - lastStoneDropTime > stoneDropInterval) {
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

        // Check for tower climbing before handling terrain height
        const isClimbing = checkTowerClimbing();
        
        // Smoothly interpolate current height to target height
        if (!isJumping) {  // Only smooth terrain following when not jumping
            camera.position.y += (targetHeight - camera.position.y) * heightSmoothness;
        }

        // Handle jumping (only if not holding stone and not throwing)
        if (keys.Space && !isJumping && !heldStone && Math.abs(camera.position.y - targetHeight) < 0.1 && (Date.now() - lastThrowTime > pickupDelay)) {
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
            
            // Expanded boundary check to allow walking to the edge
            const boundary = size * 0.49; // Increased from 0.4 to 0.49 (almost the full radius)
            camera.position.x = Math.max(-boundary, Math.min(boundary, newX));
            camera.position.z = Math.max(-boundary, Math.min(boundary, newZ));
        }
        camera.rotation.y = cameraAngle;
    }

    // Update stones with simplified physics
    updateStones();
    
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
        if (distance < playerRadius && !heldStone && (currentTime - lastThrowTime > pickupDelay)) {
            // Remove stone from physics arrays
            stones.splice(i, 1);
            stoneVelocities.splice(i, 1);
            
            // Set as held stone
            heldStone = stone;
            
            // Scale down the held stone
            heldStone.scale.set(
                heldStoneOffset.scale, 
                heldStoneOffset.scale, 
                heldStoneOffset.scale
            );
        }
    }

    // Update held stone position with physics in animate()
    if (heldStone) {
        // Calculate ideal position based on camera
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(camera.quaternion);
        
        heldStonePhysics.targetPos.set(
            camera.position.x + forward.x * heldStoneOffset.forward,
            camera.position.y - heldStoneOffset.down,
            camera.position.z + forward.z * heldStoneOffset.forward
        );
        
        // Add bobbing based on movement
        const time = Date.now() * 0.003;
        if (velocity.forward !== 0) {
            heldStonePhysics.targetPos.y += Math.sin(time * 5) * heldStonePhysics.bobStrength;
            heldStonePhysics.targetPos.x += Math.cos(time * 2.5) * heldStonePhysics.swayStrength;
        }
        
        // Apply spring physics
        const deltaPos = new THREE.Vector3().subVectors(heldStonePhysics.targetPos, heldStone.position);
        heldStonePhysics.velocity.add(deltaPos.multiplyScalar(heldStonePhysics.springStrength));
        heldStonePhysics.velocity.multiplyScalar(heldStonePhysics.dampening);
        
        // Update position
        heldStone.position.add(heldStonePhysics.velocity);
        
        // Smooth rotation
        heldStonePhysics.targetRot.y = camera.rotation.y;
        heldStone.rotation.y += (heldStonePhysics.targetRot.y - heldStone.rotation.y) * heldStonePhysics.rotationLag;
        
        // Add slight tilt based on movement
        if (velocity.forward !== 0) {
            heldStone.rotation.z = Math.sin(time * 5) * 0.1;
            heldStone.rotation.x = Math.cos(time * 2.5) * 0.1;
        } else {
            heldStone.rotation.z *= 0.95;
            heldStone.rotation.x *= 0.95;
        }
    }

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

// Add key handler for throwing
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyE' && heldStone) {
        handleThrowAction();
    }
});

// Add mouse click handler for throwing
document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && heldStone) { // Left mouse button
        handleThrowAction();
    }
});

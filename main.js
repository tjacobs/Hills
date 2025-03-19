// Set up scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create the ground plane
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg');

// Make the texture repeat
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(8, 8);

// Set geometry for hills
const size = 200;
const height = 5;
const segments = 100;
const xs = 5;
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

// Create flat border ground (much larger)
const borderSize = size * 10;
const borderGeometry = new THREE.PlaneGeometry(borderSize, borderSize);
const borderMaterial = new THREE.MeshStandardMaterial({ 
    map: grassTexture,
    side: THREE.DoubleSide,
    color: 0x558833  // Darker green color
});
const borderGround = new THREE.Mesh(borderGeometry, borderMaterial);
borderGround.rotation.x = -Math.PI / 2;
borderGround.position.y = -5;
scene.add(borderGround);

// Main ground (unchanged)
const groundMaterial = new THREE.MeshStandardMaterial({ 
    map: grassTexture,
    side: THREE.DoubleSide
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

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
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false
};

// Track if keys have been used
let keyboardControlActive = false;

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
const maxTurnSpeed = 0.02;
const acceleration = 0.02;
const turnAcceleration = 0.001;
const deceleration = 0.01;
const turnDeceleration = 0.001;

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

// Add particle clouds
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
        const radius = Math.random() * 5; // Smaller radius for tighter clumping
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 2;
        
        // Position particles with natural cloud-like spread, double the width
        positions[i * 3] = cloudCenter.x + (Math.cos(theta) * Math.sin(phi) * radius * 2); // Double width
        positions[i * 3 + 1] = cloudCenter.y + (Math.sin(theta) * Math.sin(phi) * radius);
        positions[i * 3 + 2] = cloudCenter.z + (Math.cos(phi) * radius * 2); // Double width

        // Set all particles to a larger size for a solid appearance
        scales[i] = 1; // Uniform size for a more cohesive look
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

// Create a ball
const ballRadius = 1; // Radius of the ball
const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red color for the ball
const ball = new THREE.Mesh(ballGeometry, ballMaterial);
scene.add(ball);

// Function to position the ball on top of the hill
function positionBallOnHill() {
    // Get the terrain height at the center of the scene (or any specific position)
    const hillX = 0; // X position on the hill
    const hillZ = 0; // Z position on the hill
    const hillHeight = getTerrainHeight(hillX, hillZ); // Get the height of the hill

    // Position the ball on top of the hill
    ball.position.set(hillX, hillHeight + ballRadius, hillZ); // Set Y to hill height + radius
}

// Call the function to position the ball
positionBallOnHill();

// Gravity variables
let ballVelocity = new THREE.Vector3(0, 0, 0);
const gravity = -0.1;
const rollSpeed = 0.5; // Significant roll speed
const friction = 0.02; // Low friction
const minVelocity = 0.01;
const groundCheckOffset = 0.1;

// Modify animation loop for gentler cloud movement
function animate() {
    requestAnimationFrame(animate);
    
    // Animate particle clouds
    const positions = particleClouds.geometry.attributes.position.array;
    const time = Date.now() * 0.00002; // Very slow movement
    
    for(let i = 0; i < positions.length; i += 3) {
        // Very gentle floating motion
        positions[i] += Math.sin(time + i) * 0.005;      // Reduced movement
        positions[i + 1] += Math.cos(time + i) * 0.002; // Even less vertical movement
        positions[i + 2] += Math.sin(time + i * 0.5) * 0.005;
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
        // Handle keyboard and touch movement with acceleration
        if (keys.ArrowLeft || (isTouching && (touchEnd.x - touchStart.x) < -20)) {
            velocity.turning = Math.min(velocity.turning + turnAcceleration, maxTurnSpeed);
        } else if (keys.ArrowRight || (isTouching && (touchEnd.x - touchStart.x) > 20)) {
            velocity.turning = Math.max(velocity.turning - turnAcceleration, -maxTurnSpeed);
        } else {
            // Decelerate turning
            if (velocity.turning > 0) {
                velocity.turning = Math.max(0, velocity.turning - turnDeceleration);
            } else if (velocity.turning < 0) {
                velocity.turning = Math.min(0, velocity.turning + turnDeceleration);
            }
        }
        
        if (keys.ArrowUp || (isTouching && (touchStart.y - touchEnd.y) > 20)) {
            velocity.forward = Math.min(velocity.forward + acceleration, maxSpeed);
        } else if (keys.ArrowDown || (isTouching && (touchStart.y - touchEnd.y) < -20)) {
            velocity.forward = Math.max(velocity.forward - acceleration, -maxSpeed);
        } else {
            // Decelerate forward/backward
            if (velocity.forward > 0) {
                velocity.forward = Math.max(0, velocity.forward - deceleration);
            } else if (velocity.forward < 0) {
                velocity.forward = Math.min(0, velocity.forward + deceleration);
            }
        }
        
        // Apply movement
        cameraAngle += velocity.turning;
        
        if (velocity.forward !== 0) {
            let newX = camera.position.x - Math.sin(cameraAngle) * velocity.forward;
            let newZ = camera.position.z - Math.cos(cameraAngle) * velocity.forward;
            
            // Calculate distance from center as a percentage of the boundary
            const boundary = size * 0.4;
            const distanceFromCenterX = Math.abs(newX) / boundary;
            const distanceFromCenterZ = Math.abs(newZ) / boundary;
            
            // Calculate slowdown factor (1 at center, approaches 0 at boundary)
            const slowdownX = Math.max(0, 1 - Math.pow(distanceFromCenterX, 2));
            const slowdownZ = Math.max(0, 1 - Math.pow(distanceFromCenterZ, 2));
            const slowdown = Math.min(slowdownX, slowdownZ);
            
            // Apply movement with slowdown
            newX = camera.position.x - Math.sin(cameraAngle) * velocity.forward * slowdown;
            newZ = camera.position.z - Math.cos(cameraAngle) * velocity.forward * slowdown;
            
            // Final boundary check
            camera.position.x = Math.max(-boundary, Math.min(boundary, newX));
            camera.position.z = Math.max(-boundary, Math.min(boundary, newZ));
        }
        
        camera.position.y = 3;
        camera.rotation.y = cameraAngle;
    }
    
    // Handle player movement and collision detection
    if (keyboardControlActive) {
        const forwardX = Math.sin(cameraAngle) * velocity.forward;
        const forwardZ = Math.cos(cameraAngle) * velocity.forward;

        // Calculate potential new position
        const newX = camera.position.x - forwardX;
        const newZ = camera.position.z - forwardZ;

        // Check the terrain height at the new position
        const newTerrainHeight = getTerrainHeight(newX, newZ);

        // Smoothly adjust camera height based on terrain height
        const targetHeight = newTerrainHeight + 2; // Adjust to be 2 units above the terrain
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetHeight, 0.1); // Smooth transition

        // Allow movement if above terrain
        camera.position.x = newX;
        camera.position.z = newZ;
    }

    // Ball physics
    ballVelocity.y += gravity;
    ball.position.x += ballVelocity.x;
    ball.position.y += ballVelocity.y;
    ball.position.z += ballVelocity.z;

    // Get current terrain height at ball position
    const ballTerrainHeight = getTerrainHeight(ball.position.x, ball.position.z);

    // Ground collision check
    if (ball.position.y <= ballTerrainHeight + ballRadius) {
        ball.position.y = ballTerrainHeight + ballRadius + groundCheckOffset;
        ballVelocity.y = 0;

        // Calculate slopes in all directions
        const slopeFront = getTerrainHeight(ball.position.x, ball.position.z + 0.1) - ballTerrainHeight;
        const slopeBack = getTerrainHeight(ball.position.x, ball.position.z - 0.1) - ballTerrainHeight;
        const slopeLeft = getTerrainHeight(ball.position.x - 0.1, ball.position.z) - ballTerrainHeight;
        const slopeRight = getTerrainHeight(ball.position.x + 0.1, ball.position.z) - ballTerrainHeight;

        // Find steepest downward slope
        let steepestSlope = 0;
        let rollDirection = new THREE.Vector3(0, 0, 0);

        // Check all directions for steepest downward slope
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

        // Apply rolling physics if on a slope
        if (steepestSlope < 0) {
            // Calculate rolling force based on slope steepness
            const slopeFactor = Math.abs(steepestSlope) * 2;
            
            // Add to current velocity
            const rollForce = rollSpeed * slopeFactor;
            ballVelocity.x += rollDirection.x * rollForce;
            ballVelocity.z += rollDirection.z * rollForce;
        }

        // Apply friction to horizontal movement
        ballVelocity.x *= (1 - friction);
        ballVelocity.z *= (1 - friction);

        // Stop if moving very slowly
        if (Math.abs(ballVelocity.x) < minVelocity) ballVelocity.x = 0;
        if (Math.abs(ballVelocity.z) < minVelocity) ballVelocity.z = 0;
    }
    
    renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
} 
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
const size = 100;
const height = 5.0;
const segments = 100;
const xs = 10;
const ys = xs;

// Create hills
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

// Track key presses
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) {
        keys[e.code] = false;
    }
});

// Set initial camera rotation
let cameraAngle = 0;

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Handle keyboard movement
    if (keys.ArrowLeft) {
        cameraAngle += rotateSpeed;
    }
    if (keys.ArrowRight) {
        cameraAngle -= rotateSpeed;
    }
    if (keys.ArrowUp) {
        let newX = camera.position.x - Math.sin(cameraAngle) * moveSpeed;
        let newZ = camera.position.z - Math.cos(cameraAngle) * moveSpeed;
        
        // Clamp to boundaries but allow sliding
        const boundary = size/2 - 1;
        camera.position.x = Math.max(-boundary, Math.min(boundary, newX));
        camera.position.z = Math.max(-boundary, Math.min(boundary, newZ));
    }
    if (keys.ArrowDown) {
        let newX = camera.position.x + Math.sin(cameraAngle) * moveSpeed;
        let newZ = camera.position.z + Math.cos(cameraAngle) * moveSpeed;
        
        // Clamp to boundaries but allow sliding
        const boundary = size/2 - 1;
        camera.position.x = Math.max(-boundary, Math.min(boundary, newX));
        camera.position.z = Math.max(-boundary, Math.min(boundary, newZ));
    }
    
    // Update camera direction
    camera.rotation.y = cameraAngle;
    
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
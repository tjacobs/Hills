// Physics system
const Physics = {
    // Initialize physics
    init() {
    },
    
    // Update physics
    update(deltaTime) {
        // Update clouds
        for (const cloud of Game.clouds) {
            cloud.update(deltaTime);
        }
    }
};

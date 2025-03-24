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

        // Check for stone-to-tower transformations
        this.checkStoneTransformations();
    },

    // Check for stone-to-tower transformations
    checkStoneTransformations() {

        // Disable tower creation for now
        return;

        // Get stones that are stationary and thrown
        const stationaryStones = Game.stones.filter(
            stone => stone.isStatic && !stone.isHeld
        );
        
        // Check for groups of stones near each other
        for (const stone of stationaryStones) {
            // Find nearby stones
            const nearbyStones = stationaryStones.filter(otherStone => {
                if (otherStone === stone) return false;
                const distance = stone.mesh.position.distanceTo(otherStone.mesh.position);
                return distance < CONFIG.TOWER.baseRadius;
            });

            // Check for existing towers nearby
            let nearestTower = null;
            let nearestTowerDistance = Infinity;
            
            for (const tower of Game.towers) {
                const distance = stone.mesh.position.distanceTo(tower.mesh.position);
                if (distance < nearestTowerDistance) {
                    nearestTowerDistance = distance;
                    nearestTower = tower;
                }
            }

            // If stone is near an existing tower, try to stack it
            if (nearestTower && nearestTowerDistance < CONFIG.TOWER.baseRadius) {
                // Stack stone on tower
                nearestTower.addLevel();
                Game.removeStone(stone);
                
                // Notify network
                Network.sendTowerUpdate(nearestTower);
                continue;
            }

            // If we have enough stones nearby (4 total including this one)
            if (nearbyStones.length >= 3) {
                // Calculate average position for the new tower
                const avgPos = new THREE.Vector3();
                avgPos.add(stone.mesh.position);
                nearbyStones.forEach(s => avgPos.add(s.mesh.position));
                avgPos.divideScalar(nearbyStones.length + 1);
                avgPos.y = 0; // Place on ground
                
                // Create new tower
                const newTower = new Tower(null, avgPos, 1);
                newTower.createdBy = Game.localPlayer.id;
                
                // Remove stones
                Game.removeStone(stone);
                nearbyStones.forEach(s => Game.removeStone(s));
                
                // Add tower
                Game.addTower(newTower);
                
                // Notify network
                Network.sendTowerCreated(newTower);
                break; // Only create one tower per check
            }
        }
    }
};

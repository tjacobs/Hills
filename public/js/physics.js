// Physics system
const Physics = {
    // Initialize physics
    init() {
        // Nothing to initialize yet
    },
    
    // Update physics
    update(deltaTime) {
        // Update stones
        for (const stone of Game.stones) {
            stone.update(deltaTime);
        }

        // Update clouds
        for (const cloud of Game.clouds) {
            cloud.update(deltaTime);
        }

        // Check for stone-to-tower transformations
        this.checkStoneTransformations();
    },

    // Check for stone-to-tower transformations
    checkStoneTransformations() {
        // Get stones that are stationary and thrown
        const stationaryStones = Game.stones.filter(
            stone => stone.isStatic && stone.isThrown && !stone.isHeld
        );

        // Check for groups of stones near each other
        for (const stone of stationaryStones) {
            // Find nearby stones
            const nearbyStones = stationaryStones.filter(otherStone => {
                if (otherStone === stone) return false;
                return stone.mesh.position.distanceTo(otherStone.mesh.position) < CONFIG.TOWER.baseRadius;
            });

            // If we have enough stones nearby
            if (nearbyStones.length >= 4) {
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
        
        // Stacking on existing towers
        for (const stone of stationaryStones) {
            // Check if stone has been stationary for long enough
            if (Date.now() - stone.throwTime > 1000) {
                // Check if stone is near an existing tower
                let nearestTower = null;
                let nearestDistance = Infinity;
                for (const tower of Game.towers) {
                    const distance = stone.mesh.position.distanceTo(tower.position);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestTower = tower;
                    }
                }
                
                // If stone is near a tower, create a new tower on top
                if (nearestTower && nearestDistance < CONFIG.TOWER.baseRadius * 1.5) {
                    // Create new tower on top of existing tower
                    const newTowerPosition = nearestTower.position.clone();
                    newTowerPosition.y += CONFIG.STONE.blockHeight;
                    
                    // Create new tower
                    const newTower = new Tower(
                        null,
                        newTowerPosition,
                        nearestTower.level + 1
                    );
                    
                    // Set created by
                    newTower.createdBy = Game.localPlayer.id;
                    
                    // Add to game
                    Game.addTower(newTower);
                    
                    // Remove stone
                    Game.removeStone(stone);
                    
                    // Notify network
                    Network.sendTowerCreated(newTower);
                } else if (nearestDistance > CONFIG.TOWER.baseRadius * 2) {
                    // Create new tower at stone position
                    const newTowerPosition = stone.mesh.position.clone();
                    newTowerPosition.y = 0; // Place on ground
                    
                    // Create new tower
                    const newTower = new Tower(
                        null,
                        newTowerPosition,
                        1
                    );
                    
                    // Set created by
                    newTower.createdBy = Game.localPlayer.id;
                    
                    // Add to game
                    Game.addTower(newTower);
                    
                    // Remove stone
                    Game.removeStone(stone);
                    
                    // Notify network
                    Network.sendTowerCreated(newTower);
                }
            }
        }
    }
};

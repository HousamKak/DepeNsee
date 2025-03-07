//------------------------------------------------------------------------
// js/utils.js (Utility functions)
//------------------------------------------------------------------------

// Build complete dependency data structures for advanced filtering
export function buildDependencyData(data) {
    const dependencies = {}; // nodeId -> [dependencies]
    const dependents = {}; // nodeId -> [dependents]
    
    // Initialize empty arrays for all nodes
    Object.keys(data.nodeInfo).forEach(nodeId => {
        dependencies[nodeId] = [];
        dependents[nodeId] = [];
    });
    
    // Process dependencies
    Object.keys(data.dependencies).forEach(source => {
        const targets = data.dependencies[source];
        
        // Add each target as a dependency of source
        targets.forEach(target => {
            // Add target to source's dependencies
            if (dependencies[source] && !dependencies[source].includes(target)) {
                dependencies[source].push(target);
            }
            
            // Add source to target's dependents
            if (dependents[target] && !dependents[target].includes(source)) {
                dependents[target].push(source);
            }
        });
    });
    
    return { dependencies, dependents };
}

// Get full dependency chain based on filter mode
export function getDependencyChain(rootNodeIds, dependencies, dependents, mode) {
    const result = new Set(rootNodeIds);
    
    // Process based on mode
    if (mode === 'show-deps' || mode === 'show-both') {
        // Include dependencies (what these nodes import)
        const processNode = (nodeId) => {
            if (dependencies[nodeId]) {
                dependencies[nodeId].forEach(depId => {
                    if (!result.has(depId)) {
                        result.add(depId);
                        processNode(depId);
                    }
                });
            }
        };
        
        rootNodeIds.forEach(processNode);
    }
    
    if (mode === 'show-dependents' || mode === 'show-both') {
        // Include dependents (what imports these nodes)
        const processNode = (nodeId) => {
            if (dependents[nodeId]) {
                dependents[nodeId].forEach(depId => {
                    if (!result.has(depId)) {
                        result.add(depId);
                        processNode(depId);
                    }
                });
            }
        };
        
        rootNodeIds.forEach(processNode);
    }
    
    return Array.from(result);
}

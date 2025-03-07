// Data handling utilities for the dependency visualizer

/**
 * Create mock data for demo mode
 * @returns {Object} Mock dependency data in the format expected by the visualizer
 */
export function createMockData() {
    // Initialize with empty data structures
    const mockData = {
        dependencies: {},
        nodeInfo: {},
        libraries: [
            'react', 
            'react-dom', 
            'express', 
            'lodash', 
            'axios', 
            'winston', 
            'joi', 
            'bcrypt', 
            'passport',
            'three.js'
        ],
        fileTypes: ['.ts', '.js', '.tsx', '.jsx']
    };

    // Create mock file structure resembling a real project
    const folders = [
        'src/components',
        'src/pages',
        'src/api',
        'src/models',
        'src/services',
        'src/utils',
        'src/middleware',
        'src/hooks',
        'src/contexts',
        'src/styles'
    ];

    const fileTypes = {
        'src/components': ['.tsx', '.jsx'],
        'src/pages': ['.tsx', '.jsx'],
        'src/api': ['.ts', '.js'],
        'src/models': ['.ts', '.js'],
        'src/services': ['.ts', '.js'],
        'src/utils': ['.ts', '.js'],
        'src/middleware': ['.ts', '.js'],
        'src/hooks': ['.ts', '.js'],
        'src/contexts': ['.tsx', '.jsx'],
        'src/styles': ['.js']
    };

    // Component names for more realistic file naming
    const componentNames = [
        'Button', 'Modal', 'Card', 'Tabs', 'Form', 'Input', 
        'Dropdown', 'NavBar', 'Sidebar', 'Footer', 'Header',
        'Layout', 'Table', 'Pagination', 'Alert', 'Tooltip',
        'Avatar', 'Badge', 'Toggle', 'Spinner', 'Progress'
    ];

    // Page names for more realistic file naming
    const pageNames = [
        'Home', 'Dashboard', 'Login', 'Register', 'Profile',
        'Settings', 'Products', 'ProductDetail', 'Cart', 'Checkout',
        'Admin', 'Users', 'Analytics', 'Reports', 'NotFound'
    ];

    // Utility names for more realistic file naming
    const utilNames = [
        'date', 'string', 'number', 'array', 'object',
        'validation', 'format', 'parse', 'transform', 'helpers',
        'constants', 'config', 'env', 'logger', 'storage'
    ];

    // API/Service/Model names for more realistic file naming
    const apiNames = [
        'user', 'auth', 'product', 'order', 'payment',
        'notification', 'search', 'upload', 'download', 'analytics'
    ];

    // Create files in each folder
    folders.forEach(folder => {
        const folderFileTypes = fileTypes[folder] || mockData.fileTypes;
        
        // Determine number of files based on folder type
        let fileCount = 0;
        let nameArray = [];
        
        if (folder.includes('components')) {
            fileCount = Math.floor(Math.random() * 10) + 10; // 10-20 components
            nameArray = componentNames;
        } else if (folder.includes('pages')) {
            fileCount = Math.floor(Math.random() * 5) + 5; // 5-10 pages
            nameArray = pageNames;
        } else if (folder.includes('utils')) {
            fileCount = Math.floor(Math.random() * 5) + 5; // 5-10 utilities
            nameArray = utilNames;
        } else {
            fileCount = Math.floor(Math.random() * 5) + 3; // 3-8 files in other folders
            nameArray = apiNames;
        }

        // Create files with appropriate names
        const usedNames = new Set();
        
        for (let i = 0; i < fileCount; i++) {
            // Get a unique name from the appropriate array or generate a fallback
            let name = nameArray[Math.floor(Math.random() * nameArray.length)];
            
            // If name is already used, append a number
            if (usedNames.has(name)) {
                name = `${name}${Math.floor(Math.random() * 10) + 1}`;
            }
            usedNames.add(name);
            
            // Choose a file type appropriate for this folder
            const fileType = folderFileTypes[Math.floor(Math.random() * folderFileTypes.length)];
            
            // Create file path
            const fileName = `${folder}/${name}${fileType}`;
            
            // Add to node info
            mockData.nodeInfo[fileName] = {
                name: `${name}${fileType}`,
                path: fileName,
                type: fileType,
                size: Math.random() * 5000 + 500, // Random size between 500 and 5500 bytes
                lastModified: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Within last 30 days
            };
            
            // Initialize empty dependencies array
            mockData.dependencies[fileName] = [];
        }
    });

    // Add library nodes
    mockData.libraries.forEach(lib => {
        const libKey = `library:${lib}`;
        mockData.nodeInfo[libKey] = {
            name: lib,
            path: libKey,
            type: 'library',
            size: 10000 + Math.random() * 50000 // Libraries are larger
        };
    });

    // Create realistic dependencies between files
    const allFiles = Object.keys(mockData.nodeInfo).filter(key => !key.startsWith('library:'));
    
    // Helper to get folder from path
    const getFolder = (path) => path.substring(0, path.lastIndexOf('/'));
    
    // Helper to get all files in a folder
    const getFilesInFolder = (folder) => allFiles.filter(file => getFolder(file) === folder);
    
    // Function to add dependencies with different patterns
    allFiles.forEach(source => {
        const sourceFolder = getFolder(source);
        
        // Determine files that this file would typically import
        let potentialDependencies = [];
        
        // Common dependencies by folder type
        if (sourceFolder.includes('components')) {
            // Components typically import:
            // - Other components
            // - Utilities
            // - Hooks
            // - Styles
            potentialDependencies = [
                ...getFilesInFolder('src/components').filter(f => f !== source),
                ...getFilesInFolder('src/utils'),
                ...getFilesInFolder('src/hooks'),
                ...getFilesInFolder('src/styles')
            ];
        } else if (sourceFolder.includes('pages')) {
            // Pages typically import:
            // - Components
            // - Services
            // - Contexts
            // - Utils
            potentialDependencies = [
                ...getFilesInFolder('src/components'),
                ...getFilesInFolder('src/services'),
                ...getFilesInFolder('src/contexts'),
                ...getFilesInFolder('src/utils')
            ];
        } else if (sourceFolder.includes('api')) {
            // API files typically import:
            // - Models
            // - Services
            // - Utils
            // - Middleware
            potentialDependencies = [
                ...getFilesInFolder('src/models'),
                ...getFilesInFolder('src/services'),
                ...getFilesInFolder('src/utils'),
                ...getFilesInFolder('src/middleware')
            ];
        } else if (sourceFolder.includes('services')) {
            // Services typically import:
            // - Models
            // - Utils
            // - API
            potentialDependencies = [
                ...getFilesInFolder('src/models'),
                ...getFilesInFolder('src/utils'),
                ...getFilesInFolder('src/api')
            ];
        } else {
            // Other files mostly import utils
            potentialDependencies = [
                ...getFilesInFolder('src/utils')
            ];
        }
        
        // Avoid circular dependencies by filtering out files that already depend on this source
        potentialDependencies = potentialDependencies.filter(dep => {
            return !mockData.dependencies[dep]?.includes(source);
        });
        
        // Add 1-5 dependencies from potential dependencies
        const dependencyCount = Math.min(Math.floor(Math.random() * 5) + 1, potentialDependencies.length);
        
        for (let i = 0; i < dependencyCount; i++) {
            if (potentialDependencies.length === 0) break;
            
            const randomIndex = Math.floor(Math.random() * potentialDependencies.length);
            const target = potentialDependencies[randomIndex];
            
            if (target && target !== source) {
                mockData.dependencies[source].push(target);
            }
            
            // Remove to avoid duplicates
            potentialDependencies.splice(randomIndex, 1);
        }
        
        // Add library dependencies based on file type and folder
        const libraryProb = getLibraryProbabilitiesForFile(source);
        
        mockData.libraries.forEach(lib => {
            const libKey = `library:${lib}`;
            
            if (Math.random() < (libraryProb[lib] || 0.1)) {
                mockData.dependencies[source].push(libKey);
            }
        });
    });
    
    return mockData;
}

/**
 * Get probability of a file using each library based on file type and folder
 * @param {string} filePath File path
 * @returns {Object} Map of library names to probability (0-1)
 */
function getLibraryProbabilitiesForFile(filePath) {
    const probabilities = {};
    
    // Default low probability for all libraries
    probabilities.react = 0.1;
    probabilities['react-dom'] = 0.05;
    probabilities.express = 0.05;
    probabilities.lodash = 0.2; // Utility library used everywhere
    probabilities.axios = 0.2;  // HTTP client used in many places
    probabilities.winston = 0.05;
    probabilities.joi = 0.05;
    probabilities.bcrypt = 0.05;
    probabilities.passport = 0.05;
    probabilities['three.js'] = 0.05;
    
    // Frontend components are likely to use React
    if (filePath.includes('components') || filePath.includes('pages')) {
        probabilities.react = 0.9;
        probabilities['react-dom'] = 0.3;
        
        // If it's a visualization component, it might use Three.js
        if (filePath.includes('Chart') || filePath.includes('Graph') || 
            filePath.includes('Map') || filePath.includes('Visualizer')) {
            probabilities['three.js'] = 0.7;
        }
    }
    
    // Backend files are likely to use Express
    if (filePath.includes('api') || filePath.includes('middleware') || filePath.includes('server')) {
        probabilities.express = 0.8;
        probabilities.winston = 0.4; // Logging
        
        // Authentication related
        if (filePath.includes('auth') || filePath.includes('user')) {
            probabilities.passport = 0.7;
            probabilities.bcrypt = 0.7;
        }
    }
    
    // Validation heavy files use Joi
    if (filePath.includes('validation') || filePath.includes('model')) {
        probabilities.joi = 0.7;
    }
    
    // API service files use axios
    if (filePath.includes('api') || filePath.includes('service') || filePath.includes('client')) {
        probabilities.axios = 0.8;
    }
    
    return probabilities;
}

/**
 * Process raw data from API or file and convert to visualizer format
 * @param {Object} rawData Raw data from API or file
 * @returns {Object} Formatted data for visualization
 */
export function processDataForVisualization(rawData) {
    // Clone to avoid modifying original
    const data = JSON.parse(JSON.stringify(rawData));
    
    // Extract unique file types
    const fileTypes = new Set();
    Object.values(data.nodeInfo).forEach(node => {
        if (!node.path.startsWith('library:')) {
            fileTypes.add(node.type);
        }
    });
    
    // Extract unique libraries
    const libraries = new Set();
    Object.keys(data.nodeInfo).forEach(path => {
        if (path.startsWith('library:')) {
            libraries.add(data.nodeInfo[path].name);
        }
    });
    
    // Add fileTypes and libraries arrays if they don't exist
    if (!data.fileTypes) {
        data.fileTypes = Array.from(fileTypes);
    }
    
    if (!data.libraries) {
        data.libraries = Array.from(libraries);
    }
    
    return data;
}

/**
 * Calculate metrics about the dependency graph
 * @param {Object} data Dependency data
 * @returns {Object} Metrics including cyclomatic complexity, coupling, etc.
 */
export function calculateDependencyMetrics(data) {
    const metrics = {
        totalFiles: 0,
        totalLibraries: 0,
        totalDependencies: 0,
        maxDependencies: 0,
        maxDependenciesFile: '',
        maxDependents: 0,
        maxDependentsFile: '',
        averageDependencies: 0,
        orphanedFiles: 0, // Files with no dependencies in or out
        cyclicDependencies: [], // Pairs of files with cyclic dependencies
    };
    
    // Count files and libraries
    Object.keys(data.nodeInfo).forEach(path => {
        if (path.startsWith('library:')) {
            metrics.totalLibraries++;
        } else {
            metrics.totalFiles++;
        }
    });
    
    // Calculate dependents (reverse of dependencies)
    const dependents = {};
    Object.keys(data.dependencies).forEach(source => {
        data.dependencies[source].forEach(target => {
            if (!dependents[target]) {
                dependents[target] = [];
            }
            dependents[target].push(source);
        });
    });
    
    // Calculate dependencies and dependents metrics
    Object.keys(data.dependencies).forEach(source => {
        const dependencies = data.dependencies[source];
        metrics.totalDependencies += dependencies.length;
        
        if (dependencies.length > metrics.maxDependencies) {
            metrics.maxDependencies = dependencies.length;
            metrics.maxDependenciesFile = source;
        }
        
        // Check for cyclic dependencies
        dependencies.forEach(target => {
            if (data.dependencies[target] && data.dependencies[target].includes(source)) {
                metrics.cyclicDependencies.push([source, target]);
            }
        });
    });
    
    // Calculate max dependents
    Object.keys(dependents).forEach(target => {
        if (dependents[target].length > metrics.maxDependents) {
            metrics.maxDependents = dependents[target].length;
            metrics.maxDependentsFile = target;
        }
    });
    
    // Calculate average dependencies
    metrics.averageDependencies = metrics.totalFiles > 0 
        ? metrics.totalDependencies / metrics.totalFiles 
        : 0;
    
    // Count orphaned files (no dependencies in or out)
    Object.keys(data.nodeInfo).forEach(path => {
        if (!path.startsWith('library:')) {
            const hasDependencies = data.dependencies[path] && data.dependencies[path].length > 0;
            const hasDependents = dependents[path] && dependents[path].length > 0;
            
            if (!hasDependencies && !hasDependents) {
                metrics.orphanedFiles++;
            }
        }
    });
    
    return metrics;
}

/**
 * Export dependency data to CSV format
 * @param {Object} data Dependency data
 * @returns {string} CSV content
 */
export function exportToCsv(data) {
    // Create file data rows
    const rows = [
        // Header row
        ['Source', 'Target', 'SourceType', 'TargetType', 'SourceSize', 'TargetSize']
    ];
    
    // Add dependency rows
    Object.keys(data.dependencies).forEach(source => {
        const sourceInfo = data.nodeInfo[source];
        
        data.dependencies[source].forEach(target => {
            const targetInfo = data.nodeInfo[target];
            
            if (sourceInfo && targetInfo) {
                rows.push([
                    source,
                    target,
                    sourceInfo.type || '',
                    targetInfo.type || '',
                    sourceInfo.size || 0,
                    targetInfo.size || 0
                ]);
            }
        });
    });
    
    // Convert to CSV
    return rows.map(row => row.map(cell => {
        // Quote strings that contain commas
        if (typeof cell === 'string' && cell.includes(',')) {
            return `"${cell}"`;
        }
        return cell;
    }).join(',')).join('\n');
}

/**
 * Import dependency data from CSV
 * @param {string} csvContent CSV content
 * @returns {Object} Dependency data in the format expected by the visualizer
 */
export function importFromCsv(csvContent) {
    const data = {
        dependencies: {},
        nodeInfo: {},
        libraries: [],
        fileTypes: []
    };
    
    // Parse CSV
    const rows = csvContent.split('\n').map(row => {
        return row.split(',').map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
    });
    
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue; // Skip invalid rows
        
        const [source, target, sourceType, targetType, sourceSize, targetSize] = row;
        
        // Add source node info if not exists
        if (!data.nodeInfo[source]) {
            const isLibrary = source.startsWith('library:');
            const name = isLibrary ? source.substring(8) : source.split('/').pop();
            
            data.nodeInfo[source] = {
                name,
                path: source,
                type: sourceType || (isLibrary ? 'library' : '.js'),
                size: parseInt(sourceSize) || 1000
            };
            
            // Track file type
            if (!isLibrary && sourceType && !data.fileTypes.includes(sourceType)) {
                data.fileTypes.push(sourceType);
            }
            
            // Track library
            if (isLibrary && !data.libraries.includes(name)) {
                data.libraries.push(name);
            }
        }
        
        // Add target node info if not exists
        if (!data.nodeInfo[target]) {
            const isLibrary = target.startsWith('library:');
            const name = isLibrary ? target.substring(8) : target.split('/').pop();
            
            data.nodeInfo[target] = {
                name,
                path: target,
                type: targetType || (isLibrary ? 'library' : '.js'),
                size: parseInt(targetSize) || 1000
            };
            
            // Track file type
            if (!isLibrary && targetType && !data.fileTypes.includes(targetType)) {
                data.fileTypes.push(targetType);
            }
            
            // Track library
            if (isLibrary && !data.libraries.includes(name)) {
                data.libraries.push(name);
            }
        }
        
        // Add dependency
        if (!data.dependencies[source]) {
            data.dependencies[source] = [];
        }
        
        if (!data.dependencies[source].includes(target)) {
            data.dependencies[source].push(target);
        }
    }
    
    return data;
}
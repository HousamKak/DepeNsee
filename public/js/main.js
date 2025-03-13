//------------------------------------------------------------------------
// js/main.js (Main initialization code)
//------------------------------------------------------------------------

// Import modules
import { DependencyVisualizer } from './DependencyVisualizer.js';
import { createMockData, processDataForVisualization } from './dataHandlers.js';
import { MethodInfoDisplay } from './MethodInfoDisplay.js';

// Store visualizer instance globally for potential use
let visualizerInstance = null;

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing application...');

    setupPolyfills();
    setupEventListeners();

    // Add event listener for handling clicks inside multi-panel view
    document.addEventListener('click', handleMultiPanelClicks);
});

// Set up polyfills for older browsers
function setupPolyfills() {
    // Polyfill for roundRect if not supported
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            this.beginPath();
            this.moveTo(x + radius, y);
            this.arcTo(x + width, y, x + width, y + height, radius);
            this.arcTo(x + width, y + height, x, y + height, radius);
            this.arcTo(x, y + height, x, y, radius);
            this.arcTo(x, y, x + width, y, radius);
            this.closePath();
            return this;
        };
    }
}

// Set up event listeners for initial UI elements
function setupEventListeners() {
    // Initialize form buttons
    const analyzeBtn = document.getElementById('analyze-btn');
    const demoBtn = document.getElementById('demo-btn');
    const projectPathInput = document.getElementById('project-path');

    // Add option for method parsing
    const methodParsingCheckbox = document.createElement('div');
    methodParsingCheckbox.className = 'form-group';
    methodParsingCheckbox.innerHTML = `
    <label for="enable-method-parsing">
        <input type="checkbox" id="enable-method-parsing" checked />
        Enable Method Parsing (slower but provides method visualization)
    </label>
`;

    // Insert before analyze button
    const modalBody = document.querySelector('.modal-body');
    if (modalBody) {
        modalBody.appendChild(methodParsingCheckbox);
    }

    // Set default path based on platform
    if (navigator.platform.includes('Win')) {
        projectPathInput.value = 'C:\\path\\to\\your\\project';
    } else {
        projectPathInput.value = '/path/to/your/project';
    }

    // Setup event listeners for analyze and demo buttons
    analyzeBtn.addEventListener('click', () => {
        const path = projectPathInput.value.trim();
        if (path) {
            const enableMethodParsing = document.getElementById('enable-method-parsing')?.checked ?? true;
            analyzeProject(path, enableMethodParsing);
        } else {
            alert('Please enter a valid project path');
        }
    });

    demoBtn.addEventListener('click', loadDemoData);
}

// Function to create and setup sidebar toggle
function setupSidebarToggle() {
    // Create toggle button with high z-index
    const toggleButton = document.createElement('button');
    toggleButton.id = 'super-toggle-btn';
    toggleButton.setAttribute('title', 'Toggle Sidebar');
    toggleButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12h18M3 6h18M3 18h18"></path>
        </svg>
    `;

    // Add toggle functionality
    toggleButton.addEventListener('click', function () {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        // Move sidebar to body for better z-index handling
        document.body.appendChild(sidebar);

        if (sidebar.classList.contains('sidebar-collapsed')) {
            sidebar.classList.remove('sidebar-collapsed');
            toggleButton.style.left = '335px';
            console.log('Sidebar expanded with z-index priority');
        } else {
            sidebar.classList.add('sidebar-collapsed');
            toggleButton.style.left = '15px';
            console.log('Sidebar collapsed with z-index priority');
        }

        // Force redraw
        void sidebar.offsetWidth;

        // Tell visualizer to adjust
        window.dispatchEvent(new Event('resize'));
    });

    // Add button to DOM
    document.body.appendChild(toggleButton);

    // Set initial position
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('sidebar-collapsed')) {
        toggleButton.style.left = '335px';
    }
}

// Analyze project function - calls API with path
async function analyzeProject(path, enableMethodParsing = true) {
    try {
        document.getElementById('loading-container').classList.remove('hidden');
        document.getElementById('welcome-modal').classList.add('hidden');

        // Mark body as having visualization active
        document.body.classList.add('visualization-active');

        // Show method parsing message if enabled
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = enableMethodParsing
                ? 'Analyzing project dependencies and parsing methods...'
                : 'Analyzing project dependencies...';
        }

        // Make API request to analyze project with method parsing option
        const response = await fetch(`/api/analyze?path=${encodeURIComponent(path)}&methodParsing=${enableMethodParsing}`);

        if (!response.ok) {
            throw new Error(`Failed to analyze project: ${response.statusText}`);
        }

        const data = await response.json();

        // Create visualization
        await initializeVisualization(data);

        document.getElementById('loading-container').classList.add('hidden');
    } catch (error) {
        console.error('Error analyzing project:', error);
        alert(`Error analyzing project: ${error.message}`);
        document.getElementById('loading-container').classList.add('hidden');
        document.getElementById('welcome-modal').classList.remove('hidden');
        document.body.classList.remove('visualization-active');
    }
}

// Load demo data function
async function loadDemoData() {
    document.getElementById('loading-container').classList.remove('hidden');
    document.getElementById('welcome-modal').classList.add('hidden');

    // Mark body as having visualization active
    document.body.classList.add('visualization-active');

    // Update loading message
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = 'Generating demo data with method information...';
    }

    // Create mock data with method information
    const mockData = await createEnhancedMockData();

    // Create visualization
    await initializeVisualization(mockData);

    document.getElementById('loading-container').classList.add('hidden');
}

// Create enhanced mock data with method information
async function createEnhancedMockData() {
    // First get the standard mock data
    const baseData = createMockData();

    // Add method information to the data
    const methodInfo = {};
    const methodDependencies = {};

    // Generate method data for each file
    Object.keys(baseData.nodeInfo)
        .filter(path => !path.startsWith('library:'))
        .forEach(filePath => {
            // Generate between 2-8 methods per file
            const methodCount = Math.floor(Math.random() * 6) + 2;
            const methods = [];

            // Method types to choose from
            const methodTypes = ['function', 'method', 'arrow'];

            // Initialize dependencies
            methodDependencies[filePath] = {};

            // Generate methods
            for (let i = 0; i < methodCount; i++) {
                const type = methodTypes[Math.floor(Math.random() * methodTypes.length)];
                const name = generateMethodName(type, filePath);

                // Generate 0-3 parameters
                const paramCount = Math.floor(Math.random() * 4);
                const params = [];

                for (let p = 0; p < paramCount; p++) {
                    params.push({
                        name: `param${p + 1}`,
                        type: Math.random() > 0.5 ? getRandomType() : null,
                        defaultValue: Math.random() > 0.7
                    });
                }

                // Add method
                methods.push({
                    name,
                    type,
                    class: type === 'method' ? generateClassName(filePath) : null,
                    params,
                    loc: {
                        start: { line: Math.floor(Math.random() * 50) + 1, column: 0 },
                        end: { line: Math.floor(Math.random() * 100) + 50, column: 0 }
                    }
                });

                // Initialize method dependencies
                methodDependencies[filePath][name] = [];
            }

            // Create dependencies between methods (50% chance of calling another method)
            methods.forEach(method => {
                // 50% chance to call another method
                if (Math.random() > 0.5) {
                    // Pick a random method from the same file
                    const targetIndex = Math.floor(Math.random() * methods.length);
                    const targetMethod = methods[targetIndex];

                    // Don't call itself
                    if (targetMethod.name !== method.name) {
                        methodDependencies[filePath][method.name].push({
                            name: targetMethod.name,
                            type: 'local',
                            source: filePath
                        });
                    }
                }

                // 30% chance to call a method from a dependency
                if (Math.random() > 0.7) {
                    const depPaths = baseData.dependencies[filePath] || [];

                    if (depPaths.length > 0) {
                        // Get a random dependency
                        const depIndex = Math.floor(Math.random() * depPaths.length);
                        const depPath = depPaths[depIndex];

                        // If it's not a library
                        if (!depPath.startsWith('library:')) {
                            methodDependencies[filePath][method.name].push({
                                name: `importedFunc${Math.floor(Math.random() * 5) + 1}`,
                                type: 'imported',
                                source: depPath,
                                module: depPath.split('/').pop().split('.')[0]
                            });
                        }
                    }
                }
            });

            // Store method info
            methodInfo[filePath] = { methods };
        });

    // Add method info to the base data
    return {
        ...baseData,
        methodInfo,
        methodDependencies
    };
}

// Helper to generate method name based on type and file path
function generateMethodName(type, filePath) {
    const filename = filePath.split('/').pop().split('.')[0];

    // Common method prefixes
    const prefixes = {
        function: ['get', 'set', 'create', 'update', 'delete', 'process', 'handle', 'format', 'validate', 'parse'],
        method: ['get', 'set', 'is', 'has', 'render', 'compute', 'initialize', 'fetch', 'save', 'remove'],
        arrow: ['transform', 'filter', 'map', 'sort', 'find', 'calculate', 'check', 'convert', 'generate', 'format']
    };

    // Generate method name based on type
    const prefix = prefixes[type][Math.floor(Math.random() * prefixes[type].length)];

    // Capitalize first letter of filename
    const capitalizedName = filename.charAt(0).toUpperCase() + filename.slice(1);

    return `${prefix}${capitalizedName}`;
}

// Helper to generate class name from file path
function generateClassName(filePath) {
    const filename = filePath.split('/').pop().split('.')[0];
    // Capitalize first letter
    return filename.charAt(0).toUpperCase() + filename.slice(1);
}

// Helper to get random type
function getRandomType() {
    const types = ['string', 'number', 'boolean', 'object', 'any', 'function', 'Record<string, any>', 'string[]'];
    return types[Math.floor(Math.random() * types.length)];
}

// Initialize visualization with data
async function initializeVisualization(data) {
    // Add a small delay to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create visualizer
    const visualizer = new DependencyVisualizer();

    // Store instance globally
    visualizerInstance = visualizer;

    // Set up sidebar toggle after modal is closed
    setupSidebarToggle();

    // Initialize visualization with 2D mode by default
    await visualizer.init(data, '2d');

    console.log('Visualization initialized successfully');

    // Check if method data is available
    if (data.methodInfo && Object.keys(data.methodInfo).length > 0) {
        console.log('Method information available for visualization');
    }
}

// Handle clicks inside multi-panel view for specific view toggles
function handleMultiPanelClicks(event) {
    // Check if we have panels
    if (!visualizerInstance || !visualizerInstance.isPanelMode) return;

    // Handle 2D/3D toggle clicks
    if (event.target.closest('.view-toggle')) {
        const toggleButton = event.target.closest('.view-toggle');
        const panelId = toggleButton.dataset.panel;

        // Find which view mode option was clicked
        if (event.target.classList.contains('view-2d')) {
            // Switch to 2D
            togglePanelViewMode(panelId, '2d');
            toggleButton.classList.remove('view-3d-active');
        } else if (event.target.classList.contains('view-3d')) {
            // Switch to 3D
            togglePanelViewMode(panelId, '3d');
            toggleButton.classList.add('view-3d-active');
        }
    }
}

// Toggle a panel's view mode between 2D and 3D
function togglePanelViewMode(panelId, mode) {
    if (!visualizerInstance || !visualizerInstance.isPanelMode) return;

    // Get the panel
    const panel = visualizerInstance.panels[panelId.replace('-panel', '')];
    if (!panel) return;

    // Update panel's camera and controls based on mode
    if (mode === '2d') {
        // Switch to orthographic camera for 2D mode
        panel.controls.noRotate = true;
        if (panel.camera.isPerspectiveCamera) {
            // Create orthographic camera
            const aspect = panel.renderer.domElement.width / panel.renderer.domElement.height;
            const frustumSize = 500;

            const newCamera = new THREE.OrthographicCamera(
                frustumSize * aspect / -2,
                frustumSize * aspect / 2,
                frustumSize / 2,
                frustumSize / -2,
                1,
                2000
            );

            // Copy position
            newCamera.position.copy(panel.camera.position);

            // Force Z position
            newCamera.position.z = 1000;

            // Update panel's camera
            panel.camera = newCamera;
            panel.camera.lookAt(0, 0, 0);

            // Update controls
            panel.controls.object = newCamera;
            panel.controls.update();
        }

        // Flatten nodes to z=0
        Object.values(panel.nodeObjects).forEach(node => {
            const pos = node.position;
            node.position.set(pos.x, pos.y, 0);
        });
    } else {
        // Switch to perspective camera for 3D mode
        panel.controls.noRotate = false;
        if (panel.camera.isOrthographicCamera) {
            // Create perspective camera
            const newCamera = new THREE.PerspectiveCamera(
                75,
                panel.renderer.domElement.width / panel.renderer.domElement.height,
                0.1,
                2000
            );

            // Copy position
            newCamera.position.copy(panel.camera.position);

            // Update panel's camera
            panel.camera = newCamera;
            panel.camera.lookAt(0, 0, 0);

            // Update controls
            panel.controls.object = newCamera;
            panel.controls.update();
        }
    }
}
//------------------------------------------------------------------------
// js/DependencyVisualizer.js (Visualization class)
//------------------------------------------------------------------------

import * as THREE from 'https://cdn.skypack.dev/three@0.128.0';
import { TrackballControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/TrackballControls.js';
import { buildDependencyData, getDependencyChain } from './utils.js';

export class DependencyVisualizer {
    constructor() {
        this.directed = true;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.nodes = {};
        this.links = [];
        this.nodeObjects = {};
        this.linkObjects = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoveredObject = null;
        this.selectedObject = null;
        this.labelSprites = [];
        this.searchHighlightedNodes = [];
        this.showLabels = false;
        this.tooltip = this.createTooltip();
        this.viewMode = '2d'; // Default to 2D mode
        this.connectionStyle = 'arrow'; // Default to arrow style
        this.initialized = false; // Flag to track initialization
        this.rawData = null; // Store raw data for filtering
        this.mainVisualization = null; // Reference to main visualization

        // Dependencies data - store full dependency graph
        this.dependencies = {};
        this.dependents = {};

        // Color mapping
        this.colorMap = {
            '.ts': 0xff7700,   // Orange
            '.js': 0x00aaff,   // Blue
            '.tsx': 0xff00aa,  // Pink
            '.jsx': 0x00ffaa,  // Teal
            'library': 0xaaaaaa // Gray
        };

        // New properties for multi-panel view
        this.isPanelMode = false;
        this.currentFile = null;
        this.panels = {
            dependencies: null,  // Left panel (imports)
            methods: null,       // Center panel (methods)
            dependents: null,    // Right panel (dependents)
        };

        // Method data
        this.methodData = {};
        this.methodDependencies = {};

        // DOM Elements - set up in initUI
        this.sidebar = {
            visible: true,
            content: null
        };
        this.infoPanel = null;
        this.closeInfoPanelBtn = null;

        // Event listeners
        this.setupEventListeners();
    }

    // Set up basic event listeners
    setupEventListeners() {
        // Mouse move for hover effects
        window.addEventListener('mousemove', (event) => {
            if (this.initialized && this.camera) {
                this.onMouseMove(event);
            }
        }, false);

        // Window resize for responsive layout
        window.addEventListener('resize', () => {
            if (this.initialized && this.camera) {
                this.handleResize();
            }
        }, false);
    }

    // Initialize UI elements and event listeners
    initUI() {
        // Get DOM Elements
        this.sidebar = document.getElementById('sidebar');
        this.infoPanel = document.getElementById('info-panel');
        this.closeInfoPanelBtn = document.getElementById('close-info-panel');

        // Set up close info panel button
        if (this.closeInfoPanelBtn) {
            this.closeInfoPanelBtn.addEventListener('click', () => {
                if (this.infoPanel) this.infoPanel.classList.remove('active');
            });
        }

        // Set up visualization control buttons
        this.setupControlButtons();

        // Set up filter controls
        this.setupFilterControls();

        // Set up view mode toggle
        this.setupViewModeToggle();

        // Setup the directed toggle
        this.setupDirectedToggle();

        // Setup connection style toggle
        this.setupConnectionStyleToggle();

        // Add this line to set up search functionality
        this.setupSearchFunctionality();

        // Also set up the debug button for easier troubleshooting
        this.setupDebugButton();
    }

    // Set up visualization control buttons
    setupControlButtons() {
        const resetCameraBtn = document.getElementById('reset-camera');
        if (resetCameraBtn) {
            resetCameraBtn.addEventListener('click', this.resetCamera.bind(this));
        }

        const toggleLabelsBtn = document.getElementById('toggle-labels');
        if (toggleLabelsBtn) {
            toggleLabelsBtn.addEventListener('click', this.toggleLabels.bind(this));
        }

        // Node size slider
        const nodeSizeSlider = document.getElementById('node-size');
        if (nodeSizeSlider) {
            nodeSizeSlider.addEventListener('input', (e) => {
                const size = parseFloat(e.target.value);
                if (this.mainVisualization && this.mainVisualization.nodeObjects) {
                    Object.values(this.mainVisualization.nodeObjects).forEach(node => {
                        const scale = size / 5; // Normalize to default value of 5
                        node.scale.set(scale, scale, scale);
                    });
                }
            });
        }

        // Link opacity slider
        const linkOpacitySlider = document.getElementById('link-opacity');
        if (linkOpacitySlider) {
            linkOpacitySlider.addEventListener('input', (e) => {
                const opacity = parseFloat(e.target.value);
                if (this.mainVisualization && this.mainVisualization.linkObjects) {
                    this.mainVisualization.linkObjects.forEach(link => {
                        if (link.material && link.material.opacity !== undefined) {
                            link.material.opacity = opacity;
                        }
                    });
                }
            });
        }
    }

    setupDirectedToggle() {
        const directedToggle = document.getElementById('directed-toggle');
        if (directedToggle) {
            // Set checkbox to checked state since directed is now true by default
            directedToggle.checked = this.directed;

            directedToggle.addEventListener('change', (e) => {
                this.directed = e.target.checked;

                // Rebuild the main visualization
                if (this.mainVisualization) {
                    this.mainVisualization.dispose();

                    const container = document.getElementById('visualization-container');
                    if (container) {
                        this.mainVisualization = this.createVisualization(container, this.rawData, {
                            viewMode: this.viewMode,
                            showLabels: this.showLabels
                        });
                    }
                }

                // Show a tooltip to confirm the change
                this.showTooltip(this.directed ? 'Directed Graph Enabled' : 'Directed Graph Disabled', {
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2
                }, 1500);
            });
        }
    }

    setupConnectionStyleToggle() {
        // Check if the element already exists
        let connectionStyleToggle = document.getElementById('connection-style-toggle');

        // If it doesn't exist in the HTML, create it
        if (!connectionStyleToggle) {
            const directedToggleElement = document.getElementById('directed-toggle');
            if (!directedToggleElement) return;

            // Create the connection style toggle with only arrow option
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'form-group';
            toggleContainer.innerHTML = `
                <label for="connection-style-toggle">Connection Style</label>
                <select id="connection-style-toggle" class="form-control">
                    <option value="arrow">Arrow Style</option>
                </select>
            `;

            // Insert after the directed toggle
            directedToggleElement.parentNode.parentNode.insertBefore(
                toggleContainer,
                directedToggleElement.parentNode.nextSibling
            );

            // Get the newly created element
            connectionStyleToggle = document.getElementById('connection-style-toggle');
        }

        // Set up event listener (simplified since we only have one option)
        if (connectionStyleToggle) {
            connectionStyleToggle.addEventListener('change', (e) => {
                this.connectionStyle = e.target.value;

                // Rebuild the main visualization
                if (this.mainVisualization) {
                    this.mainVisualization.dispose();

                    const container = document.getElementById('visualization-container');
                    if (container) {
                        this.mainVisualization = this.createVisualization(container, this.rawData, {
                            viewMode: this.viewMode,
                            showLabels: this.showLabels
                        });
                    }
                }
            });
        }
    }

    // Set up filter controls
    setupFilterControls() {
        // File name filter
        const filenameFilter = document.getElementById('filename-filter');
        if (filenameFilter) {
            filenameFilter.addEventListener('input', this.applyFilters.bind(this));
        }

        // File type filter
        const fileTypeFilter = document.getElementById('file-type-filter');
        if (fileTypeFilter) {
            fileTypeFilter.addEventListener('change', this.applyFilters.bind(this));
        }

        // Library filter
        const libraryFilter = document.getElementById('library-filter');
        if (libraryFilter) {
            libraryFilter.addEventListener('change', this.applyFilters.bind(this));
        }

        // Apply filters button for advanced filtering
        const applyFiltersBtn = document.getElementById('apply-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                this.applyFilters(true); // Apply with dependency awareness
            });
        }
    }

    // Set up view mode toggle
    setupViewModeToggle() {
        const view2d = document.getElementById('view-2d');
        const view3d = document.getElementById('view-3d');

        if (view2d) {
            view2d.addEventListener('change', () => this.setViewMode('2d'));
            // Set initial state
            if (this.viewMode === '2d') {
                view2d.checked = true;
            }
        }

        if (view3d) {
            view3d.addEventListener('change', () => this.setViewMode('3d'));
            // Set initial state
            if (this.viewMode === '3d') {
                view3d.checked = true;
            }
        }
    }

    // Initialize visualization with data
    async init(data, initialViewMode = '2d') {
        console.log('Initializing DependencyVisualizer...');

        // Store raw data for filtering
        this.rawData = data;

        // Store method data
        this.methodData = data.methodInfo || {};
        this.methodDependencies = data.methodDependencies || {};

        // Initialize UI elements and event listeners
        this.initUI();

        // Set initial view mode
        this.viewMode = initialViewMode;

        // Build dependency data for filter improvements
        this.buildDependencyData(data);

        // Process the dependency data
        this.processData(data);

        // Create the main visualization container
        const container = document.getElementById('visualization-container');
        if (!container) {
            console.error('Visualization container not found');
            return;
        }

        // Create visualization using the unified engine
        this.mainVisualization = this.createVisualization(container, data, {
            viewMode: this.viewMode,
            showLabels: this.showLabels,

            // Handle node click to show multi-panel view
            onNodeClick: (nodeData) => {
                // Ignore clicks on library nodes
                if (nodeData.path && nodeData.path.startsWith('library:')) {
                    console.log('Ignoring click on library node');
                    return;
                }

                // Transition to multi-panel view for the clicked file
                console.log('Transitioning to multi-panel view for node:', nodeData.id);
                try {
                    this.showMultiPanelView(nodeData.id);
                } catch (error) {
                    console.error('Error showing multi-panel view:', error);
                    // Reset state in case of error
                    this.isPanelMode = false;
                }
            },

            // Handle node hover to show info panel
            onNodeHover: (nodeData) => {
                this.updateInfoPanel(nodeData);
            }
        });

        // Mark as initialized
        this.initialized = true;

        // Populate filter dropdowns
        this.populateFilters(data);

        // Update project info
        this.updateProjectInfo(data);

        // Add initial hint
        this.showTooltip(`${this.viewMode === '2d' ? '2D' : '3D'} visualization loaded. Hover over nodes to see details.`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 3000);

        // Make sure 2D/3D toggle reflects correct mode
        this.updateViewModeControls();
    }

    // Unified Visualization Engine
    // Core visualization creation method - to be used by both main view and panels
    createVisualization(container, data, options = {}) {
        // Default options
        const defaults = {
            viewMode: this.viewMode, // Use class-level viewMode by default
            nodes: null,             // Can provide pre-processed nodes
            links: null,             // Can provide pre-processed links
            centerNodeId: null,      // For radial layout
            useRadialLayout: false,  // Whether to use radial layout
            nodeColorMap: this.colorMap, // Default color map
            showLabels: this.showLabels, // Whether to show labels
            width: container.clientWidth || window.innerWidth,
            height: container.clientHeight || window.innerHeight,
            onNodeClick: null,       // Node click handler
            onNodeHover: null        // Node hover handler
        };

        // Merge with provided options
        const config = { ...defaults, ...options };

        console.log(`Creating visualization with mode: ${config.viewMode}, container size: ${config.width}x${config.height}`);

        try {
            // Process nodes and links if not provided
            let nodes = config.nodes || {};
            let links = config.links || [];

            if (!config.nodes || !config.links) {
                const { processedNodes, processedLinks } = this.processVisualizationData(data, config);
                nodes = processedNodes;
                links = processedLinks;
            }

            // Set up Three.js scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e293b);

            // Create camera based on viewMode
            let camera;
            if (config.viewMode === '2d') {
                const aspect = config.width / config.height;
                const frustumSize = 500;
                camera = new THREE.OrthographicCamera(
                    frustumSize * aspect / -2,
                    frustumSize * aspect / 2,
                    frustumSize / 2,
                    frustumSize / -2,
                    1,
                    2000
                );
                camera.position.z = 300;
            } else {
                camera = new THREE.PerspectiveCamera(75, config.width / config.height, 0.1, 1000);
                camera.position.z = 300;
            }

            // Create renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(config.width, config.height);
            renderer.setPixelRatio(window.devicePixelRatio || 1);

            // Clear container and add renderer
            container.innerHTML = '';
            container.appendChild(renderer.domElement);

            // Create controls
            const controls = new TrackballControls(camera, renderer.domElement);
            controls.rotateSpeed = 1.5;
            controls.zoomSpeed = 1.2;
            controls.panSpeed = 2.0;

            // Disable rotation in 2D mode
            if (config.viewMode === '2d') {
                controls.noRotate = true;
            }

            // Add lighting
            this.addLightsToScene(scene);

            // Create node objects
            const nodeObjects = this.createNodeObjects(nodes, scene, config);

            // Apply initial layout positioning
            this.applyLayout(nodes, nodeObjects, links, config);

            // Create links between nodes
            const linkObjects = this.createLinkObjects(links, nodeObjects, scene, config);

            // Create labels if configured
            const labelSprites = [];
            if (config.showLabels) {
                this.createVisualizationLabels(nodes, nodeObjects, scene, labelSprites);
            }

            // Set up interaction handlers
            const { raycaster, tooltip } = this.setupInteractionHandlers(
                container, scene, camera, nodeObjects, linkObjects, config
            );

            // Set up animation loop
            const animate = () => {
                if (!renderer.domElement.isConnected) {
                    // Stop animation if element is removed from DOM
                    return;
                }

                requestAnimationFrame(animate);

                // Update link positions during camera movement
                this.updateLinkPositions(linkObjects, nodeObjects);

                // Update label positions
                if (config.showLabels && labelSprites.length > 0) {
                    this.updateLabelPositions(labelSprites, nodeObjects, camera);
                }

                controls.update();
                renderer.render(scene, camera);
            };

            // Start animation
            animate();

            // Handle resize
            const resizeHandler = () => {
                if (!renderer.domElement.isConnected) return;

                const newWidth = container.clientWidth;
                const newHeight = container.clientHeight;

                if (newWidth > 0 && newHeight > 0) {
                    if (camera.isOrthographicCamera) {
                        const aspect = newWidth / newHeight;
                        const frustumSize = 500;
                        camera.left = frustumSize * aspect / -2;
                        camera.right = frustumSize * aspect / 2;
                        camera.top = frustumSize / 2;
                        camera.bottom = frustumSize / -2;
                    } else {
                        camera.aspect = newWidth / newHeight;
                    }
                    camera.updateProjectionMatrix();
                    renderer.setSize(newWidth, newHeight);
                }
            };

            window.addEventListener('resize', resizeHandler);

            // Return visualization instance
            return {
                scene,
                camera,
                renderer,
                controls,
                nodes,
                nodeObjects,
                links,
                linkObjects,
                labelSprites,
                raycaster,
                tooltip,

                // Store callbacks
                onNodeClick: config.onNodeClick,
                onNodeHover: config.onNodeHover,

                // Method to set view mode (2D/3D)
                setViewMode: (mode) => {
                    if (mode === '2d') {
                        // Flatten nodes to z=0
                        Object.values(nodeObjects).forEach(node => {
                            const pos = node.position;
                            node.position.set(pos.x, pos.y, 0);
                        });

                        // Disable rotation
                        controls.noRotate = true;

                        // Update camera if needed
                        if (camera.isPerspectiveCamera) {
                            const aspect = renderer.domElement.width / renderer.domElement.height;
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
                            newCamera.position.copy(camera.position);
                            newCamera.position.z = 300; // Force consistent Z

                            // Replace camera
                            camera = newCamera;
                            controls.object = camera;
                            camera.lookAt(0, 0, 0);
                        }
                    } else { // 3D mode
                        // Enable rotation
                        controls.noRotate = false;

                        // Re-apply 3D positions
                        this.applyLayout(nodes, nodeObjects, links, {
                            ...config,
                            viewMode: '3d'
                        });

                        // Update camera if needed
                        if (camera.isOrthographicCamera) {
                            const newCamera = new THREE.PerspectiveCamera(
                                75,
                                renderer.domElement.width / renderer.domElement.height,
                                0.1,
                                2000
                            );

                            // Copy position
                            newCamera.position.copy(camera.position);

                            // Replace camera
                            camera = newCamera;
                            controls.object = camera;
                            camera.lookAt(0, 0, 0);
                        }
                    }

                    controls.update();
                },

                // Method to clean up resources
                dispose: () => {
                    window.removeEventListener('resize', resizeHandler);
                    controls.dispose();
                    renderer.dispose();

                    // Clean up event listeners
                    const canvas = renderer.domElement;
                    if (canvas && canvas.parentNode) {
                        const newCanvas = canvas.cloneNode(true);
                        canvas.parentNode.replaceChild(newCanvas, canvas);
                    }
                }
            };
        } catch (error) {
            console.error('Error creating visualization:', error);
            container.innerHTML = `<div class="panel-empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h4>Visualization Error</h4>
                <p>Failed to create visualization. Check console for details.</p>
            </div>`;
            return null;
        }
    }

    // Process data for visualization
    processVisualizationData(data, config) {
        let processedNodes = {};
        let processedLinks = [];

        // Handle different data formats for different visualization types
        if (config.isPanelVisualization) {
            // Panel visualizations use a focused data subset
            if (config.panelType === 'dependencies') {
                // Dependencies panel: show current file and its dependencies
                const fileId = config.currentFileId;
                const dependencies = this.dependencies[fileId] || [];

                // Add center node (current file)
                processedNodes[fileId] = {
                    id: fileId,
                    name: this.nodes[fileId].name,
                    type: this.nodes[fileId].type,
                    size: this.nodes[fileId].size * 1.2, // Slightly bigger
                    path: this.nodes[fileId].path,
                    isCenter: true,
                    x: 0, y: 0, z: 0 // Place at center
                };

                // Add dependency nodes
                dependencies.forEach(depId => {
                    if (this.nodes[depId]) {
                        processedNodes[depId] = {
                            id: depId,
                            name: this.nodes[depId].name,
                            type: this.nodes[depId].type,
                            size: this.nodes[depId].size * 0.7, // Smaller than main graph
                            path: this.nodes[depId].path,
                            // Initial random positions
                            x: (Math.random() - 0.5) * 200,
                            y: (Math.random() - 0.5) * 200,
                            z: (Math.random() - 0.5) * 50
                        };

                        // Add link from center to this dependency
                        processedLinks.push({
                            source: fileId,
                            target: depId
                        });
                    }
                });
            }
            else if (config.panelType === 'dependents') {
                // Dependents panel: show files that import the current file
                const fileId = config.currentFileId;
                const dependents = this.dependents[fileId] || [];

                // Add nodes for each dependent
                dependents.forEach(depId => {
                    if (this.nodes[depId]) {
                        processedNodes[depId] = {
                            id: depId,
                            name: this.nodes[depId].name,
                            type: this.nodes[depId].type,
                            size: this.nodes[depId].size * 0.7,
                            path: this.nodes[depId].path,
                            // Initial random positions
                            x: (Math.random() - 0.5) * 200,
                            y: (Math.random() - 0.5) * 200,
                            z: (Math.random() - 0.5) * 50
                        };
                    }
                });
            }
            else if (config.panelType === 'methods') {
                // Methods panel: show method nodes and their relationships
                const fileId = config.currentFileId;
                const methods = this.methodData[fileId]?.methods || [];
                const methodDeps = this.methodDependencies[fileId] || {};

                // Add node for each method
                methods.forEach(method => {
                    const nodeId = method.name;
                    processedNodes[nodeId] = {
                        id: nodeId,
                        name: method.name,
                        type: method.type, // 'method', 'function', 'arrow'
                        class: method.class,
                        params: method.params || [],
                        size: 5, // Base size for methods
                        // Initial random positions
                        x: (Math.random() - 0.5) * 200,
                        y: (Math.random() - 0.5) * 200,
                        z: (Math.random() - 0.5) * 50
                    };
                });

                // Add links between methods based on dependencies
                Object.keys(methodDeps).forEach(source => {
                    const targets = methodDeps[source] || [];
                    targets.forEach(target => {
                        // Only create links for local method calls
                        if (target.type === 'local' && processedNodes[source] && processedNodes[target.name]) {
                            processedLinks.push({
                                source,
                                target: target.name
                            });
                        }
                    });
                });
            }
        }
        else {
            // Main visualization: use all visible nodes
            processedNodes = Object.values(this.nodes)
                .filter(node => node.visible === undefined || node.visible)
                .reduce((acc, node) => {
                    acc[node.id] = {
                        ...node,
                        // Initial random positions
                        x: (Math.random() - 0.5) * 1000,
                        y: (Math.random() - 0.5) * 1000,
                        z: config.viewMode === '2d' ? 0 : (Math.random() - 0.5) * 1000
                    };
                    return acc;
                }, {});

            // Process links between visible nodes
            const visibleNodeIds = new Set(Object.keys(processedNodes));

            this.links.forEach(link => {
                if (visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)) {
                    processedLinks.push(link);
                }
            });
        }

        return { processedNodes, processedLinks };
    }

    // Create node objects
    createNodeObjects(nodes, scene, config) {
        const nodeObjects = {};

        Object.values(nodes).forEach(node => {
            // Determine color based on node type
            let color;

            if (node.path && node.path.startsWith('library:')) {
                color = config.nodeColorMap['library'];
            } else if (node.type === 'method') {
                color = 0x6366F1; // Primary color for methods
            } else if (node.type === 'arrow') {
                color = 0x10B981; // Green for arrow functions
            } else if (node.type === 'function') {
                color = 0x0EA5E9; // Blue for functions
            } else {
                const ext = node.type ? node.type.toLowerCase() : '.js';
                color = config.nodeColorMap[ext] || 0xffffff;
            }

            // Create sphere with consistent styling
            const size = node.size || 5;
            const geometry = new THREE.SphereGeometry(size, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: color,
                shininess: 70,
                specular: 0x111111,
                emissive: node.isCenter ? 0x333333 : 0x000000 // Highlight center node
            });

            const sphere = new THREE.Mesh(geometry, material);

            // Set position if defined
            if (node.x !== undefined && node.y !== undefined) {
                sphere.position.set(
                    node.x,
                    node.y,
                    config.viewMode === '2d' ? 0 : (node.z || 0)
                );
            } else {
                // Default random position
                sphere.position.set(
                    (Math.random() - 0.5) * 200,
                    (Math.random() - 0.5) * 200,
                    config.viewMode === '2d' ? 0 : (Math.random() - 0.5) * 50
                );
            }

            // Store node data
            sphere.userData = {
                type: 'node',
                id: node.id,
                ...node,
                isCurrentFile: node.isCenter
            };

            scene.add(sphere);
            nodeObjects[node.id] = sphere;
        });

        return nodeObjects;
    }

    // Create link objects
    createLinkObjects(links, nodeObjects, scene, config) {
        const linkObjects = [];

        links.forEach(link => {
            const sourceObj = nodeObjects[link.source];
            const targetObj = nodeObjects[link.target];

            if (!sourceObj || !targetObj) return;

            // Get connection points on node surfaces
            const connectionPoints = this.getConnectionPoints(
                sourceObj, targetObj,
                0, 1, 0, 1 // Default indices for simple cases
            );

            // Create curved path with proper styling
            const curve = this.createCurvedLinePath(
                connectionPoints.start,
                connectionPoints.end,
                config.viewMode
            );

            // Add this code before creating the arrow geometry

            // Get direction from last curve segments
            const lastPoint = curve[curve.length - 1];
            const secondLastPoint = curve[curve.length - 2];

            // Check for valid points
            if (!this.isValidVector(lastPoint) || !this.isValidVector(secondLastPoint)) {
                console.log('Skipping arrow creation due to invalid points');
                return; // Skip this arrow
            }

            // Safe direction calculation
            const dirVectorRaw = new THREE.Vector3().subVectors(lastPoint, secondLastPoint);
            if (dirVectorRaw.length() < 0.0001) {
                console.log('Skipping arrow creation due to zero-length direction');
                return; // Skip this arrow
            }
            const dir = this.normalizeVectorSafe(dirVectorRaw);

            // Create line geometry from curve points
            const geometry = new THREE.BufferGeometry().setFromPoints(curve);

            // Use consistent link color and opacity
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0x94a3b8,
                transparent: true,
                opacity: 0.3
            });

            const line = new THREE.Line(geometry, lineMaterial);
            line.userData = {
                type: 'link',
                source: link.source,
                target: link.target
            };

            scene.add(line);
            linkObjects.push(line);

            // Create arrow if directed mode is enabled
            if (this.directed && config.showArrows !== false) {
                // Get direction from last curve segments
                const lastPoint = curve[curve.length - 1];
                const secondLastPoint = curve[curve.length - 2];

                const dir = new THREE.Vector3()
                    .subVectors(lastPoint, secondLastPoint)
                    .normalize();

                // Create arrow at target end
                const arrowLength = 5;
                const arrowWidth = 2;

                // Target node radius
                const targetRadius = targetObj.geometry.parameters.radius;

                // Position arrow at the surface of the target node
                const arrowTip = targetObj.position.clone()
                    .sub(dir.clone().multiplyScalar(targetRadius * 1.02));

                const arrowBase = arrowTip.clone()
                    .sub(dir.clone().multiplyScalar(arrowLength));

                // Create perpendicular vector for arrow wings
                const perpDir = new THREE.Vector3(-dir.y, dir.x, 0)
                    .normalize()
                    .multiplyScalar(arrowWidth);

                const arrowLeft = arrowBase.clone().add(perpDir);
                const arrowRight = arrowBase.clone().sub(perpDir);

                // Create arrow geometry
                const arrowGeometry = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    arrowTip.x, arrowTip.y, arrowTip.z,
                    arrowLeft.x, arrowLeft.y, arrowLeft.z,
                    arrowRight.x, arrowRight.y, arrowRight.z
                ]);

                arrowGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

                const arrowMaterial = new THREE.MeshBasicMaterial({
                    color: 0x6366F1,
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide
                });

                const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);

                scene.add(arrow);
                linkObjects.push(arrow);
            }
        });

        return linkObjects;
    }

    // Create labels for nodes
    createVisualizationLabels(nodes, nodeObjects, scene, labelSprites) {
        Object.values(nodes).forEach(node => {
            if (!nodeObjects[node.id]) return;

            const sprite = this.createNodeLabel(node, nodeObjects[node.id]);
            if (sprite) {
                scene.add(sprite);
                labelSprites.push({
                    sprite,
                    nodeId: node.id
                });
            }
        });
    }

    // Create a single node label
    createNodeLabel(node, nodeObject) {
        // Get device pixel ratio for sharper text
        const pixelRatio = window.devicePixelRatio || 1;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set font
        const fontSize = 12;
        context.font = `${fontSize}px Inter, Arial, sans-serif`;

        // Measure text
        const text = node.name;
        const textMetrics = context.measureText(text);
        const textWidth = textMetrics.width;

        // Add padding
        const padding = 10;
        const canvasWidth = Math.ceil(textWidth + padding * 2);
        const canvasHeight = 20;

        // Set canvas size with high resolution
        canvas.width = canvasWidth * pixelRatio;
        canvas.height = canvasHeight * pixelRatio;

        // Scale context for high DPI
        context.scale(pixelRatio, pixelRatio);

        // Create background with rounded corners
        context.fillStyle = 'rgba(30, 41, 59, 0.85)';
        context.beginPath();
        context.roundRect(0, 0, canvasWidth, canvasHeight, 4);
        context.fill();

        // Draw text
        context.font = `${fontSize}px Inter, Arial, sans-serif`;
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.fillStyle = '#f8fafc';
        context.fillText(text, padding, canvasHeight / 2);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);

        // Position above node
        sprite.position.set(
            nodeObject.position.x,
            nodeObject.position.y + nodeObject.geometry.parameters.radius * 1.5,
            nodeObject.position.z
        );

        // Scale sprite
        const spriteScale = 0.25;
        sprite.scale.set(
            (canvasWidth / canvasHeight) * spriteScale * canvasHeight,
            spriteScale * canvasHeight,
            1
        );

        return sprite;
    }

    // Add standard lighting to scene
    addLightsToScene(scene) {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        // Add directional light
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1, 1, 1).normalize();
        scene.add(dirLight);

        // Add point light near camera
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(0, 0, 500);
        scene.add(pointLight);
    }

    // Set up interaction handlers
    setupInteractionHandlers(container, scene, camera, nodeObjects, linkObjects, config) {
        // Create raycaster for interaction
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'panel-tooltip';
        container.appendChild(tooltip);

        // Store currently hovered node
        let hoveredNode = null;

        // Create event listeners
        container.addEventListener('mousemove', (event) => {
            // Convert mouse position to normalized device coordinates
            const rect = container.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // Update raycaster
            raycaster.setFromCamera(mouse, camera);

            // Find intersections with nodes
            const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

            // Reset all highlights
            Object.values(nodeObjects).forEach(node => {
                if (!node.userData.isCurrentFile) {
                    node.material.emissive.setHex(0x000000);
                }
            });

            linkObjects.forEach(link => {
                if (link.material && link.material.opacity !== undefined) {
                    link.material.opacity = 0.3;
                }
            });

            // Hide tooltip by default
            tooltip.classList.remove('visible');
            hoveredNode = null;

            // Handle intersection
            if (intersects.length > 0) {
                const obj = intersects[0].object;
                hoveredNode = obj;

                // Don't highlight center node further
                if (!obj.userData.isCurrentFile) {
                    obj.material.emissive.setHex(0x333333);
                }

                // Highlight connections
                linkObjects.forEach(link => {
                    if (link.type !== 'Line') return;

                    if (link.userData && (link.userData.source === obj.userData.id ||
                        link.userData.target === obj.userData.id)) {
                        if (link.material) {
                            link.material.opacity = 0.8;
                        }

                        // Also highlight connected nodes
                        const connectedId = link.userData.source === obj.userData.id ?
                            link.userData.target : link.userData.source;

                        const connectedNode = nodeObjects[connectedId];
                        if (connectedNode && !connectedNode.userData.isCurrentFile) {
                            connectedNode.material.emissive.setHex(0x222222);
                        }
                    }
                });

                // Show tooltip
                const nodeData = obj.userData;
                tooltip.innerHTML = this.generateTooltipContent(nodeData);
                tooltip.style.left = `${event.clientX - rect.left + 10}px`;
                tooltip.style.top = `${event.clientY - rect.top + 10}px`;
                tooltip.classList.add('visible');

                // Custom hover callback
                if (typeof config.onNodeHover === 'function') {
                    config.onNodeHover(nodeData);
                }
            }
        });

        // Handle click events
        container.addEventListener('click', (event) => {
            // Skip if no node is hovered
            if (!hoveredNode) return;

            // Call click handler if provided
            if (typeof config.onNodeClick === 'function') {
                config.onNodeClick(hoveredNode.userData);
            }
        });

        return { raycaster, tooltip };
    }

    // Generate tooltip content
    generateTooltipContent(nodeData) {
        let content = `<div>${nodeData.name}</div>`;

        if (nodeData.path) {
            content += `<div style="font-size: 0.7rem; opacity: 0.7;">${nodeData.path}</div>`;
        }

        if (nodeData.isCurrentFile) {
            content += `<div style="font-size: 0.7rem; color: #6366F1;">Current File</div>`;
        }

        if (nodeData.type) {
            if (nodeData.type === 'method' || nodeData.type === 'function' || nodeData.type === 'arrow') {
                content += `<div style="font-size: 0.7rem;">${this.formatMethodType(nodeData.type)}</div>`;

                if (nodeData.params && nodeData.params.length) {
                    content += `<div style="font-size: 0.7rem;">Parameters: ${nodeData.params.length}</div>`;
                }
            } else {
                content += `<div style="font-size: 0.7rem;">${nodeData.type}</div>`;
            }
        }

        return content;
    }

    // Format method type for display
    formatMethodType(type) {
        switch (type) {
            case 'function': return 'Function';
            case 'method': return 'Class Method';
            case 'arrow': return 'Arrow Function';
            default: return type;
        }
    }

    // Update link positions when nodes move
    updateLinkPositions(linkObjects, nodeObjects) {
        linkObjects.forEach(linkObj => {
            // Skip non-lines or those without proper userData
            if (!linkObj.userData || !linkObj.userData.source || !linkObj.userData.target) return;

            const sourceObj = nodeObjects[linkObj.userData.source];
            const targetObj = nodeObjects[linkObj.userData.target];

            if (!sourceObj || !targetObj) return;

            // For lines, update the curve
            if (linkObj.type === 'Line') {
                // Get updated connection points
                const connectionPoints = this.getConnectionPoints(
                    sourceObj, targetObj, 0, 1, 0, 1
                );

                if (!this.isValidVector(connectionPoints.start) || !this.isValidVector(connectionPoints.end)) {
                    linkObj.visible = false; // Hide invalid links
                    return; // Skip to next link
                }

                // Create new curved path
                const curve = this.createCurvedLinePath(
                    connectionPoints.start,
                    connectionPoints.end
                );

                // Validate curve points before updating geometry
                if (curve && curve.length >= 2) {
                    linkObj.geometry.setFromPoints(curve);
                    linkObj.visible = true;
                } else {
                    linkObj.visible = false; // Hide invalid links
                }
            }
            // For arrow meshes, recreate with new position
            else if (linkObj.type === 'Mesh') {
                // This is the arrow - more complex to update, so we just hide during movements
                // and rely on the full update during animation frame
                linkObj.visible = false;
            }
        });
    }

    // Update label positions to follow nodes and face camera
    updateLabelPositions(labelSprites, nodeObjects, camera) {
        // Get camera position for label orientation
        const cameraPosition = camera.position.clone();

        labelSprites.forEach(({ sprite, nodeId }) => {
            const nodeObj = nodeObjects[nodeId];
            if (nodeObj) {
                // Position above node
                sprite.position.set(
                    nodeObj.position.x,
                    nodeObj.position.y + nodeObj.geometry.parameters.radius * 1.5,
                    nodeObj.position.z
                );

                // Make label face camera
                sprite.lookAt(cameraPosition);
            }
        });
    }

    // Apply layout to position nodes
    applyLayout(nodes, nodeObjects, links, config) {
        // Convert nodes object to array
        const nodeArray = Object.values(nodes);

        // Skip if no nodes
        if (nodeArray.length === 0) return;

        // Choose layout algorithm based on configuration
        if (config.useRadialLayout && config.centerNodeId) {
            this.applyRadialForceLayout(config.centerNodeId, nodes, nodeObjects, links, config.viewMode === '3d');
        } else {
            // Determine if we're using basic force layout or complex one
            const isSmallGraph = nodeArray.length <= 50;

            if (isSmallGraph) {
                this.applySimpleForceLayout(nodeArray, nodeObjects, config.viewMode === '3d');
            } else {
                this.applyOptimizedForceLayout(nodes, nodeObjects, links, config.viewMode === '3d');
            }
        }
    }

    // Apply optimized force layout for large graphs
    applyOptimizedForceLayout(nodes, nodeObjects, links, use3d = false) {
        const nodeArray = Object.values(nodes);

        // Initialize forces and positions
        nodeArray.forEach(node => {
            const obj = nodeObjects[node.id];
            if (!obj) return;

            node.x = obj.position.x;
            node.y = obj.position.y;
            node.z = use3d ? obj.position.z : 0;

            node.vx = 0; // Velocity X
            node.vy = 0; // Velocity Y
            node.vz = 0; // Velocity Z
        });

        // Create node lookup for quicker access
        const nodeMap = nodeArray.reduce((acc, node) => {
            acc[node.id] = node;
            return acc;
        }, {});

        // Convert links to array with actual node references
        const linksWithNodes = links.map(link => ({
            source: nodeMap[link.source],
            target: nodeMap[link.target]
        })).filter(link => link.source && link.target);

        // Physical constants
        const REPULSION = 300;     // Node repulsion force
        const LINK_DISTANCE = 50;  // Ideal link distance
        const LINK_STRENGTH = 0.7; // Link attraction strength
        const CENTER_GRAVITY = 0.05; // Gravity toward center
        const DAMPING = 0.9;       // Velocity damping

        // Run simulation
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            // Calculate forces
            this.calculateRepulsiveForces(nodeArray, REPULSION, use3d);
            this.calculateLinkForces(linksWithNodes, LINK_DISTANCE, LINK_STRENGTH, use3d);
            this.applyCenteringForce(nodeArray, CENTER_GRAVITY, use3d);

            // Apply forces with cooling
            const cooling = 1 - (i / iterations);
            this.updateNodePositions(nodeArray, cooling, DAMPING, use3d);
        }

        // Apply final positions to node objects
        nodeArray.forEach(node => {
            const obj = nodeObjects[node.id];
            if (obj) {
                obj.position.set(node.x, node.y, use3d ? node.z : 0);
            }
        });
    }

    // Calculate repulsive forces between nodes
    calculateRepulsiveForces(nodes, repulsion, use3d = false) {
        // Use grid optimization for many nodes
        if (nodes.length > 100) {
            // Implement grid-based optimization for large graphs
            this.calculateRepulsiveForcesGrid(nodes, repulsion, use3d);
        } else {
            // Simple O(n²) calculation for smaller graphs
            for (let i = 0; i < nodes.length; i++) {
                const nodeA = nodes[i];

                for (let j = i + 1; j < nodes.length; j++) {
                    const nodeB = nodes[j];

                    // Calculate distance
                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const dz = use3d ? nodeA.z - nodeB.z : 0;

                    const distanceSq = dx * dx + dy * dy + dz * dz;
                    if (distanceSq === 0) continue;

                    // Calculate force (inverse square law)
                    const distance = Math.sqrt(distanceSq);
                    const force = repulsion / distanceSq;

                    // Apply force to both nodes
                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    const fz = use3d ? (dz / distance) * force : 0;

                    // Apply to node velocities
                    nodeA.vx += fx;
                    nodeA.vy += fy;
                    nodeA.vz += fz;

                    nodeB.vx -= fx;
                    nodeB.vy -= fy;
                    nodeB.vz -= fz;
                }
            }
        }
    }

    // Grid-based optimization for repulsive forces in large graphs
    calculateRepulsiveForcesGrid(nodes, repulsion, use3d = false) {
        // Implement grid-based calculation (Barnes-Hut or similar)
        // This is a placeholder for the actual implementation
        console.log('Using grid-based force calculation for', nodes.length, 'nodes');

        // For now, fallback to simple calculation with reduced complexity
        // Only calculate forces for nearby nodes using spatial partitioning

        // Simple implementation using random sampling for very large graphs
        if (nodes.length > 500) {
            // For each node, only calculate against a subset of other nodes
            for (let i = 0; i < nodes.length; i++) {
                const nodeA = nodes[i];

                // Select a random subset of nodes to compute forces against
                const sampleSize = Math.min(50, nodes.length - 1);
                const indices = new Set();

                while (indices.size < sampleSize) {
                    const idx = Math.floor(Math.random() * nodes.length);
                    if (idx !== i) indices.add(idx);
                }

                // Calculate forces only against sampled nodes
                indices.forEach(j => {
                    const nodeB = nodes[j];

                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const dz = use3d ? nodeA.z - nodeB.z : 0;

                    const distanceSq = dx * dx + dy * dy + dz * dz;
                    if (distanceSq === 0) return;

                    const distance = Math.sqrt(distanceSq);
                    const force = repulsion / distanceSq;

                    const fx = (dx / distance) * force;
                    const fy = (dy / distance) * force;
                    const fz = use3d ? (dz / distance) * force : 0;

                    nodeA.vx += fx;
                    nodeA.vy += fy;
                    nodeA.vz += fz;
                });
            }
        } else {
            // Default back to O(n²) for medium-sized graphs
            this.calculateRepulsiveForces(nodes, repulsion, use3d);
        }
    }

    // Calculate link forces
    calculateLinkForces(links, idealDistance, strength, use3d = false) {
        links.forEach(link => {
            const source = link.source;
            const target = link.target;

            // Calculate distance
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dz = use3d ? target.z - source.z : 0;

            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

            // Calculate force (spring-like)
            const force = strength * (distance - idealDistance) / distance;

            // Apply force
            const fx = dx * force;
            const fy = dy * force;
            const fz = use3d ? dz * force : 0;

            // Apply to velocities
            source.vx += fx;
            source.vy += fy;
            source.vz += fz;

            target.vx -= fx;
            target.vy -= fy;
            target.vz -= fz;
        });
    }

    // Apply centering force to keep graph centered
    applyCenteringForce(nodes, gravity, use3d = false) {
        nodes.forEach(node => {
            node.vx -= node.x * gravity;
            node.vy -= node.y * gravity;
            if (use3d) node.vz -= node.z * gravity;
        });
    }

    // Update node positions based on velocities
    updateNodePositions(nodes, cooling, damping, use3d = false) {
        nodes.forEach(node => {
            // Apply damping to velocity
            node.vx *= damping;
            node.vy *= damping;
            if (use3d) node.vz *= damping;

            // Update position with cooling factor
            node.x += node.vx * cooling;
            node.y += node.vy * cooling;
            if (use3d) node.z += node.vz * cooling;
        });
    }

    // Apply radial force layout around a center node
    applyRadialForceLayout(centerNodeId, nodes, nodeObjects, links, use3D = false) {
        // Skip if no nodes
        if (Object.keys(nodes).length === 0) return;

        // Start with current positions
        Object.entries(nodes).forEach(([id, node]) => {
            const obj = nodeObjects[id];
            if (!obj) return;

            node.x = obj.position.x;
            node.y = obj.position.y;
            node.z = use3D ? obj.position.z : 0;

            // Initialize forces
            node.forceX = 0;
            node.forceY = 0;
            node.forceZ = 0;
        });

        // Apply radial layout forces
        const iterations = 50;
        const repulsionForce = 600;
        const centralAttractionForce = 0.3;

        for (let i = 0; i < iterations; i++) {
            // Calculate repulsion forces between all nodes
            Object.entries(nodes).forEach(([idA, nodeA]) => {
                if (idA === centerNodeId) return; // Skip center node for repulsion

                Object.entries(nodes).forEach(([idB, nodeB]) => {
                    if (idA === idB) return;
                    if (idB === centerNodeId) return; // Skip center node for repulsion

                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const dz = use3D ? nodeA.z - nodeB.z : 0;

                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                    const force = repulsionForce / (distance * distance);

                    nodeA.forceX += (dx / distance) * force;
                    nodeA.forceY += (dy / distance) * force;
                    if (use3D) nodeA.forceZ += (dz / distance) * force;
                });

                // Add central attraction to center node
                const centerNode = nodes[centerNodeId];
                const dx = nodeA.x - centerNode.x;
                const dy = nodeA.y - centerNode.y;
                const dz = use3D ? nodeA.z - centerNode.z : 0;

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                // Stronger attraction to center
                nodeA.forceX -= dx * centralAttractionForce;
                nodeA.forceY -= dy * centralAttractionForce;
                if (use3D) nodeA.forceZ -= dz * centralAttractionForce;
            });

            // Apply link-based forces
            links.forEach(link => {
                if (link.source === centerNodeId && nodeObjects[link.target]) {
                    // Apply weaker force from center to connected nodes to create a nice radial layout
                    const targetNode = nodes[link.target];
                    const centerNode = nodes[centerNodeId];

                    const dx = targetNode.x - centerNode.x;
                    const dy = targetNode.y - centerNode.y;
                    const dz = use3D ? targetNode.z - centerNode.z : 0;

                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                    // Only apply if too close or too far
                    if (distance < 50 || distance > 150) {
                        const idealDistance = 100;
                        const force = (distance - idealDistance) * 0.03;

                        targetNode.forceX -= (dx / distance) * force;
                        targetNode.forceY -= (dy / distance) * force;
                        if (use3D) targetNode.forceZ -= (dz / distance) * force;
                    }
                }
            });

            // Apply forces
            const cooling = 1 - (i / iterations);
            Object.entries(nodes).forEach(([id, node]) => {
                if (id === centerNodeId) return; // Keep center node fixed

                node.x += node.forceX * cooling;
                node.y += node.forceY * cooling;
                if (use3D) node.z += node.forceZ * cooling;

                // Update node object position
                if (nodeObjects[id]) {
                    nodeObjects[id].position.set(
                        node.x,
                        node.y,
                        use3D ? node.z : 0
                    );
                }

                // Clear forces for next iteration
                node.forceX = 0;
                node.forceY = 0;
                node.forceZ = 0;
            });
        }
    }

    // Apply simple force layout for small graphs
    applySimpleForceLayout(nodes, nodeObjects, use3D = false) {
        // Skip if no nodes
        if (nodes.length === 0) return;

        // Start with current positions
        nodes.forEach(node => {
            const obj = nodeObjects[node.id];
            if (!obj) return;

            node.x = obj.position.x;
            node.y = obj.position.y;
            node.z = use3D ? obj.position.z : 0;

            // Initialize forces
            node.forceX = 0;
            node.forceY = 0;
            node.forceZ = 0;
        });

        // Apply simple repulsion forces for a circular layout
        const iterations = 50;
        const repulsionForce = 800;

        for (let i = 0; i < iterations; i++) {
            // Calculate repulsion forces
            nodes.forEach(nodeA => {
                nodes.forEach(nodeB => {
                    if (nodeA.id === nodeB.id) return;

                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const dz = use3D ? nodeA.z - nodeB.z : 0;

                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                    const force = repulsionForce / (distance * distance);

                    nodeA.forceX += (dx / distance) * force;
                    nodeA.forceY += (dy / distance) * force;
                    if (use3D) nodeA.forceZ += (dz / distance) * force;
                });

                // Add a centering force
                const centeringForce = 0.05;
                nodeA.forceX -= nodeA.x * centeringForce;
                nodeA.forceY -= nodeA.y * centeringForce;
                if (use3D) nodeA.forceZ -= nodeA.z * centeringForce;
            });

            // Apply forces
            const cooling = 1 - (i / iterations);
            nodes.forEach(node => {
                node.x += node.forceX * cooling;
                node.y += node.forceY * cooling;
                if (use3D) node.z += node.forceZ * cooling;

                // Update node object position
                if (nodeObjects[node.id]) {
                    nodeObjects[node.id].position.set(
                        node.x,
                        node.y,
                        use3D ? node.z : 0
                    );
                }

                // Clear forces for next iteration
                node.forceX = 0;
                node.forceY = 0;
                node.forceZ = 0;
            });
        }
    }

    // Get connection points on node surfaces for links
    getConnectionPoints(sourceObj, targetObj, sourceIndex, sourceCount, targetIndex, targetCount) {
        // Get positions and sizes
        const sourcePos = sourceObj.position.clone();
        const targetPos = targetObj.position.clone();

        const distance = sourcePos.distanceTo(targetPos);
        if (distance < 0.001) {
            // Nodes are too close, return default points to avoid NaN
            return {
                start: sourcePos.clone().add(new THREE.Vector3(0, 1, 0)),
                end: targetPos.clone().add(new THREE.Vector3(0, -1, 0))
            };
        }


        // Get radii (using scale to account for node size changes)
        const sourceRadius = sourceObj.geometry.parameters.radius * sourceObj.scale.x;
        const targetRadius = targetObj.geometry.parameters.radius * targetObj.scale.x;

        // CORRECT DIRECTION: In our data structure, source depends on target
        // So arrows should go FROM target TO source to show "target is a dependency of source"
        // Then proceed with direction calculation
        const dirVector = this.normalizeVectorSafe(
            new THREE.Vector3().subVectors(targetPos, sourcePos)
        );

        // Create perpendicular vector for distribution around node
        const perpVector = new THREE.Vector3(-dirVector.y, dirVector.x, 0).normalize();

        // Calculate offset angles based on distribution
        let sourceAngleOffset = 0;
        let targetAngleOffset = 0;

        if (sourceCount > 1) {
            // Distribute outgoing connections within a 120 degree arc
            const angleRange = Math.PI * 2 / 3;
            sourceAngleOffset = (sourceIndex / (sourceCount - 1) - 0.5) * angleRange;
        }

        if (targetCount > 1) {
            // Distribute incoming connections within a 120 degree arc
            const angleRange = Math.PI * 2 / 3;
            targetAngleOffset = (targetIndex / (targetCount - 1) - 0.5) * angleRange;
        }

        // Apply rotation to distribution vectors
        const sourceOffsetVector = new THREE.Vector3();
        const targetOffsetVector = new THREE.Vector3();

        if (this.viewMode === '2d') {
            // 2D offset calculation - rotate in XY plane
            const sourceRotMatrix = new THREE.Matrix4().makeRotationZ(sourceAngleOffset);
            const targetRotMatrix = new THREE.Matrix4().makeRotationZ(targetAngleOffset);

            // CORRECT DIRECTION: We negate dirVector for targetOffsetVector and use regular dirVector for sourceOffsetVector
            // This ensures the arrow points FROM dependency TO dependent
            sourceOffsetVector.copy(dirVector).applyMatrix4(sourceRotMatrix);
            targetOffsetVector.copy(dirVector.clone().negate()).applyMatrix4(targetRotMatrix);
        } else {
            // 3D offset calculation - more complex rotation
            const sourceRotAxis = new THREE.Vector3(0, 0, 1); // Z axis for 3D rotation
            const targetRotAxis = new THREE.Vector3(0, 0, 1);

            // CORRECT DIRECTION: Same as 2D case
            sourceOffsetVector.copy(dirVector).applyAxisAngle(sourceRotAxis, sourceAngleOffset);
            targetOffsetVector.copy(dirVector.clone().negate()).applyAxisAngle(targetRotAxis, targetAngleOffset);
        }

        // Calculate actual surface points
        const start = sourcePos.clone().add(sourceOffsetVector.multiplyScalar(sourceRadius * 1.02)); // 1.02 to start slightly outside
        const end = targetPos.clone().add(targetOffsetVector.multiplyScalar(targetRadius * 1.02)); // 1.02 to end slightly outside

        return { start, end };
    }

    // Create curved path between nodes
    createCurvedLinePath(start, end, viewMode = '2d') {
        // Create a curved line between points - different for 2D and 3D
        if (viewMode === '2d') {
            // In 2D mode, create a more elegant curved line in the xy plane
            const midPoint = new THREE.Vector3(
                (start.x + end.x) / 2,
                (start.y + end.y) / 2,
                0
            );

            // Add a slight offset to create a curve
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Adaptive curve height - smaller curves for shorter distances
            // This creates more visually pleasing curves that don't overlap as much
            const curveHeight = Math.min(distance * 0.15, 15);

            // Create perpendicular offset
            const norm = new THREE.Vector3(-dy, dx, 0).normalize();
            midPoint.add(norm.multiplyScalar(curveHeight));

            // Create quadratic bezier curve with more points for smoother curves
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(start.x, start.y, 0),
                midPoint,
                new THREE.Vector3(end.x, end.y, 0)
            );

            return curve.getPoints(25); // More points for smoother curve
        } else {
            // In 3D mode, create an elegant curved line in 3D space
            const midPoint = new THREE.Vector3(
                (start.x + end.x) / 2,
                (start.y + end.y) / 2,
                (start.z + end.z) / 2
            );

            // Add a slight offset to create a curve
            const distance = start.distanceTo(end);
            // Adaptive curve height
            const curveHeight = Math.min(distance * 0.1, 20);

            // Direction perpendicular to the line
            const dir = new THREE.Vector3().subVectors(end, start);
            const norm = new THREE.Vector3(-dir.y, dir.x, 0).normalize();

            midPoint.add(norm.multiplyScalar(curveHeight));

            // Create quadratic bezier curve with more points for smoother lines
            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(start.x, start.y, start.z),
                midPoint,
                new THREE.Vector3(end.x, end.y, end.z)
            );

            return curve.getPoints(25); // More points for smoother curve
        }
    }

    // Create the dependencies panel visualization (left panel)
    createDependenciesPanel(fileId) {
        const container = document.getElementById('dependencies-panel-viz');

        if (!container) {
            console.error('Dependencies panel visualization container not found');
            return;
        }

        try {
            // Add loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'panel-loading';
            loadingDiv.innerHTML = '<div class="panel-loading-spinner"></div>';
            container.appendChild(loadingDiv);

            // Get dependencies of this file
            const dependencies = this.dependencies[fileId] || [];

            // Check for empty state
            if (dependencies.length === 0) {
                // Remove loading indicator
                loadingDiv.remove();

                // Show empty state
                this.showEmptyState(container, 'dependencies', 'This file does not import any other files or libraries.');
                return;
            }

            // Remove loading indicator
            loadingDiv.remove();

            // Create visualization using the unified engine
            const visualization = this.createVisualization(container, null, {
                isPanelVisualization: true,
                panelType: 'dependencies',
                currentFileId: fileId,
                useRadialLayout: true,
                centerNodeId: fileId,
                viewMode: '2d',
                showLabels: true,

                // Handle node click to navigate to dependency
                onNodeClick: (nodeData) => {
                    // Skip the center node (current file)
                    if (nodeData.isCenter) return;

                    // Skip library nodes
                    if (nodeData.id.startsWith('library:')) {
                        this.showTooltip('Cannot navigate to external library', {
                            x: window.innerWidth / 2,
                            y: window.innerHeight / 2
                        }, 1500);
                        return;
                    }

                    // Show info toast
                    this.showTooltip(`Navigating to ${nodeData.name}...`, {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 1500);

                    // Close current panels and open new ones for this dependency file
                    setTimeout(() => {
                        this.closeMultiPanelView();
                        this.showMultiPanelView(nodeData.id);
                    }, 300);
                }
            });

            // Store panel data for later reference
            if (visualization) {
                this.panels.dependencies = visualization;
            }

        } catch (error) {
            console.error('Error creating dependencies panel:', error);

            // Show error state
            container.innerHTML = '';
            this.showEmptyState(container, 'dependencies', 'Error creating dependencies visualization.');
        }
    }

    // Create the methods panel visualization (center panel)
    createMethodsPanel(fileId) {
        const container = document.getElementById('methods-panel-viz');

        if (!container) {
            console.error('Methods panel visualization container not found');
            return;
        }

        try {
            // Add loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'panel-loading';
            loadingDiv.innerHTML = '<div class="panel-loading-spinner"></div>';
            container.appendChild(loadingDiv);

            // Get methods for this file
            const fileMethods = this.methodData[fileId]?.methods || [];

            // Check for empty state
            if (fileMethods.length === 0) {
                // Remove loading indicator
                loadingDiv.remove();

                // Show empty state
                this.showEmptyState(container, 'methods', 'No methods found in this file.');
                return;
            }

            // Remove loading indicator
            loadingDiv.remove();

            // Create visualization using the unified engine
            const visualization = this.createVisualization(container, null, {
                isPanelVisualization: true,
                panelType: 'methods',
                currentFileId: fileId,
                viewMode: '2d',
                showLabels: true,

                // Method panel always uses standard force layout (not radial)
                useRadialLayout: false,

                // Handle node click to show method details
                onNodeClick: (nodeData) => {
                    // Show detail panel with method information
                    this.showTooltip(`Method: ${nodeData.name}`, {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 1500);

                    // Future enhancement: show method details in sidebar
                }
            });

            // Store panel data for later reference
            if (visualization) {
                this.panels.methods = visualization;
            }

        } catch (error) {
            console.error('Error creating methods panel:', error);

            // Show error state
            container.innerHTML = '';
            this.showEmptyState(container, 'methods', 'Error creating methods visualization.');
        }
    }

    // Create the dependents panel visualization (right panel)
    createDependentsPanel(fileId) {
        const container = document.getElementById('dependents-panel-viz');

        if (!container) {
            console.error('Dependents panel visualization container not found');
            return;
        }

        try {
            // Add loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'panel-loading';
            loadingDiv.innerHTML = '<div class="panel-loading-spinner"></div>';
            container.appendChild(loadingDiv);

            // Get dependents of this file (files that import it)
            const dependents = this.dependents[fileId] || [];

            // Check for empty state
            if (dependents.length === 0) {
                // Remove loading indicator
                loadingDiv.remove();

                // Show empty state
                this.showEmptyState(container, 'dependents', 'No other files import this file.');
                return;
            }

            // Remove loading indicator
            loadingDiv.remove();

            // Create visualization using the unified engine
            const visualization = this.createVisualization(container, null, {
                isPanelVisualization: true,
                panelType: 'dependents',
                currentFileId: fileId,
                viewMode: '2d',
                showLabels: true,

                // Dependents panel uses standard force layout, not radial
                useRadialLayout: false,

                // Handle node click to navigate to dependent
                onNodeClick: (nodeData) => {
                    // Show info toast
                    this.showTooltip(`Navigating to ${nodeData.name}...`, {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 1500);

                    // Close current panels and open new ones for this dependent file
                    setTimeout(() => {
                        this.closeMultiPanelView();
                        this.showMultiPanelView(nodeData.id);
                    }, 300);
                }
            });

            // Store panel data for later reference
            if (visualization) {
                this.panels.dependents = visualization;
            }

        } catch (error) {
            console.error('Error creating dependents panel:', error);

            // Show error state
            container.innerHTML = '';
            this.showEmptyState(container, 'dependents', 'Error creating dependents visualization.');
        }
    }

    // Create right sidebar with file information
    createSidebar(fileId) {
        const sidebarContainer = document.createElement('div');
        sidebarContainer.id = 'file-info-sidebar';
        sidebarContainer.className = 'file-info-sidebar collapsed'; // Start collapsed by default

        const fileNode = this.nodes[fileId];
        const fileMethods = this.methodData[fileId]?.methods || [];

        // Calculate complexity score (simple metric based on method count and dependencies)
        const complexity = Math.min(10, Math.ceil((fileMethods.length + (this.dependencies[fileId]?.length || 0)) / 3));

        sidebarContainer.innerHTML = `
          <div class="sidebar-header">
            <h3>File Information</h3>
            <button id="toggle-sidebar" class="btn btn-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 9l-7 7-7-7"></path>
              </svg>
              <span class="toggle-text">Show</span>
            </button>
          </div>
          <div class="sidebar-content">
            <div class="info-section">
              <h4>Basic Information</h4>
              <div class="info-item">
                <span class="info-item-label">File Name</span>
                <span class="info-item-value">${fileNode.name}</span>
              </div>
              <div class="info-item">
                <span class="info-item-label">Path</span>
                <span class="info-item-value" style="word-break: break-all;">${fileNode.path}</span>
              </div>
              <div class="info-item">
                <span class="info-item-label">Type</span>
                <span class="info-item-value">
                  <span class="badge badge-primary">${fileNode.type}</span>
                </span>
              </div>
              <div class="info-item">
                <span class="info-item-label">Size</span>
                <span class="info-item-value">${Math.round(fileNode.size)} bytes</span>
              </div>
            </div>
            
            <div class="info-section">
              <h4>Dependencies</h4>
              <div class="info-item">
                <span class="info-item-label">Import Count</span>
                <span class="info-item-value">${this.dependencies[fileId]?.length || 0}</span>
              </div>
              <div class="info-item">
                <span class="info-item-label">Imported By</span>
                <span class="info-item-value">${this.dependents[fileId]?.length || 0} files</span>
              </div>
            </div>
            
            <div class="info-section">
              <h4>Methods</h4>
              <div class="info-item">
                <span class="info-item-label">Method Count</span>
                <span class="info-item-value">${fileMethods.length}</span>
              </div>
              <div class="info-item">
                <span class="info-item-label">Complexity Score</span>
                <span class="info-item-value">
                  <div class="complexity-bar">
                    ${Array(10).fill(0).map((_, i) => `
                      <div class="complexity-segment ${i < complexity ? 'filled' : ''}"></div>
                    `).join('')}
                  </div>
                  <span>${complexity}/10</span>
                </span>
              </div>
            </div>
            
            <div class="info-section">
              <h4>Quick Actions</h4>
              <div class="action-buttons">
                <button id="pin-file" class="btn btn-outline">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L12 22"></path>
                    <path d="M5 12H19"></path>
                  </svg>
                  Pin File
                </button>
                <button id="copy-path" class="btn btn-outline">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H16C17.1046 21 18 20.1046 18 19V7C18 5.89543 17.1046 5 16 5H14"></path>
                    <path d="M12 12H16V16H12V12Z"></path>
                    <path d="M12 4H20V8H12V4Z"></path>
                  </svg>
                  Copy Path
                </button>
              </div>
            </div>
          </div>
        `;

        // Add to document
        document.getElementById('visualization-container').appendChild(sidebarContainer);

        // Set up toggle button with improved functionality
        const toggleButton = document.getElementById('toggle-sidebar');
        const toggleText = toggleButton.querySelector('.toggle-text');

        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                // Get the sidebar element and panels container
                const sidebar = document.getElementById('file-info-sidebar');
                const panelsContainer = document.querySelector('.panels-container');

                if (!sidebar || !panelsContainer) return;

                // Toggle collapsed state
                sidebar.classList.toggle('collapsed');

                // Update button text
                if (sidebar.classList.contains('collapsed')) {
                    toggleText.textContent = 'Show';
                    panelsContainer.style.marginRight = '0';

                    // Show a notification
                    this.showTooltip('Sidebar hidden', {
                        x: window.innerWidth - 100,
                        y: 50
                    }, 1500);
                } else {
                    toggleText.textContent = 'Hide';
                    panelsContainer.style.marginRight = '300px';

                    // Show a notification
                    this.showTooltip('Sidebar visible', {
                        x: window.innerWidth - 100,
                        y: 50
                    }, 1500);
                }

                // Trigger resize event to update panels
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                }, 300); // Delay to allow CSS transition to complete
            });
        }

        // Set up copy path button
        document.getElementById('copy-path').addEventListener('click', () => {
            navigator.clipboard.writeText(fileNode.path)
                .then(() => {
                    this.showTooltip('Path copied to clipboard', {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 2000);
                })
                .catch(err => {
                    console.error('Could not copy path: ', err);
                });
        });

        // Store sidebar reference
        this.sidebar = {
            element: sidebarContainer,
            visible: false // Start with sidebar hidden
        };
    }

    // Show empty state in panel
    showEmptyState(container, type, message) {
        console.log(`Showing empty state in ${type} panel`);

        let icon, title;

        // Different empty state by panel type
        switch (type) {
            case 'dependencies':
                icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>`;
                title = "No Dependencies";
                break;
            case 'methods':
                icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>`;
                title = "No Methods Found";
                break;
            case 'dependents':
                icon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>`;
                title = "No Dependents";
                break;
        }

        // Create empty state element
        const emptyStateDiv = document.createElement('div');
        emptyStateDiv.className = 'panel-empty-state';
        emptyStateDiv.innerHTML = `
            ${icon}
            <h4>${title}</h4>
            <p>${message || 'No data to display in this panel.'}</p>
        `;

        // Clear container and add empty state
        container.innerHTML = '';
        container.appendChild(emptyStateDiv);
    }

    // Create and show the multi-panel view
    showMultiPanelView(fileId) {
        console.log(`Opening multi-panel view for ${fileId}`);

        // Ensure the node exists in our data
        if (!this.nodes[fileId]) {
            console.error(`Cannot show multi-panel view - node ${fileId} not found`);
            return;
        }

        try {
            // Store current file
            this.currentFile = fileId;
            this.isPanelMode = true;

            // Hide the main visualization
            this.hideMainVisualization();

            // Create panel container
            const panelContainer = document.createElement('div');
            panelContainer.id = 'multi-panel-container';
            panelContainer.className = 'multi-panel-container';

            // Create panels HTML structure with file name in header
            panelContainer.innerHTML = `
            <div class="panel-header">
              <h2>
                ${this.nodes[fileId].name}
                <span class="file-type-badge ${this.nodes[fileId].type.substring(1)}">${this.nodes[fileId].type}</span>
              </h2>
              <button id="back-to-graph" class="btn btn-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back to Graph
              </button>
            </div>
            <div class="panels-container">
              <div id="dependencies-panel" class="panel left-panel">
                <div class="panel-title">
                  <h3>Dependencies</h3>
                  <div class="panel-controls">
                    <button class="view-toggle" data-panel="dependencies-panel">
                      <span class="view-2d active">2D</span>
                      <span class="view-3d">3D</span>
                    </button>
                  </div>
                </div>
                <div class="panel-visualization" id="dependencies-panel-viz"></div>
              </div>
              <div class="resizer" id="left-resizer"></div>
              <div id="methods-panel" class="panel center-panel">
                <div class="panel-title">
                  <h3>Methods</h3>
                  <div class="panel-controls">
                    <button class="view-toggle" data-panel="methods-panel">
                      <span class="view-2d active">2D</span>
                      <span class="view-3d">3D</span>
                    </button>
                  </div>
                </div>
                <div class="panel-visualization" id="methods-panel-viz"></div>
              </div>
              <div class="resizer" id="right-resizer"></div>
              <div id="dependents-panel" class="panel right-panel">
                <div class="panel-title">
                  <h3>Dependents</h3>
                  <div class="panel-controls">
                    <button class="view-toggle" data-panel="dependents-panel">
                      <span class="view-2d active">2D</span>
                      <span class="view-3d">3D</span>
                    </button>
                  </div>
                </div>
                <div class="panel-visualization" id="dependents-panel-viz"></div>
              </div>
            </div>
          `;

            // Add to document
            const container = document.getElementById('visualization-container');
            if (!container) {
                console.error('Visualization container not found');
                return;
            }

            container.appendChild(panelContainer);
            console.log('Panel container created and added to DOM');

            // Initially, don't set margin on panel container (sidebar will be collapsed)
            const panelsContainer = document.querySelector('.panels-container');
            if (panelsContainer) {
                panelsContainer.style.marginRight = '0';
            }

            // Hide any existing toggle buttons to avoid duplicates
            const existingToggleBtn = document.getElementById('super-toggle-btn');
            if (existingToggleBtn) {
                existingToggleBtn.style.display = 'none';
            }

            // Set up back button
            const backButton = document.getElementById('back-to-graph');
            if (backButton) {
                backButton.addEventListener('click', () => {
                    console.log('Back to graph button clicked');
                    this.closeMultiPanelView();
                });
            }

            // Set up resizable panels
            this.setupResizablePanels();

            // Use requestAnimationFrame to ensure DOM is fully rendered before creating visualizations
            requestAnimationFrame(() => {
                // Create individual panel visualizations with a small delay
                setTimeout(() => {
                    this.createDependenciesPanel(fileId);
                    this.createMethodsPanel(fileId);
                    this.createDependentsPanel(fileId);

                    // Set up right sidebar - starts collapsed
                    this.createSidebar(fileId);

                    // Show a welcome tooltip
                    this.showTooltip(`Click on any node to explore related files`, {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 3000);
                }, 100);
            });
        } catch (error) {
            console.error('Error showing multi-panel view:', error);
            // Reset state in case of error
            this.isPanelMode = false;

            // Show main visualization again
            this.showMainVisualization();

            // Show error message
            this.showTooltip(`Error showing file details: ${error.message}`, {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            }, 3000);
        }
    }

    // Close multi-panel view and return to main graph
    closeMultiPanelView() {
        // Remove panel container
        const panelContainer = document.getElementById('multi-panel-container');
        if (panelContainer) {
            panelContainer.remove();
        }

        // Remove sidebar
        const sidebar = document.getElementById('file-info-sidebar');
        if (sidebar) {
            sidebar.remove();
        }

        // Show main visualization
        this.showMainVisualization();

        // Reset panel mode flag
        this.isPanelMode = false;
        this.currentFile = null;

        // Clean up panel references
        Object.keys(this.panels).forEach(key => {
            if (this.panels[key]) {
                // Clean up Three.js resources
                if (this.panels[key].dispose) {
                    this.panels[key].dispose();
                }
                this.panels[key] = null;
            }
        });
    }

    // Build dependency data structures for improved filtering
    buildDependencyData(data) {
        const result = buildDependencyData(data);
        this.dependencies = result.dependencies;
        this.dependents = result.dependents;
    }

    // Process raw dependency data into node and link objects
    processData(data) {
        // Create nodes with better size scaling
        Object.keys(data.nodeInfo).forEach(path => {
            const nodeData = data.nodeInfo[path];

            // Calculate node size with more balanced scaling
            // Libraries slightly larger than files for better visual hierarchy
            const baseSize = path.startsWith('library:') ? 4.5 : 3.5;

            this.nodes[path] = {
                id: path,
                name: nodeData.name,
                type: nodeData.type,
                // Better size scaling that doesn't get too extreme with large files
                size: baseSize * (1 + Math.log(nodeData.size || 100) / Math.log(10000) * 0.5),
                path: nodeData.path,
                connections: 0
            };
        });

        // Create links and count connections
        Object.keys(data.dependencies).forEach(source => {
            const targets = data.dependencies[source];

            targets.forEach(target => {
                if (this.nodes[source] && this.nodes[target]) {
                    this.links.push({
                        source,
                        target
                    });

                    // Count connections for filtering
                    this.nodes[source].connections = (this.nodes[source].connections || 0) + 1;
                    this.nodes[target].connections = (this.nodes[target].connections || 0) + 1;
                }
            });
        });
    }

    // Apply filters to visualized nodes
    applyFilters(includeDependencies = false) {
        // Get filter values
        const fileTypeFilter = document.getElementById('file-type-filter')?.value || 'all';
        const libraryFilter = document.getElementById('library-filter')?.value || 'all';
        const filenameFilter = document.getElementById('filename-filter')?.value?.toLowerCase() || '';
        const dependencyFilterMode = document.getElementById('dependency-filter')?.value || 'none';

        // For dependency-aware filtering
        let nodesToInclude = new Set();
        let dependencyMode = includeDependencies ? dependencyFilterMode : 'none';

        // First pass: find nodes that match basic filters
        Object.values(this.nodes).forEach(node => {
            let visible = true;

            // Apply file type filter
            if (fileTypeFilter !== 'all') {
                if (node.path.startsWith('library:')) {
                    if (fileTypeFilter !== 'library') {
                        visible = false;
                    }
                } else if (node.type !== fileTypeFilter) {
                    visible = false;
                }
            }

            // Apply library filter
            if (libraryFilter !== 'all') {
                if (!node.path.includes(libraryFilter)) {
                    visible = false;
                }
            }

            // Apply filename filter
            if (filenameFilter && !node.name.toLowerCase().includes(filenameFilter)) {
                visible = false;
            }

            // For basic filtering or finding candidates for dependency filtering
            if (dependencyMode === 'none') {
                node.visible = visible;
            } else if (visible) {
                nodesToInclude.add(node.id);
            }
        });

        // Second pass: include dependencies if requested
        if (dependencyMode !== 'none' && nodesToInclude.size > 0) {
            // Reset all nodes to invisible first
            Object.values(this.nodes).forEach(node => {
                node.visible = false;
            });

            // Get full dependency chain based on filter mode
            const nodesToShow = getDependencyChain(
                Array.from(nodesToInclude),
                this.dependencies,
                this.dependents,
                dependencyMode
            );

            // Mark nodes to show as visible
            nodesToShow.forEach(nodeId => {
                if (this.nodes[nodeId]) {
                    this.nodes[nodeId].visible = true;
                }
            });

            console.log(`Showing ${nodesToShow.length} nodes with dependency mode: ${dependencyMode}`);
        } else if (filenameFilter) {
            // Find all nodes that match the filename filter
            const matchedNodes = Object.values(this.nodes).filter(node =>
                node.name.toLowerCase().includes(filenameFilter)
            );

            console.log(`Found ${matchedNodes.length} nodes matching "${filenameFilter}"`);

            // Find all connected nodes (both dependencies and dependents)
            const connectedNodeIds = new Set();
            matchedNodes.forEach(node => {
                // Always include the matched node
                connectedNodeIds.add(node.id);

                console.log(`Processing node: ${node.name} (${node.id})`);

                // Add direct dependencies (what this node imports)
                if (this.dependencies[node.id]) {
                    console.log(`  Dependencies (imports): ${this.dependencies[node.id].length}`);
                    this.dependencies[node.id].forEach(depId => {
                        connectedNodeIds.add(depId);
                        console.log(`    - ${depId}`);
                    });
                }

                // Add direct dependents (what imports this node)
                if (this.dependents[node.id]) {
                    console.log(`  Dependents (imported by): ${this.dependents[node.id].length}`);
                    this.dependents[node.id].forEach(depId => {
                        connectedNodeIds.add(depId);
                        console.log(`    - ${depId}`);
                    });
                }
            });

            console.log(`Showing ${connectedNodeIds.size} total connected nodes`);

            // Update visibility based on connected nodes
            Object.values(this.nodes).forEach(node => {
                node.visible = connectedNodeIds.has(node.id);
            });
        }

        // Recreate main visualization with filtered data
        if (this.mainVisualization) {
            // Clean up existing visualization
            this.mainVisualization.dispose();

            // Recreate with filtered nodes
            const container = document.getElementById('visualization-container');
            if (container) {
                this.mainVisualization = this.createVisualization(container, this.rawData, {
                    viewMode: this.viewMode,
                    showLabels: this.showLabels,

                    // Maintain same event handlers
                    onNodeClick: this.mainVisualization.onNodeClick,
                    onNodeHover: this.mainVisualization.onNodeHover
                });
            }
        }

        // Show confirmation
        this.showTooltip('Filters applied', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 1000);
    }

    // Update info panel with node details
    updateInfoPanel(nodeData) {
        // Check if panel exists
        if (!this.infoPanel) {
            this.infoPanel = document.getElementById('info-panel');
            if (!this.infoPanel) {
                console.debug('Info panel not found');
                return;
            }
        }

        const panelContent = document.getElementById('info-panel-content');
        const panelTitle = document.getElementById('info-panel-title');

        if (!panelContent || !panelTitle) {
            console.debug('Info panel components not found');
            return;
        }

        // Update content based on node type
        const isLibrary = nodeData.path.startsWith('library:');

        let content = '';

        if (isLibrary) {
            content = `
                <div class="info-item">
                    <span class="info-item-label">Library</span>
                    <span class="info-item-value">${nodeData.name}</span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Type</span>
                    <span class="info-item-value">
                        <span class="badge badge-primary">External Library</span>
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Connections</span>
                    <span class="info-item-value">${nodeData.connections}</span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Used By</span>
                    <span class="info-item-value">${this.getDependentCount(nodeData.id)} files</span>
                </div>
            `;
        } else {
            content = `
                <div class="info-item">
                    <span class="info-item-label">Filename</span>
                    <span class="info-item-value">${nodeData.name}</span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Path</span>
                    <span class="info-item-value" style="word-break: break-all;">${nodeData.path}</span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Type</span>
                    <span class="info-item-value">
                        <span class="badge badge-primary">${nodeData.type}</span>
                    </span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Imports</span>
                    <span class="info-item-value">${this.getDependencyCount(nodeData.id)} files/libraries</span>
                </div>
                <div class="info-item">
                    <span class="info-item-label">Imported By</span>
                    <span class="info-item-value">${this.getDependentCount(nodeData.id)} files</span>
                </div>
            `;
        }

        panelContent.innerHTML = content;
        panelTitle.textContent = isLibrary ? 'Library Details' : 'File Details';

        // Show panel
        this.infoPanel.classList.add('active');
    }

    // Get number of dependencies for a node
    getDependencyCount(nodeId) {
        return this.dependencies[nodeId] ? this.dependencies[nodeId].length : 0;
    }

    // Get number of dependents for a node
    getDependentCount(nodeId) {
        return this.dependents[nodeId] ? this.dependents[nodeId].length : 0;
    }

    // Set view mode (2D or 3D)
    setViewMode(mode) {
        // Check if mode is already active
        if (this.viewMode === mode) return;

        this.viewMode = mode;
        console.log(`Switching to ${mode} visualization mode`);

        // Update mode in main visualization
        if (this.mainVisualization && typeof this.mainVisualization.setViewMode === 'function') {
            this.mainVisualization.setViewMode(mode);
        }

        // Show tooltip indicating mode change
        this.showTooltip(`Switched to ${mode.toUpperCase()} visualization`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 2000);

        // Update view mode controls to match
        this.updateViewModeControls();
    }

    // Update view mode toggle to match current mode
    updateViewModeControls() {
        const view2d = document.getElementById('view-2d');
        const view3d = document.getElementById('view-3d');
        const connectionStyleToggle = document.getElementById('connection-style-toggle');

        if (view2d && view3d) {
            if (this.viewMode === '2d') {
                view2d.checked = true;
                view3d.checked = false;
            } else {
                view2d.checked = false;
                view3d.checked = true;
            }
        }

        // Maintain connection style selection
        if (connectionStyleToggle) {
            connectionStyleToggle.value = this.connectionStyle;
        }
    }

    // Reset camera to default position
    resetCamera() {
        if (this.mainVisualization && this.mainVisualization.controls) {
            // Reset controls
            this.mainVisualization.controls.reset();

            // Set default position
            this.mainVisualization.camera.position.set(0, 0, 1000);
            this.mainVisualization.camera.lookAt(0, 0, 0);

            // Update controls
            this.mainVisualization.controls.update();

            // Show confirmation
            this.showTooltip('Camera view has been reset', {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            }, 2000);
        }
    }

    // Toggle label visibility
    toggleLabels() {
        this.showLabels = !this.showLabels;

        // Recreate main visualization to update labels
        if (this.mainVisualization) {
            this.mainVisualization.dispose();

            const container = document.getElementById('visualization-container');
            if (container) {
                this.mainVisualization = this.createVisualization(container, this.rawData, {
                    viewMode: this.viewMode,
                    showLabels: this.showLabels,

                    // Maintain same event handlers
                    onNodeClick: this.mainVisualization.onNodeClick,
                    onNodeHover: this.mainVisualization.onNodeHover
                });
            }
        }

        // Show confirmation tooltip
        this.showTooltip(this.showLabels ? 'Labels turned on' : 'Labels turned off', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 2000);
    }

    // Handle window resize
    handleResize() {
        // Resize main visualization
        if (this.mainVisualization && this.mainVisualization.renderer) {
            const container = this.mainVisualization.renderer.domElement.parentElement;
            if (container) {
                const width = container.clientWidth;
                const height = container.clientHeight;

                if (this.mainVisualization.camera) {
                    if (this.mainVisualization.camera.isOrthographicCamera) {
                        const aspect = width / height;
                        const frustumSize = 1000;
                        this.mainVisualization.camera.left = frustumSize * aspect / -2;
                        this.mainVisualization.camera.right = frustumSize * aspect / 2;
                        this.mainVisualization.camera.top = frustumSize / 2;
                        this.mainVisualization.camera.bottom = frustumSize / -2;
                    } else {
                        this.mainVisualization.camera.aspect = width / height;
                    }

                    this.mainVisualization.camera.updateProjectionMatrix();
                    this.mainVisualization.renderer.setSize(width, height);
                }
            }
        }

        // Resize panel visualizations
        Object.values(this.panels).forEach(panel => {
            if (panel && panel.renderer && panel.camera) {
                const container = panel.renderer.domElement.parentElement;
                if (container) {
                    const width = container.clientWidth;
                    const height = container.clientHeight;

                    if (panel.camera.isOrthographicCamera) {
                        const aspect = width / height;
                        const frustumSize = 500;
                        panel.camera.left = frustumSize * aspect / -2;
                        panel.camera.right = frustumSize * aspect / 2;
                        panel.camera.top = frustumSize / 2;
                        panel.camera.bottom = frustumSize / -2;
                    } else {
                        panel.camera.aspect = width / height;
                    }

                    panel.camera.updateProjectionMatrix();
                    panel.renderer.setSize(width, height);
                }
            }
        });
    }

    // Set up resizable panels
    setupResizablePanels() {
        const leftResizer = document.getElementById('left-resizer');
        const rightResizer = document.getElementById('right-resizer');
        const panelsContainer = document.querySelector('.panels-container');

        if (!leftResizer || !rightResizer || !panelsContainer) {
            console.error('Resizer elements or panels container not found');
            return;
        }

        console.log('Setting up resizable panels');

        // Left resizer between dependencies and methods
        leftResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.addEventListener('mousemove', resizeLeft);
            document.addEventListener('mouseup', stopResize);

            // Add grabbing cursor to indicate resize is active
            document.body.style.cursor = 'col-resize';
            leftResizer.classList.add('active');
        });

        // Right resizer between methods and dependents
        rightResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.addEventListener('mousemove', resizeRight);
            document.addEventListener('mouseup', stopResize);

            // Add grabbing cursor to indicate resize is active
            document.body.style.cursor = 'col-resize';
            rightResizer.classList.add('active');
        });

        const resizeLeft = (e) => {
            const containerRect = panelsContainer.getBoundingClientRect();
            const x = e.clientX - containerRect.left;
            const containerWidth = containerRect.width;

            // Ensure minimum widths
            const minWidth = 100;
            const maxLeftWidth = containerWidth - minWidth * 2;

            // Calculate percentages with constraints
            let leftWidth = (x / containerWidth) * 100;
            leftWidth = Math.min(Math.max(leftWidth, 10), 80); // Keep between 10% and 80%

            const rightPanel = document.querySelector('.right-panel');
            const rightWidth = parseFloat(rightPanel.style.width || '33.33');

            const centerWidth = 100 - leftWidth - rightWidth;

            // Apply new widths
            document.querySelector('.left-panel').style.width = `${leftWidth}%`;
            document.querySelector('.center-panel').style.width = `${centerWidth}%`;

            // Trigger resize event for Three.js renderers
            window.dispatchEvent(new Event('resize'));
        };

        const resizeRight = (e) => {
            const containerRect = panelsContainer.getBoundingClientRect();
            const x = e.clientX - containerRect.left;
            const containerWidth = containerRect.width;

            // Calculate percentages based on right resizer position
            const rightWidth = 100 - ((x / containerWidth) * 100);

            // Ensure minimum widths
            const constrainedRightWidth = Math.min(Math.max(rightWidth, 10), 80);

            const leftPanel = document.querySelector('.left-panel');
            const leftWidth = parseFloat(leftPanel.style.width || '33.33');

            const centerWidth = 100 - leftWidth - constrainedRightWidth;

            // Apply new widths
            document.querySelector('.center-panel').style.width = `${centerWidth}%`;
            document.querySelector('.right-panel').style.width = `${constrainedRightWidth}%`;

            // Trigger resize event for Three.js renderers
            window.dispatchEvent(new Event('resize'));
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', resizeLeft);
            document.removeEventListener('mousemove', resizeRight);

            // Reset cursor
            document.body.style.cursor = '';
            leftResizer.classList.remove('active');
            rightResizer.classList.remove('active');

            // Final resize event for good measure
            window.dispatchEvent(new Event('resize'));
        };
    }

    // Handle mouse movement for hover effects
    onMouseMove(event) {
        // Skip if in panel mode
        if (this.isPanelMode) return;

        // Make sure we have all necessary components
        if (!this.mainVisualization || !this.mainVisualization.raycaster ||
            !this.mainVisualization.camera || !this.mainVisualization.nodeObjects ||
            Object.keys(this.mainVisualization.nodeObjects).length === 0) {
            return;
        }

        // Calculate mouse position in normalized device coordinates
        const mouse = this.mainVisualization.raycaster.mouse;
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        try {
            // Update picking ray
            this.mainVisualization.raycaster.setFromCamera(mouse, this.mainVisualization.camera);

            // Find intersections with nodes
            const nodeObjects = Object.values(this.mainVisualization.nodeObjects);
            const intersects = this.mainVisualization.raycaster.intersectObjects(nodeObjects);

            // Reset all highlights
            nodeObjects.forEach(node => {
                if (node !== this.hoveredObject) {
                    node.material.emissive.setHex(0x000000);
                }
            });

            this.mainVisualization.linkObjects.forEach(link => {
                if (link.material && link.material.opacity !== undefined) {
                    link.material.opacity = 0.3;
                }
            });

            // Handle hover state
            if (intersects.length > 0) {
                const object = intersects[0].object;

                if (this.hoveredObject !== object) {
                    // Reset previous hover
                    if (this.hoveredObject) {
                        this.hoveredObject.material.emissive.setHex(0x000000);
                    }

                    // Set new hover
                    this.hoveredObject = object;
                    this.hoveredObject.material.emissive.setHex(0x333333);

                    // Update info panel
                    if (this.mainVisualization.onNodeHover) {
                        this.mainVisualization.onNodeHover(object.userData);
                    }

                    // Highlight connections
                    this.highlightConnections(object.userData.id);
                }
            } else {
                // Reset hover if not hovering over any node
                if (this.hoveredObject && !this.selectedObject) {
                    this.hoveredObject.material.emissive.setHex(0x000000);
                    this.hoveredObject = null;

                    // Hide info panel
                    if (!this.selectedObject && this.infoPanel) {
                        this.infoPanel.classList.remove('active');
                    }

                    // Reset highlight
                    this.resetHighlights();
                }
            }
        } catch (error) {
            console.debug('Mouse move error:', error);
        }
    }

    // Highlight connections to a node
    highlightConnections(nodeId) {
        // Reset previous highlights
        this.resetHighlights();

        if (!this.mainVisualization || !this.mainVisualization.linkObjects) return;

        // Highlight links connected to this node
        this.mainVisualization.linkObjects.forEach(link => {
            // Skip non-link objects
            if (!link.userData || !link.userData.source || !link.userData.target) return;

            // Check if this link connects to the node
            if (link.userData.source === nodeId || link.userData.target === nodeId) {
                if (link.material) {
                    link.material.color.setHex(0x6366f1); // Primary color
                    const currentOpacity = link.material.opacity;
                    const highlightFactor = 2.5; // Increase visibility but respect user setting
                    link.material.opacity = Math.min(currentOpacity * highlightFactor, 1.0);
                }

                // Determine which node is connected
                let connectedNodeId;
                if (link.userData.source === nodeId) {
                    connectedNodeId = link.userData.target;
                } else {
                    connectedNodeId = link.userData.source;
                }

                // Highlight the connected node
                if (this.mainVisualization.nodeObjects[connectedNodeId]) {
                    this.mainVisualization.nodeObjects[connectedNodeId].material.emissive.setHex(0x333333);
                }
            }
        });
    }

    // Reset highlights to default state
    resetHighlights() {
        if (!this.mainVisualization) return;

        // Get current user-defined opacity
        const userOpacity = parseFloat(document.getElementById('link-opacity')?.value || 0.2);

        // Reset link highlights
        if (this.mainVisualization.linkObjects) {
            this.mainVisualization.linkObjects.forEach(link => {
                if (link.material) {
                    link.material.color.setHex(0x94a3b8);
                    link.material.opacity = userOpacity; // Use user-defined opacity
                }
            });
        }

        // Reset node highlights
        if (this.mainVisualization.nodeObjects) {
            Object.values(this.mainVisualization.nodeObjects).forEach(node => {
                if (node !== this.hoveredObject && node !== this.selectedObject) {
                    node.material.emissive.setHex(0x000000);
                }
            });
        }
    }

    // Populate filter dropdowns with data
    populateFilters(data) {
        // Populate file type filter
        const fileTypeFilter = document.getElementById('file-type-filter');
        if (fileTypeFilter) {
            fileTypeFilter.innerHTML = '<option value="all">All File Types</option>';
            if (data.fileTypes && data.fileTypes.length) {
                data.fileTypes.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.textContent = type;
                    fileTypeFilter.appendChild(option);
                });
                // Add option for libraries
                const option = document.createElement('option');
                option.value = 'library';
                option.textContent = 'Libraries';
                fileTypeFilter.appendChild(option);
            }
        }

        // Populate library filter
        const libraryFilter = document.getElementById('library-filter');
        if (libraryFilter) {
            libraryFilter.innerHTML = '<option value="all">All Libraries</option>';
            if (data.libraries && data.libraries.length) {
                data.libraries.forEach(lib => {
                    const option = document.createElement('option');
                    option.value = lib;
                    option.textContent = lib;
                    libraryFilter.appendChild(option);
                });
            }
        }
    }

    // Update project information
    updateProjectInfo(data) {
        // Count total files (exclude libraries)
        const totalFiles = Object.keys(data.nodeInfo).filter(path => !path.startsWith('library:')).length;
        const totalFilesElement = document.getElementById('total-files');
        if (totalFilesElement) {
            totalFilesElement.textContent = totalFiles;
        }

        // Count total libraries
        const totalLibraries = data.libraries ? data.libraries.length : 0;
        const totalLibrariesElement = document.getElementById('total-libraries');
        if (totalLibrariesElement) {
            totalLibrariesElement.textContent = totalLibraries;
        }

        // Count total dependencies
        let totalDependencies = 0;
        Object.keys(data.dependencies).forEach(source => {
            totalDependencies += data.dependencies[source].length;
        });

        const totalDependenciesElement = document.getElementById('total-dependencies');
        if (totalDependenciesElement) {
            totalDependenciesElement.textContent = totalDependencies;
        }
    }

    // Create tooltip element
    createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    // Show tooltip with message
    showTooltip(text, position, duration = 2000) {
        // Position tooltip
        this.tooltip.textContent = text;
        this.tooltip.style.left = `${position.x}px`;
        this.tooltip.style.top = `${position.y}px`;
        this.tooltip.classList.add('visible');

        // Hide after duration
        setTimeout(() => {
            this.tooltip.classList.remove('visible');
        }, duration);
    }

    // Method to setup search functionality
    setupSearchFunctionality() {
        const searchInput = document.getElementById('node-search');
        const searchButton = document.getElementById('search-button');

        if (!searchInput || !searchButton) return;

        // Search when Enter key is pressed
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchAndHighlightNode(searchInput.value);
            }
        });

        // Search when button is clicked
        searchButton.addEventListener('click', () => {
            this.searchAndHighlightNode(searchInput.value);
        });

        // Clear highlighted nodes when input is cleared
        searchInput.addEventListener('input', (e) => {
            if (e.target.value.trim() === '') {
                this.clearSearchHighlights();
            }
        });
    }

    // Method to search for and highlight nodes
    searchAndHighlightNode(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            this.clearSearchHighlights();
            return;
        }

        // First, clear any existing highlights
        this.clearSearchHighlights();

        // Keep track of found nodes
        const foundNodeIds = [];
        searchTerm = searchTerm.toLowerCase();

        // Find matching nodes
        Object.values(this.nodes).forEach(node => {
            if ((node.visible === undefined || node.visible) &&
                (node.name.toLowerCase().includes(searchTerm) ||
                    node.path.toLowerCase().includes(searchTerm))) {
                foundNodeIds.push(node.id);
            }
        });

        // Highlight the found nodes
        foundNodeIds.forEach(nodeId => {
            const nodeObj = this.mainVisualization?.nodeObjects[nodeId];
            if (nodeObj) {
                // Set a special material for highlighted nodes
                const originalMaterial = nodeObj.material;
                const highlightMaterial = originalMaterial.clone();
                highlightMaterial.emissive.setHex(0x6366F1); // Primary color
                highlightMaterial.emissiveIntensity = 0.7;

                // Store original material for later restoration
                nodeObj.userData.originalMaterial = originalMaterial;
                nodeObj.material = highlightMaterial;

                // Add to tracked highlights
                this.searchHighlightedNodes.push(nodeId);

                // Center the view on the first found node
                if (this.searchHighlightedNodes.length === 1) {
                    this.centerCameraOnNode(nodeObj);
                }
            }
        });

        // Show count in tooltip
        const count = foundNodeIds.length;
        this.showTooltip(`Found ${count} node${count !== 1 ? 's' : ''} matching "${searchTerm}"`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 2000);

        // If nothing found, show a different message
        if (count === 0) {
            this.showTooltip(`No nodes found matching "${searchTerm}"`, {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            }, 2000);
        }
    }

    // Method to clear search highlights
    clearSearchHighlights() {
        // Skip if main visualization is not available
        if (!this.mainVisualization) return;

        // Restore original materials for all highlighted nodes
        this.searchHighlightedNodes.forEach(nodeId => {
            const nodeObj = this.mainVisualization.nodeObjects[nodeId];
            if (nodeObj && nodeObj.userData.originalMaterial) {
                nodeObj.material = nodeObj.userData.originalMaterial;
                delete nodeObj.userData.originalMaterial;
            }
        });

        // Clear the tracking array
        this.searchHighlightedNodes = [];
    }

    // Method to center camera on a specific node
    centerCameraOnNode(nodeObj) {
        if (!this.mainVisualization || !this.mainVisualization.camera) return;

        // Get current camera position
        const currentPos = this.mainVisualization.camera.position.clone();

        // Calculate target position - keep Z the same but focus on the node's X, Y
        const targetPos = nodeObj.position.clone();
        targetPos.z = currentPos.z; // Keep the same distance

        // Store animation start values and time
        const startTime = Date.now();
        const duration = 800; // ms

        // Define animation function
        const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Smooth easing function
            const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            // Interpolate position
            const newPos = currentPos.clone().lerp(targetPos, ease);
            this.mainVisualization.camera.position.copy(newPos);

            // Continue animation if not finished
            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            } else {
                // Update controls
                if (this.mainVisualization.controls) {
                    this.mainVisualization.controls.target.set(targetPos.x, targetPos.y, 0);
                    this.mainVisualization.controls.update();
                }
            }
        };

        // Start animation
        animateCamera();
    }

    // Show main visualization (when exiting panel mode)
    showMainVisualization() {
        // Show the main visualization container
        const container = document.getElementById('visualization-container');
        if (container) {
            // Clear any panel-related elements
            const panelContainer = document.getElementById('multi-panel-container');
            if (panelContainer) {
                panelContainer.remove();
            }

            // Make sure renderer is visible
            if (this.mainVisualization && this.mainVisualization.renderer) {
                this.mainVisualization.renderer.domElement.style.display = '';
            }
        }

        // Show the super toggle button
        const toggleBtn = document.getElementById('super-toggle-btn');
        if (toggleBtn) {
            toggleBtn.style.display = '';
        }
    }

    // Hide main visualization (when entering panel mode)
    hideMainVisualization() {
        // Hide the main visualization rendering
        if (this.mainVisualization && this.mainVisualization.renderer) {
            this.mainVisualization.renderer.domElement.style.display = 'none';
        }

        // Hide toggle button
        const toggleBtn = document.getElementById('super-toggle-btn');
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
        }

        // Collapse sidebar
        document.getElementById('sidebar').classList.add('sidebar-collapsed');
    }

    // Add method to setup debug button
    setupDebugButton() {
        // Create a debug section in the sidebar
        const sidebarContent = document.querySelector('.sidebar-content');
        if (!sidebarContent) return;

        const debugSection = document.createElement('div');
        debugSection.className = 'sidebar-section';
        debugSection.innerHTML = `
        <h3>Debug Tools</h3>
        <div class="form-group">
            <input type="text" id="debug-node-name" class="form-control" placeholder="Node name (optional)">
        </div>
        <div class="form-group">
            <button id="debug-dependencies-btn" class="btn btn-outline btn-block">
                Debug Dependencies
            </button>
        </div>
        `;

        sidebarContent.appendChild(debugSection);

        // Add event listener
        const debugBtn = document.getElementById('debug-dependencies-btn');
        if (debugBtn) {
            debugBtn.addEventListener('click', () => {
                const nodeName = document.getElementById('debug-node-name')?.value || '';
                this.debugDependencies(nodeName);
            });
        }
    }

    // Debug method to analyze and log dependency relationships
    debugDependencies(nodeName) {
        console.log(`----- DEPENDENCY DEBUG: ${nodeName || 'All Nodes'} -----`);

        // Filter for specific node if name provided
        const nodesToAnalyze = nodeName
            ? Object.values(this.nodes).filter(n => n.name.toLowerCase().includes(nodeName.toLowerCase()))
            : Object.values(this.nodes);

        console.log(`Analyzing ${nodesToAnalyze.length} nodes...`);

        nodesToAnalyze.forEach(node => {
            console.log(`\nNode: ${node.name} (${node.id})`);

            // What this node imports
            const dependencies = this.dependencies[node.id] || [];
            console.log(`Imports (${dependencies.length}):`);
            dependencies.forEach(depId => {
                const depNode = this.nodes[depId];
                console.log(` - ${depNode ? depNode.name : depId}`);
            });

            // What imports this node
            const dependents = this.dependents[node.id] || [];
            console.log(`Imported by (${dependents.length}):`);
            dependents.forEach(depId => {
                const depNode = this.nodes[depId];
                console.log(` - ${depNode ? depNode.name : depId}`);
            });

            // Check if this node is visible in the current view
            console.log(`Visible: ${node.visible !== false ? 'Yes' : 'No'}`);
        });

        console.log(`----- END DEBUG -----`);

        // Also add a helpful message in the UI
        this.showTooltip('Dependency debug info logged to console', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 3000);
    }
    isValidVector(vector) {
        // Check if any component is NaN or Infinity
        return !(isNaN(vector.x) || isNaN(vector.y) || isNaN(vector.z) ||
            !isFinite(vector.x) || !isFinite(vector.y) || !isFinite(vector.z));
    }

    // Add this function to prevent zero-length vectors
    normalizeVectorSafe(vector) {
        const length = vector.length();

        // Avoid division by zero
        if (length < 0.00001) {
            // Return a default unit vector if the original is too small
            return new THREE.Vector3(1, 0, 0);
        }

        return vector.clone().divideScalar(length);
    }

}
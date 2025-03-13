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
                Object.values(this.nodeObjects).forEach(node => {
                    const scale = size / 5; // Normalize to default value of 5
                    node.scale.set(scale, scale, scale);
                });
            });
        }

        // Link opacity slider
        const linkOpacitySlider = document.getElementById('link-opacity');
        if (linkOpacitySlider) {
            linkOpacitySlider.addEventListener('input', (e) => {
                const opacity = parseFloat(e.target.value);
                this.linkObjects.forEach(link => {
                    link.material.opacity = opacity;
                });
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
                // Rebuild the graph to update links with/without arrows.
                this.clearGraph();
                this.createGraph();
                // Optionally, show a tooltip to confirm the change:
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
                // Keep this for future extensibility
                this.clearGraph();
                this.createGraph();
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

        // Initialize Three.js
        this.initThree();

        // Process the dependency data
        this.processData(data);

        // Create the graph visualization
        this.createGraph();

        // Mark as initialized
        this.initialized = true;

        // Start animation loop
        this.animate();

        // Populate filter dropdowns
        this.populateFilters(data);

        // Update project info
        this.updateProjectInfo(data);

        // Set up handlers for file node clicks - do this last
        this.setupNodeClickHandler();

        // Add initial hint
        this.showTooltip(`${this.viewMode === '2d' ? '2D' : '3D'} visualization loaded. Hover over nodes to see details.`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 3000);

        // Make sure 2D/3D toggle reflects correct mode
        this.updateViewModeControls();
    }

    // Add handler for node clicks to transition to multi-panel view
    setupNodeClickHandler() {
        // Use direct binding to the renderer's canvas element instead of window
        if (!this.renderer || !this.renderer.domElement) {
            console.error('Cannot setup node click handler - renderer not initialized');
            return;
        }

        console.log('Setting up node click handler on canvas');

        // Add click handler directly to the canvas for better precision
        this.renderer.domElement.addEventListener('click', (event) => {
            console.log('Canvas click detected');

            // Early return checks
            if (!this.initialized) {
                console.log('Click ignored - visualizer not fully initialized');
                return;
            }

            if (!this.camera) {
                console.log('Click ignored - camera not available');
                return;
            }

            if (this.isPanelMode) {
                console.log('Click ignored - already in panel mode');
                return;
            }

            // Get canvas-relative mouse coordinates
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            console.log('Mouse position (normalized):', this.mouse.x, this.mouse.y);

            // Update raycaster
            this.raycaster.setFromCamera(this.mouse, this.camera);

            // Check for node objects available for intersection
            const nodeObjectValues = Object.values(this.nodeObjects);
            console.log('Number of node objects available:', nodeObjectValues.length);

            // Find intersections with nodes
            const intersects = this.raycaster.intersectObjects(nodeObjectValues);
            console.log('Intersections found:', intersects.length);

            if (intersects.length > 0) {
                const clickedObject = intersects[0].object;
                console.log('Clicked object:', clickedObject.userData);

                // Safety check for valid userData
                if (!clickedObject.userData || !clickedObject.userData.id) {
                    console.error('Clicked object has invalid userData');
                    return;
                }

                const nodeData = clickedObject.userData;

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
            }
        });
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

    // 2. Implement the missing showMainVisualization method
    showMainVisualization() {
        // Show the Three.js canvas
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.style.display = '';
        }

        // Show controls/UI
        const toggleBtn = document.getElementById('super-toggle-btn');
        if (toggleBtn) {
            toggleBtn.style.display = '';
        }
    }

    // Hide main visualization
    hideMainVisualization() {
        // Hide the Three.js canvas temporarily
        if (this.renderer && this.renderer.domElement) {
            this.renderer.domElement.style.display = 'none';
        }

        // Hide controls/UI that aren't needed in panel mode
        document.getElementById('sidebar').classList.add('sidebar-collapsed');

        const toggleBtn = document.getElementById('super-toggle-btn');
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
        }
    }

    // Create a panel element
    createPanel(id, title) {
        const panel = document.getElementById(id);

        // Add panel title
        const titleEl = document.createElement('div');
        titleEl.className = 'panel-title';
        titleEl.innerHTML = `
      <h3>${title}</h3>
      <div class="panel-controls">
        <button class="view-toggle" data-panel="${id}">
          <span class="view-2d active">2D</span>
          <span class="view-3d">3D</span>
        </button>
      </div>
    `;
        panel.appendChild(titleEl);

        // Add visualization container
        const vizContainer = document.createElement('div');
        vizContainer.className = 'panel-visualization';
        vizContainer.id = `${id}-viz`;
        panel.appendChild(vizContainer);

        return panel;
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

        function resizeLeft(e) {
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
        }

        function resizeRight(e) {
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
        }

        function stopResize() {
            document.removeEventListener('mousemove', resizeLeft);
            document.removeEventListener('mousemove', resizeRight);

            // Reset cursor
            document.body.style.cursor = '';
            leftResizer.classList.remove('active');
            rightResizer.classList.remove('active');

            // Final resize event for good measure
            window.dispatchEvent(new Event('resize'));
        }
    }

    // Create the dependencies panel visualization (left panel)
    createDependenciesPanel(fileId) {
        const container = document.getElementById('dependencies-panel-viz');

        if (!container) {
            console.error('Dependencies panel visualization container not found');
            return;
        }

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

        // Continue with dependencies panel creation
        try {
            // Get container dimensions with fallbacks
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;

            console.log(`Creating dependencies panel with dimensions: ${width}x${height}`);

            // Create Three.js scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e293b);

            // Create camera
            const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            camera.position.z = 300;

            // Create renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(width, height);

            // Remove loading indicator
            loadingDiv.remove();

            // Clear container and add renderer
            container.innerHTML = '';
            container.appendChild(renderer.domElement);

            // Create controls
            const controls = new TrackballControls(camera, renderer.domElement);
            controls.rotateSpeed = 1.5;
            controls.zoomSpeed = 1.2;
            controls.panSpeed = 2.0;

            // Create nodes for each dependency
            const nodes = {};
            const nodeObjects = {};

            // Add a center node for the current file
            const centerNodeId = fileId + '_center';
            nodes[centerNodeId] = {
                id: centerNodeId,
                name: this.nodes[fileId].name,
                type: this.nodes[fileId].type,
                size: this.nodes[fileId].size * 0.9, // Slightly bigger
                path: this.nodes[fileId].path,
                isCenter: true
            };

            // Determine color for center node
            let centerColor;
            if (fileId.startsWith('library:')) {
                centerColor = this.colorMap['library'];
            } else {
                const ext = this.nodes[fileId].type.toLowerCase();
                centerColor = this.colorMap[ext] || 0xffffff;
            }

            // Create sphere for center node
            const centerGeometry = new THREE.SphereGeometry(nodes[centerNodeId].size, 32, 32);
            const centerMaterial = new THREE.MeshPhongMaterial({
                color: centerColor,
                shininess: 70,
                specular: 0x111111,
                emissive: 0x222222 // Slightly glowing
            });
            const centerSphere = new THREE.Mesh(centerGeometry, centerMaterial);

            // Position at center
            centerSphere.position.set(0, 0, 0);

            centerSphere.userData = {
                type: 'node',
                id: centerNodeId,
                ...nodes[centerNodeId],
                isCurrentFile: true
            };

            scene.add(centerSphere);
            nodeObjects[centerNodeId] = centerSphere;

            // Create links array to track connections
            const links = [];

            // Add dependency nodes
            dependencies.forEach(depId => {
                const depNode = this.nodes[depId];
                if (!depNode) return;

                // Create node data
                nodes[depId] = {
                    id: depId,
                    name: depNode.name,
                    type: depNode.type,
                    size: depNode.size * 0.7, // Smaller than main graph
                    path: depNode.path
                };

                // Determine color
                let color;
                if (depId.startsWith('library:')) {
                    color = this.colorMap['library'];
                } else {
                    const ext = depNode.type.toLowerCase();
                    color = this.colorMap[ext] || 0xffffff;
                }

                // Create spheres for nodes
                const geometry = new THREE.SphereGeometry(nodes[depId].size, 32, 32);
                const material = new THREE.MeshPhongMaterial({
                    color,
                    shininess: 70,
                    specular: 0x111111
                });
                const sphere = new THREE.Mesh(geometry, material);

                // Position randomly initially in a circle around center
                const angle = Math.random() * Math.PI * 2;
                const radius = 100 + Math.random() * 50;
                sphere.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    (Math.random() - 0.5) * 50 // Small z variation
                );

                sphere.userData = { type: 'node', id: depId, ...nodes[depId] };

                scene.add(sphere);
                nodeObjects[depId] = sphere;

                // Create label for the node
                this.createPanelLabel(nodes[depId], sphere, scene);

                // Add link from center to this dependency
                links.push({
                    source: centerNodeId,
                    target: depId
                });
            });

            // Create labels - also create one for the center node
            this.createPanelLabel(nodes[centerNodeId], centerSphere, scene);

            // Create connections
            const linkObjects = [];
            links.forEach(link => {
                const sourceObj = nodeObjects[link.source];
                const targetObj = nodeObjects[link.target];

                if (!sourceObj || !targetObj) return;

                // Create curved line for better visibility
                const sourcePos = sourceObj.position;
                const targetPos = targetObj.position;

                // Create curved path
                const midPoint = new THREE.Vector3(
                    (sourcePos.x + targetPos.x) / 2,
                    (sourcePos.y + targetPos.y) / 2,
                    (sourcePos.z + targetPos.z) / 2 + 15 // Raise curve slightly
                );

                // Create quadratic bezier curve
                const curve = new THREE.QuadraticBezierCurve3(
                    sourcePos.clone(),
                    midPoint,
                    targetPos.clone()
                );

                const points = curve.getPoints(20);
                const geometry = new THREE.BufferGeometry().setFromPoints(points);

                // Create line with color based on target type
                let lineColor;
                if (link.target.startsWith('library:')) {
                    lineColor = 0xaaaaaa; // Gray for libraries
                } else {
                    // Get file extension
                    const targetType = nodes[link.target].type.toLowerCase();
                    // Use a lighter version of the node color
                    lineColor = this.colorMap[targetType] || 0x94a3b8;
                }

                const material = new THREE.LineBasicMaterial({
                    color: lineColor,
                    transparent: true,
                    opacity: 0.6
                });

                const line = new THREE.Line(geometry, material);
                line.userData = {
                    type: 'link',
                    source: link.source,
                    target: link.target
                };

                scene.add(line);
                linkObjects.push(line);

                // Add arrow at target end to show direction
                if (this.directed) {
                    // Get the last two points to determine direction
                    const lastPoint = points[points.length - 1];
                    const secondLastPoint = points[points.length - 2];

                    // Calculate direction vector
                    const dir = new THREE.Vector3().subVectors(lastPoint, secondLastPoint).normalize();

                    // Create arrow
                    const arrowLength = 5;
                    const arrowWidth = 2;

                    const arrowTip = targetPos.clone().sub(dir.clone().multiplyScalar(nodes[link.target].size));
                    const arrowBase = arrowTip.clone().sub(dir.clone().multiplyScalar(arrowLength));

                    // Create perpendicular vector for arrow wings
                    const perpDir = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(arrowWidth);

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
                        color: lineColor,
                        side: THREE.DoubleSide
                    });

                    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);

                    scene.add(arrow);
                    linkObjects.push(arrow); // Add to link objects for cleanup
                }
            });

            // Add lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);

            const pointLight = new THREE.PointLight(0xffffff, 1);
            pointLight.position.set(100, 100, 100);
            scene.add(pointLight);

            // Apply force-directed layout for nicer positioning while keeping center node fixed
            this.applyRadialForceLayout(centerNodeId, nodes, nodeObjects, links);

            // Create panel tooltip for node hover
            const tooltip = document.createElement('div');
            tooltip.className = 'panel-tooltip';
            container.appendChild(tooltip);

            // Add hover effect for nodes
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            container.addEventListener('mousemove', (event) => {
                if (!this.isPanelMode) return;

                // Calculate mouse position
                const rect = container.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                // Update raycaster
                raycaster.setFromCamera(mouse, camera);

                // Find intersections
                const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

                // Reset all nodes and links
                Object.values(nodeObjects).forEach(node => {
                    if (!node.userData.isCurrentFile) { // Keep center node highlighted
                        node.material.emissive.setHex(0x000000);
                    }
                });

                linkObjects.forEach(link => {
                    link.material.opacity = 0.3;
                });

                // Hide tooltip by default
                tooltip.classList.remove('visible');

                if (intersects.length > 0) {
                    // Highlight intersected node
                    const obj = intersects[0].object;
                    const nodeId = obj.userData.id;

                    if (!obj.userData.isCurrentFile) { // Don't modify center node highlight
                        obj.material.emissive.setHex(0x333333);
                    }

                    // Highlight connections to this node
                    linkObjects.forEach(link => {
                        if (link.userData && (link.userData.source === nodeId || link.userData.target === nodeId)) {
                            link.material.opacity = 0.8;
                        }
                    });

                    // Show tooltip
                    const nodeData = obj.userData;
                    tooltip.innerHTML = `
                <div>${nodeData.name}</div>
                <div style="font-size: 0.7rem; opacity: 0.7;">${nodeData.path}</div>
                ${nodeData.isCurrentFile ? '<div style="font-size: 0.7rem; color: #6366F1;">Current File</div>' : ''}
              `;
                    tooltip.style.left = `${event.clientX - rect.left + 10}px`;
                    tooltip.style.top = `${event.clientY - rect.top + 10}px`;
                    tooltip.classList.add('visible');
                }
            });

            // Add click handler for dependency nodes to navigate to their details
            container.addEventListener('click', (event) => {
                if (!this.isPanelMode) return;

                // Calculate mouse position
                const rect = container.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                // Update raycaster
                raycaster.setFromCamera(mouse, camera);

                // Find intersections
                const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

                if (intersects.length > 0) {
                    const obj = intersects[0].object;
                    const depId = obj.userData.id;

                    // Skip the center node (current file)
                    if (obj.userData.isCurrentFile) return;

                    // Skip library nodes
                    if (depId.startsWith('library:')) {
                        this.showTooltip('Cannot navigate to external library', {
                            x: window.innerWidth / 2,
                            y: window.innerHeight / 2
                        }, 1500);
                        return;
                    }

                    // Show info toast
                    this.showTooltip(`Navigating to ${obj.userData.name}...`, {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 1500);

                    // Close current panels and open new ones for this dependency file
                    setTimeout(() => {
                        this.closeMultiPanelView();
                        this.showMultiPanelView(depId.replace('_center', '')); // Remove center suffix if present
                    }, 300);
                }
            });

            // Update line positions when nodes move
            const updateLines = () => {
                linkObjects.forEach(lineObj => {
                    // Skip non-lines or lines without proper userData
                    if (!lineObj.userData || !lineObj.userData.source || !lineObj.userData.target) return;
                    if (lineObj.geometry.type !== 'BufferGeometry') return;

                    const sourceObj = nodeObjects[lineObj.userData.source];
                    const targetObj = nodeObjects[lineObj.userData.target];

                    if (!sourceObj || !targetObj) return;

                    // For regular lines
                    if (lineObj.type === 'Line') {
                        const sourcePos = sourceObj.position;
                        const targetPos = targetObj.position;

                        // Create curved path
                        const midPoint = new THREE.Vector3(
                            (sourcePos.x + targetPos.x) / 2,
                            (sourcePos.y + targetPos.y) / 2,
                            (sourcePos.z + targetPos.z) / 2 + 15
                        );

                        // Create quadratic bezier curve
                        const curve = new THREE.QuadraticBezierCurve3(
                            sourcePos.clone(),
                            midPoint,
                            targetPos.clone()
                        );

                        const points = curve.getPoints(20);
                        lineObj.geometry.setFromPoints(points);
                    }
                    // For arrow meshes we need to update their position and rotation
                    else if (lineObj.type === 'Mesh') {
                        // This is more complex and would require recreating the arrow geometry
                        // For simplicity, we hide arrows during camera movement
                        lineObj.visible = false;
                    }
                });
            };

            // Animation loop with cleanup check
            function animate() {
                if (!renderer.domElement.isConnected) {
                    // Stop animation if element is removed from DOM
                    return;
                }

                requestAnimationFrame(animate);
                updateLines();
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            // Store panel data
            this.panels.dependencies = {
                scene,
                camera,
                renderer,
                controls,
                nodes,
                nodeObjects,
                links,
                linkObjects
            };

            // Handle resize
            const resizeHandler = () => {
                if (!this.isPanelMode || !renderer.domElement.isConnected) return;

                const newWidth = container.clientWidth;
                const newHeight = container.clientHeight;

                if (newWidth > 0 && newHeight > 0) {
                    camera.aspect = newWidth / newHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(newWidth, newHeight);
                }
            };

            window.addEventListener('resize', resizeHandler);

            // Add method to handle view toggling (2D/3D)
            this.panels.dependencies.setViewMode = (mode) => {
                if (mode === '2d') {
                    // Flatten nodes to z=0
                    Object.values(nodeObjects).forEach(node => {
                        const pos = node.position;
                        node.position.set(pos.x, pos.y, 0);
                    });

                    // Disable rotation
                    controls.noRotate = true;
                } else {
                    // Re-apply 3D positions with radial layout
                    this.applyRadialForceLayout(centerNodeId, nodes, nodeObjects, links, true);

                    // Enable rotation
                    controls.noRotate = false;
                }
            };

        } catch (error) {
            console.error('Error creating dependencies panel:', error);

            // Remove loading indicator
            loadingDiv.remove();

            // Show error state
            this.showEmptyState(container, 'dependencies', 'Error creating dependencies visualization.');
        }
    }

    // Helper method for radial force layout
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

    // Helper method for simple force layout (if not already defined)
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

    // Create the methods panel visualization (center panel)
    createMethodsPanel(fileId) {
        const container = document.getElementById('methods-panel-viz');

        // Create Three.js scene similar to dependencies panel
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e293b);

        const width = container.clientWidth;
        const height = container.clientHeight;

        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 300;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        const controls = new TrackballControls(camera, renderer.domElement);
        controls.rotateSpeed = 1.5;
        controls.zoomSpeed = 1.2;
        controls.panSpeed = 2.0;

        // Get methods for this file
        const fileMethods = this.methodData[fileId]?.methods || [];
        const methodDeps = this.methodDependencies[fileId] || {};

        // Create nodes for each method
        const nodes = {};
        const nodeObjects = {};
        const links = [];
        const linkObjects = [];

        // Create method nodes
        fileMethods.forEach(method => {
            // Create node data
            const nodeId = method.name;
            nodes[nodeId] = {
                id: nodeId,
                name: method.name,
                type: method.type,
                class: method.class,
                params: method.params || [],
                size: 5 // Base size
            };

            // Different colors for different method types
            let color;
            if (method.type === 'method') {
                color = 0x6366F1; // Primary color for class methods
            } else if (method.type === 'arrow') {
                color = 0x10B981; // Green for arrow functions
            } else {
                color = 0x0EA5E9; // Blue for regular functions
            }

            // Create sphere for node
            const geometry = new THREE.SphereGeometry(nodes[nodeId].size, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color,
                shininess: 70,
                specular: 0x111111
            });
            const sphere = new THREE.Mesh(geometry, material);

            // Position randomly initially
            sphere.position.set(
                (Math.random() - 0.5) * 200,
                (Math.random() - 0.5) * 200,
                0 // Flat layout by default
            );

            sphere.userData = { type: 'method', id: nodeId, ...nodes[nodeId] };

            scene.add(sphere);
            nodeObjects[nodeId] = sphere;
        });

        // Create links between methods based on dependencies
        Object.keys(methodDeps).forEach(source => {
            const targets = methodDeps[source] || [];

            targets.forEach(target => {
                // Only create links for local method calls
                if (target.type === 'local' && nodeObjects[source] && nodeObjects[target.name]) {
                    links.push({
                        source,
                        target: target.name
                    });

                    // Create line geometry
                    const sourcePos = nodeObjects[source].position;
                    const targetPos = nodeObjects[target.name].position;

                    const points = [
                        new THREE.Vector3(sourcePos.x, sourcePos.y, sourcePos.z),
                        new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)
                    ];

                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMaterial = new THREE.LineBasicMaterial({
                        color: 0x94a3b8,
                        transparent: true,
                        opacity: 0.5
                    });
                    const line = new THREE.Line(lineGeometry, lineMaterial);

                    line.userData = {
                        type: 'link',
                        source,
                        target: target.name
                    };

                    scene.add(line);
                    linkObjects.push(line);
                }
            });
        });

        // Add light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(100, 100, 100);
        scene.add(pointLight);

        // Apply force-directed layout for nicer positioning
        const nodeArray = Object.values(nodes);
        this.applyForceDirectedLayout(nodeArray, links, nodeObjects, scene);

        // Animation loop with link position updates
        const updateLinks = () => {
            // Update link positions
            linkObjects.forEach(link => {
                const sourceId = link.userData.source;
                const targetId = link.userData.target;

                if (nodeObjects[sourceId] && nodeObjects[targetId]) {
                    const sourcePos = nodeObjects[sourceId].position;
                    const targetPos = nodeObjects[targetId].position;

                    // Update line points
                    const positions = new Float32Array([
                        sourcePos.x, sourcePos.y, sourcePos.z,
                        targetPos.x, targetPos.y, targetPos.z
                    ]);

                    link.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    link.geometry.attributes.position.needsUpdate = true;
                }
            });
        };

        function animate() {
            requestAnimationFrame(animate);
            updateLinks();
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // Store panel data for later reference
        this.panels.methods = {
            scene,
            camera,
            renderer,
            controls,
            nodes,
            nodeObjects,
            links,
            linkObjects
        };

        // Add resize handler
        window.addEventListener('resize', () => {
            if (!this.isPanelMode) return;

            const width = container.clientWidth;
            const height = container.clientHeight;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        });

        // Add hover effect for methods
        container.addEventListener('mousemove', (event) => {
            if (!this.isPanelMode) return;

            const rect = container.getBoundingClientRect();
            const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            const mouse = new THREE.Vector2(mouseX, mouseY);
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

            // Reset all nodes to normal
            Object.values(nodeObjects).forEach(node => {
                node.material.emissive.setHex(0x000000);
            });

            // Reset all links to normal
            linkObjects.forEach(link => {
                link.material.color.setHex(0x94a3b8);
                link.material.opacity = 0.3;
            });

            if (intersects.length > 0) {
                const obj = intersects[0].object;
                const methodId = obj.userData.id;

                // Highlight the hovered method
                obj.material.emissive.setHex(0x333333);

                // Highlight connected methods and links
                linkObjects.forEach(link => {
                    if (link.userData.source === methodId || link.userData.target === methodId) {
                        link.material.color.setHex(0x6366F1);
                        link.material.opacity = 0.8;

                        // Highlight connected nodes
                        const connectedId = link.userData.source === methodId ?
                            link.userData.target : link.userData.source;

                        if (nodeObjects[connectedId]) {
                            nodeObjects[connectedId].material.emissive.setHex(0x222222);
                        }
                    }
                });
            }
        });
    }

    // Create the dependents panel visualization (right panel)

    createDependentsPanel(fileId) {
        const container = document.getElementById('dependents-panel-viz');

        if (!container) {
            console.error('Dependents panel visualization container not found');
            return;
        }

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

        // Continue with dependents panel creation
        try {
            // Get container dimensions with fallbacks
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;

            console.log(`Creating dependents panel with dimensions: ${width}x${height}`);

            // Create Three.js scene
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1e293b);

            // Create camera
            const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            camera.position.z = 300;

            // Create renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(width, height);

            // Remove loading indicator
            loadingDiv.remove();

            // Clear container and add renderer
            container.innerHTML = '';
            container.appendChild(renderer.domElement);

            // Create controls
            const controls = new TrackballControls(camera, renderer.domElement);
            controls.rotateSpeed = 1.5;
            controls.zoomSpeed = 1.2;
            controls.panSpeed = 2.0;

            // Create nodes for each dependent
            const nodes = {};
            const nodeObjects = {};

            dependents.forEach(depId => {
                const depNode = this.nodes[depId];
                if (!depNode) return;

                // Create node data
                nodes[depId] = {
                    id: depId,
                    name: depNode.name,
                    type: depNode.type,
                    size: depNode.size * 0.7, // Smaller than main graph
                    path: depNode.path
                };

                // Determine color
                let color;
                if (depId.startsWith('library:')) {
                    color = this.colorMap['library'];
                } else {
                    const ext = depNode.type.toLowerCase();
                    color = this.colorMap[ext] || 0xffffff;
                }

                // Create spheres for nodes
                const geometry = new THREE.SphereGeometry(nodes[depId].size, 32, 32);
                const material = new THREE.MeshPhongMaterial({
                    color,
                    shininess: 70,
                    specular: 0x111111
                });
                const sphere = new THREE.Mesh(geometry, material);

                // Position randomly initially
                sphere.position.set(
                    (Math.random() - 0.5) * 200,
                    (Math.random() - 0.5) * 200,
                    (Math.random() - 0.5) * 200
                );

                sphere.userData = { type: 'node', id: depId, ...nodes[depId] };

                scene.add(sphere);
                nodeObjects[depId] = sphere;

                // Create label for the node
                this.createPanelLabel(nodes[depId], sphere, scene);
            });

            // Add lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);

            const pointLight = new THREE.PointLight(0xffffff, 1);
            pointLight.position.set(100, 100, 100);
            scene.add(pointLight);

            // Apply force-directed layout for nicer positioning
            const nodeArray = Object.values(nodes);
            const links = []; // No links for simple dependents view

            // Apply force-directed layout
            this.applySimpleForceLayout(nodeArray, nodeObjects);

            // Create panel tooltip for node hover
            const tooltip = document.createElement('div');
            tooltip.className = 'panel-tooltip';
            container.appendChild(tooltip);

            // Add hover effect for nodes
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            container.addEventListener('mousemove', (event) => {
                if (!this.isPanelMode) return;

                // Calculate mouse position
                const rect = container.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                // Update raycaster
                raycaster.setFromCamera(mouse, camera);

                // Find intersections
                const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

                // Reset nodes
                Object.values(nodeObjects).forEach(node => {
                    node.material.emissive.setHex(0x000000);
                });

                // Hide tooltip by default
                tooltip.classList.remove('visible');

                if (intersects.length > 0) {
                    // Highlight intersected node
                    const obj = intersects[0].object;
                    obj.material.emissive.setHex(0x333333);

                    // Show tooltip
                    const nodeData = obj.userData;
                    tooltip.innerHTML = `
            <div>${nodeData.name}</div>
            <div style="font-size: 0.7rem; opacity: 0.7;">${nodeData.path}</div>
          `;
                    tooltip.style.left = `${event.clientX - rect.left + 10}px`;
                    tooltip.style.top = `${event.clientY - rect.top + 10}px`;
                    tooltip.classList.add('visible');
                }
            });

            // Add click handler for dependent nodes to navigate to their details
            container.addEventListener('click', (event) => {
                if (!this.isPanelMode) return;

                // Calculate mouse position
                const rect = container.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                // Update raycaster
                raycaster.setFromCamera(mouse, camera);

                // Find intersections
                const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

                if (intersects.length > 0) {
                    const obj = intersects[0].object;
                    const depId = obj.userData.id;

                    // Show info toast
                    this.showTooltip(`Navigating to ${obj.userData.name}...`, {
                        x: window.innerWidth / 2,
                        y: window.innerHeight / 2
                    }, 1500);

                    // Close current panels and open new ones for this dependent file
                    setTimeout(() => {
                        this.closeMultiPanelView();
                        this.showMultiPanelView(depId);
                    }, 300);
                }
            });

            // Animation loop with cleanup check
            function animate() {
                if (!renderer.domElement.isConnected) {
                    // Stop animation if element is removed from DOM
                    return;
                }

                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            // Store panel data
            this.panels.dependents = {
                scene,
                camera,
                renderer,
                controls,
                nodes,
                nodeObjects
            };

            // Handle resize
            const resizeHandler = () => {
                if (!this.isPanelMode || !renderer.domElement.isConnected) return;

                const newWidth = container.clientWidth;
                const newHeight = container.clientHeight;

                if (newWidth > 0 && newHeight > 0) {
                    camera.aspect = newWidth / newHeight;
                    camera.updateProjectionMatrix();
                    renderer.setSize(newWidth, newHeight);
                }
            };

            window.addEventListener('resize', resizeHandler);

            // Add method to handle view toggling (2D/3D)
            this.panels.dependents.setViewMode = (mode) => {
                if (mode === '2d') {
                    // Flatten nodes to z=0
                    Object.values(nodeObjects).forEach(node => {
                        const pos = node.position;
                        node.position.set(pos.x, pos.y, 0);
                    });

                    // Disable rotation
                    controls.noRotate = true;
                } else {
                    // Re-apply 3D positions
                    this.applySimpleForceLayout(nodeArray, nodeObjects, true);

                    // Enable rotation
                    controls.noRotate = false;
                }
            };

        } catch (error) {
            console.error('Error creating dependents panel:', error);

            // Remove loading indicator
            loadingDiv.remove();

            // Show error state
            this.showEmptyState(container, 'dependents', 'Error creating dependents visualization.');
        }
    }

    // Helper method for simple force layout (if not already defined)
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

    // 1. Add a helper method to show empty states in panels
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

    // Add this method to DependencyVisualizer.js

    // Unified method for creating graph visualizations across different panels
    createPanelVisualization(container, nodes, links, options = {}) {
        // Default options
        const defaults = {
            centerNodeId: null,    // For radial layout
            useRadialLayout: false, // Whether to use radial layout (dependencies panel)
            nodeColorMap: this.colorMap, // Default color map
            scene: null,           // Existing scene (optional)
            camera: null,          // Existing camera (optional)
            addLabels: true,       // Whether to add text labels
            viewMode: '2d',        // Initial view mode
            onNodeClick: null      // Node click handler
        };

        // Merge defaults with provided options
        const config = { ...defaults, ...options };

        // Early exit if container not found
        if (!container) {
            console.error('Visualization container not found');
            return null;
        }

        try {
            // Add loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'panel-loading';
            loadingDiv.innerHTML = '<div class="panel-loading-spinner"></div>';
            container.appendChild(loadingDiv);

            // Get dimensions
            const width = container.clientWidth || 400;
            const height = container.clientHeight || 300;

            // Create or use provided scene
            const scene = config.scene || new THREE.Scene();
            scene.background = new THREE.Color(0x1e293b);

            // Create camera based on view mode
            let camera;
            if (config.camera) {
                camera = config.camera;
            } else if (config.viewMode === '2d') {
                const aspect = width / height;
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
                camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
                camera.position.z = 300;
            }

            // Create renderer
            const renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(width, height);

            // Remove loading indicator and add renderer
            loadingDiv.remove();
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

            // Create node objects - unified styling for all panels
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

                // Initial position - will be adjusted by layout
                sphere.position.set(
                    (Math.random() - 0.5) * 200,
                    (Math.random() - 0.5) * 200,
                    config.viewMode === '2d' ? 0 : (Math.random() - 0.5) * 50
                );

                sphere.userData = {
                    type: 'node',
                    id: node.id,
                    ...node,
                    isCurrentFile: node.isCenter
                };

                scene.add(sphere);
                nodeObjects[node.id] = sphere;

                // Create label if configured
                if (config.addLabels) {
                    if (typeof this.createPanelLabel === 'function') {
                        this.createPanelLabel(node, sphere, scene);
                    }
                }
            });

            // Create links between nodes
            const linkObjects = [];
            links.forEach(link => {
                const sourceObj = nodeObjects[link.source];
                const targetObj = nodeObjects[link.target];

                if (!sourceObj || !targetObj) return;

                // Create curved connection with consistent styling
                const sourcePos = sourceObj.position;
                const targetPos = targetObj.position;

                // Create curved path for better visibility
                const midPoint = new THREE.Vector3(
                    (sourcePos.x + targetPos.x) / 2,
                    (sourcePos.y + targetPos.y) / 2,
                    (sourcePos.z + targetPos.z) / 2 + 15 // Raise curve slightly
                );

                // Create quadratic bezier curve
                const curve = new THREE.QuadraticBezierCurve3(
                    sourcePos.clone(),
                    midPoint,
                    targetPos.clone()
                );

                const points = curve.getPoints(20);
                const geometry = new THREE.BufferGeometry().setFromPoints(points);

                // Use consistent link color and style
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0x94a3b8,
                    transparent: true,
                    opacity: 0.4
                });

                const line = new THREE.Line(geometry, lineMaterial);
                line.userData = {
                    type: 'link',
                    source: link.source,
                    target: link.target
                };

                scene.add(line);
                linkObjects.push(line);
            });

            // Add lighting - consistent across all panels
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);

            const pointLight = new THREE.PointLight(0xffffff, 1);
            pointLight.position.set(100, 100, 100);
            scene.add(pointLight);

            // Apply layout - either radial or force-directed
            if (config.useRadialLayout && config.centerNodeId) {
                // Use radial layout (for dependencies panel)
                this.applyRadialForceLayout(config.centerNodeId, nodes, nodeObjects, links, config.viewMode === '3d');
            } else {
                // Use standard force-directed layout (for methods and dependents panels)
                const nodeArray = Object.values(nodes);
                this.applySimpleForceLayout(nodeArray, nodeObjects, config.viewMode === '3d');
            }

            // Create panel tooltip for hover effect
            const tooltip = document.createElement('div');
            tooltip.className = 'panel-tooltip';
            container.appendChild(tooltip);

            // Add hover effect
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            container.addEventListener('mousemove', (event) => {
                if (!this.isPanelMode) return;

                // Calculate mouse position
                const rect = container.getBoundingClientRect();
                mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                // Update raycaster
                raycaster.setFromCamera(mouse, camera);

                // Find intersections
                const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

                // Reset all highlights
                Object.values(nodeObjects).forEach(node => {
                    if (!node.userData.isCurrentFile) {
                        node.material.emissive.setHex(0x000000);
                    }
                });

                linkObjects.forEach(link => {
                    link.material.opacity = 0.3;
                });

                // Hide tooltip by default
                tooltip.classList.remove('visible');

                if (intersects.length > 0) {
                    // Highlight intersected node
                    const obj = intersects[0].object;
                    const nodeId = obj.userData.id;

                    if (!obj.userData.isCurrentFile) {
                        obj.material.emissive.setHex(0x333333);
                    }

                    // Highlight connections
                    linkObjects.forEach(link => {
                        if (link.userData.source === nodeId || link.userData.target === nodeId) {
                            link.material.opacity = 0.8;

                            // Highlight connected node
                            const connectedId = link.userData.source === nodeId ?
                                link.userData.target : link.userData.source;

                            if (nodeObjects[connectedId]) {
                                nodeObjects[connectedId].material.emissive.setHex(0x222222);
                            }
                        }
                    });

                    // Show tooltip
                    const nodeData = obj.userData;
                    tooltip.innerHTML = `
            <div>${nodeData.name}</div>
            ${nodeData.path ? `<div style="font-size: 0.7rem; opacity: 0.7;">${nodeData.path}</div>` : ''}
            ${nodeData.isCurrentFile ? '<div style="font-size: 0.7rem; color: #6366F1;">Current File</div>' : ''}
            ${nodeData.type ? `<div style="font-size: 0.7rem;">${nodeData.type}</div>` : ''}
          `;
                    tooltip.style.left = `${event.clientX - rect.left + 10}px`;
                    tooltip.style.top = `${event.clientY - rect.top + 10}px`;
                    tooltip.classList.add('visible');
                }
            });

            // Handle click events if callback provided
            if (typeof config.onNodeClick === 'function') {
                container.addEventListener('click', (event) => {
                    if (!this.isPanelMode) return;

                    // Calculate mouse position
                    const rect = container.getBoundingClientRect();
                    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                    // Update raycaster
                    raycaster.setFromCamera(mouse, camera);

                    // Find intersections
                    const intersects = raycaster.intersectObjects(Object.values(nodeObjects));

                    if (intersects.length > 0) {
                        const obj = intersects[0].object;
                        config.onNodeClick(obj.userData);
                    }
                });
            }

            // Update lines when nodes move
            const updateLines = () => {
                linkObjects.forEach(lineObj => {
                    if (lineObj.geometry.type !== 'BufferGeometry') return;
                    if (!lineObj.userData || !lineObj.userData.source || !lineObj.userData.target) return;

                    const sourceObj = nodeObjects[lineObj.userData.source];
                    const targetObj = nodeObjects[lineObj.userData.target];

                    if (!sourceObj || !targetObj) return;

                    // Update curve points
                    const sourcePos = sourceObj.position;
                    const targetPos = targetObj.position;

                    // Create curved path
                    const midPoint = new THREE.Vector3(
                        (sourcePos.x + targetPos.x) / 2,
                        (sourcePos.y + targetPos.y) / 2,
                        (sourcePos.z + targetPos.z) / 2 + 15
                    );

                    // Create quadratic bezier curve
                    const curve = new THREE.QuadraticBezierCurve3(
                        sourcePos.clone(),
                        midPoint,
                        targetPos.clone()
                    );

                    const points = curve.getPoints(20);
                    lineObj.geometry.setFromPoints(points);
                });
            };

            // Animation loop with cleanup check
            function animate() {
                if (!renderer.domElement.isConnected) {
                    // Stop animation if element is removed from DOM
                    return;
                }

                requestAnimationFrame(animate);
                updateLines();
                controls.update();
                renderer.render(scene, camera);
            }
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

            // Return panel data for reference
            return {
                scene,
                camera,
                renderer,
                controls,
                nodes,
                nodeObjects,
                links,
                linkObjects,

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

                        // Switch to orthographic camera if needed
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
                            newCamera.position.z = 300; // Force consistent Z position

                            // Replace camera
                            camera = newCamera;
                            controls.object = camera;
                            camera.lookAt(0, 0, 0);
                        }
                    } else {
                        // Enable rotation for 3D mode
                        controls.noRotate = false;

                        // Re-apply 3D positions depending on layout type
                        if (config.useRadialLayout && config.centerNodeId) {
                            this.applyRadialForceLayout(config.centerNodeId, nodes, nodeObjects, links, true);
                        } else {
                            const nodeArray = Object.values(nodes);
                            this.applySimpleForceLayout(nodeArray, nodeObjects, true);
                        }

                        // Switch to perspective camera if needed
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

                    // Remove any event listeners
                    const canvas = renderer.domElement;
                    const newCanvas = canvas.cloneNode(true);
                    if (canvas.parentNode) {
                        canvas.parentNode.replaceChild(newCanvas, canvas);
                    }
                }
            };
        } catch (error) {
            console.error('Error creating panel visualization:', error);
            return null;
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
                if (this.panels[key].renderer) {
                    this.panels[key].renderer.dispose();
                }
                if (this.panels[key].controls) {
                    this.panels[key].controls.dispose();
                }
                this.panels[key] = null;
            }
        });
    }

    // Apply force-directed layout to nodes in a panel
    applyForceDirectedLayout(nodes, links, nodeObjects, scene) {
        // Skip if no nodes
        if (nodes.length === 0) return;

        // Start with current positions
        nodes.forEach(node => {
            node.x = nodeObjects[node.id].position.x;
            node.y = nodeObjects[node.id].position.y;
            node.z = nodeObjects[node.id].position.z;

            // Initialize forces
            node.forceX = 0;
            node.forceY = 0;
            node.forceZ = 0;
        });

        // Run iterations of force-directed algorithm
        const iterations = 50;
        const repulsionForce = 1000;
        const attractionForce = 0.1;

        for (let i = 0; i < iterations; i++) {
            // Calculate repulsion forces
            nodes.forEach(nodeA => {
                nodes.forEach(nodeB => {
                    if (nodeA.id === nodeB.id) return;

                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const dz = nodeA.z - nodeB.z;

                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                    const force = repulsionForce / (distance * distance);

                    nodeA.forceX += (dx / distance) * force;
                    nodeA.forceY += (dy / distance) * force;
                    nodeA.forceZ += (dz / distance) * force;
                });
            });

            // Calculate attraction forces
            links.forEach(link => {
                if (!nodes.find(n => n.id === link.source) || !nodes.find(n => n.id === link.target)) return;

                const sourceNode = nodes.find(n => n.id === link.source);
                const targetNode = nodes.find(n => n.id === link.target);

                const dx = sourceNode.x - targetNode.x;
                const dy = sourceNode.y - targetNode.y;
                const dz = sourceNode.z - targetNode.z;

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                const force = attractionForce * distance;

                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                const fz = (dz / distance) * force;

                sourceNode.forceX -= fx;
                sourceNode.forceY -= fy;
                sourceNode.forceZ -= fz;

                targetNode.forceX += fx;
                targetNode.forceY += fy;
                targetNode.forceZ += fz;
            });

            // Apply forces
            const cooling = 1 - (i / iterations);

            nodes.forEach(node => {
                node.x += node.forceX * cooling;
                node.y += node.forceY * cooling;
                node.z += node.forceZ * cooling;

                // Update node object position
                if (nodeObjects[node.id]) {
                    nodeObjects[node.id].position.set(node.x, node.y, node.z);
                }

                // Clear forces for next iteration
                node.forceX = 0;
                node.forceY = 0;
                node.forceZ = 0;
            });
        }

        // Add method labels if appropriate
        if (scene && nodes.some(n => n.type === 'method' || n.type === 'function' || n.type === 'arrow')) {
            nodes.forEach(node => {
                if (nodeObjects[node.id]) {
                    this.createPanelLabel(node, nodeObjects[node.id], scene);
                }
            });
        }
    }

    // Create a text label for a method node
    createPanelLabel(node, nodeObject, scene) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set font
        const fontSize = 24;
        context.font = `${fontSize}px Inter, Arial, sans-serif`;

        // Measure text
        const text = node.name;
        const textMetrics = context.measureText(text);
        const textWidth = textMetrics.width;

        // Create canvas sized to text
        canvas.width = textWidth + 20;
        canvas.height = 40;

        // Clear background with semi-transparent color
        context.fillStyle = 'rgba(30, 41, 59, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw text
        context.font = `${fontSize}px Inter, Arial, sans-serif`;
        context.fillStyle = '#f8fafc';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);

        // Position above node
        sprite.position.set(
            nodeObject.position.x,
            nodeObject.position.y + 10,
            nodeObject.position.z
        );

        // Size sprite
        sprite.scale.set(canvas.width / 4, canvas.height / 4, 1);

        // Add to scene
        scene.add(sprite);

        return sprite;
    }

    // Initialize Three.js scene, camera, renderer
    initThree() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);

        // Create camera based on view mode
        if (this.viewMode === '2d') {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const aspectRatio = width / height;
            const frustumSize = 1000;

            this.camera = new THREE.OrthographicCamera(
                frustumSize * aspectRatio / -2,
                frustumSize * aspectRatio / 2,
                frustumSize / 2,
                frustumSize / -2,
                1,
                2000
            );
        } else {
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        }

        this.camera.position.z = 1000;

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('visualization-container').appendChild(this.renderer.domElement);

        // Create controls
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);

        // Setup basic controls properties
        if (this.viewMode === '2d') {
            // 2D mode - disable rotation
            this.controls.rotateSpeed = 0;
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 3.0;
            this.controls.noRotate = true;
            this.controls.noPan = false;
            this.controls.staticMoving = true;
            this.controls.dynamicDampingFactor = 0.3;
        } else {
            // 3D mode
            this.controls.rotateSpeed = 1.5;
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 2.0;
            this.controls.noRotate = false;
            this.controls.noPan = false;
        }

        // Since the TrackballControls button mapping is complicated,
        // we'll replace its mousedown handling with our own custom solution
        this.setupCustomMouseControls();

        // Add lights for better rendering
        this.addLights();
    }
    // Setup custom mouse controls by overriding TrackballControls' event handling
    setupCustomMouseControls() {
        if (!this.controls || !this.renderer) return;

        // Store reference to controls for use in event handlers
        const controls = this.controls;
        const viewMode = this.viewMode;

        // Remove TrackballControls' default mouse listeners
        this.renderer.domElement.removeEventListener('mousedown', controls.mousedown);
        this.renderer.domElement.removeEventListener('mousemove', controls.mousemove);
        this.renderer.domElement.removeEventListener('mouseup', controls.mouseup);

        // Custom mousedown handler with our desired mapping
        const customMouseDown = (event) => {
            if (event.button === 0) {
                // Left mouse button
                if (viewMode === '2d') {
                    // In 2D mode, left button pans
                    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
                    controls.state = controls.STATE.PAN;
                } else {
                    // In 3D mode, left button rotates
                    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
                    controls.state = controls.STATE.ROTATE;
                }
            } else if (event.button === 1) {
                // Middle mouse button always pans
                controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
                controls.state = controls.STATE.PAN;
            }

            // Call original handling for movement tracking
            if (controls.enabled === false) return;

            event.preventDefault();
            event.stopPropagation();

            // Set initial position for tracking
            controls.handleMouseDownRotate(event);
            controls.handleMouseDownPan(event);

            // Set document event listeners to track movement and mouse up
            document.addEventListener('mousemove', controls.mousemove, false);
            document.addEventListener('mouseup', controls.mouseup, false);
        };

        // Replace the mousedown handler
        controls.mousedown = customMouseDown;
        this.renderer.domElement.addEventListener('mousedown', customMouseDown, false);
    }

    // Add scene lighting
    addLights() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add point light
        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(100, 100, 100);
        this.scene.add(pointLight);

        // Add directional light for better shadows
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(0, 200, 100);
        this.scene.add(dirLight);
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

    // Create 3D graph visualization
    createGraph() {
        // Clear existing objects
        this.clearGraph();

        // Position nodes using force-directed algorithm
        this.positionNodes();

        // Create node objects
        Object.values(this.nodes).forEach(node => {
            if (!node.visible && node.visible !== undefined) return;

            // Determine color based on file type
            let color;
            if (node.path.startsWith('library:')) {
                color = this.colorMap['library'];
            } else {
                const ext = node.type.toLowerCase();
                color = this.colorMap[ext] || 0xffffff;
            }

            // Create sphere for node with better material
            const geometry = new THREE.SphereGeometry(node.size, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color,
                shininess: 70,
                specular: 0x111111
            });
            const sphere = new THREE.Mesh(geometry, material);

            sphere.position.set(node.x, node.y, node.z);
            sphere.userData = { type: 'node', id: node.id, ...node };

            this.scene.add(sphere);
            this.nodeObjects[node.id] = sphere;

            // Create text label
            this.createLabel(node);
        });

        // Create links between nodes
        this.createLinks();
    }

    // This modification ensures arrows go FROM dependency TO dependent (what uses it)
    // The key insight is that in the data structure:
    // - dependencies[A] = [B, C] means "A imports/depends on B and C"
    // - So arrows should go from B→A and C→A (showing B and C are dependencies of A)

    createLinks() {
        // First, collect all connections per node to enable better distribution
        const nodeConnections = {};

        // Initialize empty arrays for each node
        Object.keys(this.nodeObjects).forEach(nodeId => {
            nodeConnections[nodeId] = { incoming: [], outgoing: [] };
        });

        // IMPORTANT: Collect all connections with REVERSED direction for visualization
        // Original data: source → target means "source imports target"
        // But visually we want: target → source to show "target is a dependency of source"
        this.links.forEach(link => {
            const sourceNode = this.nodes[link.source];
            const targetNode = this.nodes[link.target];

            if (!sourceNode || !targetNode) return;
            if ((!sourceNode.visible && sourceNode.visible !== undefined) ||
                (!targetNode.visible && targetNode.visible !== undefined)) return;

            // REVERSE the direction: target → source for visualization
            // This is because target is a dependency of source
            if (nodeConnections[link.target]) {
                nodeConnections[link.target].outgoing.push(link.source);
            }

            if (nodeConnections[link.source]) {
                nodeConnections[link.source].incoming.push(link.target);
            }
        });

        // Now create the links with correct direction: from dependency to dependent
        this.links.forEach(link => {
            const sourceNode = this.nodes[link.source];
            const targetNode = this.nodes[link.target];

            if (!sourceNode || !targetNode) return;
            if ((!sourceNode.visible && sourceNode.visible !== undefined) ||
                (!targetNode.visible && targetNode.visible !== undefined)) return;

            const sourceObj = this.nodeObjects[link.source];
            const targetObj = this.nodeObjects[link.target];
            if (!sourceObj || !targetObj) return;

            // IMPORTANT: REVERSE the visual connection - we want to draw an arrow
            // FROM the dependency (target) TO the dependent (source)
            const visualSource = targetObj;  // The dependency (what is imported)
            const visualTarget = sourceObj;  // The dependent (what imports)

            // Get indices for better connection distribution
            // We're now using the reversed connections we calculated above
            const sourceOutIndex = nodeConnections[link.target].outgoing.indexOf(link.source);
            const sourceOutCount = nodeConnections[link.target].outgoing.length;
            const targetInIndex = nodeConnections[link.source].incoming.indexOf(link.target);
            const targetInCount = nodeConnections[link.source].incoming.length;

            // Get connection points with correct visual direction
            const connectionPoints = this.getConnectionPoints(
                visualSource, visualTarget,  // REVERSED
                sourceOutIndex, sourceOutCount,
                targetInIndex, targetInCount
            );

            const start = connectionPoints.start;
            const end = connectionPoints.end;

            // Create curved path between the adjusted points
            const curvePoints = this.createCurvedLinePath(start, end);

            // Create the base connection line
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0x94a3b8,
                transparent: true,
                opacity: 0.3
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);

            // Store the data relationship but with visual direction in mind
            line.userData = {
                type: 'link',
                source: link.target,  // REVERSED - visual source is the dependency
                target: link.source,  // REVERSED - visual target is the dependent
                // Keep track of the data relationship too (what imports what)
                dataSource: link.source,  // Original data: source imports target
                dataTarget: link.target
            };

            this.scene.add(line);
            this.linkObjects.push(line);

            // If directed, add connection endpoint based on selected style
            if (this.directed) {
                // Get the last two points from the curve to determine arrow direction
                const len = curvePoints.length;
                const pLast = curvePoints[len - 1]; // End point (at visualTarget)
                const pSecondLast = curvePoints[len - 2];

                // Calculate the direction vector of the last segment
                const dir = new THREE.Vector3().subVectors(pLast, pSecondLast).normalize();

                // ARROW STYLE only
                const arrowLength = 5;
                const arrowWidth = 2;

                const tip = pLast.clone();

                const perpendicular = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(arrowWidth);

                const baseCenter = tip.clone().sub(dir.clone().multiplyScalar(arrowLength));
                const baseLeft = baseCenter.clone().add(perpendicular);
                const baseRight = baseCenter.clone().sub(perpendicular);

                const arrowGeometry = new THREE.BufferGeometry();
                const vertices = new Float32Array([
                    tip.x, tip.y, tip.z,
                    baseLeft.x, baseLeft.y, baseLeft.z,
                    baseRight.x, baseRight.y, baseRight.z
                ]);

                arrowGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

                const arrowMaterial = new THREE.MeshBasicMaterial({
                    color: 0x6366F1,
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide
                });

                const arrowMesh = new THREE.Mesh(arrowGeometry, arrowMaterial);

                this.scene.add(arrowMesh);
                this.linkObjects.push(arrowMesh);
            }

        });
    }

    // New method to calculate connection points on the surface of nodes
    // Replace the getConnectionPoints method in DependencyVisualizer.js with this version:
    getConnectionPoints(sourceObj, targetObj, sourceIndex, sourceCount, targetIndex, targetCount) {
        // Get positions and sizes
        const sourcePos = sourceObj.position.clone();
        const targetPos = targetObj.position.clone();

        // Get radii (using scale to account for node size changes)
        const sourceRadius = sourceObj.geometry.parameters.radius * sourceObj.scale.x;
        const targetRadius = targetObj.geometry.parameters.radius * targetObj.scale.x;

        // CORRECT DIRECTION: In our data structure, source depends on target
        // So arrows should go FROM target TO source to show "target is a dependency of source"
        const dirVector = new THREE.Vector3().subVectors(targetPos, sourcePos).normalize();

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
    createCurvedLinePath(start, end) {
        // Create a curved line between points - different for 2D and 3D
        if (this.viewMode === '2d') {
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

    // Create text label for a node
    createLabel(node) {
        // Get device pixel ratio for sharper text
        const pixelRatio = window.devicePixelRatio || 1;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set font first before measuring
        const fontSize = 12;
        context.font = `${fontSize}px Inter, Arial, sans-serif`;

        // Measure text with the correct font
        const textMetrics = context.measureText(node.name);
        const textWidth = textMetrics.width;

        // Add more generous padding (20px total instead of 10px)
        const padding = 10;
        const canvasWidth = Math.ceil(textWidth + padding * 2);
        const canvasHeight = 20;

        // Set canvas size with high resolution for sharp text
        canvas.width = canvasWidth * pixelRatio;
        canvas.height = canvasHeight * pixelRatio;

        // Scale context to account for pixel ratio
        context.scale(pixelRatio, pixelRatio);

        // Clear and set the background
        context.fillStyle = 'rgba(30, 41, 59, 0.85)';
        context.beginPath();
        context.roundRect(0, 0, canvasWidth, canvasHeight, 4);
        context.fill();

        // Set font again after canvas resize (canvas operations reset the context)
        context.font = `${fontSize}px Inter, Arial, sans-serif`;
        context.textBaseline = 'middle';
        context.textAlign = 'left';

        // Enable text anti-aliasing
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        // Draw text with better positioning
        context.fillStyle = '#f8fafc';
        context.fillText(node.name, padding, canvasHeight / 2);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        // Use better filtering for sharper text
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);

        // Position relative to node size
        sprite.position.set(node.x, node.y + node.size * 1.2, node.z);

        // Scale sprite to maintain proper text size
        const spriteScale = 0.25; // Smaller scale factor for better resolution
        sprite.scale.set((canvasWidth / canvasHeight) * spriteScale * canvasHeight, spriteScale * canvasHeight, 1);

        sprite.visible = this.showLabels;

        this.scene.add(sprite);
        this.labelSprites.push({ sprite, nodeId: node.id });
    }

    // Switch between 2D and 3D visualization modes
    setViewMode(mode) {
        // Check if mode is already active
        if (this.viewMode === mode) return;

        this.viewMode = mode;
        console.log(`Switching to ${mode} visualization mode`);

        // Clear current graph
        this.clearGraph();

        // Reposition nodes based on new mode
        this.positionNodes();

        // Create graph with new positions
        this.createGraph();

        // Update camera and controls for new mode
        this.updateCameraAndControls();

        // Show tooltip indicating mode change
        this.showTooltip(`Switched to ${mode.toUpperCase()} visualization`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 2000);

        // Update view mode controls to match
        this.updateViewModeControls();
    }

    // Update camera and controls for current view mode
    updateCameraAndControls() {
        // Save current camera position
        const currentPosition = this.camera ? this.camera.position.clone() : new THREE.Vector3(0, 0, 1000);

        if (this.viewMode === '2d') {
            // Setup 2D camera
            const width = window.innerWidth;
            const height = window.innerHeight;
            const aspectRatio = width / height;
            const frustumSize = 1000;

            this.camera = new THREE.OrthographicCamera(
                frustumSize * aspectRatio / -2,
                frustumSize * aspectRatio / 2,
                frustumSize / 2,
                frustumSize / -2,
                1,
                2000
            );

            // Preserve X and Y position, but force Z to be fixed
            this.camera.position.set(currentPosition.x, currentPosition.y, 1000);
            this.camera.lookAt(0, 0, 0);

            // Dispose of old controls if they exist
            if (this.controls) {
                this.controls.dispose();
            }

            // Create new controls
            this.controls = new TrackballControls(this.camera, this.renderer.domElement);
            this.controls.rotateSpeed = 0;
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 3.0;
            this.controls.noRotate = true;
            this.controls.noPan = false;
            this.controls.staticMoving = true;
            this.controls.dynamicDampingFactor = 0.3;
        } else {
            // Setup 3D camera
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
            this.camera.position.copy(currentPosition);
            this.camera.lookAt(0, 0, 0);

            // Dispose of old controls if they exist
            if (this.controls) {
                this.controls.dispose();
            }

            // Create new controls
            this.controls = new TrackballControls(this.camera, this.renderer.domElement);
            this.controls.rotateSpeed = 1.5;
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 2.0;
            this.controls.noRotate = false;
            this.controls.noPan = false;
        }

        // Apply our custom mouse control setup
        this.setupCustomMouseControls();
    }

    changeMouseControls(useCustomControls = true) {
        if (!this.controls) return;

        if (useCustomControls) {
            // Use the custom control scheme requested by the user
            if (this.viewMode === '3d') {
                // 3D mode: left for rotate, middle for pan
                this.controls.mouseButtons = {
                    LEFT: 0,   // ROTATE
                    MIDDLE: 2, // PAN
                    RIGHT: -1  // Disabled
                };
            } else {
                // 2D mode: left and middle for pan
                this.controls.mouseButtons = {
                    LEFT: 2,   // PAN
                    MIDDLE: 2, // PAN
                    RIGHT: -1  // Disabled
                };
            }
        } else {
            // Default TrackballControls behavior
            this.controls.mouseButtons = {
                LEFT: 0,   // ROTATE
                MIDDLE: 1, // ZOOM
                RIGHT: 2   // PAN
            };
        }
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


    // Position nodes using force-directed layout
    positionNodes() {
        const nodeArray = Object.values(this.nodes).filter(node =>
            node.visible === undefined || node.visible
        );

        // Skip if no nodes to position
        if (nodeArray.length === 0) return;

        // Start with random positions
        nodeArray.forEach(node => {
            node.x = (Math.random() - 0.5) * 1000;
            node.y = (Math.random() - 0.5) * 1000;
            node.z = this.viewMode === '2d' ? 0 : (Math.random() - 0.5) * 1000; // Force z=0 in 2D
        });

        // Run iterations of force-directed algorithm
        const iterations = 150;
        const repulsionForce = this.viewMode === '2d' ? 3000 : 2000; // Stronger in 2D
        const attractionForce = 0.05;

        for (let i = 0; i < iterations; i++) {
            // Calculate repulsion forces between nodes
            this.calculateRepulsionForces(nodeArray, repulsionForce);

            // Calculate attraction forces along links
            this.calculateAttractionForces(nodeArray, attractionForce);

            // Apply forces with cooling factor
            const cooling = 1 - (i / iterations);
            this.applyForces(nodeArray, cooling);
        }

        // Center the graph
        this.centerGraph(nodeArray);
    }

    // Add an alternative approach using a direct event listener approach (in case the above doesn't work)
    setupDirectMouseControls() {
        if (!this.controls || !this.renderer) return;

        const domElement = this.renderer.domElement;
        const controls = this.controls;
        const viewMode = this.viewMode;

        // Create a more direct approach by adding our own listener that 
        // manually handles the mouse events and calls TrackballControls methods
        domElement.addEventListener('mousedown', (event) => {
            if (!controls.enabled) return;

            event.preventDefault();

            // Determine what to do based on which button was pressed
            if (event.button === 0) { // Left button
                if (viewMode === '2d') {
                    // Execute pan directly in 2D mode
                    controls.state = controls.STATE.PAN;
                    controls.handleMouseDownPan(event);
                } else {
                    // Execute rotate in 3D mode
                    controls.state = controls.STATE.ROTATE;
                    controls.handleMouseDownRotate(event);
                }
            } else if (event.button === 1) { // Middle button
                // Always pan with middle button
                controls.state = controls.STATE.PAN;
                controls.handleMouseDownPan(event);
            }

            // Add document listeners to follow through with the operation
            document.addEventListener('mousemove', onMouseMove, false);
            document.addEventListener('mouseup', onMouseUp, false);
        }, false);

        const onMouseMove = (event) => {
            if (!controls.enabled) return;

            event.preventDefault();

            if (controls.state === controls.STATE.ROTATE) {
                controls.handleMouseMoveRotate(event);
            } else if (controls.state === controls.STATE.PAN) {
                controls.handleMouseMovePan(event);
            }
        };

        const onMouseUp = () => {
            if (!controls.enabled) return;

            document.removeEventListener('mousemove', onMouseMove, false);
            document.removeEventListener('mouseup', onMouseUp, false);

            controls.state = controls.STATE.NONE;
        };
    }

    // Calculate repulsion forces between nodes
    calculateRepulsionForces(nodeArray, repulsionForce) {
        for (let a = 0; a < nodeArray.length; a++) {
            const nodeA = nodeArray[a];

            let forceX = 0;
            let forceY = 0;
            let forceZ = 0;

            for (let b = 0; b < nodeArray.length; b++) {
                if (a === b) continue;

                const nodeB = nodeArray[b];

                const dx = nodeA.x - nodeB.x;
                const dy = nodeA.y - nodeB.y;
                const dz = this.viewMode === '2d' ? 0 : nodeA.z - nodeB.z; // No z force in 2D

                // Calculate distance based on view mode
                const distance = this.viewMode === '2d'
                    ? Math.sqrt(dx * dx + dy * dy) || 1
                    : Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                // Enhanced repulsion formula to create better spacing
                // More repulsion for closer nodes to prevent overlapping
                const force = repulsionForce / (Math.pow(distance, 1.8) + 0.1);

                forceX += dx / distance * force;
                forceY += dy / distance * force;
                if (this.viewMode === '3d') {
                    forceZ += dz / distance * force;
                }
            }

            nodeA.forceX = forceX;
            nodeA.forceY = forceY;
            nodeA.forceZ = forceZ;
        }
    }

    // Calculate attraction forces along links
    calculateAttractionForces(nodeArray, attractionForce) {
        // Get visible node IDs for quick lookup
        const visibleNodeIds = new Set(nodeArray.map(n => n.id));

        this.links.forEach(link => {
            // Skip links where either end is not visible
            if (!visibleNodeIds.has(link.source) || !visibleNodeIds.has(link.target)) {
                return;
            }

            const sourceNode = this.nodes[link.source];
            const targetNode = this.nodes[link.target];

            if (!sourceNode || !targetNode) return;

            const dx = sourceNode.x - targetNode.x;
            const dy = sourceNode.y - targetNode.y;
            const dz = this.viewMode === '2d' ? 0 : sourceNode.z - targetNode.z;

            // Calculate distance based on view mode
            const distance = this.viewMode === '2d'
                ? Math.sqrt(dx * dx + dy * dy) || 1
                : Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

            // Attraction force (Hooke's law)
            const force = attractionForce * distance;

            const fx = dx / distance * force;
            const fy = dy / distance * force;
            const fz = this.viewMode === '3d' ? dz / distance * force : 0;

            sourceNode.forceX = (sourceNode.forceX || 0) - fx;
            sourceNode.forceY = (sourceNode.forceY || 0) - fy;
            sourceNode.forceZ = (sourceNode.forceZ || 0) - fz;

            targetNode.forceX = (targetNode.forceX || 0) + fx;
            targetNode.forceY = (targetNode.forceY || 0) + fy;
            targetNode.forceZ = (targetNode.forceZ || 0) + fz;
        });
    }

    // Apply calculated forces to nodes
    applyForces(nodeArray, cooling) {
        nodeArray.forEach(node => {
            node.x += (node.forceX || 0) * cooling;
            node.y += (node.forceY || 0) * cooling;
            if (this.viewMode === '3d') {
                node.z += (node.forceZ || 0) * cooling;
            } else {
                node.z = 0; // Force z=0 in 2D mode
            }

            // Clear forces for next iteration
            node.forceX = 0;
            node.forceY = 0;
            node.forceZ = 0;
        });
    }

    // Center the graph in the viewport
    centerGraph(nodeArray) {
        let centerX = 0, centerY = 0, centerZ = 0;

        nodeArray.forEach(node => {
            centerX += node.x;
            centerY += node.y;
            if (this.viewMode === '3d') {
                centerZ += node.z;
            }
        });

        centerX /= nodeArray.length;
        centerY /= nodeArray.length;
        if (this.viewMode === '3d') {
            centerZ /= nodeArray.length;
        }

        nodeArray.forEach(node => {
            node.x -= centerX;
            node.y -= centerY;
            if (this.viewMode === '3d') {
                node.z -= centerZ;
            }
        });
    }

    // Clear existing graph objects
    clearGraph() {
        // Remove node objects
        Object.values(this.nodeObjects).forEach(obj => {
            this.scene.remove(obj);
        });

        // Remove link objects
        this.linkObjects.forEach(obj => {
            this.scene.remove(obj);
        });

        // Remove label sprites
        this.labelSprites.forEach(({ sprite }) => {
            this.scene.remove(sprite);
        });

        // Reset collections
        this.nodeObjects = {};
        this.linkObjects = [];
        this.labelSprites = [];
    }

    // Animation loop
    animate() {
        requestAnimationFrame(this.animate.bind(this));

        if (this.controls) this.controls.update();
        if (this.labelSprites.length > 0) this.updateLabelPositions();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // Update label positions to follow nodes
    updateLabelPositions() {
        // Get camera position for label orientation
        const cameraPosition = this.camera.position.clone();

        this.labelSprites.forEach(({ sprite, nodeId }) => {
            const nodeObj = this.nodeObjects[nodeId];
            if (nodeObj) {
                // Position above node
                sprite.position.set(
                    nodeObj.position.x,
                    nodeObj.position.y + nodeObj.scale.y * 12,
                    nodeObj.position.z
                );

                // Make label face camera
                sprite.lookAt(cameraPosition);
            }
        });
    }

    // Handle mouse movement for hover effects
    onMouseMove(event) {
        // Make sure we have all necessary components
        if (!this.camera || !this.raycaster || !this.nodeObjects ||
            Object.keys(this.nodeObjects).length === 0) {
            return;
        }

        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        try {
            // Update picking ray
            this.raycaster.setFromCamera(this.mouse, this.camera);

            // Find intersections with nodes
            const intersects = this.raycaster.intersectObjects(Object.values(this.nodeObjects));

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
                    const nodeData = object.userData;
                    this.updateInfoPanel(nodeData);

                    // Highlight connections
                    this.highlightConnections(nodeData.id);
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

    highlightConnections(nodeId) {
        // Reset previous highlights
        this.resetHighlights();

        // Highlight links connected to this node
        this.linkObjects.forEach(link => {
            // Check against both visual direction and data relationship
            if (link.userData.source === nodeId || link.userData.target === nodeId ||
                link.userData.dataSource === nodeId || link.userData.dataTarget === nodeId) {

                link.material.color.setHex(0x6366f1); // Primary color
                const currentOpacity = link.material.opacity;
                const highlightFactor = 2.5; // Increase visibility but respect user setting
                link.material.opacity = Math.min(currentOpacity * highlightFactor, 1.0);

                // Determine which node is connected
                let connectedNodeId;

                // If nodeId matches the visual source or target, use the opposite
                if (link.userData.source === nodeId) {
                    connectedNodeId = link.userData.target;
                } else if (link.userData.target === nodeId) {
                    connectedNodeId = link.userData.source;
                }
                // Otherwise use the data relationship
                else if (link.userData.dataSource === nodeId) {
                    connectedNodeId = link.userData.dataTarget;
                } else if (link.userData.dataTarget === nodeId) {
                    connectedNodeId = link.userData.dataSource;
                }

                // Highlight the connected node
                const connectedNode = this.nodeObjects[connectedNodeId];
                if (connectedNode) {
                    connectedNode.material.emissive.setHex(0x333333);
                }
            }
        });
    }

    // Update resetHighlights to restore user-defined opacity
    resetHighlights() {
        // Get current user-defined opacity
        const userOpacity = parseFloat(document.getElementById('link-opacity')?.value || 0.2);

        // Reset link highlights
        this.linkObjects.forEach(link => {
            link.material.color.setHex(0x94a3b8);
            link.material.opacity = userOpacity; // Use user-defined opacity
        });

        // Reset node highlights
        Object.values(this.nodeObjects).forEach(node => {
            if (node !== this.hoveredObject && node !== this.selectedObject) {
                node.material.emissive.setHex(0x000000);
            }
        });
    }

    // Reset camera to default position
    resetCamera() {
        // Get current position
        const startPosition = this.camera.position.clone();
        const endPosition = new THREE.Vector3(0, 0, 1000);
        const duration = 1000; // ms
        const startTime = Date.now();

        // Animate camera movement
        const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease function (cubic)
            const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            // Interpolate position
            const x = startPosition.x + (endPosition.x - startPosition.x) * ease;
            const y = startPosition.y + (endPosition.y - startPosition.y) * ease;
            const z = startPosition.z + (endPosition.z - startPosition.z) * ease;

            this.camera.position.set(x, y, z);
            this.camera.lookAt(0, 0, 0);

            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            } else {
                this.controls.reset();

                // Handle specific camera type adjustments
                if (this.viewMode === '2d' && this.camera.isOrthographicCamera) {
                    const width = window.innerWidth;
                    const height = window.innerHeight;
                    const aspectRatio = width / height;
                    const frustumSize = 1000;

                    this.camera.left = frustumSize * aspectRatio / -2;
                    this.camera.right = frustumSize * aspectRatio / 2;
                    this.camera.top = frustumSize / 2;
                    this.camera.bottom = frustumSize / -2;
                    this.camera.updateProjectionMatrix();
                }
            }
        };

        animateCamera();

        // Show confirmation tooltip
        this.showTooltip('Camera view has been reset', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 2000);
    }

    // Toggle label visibility
    toggleLabels() {
        this.showLabels = !this.showLabels;

        this.labelSprites.forEach(({ sprite }) => {
            sprite.visible = this.showLabels;
        });

        // Show confirmation tooltip
        this.showTooltip(this.showLabels ? 'Labels turned on' : 'Labels turned off', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 2000);
    }

    // Handle window resize
    handleResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (this.viewMode === '2d' && this.camera.isOrthographicCamera) {
            // Update orthographic camera
            const aspectRatio = width / height;
            const frustumSize = 1000;

            this.camera.left = frustumSize * aspectRatio / -2;
            this.camera.right = frustumSize * aspectRatio / 2;
            this.camera.top = frustumSize / 2;
            this.camera.bottom = frustumSize / -2;
        } else if (this.camera.isPerspectiveCamera) {
            // Update perspective camera
            this.camera.aspect = width / height;
        }

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);

        if (this.controls) {
            this.controls.handleResize();
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

        // Recreate graph with filtered nodes
        this.clearGraph();
        this.createGraph();

        // Show confirmation
        this.showTooltip('Filters applied', {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 1000);
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

    // Method to set up search functionality
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
            const nodeObj = this.nodeObjects[nodeId];
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
        // Restore original materials for all highlighted nodes
        this.searchHighlightedNodes.forEach(nodeId => {
            const nodeObj = this.nodeObjects[nodeId];
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
        // Get current camera position
        const currentPos = this.camera.position.clone();

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
            this.camera.position.copy(newPos);

            // Continue animation if not finished
            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        };

        // Start animation
        animateCamera();
    }
}
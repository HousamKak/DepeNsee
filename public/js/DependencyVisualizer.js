//------------------------------------------------------------------------
// js/DependencyVisualizer.js (Visualization class)
//------------------------------------------------------------------------

import * as THREE from 'https://cdn.skypack.dev/three@0.128.0';
import { TrackballControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/TrackballControls.js';
import { buildDependencyData, getDependencyChain } from './utils.js';

export class DependencyVisualizer {
    constructor() {
        this.directed = false;
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
        this.minConnections = 0;
        this.tooltip = this.createTooltip();
        this.viewMode = '2d'; // Default to 2D mode
        this.connectionStyle = 'receptor'; // Default to receptor style ('receptor' or 'arrow')
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

        // DOM Elements - set up in initUI
        this.sidebar = null;
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

            // Create the connection style toggle
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'form-group';
            toggleContainer.innerHTML = `
                <label for="connection-style-toggle">Connection Style</label>
                <select id="connection-style-toggle" class="form-control">
                    <option value="receptor">Receptor Style</option>
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

        // Set up event listener
        if (connectionStyleToggle) {
            connectionStyleToggle.addEventListener('change', (e) => {
                this.connectionStyle = e.target.value;
                // Rebuild the graph to update connection styles
                this.clearGraph();
                this.createGraph();
                // Show a tooltip to confirm the change
                this.showTooltip(`Connection style changed to ${this.connectionStyle}`, {
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 2
                }, 1500);
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

        // Minimum connections slider
        const minConnectionsSlider = document.getElementById('min-connections');
        if (minConnectionsSlider) {
            minConnectionsSlider.addEventListener('input', (e) => {
                this.minConnections = parseInt(e.target.value);
                const valueDisplay = document.getElementById('min-connections-value');
                if (valueDisplay) {
                    valueDisplay.textContent = this.minConnections;
                }
            });
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
        // Store raw data for filtering
        this.rawData = data;

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

        // Add initial hint
        this.showTooltip(`${this.viewMode === '2d' ? '2D' : '3D'} visualization loaded. Hover over nodes to see details.`, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        }, 3000);

        // Make sure 2D/3D toggle reflects correct mode
        this.updateViewModeControls();
    }

    // Initialize Three.js scene, camera, renderer
    initThree() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a); // Match sidebar background

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

        // Create controls based on view mode
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 1.5;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.keys = ['KeyA', 'KeyS', 'KeyD'];

        // Disable rotation in 2D mode
        if (this.viewMode === '2d') {
            this.controls.rotateSpeed = 0; // Disable rotation completely
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 1.5; // Increase pan speed for better response
            this.controls.noRotate = true; // Disable rotation
            this.controls.staticMoving = true;
            this.controls.noPan = false; // Explicitly enable panning
            this.controls.enabled = true; // Make sure controls are enabled
        }

        // Add lights for better rendering
        this.addLights();
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
            if (node.connections < this.minConnections) return;

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

    // 1. Update the createLinks method to reverse the way it draws connections
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
            if (sourceNode.connections < this.minConnections || targetNode.connections < this.minConnections) return;
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
            if (sourceNode.connections < this.minConnections || targetNode.connections < this.minConnections) return;
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

                if (this.connectionStyle === 'receptor') {
                    // RECEPTOR STYLE
                    const receptorSize = 2.5;

                    const receptorGeometry = new THREE.CircleGeometry(receptorSize, 16);
                    const receptorMaterial = new THREE.MeshBasicMaterial({
                        color: 0x6366F1,
                        transparent: true,
                        opacity: 0.9,
                        side: THREE.DoubleSide
                    });

                    const receptor = new THREE.Mesh(receptorGeometry, receptorMaterial);

                    // Position right at end point (which is already on the surface)
                    receptor.position.copy(pLast);

                    // Rotation logic based on view mode
                    if (this.viewMode === '3d') {
                        receptor.lookAt(pSecondLast);
                        receptor.rotateX(Math.PI / 2);
                    } else {
                        const angle = Math.atan2(dir.y, dir.x) - Math.PI / 2;
                        receptor.rotation.z = angle;
                    }

                    // Add a subtle glow effect
                    const glowGeometry = new THREE.CircleGeometry(receptorSize * 1.8, 16);
                    const glowMaterial = new THREE.MeshBasicMaterial({
                        color: 0x6366F1,
                        transparent: true,
                        opacity: 0.3,
                        side: THREE.DoubleSide
                    });

                    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
                    glow.position.copy(pLast);

                    // Apply same rotation as receptor
                    glow.rotation.copy(receptor.rotation);

                    this.scene.add(receptor);
                    this.scene.add(glow);
                    this.linkObjects.push(receptor, glow);
                } else {
                    // ARROW STYLE
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
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '24px Inter, sans-serif';

        // Get text width
        const textWidth = context.measureText(node.name).width;

        // Set canvas size
        canvas.width = textWidth + 20;
        canvas.height = 40;

        // Draw background with rounded corners
        context.fillStyle = 'rgba(30, 41, 59, 0.85)';
        context.beginPath();
        context.roundRect(0, 0, canvas.width, canvas.height, 8);
        context.fill();

        // Draw text
        context.font = '24px Inter, sans-serif';
        context.fillStyle = '#f8fafc';
        context.fillText(node.name, 10, 28);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);

        sprite.position.set(node.x, node.y + 15, node.z);
        sprite.scale.set(canvas.width / 2, canvas.height / 2, 1);
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
            // Switch to orthographic camera for 2D
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

            // Create new controls specifically configured for smooth 2D panning
            this.controls = new TrackballControls(this.camera, this.renderer.domElement);
            this.controls.rotateSpeed = 0; // Disable rotation completely
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 1.5; // Increase pan speed for better response
            this.controls.noRotate = true; // Disable rotation
            this.controls.staticMoving = true;
            this.controls.noPan = false; // Explicitly enable panning
            this.controls.enabled = true; // Make sure controls are enabled
        } else {
            // Switch to perspective camera for 3D
            this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);

            // Preserve camera position
            this.camera.position.copy(currentPosition);
            this.camera.lookAt(0, 0, 0);

            // Dispose of old controls if they exist
            if (this.controls) {
                this.controls.dispose();
            }

            // Create new controls for 3D mode
            this.controls = new TrackballControls(this.camera, this.renderer.domElement);
            this.controls.rotateSpeed = 1.5;
            this.controls.zoomSpeed = 1.2;
            this.controls.panSpeed = 0.8;
            this.controls.keys = ['KeyA', 'KeyS', 'KeyD'];
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
                link.material.opacity = 0.8;

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

    // Reset all highlights
    resetHighlights() {
        // Reset link highlights
        this.linkObjects.forEach(link => {
            link.material.color.setHex(0x94a3b8);
            link.material.opacity = 0.2;
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
            // Skip nodes with too few connections
            if (node.connections < this.minConnections) {
                node.visible = false;
                return;
            }

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
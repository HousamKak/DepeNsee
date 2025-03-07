//------------------------------------------------------------------------
// js/main.js (Main initialization code)
//------------------------------------------------------------------------

// Import modules
import { DependencyVisualizer } from './DependencyVisualizer.js';
import { createMockData } from './dataHandlers.js';

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing application...');
    
    setupPolyfills();
    setupEventListeners();
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
            analyzeProject(path);
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
    toggleButton.addEventListener('click', function() {
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
async function analyzeProject(path) {
    try {
        document.getElementById('loading-container').classList.remove('hidden');
        document.getElementById('welcome-modal').classList.add('hidden');
        
        // Mark body as having visualization active
        document.body.classList.add('visualization-active');
        
        // Make API request to analyze project
        const response = await fetch(`/api/analyze?path=${encodeURIComponent(path)}`);
        
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
    
    // Create mock data
    const mockData = createMockData();
    
    // Create visualization
    await initializeVisualization(mockData);
    
    document.getElementById('loading-container').classList.add('hidden');
}

// Initialize visualization with data
async function initializeVisualization(data) {
    // Add a small delay to ensure DOM is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create visualizer
    const visualizer = new DependencyVisualizer();
    
    // Set up sidebar toggle after modal is closed
    setupSidebarToggle();
    
    // Initialize visualization with 2D mode by default
    await visualizer.init(data, '2d');
    
    console.log('Visualization initialized successfully');
}
# Dependency Visualization

**Dependency Visualization** is a tool that analyzes the dependencies in your JavaScript/TypeScript project and displays them in an interactive, 2D/3D graph. It extracts import statements from your project files, builds a dependency graph (including external libraries), and provides interactive controls (filters, toggles, zoom, pan, and rotate) to explore your project's structure.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Running the Analyzer](#running-the-analyzer)
  - [Demo Mode](#demo-mode)
- [Navigation and Controls](#navigation-and-controls)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Dependencies](#dependencies)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- **File Dependency Analysis:**  
  Recursively scans a given project directory and parses JavaScript/TypeScript files to extract local and library dependencies using [Babel Parser](https://babeljs.io/docs/en/babel-parser) and [Babel Traverse](https://babeljs.io/docs/en/babel-traverse).

- **Intuitive Graph Visualization:**  
  Renders an interactive graph of the project's dependency tree with nodes representing files (or libraries) and arrows showing dependency relationships. Arrows correctly point FROM dependencies TO dependents, making it clear which files are being imported by others.

- **Interactive Controls:**  
  - **Toggle between 2D and 3D:** Easily switch views with a toggle control.
  - **Filtering:** Apply filters based on filename, file type, libraries, and connection counts.
  - **Search:** Find and highlight specific nodes with the search bar in the top right.
  - **View Details:** Hover over nodes to display file or library details (including dependency counts).
  - **Camera Controls:** Reset, pan, zoom, and rotate (3D view only) for a better exploration experience.

- **Advanced Search and Navigation:**
  - Quick search functionality to locate specific files in large codebases
  - Automated camera focusing on search results
  - Visual highlighting of matched nodes
  - Clear indication of both dependencies and dependents

- **Directed Graph Options:**
  - Toggle directed/undirected graph visualization
  - Customize node sizes and connection opacity

- **Demo Mode:**  
  Load a set of mock dependency data to quickly explore the visualization without needing to analyze a real project.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (version ≥ 14.0.0 recommended)
- npm (comes with Node.js) or yarn

### Steps

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/dependency-visualization.git
   cd dependency-visualization
   ```

2. **Install dependencies:**

   Using npm:

   ```bash
   npm install
   ```

   Or using yarn:

   ```bash
   yarn install
   ```

3. **Run the application:**

   For production:

   ```bash
   npm start
   ```

   For development (with nodemon):

   ```bash
   npm run dev
   ```

4. **Open in browser:**  
   Navigate to [http://localhost:3000](http://localhost:3000) in your web browser to start visualizing your project dependencies.

## Usage

### Running the Analyzer

- **Project Path Input:**  
  Upon launching the application, a welcome modal appears. Enter the absolute path to the project directory you want to analyze (for example, `C:\path\to\your\project` on Windows or `/path/to/your/project` on Unix-based systems).

- **Analyze Button:**  
  Click the **Analyze Project** button. The server will then scan the provided directory, extract dependencies, and send the data to the client, where it is rendered as an interactive graph.

### Demo Mode

- If you do not have a project path handy or want to test the visualization, click the **Try with Demo Data** button. This will load a set of mock data that simulates a realistic project dependency graph.

## Navigation and Controls

### Basic Controls

- **Rotate:** Left-click + drag (3D mode only)
- **Pan:** Right-click + drag
- **Zoom:** Scroll wheel
- **View File Details:** Hover over any node

### Search and Filtering

- **Quick Search:** Use the search box in the top right corner to find specific files or libraries
- **Filename Filter:** Filter by partial filename match in the sidebar
- **File Type Filter:** Show only specific file types (.js, .ts, .tsx, etc.)
- **Library Filter:** Focus on specific library dependencies
- **Dependency Analysis:** Show selected nodes along with their dependencies, dependents, or both

### Visualization Options

- **2D/3D Toggle:** Switch between 2D and 3D visualization modes
- **Directed Graph:** Enable/disable directional arrows
- **Node Size:** Adjust the size of nodes
- **Link Opacity:** Control the opacity of connection lines

## Project Structure

```
Dependency Visualization/
├── .gitignore
├── file-dependency-analyzer.js
├── file_selector.log
├── package-lock.json
├── package.json
├── public/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── dataHandlers.js
│   │   ├── DependencyVisualizer.js
│   │   ├── main.js
│   │   └── utils.js
│   └── index.html
├── README.md
└── server.js

```

- **file-dependency-analyzer.js:**  
  Contains the logic to scan directories, parse JavaScript/TypeScript files, and build a dependency graph. It uses Babel to parse files and traverse their ASTs.

- **public/**  
  Hosts the front-end code:
  - **index.html:** The main HTML page that includes the welcome modal, sidebar controls, and visualization container.
  - **css/styles.css:** All styling rules for the layout, buttons, modals, and toggle switches.
  - **js/main.js:** The entry point that sets up polyfills, event listeners, and initializes the visualization.
  - **js/DependencyVisualizer.js:** A class that uses Three.js (with TrackballControls) to render and interact with the dependency graph.
  - **js/dataHandlers.js and js/utils.js:** Helper functions for data processing and mock data generation.

- **server.js:**  
  Sets up an Express server that serves static files and provides an API endpoint (`/api/analyze?path=...`) to trigger the dependency analysis on a given project directory.

## Configuration

- **Node Engine Requirement:**  
  The project requires Node.js version 14.0.0 or later (as specified in `package.json`).

- **Port Configuration:**  
  The server runs on port 3000 by default. You can override this by setting the `PORT` environment variable before starting the server.

- **Dependencies:**  
  The analysis uses:
  - `@babel/parser` and `@babel/traverse` for parsing code.
  - `express` for the web server.
  - `nodemon` is available for development to automatically restart the server when files change.
  
  The front end uses:
  - `three.js` for the 3D rendering.
  - `dat.gui` and `lodash` for UI controls and utility functions.
  
  Additional libraries and tools are installed as per `package-lock.json`.

## Dependencies

Some of the key dependencies include:

- **@babel/parser & @babel/traverse:**  
  Parse and analyze JavaScript/TypeScript code.

- **Express:**  
  A fast, unopinionated, minimalist web framework for Node.js.

- **Three.js:**  
  Used on the client side for creating and rendering the interactive dependency graph in 2D/3D.

- **Nodemon:**  
  Facilitates development by restarting the server automatically when file changes are detected.

## Troubleshooting

- **Project Path Errors:**  
  Ensure that the path you enter in the welcome modal exists and that your application has permission to access it. Incorrect paths will result in an error message.

- **Search Not Highlighting Results:**  
  If search results aren't highlighting, ensure JavaScript is fully loaded and try clicking the search button rather than pressing Enter.

- **Long Analysis Times:**  
  For very large projects, the dependency analysis may take a few minutes. The server timeout is set to 2 minutes by default, but you can adjust it in `server.js` if needed.

- **Dependency Direction Issues:**  
  The arrows should point FROM dependencies TO dependents (i.e., from imported modules toward the importing file). If arrows appear backwards, check if the directed graph toggle is enabled.

- **3D View Controls:**  
  In 2D mode the camera is orthographic, and rotation is disabled. To see full 3D interaction, switch to the 3D mode using the toggle.

## License

This project is licensed under the [MIT License](LICENSE).

---

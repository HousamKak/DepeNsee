# Project Dependency Graph Visualizer

A powerful 3D visualization tool for analyzing and exploring dependencies between files in JavaScript and TypeScript projects. This interactive tool helps developers understand project structure, identify potential refactoring opportunities, and visualize how different parts of a codebase are connected.

![Dependency Graph Visualizer Screenshot](https://placeholder-image.com/dependency-visualizer.png)

## Features

- **Interactive 3D Visualization**: Explore your project's dependency graph in three dimensions
- **Automatic Analysis**: Scans your project directory to extract import/export relationships
- **Force-Directed Layout**: Automatically arranges files based on their interconnections  
- **Type Differentiation**: Color-coding for different file types (.ts, .js, .tsx, .jsx)
- **Library Dependency Tracking**: Identifies and visualizes external library dependencies
- **Advanced Filtering**: Filter by file type, library, filename, or number of connections
- **Connection Highlighting**: Hover over a file to highlight its connections to other files
- **Detailed Information**: Inspect file details such as path, type, and connection count
- **Customizable View**: Toggle labels, reset camera position, and adjust visualization parameters

## Installation

### Prerequisites

- Node.js (v14.0.0 or higher)
- NPM (v6.0.0 or higher)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/dependency-graph-visualizer.git
   cd dependency-graph-visualizer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

### Analyzing Your Project

1. Enter the absolute path to your project directory in the input field. For example:
   - Windows: `C:\Users\username\projects\my-project`
   - macOS/Linux: `/home/username/projects/my-project`

2. Click "Analyze Project" to start the analysis process.

3. Wait for the analysis to complete - this may take a few seconds to a few minutes depending on the size of your project.

### Demo Mode

If you want to see how the tool works without analyzing a specific project:

1. Click the "Load Demo Data" button to generate sample project data.
2. Explore the visualization features with the generated demo data.

### Interacting with the Visualization

- **Rotate View**: Left-click and drag
- **Pan View**: Right-click and drag 
- **Zoom**: Scroll wheel
- **Reset Camera**: Click the "Reset Camera" button to return to the default view
- **Toggle Labels**: Click the "Toggle Labels" button to show/hide file names

### Filtering and Analysis

- **Filter by Filename**: Type in the filename filter input to show only files matching the text
- **Filter by File Type**: Use the file type dropdown to focus on specific file extensions
- **Filter by Library**: Use the library dropdown to focus on files that import a specific library
- **Minimum Connections**: Adjust the slider to hide nodes with fewer than the selected number of connections

### Understanding the Visualization

- **Node Colors**:
  - **Orange**: TypeScript (.ts) files
  - **Blue**: JavaScript (.js) files
  - **Pink**: TypeScript React (.tsx) files
  - **Teal**: JavaScript React (.jsx) files
  - **Gray**: External libraries

- **Node Size**: Corresponds to file size (larger files = larger nodes)
- **Connections**: Lines between nodes represent import/export relationships
- **Information Panel**: Hover over any node to see detailed information about the file

## How It Works

### Analysis Process

1. **Scanning**: The analyzer recursively traverses your project directory, finding all JavaScript and TypeScript files.

2. **Parsing**: Each file is parsed using the Babel parser to extract import statements:
   ```javascript
   import React from 'react';
   import { Component } from './component';
   ```

3. **Dependency Mapping**: The analyzer builds a graph structure where:
   - Nodes represent files or libraries
   - Edges represent import relationships

4. **Visualization**: The dependency data is rendered in 3D using Three.js with:
   - Force-directed layout for automatic positioning
   - Interactive controls for exploration
   - Visual elements to represent file types and relationships

### Technical Implementation

- **Server**: Node.js with Express serves the web application and handles analysis requests
- **File Analysis**: Babel parser extracts import/export information
- **Visualization**: Three.js renders the 3D graph with TrackballControls for navigation
- **UI Controls**: dat.GUI provides adjustable parameters for visualization

## Advanced Configuration

### Custom Styling

You can modify the color scheme and other visual properties by adjusting the `colorMap` in the DependencyVisualizer class:

```javascript
this.colorMap = {
  '.ts': 0xff7700,   // Orange
  '.js': 0x00aaff,   // Blue
  '.tsx': 0xff00aa,  // Pink
  '.jsx': 0x00ffaa,  // Teal
  'library': 0xaaaaaa // Gray
};
```

### Performance Optimization

For very large projects, you might want to adjust the analysis and visualization parameters:

1. Modify the `server.js` file to increase timeout limits
2. Adjust the force-directed layout parameters in the `positionNodes()` method
3. Use the minimum connections filter to reduce the number of displayed nodes

## Project Structure

```
dependency-graph-visualizer/
├── file-dependency-analyzer.js  # Core analysis module
├── package.json                 # Project dependencies
├── README.md                    # Project documentation
├── server.js                    # Express server
└── public/                      # Static web assets
    └── index.html               # Main visualization interface
```

### Key Components

- **file-dependency-analyzer.js**: Contains the `FileDependencyAnalyzer` class that scans and analyzes project files
- **server.js**: Provides the Express server and API endpoint for project analysis
- **index.html**: Contains the visualization interface, Three.js implementation, and user controls

## Troubleshooting

### Common Issues

1. **Path Issues**: Ensure you're using absolute paths when analyzing a project
2. **Large Projects**: For very large projects, the analysis might take longer or require more memory
3. **Parse Errors**: Some complex or non-standard syntax might cause parse errors, but the analyzer will continue with other files

### Browser Compatibility

The visualization relies on modern web technologies and works best in:
- Chrome (latest)
- Firefox (latest)
- Edge (latest)
- Safari (latest)

## Contributing

Contributions are welcome! Here are some ways you can contribute:

1. **Bug Reports**: Open an issue describing the bug and steps to reproduce
2. **Feature Requests**: Suggest new features or improvements
3. **Code Contributions**: Submit pull requests for bug fixes or features
4. **Documentation**: Improve or expand the documentation

Please follow the existing code style and add appropriate tests for new features.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Three.js](https://threejs.org/) for 3D visualization
- [Babel](https://babeljs.io/) for JavaScript/TypeScript parsing
- [Express](https://expressjs.com/) for the web server
- [dat.GUI](https://github.com/dataarts/dat.gui) for the interface controls

---

## Future Enhancements

Planned features for future releases:

- **Export Options**: Save visualization as images or interactive HTML
- **Circular Dependency Detection**: Identify and highlight circular dependencies
- **Module Analysis**: Group files by modules or packages
- **Change Impact Analysis**: Visualize the potential impact of changing a file
- **Integration with Build Tools**: Direct integration with Webpack, Rollup, etc.
- **Version Control Integration**: Compare dependencies across different commits
- **Custom Layout Algorithms**: Additional layout options for different visualization styles

## Contact

For questions, suggestions, or collaboration opportunities, please open an issue or contact [your-email@example.com](mailto:your-email@example.com).
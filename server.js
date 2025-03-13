// Update server.js to include method parsing information

const express = require('express');
const path = require('path');
const fs = require('fs');
const FileDependencyAnalyzer = require('./file-dependency-analyzer');

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files
app.use(express.static('public'));

// Extend timeout for large projects
app.use((req, res, next) => {
  res.setTimeout(180000); // 3 minutes for method parsing (more time needed)
  next();
});

// API endpoint to analyze project
app.get('/api/analyze', async (req, res) => {
  try {
    const projectPath = req.query.path || process.cwd();
    
    // Add option for method parsing
    const includeMethodParsing = req.query.methodParsing !== 'false'; // Default to true

    // Validate the path
    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({ error: `Path does not exist: ${projectPath}` });
    }

    console.log(`Analyzing project at: ${projectPath}`);
    console.log(`Method parsing enabled: ${includeMethodParsing}`);

    // Create analyzer and analyze the project
    const analyzer = new FileDependencyAnalyzer(projectPath);
    const data = await analyzer.analyze();

    // If method parsing is disabled, remove method data to reduce response size
    if (!includeMethodParsing) {
      delete data.methodInfo;
      delete data.methodDependencies;
    }

    res.json(data);
  } catch (error) {
    console.error('Error analyzing project:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to get method details for a specific file
app.get('/api/file-methods', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    // Validate the file path
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: `File does not exist: ${filePath}` });
    }
    
    console.log(`Getting method details for: ${filePath}`);
    
    // Read the file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Create a temporary analyzer just for this file
    const analyzer = new FileDependencyAnalyzer(path.dirname(filePath));
    
    // Extract method info from the file
    await analyzer.extractMethodInfo(filePath, fileContent);
    
    // Return method data
    res.json({
      methodInfo: analyzer.methodInfo[path.basename(filePath)],
      methodDependencies: analyzer.methodDependencies[path.basename(filePath)]
    });
    
  } catch (error) {
    console.error('Error getting method details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create a simple favicon.ico to avoid 404 errors
app.get('/favicon.ico', (req, res) => {
  res.sendStatus(204); // No content
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT} to visualize your project dependencies`);
});
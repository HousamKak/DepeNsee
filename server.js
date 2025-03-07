// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const FileDependencyAnalyzer = require('./file-dependency-analyzer');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// Extend timeout for large projects
app.use((req, res, next) => {
  res.setTimeout(120000); // 2 minutes
  next();
});

// API endpoint to analyze project
app.get('/api/analyze', async (req, res) => {
  try {
    const projectPath = req.query.path || process.cwd();
    
    // Validate the path
    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({ error: `Path does not exist: ${projectPath}` });
    }
    
    console.log(`Analyzing project at: ${projectPath}`);
    
    // Create analyzer and analyze the project
    const analyzer = new FileDependencyAnalyzer(projectPath);
    const data = await analyzer.analyze();
    
    res.json(data);
  } catch (error) {
    console.error('Error analyzing project:', error);
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
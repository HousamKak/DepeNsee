const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

class FileDependencyAnalyzer {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.dependencies = {};
    this.nodeInfo = {};
    this.libraries = new Set();
    this.fileTypes = new Set();
  }

  async analyze() {
    console.log('Starting dependency analysis...');
    await this.processDirectory(this.rootDir);
    return {
      dependencies: this.dependencies,
      nodeInfo: this.nodeInfo,
      libraries: Array.from(this.libraries),
      fileTypes: Array.from(this.fileTypes),
    };
  }

  async processDirectory(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Ignore node_modules and dist directories
          if (entry.name !== 'node_modules' && entry.name !== 'dist') {
            await this.processDirectory(fullPath);
          }
        } else if (this.isJsOrTsFile(entry.name)) {
          await this.processFile(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error processing directory ${dirPath}:`, error);
    }
  }

  isJsOrTsFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.js', '.jsx', '.ts', '.tsx'].includes(ext);
  }

  async processFile(filePath) {
    try {
      const relativePath = path.relative(this.rootDir, filePath);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const fileExt = path.extname(filePath).toLowerCase();
      
      this.fileTypes.add(fileExt);
      
      // Initialize node info
      if (!this.nodeInfo[relativePath]) {
        this.nodeInfo[relativePath] = {
          name: path.basename(filePath),
          path: relativePath,
          type: fileExt,
          size: fileContent.length,
        };
      }
      
      // Initialize dependencies array for this file
      if (!this.dependencies[relativePath]) {
        this.dependencies[relativePath] = [];
      }
      
      // Parse the file to extract imports
      try {
        const ast = parser.parse(fileContent, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
        });

        traverse(ast, {
          ImportDeclaration: ({ node }) => {
            const importPath = node.source.value;
            
            // Check if it's a library import or local file
            if (importPath.startsWith('.') || importPath.startsWith('/')) {
              let resolvedPath = this.resolveLocalImport(importPath, filePath);
              if (resolvedPath) {
                const relativeResolved = path.relative(this.rootDir, resolvedPath);
                if (!this.dependencies[relativePath].includes(relativeResolved)) {
                  this.dependencies[relativePath].push(relativeResolved);
                }
              }
            } else {
              // It's a library
              this.libraries.add(importPath);
              const libKey = `library:${importPath}`;
              if (!this.nodeInfo[libKey]) {
                this.nodeInfo[libKey] = {
                  name: importPath,
                  path: libKey,
                  type: 'library',
                  size: 50,
                };
              }
              if (!this.dependencies[relativePath].includes(libKey)) {
                this.dependencies[relativePath].push(libKey);
              }
            }
          }
        });
      } catch (parseError) {
        console.warn(`Error parsing file ${filePath}:`, parseError.message);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  resolveLocalImport(importPath, currentFilePath) {
    const currentDir = path.dirname(currentFilePath);
    let resolvedPath = path.resolve(currentDir, importPath);
    
    // Check if the import exists directly
    if (fs.existsSync(resolvedPath)) {
      if (fs.statSync(resolvedPath).isDirectory()) {
        // Try index files
        for (const ext of ['.js', '.jsx', '.ts', '.tsx']) {
          const indexFile = path.join(resolvedPath, `index${ext}`);
          if (fs.existsSync(indexFile)) {
            return indexFile;
          }
        }
      }
      return resolvedPath;
    }
    
    // Try adding extensions
    for (const ext of ['.js', '.jsx', '.ts', '.tsx']) {
      const pathWithExt = `${resolvedPath}${ext}`;
      if (fs.existsSync(pathWithExt)) {
        return pathWithExt;
      }
    }
    
    return null;
  }
}

module.exports = FileDependencyAnalyzer;
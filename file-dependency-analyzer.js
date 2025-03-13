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

    this.methodInfo = {};  // Store method details by file
    this.methodDependencies = {}; // Track method-to-method dependencies
  }

  async analyze() {
    console.log('Starting dependency analysis...');
    await this.processDirectory(this.rootDir);
    return {
      dependencies: this.dependencies,
      nodeInfo: this.nodeInfo,
      libraries: Array.from(this.libraries),
      fileTypes: Array.from(this.fileTypes),
      methodInfo: this.methodInfo,          // New: method info
      methodDependencies: this.methodDependencies // New: method dependencies
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
        await this.extractMethodInfo(filePath, fileContent, ast);
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

  // New method to extract function/method information
  async extractMethodInfo(filePath, fileContent, existingAst = null) {
    try {
      const relativePath = path.relative(this.rootDir, filePath);

      // Initialize method info for this file
      this.methodInfo[relativePath] = {
        methods: []
      };

      // Initialize method dependencies
      this.methodDependencies[relativePath] = {};

      // Parse the file if AST not provided
      const ast = existingAst || parser.parse(fileContent, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });

      // Track current class and method scope
      let currentClass = null;

      // Traverse the AST to find methods/functions
      traverse(ast, {
        ClassDeclaration: (path) => {
          currentClass = path.node.id.name;
        },

        // Track when we exit a class
        ClassDeclaration: {
          exit: (path) => {
            currentClass = null;
          }
        },

        // Handle function declarations
        FunctionDeclaration: (path) => {
          if (!path.node.id) return; // Skip anonymous functions

          const methodName = path.node.id.name;
          const params = path.node.params.map(param => this.extractParamInfo(param));
          const loc = path.node.loc;

          // Store method info
          this.methodInfo[relativePath].methods.push({
            name: methodName,
            type: 'function',
            class: currentClass,
            params: params,
            loc: {
              start: { line: loc.start.line, column: loc.start.column },
              end: { line: loc.end.line, column: loc.end.column }
            }
          });

          // Initialize dependencies for this method
          this.methodDependencies[relativePath][methodName] = [];

          // Track function calls within this function
          this.trackFunctionCalls(path, relativePath, methodName);
        },

        // Handle class methods
        ClassMethod: (path) => {
          // Only process if we have a method name
          if (!path.node.key) return;

          const methodName = path.node.key.name || 'anonymous';
          const params = path.node.params.map(param => this.extractParamInfo(param));
          const loc = path.node.loc;

          // Store method info
          this.methodInfo[relativePath].methods.push({
            name: methodName,
            type: 'method',
            class: currentClass,
            params: params,
            loc: {
              start: { line: loc.start.line, column: loc.start.column },
              end: { line: loc.end.line, column: loc.end.column }
            }
          });

          // Initialize dependencies for this method
          this.methodDependencies[relativePath][methodName] = [];

          // Track function calls within this method
          this.trackFunctionCalls(path, relativePath, methodName);
        },

        // Handle arrow functions and function expressions
        VariableDeclarator: (path) => {
          if (path.node.init &&
            (path.node.init.type === 'ArrowFunctionExpression' ||
              path.node.init.type === 'FunctionExpression')) {

            // Only process if we have a variable name
            if (path.node.id && path.node.id.name) {
              const methodName = path.node.id.name;
              const params = path.node.init.params.map(param => this.extractParamInfo(param));
              const loc = path.node.init.loc;

              // Store method info
              this.methodInfo[relativePath].methods.push({
                name: methodName,
                type: path.node.init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function',
                class: currentClass,
                params: params,
                loc: {
                  start: { line: loc.start.line, column: loc.start.column },
                  end: { line: loc.end.line, column: loc.end.column }
                }
              });

              // Initialize dependencies for this method
              this.methodDependencies[relativePath][methodName] = [];

              // Track function calls within this function
              this.trackFunctionCalls(path.get('init'), relativePath, methodName);
            }
          }
        }
      });

    } catch (parseError) {
      console.warn(`Error parsing methods in file ${filePath}:`, parseError.message);
    }
  }
  // Helper method to extract parameter information
  extractParamInfo(param) {
    let paramInfo = {
      name: 'unnamed'
    };

    // Handle different parameter node types
    if (param.type === 'Identifier') {
      paramInfo.name = param.name;
    } else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
      paramInfo.name = param.left.name;
      paramInfo.defaultValue = true;
    } else if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
      paramInfo.name = param.argument.name;
      paramInfo.rest = true;
    } else if (param.type === 'ObjectPattern') {
      paramInfo.name = '{destructured}';
      paramInfo.destructured = true;
    } else if (param.type === 'ArrayPattern') {
      paramInfo.name = '[destructured]';
      paramInfo.destructured = true;
    }

    // Extract type annotation if available (TypeScript)
    if (param.typeAnnotation) {
      paramInfo.type = this.getTypeFromAnnotation(param.typeAnnotation);
    }

    return paramInfo;
  }

  // Helper method to extract type from TypeScript annotations
  getTypeFromAnnotation(typeAnnotation) {
    if (!typeAnnotation || !typeAnnotation.typeAnnotation) return 'any';

    const type = typeAnnotation.typeAnnotation;

    // Handle different TS type structures
    if (type.type === 'TSStringKeyword') return 'string';
    if (type.type === 'TSNumberKeyword') return 'number';
    if (type.type === 'TSBooleanKeyword') return 'boolean';
    if (type.type === 'TSArrayType') return `${this.getTypeFromAnnotation({ typeAnnotation: type.elementType })}[]`;
    if (type.type === 'TSObjectKeyword') return 'object';
    if (type.type === 'TSAnyKeyword') return 'any';

    // Handle union and intersection types
    if (type.type === 'TSUnionType') {
      return type.types.map(t => this.getTypeFromAnnotation({ typeAnnotation: t })).join('|');
    }

    // Handle reference types (interfaces, classes, etc)
    if (type.type === 'TSTypeReference' && type.typeName) {
      return type.typeName.name;
    }

    return 'unknown';
  }

  // Track function calls to build method dependencies
  trackFunctionCalls(path, filePath, currentMethod) {
    path.traverse({
      CallExpression: (callPath) => {
        // Get called function name
        let calledFunction = null;

        if (callPath.node.callee.type === 'Identifier') {
          // Direct function call: someFunction()
          calledFunction = callPath.node.callee.name;
        }
        else if (callPath.node.callee.type === 'MemberExpression') {
          // Method call: obj.method() or this.method()

          // Check if it's a this.method() call to a local method
          if (callPath.node.callee.object.type === 'ThisExpression') {
            calledFunction = callPath.node.callee.property.name;

            // Add to dependencies if not already there
            if (calledFunction && !this.methodDependencies[filePath][currentMethod].some(d =>
              d.name === calledFunction && d.type === 'local')) {
              this.methodDependencies[filePath][currentMethod].push({
                name: calledFunction,
                type: 'local',
                source: filePath
              });
            }
          }
          // Check for imported module calls
          else if (callPath.node.callee.object.type === 'Identifier') {
            const moduleName = callPath.node.callee.object.name;
            const methodName = callPath.node.callee.property.name;

            // Add to dependencies
            if (!this.methodDependencies[filePath][currentMethod].some(d =>
              d.name === methodName && d.module === moduleName)) {
              this.methodDependencies[filePath][currentMethod].push({
                name: methodName,
                module: moduleName,
                type: 'imported'
              });
            }
          }
        }

        // Handle direct function calls to local functions
        if (calledFunction &&
          !this.methodDependencies[filePath][currentMethod].some(d =>
            d.name === calledFunction && d.type === 'local')) {
          this.methodDependencies[filePath][currentMethod].push({
            name: calledFunction,
            type: 'local',
            source: filePath
          });
        }
      }
    });
  }
}

module.exports = FileDependencyAnalyzer;
// Create this as public/js/MethodInfoDisplay.js

// Module for displaying method information in the sidebar
export class MethodInfoDisplay {
    constructor(methodData, container) {
      this.methodData = methodData;
      this.container = container;
      this.selectedMethod = null;
    }
    
    // Show method information in the sidebar
    showMethodInfo(methodName) {
      if (!this.methodData || !this.container) return;
      
      // Find method in data
      const method = this.methodData.methods.find(m => m.name === methodName);
      if (!method) return;
      
      // Store selected method
      this.selectedMethod = method;
      
      // Clear container
      this.container.innerHTML = '';
      
      // Create method info section
      const infoSection = document.createElement('div');
      infoSection.className = 'info-section';
      infoSection.innerHTML = `
        <h4>Method Details</h4>
        <div class="info-item">
          <span class="info-item-label">Name</span>
          <span class="info-item-value">${method.name}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">Type</span>
          <span class="info-item-value">
            <span class="method-type ${method.type}">
              ${this.getMethodTypeIcon(method.type)} ${this.formatMethodType(method.type)}
            </span>
          </span>
        </div>
        ${method.class ? `
          <div class="info-item">
            <span class="info-item-label">Class</span>
            <span class="info-item-value">${method.class}</span>
          </div>
        ` : ''}
        <div class="info-item">
          <span class="info-item-label">Location</span>
          <span class="info-item-value">Line ${method.loc.start.line}-${method.loc.end.line}</span>
        </div>
      `;
      
      // Add parameters section if there are parameters
      if (method.params && method.params.length > 0) {
        const paramsSection = document.createElement('div');
        paramsSection.className = 'info-section';
        paramsSection.innerHTML = `
          <h4>Parameters</h4>
          <ul class="parameter-list">
            ${method.params.map(param => `
              <li>
                <span class="param-name">${param.name}</span>
                ${param.type ? `<span class="param-type">: ${param.type}</span>` : ''}
                ${param.defaultValue ? '<span class="param-default">= default</span>' : ''}
                ${param.rest ? '<span class="param-rest">...</span>' : ''}
              </li>
            `).join('')}
          </ul>
        `;
        infoSection.appendChild(paramsSection);
      }
      
      // Add dependencies section if there are dependencies
      const methodDeps = this.methodData.dependencies[method.name] || [];
      if (methodDeps.length > 0) {
        const depsSection = document.createElement('div');
        depsSection.className = 'info-section';
        depsSection.innerHTML = `
          <h4>Method Calls</h4>
          <ul class="dependency-list">
            ${methodDeps.map(dep => `
              <li>
                <span class="dep-name">${dep.name}</span>
                ${dep.type === 'imported' ? `
                  <span class="dep-imported">from ${dep.module}</span>
                ` : ''}
              </li>
            `).join('')}
          </ul>
        `;
        infoSection.appendChild(depsSection);
      }
      
      // Add the section to the container
      this.container.appendChild(infoSection);
    }
    
    // Get icon for method type
    getMethodTypeIcon(type) {
      switch (type) {
        case 'function':
          return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 16.5L12 21L6 16.5"></path><path d="M18 7.5L12 3L6 7.5"></path><path d="M12 3L12 21"></path></svg>';
        case 'method':
          return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9L21 9"></path></svg>';
        case 'arrow':
          return '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12L19 12"></path><path d="M12 5L19 12L12 19"></path></svg>';
        default:
          return '';
      }
    }
    
    // Format method type for display
    formatMethodType(type) {
      switch (type) {
        case 'function':
          return 'Function';
        case 'method':
          return 'Class Method';
        case 'arrow':
          return 'Arrow Function';
        default:
          return type.charAt(0).toUpperCase() + type.slice(1);
      }
    }
    
    // Update method list display
    updateMethodList(methods) {
      if (!methods || !this.container) return;
      
      // Sort methods by type and name
      const sortedMethods = [...methods].sort((a, b) => {
        // Sort by type first (method, function, arrow)
        const typeOrder = { method: 1, function: 2, arrow: 3 };
        const typeA = typeOrder[a.type] || 4;
        const typeB = typeOrder[b.type] || 4;
        
        if (typeA !== typeB) {
          return typeA - typeB;
        }
        
        // Then sort by name
        return a.name.localeCompare(b.name);
      });
      
      // Create method list
      const listSection = document.createElement('div');
      listSection.className = 'info-section';
      listSection.innerHTML = `
        <h4>Methods (${methods.length})</h4>
        <ul class="method-list">
          ${sortedMethods.map(method => `
            <li class="method-item" data-method="${method.name}">
              <span class="method-name">${method.name}</span>
              <div class="method-info">
                <span class="method-type ${method.type}">
                  ${this.getMethodTypeIcon(method.type)} ${this.formatMethodType(method.type)}
                </span>
                <span class="method-loc">Line ${method.loc.start.line}</span>
              </div>
            </li>
          `).join('')}
        </ul>
      `;
      
      // Add the section to the container
      this.container.innerHTML = '';
      this.container.appendChild(listSection);
      
      // Add click handlers for method items
      const methodItems = listSection.querySelectorAll('.method-item');
      methodItems.forEach(item => {
        item.addEventListener('click', () => {
          // Remove active class from all items
          methodItems.forEach(i => i.classList.remove('active'));
          
          // Add active class to clicked item
          item.classList.add('active');
          
          // Show method details
          this.showMethodInfo(item.dataset.method);
        });
      });
    }
  }
  
  // Example usage:
  // const methodDisplay = new MethodInfoDisplay(fileMethodData, document.getElementById('method-info-container'));
  // methodDisplay.updateMethodList(fileMethodData.methods);
// Sketch Import/Export utilities
// This module handles exporting and importing complete sketches including all node/edge data and coordinates

/**
 * Export a complete sketch to a JSON file
 * @param {object} sketch - The sketch object containing nodes, edges, and metadata
 * @param {string} filename - Optional filename (will be generated if not provided)
 */
export function exportSketchToJson(sketch, filename = null) {
  // Create a complete snapshot of the sketch
  const sketchData = {
    version: '1.0', // Schema version for future compatibility
    exportDate: new Date().toISOString(),
    sketch: {
      id: sketch.sketchId || null,
      name: sketch.sketchName || null,
      creationDate: sketch.creationDate || null,
      nextNodeId: sketch.nextNodeId || 1,
      nodes: sketch.nodes || [],
      edges: sketch.edges || []
    }
  };

  // Convert to JSON with nice formatting
  const jsonString = JSON.stringify(sketchData, null, 2);
  
  // Create blob and download
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // Generate filename if not provided
  if (!filename) {
    const datePart = sketch.creationDate 
      ? sketch.creationDate.substr(0, 10) 
      : new Date().toISOString().substr(0, 10);
    const namePart = sketch.sketchName 
      ? `_${sketch.sketchName.replace(/[^a-zA-Z0-9_\u0590-\u05FF]/g, '_')}` 
      : '';
    filename = `sketch${namePart}_${datePart}.json`;
  }
  
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a sketch from a JSON file
 * @param {File} file - The file to import
 * @returns {Promise<object>} - Promise that resolves to the imported sketch data
 */
export function importSketchFromJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        
        // Validate the imported data
        if (!jsonData.sketch) {
          throw new Error('Invalid sketch file: missing sketch data');
        }
        
        const sketch = jsonData.sketch;
        
        // Validate required fields
        if (!Array.isArray(sketch.nodes)) {
          throw new Error('Invalid sketch file: nodes must be an array');
        }
        
        if (!Array.isArray(sketch.edges)) {
          throw new Error('Invalid sketch file: edges must be an array');
        }
        
        // Validate node structure (must have x, y coordinates)
        for (const node of sketch.nodes) {
          if (typeof node.x !== 'number' || typeof node.y !== 'number') {
            throw new Error(`Invalid node structure: node ${node.id} missing x,y coordinates`);
          }
          if (!node.id) {
            throw new Error('Invalid node structure: node missing id');
          }
        }
        
        // Validate edge structure
        for (const edge of sketch.edges) {
          if (!edge.tail || !edge.head) {
            throw new Error('Invalid edge structure: edge missing tail or head');
          }
        }
        
        // Return the validated sketch data
        resolve({
          nodes: sketch.nodes,
          edges: sketch.edges,
          nextNodeId: sketch.nextNodeId || 1,
          creationDate: sketch.creationDate || null,
          sketchId: null, // Generate new ID when saving
          sketchName: sketch.name || null,
          importDate: jsonData.exportDate || null,
          version: jsonData.version || '1.0'
        });
        
      } catch (error) {
        reject(new Error(`Failed to import sketch: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Export multiple sketches (library) to a single JSON file
 * @param {Array} sketches - Array of sketch objects
 * @param {string} filename - Optional filename
 */
export function exportSketchLibraryToJson(sketches, filename = 'sketch_library.json') {
  const libraryData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    sketchCount: sketches.length,
    sketches: sketches
  };

  const jsonString = JSON.stringify(libraryData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import sketch library from a JSON file
 * @param {File} file - The file to import
 * @returns {Promise<Array>} - Promise that resolves to array of sketch objects
 */
export function importSketchLibraryFromJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        
        // Check if it's a library or single sketch
        if (jsonData.sketches && Array.isArray(jsonData.sketches)) {
          // It's a library
          resolve(jsonData.sketches);
        } else if (jsonData.sketch) {
          // It's a single sketch, wrap in array
          resolve([jsonData.sketch]);
        } else {
          throw new Error('Invalid file format');
        }
        
      } catch (error) {
        reject(new Error(`Failed to import library: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}


/**
 * Label collision detection and optimal positioning utilities
 * Helps prevent label overlap with nodes and other labels on the canvas
 */

/**
 * Represents a rectangle bounds for collision detection
 * @typedef {Object} Bounds
 * @property {number} x - Left edge
 * @property {number} y - Top edge
 * @property {number} width - Width
 * @property {number} height - Height
 */

/**
 * Calculate text bounds with padding
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} fontSize
 * @param {number} padding
 * @returns {{width: number, height: number}}
 */
export function getTextDimensions(ctx, text, fontSize, padding = 4) {
  ctx.save();
  ctx.font = `${fontSize}px Arial`;
  const metrics = ctx.measureText(text);
  ctx.restore();
  
  return {
    width: metrics.width + padding * 2,
    height: fontSize + padding * 2
  };
}

/**
 * Check if two rectangles overlap
 * @param {Bounds} rect1
 * @param {Bounds} rect2
 * @returns {boolean}
 */
export function rectanglesOverlap(rect1, rect2) {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect2.x + rect2.width < rect1.x ||
    rect1.y + rect1.height < rect2.y ||
    rect2.y + rect2.height < rect1.y
  );
}

/**
 * Check if a rectangle overlaps with a circle (node)
 * @param {Bounds} rect
 * @param {{x: number, y: number, radius: number}} circle
 * @returns {boolean}
 */
export function rectangleOverlapsCircle(rect, circle) {
  // Find the closest point on the rectangle to the circle center
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  
  // Calculate distance from circle center to closest point
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distanceSquared = dx * dx + dy * dy;
  
  return distanceSquared < (circle.radius * circle.radius);
}

/**
 * Preferred label positions around a node (in priority order)
 * Each position is defined as a multiplier of the node radius
 */
const LABEL_POSITIONS = [
  { dx: 0, dy: -1.1, align: 'center', baseline: 'bottom' },    // Above
  { dx: 0, dy: 1.1, align: 'center', baseline: 'top' },        // Below
  { dx: 1.2, dy: 0, align: 'left', baseline: 'middle' },       // Right
  { dx: -1.2, dy: 0, align: 'right', baseline: 'middle' },     // Left
  { dx: 1.0, dy: -1.0, align: 'left', baseline: 'bottom' },    // Top-right
  { dx: -1.0, dy: -1.0, align: 'right', baseline: 'bottom' },  // Top-left
  { dx: 1.0, dy: 1.0, align: 'left', baseline: 'top' },        // Bottom-right
  { dx: -1.0, dy: 1.0, align: 'right', baseline: 'top' },      // Bottom-left
];

/**
 * Calculate label bounds for a given position
 * @param {number} labelX - Label x coordinate
 * @param {number} labelY - Label y coordinate
 * @param {number} width - Label width
 * @param {number} height - Label height
 * @param {string} align - Text alignment (left, center, right)
 * @param {string} baseline - Text baseline (top, middle, bottom)
 * @returns {Bounds}
 */
function getLabelBounds(labelX, labelY, width, height, align, baseline) {
  let x = labelX;
  let y = labelY;
  
  // Adjust x based on alignment
  if (align === 'center') {
    x -= width / 2;
  } else if (align === 'right') {
    x -= width;
  }
  
  // Adjust y based on baseline
  if (baseline === 'middle') {
    y -= height / 2;
  } else if (baseline === 'bottom') {
    y -= height;
  }
  
  return { x, y, width, height };
}

/**
 * Find the optimal position for a label around a node
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} nodeX - Node x coordinate
 * @param {number} nodeY - Node y coordinate
 * @param {number} nodeRadius - Node radius
 * @param {number} fontSize - Font size
 * @param {Array<Bounds>} existingLabels - Array of existing label bounds
 * @param {Array<{x: number, y: number, radius: number}>} nearbyNodes - Array of nearby nodes
 * @returns {{x: number, y: number, align: string, baseline: string}}
 */
export function findOptimalLabelPosition(
  ctx,
  text,
  nodeX,
  nodeY,
  nodeRadius,
  fontSize,
  existingLabels = [],
  nearbyNodes = []
) {
  const dimensions = getTextDimensions(ctx, text, fontSize);
  
  let bestPosition = null;
  let minOverlaps = Infinity;
  
  for (const position of LABEL_POSITIONS) {
    const labelX = nodeX + position.dx * nodeRadius;
    const labelY = nodeY + position.dy * nodeRadius;
    
    const bounds = getLabelBounds(
      labelX,
      labelY,
      dimensions.width,
      dimensions.height,
      position.align,
      position.baseline
    );
    
    // Count overlaps
    let overlaps = 0;
    
    // Check overlap with existing labels
    for (const existingLabel of existingLabels) {
      if (rectanglesOverlap(bounds, existingLabel)) {
        overlaps++;
      }
    }
    
    // Check overlap with nearby nodes
    for (const node of nearbyNodes) {
      if (rectangleOverlapsCircle(bounds, node)) {
        overlaps++;
      }
    }
    
    // If no overlaps, use this position immediately
    if (overlaps === 0) {
      return {
        x: labelX,
        y: labelY,
        align: position.align,
        baseline: position.baseline,
        bounds
      };
    }
    
    // Track the position with minimum overlaps
    if (overlaps < minOverlaps) {
      minOverlaps = overlaps;
      bestPosition = {
        x: labelX,
        y: labelY,
        align: position.align,
        baseline: position.baseline,
        bounds
      };
    }
  }
  
  // Return the best position found (even if it has some overlaps)
  return bestPosition || {
    x: nodeX,
    y: nodeY + nodeRadius * 1.1,
    align: 'center',
    baseline: 'top',
    bounds: getLabelBounds(
      nodeX,
      nodeY + nodeRadius * 1.1,
      dimensions.width,
      dimensions.height,
      'center',
      'top'
    )
  };
}

/**
 * Process all labels and find optimal positions for them
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{text: string, nodeX: number, nodeY: number, nodeRadius: number, fontSize: number}>} labels
 * @param {Array<{x: number, y: number, radius: number}>} allNodes
 * @param {Array<{text: string, x: number, y: number, fontSize: number}>} edgeLabels - Edge measurement labels
 * @returns {Array<{text: string, x: number, y: number, align: string, baseline: string, fontSize: number}>}
 */
export function processLabels(ctx, labels, allNodes, edgeLabels = []) {
  const positionedLabels = [];
  const placedBounds = [];
  
  // Convert edge labels to bounds for collision detection
  const edgeLabelBounds = edgeLabels.map(edgeLabel => {
    const dimensions = getTextDimensions(ctx, edgeLabel.text, edgeLabel.fontSize);
    return {
      x: edgeLabel.x - dimensions.width / 2, // Center alignment
      y: edgeLabel.y - dimensions.height / 2, // Bottom baseline
      width: dimensions.width,
      height: dimensions.height
    };
  });
  
  for (const label of labels) {
    // Get nearby nodes (within reasonable distance)
    const searchRadius = label.nodeRadius * 5;
    const nearbyNodes = allNodes
      .filter(node => {
        const dx = node.x - label.nodeX;
        const dy = node.y - label.nodeY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < searchRadius && dist > 0.1; // Exclude the label's own node
      })
      .map(node => ({ x: node.x, y: node.y, radius: node.radius }));
    
    // Combine placed bounds with edge label bounds
    const allBounds = [...placedBounds, ...edgeLabelBounds];
    
    const position = findOptimalLabelPosition(
      ctx,
      label.text,
      label.nodeX,
      label.nodeY,
      label.nodeRadius,
      label.fontSize,
      allBounds,
      nearbyNodes
    );
    
    positionedLabels.push({
      text: label.text,
      x: position.x,
      y: position.y,
      align: position.align,
      baseline: position.baseline,
      fontSize: label.fontSize
    });
    
    // Add this label's bounds to the placed labels
    if (position.bounds) {
      placedBounds.push(position.bounds);
    }
  }
  
  return positionedLabels;
}


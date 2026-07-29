/**
 * Custom node icon drawing functions
 * Each node type has a distinctive visual appearance
 */

/**
 * Draw a manhole icon - circle with inner crosshatch pattern
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawManholeIcon(ctx, x, y, radius, colors, isSelected, fillColor) {
  ctx.save();
  
  // Draw outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw inner detail - smaller circle
  const innerRadius = radius * 0.6;
  ctx.beginPath();
  ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  // Draw crosshatch pattern inside
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 1;
  
  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(x - innerRadius * 0.7, y);
  ctx.lineTo(x + innerRadius * 0.7, y);
  ctx.stroke();
  
  // Vertical line
  ctx.beginPath();
  ctx.moveTo(x, y - innerRadius * 0.7);
  ctx.lineTo(x, y + innerRadius * 0.7);
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw a drainage icon - rectangle with water droplet symbol
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawDrainageIcon(ctx, x, y, radius, colors, isSelected, fillColor) {
  ctx.save();
  
  const rectWidth = radius * 1.8;
  const rectHeight = radius * 1.3;
  
  // Draw rectangle
  ctx.beginPath();
  ctx.rect(x - rectWidth / 2, y - rectHeight / 2, rectWidth, rectHeight);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw water droplet inside
  const dropletSize = radius * 0.5;
  ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(0, 120, 200, 0.6)';
  
  // Droplet shape (teardrop)
  ctx.beginPath();
  ctx.moveTo(x, y - dropletSize * 0.8);
  // Left curve
  ctx.bezierCurveTo(
    x - dropletSize * 0.6, y - dropletSize * 0.4,
    x - dropletSize * 0.6, y + dropletSize * 0.2,
    x, y + dropletSize * 0.8
  );
  // Right curve
  ctx.bezierCurveTo(
    x + dropletSize * 0.6, y + dropletSize * 0.2,
    x + dropletSize * 0.6, y - dropletSize * 0.4,
    x, y - dropletSize * 0.8
  );
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

/**
 * Draw a covered manhole icon - circle with diagonal stripes
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawCoveredIcon(ctx, x, y, radius, colors, isSelected, fillColor) {
  ctx.save();
  
  // Draw outer circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Clip to circle for stripes
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.clip();
  
  // Draw diagonal stripes
  ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  
  const stripeCount = 6;
  const spacing = (radius * 2) / stripeCount;
  
  for (let i = -stripeCount; i <= stripeCount; i++) {
    ctx.beginPath();
    ctx.moveTo(x - radius + i * spacing, y - radius);
    ctx.lineTo(x + radius + i * spacing, y + radius);
    ctx.stroke();
  }
  
  ctx.restore();
}

/**
 * Draw a home icon - house shape with triangle roof and rectangle base
 * (This is a simple geometric version for consistency)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Center x coordinate
 * @param {number} y - Center y coordinate
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {boolean} isSelected - Whether the node is selected
 * @param {string} fillColor - Fill color for the node
 */
export function drawHomeIcon(ctx, x, y, radius, colors, isSelected, fillColor) {
  ctx.save();
  
  // First draw the circle background
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = colors.node.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Now draw the house icon inside
  const houseSize = radius * 0.7;
  const houseWidth = houseSize * 1.2;
  const houseHeight = houseSize;
  const roofHeight = houseSize * 0.5;
  
  const baseY = y + houseHeight * 0.3;
  const roofTopY = baseY - houseHeight - roofHeight * 0.3;
  
  ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
  ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1.5;
  
  // Draw roof (triangle)
  ctx.beginPath();
  ctx.moveTo(x, roofTopY);
  ctx.lineTo(x - houseWidth / 2, baseY - houseHeight);
  ctx.lineTo(x + houseWidth / 2, baseY - houseHeight);
  ctx.closePath();
  ctx.fill();
  
  // Draw base (rectangle)
  ctx.fillRect(
    x - houseWidth / 2,
    baseY - houseHeight,
    houseWidth,
    houseHeight
  );
  
  // Draw door
  const doorWidth = houseWidth * 0.3;
  const doorHeight = houseHeight * 0.5;
  ctx.fillStyle = fillColor;
  ctx.fillRect(
    x - doorWidth / 2,
    baseY - doorHeight,
    doorWidth,
    doorHeight
  );
  
  ctx.restore();
}

/**
 * Dispatch to the appropriate icon drawer based on node type
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} node - Node object with properties
 * @param {number} radius - Node radius
 * @param {Object} colors - Color palette
 * @param {Object} selectedNode - Currently selected node
 */
export function drawNodeIcon(ctx, node, radius, colors, selectedNode) {
  const isSelected = node === selectedNode;
  
  // Determine fill color based on node state
  let fillColor;
  if (isSelected) {
    if (node.nodeType !== 'Home' && node.type === 'type2') {
      fillColor = colors.node.fillSelectedMissing;
    } else {
      fillColor = colors.node.fillSelected;
    }
  } else if (node.nodeType === 'Home') {
    fillColor = colors.node.fillDefault;
  } else if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    fillColor = node.type === 'type2' ? colors.node.fillMissing : '#0ea5e9';
  } else if (node.nodeType === 'Covered' || node.nodeType === 'שוחה מכוסה') {
    fillColor = colors.node.fillBlocked;
  } else {
    fillColor = node.type === 'type2' ? colors.node.fillMissing : colors.node.fillDefault;
  }
  
  // Dispatch to appropriate icon drawer
  if (node.nodeType === 'Home') {
    drawHomeIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor);
  } else if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    drawDrainageIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor);
  } else if (node.nodeType === 'Covered' || node.nodeType === 'שוחה מכוסה') {
    drawCoveredIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor);
  } else {
    // Default manhole icon
    drawManholeIcon(ctx, node.x, node.y, radius, colors, isSelected, fillColor);
  }
}


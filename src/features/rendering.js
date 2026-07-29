// Rendering helpers that can be called from legacy code
import { COLORS } from '../state/constants.js';

/**
 * Render the edge type legend into the provided container element.
 * @param {HTMLElement|null} legendEl
 * @param {Record<string, string>} edgeTypeColors
 */
export function renderEdgeLegend(legendEl, edgeTypeColors) {
  if (!legendEl) return;
  const items = [
    { label: 'קו ראשי', color: edgeTypeColors['קו ראשי'] || '#2563eb' },
    { label: 'קו סניקה', color: edgeTypeColors['קו סניקה'] || '#fb923c' },
    { label: 'קו משני', color: edgeTypeColors['קו משני'] || '#0d9488' },
  ];
  legendEl.innerHTML = items
    .map((i) => `<span class="item"><span class="swatch" style="background:${i.color}"></span>${i.label}</span>`) 
    .join('');
  legendEl.style.left = '12px';
  legendEl.style.right = 'auto';
}

/**
 * Draw an infinite-looking grid aligned to world coordinates.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}} viewTranslate
 * @param {number} viewScale
 * @param {HTMLCanvasElement} canvas
 */
export function drawInfiniteGrid(ctx, viewTranslate, viewScale, canvas) {
  const rect = canvas.getBoundingClientRect();
  const screenWidth = rect.width;
  const screenHeight = rect.height;
  const worldStep = 20;
  const screenStep = worldStep * viewScale;
  if (screenStep < 8) return;
  const startXWorld = Math.floor(-viewTranslate.x / screenStep) * worldStep;
  const startYWorld = Math.floor(-viewTranslate.y / screenStep) * worldStep;
  const startXScreen = startXWorld * viewScale + viewTranslate.x;
  const startYScreen = startYWorld * viewScale + viewTranslate.y;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = COLORS.grid.stroke;
  ctx.lineWidth = 1;
  for (let x = startXScreen; x <= screenWidth; x += screenStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, screenHeight);
  }
  for (let y = startYScreen; y <= screenHeight; y += screenStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(screenWidth, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a directed edge with arrowheads and optional labels.
 * Keeps color logic external (pass in resolved colors and selection state).
 */
export function drawEdge(ctx, edge, tailNode, headNode, options) {
  if (!tailNode || !headNode) return;
  const { color, selectedColor, edgeTypeColors, highlightedHalfEdge, colors } = options;
  const x1 = tailNode.x, y1 = tailNode.y, x2 = headNode.x, y2 = headNode.y;
  ctx.save();
  const resolvedColor = color || (edge === options.selectedEdge
    ? (selectedColor || (colors?.edge?.selected || '#7c3aed'))
    : (edgeTypeColors?.[edge.edge_type] || '#555'));
  ctx.strokeStyle = resolvedColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 10;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - arrowLength * Math.cos(angle - Math.PI / 6),
    y2 - arrowLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - arrowLength * Math.cos(angle + Math.PI / 6),
    y2 - arrowLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = resolvedColor;
  ctx.fill();
  if (highlightedHalfEdge && highlightedHalfEdge.edgeId === edge.id) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const ratioStart = highlightedHalfEdge.half === 'tail' ? 0.0 : 0.5;
    const ratioEnd = highlightedHalfEdge.half === 'tail' ? 0.5 : 1.0;
    const sx = x1 + dx * ratioStart;
    const sy = y1 + dy * ratioStart;
    const ex = x1 + dx * ratioEnd;
    const ey = y1 + dy * ratioEnd;
    ctx.save();
    ctx.strokeStyle = (colors?.edge?.selected || '#7c3aed');
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draw a node circle and label. Color selection is passed via options.
 */
export function drawNode(ctx, node, options) {
  const { radius, colors, selectedNode } = options;
  ctx.save();
  let fillColor;
  if (node === selectedNode) {
    if (node.nodeType !== 'Home' && node.type === 'type2') {
      fillColor = colors.node.fillSelectedMissing;
    } else {
      fillColor = colors.node.fillSelected;
    }
  } else if (node.nodeType === 'Home') {
    fillColor = colors.node.fillDefault;
  } else if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    // Drainage: orange if missing measurements, sky-blue if complete
    fillColor = node.type === 'type2' ? colors.node.fillMissing : colors.node.fillDrainageComplete;
  } else if (node.nodeType === 'Covered' || node.nodeType === 'שוחה מכוסה') {
    fillColor = colors.node.fillBlocked;
  } else {
    fillColor = node.type === 'type2' ? colors.node.fillMissing : colors.node.fillDefault;
  }
  
  // Draw drainage nodes as rectangles
  if (node.nodeType === 'Drainage' || node.nodeType === 'קולטן') {
    const rectWidth = radius * 1.8;
    const rectHeight = radius * 1.3;
    ctx.beginPath();
    ctx.rect(node.x - rectWidth / 2, node.y - rectHeight / 2, rectWidth, rectHeight);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = colors.node.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Draw other nodes as circles
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = colors.node.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}




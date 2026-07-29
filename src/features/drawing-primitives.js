// Canvas drawing primitives that don't depend on application state
import { COLORS } from '../state/constants.js';

/**
 * Draw a simple house icon centered at (cx, cy) fitting inside the node radius.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 */
export function drawHouse(ctx, cx, cy, radius) {
  const roofHeight = radius * 0.8;
  const bodyWidth = radius * 1.2;
  const bodyHeight = radius * 1.0;
  const left = cx - bodyWidth / 2;
  const right = cx + bodyWidth / 2;
  const top = cy - bodyHeight / 2;
  const bottom = cy + bodyHeight / 2;
  const roofPeakY = top - roofHeight * 0.4;
  // Roof
  ctx.save();
  ctx.fillStyle = COLORS.node.houseRoof;
  ctx.beginPath();
  ctx.moveTo(cx, roofPeakY);
  ctx.lineTo(left, top);
  ctx.lineTo(right, top);
  ctx.closePath();
  ctx.fill();
  // Body
  ctx.fillStyle = COLORS.node.houseBody;
  ctx.fillRect(left, top, bodyWidth, bodyHeight);
  // Door
  const doorWidth = bodyWidth * 0.2;
  const doorHeight = bodyHeight * 0.5;
  const doorLeft = cx - doorWidth / 2;
  const doorTop = bottom - doorHeight;
  ctx.fillStyle = COLORS.node.houseDoor;
  ctx.fillRect(doorLeft, doorTop, doorWidth, doorHeight);
  ctx.restore();
}

/**
 * Draw a small badge indicating a direct connection on top-right of the node.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 */
export function drawDirectConnectionBadge(ctx, cx, cy, radius) {
  const badgeR = Math.max(6, Math.floor(radius * 0.35));
  const bx = cx + radius * 0.55;
  const by = cy - radius * 0.55;
  ctx.save();
  // Badge background
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.node.badgeBg;
  ctx.fill();
  // Chain-link glyph: two small overlapping arcs
  ctx.strokeStyle = COLORS.node.badgeIcon;
  ctx.lineWidth = 2;
  const r = badgeR * 0.45;
  ctx.beginPath();
  ctx.arc(bx - r * 0.5, by, r, Math.PI * 0.25, Math.PI * 1.25);
  ctx.arc(bx + r * 0.5, by, r, Math.PI * 1.25, Math.PI * 0.25);
  ctx.stroke();
  ctx.restore();
}



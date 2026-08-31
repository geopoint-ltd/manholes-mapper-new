// Orientation of the sketch on screen: rotation in quarter turns, plus an
// optional mirror.
//
// This is a VIEW setting and nothing else — it never touches node.x / node.y.
// That distinction matters more than it looks. The office loader gives an
// unmeasured manhole an approximate real-world position by fitting a transform
// from sketch coordinates to the GPS coordinates of its neighbours. Where three
// or more neighbours are measured it fits a full affine, which would absorb a
// uniform rotation or mirror and come out unchanged — but its fallback for a
// node with fewer neighbours reads the bearing in sketch space and applies it
// directly as a real-world bearing. Rewriting the stored coordinates would
// therefore move exactly the points that are hardest to check: isolated
// direction points with no measurements of their own.
//
// Rotating the picture instead costs nothing and cannot reach the data: the
// exported CSVs carry no coordinates at all, and the sketch JSON keeps the
// coordinates the surveyor actually drew.

/** Quarter turns clockwise on screen, 0..3. */
let quarterTurns = 0;
/** Mirrored left-to-right, applied after the rotation so the axis is the screen's. */
let flipped = false;

/** Rotation in radians. */
export function angle() {
  return (quarterTurns * Math.PI) / 2;
}

export function getOrientation() {
  return { quarterTurns, flipped, degrees: quarterTurns * 90 };
}

/** True when the sketch is being shown at anything other than its drawn orientation. */
export function isReoriented() {
  return quarterTurns !== 0 || flipped;
}

export function rotateRight() {
  quarterTurns = (quarterTurns + 1) % 4;
}

export function rotateLeft() {
  quarterTurns = (quarterTurns + 3) % 4;
}

export function flipHorizontal() {
  flipped = !flipped;
}

/** A vertical mirror is a horizontal mirror plus a half turn. */
export function flipVertical() {
  flipped = !flipped;
  quarterTurns = (quarterTurns + 2) % 4;
}

export function resetOrientation() {
  quarterTurns = 0;
  flipped = false;
}

/** Sketch coordinates -> display coordinates (before pan and zoom). */
export function toDisplay(x, y) {
  const a = angle();
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const rx = x * cos - y * sin;
  const ry = x * sin + y * cos;
  return { x: flipped ? -rx : rx, y: ry };
}

/** Display coordinates -> sketch coordinates. The exact inverse of toDisplay. */
export function fromDisplay(x, y) {
  const dx = flipped ? -x : x;
  const a = -angle();
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: dx * cos - y * sin, y: dx * sin + y * cos };
}

/**
 * Apply the orientation to a canvas context.
 *
 * Canvas post-multiplies, so the last call listed is the first thing that
 * happens to a point: this yields mirror(rotate(point)), matching toDisplay.
 * Call it after the pan/zoom transform.
 */
export function applyToContext(ctx) {
  if (flipped) ctx.scale(-1, 1);
  ctx.rotate(angle());
}

/**
 * Undo the orientation for the current point, so text stays upright and
 * readable however the sketch is turned. Call inside a save()/restore() pair,
 * after translating to the text's anchor.
 */
export function keepUpright(ctx) {
  ctx.rotate(-angle());
  if (flipped) ctx.scale(-1, 1);
}

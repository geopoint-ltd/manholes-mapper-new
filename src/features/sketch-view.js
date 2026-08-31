// Orientation of the sketch on screen: a free rotation angle, plus an optional
// left-to-right mirror.
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

/** Rotation clockwise on screen, in degrees, 0 <= deg < 360. */
let rotationDeg = 0;
/** Mirrored left-to-right, applied after the rotation so the axis is the screen's. */
let flipped = false;

/** Rotation in radians, for the trigonometry and the canvas. */
export function angle() {
  return (rotationDeg * Math.PI) / 180;
}

export function getOrientation() {
  return { degrees: rotationDeg, flipped };
}

/** True when the sketch is being shown at anything other than its drawn orientation. */
export function isReoriented() {
  return rotationDeg !== 0 || flipped;
}

/** Wrap into [0, 360) so the readout never shows -30 or 400. */
function normalise(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Set an absolute angle in degrees. Any finite value is accepted. */
export function setRotation(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return;
  rotationDeg = normalise(n);
}

/** Nudge the angle, for keyboard stepping. */
export function rotateBy(deltaDeg) {
  setRotation(rotationDeg + deltaDeg);
}

export function flipHorizontal() {
  flipped = !flipped;
}

/**
 * Clear both the angle and the mirror in one call.
 *
 * No control is wired to this: the slider returns to 0 on its own and the flip
 * button toggles back, so a dedicated reset would be a third way to do what two
 * controls already do. Kept because it is the natural counterpart to the
 * setters and the module is far easier to exercise with it.
 */
export function resetOrientation() {
  rotationDeg = 0;
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
 * readable at any angle. Call inside a save()/restore() pair, after
 * translating to the text's anchor.
 */
export function keepUpright(ctx) {
  ctx.rotate(-angle());
  if (flipped) ctx.scale(-1, 1);
}

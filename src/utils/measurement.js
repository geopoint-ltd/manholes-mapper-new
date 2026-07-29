// Shared helpers for pipe depth measures (Tail = outgoing / קו יוצא, Head = incoming / קו נכנס).
// Consolidates the sanitize regex that was duplicated across the edge/node editors,
// and adds a plausibility check.

/**
 * Keep only digits and a single decimal point (allows partial input like "3." while typing).
 * @param {*} raw
 * @returns {string}
 */
export function sanitizeMeasurement(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[^0-9.]/g, '')
    .replace(/\.(?=.*\.)/g, '');
}

/**
 * A manhole is realistically < 10 m deep, so a measure > 10 is almost always a
 * dropped-decimal typo (2.40 typed as "240", 0.68 as "68"). Returns true for such
 * suspicious values so the UI can warn the surveyor. Partial input ("", "3.") is not
 * flagged.
 * @param {*} value
 * @param {number} maxDepth
 * @returns {boolean}
 */
export function isSuspiciousDepth(value, maxDepth = 10) {
  const n = Number(value);
  return Number.isFinite(n) && n > maxDepth;
}

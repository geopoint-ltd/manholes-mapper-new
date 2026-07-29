/**
 * Determine if an identifier is a strictly numeric positive integer string.
 * @param {string|number} id
 * @returns {boolean}
 */
export function isNumericId(id) {
  const s = String(id);
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0;
}

/**
 * Generate an internal unique id for a Home node.
 * @returns {string}
 */
export function generateHomeInternalId() {
  return 'home_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}



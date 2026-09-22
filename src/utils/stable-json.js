// JSON with object keys in sorted order, at every depth.
//
// For comparing sketch contents. Firestore hands maps back with their keys
// sorted, while the app builds nodes in insertion order, so the same manhole
// serialises two different ways — and a plain JSON.stringify comparison would
// call identical sketches different.

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined && typeof value[k] !== 'function')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * What a sketch is, for the purpose of "did it change": its drawing and its
 * name. Not its creation date: the app fills a missing one with the current
 * time on every save, so including it would make an untouched sketch look
 * changed each time it is saved — and every such save would be sent to every
 * other device, and back.
 */
export function sketchContentKey(record) {
  if (!record) return '';
  return stableStringify([record.nodes || [], record.edges || [], record.name || null, Number(record.nextNodeId) || 0]);
}

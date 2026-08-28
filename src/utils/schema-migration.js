// Schema migration for sketches captured before the field changes.
//
// Two changes made old values ambiguous rather than merely different:
//
//   accuracyLevel  0=הנדסית 1=סכימטית   ->  1=הנדסית 3=בינונית 5=סכימטית
//   fall_position  0=פנימי  1=חיצוני    ->  fall_type 2=מפל חיצוני 3=מפל פנימי
//
// The overlap is the problem: a stored `1` means סכימטית under the old codes
// and הנדסית under the new ones. Nothing in the value itself says which, so a
// version stamp decides. Sketches written before this carry no stamp and are
// migrated exactly once; anything already stamped is left alone.

export const SCHEMA_VERSION = 2;

/** Old accuracy code -> new one. */
const ACCURACY_V1_TO_V2 = { 0: 1, 1: 5 };

/** Old fall_position code -> FallType. */
const FALL_POSITION_TO_TYPE = { 0: 3, 1: 2 };

function migrateNode(node) {
  if (!node || typeof node !== 'object') return;
  const old = node.accuracyLevel;
  if (old !== undefined && old !== null && old !== '') {
    const mapped = ACCURACY_V1_TO_V2[Number(old)];
    if (mapped !== undefined) node.accuracyLevel = mapped;
  }
}

function migrateEdge(edge) {
  if (!edge || typeof edge !== 'object') return;
  if (edge.fall_type === undefined || edge.fall_type === null) {
    const legacy = edge.fall_position;
    if (legacy === undefined || legacy === null || legacy === '') {
      // No fall recorded. If a depth exists the type is genuinely unknown;
      // otherwise there is simply no fall.
      edge.fall_type = 0;
    } else {
      const mapped = FALL_POSITION_TO_TYPE[Number(legacy)];
      edge.fall_type = mapped === undefined ? 0 : mapped;
    }
  }
  delete edge.fall_position;
}

/**
 * Bring a loaded sketch up to the current schema, in place.
 *
 * @param {{nodes?: any[], edges?: any[], schemaVersion?: number}} sketch
 * @returns {boolean} true when something was changed
 */
export function migrateSketch(sketch) {
  if (!sketch || typeof sketch !== 'object') return false;
  if (Number(sketch.schemaVersion) >= SCHEMA_VERSION) return false;
  if (Array.isArray(sketch.nodes)) sketch.nodes.forEach(migrateNode);
  if (Array.isArray(sketch.edges)) sketch.edges.forEach(migrateEdge);
  sketch.schemaVersion = SCHEMA_VERSION;
  return true;
}

/**
 * Migrate loose node/edge arrays that are not wrapped in a sketch object.
 *
 * @param {any[]} nodes
 * @param {any[]} edges
 * @param {number|undefined} schemaVersion the version the arrays came from
 * @returns {number} the version they are now at
 */
export function migrateGraph(nodes, edges, schemaVersion) {
  if (Number(schemaVersion) >= SCHEMA_VERSION) return Number(schemaVersion);
  if (Array.isArray(nodes)) nodes.forEach(migrateNode);
  if (Array.isArray(edges)) edges.forEach(migrateEdge);
  return SCHEMA_VERSION;
}

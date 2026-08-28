// Schema migration for sketches captured before the field changes.
//
// Each step is keyed to the version it upgrades FROM, and only the steps a
// sketch is actually behind on are applied. That matters more than it looks:
// the v1 accuracy remap sends 1 -> 5, but under v2 a stored 1 already means
// הנדסית. Running that step a second time would silently turn every surveyed
// manhole into a schematic one, so a step must never run on data that has
// already passed it.
//
//   v1 -> v2  accuracyLevel  0=הנדסית 1=סכימטית  ->  1=הנדסית 3=בינונית 5=סכימטית
//             fall_position  0=פנימי  1=חיצוני   ->  fall_type 2=חיצוני 3=פנימי
//   v2 -> v3  edge_type      קו סניקה removed    ->  קו ראשי, original kept in the note

import { REMOVED_EDGE_TYPE } from '../state/constants.js';

export const SCHEMA_VERSION = 3;

/** Old accuracy code -> new one. */
const ACCURACY_V1_TO_V2 = { 0: 1, 1: 5 };

/** Old fall_position code -> FallType. */
const FALL_POSITION_TO_TYPE = { 0: 3, 1: 2 };

function migrateNodeV1toV2(node) {
  if (!node || typeof node !== 'object') return;
  const old = node.accuracyLevel;
  if (old !== undefined && old !== null && old !== '') {
    const mapped = ACCURACY_V1_TO_V2[Number(old)];
    if (mapped !== undefined) node.accuracyLevel = mapped;
  }
}

function migrateEdgeV1toV2(edge) {
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
 * Retire קו סניקה. The type is gone from the picker, so a line still carrying
 * it would show a blank dropdown and export a code the app no longer offers.
 * It becomes קו ראשי — but the original type is written to the front of the
 * line's note first, because "this was a pressure line" is field knowledge that
 * only the surveyor had, and the note is the one field that reaches the office
 * intact.
 *
 * @returns {boolean} true when this edge was converted
 */
function migrateEdgeV2toV3(edge) {
  if (!edge || typeof edge !== 'object') return false;
  if (edge.edge_type !== REMOVED_EDGE_TYPE.label) return false;
  edge.edge_type = REMOVED_EDGE_TYPE.replacement;
  const existing = String(edge.note || '').trim();
  // Don't stack the prefix if a sketch somehow gets migrated twice.
  if (!existing.startsWith(REMOVED_EDGE_TYPE.label)) {
    edge.note = existing ? `${REMOVED_EDGE_TYPE.label} - ${existing}` : REMOVED_EDGE_TYPE.label;
  }
  return true;
}

/** How many edges the last migration converted away from קו סניקה. */
let lastRemovedEdgeTypeCount = 0;

/**
 * Number of lines the most recent migration moved off קו סניקה, so the caller
 * can tell the surveyor what changed under them. Reading it clears the count.
 */
export function takeRemovedEdgeTypeCount() {
  const n = lastRemovedEdgeTypeCount;
  lastRemovedEdgeTypeCount = 0;
  return n;
}

/** Apply every step the data is behind on, in order. */
function applyMigrations(nodes, edges, from) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  if (from < 2) {
    nodeList.forEach(migrateNodeV1toV2);
    edgeList.forEach(migrateEdgeV1toV2);
  }
  if (from < 3) {
    let converted = 0;
    edgeList.forEach((e) => { if (migrateEdgeV2toV3(e)) converted += 1; });
    lastRemovedEdgeTypeCount += converted;
  }
}

/** A sketch with no stamp predates versioning, i.e. version 1. */
function versionOf(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Bring a loaded sketch up to the current schema, in place.
 *
 * @param {{nodes?: any[], edges?: any[], schemaVersion?: number}} sketch
 * @returns {boolean} true when something was changed
 */
export function migrateSketch(sketch) {
  if (!sketch || typeof sketch !== 'object') return false;
  const from = versionOf(sketch.schemaVersion);
  if (from >= SCHEMA_VERSION) return false;
  applyMigrations(sketch.nodes, sketch.edges, from);
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
  const from = versionOf(schemaVersion);
  if (from >= SCHEMA_VERSION) return from;
  applyMigrations(nodes, edges, from);
  return SCHEMA_VERSION;
}

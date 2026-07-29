// CSV utilities and exporters
import { EDGE_ENGINEERING_STATUS, EDGE_LINE_DIAMETERS, EDGE_MATERIAL_OPTIONS, EDGE_TYPE_OPTIONS, NODE_ACCESS_OPTIONS, NODE_MAINTENANCE_OPTIONS, NODE_MATERIAL_OPTIONS, NODE_ACCURACY_OPTIONS } from '../state/constants.js';

function normalizeOptions(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (item && typeof item === 'object' && ('code' in item || 'label' in item)) {
      return { code: item.code ?? item.label, label: item.label ?? String(item.code ?? '') };
    }
    return { code: item, label: String(item) };
  });
}

function getOptionsFor(scope, key, adminConfig) {
  const scoped = (scope === 'nodes') ? (adminConfig.nodes || {}) : (adminConfig.edges || {});
  const adminOpts = scoped.options || {};
  const maybe = normalizeOptions(adminOpts[key]);
  if (maybe.length) return maybe;
  if (scope === 'nodes') {
    if (key === 'material') return normalizeOptions(NODE_MATERIAL_OPTIONS);
    if (key === 'access') return normalizeOptions(NODE_ACCESS_OPTIONS);
    if (key === 'maintenance_status') return normalizeOptions(NODE_MAINTENANCE_OPTIONS);
    if (key === 'accuracy_level') return normalizeOptions(NODE_ACCURACY_OPTIONS);
  } else {
    if (key === 'material') return normalizeOptions(EDGE_MATERIAL_OPTIONS);
    if (key === 'edge_type') return normalizeOptions(EDGE_TYPE_OPTIONS);
    if (key === 'line_diameter') return normalizeOptions(EDGE_LINE_DIAMETERS);
    if (key === 'engineering_status') return normalizeOptions(EDGE_ENGINEERING_STATUS);
  }
  return [];
}

function codeFor(scope, key, value, adminConfig) {
  if (value == null || value === '') return '';
  const options = getOptionsFor(scope, key, adminConfig);
  // If already numeric (or numeric string), return as-is
  if (typeof value === 'number') return String(value);
  const numericLike = Number(value);
  if (Number.isFinite(numericLike) && options.some(o => String(o.code) === String(value))) return String(value);
  const found = options.find(o => String(o.label) === String(value));
  if (found) {
    // Prefer numeric codes when possible; if admin options used labels as codes,
    // fall back to default constants to resolve a numeric code.
    if (Number.isFinite(Number(found.code))) return String(found.code);
    // Attempt to map via default constant lists to ensure numeric codes
    let defaults = [];
    if (scope === 'nodes') {
      if (key === 'material') defaults = normalizeOptions(NODE_MATERIAL_OPTIONS);
      else if (key === 'access') defaults = normalizeOptions(NODE_ACCESS_OPTIONS);
      else if (key === 'maintenance_status') defaults = normalizeOptions(NODE_MAINTENANCE_OPTIONS);
      else if (key === 'accuracy_level') defaults = normalizeOptions(NODE_ACCURACY_OPTIONS);
    } else {
      if (key === 'material') defaults = normalizeOptions(EDGE_MATERIAL_OPTIONS);
      else if (key === 'edge_type') defaults = normalizeOptions(EDGE_TYPE_OPTIONS);
      else if (key === 'line_diameter') defaults = normalizeOptions(EDGE_LINE_DIAMETERS);
      else if (key === 'engineering_status') defaults = normalizeOptions(EDGE_ENGINEERING_STATUS);
    }
    const def = defaults.find(o => String(o.label) === String(value));
    if (def && Number.isFinite(Number(def.code))) return String(def.code);
    return String(found.code);
  }
  return String(value);
}

function labelFor(scope, key, value, adminConfig) {
  if (value == null || value === '') return '';
  const options = getOptionsFor(scope, key, adminConfig);
  const byCode = options.find(o => String(o.code) === String(value));
  if (byCode) return String(byCode.label);
  const byLabel = options.find(o => String(o.label) === String(value));
  return byLabel ? String(byLabel.label) : String(value);
}

export function csvQuote(value) {
  const s = value == null ? '' : String(value);
  const normalized = s.replace(/\r?\n/g, ' ');
  return '"' + normalized.replace(/"/g, '""') + '"';
}

export function exportNodesCsv(nodes, adminConfig, t) {
  const include = adminConfig.nodes?.include || {};
  const headers = [];
  const rowFor = (n) => {
    const row = [];
    if (include.id) row.push(csvQuote(n.id));
    if (include.type) {
      // Show 'home_direct' for Home nodes with direct connection
      const nodeType = n.nodeType || 'Manhole';
      const typeValue = (nodeType === 'Home' && n.directConnection) ? 'home_direct' : nodeType;
      row.push(csvQuote(typeValue));
    }
    if (include.note) row.push(csvQuote(n.note || ''));
    if (include.material) row.push(csvQuote(codeFor('nodes', 'material', n.material, adminConfig)));
    if (include.cover_diameter) row.push(csvQuote(n.coverDiameter || ''));
    if (include.access) row.push(csvQuote(codeFor('nodes', 'access', n.access, adminConfig)));
    if (include.accuracy_level) row.push(csvQuote(codeFor('nodes', 'accuracy_level', n.accuracyLevel, adminConfig)));
    // engineering_status removed from node export
    if (include.maintenance_status) row.push(csvQuote(codeFor('nodes', 'maintenance_status', n.maintenanceStatus, adminConfig)));
    // Custom fields removed
    return row.join(',');
  };
  if (include.id) headers.push('ID');
  if (include.type) headers.push('Type');
  if (include.note) headers.push('Note');
  if (include.material) headers.push('Cover material');
  if (include.cover_diameter) headers.push('Cover diameter');
  if (include.access) headers.push('Access');
  if (include.accuracy_level) headers.push('Accuracy Level');
  // engineering_status removed from node headers
  if (include.maintenance_status) headers.push('Maintenance status');
  // Custom fields removed
  const lines = [headers.map(csvQuote).join(',')];
  for (const n of nodes) lines.push(rowFor(n));
  return lines.join('\n');
}

export function exportEdgesCsv(edges, adminConfig, t) {
  const include = adminConfig.edges?.include || {};
  const headers = [];
  const rowFor = (e) => {
    const row = [];
    if (include.from_node) row.push(csvQuote(e.tail));
    if (include.to_node) row.push(csvQuote(e.head));
    if (include.tail_measurement) row.push(csvQuote(e.tail_measurement || ''));
    if (include.head_measurement) row.push(csvQuote(e.head_measurement || ''));
    if (include.fall_depth) row.push(csvQuote(e.fall_depth || ''));
    if (include.fall_position) row.push(csvQuote(codeFor('edges', 'fall_position', e.fall_position, adminConfig)));
    if (include.line_diameter) row.push(csvQuote(codeFor('edges', 'line_diameter', e.line_diameter, adminConfig)));
    if (include.note) row.push(csvQuote(e.note || ''));
    if (include.edge_material) row.push(csvQuote(codeFor('edges', 'material', e.edge_material || e.material, adminConfig)));
    if (include.edge_type) row.push(csvQuote(codeFor('edges', 'edge_type', e.edge_type, adminConfig)));
    if (include.engineering_status) row.push(csvQuote(codeFor('edges', 'engineering_status', e.engineeringStatus, adminConfig)));
    // Custom fields removed
    return row.join(',');
  };
  if (include.from_node) headers.push('From');
  if (include.to_node) headers.push('To');
  if (include.tail_measurement) headers.push('Tail');
  if (include.head_measurement) headers.push('Head');
  if (include.fall_depth) headers.push('Fall depth');
  if (include.fall_position) headers.push('Fall position');
  if (include.line_diameter) headers.push('Diameter');
  if (include.note) headers.push('Note');
  if (include.edge_material) headers.push('Material');
  if (include.edge_type) headers.push('Type');
  if (include.engineering_status) headers.push('Engineering status');
  // Custom fields removed
  const lines = [headers.map(csvQuote).join(',')];
  for (const e of edges) lines.push(rowFor(e));
  return lines.join('\n');
}



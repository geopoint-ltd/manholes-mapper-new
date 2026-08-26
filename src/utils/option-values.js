// Recovery for option values that were truncated by unescaped HTML attributes.
//
// Dropdown values are written into the sketch as the option's own text. Until
// the details drawer escaped its markup, an option whose text contained a
// double quote — e.g. the material `פי. וי. סי. לפי ת"י 884`, or a pipe
// diameter entered in inches such as `4"` — was emitted as
//   <option value="פי. וי. סי. לפי ת"י 884">
// so the browser parsed the value as everything before the quote. Picking that
// option stored the truncated text, which then matched no option on the next
// render, and the drawer silently fell back to its first entry. The surveyor's
// choice vanished as soon as he moved to another line.
//
// Sketches captured before the escaping fix still hold those truncated values,
// so repair them on load. The match is deliberately narrow: a stored value is
// only upgraded when exactly one known option extends it with a double quote at
// precisely the cut point, which is the exact signature of the truncation.

import {
  EDGE_LINE_DIAMETERS,
  EDGE_MATERIAL_OPTIONS,
  EDGE_TYPE_OPTIONS,
  NODE_MATERIAL_OPTIONS,
} from '../state/constants.js';

/**
 * Every string an option could legitimately have been stored as.
 *
 * Materials and edge types store the label; line diameter stores the code. A
 * plain string entry (the built-in diameter list) is both at once.
 * @param {Array<string|{label?:unknown, code?:unknown}>} options
 * @returns {string[]}
 */
function candidateValues(options) {
  if (!Array.isArray(options)) return [];
  const values = [];
  options.forEach((option) => {
    if (option && typeof option === 'object') {
      if (typeof option.label === 'string') values.push(option.label);
      if (typeof option.code === 'string') values.push(option.code);
    } else if (typeof option === 'string') {
      values.push(option);
    }
  });
  return values;
}

/**
 * Resolve a stored option value back to its full text when it looks truncated.
 * @param {unknown} stored - Value read from a saved sketch
 * @param {Array} options - Known options for that field
 * @returns {unknown} The full value when recoverable, otherwise `stored` unchanged
 */
export function restoreTruncatedOptionValue(stored, options) {
  if (typeof stored !== 'string' || stored === '') return stored;
  const values = candidateValues(options);
  // An exact hit is already correct — never rewrite a value the user can pick.
  if (values.includes(stored)) return stored;
  const prefix = stored + '"';
  const matches = [...new Set(values.filter((value) => value.startsWith(prefix)))];
  return matches.length === 1 ? matches[0] : stored;
}

/**
 * Pick the option list for a field, preferring the admin-configured list.
 * @param {object} adminConfig
 * @param {'nodes'|'edges'} scope
 * @param {string} key
 * @param {Array} fallback
 * @returns {Array}
 */
function optionsFor(adminConfig, scope, key, fallback) {
  const configured = adminConfig?.[scope]?.options?.[key];
  return Array.isArray(configured) && configured.length ? configured : fallback;
}

/**
 * Repair truncated option values across a loaded sketch, in place.
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {object} adminConfig
 */
export function repairTruncatedOptionValues(nodes, edges, adminConfig) {
  const nodeMaterials = optionsFor(adminConfig, 'nodes', 'material', NODE_MATERIAL_OPTIONS);
  const edgeMaterials = optionsFor(adminConfig, 'edges', 'material', EDGE_MATERIAL_OPTIONS);
  const edgeTypes = optionsFor(adminConfig, 'edges', 'edge_type', EDGE_TYPE_OPTIONS);
  const edgeDiameters = optionsFor(adminConfig, 'edges', 'line_diameter', EDGE_LINE_DIAMETERS);
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => {
      if (!node) return;
      node.material = restoreTruncatedOptionValue(node.material, nodeMaterials);
    });
  }
  if (Array.isArray(edges)) {
    edges.forEach((edge) => {
      if (!edge) return;
      edge.material = restoreTruncatedOptionValue(edge.material, edgeMaterials);
      edge.edge_type = restoreTruncatedOptionValue(edge.edge_type, edgeTypes);
      edge.line_diameter = restoreTruncatedOptionValue(edge.line_diameter, edgeDiameters);
    });
  }
}

/**
 * Repair option labels inside a saved admin config, in place.
 *
 * The settings screen rendered each label into `<input value="...">`, so saving
 * settings wrote the truncated label back into the config and corrupted the
 * option list itself. Only restore a label when the built-in option with the
 * same code extends it at a double quote, so deliberate renames are untouched.
 *
 * @param {object} adminConfig
 */
export function repairTruncatedAdminLabels(adminConfig) {
  const defaults = [
    ['nodes', 'material', NODE_MATERIAL_OPTIONS],
    ['edges', 'material', EDGE_MATERIAL_OPTIONS],
    ['edges', 'edge_type', EDGE_TYPE_OPTIONS],
  ];
  defaults.forEach(([scope, key, builtIn]) => {
    const options = adminConfig?.[scope]?.options?.[key];
    if (!Array.isArray(options)) return;
    options.forEach((option) => {
      if (!option || typeof option.label !== 'string') return;
      const original = builtIn.find((o) => String(o.code) === String(option.code));
      if (!original || typeof original.label !== 'string') return;
      if (original.label === option.label) return;
      if (original.label.startsWith(option.label + '"')) option.label = original.label;
    });
    const currentDefault = adminConfig?.[scope]?.defaults?.[key];
    if (typeof currentDefault === 'string') {
      adminConfig[scope].defaults[key] = restoreTruncatedOptionValue(currentDefault, options);
    }
  });
}

// Package one received sketch as a zip the office can open straight away.
//
// The office does not want a sketch on a screen — it wants the files that feed
// the GIS load: the manholes CSV, the lines CSV, and the sketch itself so it can
// be reopened or re-exported later. Three separate downloads per sketch, named
// by a random id, is how those files get lost, so they travel as one archive
// named after the day the surveyor drew it.

import { exportNodesCsv, exportEdgesCsv } from '../utils/csv.js';

/**
 * DD-MM-YYYY, which is how the crews write and file a survey date.
 * @param {string|Date|null} value
 * @returns {string}
 */
export function formatSketchDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/**
 * What this sketch should be called, in the office and on disk.
 *
 * A surveyor rarely names a sketch, so the stored name is usually null and the
 * fallback used to be the raw id (`sk_mtmz1eqdsjfuke`) — unreadable, and
 * useless for filing. The day it was drawn is the thing the office actually
 * files by, so that is the default.
 * @param {{name?: string|null, creationDate?: string|null, createdAt?: string|null, submittedAt?: any, id: string}} sketch
 * @returns {string}
 */
export function sketchDisplayName(sketch) {
  if (sketch && sketch.name && String(sketch.name).trim()) return String(sketch.name).trim();
  const dated = formatSketchDate(sketch && (sketch.creationDate || sketch.createdAt));
  return dated || String((sketch && sketch.id) || 'sketch');
}

/** Strip anything a filesystem would refuse, without mangling Hebrew. */
function safeFileName(name) {
  return String(name || 'sketch')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * UTF-16LE with a BOM.
 *
 * Matches what the app's own CSV export writes. Excel on Windows opens that
 * without mangling Hebrew; UTF-8 without a BOM turns every column header into
 * mojibake, which is exactly the complaint this format exists to avoid.
 * @param {string} text
 * @returns {Uint8Array}
 */
function encodeUtf16LeWithBom(text) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[2 + i * 2 + 1] = code >> 8;
  }
  return bytes;
}

/** The app writes `sep=,` first so Excel stops guessing the delimiter. */
function csvFile(text) {
  return encodeUtf16LeWithBom('sep=,\r\n' + String(text).replace(/\n/g, '\r\n'));
}

/**
 * Build the archive for one sketch.
 *
 * @param {object} sketch A submitted sketch document
 * @param {object|null} adminConfig The office's column configuration, or null
 *   when it cannot be read — in which case the CSVs are skipped rather than
 *   guessed at, and the sketch JSON still travels.
 * @param {(key: string) => string} t
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function buildSketchZip(sketch, adminConfig, t) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const base = safeFileName(sketchDisplayName(sketch));
  const nodes = Array.isArray(sketch.nodes) ? sketch.nodes : [];
  const edges = Array.isArray(sketch.edges) ? sketch.edges : [];

  // The sketch itself, in the same shape the app imports, so a sketch can be
  // reopened on any device rather than only read.
  zip.file(
    `${base}.json`,
    JSON.stringify(
      {
        id: sketch.id,
        name: sketch.name || null,
        nodes,
        edges,
        nextNodeId: sketch.nextNodeId || nodes.length + 1,
        creationDate: sketch.creationDate || sketch.createdAt || null,
        ownerEmail: sketch.ownerEmail || null,
      },
      null,
      2
    )
  );

  if (adminConfig) {
    zip.file(`${base}_${t('cloud.nodes')}.csv`, csvFile(exportNodesCsv(nodes, adminConfig, t)));
    zip.file(`${base}_${t('cloud.lines')}.csv`, csvFile(exportEdgesCsv(edges, adminConfig, t)));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `${base}.zip` };
}

/** Hand the archive to the browser. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a moment to start before the URL stops resolving.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

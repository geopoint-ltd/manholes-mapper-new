// Persistence helpers that bridge IndexedDB data into localStorage for legacy code paths
// and provide thin wrappers used by legacy main.js during the migration to modules.

import { loadCurrentSketch, getAllSketches, saveCurrentSketch, saveSketch, deleteSketch } from '../db.js';

export async function restoreFromIndexedDbIfNeeded() {
  try {
    const [current, library] = await Promise.all([
      loadCurrentSketch().catch(() => null),
      getAllSketches().catch(() => []),
    ]);

    try {
      if (!localStorage.getItem('graphSketch') && current) {
        localStorage.setItem('graphSketch', JSON.stringify(current));
      }
    } catch (_) {}

    try {
      const existing = localStorage.getItem('graphSketch.library');
      const hasExisting = existing && existing.length > 2;
      if (!hasExisting && Array.isArray(library) && library.length > 0) {
        localStorage.setItem('graphSketch.library', JSON.stringify(library));
      }
    } catch (_) {}
  } catch (err) {
    console.warn('restoreFromIndexedDbIfNeeded failed', err);
  }
}

// Back-compat thin wrappers to be used by legacy code while we migrate call sites.
export function idbSaveCurrentCompat(sketch) {
  try { saveCurrentSketch(sketch); } catch (_) {}
}

export function idbSaveRecordCompat(record) {
  try { saveSketch(record); } catch (_) {}
}

export function idbDeleteRecordCompat(id) {
  try { deleteSketch(id); } catch (_) {}
}



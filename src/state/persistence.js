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
//
// IndexedDB is the durability backup here — localStorage is the primary store —
// so a failure must never surface to the surveyor. These calls are async, so a
// bare try/catch would let the rejection escape to window.onunhandledrejection,
// which the app turns into an on-screen error toast. Swallow it explicitly and
// log instead, or every save shows a warning the user can do nothing about.
function ignoreAsyncFailure(promise, label) {
  Promise.resolve(promise).catch((err) => {
    console.warn(`${label} failed`, err && err.message ? err.message : err);
  });
}

export function idbSaveCurrentCompat(sketch) {
  try { ignoreAsyncFailure(saveCurrentSketch(sketch), 'idbSaveCurrent'); } catch (_) {}
}

export function idbSaveRecordCompat(record) {
  try { ignoreAsyncFailure(saveSketch(record), 'idbSaveRecord'); } catch (_) {}
}

export function idbDeleteRecordCompat(id) {
  try { ignoreAsyncFailure(deleteSketch(id), 'idbDeleteRecord'); } catch (_) {}
}



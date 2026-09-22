// Office-wide settings, shared by every admin.
//
// settings/trello holds the Trello API key and where new cards go (board and
// list). Set once by any admin, used by all of them. The key only identifies
// the app to Trello; what grants access to a Trello account is each admin's own
// token, which never leaves their browser (see src/cloud/trello.js).
//
// firestore.rules lets admins alone read or write this collection.

import { getDb } from './app.js';
import { getProfile, isAdmin } from './auth.js';

function assertAdmin() {
  if (!isAdmin()) throw new Error('admin-only');
}

/**
 * Keep the Trello settings live.
 * @param {(settings: object) => void} onChange Called with {} when none are saved yet.
 * @returns {Promise<() => void>} unsubscribe
 */
export async function watchTrelloSettings(onChange, onError) {
  assertAdmin();
  const db = await getDb();
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'settings', 'trello'),
    (snap) => onChange(snap.exists() ? snap.data() : {}),
    (err) => {
      if (typeof onError === 'function') onError(err);
      else console.warn('trello settings watch failed', err && err.message);
    }
  );
}

/** Merge a change into the Trello settings. */
export async function saveTrelloSettings(patch) {
  assertAdmin();
  const profile = getProfile();
  const db = await getDb();
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  await setDoc(
    doc(db, 'settings', 'trello'),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: profile ? profile.uid : null },
    { merge: true }
  );
}

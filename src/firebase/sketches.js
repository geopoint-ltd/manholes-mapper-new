// Sketches in the cloud.
//
// A sketch always belongs to the member who captured it and is stored under
// users/{uid}/sketches/{sketchId}. Sending it to the office does not move or
// copy it — it only flips a status flag. The admin reads it in place, which is
// what "the sketch stays in the member's account" means.
//
// Firestore's persistent cache does the offline work: writes made underground
// queue on the device and flush when signal returns, so nothing here waits on
// the network.

import { SKETCH_STATUS } from './config.js';
import { getDb } from './app.js';
import { getProfile, isAdmin } from './auth.js';
import { revOf, revsOf } from '../cloud/sync-plan.js';

function requireProfile() {
  const profile = getProfile();
  if (!profile) throw new Error('not-signed-in');
  return profile;
}

/** Strip a local library record down to what belongs in Firestore. */
function toCloudSketch(record) {
  return {
    id: String(record.id),
    name: record.name || null,
    nodes: Array.isArray(record.nodes) ? record.nodes : [],
    edges: Array.isArray(record.edges) ? record.edges : [],
    nextNodeId: Number(record.nextNodeId) || 1,
    creationDate: record.creationDate || record.createdAt || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || record.createdAt || null,
    nodeCount: Array.isArray(record.nodes) ? record.nodes.length : 0,
    edgeCount: Array.isArray(record.edges) ? record.edges.length : 0,
    // Without it, a sketch pulled onto another device would be run through
    // data migrations meant for sketches from older versions of the app.
    schemaVersion: Number(record.schemaVersion) || null,
    // Cross-device sync: which version this is, and what it grew from.
    // A sketch saved before versions existed gets the same stand-in version
    // on both sides, so the two copies are recognised as one.
    rev: revOf(record),
    revs: revsOf(record),
    // A send always means "this sketch exists": it undoes a delete made on
    // another device, when this one still had unsent work in it.
    deleted: false,
  };
}

/**
 * Create or update one of the signed-in member's sketches.
 * @param {object} record A record from the local sketch library
 */
export async function saveSketch(record) {
  const profile = requireProfile();
  if (!record || !record.id) throw new Error('sketch-id-required');
  const db = await getDb();
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const ref = doc(db, 'users', profile.uid, 'sketches', String(record.id));
  await setDoc(
    ref,
    {
      ...toCloudSketch(record),
      ownerUid: profile.uid,
      ownerEmail: profile.email,
      syncedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Push several sketches. Failures are collected rather than aborting the run,
 * so one bad record cannot block the rest of a day's work from syncing.
 * @param {Array<object>} records
 * @returns {Promise<{saved: number, failed: Array<{id: string, error: string}>}>}
 */
export async function saveSketches(records) {
  const list = Array.isArray(records) ? records : [];
  const failed = [];
  let saved = 0;
  for (const record of list) {
    try {
      await saveSketch(record);
      saved += 1;
    } catch (err) {
      failed.push({ id: String(record && record.id), error: (err && err.message) || String(err) });
    }
  }
  return { saved, failed };
}

/**
 * Keep this account's sketches live, for cross-device sync and for the "sent"
 * marks. Every sketch, whatever its status, including deleted ones — a delete
 * is a flag, so other devices can see it happened.
 * @param {(sketches: object[]) => void} onChange
 * @returns {Promise<() => void>} unsubscribe
 */
export async function watchMySketches(onChange, onError) {
  const profile = requireProfile();
  const db = await getDb();
  const { collection, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    collection(db, 'users', profile.uid, 'sketches'),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      if (typeof onError === 'function') onError(err);
      else console.warn('sketch watch failed', err && err.message);
    }
  );
}

/**
 * Mark one of your sketches deleted, so your other devices drop it too.
 *
 * A flag rather than a delete, for two reasons: other devices must be able to
 * tell "deleted by its owner" from "removed by the office" (which never touches
 * a worker's device), and the drawing stays in place, so nothing is beyond
 * recovery. A copy already sent to the office stays in the office's inbox.
 */
export async function markSketchDeleted(sketchId, { rev, revs }) {
  const profile = requireProfile();
  const db = await getDb();
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  await setDoc(
    doc(db, 'users', profile.uid, 'sketches', String(sketchId)),
    { deleted: true, deletedAt: serverTimestamp(), rev, revs, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** The signed-in member's own sketches. */
export async function listMySketches() {
  const profile = requireProfile();
  const db = await getDb();
  const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
  const ref = collection(db, 'users', profile.uid, 'sketches');
  const snap = await getDocs(query(ref, orderBy('updatedAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Send a sketch to the office.
 *
 * Flips status to submitted and stamps the time. Ownership does not change.
 * @param {object} record The local library record, so the cloud copy is current
 */
export async function submitSketch(record) {
  const profile = requireProfile();
  await saveSketch(record);
  const db = await getDb();
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', profile.uid, 'sketches', String(record.id)), {
    status: SKETCH_STATUS.SUBMITTED,
    submittedAt: serverTimestamp(),
  });
}

/** Pull a sketch back into editing; the admin keeps seeing the latest version. */
export async function unsubmitSketch(sketchId) {
  const profile = requireProfile();
  const db = await getDb();
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', profile.uid, 'sketches', String(sketchId)), {
    status: SKETCH_STATUS.DRAFT,
    submittedAt: null,
  });
}

/**
 * Every submitted sketch, from every member — the office inbox.
 *
 * Uses a collection-group query, so it needs the composite index in
 * firestore.indexes.json and the `{path=**}/sketches` rule.
 * @returns {Promise<Array<object>>}
 */
/**
 * Watch every submitted sketch, so the office learns of one as it arrives.
 *
 * The office asked to see a sketch the moment a surveyor sends it, not on the
 * next time they think to open the panel — a one-shot read cannot do that. This
 * is the same query as listSubmittedSketches, kept live.
 *
 * @param {(sketches: object[]) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {Promise<() => void>} unsubscribe
 */
export async function watchSubmittedSketches(onChange, onError) {
  if (!isAdmin()) throw new Error('admin-only');
  const db = await getDb();
  const { collectionGroup, onSnapshot, query, where, orderBy } = await import(
    'firebase/firestore'
  );
  return onSnapshot(
    query(
      collectionGroup(db, 'sketches'),
      where('status', '==', SKETCH_STATUS.SUBMITTED),
      orderBy('submittedAt', 'desc')
    ),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, path: d.ref.path, ...d.data() }))),
    (err) => {
      if (typeof onError === 'function') onError(err);
      else console.warn('inbox watch failed', err && err.message);
    }
  );
}

export async function listSubmittedSketches() {
  if (!isAdmin()) throw new Error('admin-only');
  const db = await getDb();
  const { collectionGroup, getDocs, query, where, orderBy } = await import('firebase/firestore');
  const snap = await getDocs(
    query(
      collectionGroup(db, 'sketches'),
      where('status', '==', SKETCH_STATUS.SUBMITTED),
      orderBy('submittedAt', 'desc')
    )
  );
  return snap.docs.map((d) => ({ id: d.id, path: d.ref.path, ...d.data() }));
}

/**
 * Read one member's sketch as an admin.
 * @param {string} ownerUid
 * @param {string} sketchId
 */
/**
 * Delete a received sketch from the app. Admin only.
 *
 * This removes the cloud copy — what the office sees and downloads. It cannot
 * reach the worker's phone: sketches there live in local storage, and the app
 * never deletes local work on the office's say-so, because on a device that is
 * often the only copy of unsent work.
 */
export async function deleteMemberSketch(ownerUid, sketchId) {
  if (!isAdmin()) throw new Error('admin-only');
  const db = await getDb();
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'users', String(ownerUid), 'sketches', String(sketchId)));
}

export async function getMemberSketch(ownerUid, sketchId) {
  if (!isAdmin()) throw new Error('admin-only');
  const db = await getDb();
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'users', ownerUid, 'sketches', String(sketchId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

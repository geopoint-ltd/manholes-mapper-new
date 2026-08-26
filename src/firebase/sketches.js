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
    updatedAt: record.updatedAt || new Date().toISOString(),
    nodeCount: Array.isArray(record.nodes) ? record.nodes.length : 0,
    edgeCount: Array.isArray(record.edges) ? record.edges.length : 0,
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
export async function getMemberSketch(ownerUid, sketchId) {
  if (!isAdmin()) throw new Error('admin-only');
  const db = await getDb();
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'users', ownerUid, 'sketches', String(sketchId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

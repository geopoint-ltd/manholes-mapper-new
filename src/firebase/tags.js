// Tags, and the office's bookkeeping on a received sketch.
//
// A tag is a named, coloured label — typically who in the office will process a
// batch ("Asmaa", "Murjan"). The catalogue lives at tags/{tagId}; a sketch holds
// the ids it carries in its own `tags` array.
//
// Who may do what is enforced by firestore.rules, not here:
//   - anyone signed in may create a tag and put it on their own sketch;
//   - only an admin may rename, recolour or delete a tag, or take one off;
//   - only an admin writes the office checklist on a sketch.

import { getDb } from './app.js';
import { getProfile, isAdmin } from './auth.js';

/**
 * The colours on offer. A fixed palette rather than a free picker: every one of
 * these reads on a light and a dark surface, and two people choosing "blue" get
 * the same blue.
 */
export const TAG_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#db2777', // pink
  '#0d9488', // teal
  '#475569', // slate
];

/** The three things the office ticks off for every batch, in working order. */
export const OFFICE_FLAGS = ['inDb', 'removedFromApp', 'inTrello'];

const MAX_NAME = 40;

function requireProfile() {
  const profile = getProfile();
  if (!profile) throw new Error('not-signed-in');
  return profile;
}

function assertAdmin() {
  if (!isAdmin()) throw new Error('admin-only');
}

function cleanName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME);
}

function cleanColor(color) {
  return TAG_COLORS.includes(color) ? color : TAG_COLORS[0];
}

/**
 * Keep the tag catalogue live, sorted by name.
 * @param {(tags: {id: string, name: string, color: string}[]) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {Promise<() => void>} unsubscribe
 */
export async function watchTags(onChange, onError) {
  requireProfile();
  const db = await getDb();
  const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
  return onSnapshot(
    query(collection(db, 'tags'), orderBy('name')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      if (typeof onError === 'function') onError(err);
      else console.warn('tag watch failed', err && err.message);
    }
  );
}

/** Create a tag. Anyone signed in. */
export async function createTag({ name, color }) {
  const profile = requireProfile();
  const clean = cleanName(name);
  if (!clean) throw new Error('tag-name-required');
  const db = await getDb();
  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
  const data = { name: clean, color: cleanColor(color) };
  const ref = await addDoc(collection(db, 'tags'), {
    ...data,
    createdBy: profile.uid,
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, ...data };
}

/** Rename or recolour a tag. Admin only. */
export async function updateTag(tagId, { name, color }) {
  assertAdmin();
  const clean = cleanName(name);
  if (!clean) throw new Error('tag-name-required');
  const db = await getDb();
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'tags', String(tagId)), { name: clean, color: cleanColor(color) });
}

/**
 * Delete a tag. Admin only.
 *
 * Sketches that carried it keep the dangling id; every view filters ids it
 * cannot find in the catalogue, so the tag simply stops appearing. Sweeping
 * every sketch in every account would be a write per sketch for no visible gain.
 */
export async function deleteTag(tagId) {
  assertAdmin();
  const db = await getDb();
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'tags', String(tagId)));
}

function sketchRef(firestore, db, ownerUid, sketchId) {
  return firestore.doc(db, 'users', String(ownerUid), 'sketches', String(sketchId));
}

/**
 * Put a tag on a sketch. The owner, or an admin.
 *
 * A merge write, so it works on a sketch that has not synced to the cloud yet:
 * the document is created with just the tag, and the drawing lands beside it
 * on the next sync.
 */
export async function addSketchTag(ownerUid, sketchId, tagId) {
  requireProfile();
  const db = await getDb();
  const firestore = await import('firebase/firestore');
  await firestore.setDoc(
    sketchRef(firestore, db, ownerUid, sketchId),
    { tags: firestore.arrayUnion(String(tagId)) },
    { merge: true }
  );
}

/** Take a tag off a sketch. Admin only — for a worker a tag, once on, stays. */
export async function removeSketchTag(ownerUid, sketchId, tagId) {
  assertAdmin();
  const db = await getDb();
  const firestore = await import('firebase/firestore');
  await firestore.updateDoc(sketchRef(firestore, db, ownerUid, sketchId), {
    tags: firestore.arrayRemove(String(tagId)),
  });
}

/**
 * Tick or untick one item of the office checklist on a sketch. Admin only.
 * @param {'inDb'|'removedFromApp'|'inTrello'} flag
 */
export async function setOfficeFlag(ownerUid, sketchId, flag, value) {
  assertAdmin();
  if (!OFFICE_FLAGS.includes(flag)) throw new Error('unknown-office-flag');
  const profile = requireProfile();
  const db = await getDb();
  const firestore = await import('firebase/firestore');
  await firestore.updateDoc(sketchRef(firestore, db, ownerUid, sketchId), {
    [`office.${flag}`]: Boolean(value),
    officeUpdatedAt: firestore.serverTimestamp(),
    officeUpdatedBy: profile.uid,
  });
}

// Files attached to a sketch — site photos, a scanned page, a PDF.
//
// The bytes live in Cloud Storage under users/{uid}/sketches/{sketchId}/, and a
// small metadata document sits beside the sketch in Firestore so the office can
// list what a worker attached without touching Storage. Both paths are keyed by
// the owner's uid, so the same rule protects them: the owner writes, the owner
// and any admin read.

import { getDb, getStorageRef } from './app.js';
import { getProfile, isAdmin } from './auth.js';

/** Reject anything that is not a document or an image, and anything oversized. */
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;

function requireProfile() {
  const profile = getProfile();
  if (!profile) throw new Error('not-signed-in');
  return profile;
}

/** Keep the original name readable but safe to use inside a Storage path. */
function safeName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .slice(-120);
}

/**
 * Upload one file against a sketch.
 * @param {string} sketchId
 * @param {File} file
 * @param {(pct: number) => void} [onProgress] 0-100
 * @returns {Promise<object>} the stored metadata
 */
export async function uploadAttachment(sketchId, file, onProgress) {
  const profile = requireProfile();
  if (!file) throw new Error('file-required');
  if (file.size > MAX_BYTES) throw new Error('file-too-large');
  if (file.type && !ALLOWED.test(file.type)) throw new Error('file-type-not-allowed');

  const storage = await getStorageRef();
  const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
  const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `users/${profile.uid}/sketches/${sketchId}/${fileId}-${safeName(file.name)}`;
  const storageRef = ref(storage, path);

  const task = uploadBytesResumable(storageRef, file, { contentType: file.type || undefined });
  await new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (typeof onProgress === 'function' && snap.totalBytes) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      resolve
    );
  });
  const url = await getDownloadURL(storageRef);

  const meta = {
    id: fileId,
    name: file.name || 'file',
    size: file.size,
    contentType: file.type || '',
    path,
    url,
    ownerUid: profile.uid,
    ownerEmail: profile.email,
    uploadedAt: new Date().toISOString(),
  };
  const db = await getDb();
  const { doc, setDoc } = await import('firebase/firestore');
  await setDoc(
    doc(db, 'users', profile.uid, 'sketches', String(sketchId), 'attachments', fileId),
    meta
  );
  return meta;
}

/**
 * List the files on a sketch. Members pass their own uid implicitly; an admin
 * passes the owner's uid to read someone else's.
 * @param {string} sketchId
 * @param {string} [ownerUid]
 */
export async function listAttachments(sketchId, ownerUid) {
  const profile = requireProfile();
  const uid = ownerUid || profile.uid;
  if (uid !== profile.uid && !isAdmin()) throw new Error('admin-only');
  const db = await getDb();
  const { collection, getDocs } = await import('firebase/firestore');
  const snap = await getDocs(
    collection(db, 'users', uid, 'sketches', String(sketchId), 'attachments')
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Delete an attachment. Only the owner may — the office reads, it does not
 * remove a worker's evidence.
 * @param {string} sketchId
 * @param {object} meta as returned by listAttachments
 */
export async function deleteAttachment(sketchId, meta) {
  const profile = requireProfile();
  if (!meta || meta.ownerUid !== profile.uid) throw new Error('owner-only');
  const storage = await getStorageRef();
  const { ref, deleteObject } = await import('firebase/storage');
  await deleteObject(ref(storage, meta.path)).catch((err) => {
    // A missing object should not strand the metadata row.
    if (!String(err && err.code).includes('object-not-found')) throw err;
  });
  const db = await getDb();
  const { doc, deleteDoc } = await import('firebase/firestore');
  await deleteDoc(
    doc(db, 'users', profile.uid, 'sketches', String(sketchId), 'attachments', meta.id)
  );
}

/** Human-readable size for the UI. */
export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

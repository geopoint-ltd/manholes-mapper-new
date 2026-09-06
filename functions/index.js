// Optional admin-only callables.
//
// Everything the app needs day to day works on the free Spark plan. These three
// close the gaps the client SDK cannot: setting another user's password,
// changing their email, and deleting their auth record. Deploying them requires
// the Blaze (pay-as-you-go) plan.
//
//   cd functions && npm install
//   npx firebase deploy --only functions
//
// Authorisation is re-checked here from Firestore. Never trust a role sent by
// the caller — read it server-side, every time.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

async function requireAdmin(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await getFirestore().collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() : null;
  if (!data || data.role !== 'admin' || data.disabled === true) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  return uid;
}

/** Set a member's password directly. */
export const adminSetPassword = onCall(async (request) => {
  await requireAdmin(request);
  const { uid, password } = request.data || {};
  if (!uid || !password || String(password).length < 6) {
    throw new HttpsError('invalid-argument', 'uid and a password of 6+ characters are required.');
  }
  await getAuth().updateUser(uid, { password: String(password) });
  return { ok: true };
});

/** Change a member's sign-in email. */
export const adminUpdateEmail = onCall(async (request) => {
  await requireAdmin(request);
  const { uid, email } = request.data || {};
  if (!uid || !email) throw new HttpsError('invalid-argument', 'uid and email are required.');
  await getAuth().updateUser(uid, { email: String(email).trim() });
  await getFirestore().collection('users').doc(uid).update({ email: String(email).trim() });
  return { ok: true };
});

/** Delete a member's auth record and profile. Sketches are left in place. */
export const adminDeleteUser = onCall(async (request) => {
  const callerUid = await requireAdmin(request);
  const { uid } = request.data || {};
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'You cannot delete yourself.');
  await getAuth().deleteUser(uid).catch((err) => {
    if (err.code !== 'auth/user-not-found') throw err;
  });
  await getFirestore().collection('users').doc(uid).delete();
  return { ok: true };
});

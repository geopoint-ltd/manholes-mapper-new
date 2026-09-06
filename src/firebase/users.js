// Admin-side member management.
//
// Creating a user with the client SDK signs that user in, which would kick the
// admin out of their own session. Every creation therefore runs on a throwaway
// secondary Firebase app (see createSecondaryAuth) so the admin's session is
// never touched.
//
// What the client SDK cannot do, on any plan: set or read another user's
// password, change their email, or delete their auth record. Those need the
// Admin SDK. `disabled` here is an app-level flag enforced by the security
// rules and checked at sign-in — see functions/README.md for the optional
// Cloud Functions that add true auth-level control (requires the Blaze plan).

import { ROLES } from './config.js';
import { getDb, createSecondaryAuth } from './app.js';
import { isAdmin } from './auth.js';

function assertAdmin() {
  if (!isAdmin()) throw new Error('admin-only');
}

/**
 * Create a member account and its profile document.
 * @param {{email: string, password: string, displayName?: string}} input
 * @returns {Promise<{uid: string, email: string}>}
 */
export async function createMember({ email, password, displayName }) {
  assertAdmin();
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('email-required');
  if (!password || String(password).length < 6) {
    const err = new Error('weak-password');
    err.code = 'auth/weak-password';
    throw err;
  }

  const { auth: secondaryAuth, dispose } = await createSecondaryAuth();
  try {
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
    const name = String(displayName || '').trim() || cleanEmail;
    await updateProfile(cred.user, { displayName: name }).catch(() => {});

    const db = await getDb();
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email: cleanEmail,
      displayName: name,
      role: ROLES.MEMBER,
      disabled: false,
      createdAt: serverTimestamp(),
    });
    return { uid: cred.user.uid, email: cleanEmail };
  } finally {
    // Always tear the secondary app down, even if creation threw, or the next
    // create would collide on the app name and leak a signed-in session.
    await dispose();
  }
}

/**
 * Every user profile, admins included.
 * @returns {Promise<Array<object>>}
 */
export async function listUsers() {
  assertAdmin();
  const db = await getDb();
  const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
  const snap = await getDocs(query(collection(db, 'users'), orderBy('email')));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/**
 * Block or restore a member's access.
 *
 * The flag is honoured by the security rules and at sign-in. An already-open
 * session keeps its auth token until it expires (up to an hour), but every
 * write it attempts is refused by the rules immediately.
 * @param {string} uid
 * @param {boolean} disabled
 */
export async function setMemberDisabled(uid, disabled) {
  assertAdmin();
  const db = await getDb();
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', uid), { disabled: Boolean(disabled) });
}

/**
 * Rename a member (display name only — email is an auth-level field).
 * @param {string} uid
 * @param {string} displayName
 */
export async function setMemberName(uid, displayName) {
  assertAdmin();
  const db = await getDb();
  const { doc, updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', uid), { displayName: String(displayName || '').trim() });
}

/**
 * Ask Firebase to email the member a password-reset link.
 *
 * This is how an admin changes a member's password without the Admin SDK: the
 * member sets the new one themselves from the link.
 * @param {string} email
 */
export async function sendMemberPasswordReset(email) {
  assertAdmin();
  const { sendPasswordReset } = await import('./auth.js');
  await sendPasswordReset(email);
}

/**
 * Remove a member's profile document.
 *
 * Their auth record survives — deleting that needs the Admin SDK — so the
 * profile is marked disabled first, which blocks sign-in and every rule-guarded
 * read and write.
 * @param {string} uid
 */
export async function removeMember(uid) {
  assertAdmin();
  const db = await getDb();
  const { doc, updateDoc, deleteDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', uid), { disabled: true, removedAt: new Date().toISOString() });
  await deleteDoc(doc(db, 'users', uid));
}

// Sign-in, sign-out, and the current user's role.
//
// Roles live on a Firestore document at users/{uid} rather than in a custom
// auth claim, so an admin can grant them from the browser without the Admin
// SDK (which would mean Cloud Functions, which would mean a paid plan). The
// security rules read the same document, so the role is enforced server-side
// even though it is set client-side.

import { ROLES } from './config.js';
import { getFirebaseAuth, getDb } from './app.js';

/**
 * @typedef {object} Profile
 * @property {string} uid
 * @property {string} email
 * @property {string} displayName
 * @property {'admin'|'member'} role
 * @property {boolean} disabled
 */

/** @type {Profile|null} */
let currentProfile = null;
/** @type {Set<(profile: Profile|null) => void>} */
const listeners = new Set();
let watching = false;

function emit() {
  listeners.forEach((fn) => {
    try { fn(currentProfile); } catch (err) { console.warn('auth listener failed', err); }
  });
}

/** The signed-in user's profile, or null. Synchronous — may be null before the first check. */
export function getProfile() {
  return currentProfile;
}

/** @returns {boolean} */
export function isAdmin() {
  return Boolean(currentProfile && currentProfile.role === ROLES.ADMIN);
}

/**
 * Subscribe to sign-in state. Fires immediately with the current value.
 * @param {(profile: Profile|null) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onProfileChanged(fn) {
  listeners.add(fn);
  fn(currentProfile);
  return () => listeners.delete(fn);
}

/**
 * Read users/{uid}, creating it on first sign-in.
 *
 * A user who authenticates but has no profile document is treated as a member.
 * Only an admin can change a role, which the rules enforce.
 * @param {import('firebase/auth').User} user
 * @returns {Promise<Profile>}
 */
async function loadOrCreateProfile(user) {
  const db = await getDb();
  const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() || {};
    return {
      uid: user.uid,
      email: data.email || user.email || '',
      displayName: data.displayName || user.displayName || user.email || '',
      role: data.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER,
      disabled: data.disabled === true,
    };
  }
  const profile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || '',
    role: ROLES.MEMBER,
    disabled: false,
  };
  await setDoc(ref, { ...profile, createdAt: serverTimestamp() }, { merge: true });
  return profile;
}

/** Begin watching auth state. Safe to call repeatedly. */
export async function startAuthWatch() {
  if (watching) return;
  watching = true;
  const auth = await getFirebaseAuth();
  const { onAuthStateChanged } = await import('firebase/auth');
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentProfile = null;
      emit();
      return;
    }
    try {
      currentProfile = await loadOrCreateProfile(user);
    } catch (err) {
      // Offline on first launch: fall back to a member-shaped profile from the
      // cached auth session so the field app still opens.
      console.warn('profile load failed, using cached session', err);
      currentProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || '',
        role: ROLES.MEMBER,
        disabled: false,
      };
    }
    emit();
  });
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Profile>}
 */
export async function signIn(email, password) {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const cred = await signInWithEmailAndPassword(auth, String(email).trim(), password);
  const profile = await loadOrCreateProfile(cred.user);
  if (profile.disabled) {
    await signOut();
    const err = new Error('account-disabled');
    err.code = 'app/account-disabled';
    throw err;
  }
  currentProfile = profile;
  emit();
  return profile;
}

/**
 * Sign out.
 *
 * Deliberately leaves local sketches alone. This app is offline-first and the
 * device is the only copy of unsent work — wiping on sign-out would destroy a
 * surveyor's day.
 */
export async function signOut() {
  const auth = await getFirebaseAuth();
  const { signOut: fbSignOut } = await import('firebase/auth');
  await fbSignOut(auth);
  currentProfile = null;
  emit();
}

/** Send a password reset email to the signed-in user or a given address. */
export async function sendPasswordReset(email) {
  const auth = await getFirebaseAuth();
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(auth, String(email).trim());
}

/** Change the signed-in user's own password. Requires the current one. */
export async function changeOwnPassword(currentPassword, newPassword) {
  const auth = await getFirebaseAuth();
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } =
    await import('firebase/auth');
  const user = auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

/**
 * Turn a Firebase auth error into something a field worker can act on.
 * @param {any} err
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function describeAuthError(err, t) {
  const code = (err && err.code) || '';
  const map = {
    'auth/invalid-email': 'cloud.errInvalidEmail',
    'auth/user-disabled': 'cloud.errDisabled',
    'app/account-disabled': 'cloud.errDisabled',
    'auth/user-not-found': 'cloud.errBadCredentials',
    'auth/wrong-password': 'cloud.errBadCredentials',
    'auth/invalid-credential': 'cloud.errBadCredentials',
    'auth/too-many-requests': 'cloud.errTooMany',
    'auth/network-request-failed': 'cloud.errNetwork',
    'auth/email-already-in-use': 'cloud.errEmailInUse',
    'auth/weak-password': 'cloud.errWeakPassword',
  };
  const key = map[code];
  return key ? t(key) : (err && err.message) || String(err);
}

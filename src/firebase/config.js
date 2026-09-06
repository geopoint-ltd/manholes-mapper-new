// Firebase project configuration.
//
// Values come from Vite env vars so nothing project-specific is committed.
// Copy .env.example to .env.local and fill it from the Firebase console
// (Project settings -> General -> Your apps -> Web app -> SDK setup).
//
// These keys are not secrets — a web app ships them to every browser. What
// protects the data is Firestore/Storage security rules, not the config.

const env = import.meta.env || {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/**
 * Whether the build carries a usable Firebase configuration.
 *
 * When it does not, the app must keep working exactly as before — offline,
 * local-only, no login wall. Every entry point checks this first.
 * @returns {boolean}
 */
export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

/**
 * Whether a Cloud Storage bucket is available for file attachments.
 *
 * Firebase requires a billing account (Blaze) before it will provision a bucket
 * for a new project, and this deployment runs on the free Spark plan — so there
 * is none. The console prints a `storageBucket` value in its SDK snippet all
 * the same, which is exactly why this is a separate check from
 * isFirebaseConfigured(): leave VITE_FIREBASE_STORAGE_BUCKET empty and the
 * attachment controls are never rendered, instead of failing at upload time
 * with a raw Firebase error in front of a surveyor.
 * @returns {boolean}
 */
export function isStorageConfigured() {
  return isFirebaseConfigured() && Boolean(firebaseConfig.storageBucket);
}

/** Connect to the local emulator suite instead of the live project. */
export const useEmulators = String(env.VITE_FIREBASE_EMULATORS || '') === 'true';

/** Roles understood by the app. Stored on the user document, enforced in rules. */
export const ROLES = Object.freeze({ ADMIN: 'admin', MEMBER: 'member' });

/** Sketch lifecycle states. A member submits; an admin reads. */
export const SKETCH_STATUS = Object.freeze({ DRAFT: 'draft', SUBMITTED: 'submitted' });

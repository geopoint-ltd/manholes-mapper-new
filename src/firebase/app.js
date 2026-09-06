// Firebase singletons.
//
// Everything is imported lazily so a build without Firebase configured — or a
// device that never signs in — does not pay for the SDK on first paint. The
// app is offline-first, so Firestore runs with local persistence and the UI
// must never block on the network.

import { firebaseConfig, isFirebaseConfigured, useEmulators } from './config.js';

let appPromise = null;
let authPromise = null;
let dbPromise = null;
let storagePromise = null;

function requireConfig() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured; copy .env.example to .env.local');
  }
}

/** @returns {Promise<import('firebase/app').FirebaseApp>} */
export function getFirebaseApp() {
  requireConfig();
  if (!appPromise) {
    appPromise = import('firebase/app').then(({ initializeApp, getApps, getApp }) =>
      getApps().length ? getApp() : initializeApp(firebaseConfig)
    );
  }
  return appPromise;
}

/** @returns {Promise<import('firebase/auth').Auth>} */
export function getFirebaseAuth() {
  if (!authPromise) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      const { getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator } =
        await import('firebase/auth');
      const auth = getAuth(app);
      // Keep the session on the device: a field worker who opens the app in a
      // basement with no signal must stay signed in.
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      return auth;
    })();
  }
  return authPromise;
}

/** @returns {Promise<import('firebase/firestore').Firestore>} */
export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const app = await getFirebaseApp();
      const {
        initializeFirestore,
        persistentLocalCache,
        persistentMultipleTabManager,
        connectFirestoreEmulator,
      } = await import('firebase/firestore');
      // Persistent cache lets sketches be read and written with no connection;
      // writes queue and flush when the device comes back online.
      const db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
      if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
      return db;
    })();
  }
  return dbPromise;
}

/** @returns {Promise<import('firebase/storage').FirebaseStorage>} */
export function getStorageRef() {
  if (!storagePromise) {
    storagePromise = (async () => {
      const app = await getFirebaseApp();
      const { getStorage, connectStorageEmulator } = await import('firebase/storage');
      const storage = getStorage(app);
      if (useEmulators) connectStorageEmulator(storage, '127.0.0.1', 9199);
      return storage;
    })();
  }
  return storagePromise;
}

/**
 * A throwaway second Firebase app.
 *
 * Creating a user with the client SDK signs that new user in, which would kick
 * the admin out of their own session. Doing it on a separate app instance keeps
 * the admin's session untouched. The caller must always call `dispose()`.
 * @returns {Promise<{auth: import('firebase/auth').Auth, dispose: () => Promise<void>}>}
 */
export async function createSecondaryAuth() {
  requireConfig();
  const { initializeApp, deleteApp } = await import('firebase/app');
  const { getAuth, connectAuthEmulator, signOut } = await import('firebase/auth');
  const name = `secondary-${Date.now()}`;
  const app = initializeApp(firebaseConfig, name);
  const auth = getAuth(app);
  if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return {
    auth,
    dispose: async () => {
      await signOut(auth).catch(() => {});
      await deleteApp(app).catch(() => {});
    },
  };
}

/*
 * Lightweight IndexedDB wrapper for the Graph Sketcher PWA.
 *
 * This module provides a simple promise‑based API around the browser's
 * IndexedDB API. It manages a small set of object stores used by the app:
 *   - `sketches`: holds persistent sketch records (id, metadata, nodes, edges).
 *   - `currentSketch`: holds a single key/value pair representing the
 *     currently edited sketch. This replaces the previous use of
 *     localStorage['graphSketch'] for autosave.
 *   - `syncQueue`: an optional queue of operations that need to be synced
 *     to a backend when online. Currently unused, but created for future
 *     extensibility.
 *
 * The database schema is versioned. When bumping DB_VERSION you must add
 * appropriate upgrade logic inside `openDb()`'s `onupgradeneeded` handler.
 */

const DB_NAME = 'graphSketchDB';

/** Object stores this app needs, with the options used to create them. */
const REQUIRED_STORES = [
  ['sketches', { keyPath: 'id' }],
  ['currentSketch', { keyPath: 'key' }],
  ['syncQueue', { autoIncrement: true }],
];

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function createMissingStores(db) {
  REQUIRED_STORES.forEach(([name, options]) => {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
  });
}

function trackVersionChange(db) {
  // Another tab upgrading the schema would otherwise block its open request.
  db.onversionchange = () => {
    try { db.close(); } catch (_) {}
    dbPromise = null;
  };
}

/**
 * Open `graphSketchDB` at whatever version already exists on this origin.
 *
 * IndexedDB is scoped per origin, not per path, so every app published under
 * the same github.io account shares this database. A sibling app carries a
 * higher schema version, and opening with a hardcoded lower number threw
 * "The requested version (1) is less than the existing version (3)" on every
 * save. Adopting the existing version instead — and stepping it up only when a
 * store we need is genuinely absent — lets both apps share the origin.
 *
 * @returns {Promise<IDBDatabase>}
 */
function openDbInternal() {
  return new Promise((resolve, reject) => {
    // No version argument: adopt the current one, or create the DB at 1.
    const request = indexedDB.open(DB_NAME);
    request.onupgradeneeded = (event) => {
      createMissingStores(/** @type {IDBDatabase} */ (event.target.result));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const missing = REQUIRED_STORES.some(([name]) => !db.objectStoreNames.contains(name));
      if (!missing) {
        trackVersionChange(db);
        resolve(db);
        return;
      }
      // A store we need is absent, so step the version up by one to add it
      // without disturbing stores the sibling app owns.
      const nextVersion = db.version + 1;
      db.close();
      const upgrade = indexedDB.open(DB_NAME, nextVersion);
      upgrade.onupgradeneeded = (event) => {
        createMissingStores(/** @type {IDBDatabase} */ (event.target.result));
      };
      upgrade.onerror = () => reject(upgrade.error);
      upgrade.onsuccess = () => {
        trackVersionChange(upgrade.result);
        resolve(upgrade.result);
      };
    };
  });
}

/**
 * Open the IndexedDB database and upgrade schema if necessary.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  if (!dbPromise) {
    dbPromise = openDbInternal().catch((err) => {
      // Let the next call retry rather than caching a permanent failure.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Save the currently edited sketch into the dedicated currentSketch store.
 *
 * @param {object|null} sketch A plain object representing the sketch to save. If null, the entry is removed.
 * @returns {Promise<void>}
 */
export async function saveCurrentSketch(sketch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('currentSketch', 'readwrite');
    const store = tx.objectStore('currentSketch');
    if (sketch == null) {
      store.delete('current');
    } else {
      store.put({ key: 'current', value: sketch });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the currently edited sketch from the database.
 *
 * @returns {Promise<object|null>} The stored sketch or null if not present.
 */
export async function loadCurrentSketch() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('currentSketch', 'readonly');
    const store = tx.objectStore('currentSketch');
    const req = store.get('current');
    req.onsuccess = () => {
      resolve(req.result ? req.result.value : null);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist or update a sketch in the library. If the sketch id already exists,
 * it will be replaced; otherwise a new record is added. The sketch object
 * should include an `id` property to serve as the primary key.
 *
 * @param {object} sketch
 * @returns {Promise<void>}
 */
export async function saveSketch(sketch) {
  if (!sketch || !sketch.id) throw new Error('saveSketch requires a sketch with an id');
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readwrite');
    tx.objectStore('sketches').put(sketch);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve all sketches from the library.
 *
 * @returns {Promise<any[]>}
 */
export async function getAllSketches() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readonly');
    const store = tx.objectStore('sketches');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve a single sketch by id.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getSketch(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readonly');
    const store = tx.objectStore('sketches');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a sketch from the library.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteSketch(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sketches', 'readwrite');
    tx.objectStore('sketches').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Queue a sync operation for later processing. Accepts any plain object.
 *
 * Currently unused but implemented for future background sync support. The
 * service worker can consume this queue and attempt to POST the operations
 * when connectivity returns.
 *
 * @param {any} op
 * @returns {Promise<void>}
 */
export async function enqueueSyncOperation(op) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').add(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve and clear all queued sync operations. The array is returned in
 * insertion order. Callers should attempt to process these operations and
 * re‑enqueue on failure.
 *
 * @returns {Promise<any[]>}
 */
export async function drainSyncQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.getAll();
    req.onsuccess = () => {
      store.clear();
      resolve(req.result || []);
    };
    req.onerror = () => reject(req.error);
  });
}
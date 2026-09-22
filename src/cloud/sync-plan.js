// Deciding how this device's sketch library and the cloud's copy come together.
//
// Pure: given both sides, it returns what to do, and does nothing itself — so
// it can be tested against every awkward case without a phone or a network.
//
// The one rule everything here serves: unsent work is never lost. When two
// devices changed the same sketch separately, both versions are kept.
//
// How versions are told apart. Every change to a sketch's contents gets a new
// `rev`, and a sketch carries the list of revs it grew from (`revs`). That
// history, not the clock, decides who is ahead: two phones' clocks can disagree
// by minutes, and a clock-based "newest wins" would silently throw away the
// work of whichever phone was behind. Each local record also remembers
// `syncedRev`, the rev last known to be in the cloud; a record whose rev is not
// that one has changes the cloud has not seen.
//
// Sketches saved before any of this existed have no rev. They get a stand-in
// derived from their updatedAt, and a sketch whose contents match exactly on
// both sides is simply in sync, whatever its revs say.

import { sketchContentKey } from '../utils/stable-json.js';

const HISTORY = 50;

function legacyRev(r) {
  return `u:${String((r && (r.updatedAt || r.createdAt)) || '')}`;
}

function isLegacyRev(rev) {
  return String(rev).startsWith('u:');
}

/** When a stand-in rev was saved, or NaN if it does not say. */
function legacyTime(rev) {
  return Date.parse(String(rev).slice(2));
}

/** When a record was last saved, or NaN. */
function savedAt(r) {
  return Date.parse(String(r.updatedAt || r.createdAt || ''));
}

/** A short, stable fingerprint of a rev, to name the copy it becomes. */
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function revOf(r) {
  return (r && r.rev) || legacyRev(r);
}

export function revsOf(r) {
  const own = revOf(r);
  const list = Array.isArray(r && r.revs) && r.revs.length ? r.revs : [own];
  return list.includes(own) ? list : [...list, own].slice(-HISTORY);
}

/** Changes the cloud has not seen. A record never synced counts as changed. */
export function isDirty(local) {
  return !local.syncedRev || local.syncedRev !== revOf(local);
}

/** Whether `record` is `rev`, or grew from it. */
function includesRev(record, rev) {
  return revsOf(record).includes(rev);
}

/** A cloud document as a local library record, marked in sync. */
export function fromCloud(doc, me, currentSchema) {
  const rev = revOf(doc);
  return {
    id: String(doc.id),
    name: doc.name || null,
    nodes: Array.isArray(doc.nodes) ? doc.nodes : [],
    edges: Array.isArray(doc.edges) ? doc.edges : [],
    nextNodeId: Number(doc.nextNodeId) || 1,
    creationDate: doc.creationDate || doc.createdAt || null,
    createdAt: doc.createdAt || doc.creationDate || null,
    updatedAt: doc.updatedAt || null,
    // Every sketch in the cloud was written by this app at its current schema;
    // a missing value must not send it back through old migrations.
    schemaVersion: doc.schemaVersion || currentSchema,
    rev,
    revs: revsOf(doc),
    syncedRev: rev,
    ownerUid: me,
  };
}

/**
 * @param {object} args
 * @param {object[]} args.local  this device's library
 * @param {object[]} args.cloud  this account's sketch documents
 * @param {string}   args.me     the signed-in uid
 * @param {string|null} args.openId  the sketch on the canvas right now
 * @param {() => string} args.makeRev
 * @param {(record: object) => string} args.copyName
 * @param {number} args.currentSchema
 * @returns {{put: object[], patch: {id: string, fields: object}[], remove: string[],
 *            push: string[], reloadOpen: boolean,
 *            notices: {type: string, id: string, copyId?: string, name?: string}[]}}
 */
export function planSync({ local, cloud, me, openId, makeRev, copyName, currentSchema }) {
  const plan = { put: [], patch: [], remove: [], push: [], reloadOpen: false, notices: [] };
  const localById = new Map(local.filter((r) => r && r.id).map((r) => [String(r.id), r]));
  const cloudById = new Map(cloud.filter((d) => d && d.id).map((d) => [String(d.id), d]));
  const ids = new Set([...localById.keys(), ...cloudById.keys()]);

  for (const id of ids) {
    const L = localById.get(id);
    const C = cloudById.get(id);

    // A sketch another account made on this device is theirs, not ours to
    // upload or change. (A shared browser is exactly where this happens.)
    if (L && L.ownerUid && L.ownerUid !== me) continue;

    if (C && !L) {
      if (!C.deleted) plan.put.push(fromCloud(C, me, currentSchema));
      continue;
    }

    if (L && !C) {
      // Never in the cloud, or changed since: send it. Synced and now gone
      // means the office deleted its copy — the worker's own stays, untouched.
      if (isDirty(L)) plan.push.push(id);
      continue;
    }

    const lr = revOf(L);
    const cr = revOf(C);

    if (C.deleted) {
      // Deleted on another device. Unsent work here outlives that delete; a
      // sketch open on screen is never pulled out from under the surveyor.
      // "Unsent" is judged against the deleted document's contents too, which
      // a delete leaves in place: a sketch from before revs existed has no
      // sync mark, and would otherwise always look unsent and never go away.
      const unsent = isDirty(L) && sketchContentKey(L) !== sketchContentKey(C);
      if (unsent) plan.push.push(id);
      else if (id !== openId) plan.remove.push(id);
      continue;
    }

    // Same version, or identical contents under different revs (sketches from
    // before revs existed, mostly): in sync.
    if (lr === cr || sketchContentKey(L) === sketchContentKey(C)) {
      if (L.syncedRev !== cr || L.rev !== cr || L.ownerUid !== me) {
        plan.patch.push({ id, fields: { rev: cr, revs: revsOf(C), syncedRev: cr, ownerUid: me } });
      }
      continue;
    }

    // The cloud grew from what this device has: take it. Nothing of ours is
    // lost — our current version is in its history.
    if (includesRev(C, lr)) {
      plan.put.push(fromCloud(C, me, currentSchema));
      if (id === openId) plan.reloadOpen = true;
      continue;
    }

    // This device grew from what the cloud has: send ours, unless it is
    // already on its way.
    if (includesRev(L, cr)) {
      if (isDirty(L)) plan.push.push(id);
      continue;
    }

    // The cloud copy is from before versions existed, and this device's copy
    // has never synced: nothing records what grew from what, only when each
    // was saved. The app did not download sketches then, so that cloud copy
    // was sent by a device that had the sketch — almost always this one,
    // before its latest edits, which must not end up as the "other" version.
    // So the later save wins the sketch. Were the cloud copy another device's
    // work, that device still holds it and keeps it as its own version when it
    // syncs (the rule below), so nothing is lost either way.
    if (!L.syncedRev && isLegacyRev(cr) && savedAt(L) > legacyTime(cr)) {
      plan.push.push(id);
      continue;
    }

    // Diverged: both changed separately. Keep both.
    if (id === openId) {
      // Not while it is on screen: the surveyor's canvas stays theirs, and the
      // two versions are reconciled once they move to another sketch.
      plan.notices.push({ type: 'conflict-deferred', id });
      continue;
    }
    // The cloud's version keeps the sketch — every device agrees on that, so
    // they never fight over it — and this device's becomes a copy of its own.
    // The copy id comes from our rev, so planning twice makes the same copy.
    const copyId = `${id}~${fingerprint(lr)}`;
    const copyRev = makeRev();
    plan.put.push({
      ...L,
      id: copyId,
      name: copyName(L),
      rev: copyRev,
      revs: [copyRev],
      syncedRev: undefined,
      ownerUid: me,
    });
    plan.push.push(copyId);
    plan.put.push(fromCloud(C, me, currentSchema));
    plan.notices.push({ type: 'conflict', id, copyId, name: copyName(L) });
  }
  return plan;
}

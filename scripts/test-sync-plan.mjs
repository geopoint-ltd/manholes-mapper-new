// Two phones, one cloud. Drives the real planner through the awkward cases and
// checks, after each: nothing anyone worked on is gone, and the phones agree.
//
// Run: npm run test:sync   (plain Node, no dependencies)
import * as P from '../src/cloud/sync-plan.js';
import { sketchContentKey } from '../src/utils/stable-json.js';

let seq = 0;
const makeRev = () => `r${++seq}`;
const copyName = (r) => `${r.name || r.id} (parallel)`;

function newWorld() {
  return { cloud: new Map() };
}
function device(world, name, me = 'u1') {
  return { name, me, world, lib: new Map(), openId: null, online: true, queue: [] };
}
// A cloud document, the way toCloudSketch writes it (Firestore sorts map keys).
function toCloud(rec) {
  const sortKeys = (o) => JSON.parse(JSON.stringify(o, (k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v));
  return sortKeys({ id: rec.id, name: rec.name || null, nodes: rec.nodes, edges: rec.edges, nextNodeId: rec.nextNodeId,
    creationDate: rec.creationDate, createdAt: rec.createdAt, updatedAt: rec.updatedAt, schemaVersion: 3,
    rev: P.revOf(rec), revs: P.revsOf(rec), deleted: false });
}
// Pushing: straight to the cloud when online; queued (Firestore's offline queue) when not.
function push(dev, id) {
  const rec = dev.lib.get(id);
  if (!rec) return;
  const doc = toCloud(rec);
  if (dev.online) dev.world.cloud.set(id, doc); else dev.queue.push(doc);
  dev.lib.set(id, { ...rec, rev: P.revOf(rec), revs: P.revsOf(rec), syncedRev: P.revOf(rec), ownerUid: dev.me });
}
function goOnline(dev) {
  dev.online = true;
  for (const doc of dev.queue) dev.world.cloud.set(doc.id, doc); // last write wins, as on the server
  dev.queue = [];
}
function sync(dev) {
  // Offline, the device sees only what its cache last saw — model that as the
  // cloud minus nothing new: good enough, since it can only push, queued.
  const plan = P.planSync({ local: [...dev.lib.values()], cloud: [...dev.world.cloud.values()], me: dev.me,
    openId: dev.openId, makeRev, copyName, currentSchema: 3 });
  for (const r of plan.put) dev.lib.set(r.id, r);
  for (const p of plan.patch) dev.lib.set(p.id, { ...dev.lib.get(p.id), ...p.fields });
  for (const id of plan.remove) dev.lib.delete(id);
  for (const id of [...new Set(plan.push)]) push(dev, id);
  return plan;
}
// An edit, the way saveToLibrary does it: new rev only when contents change.
function edit(dev, id, mutate) {
  const old = dev.lib.get(id);
  const next = JSON.parse(JSON.stringify(old || { id, nodes: [], edges: [], nextNodeId: 1, name: null,
    creationDate: '2026-09-22', createdAt: '2026-09-22T08:00:00Z' }));
  mutate(next);
  if (old && sketchContentKey(old) === sketchContentKey(next)) return;
  const rev = makeRev();
  next.rev = rev;
  next.revs = [...(old ? P.revsOf(old) : []), rev].slice(-50);
  next.updatedAt = new Date(Date.now() + seq * 1000).toISOString();
  next.syncedRev = old ? old.syncedRev : undefined;
  next.ownerUid = old ? old.ownerUid : undefined;
  dev.lib.set(id, next);
}
function localDelete(dev, id) {
  const rec = dev.lib.get(id);
  dev.lib.delete(id);
  if (rec && rec.syncedRev) {
    const doc = dev.world.cloud.get(id) || {};
    const rev = makeRev();
    dev.world.cloud.set(id, { ...doc, id, deleted: true, rev, revs: [...P.revsOf(rec), rev] });
  }
}
const contents = (dev) => new Set([...dev.lib.values()].map((r) => sketchContentKey(r)));
const cloudContents = (w) => new Set([...w.cloud.values()].filter((d) => !d.deleted).map((d) => sketchContentKey(d)));
const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const results = [];
function check(name, fn) {
  try { fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); }
}
function assert(c, m) { if (!c) throw new Error(m); }
function settle(...devs) { for (let i = 0; i < 4; i++) devs.forEach(sync); }
function mustHold(dev, content, what) { assert(contents(dev).has(content), `${dev.name} lost ${what}`); }

check('1. A makes a sketch; B gets it', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1', x: 0, y: 0 }]; });
  settle(A, B);
  assert(B.lib.has('s1'), 'B does not have s1');
  assert(eq(contents(A), contents(B)), 'A and B differ');
});

check('2. A edits; B catches up, no copies', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  edit(A, 's1', (r) => { r.nodes.push({ id: '2' }); }); edit(A, 's1', (r) => { r.nodes.push({ id: '3' }); });
  settle(A, B);
  assert(B.lib.get('s1').nodes.length === 3, 'B did not catch up');
  assert(B.lib.size === 1 && A.lib.size === 1, 'unexpected copy');
});

check('3. both edit the same sketch at once: both versions kept, phones agree', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  edit(A, 's1', (r) => { r.name = 'A-version'; });
  edit(B, 's1', (r) => { r.name = 'B-version'; });
  const aWork = sketchContentKey(A.lib.get('s1')), bWork = sketchContentKey(B.lib.get('s1'));
  sync(A); sync(B); settle(A, B);
  for (const d of [A, B]) { mustHold(d, aWork, "A's work"); }
  // B's work survives as a copy (its name changed to mark it), so compare drawings
  const drawings = (d) => [...d.lib.values()].map((r) => r.name);
  assert(drawings(A).some((n) => n && n.startsWith('B-version')), "B's version missing on A");
  assert(drawings(B).some((n) => n && n.startsWith('B-version')), "B's version missing on B");
  assert(eq(contents(A), contents(B)), 'A and B disagree');
  assert(A.lib.size === 2, 'expected main + one copy, got ' + A.lib.size);
});

check('4. B edits offline, its queued write overwrites A\'s newer one: A\'s work kept as a copy', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  B.online = false;
  edit(A, 's1', (r) => { r.name = 'A-online'; }); sync(A);
  const aWork = sketchContentKey(A.lib.get('s1'));
  edit(B, 's1', (r) => { r.name = 'B-offline'; }); sync(B); // queued, B sees stale cloud
  goOnline(B); // B's queued write lands last and wins on the server
  settle(A, B);
  const names = (d) => [...d.lib.values()].map((r) => r.name).sort().join('|');
  assert(names(A).includes('A-online') && names(A).includes('B-offline'), 'A lost a version: ' + names(A));
  assert(names(B).includes('A-online') && names(B).includes('B-offline'), 'B lost a version: ' + names(B));
  assert(eq(contents(A), contents(B)), 'A and B disagree');
});

check('5. deleted on A; B (unchanged) drops it too', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  localDelete(A, 's1'); settle(A, B);
  assert(!B.lib.has('s1') && !A.lib.has('s1'), 'sketch still present');
});

check('6. deleted on A while B has unsent changes: B\'s work survives and comes back to A', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  edit(B, 's1', (r) => { r.nodes.push({ id: '2' }); });
  const bWork = sketchContentKey(B.lib.get('s1'));
  localDelete(A, 's1');
  settle(B, A);
  mustHold(B, bWork, "B's unsent work"); mustHold(A, bWork, "B's work on A");
});

check('7. the sketch open on screen is never swapped out under a conflict', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  B.openId = 's1';
  edit(A, 's1', (r) => { r.name = 'A'; }); sync(A);
  edit(B, 's1', (r) => { r.name = 'B-open'; });
  const plan = sync(B);
  assert(B.lib.get('s1').name === 'B-open', 'open sketch was replaced');
  assert(plan.notices.some((n) => n.type === 'conflict-deferred'), 'no deferral recorded');
  B.openId = null; settle(A, B);
  const names = [...B.lib.values()].map((r) => r.name).join('|');
  assert(names.includes('A') && names.includes('B-open'), 'after closing, a version is missing: ' + names);
});

check('8. the sketch open on screen DOES update when the other phone simply moved ahead', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  B.openId = 's1';
  edit(A, 's1', (r) => { r.nodes.push({ id: '2' }); }); sync(A);
  const plan = sync(B);
  assert(plan.reloadOpen, 'open sketch not reloaded');
  assert(B.lib.get('s1').nodes.length === 2, 'not updated');
});

check('9. sketches from before this feature (no revs, key order differs) are recognised as in sync', () => {
  const w = newWorld(); const A = device(w, 'A');
  const legacy = { id: 's1', name: 'old', nodes: [{ x: 1, id: '1', y: 2 }], edges: [], nextNodeId: 2, creationDate: 'd', createdAt: 'c', updatedAt: '2026-09-01T00:00:00Z' };
  A.lib.set('s1', { ...legacy, updatedAt: '2026-09-20T00:00:00Z' }); // bumped on a launch, same drawing
  w.cloud.set('s1', { ...legacy, nodes: [{ id: '1', x: 1, y: 2 }] });  // Firestore's sorted keys
  const plan = sync(A);
  assert(!plan.put.some((r) => r.id.includes('~')), 'made a spurious copy');
  assert(A.lib.get('s1').syncedRev, 'not marked in sync');
  assert(A.lib.size === 1, 'unexpected extra sketch');
});

check('10. another account\'s sketch on a shared device is never uploaded', () => {
  const w = newWorld(); const A = device(w, 'A', 'u1');
  A.lib.set('x1', { id: 'x1', ownerUid: 'u2', nodes: [], edges: [], rev: 'q', revs: ['q'] });
  sync(A);
  assert(!w.cloud.has('x1'), 'uploaded someone else\'s sketch');
});

check('11. the office deleted its copy: the worker\'s sketch stays, and returns to the cloud only if edited', () => {
  const w = newWorld(); const A = device(w, 'A');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A);
  w.cloud.delete('s1'); settle(A);
  assert(A.lib.has('s1'), 'worker lost the sketch');
  assert(!w.cloud.has('s1'), 're-uploaded unchanged');
  edit(A, 's1', (r) => { r.nodes.push({ id: '2' }); }); settle(A);
  assert(w.cloud.has('s1'), 'edited sketch not uploaded');
});

check('12. settled state is stable: another sync pass does nothing', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); edit(B, 's2', (r) => { r.nodes = [{ id: '9' }]; });
  settle(A, B);
  const pa = sync(A), pb = sync(B);
  const busy = (p) => p.put.length + p.patch.length + p.remove.length + p.push.length;
  assert(busy(pa) === 0 && busy(pb) === 0, `still busy: A=${busy(pa)} B=${busy(pb)}`);
});

check('13. planning a conflict twice makes one copy, not two', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B);
  edit(A, 's1', (r) => { r.name = 'A'; }); sync(A);
  edit(B, 's1', (r) => { r.name = 'B'; });
  const local = [...B.lib.values()], cloud = [...w.cloud.values()];
  const args = { local, cloud, me: 'u1', openId: null, makeRev, copyName, currentSchema: 3 };
  const c1 = P.planSync(args).put.find((r) => r.id.includes('~')).id;
  const c2 = P.planSync(args).put.find((r) => r.id.includes('~')).id;
  assert(c1 === c2, `copy ids differ: ${c1} vs ${c2}`);
});

check('14. three phones, three-way conflict: every version survives, all agree', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B'), C = device(w, 'C');
  edit(A, 's1', (r) => { r.nodes = [{ id: '1' }]; }); settle(A, B, C);
  edit(A, 's1', (r) => { r.name = 'vA'; }); edit(B, 's1', (r) => { r.name = 'vB'; }); edit(C, 's1', (r) => { r.name = 'vC'; });
  sync(A); sync(B); sync(C); settle(A, B, C);
  for (const d of [A, B, C]) {
    const names = [...d.lib.values()].map((r) => r.name).join('|');
    for (const v of ['vA', 'vB', 'vC']) assert(names.includes(v), `${d.name} lacks ${v}: ${names}`);
  }
  assert(eq(contents(A), contents(B)) && eq(contents(B), contents(C)), 'phones disagree');
});

// Sketches from before this feature: sent once by the old app, then edited on
// the phone before it updated. The phone's later work must win the sketch —
// not end up as the "parallel version" next to an older drawing.
const legacyBase = { id: 's1', name: 'old', nodes: [{ id: '1' }], edges: [], nextNodeId: 2, creationDate: 'd', createdAt: '2026-09-01T00:00:00Z' };

check('15. old sketch, edited after its last send: the phone\'s newer drawing wins, no copy', () => {
  const w = newWorld(); const A = device(w, 'A');
  w.cloud.set('s1', { ...legacyBase, updatedAt: '2026-09-10T00:00:00Z' });
  A.lib.set('s1', { ...legacyBase, nodes: [{ id: '1' }, { id: '2' }], updatedAt: '2026-09-12T00:00:00Z' });
  const phoneWork = sketchContentKey(A.lib.get('s1'));
  settle(A);
  assert(A.lib.size === 1, 'made a copy: ' + [...A.lib.keys()].join(','));
  assert(sketchContentKey(A.lib.get('s1')) === phoneWork, 'main sketch is not the phone\'s drawing');
  assert(sketchContentKey(w.cloud.get('s1')) === phoneWork, 'cloud not updated');
});

check('16. same, with one more edit after the update: still no copy', () => {
  const w = newWorld(); const A = device(w, 'A');
  w.cloud.set('s1', { ...legacyBase, updatedAt: '2026-09-10T00:00:00Z' });
  A.lib.set('s1', { ...legacyBase, nodes: [{ id: '1' }, { id: '2' }], updatedAt: '2026-09-12T00:00:00Z' });
  edit(A, 's1', (r) => { r.nodes.push({ id: '3' }); });
  const phoneWork = sketchContentKey(A.lib.get('s1'));
  settle(A);
  assert(A.lib.size === 1, 'made a copy');
  assert(sketchContentKey(w.cloud.get('s1')) === phoneWork, 'cloud not updated');
});

check('17. old sketch on two phones, different drawings: both survive whichever is newer', () => {
  const w = newWorld(); const A = device(w, 'A'), B = device(w, 'B');
  A.lib.set('s1', { ...legacyBase, nodes: [{ id: 'a' }], updatedAt: '2026-09-11T00:00:00Z' });
  B.lib.set('s1', { ...legacyBase, nodes: [{ id: 'b' }], updatedAt: '2026-09-12T00:00:00Z' });
  const drawings = (d) => [...d.lib.values()].map((r) => JSON.stringify(r.nodes));
  settle(A); settle(B); settle(A, B);
  for (const d of [A, B]) {
    assert(drawings(d).includes('[{"id":"a"}]') && drawings(d).includes('[{"id":"b"}]'), `${d.name} lost a drawing: ${drawings(d)}`);
  }
  assert(eq(contents(A), contents(B)), 'phones disagree');
});

check('18. a sketch whose save time is unknown falls back to keeping both, not overwriting', () => {
  const w = newWorld(); const A = device(w, 'A');
  w.cloud.set('s1', { ...legacyBase, updatedAt: '2026-09-10T00:00:00Z' });
  A.lib.set('s1', { ...legacyBase, nodes: [{ id: 'x' }], createdAt: null, updatedAt: null });
  settle(A);
  const drawings = [...A.lib.values()].map((r) => JSON.stringify(r.nodes));
  assert(drawings.includes('[{"id":"x"}]') && drawings.includes('[{"id":"1"}]'), 'lost a drawing: ' + drawings);
});

for (const [s, n] of results) console.log(s, n);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

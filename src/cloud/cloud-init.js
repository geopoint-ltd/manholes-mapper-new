// Wires the cloud layer into the existing app.
//
// Two rules shape everything here:
//   1. With no Firebase config, this module does nothing at all. The app stays
//      exactly the offline tool it is today — no login wall, no new buttons.
//   2. The local sketch library remains the source of truth while working. A
//      failed sync must never cost a surveyor their data. Sync between devices
//      (below) only ever adds versions; it takes a sketch off this device only
//      when its owner deleted it on another one and nothing here is unsent.

import './cloud-ui.css';
import { isFirebaseConfigured, isStorageConfigured, SKETCH_STATUS } from '../firebase/config.js';
import { escapeHtml } from '../dom/dom-utils.js';
import { startAuthWatch, onProfileChanged, getProfile, isAdmin, signOut } from '../firebase/auth.js';
import { saveSketch, submitSketch, watchMySketches, markSketchDeleted } from '../firebase/sketches.js';
import { planSync, revOf, revsOf, isDirty } from './sync-plan.js';
import { SCHEMA_VERSION } from '../utils/schema-migration.js';
import { uploadAttachment, listAttachments, formatSize } from '../firebase/attachments.js';
import { showLogin, hideLogin } from './login-screen.js';
import { watchTags, createTag, addSketchTag, removeSketchTag } from '../firebase/tags.js';
import { tagRow, openTagPicker, closeTagPicker } from './tag-picker.js';

/** sketchId -> cloud status, so the list can show what has been sent. */
const cloudStatus = new Map();
/** sketchId -> tag ids on the cloud copy. */
const sketchTags = new Map();
/** The shared tag catalogue, kept live while signed in. */
let tagCatalog = [];
let tagsUnsub = null;
let chipEl = null;
let listObserver = null;

/**
 * A note that this device has a signed-in session, so a reload can skip the
 * login screen from the first frame instead of showing it while the Firebase
 * library downloads and the session is restored.
 *
 * It holds only the uid — no token, no role — and it grants nothing: every read
 * and write is still checked by the security rules. It only decides what to
 * show while the real answer is on its way. Sign-out clears it, so a
 * signed-out device goes straight to the login screen.
 */
const SESSION_HINT_KEY = 'cloud.session';

function hasSessionHint() {
  try {
    return Boolean(localStorage.getItem(SESSION_HINT_KEY));
  } catch (_) {
    return false;
  }
}

function rememberSession(profile) {
  try {
    if (profile) localStorage.setItem(SESSION_HINT_KEY, String(profile.uid));
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch (_) {}
}

function t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

function getLibrary() {
  try {
    const raw = localStorage.getItem('graphSketch.library');
    const lib = raw ? JSON.parse(raw) : [];
    return Array.isArray(lib) ? lib : [];
  } catch (_) {
    return [];
  }
}

function findRecord(sketchId) {
  return getLibrary().find((r) => String(r.id) === String(sketchId)) || null;
}

/* ---------------- the sketch being edited ---------------- */

// main.js keeps currentSketchId module-private, so the id has to come from the
// two things it does publish. They are reliable at different moments:
//
//   graphSketch.sketchId   written by saveToStorage() BEFORE saveToLibrary()
//                          assigns an id, so it lags by one save on a brand new
//                          sketch, but it always names the sketch on screen.
//                          Right for rendering a badge.
//   the sketch:saved event carries the definitive id the moment a save
//                          completes, but goes stale the instant the surveyor
//                          starts a new sketch. Right immediately after a save.
let lastSavedId = null;

/** The sketch currently on the canvas, or null if it has never been saved. */
function getCurrentSketchId() {
  try {
    const raw = localStorage.getItem('graphSketch');
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && parsed.sketchId) || null;
  } catch (_) {
    return null;
  }
}

function currentIsSent() {
  const id = getCurrentSketchId();
  return Boolean(id) && cloudStatus.get(String(id)) === SKETCH_STATUS.SUBMITTED;
}

/**
 * Send the sketch the surveyor is looking at.
 *
 * Saving first is not a convenience: it is what makes the id trustworthy. The
 * app's own save button runs the one code path that assigns an id to a new
 * sketch and announces it, so after the click lastSavedId names exactly what is
 * on screen  no guessing, and the office receives the current drawing rather
 * than whatever was last written.
 */
async function sendCurrentSketch(btn) {
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.click(); // synchronous: sketch:saved fires before this returns
  const id = lastSavedId || getCurrentSketchId();
  const record = id ? findRecord(id) : null;
  if (!record) {
    toast(t('cloud.nothingToSend'));
    return;
  }
  if (btn) btn.disabled = true;
  try {
    await submitSketch(record);
    cloudStatus.set(String(id), SKETCH_STATUS.SUBMITTED);
    toast(t('cloud.sketchSent'));
    renderSendState(true);
    decorateList();
  } catch (err) {
    toast((err && err.message) || String(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}


/* ---------------- the sketch list as a screen ---------------- */

// Which sketches the surveyor has ticked for sending. Kept by id rather than
// by row, because renderHome() rebuilds every row from scratch and a selection
// that vanished on each redraw would be unusable.
const selected = new Set();

function selectableIds() {
  return getLibrary().map((r) => String(r.id));
}

/** Send every ticked sketch, and report how many actually made it. */
async function sendSelected(btn) {
  const ids = Array.from(selected);
  if (ids.length === 0) {
    toast(t('cloud.noneSelected'));
    return;
  }
  if (btn) btn.disabled = true;
  let ok = 0;
  const failures = [];
  for (const id of ids) {
    const record = findRecord(id);
    if (!record) continue;
    try {
      await submitSketch(record);
      cloudStatus.set(String(id), SKETCH_STATUS.SUBMITTED);
      ok += 1;
    } catch (err) {
      // One bad sketch must not silently swallow the rest of the batch.
      failures.push((err && err.message) || String(err));
    }
  }
  if (btn) btn.disabled = false;
  selected.clear();
  if (ok > 0) {
    toast(String(t('cloud.sentCount')).replace('{n}', String(ok)));
  }
  if (failures.length) toast(failures[0]);
  decorateList();
  renderHomeCloud(getProfile());
  renderSendState(true);
}

/**
 * Fill the two slots the home screen leaves for the cloud: who is signed in
 * (with a way out) at the top, and the batch send at the bottom.
 *
 * They live in index.html rather than being injected wholesale so the layout
 * — scrolling list between a fixed head and a fixed action bar — belongs to
 * the app, and stays coherent when no one is signed in at all.
 */
function renderHomeCloud(profile) {
  const head = document.getElementById('homeCloudHeader');
  const actions = document.getElementById('homeCloudActions');
  if (!head || !actions) return;
  if (!profile) {
    head.innerHTML = '';
    actions.innerHTML = '';
    return;
  }

  // Who is signed in, as one compact line: initial, name and address, role,
  // and a sign-out that says what it does rather than a bare icon.
  const role = isAdmin() ? 'admin' : 'member';
  const name = String(profile.displayName || profile.email || '').trim();
  const initial = (name[0] || '?').toUpperCase();
  const showEmail = profile.email && profile.email !== name;
  head.innerHTML = `
    <div class="cloud-home__who">
      <span class="cloud-home__avatar" aria-hidden="true">${escapeHtml(initial)}</span>
      <div class="cloud-home__id">
        <span class="cloud-home__name" dir="auto">${escapeHtml(name)}</span>
        ${showEmail ? `<span class="cloud-home__email" dir="ltr">${escapeHtml(profile.email)}</span>` : ''}
      </div>
      <span class="cloud-badge cloud-badge--${role}">${escapeHtml(t(`cloud.role_${role}`))}</span>
      <button class="btn cloud-home__signout" data-cloud-home="signout">
        <span class="material-icons" aria-hidden="true">logout</span>
        <span>${escapeHtml(t('cloud.signOut'))}</span>
      </button>
    </div>
  `;
  head.querySelector('[data-cloud-home="signout"]').addEventListener('click', async () => {
    if (!confirm(t('cloud.confirmSignOut'))) return;
    await signOut();
  });

  // Selection. A sketch deleted since it was ticked must not be counted.
  const all = selectableIds();
  for (const id of Array.from(selected)) if (!all.includes(id)) selected.delete(id);
  if (!all.length) {
    actions.innerHTML = '';
    return;
  }
  const count = selected.size;
  const every = count === all.length;
  // Progressive: with nothing ticked this is one light line. The send button
  // and its "goes straight to the office" note only appear once there is
  // something to send — a greyed-out full-width button read as broken.
  actions.innerHTML = `
    <div class="cloud-select">
      <label class="cloud-select__all">
        <input type="checkbox" data-cloud-home="toggleAll" ${every ? 'checked' : ''} />
        <span>${escapeHtml(t('cloud.selectAll'))}</span>
      </label>
      ${count ? `<span class="cloud-select__count">${escapeHtml(String(t('cloud.selectedCount')).replace('{n}', String(count)))}</span>` : ''}
      ${count ? `<button class="btn btn-primary cloud-select__send" data-cloud-home="send" title="${escapeHtml(t('cloud.sendSelected'))}">
          <span class="material-icons" aria-hidden="true">cloud_upload</span>
          <span>${escapeHtml(t('cloud.sendSelectedShort'))}</span>
        </button>` : ''}
    </div>
    ${count ? `<div class="cloud-menu__hint cloud-select__hint">${escapeHtml(t('cloud.sendHint'))}</div>` : ''}
  `;
  const allBox = actions.querySelector('[data-cloud-home="toggleAll"]');
  allBox.indeterminate = count > 0 && !every;
  allBox.addEventListener('change', () => {
    if (every) selected.clear();
    else all.forEach((id) => selected.add(id));
    decorateList();
    renderHomeCloud(getProfile());
  });
  const sendBtn = actions.querySelector('[data-cloud-home="send"]');
  if (sendBtn) {
    sendBtn.addEventListener('click', async (event) => {
      await sendSelected(event.currentTarget);
    });
  }
}

/* ---------------- phone menu ---------------- */

let menuEl = null;
let renderedSendState = null;

/**
 * Mirror the cloud actions into #mobileMenu.
 *
 * Below 600px styles.css hides #controls outright and the app drives everything
 * from #mobileMenu, so a control that lives only in the header is invisible to
 * precisely the people who need it. Surveyors work on phones; without this the
 * only way to send a sketch was a button buried in a sketch-library row.
 */
function renderMenuActions(profile) {
  const menu = document.getElementById('mobileMenu');
  if (!menu) return;
  if (!menuEl) {
    menuEl = document.createElement('div');
    menuEl.className = 'cloud-menu';
    menuEl.id = 'cloudMenu';
    // First, not last. The menu already runs to fifteen entries and scrolls on
    // a phone, so appending put the one action a field worker opens it for
    // below the fold, where it may as well not exist.
    menu.insertBefore(menuEl, menu.firstChild);
  }
  if (!profile) {
    menuEl.innerHTML = '';
    menuEl.style.display = 'none';
    return;
  }
  menuEl.style.display = '';
  const role = isAdmin() ? 'admin' : 'member';
  const sent = currentIsSent();
  menuEl.innerHTML = `
    <div class="cloud-menu__who">
      <span dir="auto">${escapeHtml(profile.displayName || profile.email)}</span>
      <span class="cloud-badge cloud-badge--${role}">${escapeHtml(t(`cloud.role_${role}`))}</span>
    </div>
    <button class="btn cloud-menu__send" data-cloud-menu="send">
      <span class="material-icons">cloud_upload</span>
      <span class="label">${escapeHtml(sent ? t('cloud.sendAgain') : t('cloud.sendSketch'))}</span>
      ${sent ? `<span class="cloud-badge cloud-badge--submitted">${escapeHtml(t('cloud.sent'))}</span>` : ''}
    </button>
    <div class="cloud-menu__hint">${escapeHtml(t('cloud.sendHint'))}</div>
    ${isAdmin() ? `<button class="btn" data-cloud-menu="admin"><span class="material-icons">admin_panel_settings</span><span class="label">${escapeHtml(t('cloud.adminTitle'))}</span>${unreadArrivals ? `<span class="cloud-badge cloud-badge--new">${unreadArrivals}</span>` : ''}</button>` : ''}
    <button class="btn" data-cloud-menu="signout">
      <span class="material-icons">logout</span>
      <span class="label">${escapeHtml(t('cloud.signOut'))}</span>
    </button>
  `;

  const close = () => {
    // The same gesture main.js uses for every other entry in this menu.
    if (menu) menu.style.display = 'none';
  };

  menuEl.querySelector('[data-cloud-menu="send"]').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    close();
    await sendCurrentSketch(btn);
  });
  const adminItem = menuEl.querySelector('[data-cloud-menu="admin"]');
  if (adminItem) {
    adminItem.addEventListener('click', async () => {
      close();
      markArrivalsSeen();
      const panel = await import('./admin-panel.js');
      panel.openAdminPanel();
    });
  }
  menuEl.querySelector('[data-cloud-menu="signout"]').addEventListener('click', async () => {
    close();
    if (!confirm(t('cloud.confirmSignOut'))) return;
    await signOut();
  });
}

/**
 * Re-render the send controls only when the answer actually changed. Every
 * keystroke triggers a debounced save, and rebuilding the menu each time would
 * thrash the DOM mid-survey.
 */
function renderSendState(force) {
  const state = currentIsSent() ? 'sent' : 'draft';
  if (!force && state === renderedSendState) return;
  renderedSendState = state;
  const profile = getProfile();
  renderMenuActions(profile);
  renderChip(profile);
}

/* ---------------- header chip ---------------- */

function renderChip(profile) {
  const controls = document.getElementById('controls');
  if (!controls) return;
  if (!chipEl) {
    chipEl = document.createElement('div');
    chipEl.className = 'toolbar-group cloud-chip';
    chipEl.id = 'cloudChip';
    controls.appendChild(chipEl);
  }
  if (!profile) {
    chipEl.innerHTML = '';
    chipEl.style.display = 'none';
    return;
  }
  chipEl.style.display = '';
  const role = isAdmin() ? 'admin' : 'member';
  chipEl.innerHTML = `
    <div class="cloud-chip__who">
      <span class="cloud-chip__name" dir="auto">${escapeHtml(profile.displayName || profile.email)}</span>
      <span class="cloud-chip__role">${escapeHtml(t(`cloud.role_${role}`))}</span>
    </div>
    <button class="btn btn-ghost" id="cloudSendBtn" title="${escapeHtml(currentIsSent() ? t('cloud.sendAgain') : t('cloud.sendSketch'))}">
      <span class="material-icons">cloud_upload</span>
    </button>
    ${isAdmin() ? `<button class="btn btn-ghost" id="cloudAdminBtn" title="${escapeHtml(t('cloud.adminTitle'))}"><span class="material-icons">admin_panel_settings</span>${unreadArrivals ? `<span class="cloud-badge cloud-badge--new">${unreadArrivals}</span>` : ''}</button>` : ''}
    <button class="btn btn-ghost" id="cloudSignOutBtn" title="${escapeHtml(t('cloud.signOut'))}">
      <span class="material-icons">logout</span>
    </button>
  `;
  chipEl.querySelector('#cloudSendBtn').addEventListener('click', async (event) => {
    await sendCurrentSketch(event.currentTarget);
  });
  const adminBtn = chipEl.querySelector('#cloudAdminBtn');
  if (adminBtn) {
    adminBtn.addEventListener('click', async () => {
      markArrivalsSeen();
      const panel = await import('./admin-panel.js');
      panel.openAdminPanel();
    });
  }
  chipEl.querySelector('#cloudSignOutBtn').addEventListener('click', async () => {
    // Local sketches deliberately survive sign-out — see auth.js signOut().
    if (!confirm(t('cloud.confirmSignOut'))) return;
    await signOut();
  });
}

/* ---------------- sketch list additions ---------------- */

function buildRowActions(sketchId) {
  const wrap = document.createElement('div');
  wrap.className = 'cloud-row__actions';
  wrap.dataset.cloudActions = sketchId;
  const status = cloudStatus.get(String(sketchId));
  const sent = status === SKETCH_STATUS.SUBMITTED;
  // No Storage bucket on the free plan: hide every attachment control rather
  // than offer a button whose only possible outcome is an error toast.
  const withFiles = isStorageConfigured();
  wrap.innerHTML = `
    <label class="cloud-pick">
      <input type="checkbox" data-cloud="pick" ${selected.has(String(sketchId)) ? 'checked' : ''}
             aria-label="${escapeHtml(t('cloud.selectForSending'))}" />
    </label>
    ${sent ? `<span class="cloud-badge cloud-badge--submitted">${escapeHtml(t('cloud.sent'))}</span>` : ''}
    <button class="btn cloud-row__send" data-cloud="send">
      <span class="material-icons" aria-hidden="true">cloud_upload</span>
      <span>${escapeHtml(sent ? t('cloud.sendAgain') : t('cloud.sendSketch'))}</span>
    </button>
    ${withFiles ? `<button class="btn btn-sm" data-cloud="attach">
      <span class="material-icons" style="font-size:16px">attach_file</span>
      <span>${escapeHtml(t('cloud.attach'))}</span>
    </button>
    <div class="cloud-attach-list" data-cloud="files"></div>
    <div class="cloud-progress" data-cloud="progress" style="display:none;"><div class="cloud-progress__bar"></div></div>` : ''}
  `;

  wrap.querySelector('[data-cloud="pick"]').addEventListener('change', (event) => {
    const key = String(sketchId);
    if (event.currentTarget.checked) selected.add(key);
    else selected.delete(key);
    // Only the action bar changes; rebuilding the rows here would drop the
    // checkbox the surveyor is still tapping.
    renderHomeCloud(getProfile());
  });

  wrap.querySelector('[data-cloud="send"]').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    const record = findRecord(sketchId);
    if (!record) return;
    btn.disabled = true;
    try {
      await submitSketch(record);
      cloudStatus.set(String(sketchId), SKETCH_STATUS.SUBMITTED);
      toast(t('cloud.sketchSent'));
      decorateList();
    } catch (err) {
      toast((err && err.message) || String(err));
    } finally {
      btn.disabled = false;
    }
  });

  const attachBtn = wrap.querySelector('[data-cloud="attach"]');
  if (attachBtn) attachBtn.addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*,application/pdf';
    picker.multiple = true;
    picker.addEventListener('change', async () => {
      const files = Array.from(picker.files || []);
      const progress = wrap.querySelector('[data-cloud="progress"]');
      const bar = progress.querySelector('.cloud-progress__bar');
      progress.style.display = '';
      try {
        for (const file of files) {
          await uploadAttachment(sketchId, file, (pct) => { bar.style.width = `${pct}%`; });
        }
        toast(t('cloud.filesUploaded'));
        await showFiles(sketchId, wrap);
      } catch (err) {
        toast((err && err.message) || String(err));
      } finally {
        progress.style.display = 'none';
        bar.style.width = '0';
      }
    });
    picker.click();
  });

  if (withFiles) showFiles(sketchId, wrap);
  return wrap;
}

async function showFiles(sketchId, wrap) {
  const holder = wrap.querySelector('[data-cloud="files"]');
  if (!holder) return;
  try {
    const files = await listAttachments(sketchId);
    holder.innerHTML = files
      .map(
        (f) => `<div class="cloud-attach">
            <span class="material-icons">${f.contentType && f.contentType.startsWith('image/') ? 'image' : 'description'}</span>
            <span class="cloud-attach__name" dir="auto">${escapeHtml(f.name)}</span>
            <span class="cloud-attach__size">${escapeHtml(formatSize(f.size))}</span>
          </div>`
      )
      .join('');
  } catch (_) {
    holder.innerHTML = '';
  }
}

/** Append cloud controls to each row of the sketch list, once per row. */
function decorateList() {
  if (!getProfile()) return;
  const list = document.getElementById('sketchList');
  if (!list) return;
  list.querySelectorAll('.sketch-card[data-sketch-id]').forEach((card) => {
    const sketchId = card.dataset.sketchId;
    const wrap = buildRowActions(sketchId);
    // buildRowActions builds one strip; the card has a place for each piece.
    // Moving a node keeps its listeners, so every handler stays exactly as
    // written and each control just sits where it reads naturally: the tick
    // box leading the card, "sent" beside the title, send beside Open.
    const place = (slot, node) => {
      const target = card.querySelector(`[data-slot="${slot}"]`);
      if (target) target.replaceChildren(...(node ? [node] : []));
    };
    const sent = cloudStatus.get(String(sketchId)) === SKETCH_STATUS.SUBMITTED;
    place('pick', wrap.querySelector('.cloud-pick'));
    place('status', wrap.querySelector('.cloud-badge--submitted'));
    const send = wrap.querySelector('[data-cloud="send"]');
    // Already in the office: sending again is a secondary action, not the call
    // to action it is for a sketch nobody has received yet.
    if (send) send.classList.toggle('is-sent', sent);
    place('send', send);
    // What is left — the attachment controls, when a bucket exists — keeps its
    // wrapper, which those handlers look their elements up in.
    place('extra', wrap.children.length ? wrap : null);

    const tagSlot = card.querySelector('[data-slot="tags"]');
    if (tagSlot) paintCardTags(tagSlot, String(sketchId));

    const box = card.querySelector('[data-cloud="pick"]');
    card.classList.toggle('is-selected', Boolean(box && box.checked));
    if (box) box.addEventListener('change', () => card.classList.toggle('is-selected', box.checked));
  });
}

/* ---------------- tags on the worker's cards ---------------- */

/**
 * A card's tags. A worker may add a tag but never take one off — that is the
 * office's call, and the rules refuse it — so only an admin sees the remove x.
 */
function paintCardTags(slot, sketchId) {
  const current = sketchTags.get(sketchId) || [];
  slot.innerHTML = tagRow(current, tagCatalog, { removable: isAdmin(), canAdd: true });
  const add = slot.querySelector('[data-tag-add]');
  if (add) {
    add.addEventListener('click', () => {
      openTagPicker({
        catalog: tagCatalog,
        exclude: current,
        onPick: (tag) => tagMySketch(sketchId, tag.id),
        onCreate: async (draft) => {
          const tag = await createTag(draft);
          // The live catalogue delivers it too; this only saves a blink.
          if (!tagCatalog.some((x) => x.id === tag.id)) tagCatalog = [...tagCatalog, tag];
          await tagMySketch(sketchId, tag.id);
        },
      });
    });
  }
  slot.querySelectorAll('[data-tag-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tagId = btn.getAttribute('data-tag-remove');
      try {
        await removeSketchTag(getProfile().uid, sketchId, tagId);
        sketchTags.set(sketchId, (sketchTags.get(sketchId) || []).filter((id) => id !== tagId));
        decorateList();
      } catch (err) {
        toast((err && err.message) || String(err));
      }
    });
  });
}

async function tagMySketch(sketchId, tagId) {
  const profile = getProfile();
  if (!profile) throw new Error('not-signed-in');
  await addSketchTag(profile.uid, sketchId, tagId);
  const current = sketchTags.get(sketchId) || [];
  if (!current.includes(tagId)) sketchTags.set(sketchId, [...current, tagId]);
  decorateList();
}

async function watchTagCatalog() {
  if (tagsUnsub) return;
  try {
    tagsUnsub = await watchTags((tags) => {
      tagCatalog = tags;
      decorateList();
    });
  } catch (err) {
    console.warn('tag catalogue unavailable', err && err.message);
  }
}

function stopTagCatalog() {
  if (tagsUnsub) {
    try {
      tagsUnsub();
    } catch (_) {}
  }
  tagsUnsub = null;
  tagCatalog = [];
  sketchTags.clear();
  closeTagPicker();
}

function watchList() {
  const list = document.getElementById('sketchList');
  if (!list || listObserver) return;
  listObserver = new MutationObserver(() => {
    // The list is re-rendered wholesale by renderHome(); re-decorate after it.
    window.requestAnimationFrame(() => {
      decorateList();
      renderHomeCloud(getProfile());
    });
  });
  listObserver.observe(list, { childList: true });
}

/* ---------------- arrivals ---------------- */

// The office asked to know the moment a surveyor sends something, not the next
// time they think to open the panel. This watch runs for the whole session, so
// the count is right even while the panel is closed.
let arrivalsUnsub = null;
let knownSubmitted = null;
let unreadArrivals = 0;

async function watchArrivals() {
  if (!isAdmin() || arrivalsUnsub) return;
  try {
    const { watchSubmittedSketches } = await import('../firebase/sketches.js');
    arrivalsUnsub = await watchSubmittedSketches((sketches) => {
      const ids = new Set(sketches.map((s) => s.path || s.id));
      if (knownSubmitted === null) {
        // The first snapshot is the existing backlog, not news. Announcing it
        // would mean a toast per sketch every time the office opens the app.
        knownSubmitted = ids;
        return;
      }
      const fresh = sketches.filter((s) => !knownSubmitted.has(s.path || s.id));
      knownSubmitted = ids;
      if (!fresh.length) return;
      unreadArrivals += fresh.length;
      // Cap the toasts: a batch send of twelve should not bury the screen.
      fresh.slice(0, 3).forEach((s) => {
        toast(String(t('cloud.newArrival')).replace('{email}', s.ownerEmail || ''));
      });
      const profile = getProfile();
      renderChip(profile);
      renderMenuActions(profile);
    });
  } catch (err) {
    console.warn('arrival watch failed', err && err.message);
  }
}

function stopArrivalWatch() {
  if (arrivalsUnsub) {
    try {
      arrivalsUnsub();
    } catch (_) {}
  }
  arrivalsUnsub = null;
  knownSubmitted = null;
  unreadArrivals = 0;
}

/** Opening the panel is what marks the arrivals as seen. */
function markArrivalsSeen() {
  if (!unreadArrivals) return;
  unreadArrivals = 0;
  const profile = getProfile();
  renderChip(profile);
  renderMenuActions(profile);
}

/* ---------------- sync between devices ---------------- */

// Every device signed in to one account holds the same sketches. The account's
// sketches in the cloud are watched live; whenever they or this device's
// library change, a sync pass compares the two and brings them together — new
// and newer versions come down, this device's changes go up, deletes follow,
// and a sketch changed on two devices separately is kept in both versions. The
// rules are in sync-plan.js, which decides; this part only carries them out.

/** sketchId -> this account's cloud document, as last seen. */
const cloudDocs = new Map();
/** The first snapshot has arrived, so a missing document means something. */
let cloudReady = false;
let sketchesUnsub = null;
let syncTimer = null;
/** Saved before the cloud could be compared with; sent as-is if the app is left. */
const savedEarly = new Set();
/** sketchId -> {rev, failed}: a version on its way, or refused, is sent once. */
const pushes = new Map();
/** Deleted on this device, the cloud not yet told; never brought back meanwhile. */
const deletedHere = new Set();
/** Open-sketch conflicts already reported, so the toast does not repeat. */
const reportedConflicts = new Set();

function makeRev() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function sketchLibrary() {
  return window.sketchLibrary || null;
}

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function copyName(record) {
  const lib = sketchLibrary();
  const base = lib ? lib.title(record) : record.name || '';
  const suffix = t('cloud.syncCopySuffix');
  return base.endsWith(suffix) ? base : `${base} ${suffix}`;
}

function countMessage(key, n) {
  return n === 1 ? t(`${key}One`) : String(t(key)).replace('{n}', String(n));
}

/**
 * Send one sketch to this account's cloud copy, once per version.
 *
 * Marks it in sync only when the write is confirmed, and only if it was not
 * changed meanwhile. A write the server refuses is not retried in this
 * session: refusals do not fix themselves, and every retry would come straight
 * back as another refusal.
 */
async function pushRecord(id) {
  const profile = getProfile();
  const lib = sketchLibrary();
  if (!profile || !lib) return;
  const key = String(id);
  const record = lib.list().find((r) => String(r.id) === key);
  if (!record || (record.ownerUid && record.ownerUid !== profile.uid)) return;
  const rev = revOf(record);
  const known = pushes.get(key);
  if (known && known.rev === rev) return;
  pushes.set(key, { rev, failed: false });
  try {
    await saveSketch(record);
    pushes.delete(key);
    const now = lib.list().find((r) => String(r.id) === key);
    const me = getProfile();
    if (now && me && me.uid === profile.uid && revOf(now) === rev) {
      lib.patch([{ id: now.id, fields: { rev, revs: revsOf(now), syncedRev: rev, ownerUid: profile.uid } }]);
    }
  } catch (err) {
    // Offline is not an error: Firestore queues the write on the device and
    // this simply waits. Getting here means the server said no.
    pushes.set(key, { rev, failed: true });
    console.warn('cloud sync failed', key, err && err.message);
  }
}

function runSyncPass() {
  const profile = getProfile();
  const lib = sketchLibrary();
  if (!profile || !lib) return;

  if (!cloudReady) {
    // Nothing to compare with yet. Send what was saved here, as it is; the
    // full comparison runs as soon as the cloud answers.
    for (const id of savedEarly) {
      const record = lib.list().find((r) => String(r.id) === id);
      if (record && isDirty(record)) pushRecord(id);
    }
    return;
  }
  savedEarly.clear();

  // An edit still inside the autosave delay must be in the library before the
  // library is compared — or a newer version could be taken over it.
  lib.flush();
  const openId = lib.openId();
  const local = lib.list();
  const had = new Set(local.map((r) => String(r.id)));
  const plan = planSync({
    local,
    cloud: [...cloudDocs.values()].filter((d) => !deletedHere.has(String(d.id))),
    me: profile.uid,
    openId,
    makeRev,
    copyName,
    currentSchema: SCHEMA_VERSION,
  });

  let put = plan.put;
  let reloadOpen = plan.reloadOpen;
  if (reloadOpen && isTyping()) {
    // A newer version of the open sketch, while the surveyor is typing into
    // it: take it once they stop, rather than replace the field under them.
    put = put.filter((r) => String(r.id) !== String(openId));
    reloadOpen = false;
    scheduleSyncPass(4000);
  }

  if (put.length) lib.put(put);
  if (plan.patch.length) lib.patch(plan.patch);
  if (plan.remove.length) lib.remove(plan.remove);
  if (reloadOpen) {
    lib.reloadOpen();
    toast(t('cloud.syncOpenUpdated'));
  }
  plan.push.forEach((id) => pushRecord(id));

  const copies = new Set(plan.notices.map((n) => n.copyId).filter(Boolean));
  const arrived = put.filter((r) => !had.has(String(r.id)) && !copies.has(String(r.id))).length;
  if (arrived) toast(countMessage('cloud.syncArrived', arrived));
  if (plan.remove.length) toast(countMessage('cloud.syncRemoved', plan.remove.length));
  for (const notice of plan.notices) {
    if (notice.type === 'conflict') {
      toast(String(t('cloud.syncConflict')).replace('{name}', notice.name || ''));
    } else if (notice.type === 'conflict-deferred' && !reportedConflicts.has(notice.id)) {
      reportedConflicts.add(notice.id);
      toast(t('cloud.syncConflictOpen'));
    }
  }
}

function scheduleSyncPass(delay) {
  if (!getProfile()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    runSyncPass();
  }, delay);
}

/**
 * Run a waiting sync pass now, rather than after its delay.
 *
 * Called when the app is left. The delay is only there to batch rapid edits;
 * once the surveyor has switched away there is nothing left to batch, and a
 * frozen page never fires the timer. Firestore puts each write in its
 * on-device queue straight away, so even if the page is then discarded, the
 * update goes up the next time the app opens.
 */
function flushSync() {
  if (!syncTimer && !savedEarly.size) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  runSyncPass();
}

/** A sketch deleted here: tell the cloud, so this account's other devices follow. */
function onSketchDeleted(detail) {
  const profile = getProfile();
  if (!profile || !detail || !detail.id) return;
  const id = String(detail.id);
  const record = detail.record || null;
  savedEarly.delete(id);
  pushes.delete(id);
  // Another account's sketch on a shared device is not this account's to delete.
  if (record && record.ownerUid && record.ownerUid !== profile.uid) return;
  const doc = cloudDocs.get(id);
  // Only a sketch the cloud has. One never sent has nothing to follow it.
  const inCloud = cloudReady ? Boolean(doc && !doc.deleted) : Boolean(record && record.syncedRev);
  if (!inCloud) return;
  const source = record || doc;
  deletedHere.add(id);
  markSketchDeleted(id, { rev: revOf(source), revs: revsOf(source) }).catch((err) => {
    console.warn('could not mark the sketch deleted', id, err && err.message);
  });
}

async function startSketchWatch() {
  const profile = getProfile();
  if (!profile || sketchesUnsub) return;
  const uid = profile.uid;
  try {
    const unsub = await watchMySketches((docs) => {
      const current = getProfile();
      if (!current || current.uid !== uid) return;
      cloudDocs.clear();
      cloudStatus.clear();
      sketchTags.clear();
      docs.forEach((d) => {
        const id = String(d.id);
        cloudDocs.set(id, d);
        if (d.deleted) {
          deletedHere.delete(id); // the cloud has it now
          return;
        }
        cloudStatus.set(id, d.status || SKETCH_STATUS.DRAFT);
        sketchTags.set(id, Array.isArray(d.tags) ? d.tags.map(String) : []);
      });
      const first = !cloudReady;
      cloudReady = true;
      decorateList();
      renderSendState(true);
      // The first answer is compared at once. Later ones mostly echo this
      // device's own writes; a short wait lets a burst of them settle.
      scheduleSyncPass(first ? 0 : 400);
    });
    const current = getProfile();
    if (current && current.uid === uid && !sketchesUnsub) sketchesUnsub = unsub;
    else unsub();
  } catch (err) {
    console.warn('could not watch cloud sketches', err && err.message);
  }
}

function stopSketchWatch() {
  if (sketchesUnsub) {
    try {
      sketchesUnsub();
    } catch (_) {}
  }
  sketchesUnsub = null;
  clearTimeout(syncTimer);
  syncTimer = null;
  cloudReady = false;
  cloudDocs.clear();
  savedEarly.clear();
  pushes.clear();
  deletedHere.clear();
  reportedConflicts.clear();
}

/* ---------------- entry ---------------- */

export function initCloud() {
  if (!isFirebaseConfigured()) return; // stays a purely local app
  startAuthWatch();

  // With no session on this device, the login screen is the right first
  // screen — show it now rather than after the library loads. With one, show
  // the app, and put the login screen up only if the session turns out to be
  // gone (revoked, or storage cleared).
  if (!hasSessionHint()) showLogin();

  onProfileChanged((profile) => {
    rememberSession(profile);
    renderChip(profile);
    renderMenuActions(profile);
    renderHomeCloud(profile);
    if (profile) {
      hideLogin();
      watchList();
      startSketchWatch();
      watchArrivals();
      watchTagCatalog();
    } else {
      cloudStatus.clear();
      stopSketchWatch();
      stopArrivalWatch();
      stopTagCatalog();
      showLogin();
    }
  });

  // Registered after main.js's own handler, which runs first and may itself
  // save — so the update it triggers is the one sent here.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSync();
  });
  window.addEventListener('pagehide', flushSync);

  // main.js announces every library write; sync it, debounced.
  window.addEventListener('sketch:saved', (event) => {
    const id = event && event.detail && event.detail.id;
    if (!id) return;
    lastSavedId = id;
    if (!cloudReady) savedEarly.add(String(id));
    scheduleSyncPass(1500);
    renderSendState(false);
  });
  window.addEventListener('sketch:deleted', (event) => onSketchDeleted(event && event.detail));
}

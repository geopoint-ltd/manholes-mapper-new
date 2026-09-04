// Wires the cloud layer into the existing app.
//
// Two rules shape everything here:
//   1. With no Firebase config, this module does nothing at all. The app stays
//      exactly the offline tool it is today — no login wall, no new buttons.
//   2. The local sketch library remains the source of truth while working. The
//      cloud is a mirror. A failed sync must never cost a surveyor their data,
//      so nothing here deletes or rewrites local state.

import './cloud-ui.css';
import { isFirebaseConfigured, isStorageConfigured, SKETCH_STATUS } from '../firebase/config.js';
import { escapeHtml } from '../dom/dom-utils.js';
import { startAuthWatch, onProfileChanged, getProfile, isAdmin, signOut } from '../firebase/auth.js';
import { saveSketch, submitSketch, listMySketches } from '../firebase/sketches.js';
import { uploadAttachment, listAttachments, formatSize } from '../firebase/attachments.js';
import { showLogin, hideLogin } from './login-screen.js';

/** sketchId -> cloud status, so the list can show what has been sent. */
const cloudStatus = new Map();
let chipEl = null;
let listObserver = null;

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
    ${isAdmin() ? `<button class="btn" data-cloud-menu="admin"><span class="material-icons">admin_panel_settings</span><span class="label">${escapeHtml(t('cloud.adminTitle'))}</span></button>` : ''}
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
    ${isAdmin() ? `<button class="btn btn-ghost" id="cloudAdminBtn" title="${escapeHtml(t('cloud.adminTitle'))}"><span class="material-icons">admin_panel_settings</span></button>` : ''}
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
    ${sent ? `<span class="cloud-badge cloud-badge--submitted">${escapeHtml(t('cloud.sent'))}</span>` : ''}
    <button class="btn btn-sm" data-cloud="send">${escapeHtml(sent ? t('cloud.sendAgain') : t('cloud.sendSketch'))}</button>
    ${withFiles ? `<button class="btn btn-sm" data-cloud="attach">
      <span class="material-icons" style="font-size:16px">attach_file</span>
      <span>${escapeHtml(t('cloud.attach'))}</span>
    </button>
    <div class="cloud-attach-list" data-cloud="files"></div>
    <div class="cloud-progress" data-cloud="progress" style="display:none;"><div class="cloud-progress__bar"></div></div>` : ''}
  `;

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
  list.querySelectorAll('[data-action="open"][data-id]').forEach((btn) => {
    const sketchId = btn.getAttribute('data-id');
    // The whole card, not the Open/Duplicate/Delete row: a phone cannot fit a
    // fifth button on that line, and the cloud actions need room of their own.
    const row = btn.closest('#sketchList > div') || btn.closest('div[style]') || btn.parentElement;
    if (!row) return;
    const existing = row.querySelector(`[data-cloud-actions="${CSS.escape(sketchId)}"]`);
    if (existing) existing.remove();
    row.appendChild(buildRowActions(sketchId));
  });
}

function watchList() {
  const list = document.getElementById('sketchList');
  if (!list || listObserver) return;
  listObserver = new MutationObserver(() => {
    // The list is re-rendered wholesale by renderHome(); re-decorate after it.
    window.requestAnimationFrame(decorateList);
  });
  listObserver.observe(list, { childList: true });
}

/* ---------------- sync ---------------- */

let syncTimer = null;
function scheduleSync(sketchId) {
  if (!getProfile()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const record = findRecord(sketchId);
    if (!record) return;
    try {
      await saveSketch(record);
    } catch (err) {
      // Offline writes are queued by Firestore itself; anything else is worth
      // knowing about but must not interrupt the survey.
      console.warn('cloud sync failed', err && err.message);
    }
  }, 1500);
}

async function loadCloudStatuses() {
  try {
    const remote = await listMySketches();
    cloudStatus.clear();
    remote.forEach((s) => cloudStatus.set(String(s.id), s.status || SKETCH_STATUS.DRAFT));
    decorateList();
    renderSendState(true);
  } catch (err) {
    console.warn('could not read cloud sketches', err && err.message);
  }
}

/* ---------------- entry ---------------- */

export function initCloud() {
  if (!isFirebaseConfigured()) return; // stays a purely local app
  startAuthWatch();

  onProfileChanged((profile) => {
    renderChip(profile);
    renderMenuActions(profile);
    if (profile) {
      hideLogin();
      watchList();
      loadCloudStatuses();
    } else {
      cloudStatus.clear();
      showLogin();
    }
  });

  // main.js announces every library write; mirror it to the cloud, debounced.
  window.addEventListener('sketch:saved', (event) => {
    const id = event && event.detail && event.detail.id;
    if (!id) return;
    lastSavedId = id;
    scheduleSync(id);
    renderSendState(false);
  });
}

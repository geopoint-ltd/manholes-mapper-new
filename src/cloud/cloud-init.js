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
    ${isAdmin() ? `<button class="btn btn-ghost" id="cloudAdminBtn" title="${escapeHtml(t('cloud.adminTitle'))}"><span class="material-icons">admin_panel_settings</span></button>` : ''}
    <button class="btn btn-ghost" id="cloudSignOutBtn" title="${escapeHtml(t('cloud.signOut'))}">
      <span class="material-icons">logout</span>
    </button>
  `;
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
    const row = btn.closest('div[style]') || btn.parentElement;
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
    if (id) scheduleSync(id);
  });
}

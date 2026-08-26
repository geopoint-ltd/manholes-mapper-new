// The office panel: manage members, and read what they sent in.
//
// Admin-only. Every action here is also gated by the security rules, so this
// panel is a convenience, not the boundary.

import { escapeHtml } from '../dom/dom-utils.js';
import { isAdmin } from '../firebase/auth.js';
import {
  createMember,
  listUsers,
  setMemberDisabled,
  sendMemberPasswordReset,
  removeMember,
} from '../firebase/users.js';
import { listSubmittedSketches } from '../firebase/sketches.js';
import { listAttachments, formatSize } from '../firebase/attachments.js';

let el = null;

function t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

/** A readable password an admin can hand over verbally, still hard to guess. */
function suggestPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

function formatWhen(value) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function build() {
  const root = document.createElement('div');
  root.className = 'cloud-panel';
  root.id = 'cloudAdminPanel';
  root.innerHTML = `
    <div class="cloud-panel__card" role="dialog" aria-modal="true">
      <div class="cloud-panel__head">
        <h2 class="cloud-panel__title">
          <span class="material-icons">admin_panel_settings</span>
          ${escapeHtml(t('cloud.adminTitle'))}
        </h2>
        <button class="btn btn-ghost" id="cloudAdminClose" aria-label="${escapeHtml(t('cancel'))}">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="cloud-tabs">
        <button class="cloud-tab is-active" data-tab="members">${escapeHtml(t('cloud.tabMembers'))}</button>
        <button class="cloud-tab" data-tab="inbox">${escapeHtml(t('cloud.tabInbox'))}</button>
      </div>
      <div class="cloud-panel__body">
        <section class="cloud-panel__section is-active" data-section="members">
          <div class="cloud-form-grid">
            <div class="field">
              <label for="cloudNewName">${escapeHtml(t('cloud.memberName'))}</label>
              <input id="cloudNewName" type="text" />
            </div>
            <div class="field">
              <label for="cloudNewEmail">${escapeHtml(t('cloud.email'))}</label>
              <input id="cloudNewEmail" type="email" dir="ltr" autocomplete="off" />
            </div>
            <div class="field">
              <label for="cloudNewPassword">${escapeHtml(t('cloud.password'))}</label>
              <input id="cloudNewPassword" type="text" dir="ltr" autocomplete="off" />
            </div>
          </div>
          <button class="btn btn-primary" id="cloudCreateMember">
            <span class="material-icons">person_add</span>
            <span>${escapeHtml(t('cloud.createMember'))}</span>
          </button>
          <div class="cloud-note">${escapeHtml(t('cloud.passwordNote'))}</div>
          <div class="cloud-list" id="cloudUserList" style="margin-top:1rem;"></div>
        </section>
        <section class="cloud-panel__section" data-section="inbox">
          <div class="cloud-list" id="cloudInboxList"></div>
        </section>
      </div>
    </div>
  `;
  return root;
}

function renderUsers(users) {
  const list = el.querySelector('#cloudUserList');
  if (!users.length) {
    list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.noMembers'))}</div>`;
    return;
  }
  list.innerHTML = users
    .map((u) => {
      const role = u.role === 'admin' ? 'admin' : 'member';
      const badges = [
        `<span class="cloud-badge cloud-badge--${role}">${escapeHtml(t(`cloud.role_${role}`))}</span>`,
        u.disabled ? `<span class="cloud-badge cloud-badge--disabled">${escapeHtml(t('cloud.disabled'))}</span>` : '',
      ].join(' ');
      const actions =
        role === 'admin'
          ? ''
          : `
        <button class="btn btn-sm" data-act="reset" data-email="${escapeHtml(u.email)}">${escapeHtml(t('cloud.resetPassword'))}</button>
        <button class="btn btn-sm" data-act="toggle" data-uid="${escapeHtml(u.uid)}" data-disabled="${u.disabled ? '1' : '0'}">${escapeHtml(u.disabled ? t('cloud.enable') : t('cloud.disable'))}</button>
        <button class="btn btn-danger btn-sm" data-act="remove" data-uid="${escapeHtml(u.uid)}" data-email="${escapeHtml(u.email)}">${escapeHtml(t('cloud.remove'))}</button>`;
      return `
        <div class="cloud-row">
          <div class="cloud-row__main">
            <div class="cloud-row__title">${escapeHtml(u.displayName || u.email)} ${badges}</div>
            <div class="cloud-row__meta" dir="ltr">${escapeHtml(u.email)}</div>
          </div>
          <div class="cloud-row__actions">${actions}</div>
        </div>`;
    })
    .join('');
}

async function refreshUsers() {
  const list = el.querySelector('#cloudUserList');
  list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.loading'))}</div>`;
  try {
    renderUsers(await listUsers());
  } catch (err) {
    list.innerHTML = `<div class="cloud-empty">${escapeHtml((err && err.message) || String(err))}</div>`;
  }
}

async function renderInbox() {
  const list = el.querySelector('#cloudInboxList');
  list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.loading'))}</div>`;
  try {
    const sketches = await listSubmittedSketches();
    if (!sketches.length) {
      list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.inboxEmpty'))}</div>`;
      return;
    }
    list.innerHTML = sketches
      .map(
        (s) => `
        <div class="cloud-row">
          <div class="cloud-row__main">
            <div class="cloud-row__title">${escapeHtml(s.name || s.id)}</div>
            <div class="cloud-row__meta" dir="auto">
              ${escapeHtml(s.ownerEmail || '')} ·
              ${escapeHtml(t('cloud.nodes'))}: ${Number(s.nodeCount) || 0} ·
              ${escapeHtml(t('cloud.lines'))}: ${Number(s.edgeCount) || 0} ·
              ${escapeHtml(formatWhen(s.submittedAt))}
            </div>
            <div class="cloud-attach-list" data-files-for="${escapeHtml(s.ownerUid || '')}|${escapeHtml(s.id)}"></div>
          </div>
          <div class="cloud-row__actions">
            <button class="btn btn-sm" data-act="files" data-uid="${escapeHtml(s.ownerUid || '')}" data-sketch="${escapeHtml(s.id)}">${escapeHtml(t('cloud.viewFiles'))}</button>
          </div>
        </div>`
      )
      .join('');
  } catch (err) {
    // A missing composite index is the usual first-run failure; its message
    // carries the console link that creates it.
    list.innerHTML = `<div class="cloud-empty">${escapeHtml((err && err.message) || String(err))}</div>`;
  }
}

async function showFiles(uid, sketchId) {
  const holder = el.querySelector(`[data-files-for="${CSS.escape(`${uid}|${sketchId}`)}"]`);
  if (!holder) return;
  holder.innerHTML = `<div class="cloud-row__meta">${escapeHtml(t('cloud.loading'))}</div>`;
  try {
    const files = await listAttachments(sketchId, uid);
    holder.innerHTML = files.length
      ? files
          .map(
            (f) => `
        <div class="cloud-attach">
          <span class="material-icons">${f.contentType && f.contentType.startsWith('image/') ? 'image' : 'description'}</span>
          <span class="cloud-attach__name" dir="auto">${escapeHtml(f.name)}</span>
          <span class="cloud-attach__size">${escapeHtml(formatSize(f.size))}</span>
          <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('cloud.open'))}</a>
        </div>`
          )
          .join('')
      : `<div class="cloud-row__meta">${escapeHtml(t('cloud.noFiles'))}</div>`;
  } catch (err) {
    holder.innerHTML = `<div class="cloud-row__meta">${escapeHtml((err && err.message) || String(err))}</div>`;
  }
}

function wire() {
  el.querySelector('#cloudAdminClose').addEventListener('click', closeAdminPanel);
  el.addEventListener('click', (event) => {
    if (event.target === el) closeAdminPanel();
  });

  el.querySelectorAll('.cloud-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.getAttribute('data-tab');
      el.querySelectorAll('.cloud-tab').forEach((b) => b.classList.toggle('is-active', b === tab));
      el.querySelectorAll('.cloud-panel__section').forEach((s) =>
        s.classList.toggle('is-active', s.getAttribute('data-section') === name)
      );
      if (name === 'inbox') renderInbox();
      else refreshUsers();
    });
  });

  el.querySelector('#cloudCreateMember').addEventListener('click', async () => {
    const nameEl = el.querySelector('#cloudNewName');
    const emailEl = el.querySelector('#cloudNewEmail');
    const passEl = el.querySelector('#cloudNewPassword');
    const email = emailEl.value.trim();
    const password = passEl.value.trim();
    if (!email || !password) {
      toast(t('cloud.errMissing'));
      return;
    }
    try {
      await createMember({ email, password, displayName: nameEl.value });
      nameEl.value = '';
      emailEl.value = '';
      passEl.value = suggestPassword();
      toast(t('cloud.memberCreated'));
      await refreshUsers();
    } catch (err) {
      toast((err && err.message) || String(err));
    }
  });

  el.querySelector('#cloudUserList').addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    try {
      if (act === 'reset') {
        await sendMemberPasswordReset(btn.getAttribute('data-email'));
        toast(t('cloud.resetSent'));
      } else if (act === 'toggle') {
        await setMemberDisabled(btn.getAttribute('data-uid'), btn.getAttribute('data-disabled') !== '1');
        await refreshUsers();
      } else if (act === 'remove') {
        const email = btn.getAttribute('data-email');
        if (!confirm(t('cloud.confirmRemove').replace('{email}', email))) return;
        await removeMember(btn.getAttribute('data-uid'));
        toast(t('cloud.memberRemoved'));
        await refreshUsers();
      }
    } catch (err) {
      toast((err && err.message) || String(err));
    }
  });

  el.querySelector('#cloudInboxList').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-act="files"]');
    if (btn) showFiles(btn.getAttribute('data-uid'), btn.getAttribute('data-sketch'));
  });
}

/** Open the office panel. No-op for non-admins. */
export function openAdminPanel() {
  if (!isAdmin()) return;
  if (!el) {
    el = build();
    document.body.appendChild(el);
    wire();
  }
  el.querySelector('#cloudNewPassword').value = suggestPassword();
  el.classList.add('is-open');
  refreshUsers();
}

export function closeAdminPanel() {
  if (el) el.classList.remove('is-open');
}

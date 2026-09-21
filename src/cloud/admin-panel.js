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
import { watchSubmittedSketches, deleteMemberSketch } from '../firebase/sketches.js';
import { listAttachments, formatSize } from '../firebase/attachments.js';
import { isStorageConfigured } from '../firebase/config.js';
import { buildSketchZip, saveBlob, sketchDisplayName } from './sketch-zip.js';
import {
  watchTags,
  createTag,
  updateTag,
  deleteTag,
  addSketchTag,
  removeSketchTag,
  setOfficeFlag,
  OFFICE_FLAGS,
} from '../firebase/tags.js';
import { tagRow, tagChip, swatches, wireSwatches, openTagPicker, closeTagPicker } from './tag-picker.js';

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
  if (Number.isNaN(date.getTime())) return '';
  const locale = window.currentLang === 'en' ? 'en-GB' : 'he-IL';
  try {
    return date.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) {
    return date.toLocaleString(locale);
  }
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
        <button class="cloud-tab" data-tab="tags">${escapeHtml(t('cloud.tabTags'))}</button>
      </div>
      <div class="cloud-panel__body">
        <section class="cloud-panel__section is-active" data-section="members">
          <div class="cloud-add">
            <h3 class="cloud-section-title">
              <span class="material-icons" aria-hidden="true">person_add</span>
              ${escapeHtml(t('cloud.addMemberTitle'))}
            </h3>
            <div class="cloud-add__grid">
              <div class="cloud-field">
                <label for="cloudNewName">${escapeHtml(t('cloud.memberName'))}</label>
                <input id="cloudNewName" type="text" autocomplete="off"
                       placeholder="${escapeHtml(t('cloud.namePlaceholder'))}" />
              </div>
              <div class="cloud-field">
                <label for="cloudNewEmail">${escapeHtml(t('cloud.email'))}</label>
                <input id="cloudNewEmail" type="email" dir="ltr" autocomplete="off"
                       autocapitalize="none" spellcheck="false" placeholder="name@geopoint.me" />
              </div>
              <div class="cloud-field">
                <label for="cloudNewPassword">${escapeHtml(t('cloud.password'))}</label>
                <div class="cloud-field__control">
                  <input id="cloudNewPassword" type="text" dir="ltr" autocomplete="off"
                         autocapitalize="none" spellcheck="false" />
                  <button type="button" class="cloud-field__icon" id="cloudCopyPassword"
                          title="${escapeHtml(t('cloud.copyPassword'))}" aria-label="${escapeHtml(t('cloud.copyPassword'))}">
                    <span class="material-icons" aria-hidden="true">content_copy</span>
                  </button>
                  <button type="button" class="cloud-field__icon" id="cloudRollPassword"
                          title="${escapeHtml(t('cloud.newPassword'))}" aria-label="${escapeHtml(t('cloud.newPassword'))}">
                    <span class="material-icons" aria-hidden="true">refresh</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="cloud-add__foot">
              <p class="cloud-add__note">
                <span class="material-icons" aria-hidden="true">info_outline</span>
                <span>${escapeHtml(t('cloud.passwordNote'))}</span>
              </p>
              <button class="btn btn-primary cloud-add__submit" id="cloudCreateMember">
                <span class="material-icons" aria-hidden="true">person_add</span>
                <span>${escapeHtml(t('cloud.createMember'))}</span>
              </button>
            </div>
          </div>
          <h3 class="cloud-section-title">
            <span class="material-icons" aria-hidden="true">group</span>
            ${escapeHtml(t('cloud.usersTitle'))}
            <span class="home-count" id="cloudUserCount"></span>
          </h3>
          <div class="cloud-list" id="cloudUserList"></div>
        </section>
        <section class="cloud-panel__section" data-section="inbox">
          <div class="cloud-list" id="cloudInboxList"></div>
        </section>
        <section class="cloud-panel__section" data-section="tags">
          <form class="cloud-add" id="cloudTagForm" novalidate>
            <h3 class="cloud-section-title">
              <span class="material-icons" aria-hidden="true">new_label</span>
              ${escapeHtml(t('cloud.newTag'))}
            </h3>
            <div class="tag-form">
              <div class="cloud-field tag-form__name">
                <label for="cloudTagName">${escapeHtml(t('cloud.tagName'))}</label>
                <input id="cloudTagName" type="text" maxlength="40" autocomplete="off"
                       placeholder="${escapeHtml(t('cloud.tagNamePlaceholder'))}" />
              </div>
              <div class="cloud-field">
                <label>${escapeHtml(t('cloud.tagColor'))}</label>
                <div id="cloudTagSwatches"></div>
              </div>
              <button type="submit" class="btn btn-primary cloud-add__submit">
                <span class="material-icons" aria-hidden="true">add</span>
                <span>${escapeHtml(t('cloud.createTag'))}</span>
              </button>
            </div>
            <p class="cloud-add__note">
              <span class="material-icons" aria-hidden="true">info_outline</span>
              <span>${escapeHtml(t('cloud.tagsHint'))}</span>
            </p>
          </form>
          <h3 class="cloud-section-title">
            <span class="material-icons" aria-hidden="true">local_offer</span>
            ${escapeHtml(t('cloud.tagsTitle'))}
            <span class="home-count" id="cloudTagCount"></span>
          </h3>
          <div class="cloud-list" id="cloudTagList"></div>
        </section>
      </div>
    </div>
  `;
  return root;
}

function renderUsers(users) {
  const list = el.querySelector('#cloudUserList');
  const count = el.querySelector('#cloudUserCount');
  if (count) count.textContent = users.length ? String(users.length) : '';
  if (!users.length) {
    list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.noMembers'))}</div>`;
    return;
  }
  list.innerHTML = users
    .map((u) => {
      const role = u.role === 'admin' ? 'admin' : 'member';
      const name = String(u.displayName || u.email || '').trim();
      const initial = (name[0] || '?').toUpperCase();
      const badges = [
        `<span class="cloud-badge cloud-badge--${role}">${escapeHtml(t(`cloud.role_${role}`))}</span>`,
        u.disabled ? `<span class="cloud-badge cloud-badge--disabled">${escapeHtml(t('cloud.disabled'))}</span>` : '',
      ].join('');
      // An admin cannot block or remove an admin from here — the rules refuse it
      // anyway — so an admin row carries no buttons rather than dead ones.
      const actions =
        role === 'admin'
          ? ''
          : `
        <div class="cloud-user__actions">
          <button class="btn cloud-user__btn" data-act="reset" data-email="${escapeHtml(u.email)}">
            <span class="material-icons" aria-hidden="true">mail_outline</span>
            <span>${escapeHtml(t('cloud.resetPassword'))}</span>
          </button>
          <button class="btn cloud-user__btn" data-act="toggle" data-uid="${escapeHtml(u.uid)}" data-disabled="${u.disabled ? '1' : '0'}">
            <span class="material-icons" aria-hidden="true">${u.disabled ? 'check_circle_outline' : 'block'}</span>
            <span>${escapeHtml(u.disabled ? t('cloud.enable') : t('cloud.disable'))}</span>
          </button>
          <button class="btn cloud-user__btn cloud-user__btn--danger" data-act="remove" data-uid="${escapeHtml(u.uid)}" data-email="${escapeHtml(u.email)}">
            <span class="material-icons" aria-hidden="true">delete_outline</span>
            <span>${escapeHtml(t('cloud.remove'))}</span>
          </button>
        </div>`;
      return `
        <div class="cloud-user${u.disabled ? ' is-disabled' : ''}">
          <span class="cloud-user__avatar cloud-user__avatar--${role}" aria-hidden="true">${escapeHtml(initial)}</span>
          <div class="cloud-user__main">
            <div class="cloud-user__name"><span dir="auto">${escapeHtml(name)}</span>${badges}</div>
            <div class="cloud-user__email"><span dir="ltr">${escapeHtml(u.email)}</span></div>
          </div>
          ${actions}
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

/** Live subscription while the panel is open, so the office does not refresh. */
let inboxUnsub = null;

/** Drop the subscription — called when the panel closes. */
export function stopInboxSubscription() {
  if (inboxUnsub) {
    try {
      inboxUnsub();
    } catch (_) {}
  }
  inboxUnsub = null;
}

async function renderInbox() {
  const list = el.querySelector('#cloudInboxList');
  list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.loading'))}</div>`;
  stopInboxSubscription();
  try {
    inboxUnsub = await watchSubmittedSketches(
      (sketches) => paintInbox(list, sketches),
      (err) => {
        list.innerHTML = `<div class="cloud-empty">${escapeHtml((err && err.message) || String(err))}</div>`;
      }
    );
  } catch (err) {
    // A missing composite index is the usual first-run failure; its message
    // carries the console link that creates it.
    list.innerHTML = `<div class="cloud-empty">${escapeHtml((err && err.message) || String(err))}</div>`;
  }
}

/** Draw the inbox from one snapshot. */
function paintInbox(list, sketches) {
  lastInbox = sketches;
  inboxCache.clear();
  sketches.forEach((s) => inboxCache.set(String(s.path), s));
  if (!sketches.length) {
    list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.inboxEmpty'))}</div>`;
    return;
  }
  const labels = {
    inDb: t('cloud.officeInDb'),
    inTrello: t('cloud.officeInTrello'),
  };
  list.innerHTML = sketches
    .map((s) => {
      const path = escapeHtml(s.path);
      const office = s.office || {};
      const done = OFFICE_FLAGS.filter((flag) => office[flag] === true).length;
      const complete = done === OFFICE_FLAGS.length;
      // Each detail is its own element, so the email (LTR) and the date never
      // share a bidi run with the Hebrew around them.
      return `
      <article class="inbox-row${complete ? ' is-complete' : ''}" data-path="${path}">
        <div class="inbox-row__top">
          <div class="inbox-row__main">
            <div class="inbox-row__title">${escapeHtml(sketchDisplayName(s))}</div>
            <div class="inbox-row__meta">
              <span dir="ltr">${escapeHtml(s.ownerEmail || '')}</span>
              <span>${escapeHtml(t('cloud.nodes'))}: ${Number(s.nodeCount) || 0}</span>
              <span>${escapeHtml(t('cloud.lines'))}: ${Number(s.edgeCount) || 0}</span>
              <span dir="ltr">${escapeHtml(formatWhen(s.submittedAt))}</span>
            </div>
          </div>
          <div class="inbox-row__actions">
            <button class="btn inbox-btn inbox-btn--primary" data-act="open" data-path="${path}">
              <span class="material-icons" aria-hidden="true">edit</span>
              <span>${escapeHtml(t('cloud.open'))}</span>
            </button>
            <button class="btn inbox-btn" data-act="zip" data-path="${path}">
              <span class="material-icons" aria-hidden="true">download</span>
              <span>${escapeHtml(t('cloud.download'))}</span>
            </button>
            ${isStorageConfigured() ? `<button class="btn inbox-btn" data-act="files" data-uid="${escapeHtml(s.ownerUid || '')}" data-sketch="${escapeHtml(s.id)}">${escapeHtml(t('cloud.viewFiles'))}</button>` : ''}
            <button class="btn inbox-btn inbox-btn--danger" data-act="delete" data-path="${path}">
              <span class="material-icons" aria-hidden="true">delete_outline</span>
              <span>${escapeHtml(t('cloud.deleteSketch'))}</span>
            </button>
          </div>
        </div>
        <div class="inbox-row__tags">${tagRow(s.tags || [], panelTags, { removable: true, canAdd: true })}</div>
        <div class="inbox-row__office" role="group">
          ${OFFICE_FLAGS.map((flag) => {
            const on = office[flag] === true;
            return `<label class="office-check${on ? ' is-on' : ''}">
                <input type="checkbox" data-office="${flag}" ${on ? 'checked' : ''} />
                <span>${escapeHtml(labels[flag])}</span>
              </label>`;
          }).join('')}
          <span class="office-progress${complete ? ' is-complete' : ''}">
            ${complete ? `<span class="material-icons" aria-hidden="true">task_alt</span>${escapeHtml(t('cloud.officeDone'))}` : `${done}/${OFFICE_FLAGS.length}`}
          </span>
        </div>
        <div class="cloud-attach-list" data-files-for="${escapeHtml(s.ownerUid || '')}|${escapeHtml(s.id)}"></div>
      </article>`;
    })
    .join('');
}

/* ---------------- tags tab ---------------- */

let editingTagId = null;

function renderTagsTab() {
  if (!el) return;
  const list = el.querySelector('#cloudTagList');
  const count = el.querySelector('#cloudTagCount');
  if (!list) return;
  if (count) count.textContent = panelTags.length ? String(panelTags.length) : '';
  if (!panelTags.length) {
    list.innerHTML = `<div class="cloud-empty">${escapeHtml(t('cloud.noTagsYet'))}</div>`;
    return;
  }
  list.innerHTML = panelTags
    .map((tag) => {
      const id = escapeHtml(tag.id);
      if (tag.id === editingTagId) {
        return `
        <form class="tag-row tag-row--edit" data-tag-edit-form="${id}" novalidate>
          <input type="text" class="tag-row__input" maxlength="40" value="${escapeHtml(tag.name)}"
                 aria-label="${escapeHtml(t('cloud.tagName'))}" />
          ${swatches(tag.color)}
          <div class="tag-row__buttons">
            <button type="submit" class="btn btn-primary tag-row__btn">${escapeHtml(t('save'))}</button>
            <button type="button" class="btn tag-row__btn" data-tag-cancel>${escapeHtml(t('cancel'))}</button>
          </div>
        </form>`;
      }
      return `
        <div class="tag-row">
          ${tagChip(tag)}
          <span class="tag-row__spacer"></span>
          <button type="button" class="tag-row__icon" data-tag-edit="${id}"
                  title="${escapeHtml(t('cloud.editTag'))}" aria-label="${escapeHtml(t('cloud.editTag'))}">
            <span class="material-icons" aria-hidden="true">edit</span>
          </button>
          <button type="button" class="tag-row__icon tag-row__icon--danger" data-tag-delete="${id}"
                  title="${escapeHtml(t('cloud.deleteTag'))}" aria-label="${escapeHtml(t('cloud.deleteTag'))}">
            <span class="material-icons" aria-hidden="true">delete_outline</span>
          </button>
        </div>`;
    })
    .join('');
  const form = list.querySelector('[data-tag-edit-form]');
  if (form) {
    const color = wireSwatches(form);
    const input = form.querySelector('.tag-row__input');
    input.focus();
    input.select();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await updateTag(editingTagId, { name: input.value, color: color() });
        editingTagId = null;
        renderTagsTab();
      } catch (err) {
        toast((err && err.message) || String(err));
      }
    });
  }
}

function startPanelTags() {
  if (panelTagsUnsub) return;
  watchTags((tags) => {
    panelTags = tags;
    renderTagsTab();
    // The inbox shows tag names and colours; keep them current.
    const inbox = el && el.querySelector('#cloudInboxList');
    if (inbox && lastInbox.length) paintInbox(inbox, lastInbox);
  })
    .then((unsub) => {
      panelTagsUnsub = unsub;
    })
    .catch((err) => console.warn('tag watch failed', err && err.message));
}

function stopPanelTags() {
  if (panelTagsUnsub) {
    try {
      panelTagsUnsub();
    } catch (_) {}
  }
  panelTagsUnsub = null;
  closeTagPicker();
}

/** The sketches currently listed, so a download reuses what was already read. */
const inboxCache = new Map();
/** The last inbox snapshot, so a tag change can repaint without a re-read. */
let lastInbox = [];
/** The tag catalogue, live while the panel is open. */
let panelTags = [];
let panelTagsUnsub = null;

/**
 * Hand the office one archive per sketch: the manholes CSV, the lines CSV and
 * the sketch itself, named after the day it was drawn.
 *
 * Nothing is stored to produce this — the files are generated from the sketch
 * document that is already in Firestore, which is what lets it work on the free
 * plan where there is no Storage bucket at all.
 */
async function downloadZip(path, btn) {
  const sketch = inboxCache.get(String(path));
  if (!sketch) return;
  const label = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('cloud.preparing');
  }
  try {
    // Written by main.js. Absent only if the legacy bundle has not run, in
    // which case the sketch JSON still travels and the CSVs are skipped rather
    // than written against guessed columns.
    const adminConfig =
      typeof window.getAdminConfig === 'function' ? window.getAdminConfig() : null;
    const { blob, filename } = await buildSketchZip(sketch, adminConfig, t);
    saveBlob(blob, filename);
  } catch (err) {
    toast((err && err.message) || String(err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}

/**
 * Load a received sketch into the editor, still signed in as the office.
 *
 * The sketch document already carries its nodes and edges, so nothing more has
 * to be fetched; it is reshaped into the record form the local library uses and
 * handed to the app, which opens it through its own load path.
 */
function openInEditor(path) {
  const s = inboxCache.get(String(path));
  if (!s) return;
  if (typeof window.openSketchRecord !== 'function') {
    toast('cannot open: the editor is not ready');
    return;
  }
  const now = new Date().toISOString();
  const nodes = Array.isArray(s.nodes) ? s.nodes : [];
  const record = {
    id: String(s.id),
    name: s.name || null,
    nodes,
    edges: Array.isArray(s.edges) ? s.edges : [],
    nextNodeId: Number(s.nextNodeId) || nodes.length + 1,
    createdAt: s.createdAt || s.creationDate || now,
    updatedAt: s.updatedAt || now,
    creationDate: s.creationDate || s.createdAt || now,
    schemaVersion: s.schemaVersion,
  };
  if (window.openSketchRecord(record)) closeAdminPanel();
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
      else if (name === 'tags') renderTagsTab();
      else refreshUsers();
    });
  });

  el.querySelector('#cloudRollPassword').addEventListener('click', () => {
    el.querySelector('#cloudNewPassword').value = suggestPassword();
  });
  el.querySelector('#cloudCopyPassword').addEventListener('click', async () => {
    const input = el.querySelector('#cloudNewPassword');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      // Clipboard API refused (insecure context or no permission): fall back
      // to selecting it, so a long-press copy is one step away.
      input.focus();
      input.select();
      return;
    }
    toast(t('cloud.passwordCopied'));
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
    const filesBtn = event.target.closest('button[data-act="files"]');
    if (filesBtn) {
      showFiles(filesBtn.getAttribute('data-uid'), filesBtn.getAttribute('data-sketch'));
      return;
    }
    const zipBtn = event.target.closest('button[data-act="zip"]');
    if (zipBtn) {
      downloadZip(zipBtn.getAttribute('data-path'), zipBtn);
      return;
    }
    const openBtn = event.target.closest('button[data-act="open"]');
    if (openBtn) {
      openInEditor(openBtn.getAttribute('data-path'));
      return;
    }
    const delBtn = event.target.closest('button[data-act="delete"]');
    if (delBtn) {
      const target = inboxCache.get(delBtn.getAttribute('data-path'));
      if (!target) return;
      // Irreversible, so the prompt names exactly what goes and whose it is.
      const question = String(t('cloud.confirmDeleteSketch'))
        .replace('{name}', sketchDisplayName(target))
        .replace('{email}', target.ownerEmail || '');
      if (!confirm(question)) return;
      delBtn.disabled = true;
      deleteMemberSketch(target.ownerUid, target.id)
        // The live inbox drops the row by itself once the delete lands.
        .then(() => toast(t('cloud.sketchDeleted')))
        .catch((err) => {
          delBtn.disabled = false;
          toast((err && err.message) || String(err));
        });
      return;
    }
    const row = event.target.closest('.inbox-row');
    const sketch = row && inboxCache.get(row.getAttribute('data-path'));
    if (!sketch) return;
    if (event.target.closest('[data-tag-add]')) {
      openTagPicker({
        catalog: panelTags,
        exclude: sketch.tags || [],
        onPick: (tag) => addSketchTag(sketch.ownerUid, sketch.id, tag.id),
        onCreate: async (draft) => {
          const tag = await createTag(draft);
          await addSketchTag(sketch.ownerUid, sketch.id, tag.id);
        },
      });
      return;
    }
    const remove = event.target.closest('[data-tag-remove]');
    if (remove) {
      remove.disabled = true;
      removeSketchTag(sketch.ownerUid, sketch.id, remove.getAttribute('data-tag-remove')).catch((err) => {
        remove.disabled = false;
        toast((err && err.message) || String(err));
      });
    }
  });

  // The office checklist. The live inbox repaints on the write, so the tick
  // shown is always what the database holds; on failure, put it back.
  el.querySelector('#cloudInboxList').addEventListener('change', async (event) => {
    const box = event.target.closest('input[data-office]');
    if (!box) return;
    const row = box.closest('.inbox-row');
    const sketch = row && inboxCache.get(row.getAttribute('data-path'));
    if (!sketch) return;
    const label = box.closest('.office-check');
    if (label) label.classList.toggle('is-on', box.checked);
    try {
      await setOfficeFlag(sketch.ownerUid, sketch.id, box.getAttribute('data-office'), box.checked);
    } catch (err) {
      box.checked = !box.checked;
      if (label) label.classList.toggle('is-on', box.checked);
      toast((err && err.message) || String(err));
    }
  });

  // Tags tab.
  const tagForm = el.querySelector('#cloudTagForm');
  tagForm.querySelector('#cloudTagSwatches').innerHTML = swatches();
  const newTagColor = wireSwatches(tagForm);
  tagForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = tagForm.querySelector('#cloudTagName');
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    try {
      await createTag({ name, color: newTagColor() });
      input.value = '';
      input.focus();
    } catch (err) {
      toast((err && err.message) || String(err));
    }
  });
  el.querySelector('#cloudTagList').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-tag-edit]');
    if (edit) {
      editingTagId = edit.getAttribute('data-tag-edit');
      renderTagsTab();
      return;
    }
    if (event.target.closest('[data-tag-cancel]')) {
      editingTagId = null;
      renderTagsTab();
      return;
    }
    const del = event.target.closest('[data-tag-delete]');
    if (del) {
      const tag = panelTags.find((x) => x.id === del.getAttribute('data-tag-delete'));
      if (!tag) return;
      if (!confirm(t('cloud.confirmDeleteTag').replace('{name}', tag.name))) return;
      try {
        await deleteTag(tag.id);
      } catch (err) {
        toast((err && err.message) || String(err));
      }
    }
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
  startPanelTags();
  refreshUsers();
}

export function closeAdminPanel() {
  stopInboxSubscription();
  stopPanelTags();
  if (el) el.classList.remove('is-open');
}

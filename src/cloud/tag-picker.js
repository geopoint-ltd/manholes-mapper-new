// Tag chips, colour swatches, and the "add a tag" picker.
//
// Shared by the worker's sketch list and the office inbox, so a tag looks and
// behaves the same wherever it appears. Pure presentation: every write goes
// through the callbacks the caller passes in.

import { escapeHtml } from '../dom/dom-utils.js';
import { TAG_COLORS } from '../firebase/tags.js';

function t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

/**
 * The colour goes into a style attribute. Rules already validate it, but a
 * value that is not a plain hex colour must never reach CSS.
 */
function safeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color)) ? color : TAG_COLORS[TAG_COLORS.length - 1];
}

/** One tag as a chip. */
export function tagChip(tag, { removable = false } = {}) {
  const name = escapeHtml(tag.name);
  const remove = removable
    ? `<button type="button" class="tag-chip__x" data-tag-remove="${escapeHtml(tag.id)}"
               aria-label="${escapeHtml(t('cloud.removeTag'))}: ${name}" title="${escapeHtml(t('cloud.removeTag'))}">
         <span class="material-icons" aria-hidden="true">close</span>
       </button>`
    : '';
  return `<span class="tag-chip" style="--tag:${safeColor(tag.color)}">
      <span class="tag-chip__dot" aria-hidden="true"></span>
      <span class="tag-chip__name" dir="auto">${name}</span>${remove}
    </span>`;
}

/**
 * A sketch's tags plus, optionally, the "+ tag" button.
 * Ids missing from the catalogue (a deleted tag) are skipped.
 */
export function tagRow(tagIds, catalog, { removable = false, canAdd = false } = {}) {
  const byId = new Map(catalog.map((tag) => [tag.id, tag]));
  const chips = (tagIds || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((tag) => tagChip(tag, { removable }))
    .join('');
  const add = canAdd
    ? `<button type="button" class="tag-add" data-tag-add>
         <span class="material-icons" aria-hidden="true">add</span>
         <span>${escapeHtml(t('cloud.addTag'))}</span>
       </button>`
    : '';
  return chips + add;
}

/** The colour choices, as a radio group. */
export function swatches(selected) {
  const current = TAG_COLORS.includes(selected) ? selected : TAG_COLORS[0];
  return `<div class="tag-swatches" role="radiogroup" aria-label="${escapeHtml(t('cloud.tagColor'))}">
      ${TAG_COLORS.map(
        (color, i) => `<button type="button" class="tag-swatch" role="radio" data-color="${color}"
              style="--tag:${color}" aria-checked="${color === current}"
              aria-label="${escapeHtml(t('cloud.tagColor'))} ${i + 1}"></button>`
      ).join('')}
    </div>`;
}

/** Make a swatch group clickable. Returns a getter for the chosen colour. */
export function wireSwatches(container) {
  const group = container.querySelector('.tag-swatches');
  group.addEventListener('click', (event) => {
    const btn = event.target.closest('.tag-swatch');
    if (!btn) return;
    group.querySelectorAll('.tag-swatch').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  });
  return () => {
    const on = group.querySelector('.tag-swatch[aria-checked="true"]');
    return on ? on.getAttribute('data-color') : TAG_COLORS[0];
  };
}

let open = null;

/** Close the picker if it is showing. */
export function closeTagPicker() {
  if (!open) return;
  open.remove();
  document.removeEventListener('keydown', onKey, true);
  open = null;
}

function onKey(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeTagPicker();
  }
}

/**
 * Pick an existing tag or create a new one.
 *
 * @param {object} opts
 * @param {{id: string, name: string, color: string}[]} opts.catalog
 * @param {string[]} [opts.exclude] Ids already on the sketch.
 * @param {(tag: object) => Promise<void>} opts.onPick
 * @param {(draft: {name: string, color: string}) => Promise<void>} opts.onCreate
 */
export function openTagPicker({ catalog, exclude = [], onPick, onCreate }) {
  closeTagPicker();
  const taken = new Set(exclude);
  const available = catalog.filter((tag) => !taken.has(tag.id));
  // Offer the next colour nobody has used yet, so a new tag is distinct by default.
  const used = new Set(catalog.map((tag) => tag.color));
  const fresh = TAG_COLORS.find((c) => !used.has(c)) || TAG_COLORS[0];

  const root = document.createElement('div');
  root.className = 'tag-picker';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'tagPickerTitle');
  root.innerHTML = `
    <div class="tag-picker__card">
      <div class="tag-picker__head">
        <h3 id="tagPickerTitle">${escapeHtml(t('cloud.addTagTitle'))}</h3>
        <button type="button" class="tag-picker__close" data-close aria-label="${escapeHtml(t('close'))}">
          <span class="material-icons" aria-hidden="true">close</span>
        </button>
      </div>
      <div class="tag-picker__error" role="alert" hidden></div>
      ${
        available.length
          ? `<div class="tag-picker__label">${escapeHtml(t('cloud.chooseTag'))}</div>
             <div class="tag-picker__list">
               ${available
                 .map(
                   (tag) => `<button type="button" class="tag-picker__option" data-pick="${escapeHtml(tag.id)}">
                       ${tagChip(tag)}
                     </button>`
                 )
                 .join('')}
             </div>`
          : `<p class="tag-picker__empty">${escapeHtml(catalog.length ? t('cloud.allTagsUsed') : t('cloud.noTagsYet'))}</p>`
      }
      <form class="tag-picker__new" novalidate>
        <div class="tag-picker__label">${escapeHtml(t('cloud.newTag'))}</div>
        <input type="text" class="tag-picker__name" maxlength="40" autocomplete="off"
               placeholder="${escapeHtml(t('cloud.tagNamePlaceholder'))}"
               aria-label="${escapeHtml(t('cloud.tagName'))}" />
        ${swatches(fresh)}
        <button type="submit" class="btn btn-primary tag-picker__create">
          <span class="material-icons" aria-hidden="true">add</span>
          <span>${escapeHtml(t('cloud.createAndAdd'))}</span>
        </button>
      </form>
    </div>
  `;
  document.body.appendChild(root);
  open = root;
  document.addEventListener('keydown', onKey, true);

  const errorBox = root.querySelector('.tag-picker__error');
  const showError = (err) => {
    errorBox.textContent = (err && err.message) || String(err);
    errorBox.hidden = false;
  };
  const busy = (on) => root.querySelectorAll('button, input').forEach((b) => (b.disabled = on));
  const color = wireSwatches(root.querySelector('.tag-picker__new'));

  root.addEventListener('click', async (event) => {
    if (event.target === root || event.target.closest('[data-close]')) {
      closeTagPicker();
      return;
    }
    const option = event.target.closest('[data-pick]');
    if (!option) return;
    const tag = available.find((x) => x.id === option.getAttribute('data-pick'));
    if (!tag) return;
    busy(true);
    try {
      await onPick(tag);
      closeTagPicker();
    } catch (err) {
      busy(false);
      showError(err);
    }
  });

  root.querySelector('.tag-picker__new').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = root.querySelector('.tag-picker__name');
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    // Creating a tag whose name already exists would leave two "Asmaa"s that
    // cannot be told apart; reuse the one that is there.
    const existing = catalog.find((tag) => tag.name.trim().toLowerCase() === name.toLowerCase());
    busy(true);
    try {
      if (existing) await onPick(existing);
      else await onCreate({ name, color: color() });
      closeTagPicker();
    } catch (err) {
      busy(false);
      showError(err);
    }
  });

  const first = root.querySelector('[data-pick]') || root.querySelector('.tag-picker__name');
  if (first) setTimeout(() => first.focus(), 30);
}

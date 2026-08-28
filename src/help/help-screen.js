// The field guide screen.
//
// Replaces what used to be a six-line keyboard-shortcut dialog. Renders from
// help-content.js so the guide is edited as data, not markup.
//
// Built for a phone first: one column, tabs that scroll sideways, and a search
// box — a surveyor standing over an open manhole wants one answer, not a
// document. On a wide screen the same content lays out in two columns with the
// sections as a side rail.

import { escapeHtml } from '../dom/dom-utils.js';
import { HELP_SECTIONS, SHORTCUTS, FIGURES } from './help-content.js';
import './help.css';

let root = null;
let activeSection = HELP_SECTIONS[0].id;
let query = '';

const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

/* ---------------------------------------------------------------- rendering */

function renderTable(table) {
  return `
    <div class="help-table-wrap">
      <table class="help-table">
        <thead><tr>${table.head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${table.rows
          .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody>
      </table>
    </div>`;
}

function renderCard(card) {
  // A question/answer entry reads differently from a reference card.
  if (card.q) {
    return `
      <details class="help-qa">
        <summary>
          <span class="help-qa__q">${escapeHtml(card.q)}</span>
          <span class="material-icons help-qa__chev">expand_more</span>
        </summary>
        <div class="help-qa__a">${escapeHtml(card.a)}</div>
      </details>`;
  }
  const parts = [];
  if (card.title) parts.push(`<h3 class="help-card__title">${escapeHtml(card.title)}</h3>`);
  if (card.figure && FIGURES[card.figure]) {
    parts.push(`<div class="help-figure">${FIGURES[card.figure]}</div>`);
  }
  if (card.body) parts.push(`<p class="help-card__body">${escapeHtml(card.body)}</p>`);
  if (card.steps) {
    parts.push(
      `<ol class="help-steps">${card.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    );
  }
  if (card.list) {
    parts.push(
      `<ul class="help-list">${card.list.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    );
  }
  if (card.table) parts.push(renderTable(card.table));
  if (card.note) {
    parts.push(
      `<p class="help-note"><span class="material-icons">lightbulb</span>${escapeHtml(card.note)}</p>`
    );
  }
  return `<article class="help-card${card.tone === 'warn' ? ' help-card--warn' : ''}">${parts.join('')}</article>`;
}

/** Everything a card holds, flattened, so search can look at all of it. */
function cardText(card) {
  const bits = [card.title, card.body, card.note, card.q, card.a];
  if (card.steps) bits.push(card.steps.join(' '));
  if (card.list) bits.push(card.list.join(' '));
  if (card.table) bits.push(card.table.head.join(' '), card.table.rows.map((r) => r.join(' ')).join(' '));
  return bits.filter(Boolean).join(' ').toLowerCase();
}

function matchingSections() {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_SECTIONS;
  return HELP_SECTIONS.map((s) => ({ ...s, cards: s.cards.filter((c) => cardText(c).includes(q)) }))
    .filter((s) => s.cards.length);
}

function renderBody() {
  const sections = matchingSections();
  const body = root.querySelector('#helpBody');
  const nav = root.querySelector('#helpNav');

  if (!sections.length) {
    body.innerHTML = `<div class="help-empty">
        <span class="material-icons">search_off</span>
        <p>לא נמצא כלום עבור "${escapeHtml(query)}"</p>
      </div>`;
    nav.innerHTML = '';
    return;
  }

  // While searching, show every match at once rather than hiding results
  // behind a tab the surveyor would have to guess.
  const searching = Boolean(query.trim());
  if (!searching && !sections.some((s) => s.id === activeSection)) activeSection = sections[0].id;

  nav.innerHTML = sections
    .map(
      (s) => `<button class="help-tab${!searching && s.id === activeSection ? ' is-active' : ''}"
                data-section="${escapeHtml(s.id)}">
                 <span class="material-icons">${escapeHtml(s.icon || 'article')}</span>
                 <span>${escapeHtml(s.title)}</span>
               </button>`
    )
    .join('');

  const visible = searching ? sections : sections.filter((s) => s.id === activeSection);
  body.innerHTML =
    visible
      .map(
        (s) => `<section class="help-section">
        <header class="help-section__head">
          <h2>${escapeHtml(s.title)}</h2>
          ${s.intro && !searching ? `<p>${escapeHtml(s.intro)}</p>` : ''}
        </header>
        ${s.cards.map(renderCard).join('')}
      </section>`
      )
      .join('') +
    (!searching && activeSection === 'start' && isDesktop()
      ? `<article class="help-card help-card--muted">
           <h3 class="help-card__title">קיצורי מקלדת</h3>
           <div class="help-shortcuts">${SHORTCUTS.map(
             ([k, v]) => `<div><kbd>${escapeHtml(k)}</kbd><span>${escapeHtml(v)}</span></div>`
           ).join('')}</div>
         </article>`
      : '');

  body.scrollTop = 0;
}

function build() {
  const el = document.createElement('div');
  el.className = 'help-screen';
  el.id = 'helpScreen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'מדריך שדה');
  el.innerHTML = `
    <div class="help-shell">
      <header class="help-head">
        <div class="help-head__title">
          <span class="material-icons">menu_book</span>
          <h1>מדריך שדה</h1>
        </div>
        <button class="btn btn-ghost help-close" id="helpCloseBtn" aria-label="סגירה">
          <span class="material-icons">close</span>
        </button>
      </header>
      <div class="help-search">
        <span class="material-icons">search</span>
        <input id="helpSearch" type="search" placeholder="חיפוש — למשל: כיוון, מפל, Float" dir="auto" />
      </div>
      <nav class="help-nav" id="helpNav"></nav>
      <div class="help-body" id="helpBody"></div>
    </div>`;
  return el;
}

/* ------------------------------------------------------------------- wiring */

function wire() {
  root.querySelector('#helpCloseBtn').addEventListener('click', closeHelp);
  root.addEventListener('click', (e) => { if (e.target === root) closeHelp(); });

  root.querySelector('#helpNav').addEventListener('click', (e) => {
    const tab = e.target.closest('.help-tab');
    if (!tab) return;
    activeSection = tab.getAttribute('data-section');
    renderBody();
  });

  const search = root.querySelector('#helpSearch');
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { query = search.value; renderBody(); }, 120);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root && root.classList.contains('is-open')) closeHelp();
  });
}

export function openHelp() {
  if (!root) {
    root = build();
    document.body.appendChild(root);
    wire();
  }
  query = '';
  const search = root.querySelector('#helpSearch');
  if (search) search.value = '';
  renderBody();
  root.classList.add('is-open');
  // Stop the canvas behind the guide from scrolling with it.
  document.body.classList.add('help-open');
}

export function closeHelp() {
  if (!root) return;
  root.classList.remove('is-open');
  document.body.classList.remove('help-open');
}

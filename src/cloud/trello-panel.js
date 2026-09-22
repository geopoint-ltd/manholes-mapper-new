// The office panel's Trello tab, and the "add to Trello" action it enables.
//
// Setup is three steps, shown as a numbered list so it is obvious what is done
// and what is next:
//   1. the API key — once for the whole office, stored in settings/trello;
//   2. connecting your own Trello account — once per admin, per browser;
//   3. the board and list new cards go to — once for the whole office.

import { escapeHtml } from '../dom/dom-utils.js';
import { watchTrelloSettings, saveTrelloSettings } from '../firebase/settings.js';
import {
  getToken,
  forgetToken,
  connectTrello,
  disconnectTrello,
  getMe,
  listBoards,
  listLists,
  createCard,
  attachFile,
} from './trello.js';
import { buildSketchZip, sketchDisplayName } from './sketch-zip.js';

function t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
}

let settings = {};
let settingsUnsub = null;
let host = null;
let me = null;
let boards = null;
let lists = null;
let pickedBoard = null;
let loading = false;
/** boardId -> its lists, so switching back and forth in the picker is instant. */
const listCache = new Map();
/** Where this admin last sent a card. Per browser: it is a personal habit. */
const LAST_TARGET_KEY = 'trello.lastTarget';

/** Start following the office's Trello settings. Called when the panel opens. */
export function startTrello() {
  if (settingsUnsub) return;
  watchTrelloSettings((next) => {
    settings = next || {};
    render();
  })
    .then((unsub) => {
      settingsUnsub = unsub;
    })
    .catch((err) => console.warn('trello settings unavailable', err && err.message));
}

export function stopTrello() {
  if (settingsUnsub) {
    try {
      settingsUnsub();
    } catch (_) {}
  }
  settingsUnsub = null;
  host = null;
}

/**
 * Whether a card can be created right now, from this browser. The office
 * default destination is optional — each card picks its own board and list.
 */
export function isTrelloReady() {
  return Boolean(settings.apiKey && getToken());
}

/** Draw the tab into this container. */
export function renderTrello(container) {
  host = container;
  render();
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function render() {
  if (!host) return;
  const key = settings.apiKey || '';
  const token = getToken();
  const origin = window.location.origin;
  const boardId = pickedBoard || settings.boardId || '';
  const stepState = (done, open) => (done ? 'is-done' : open ? 'is-current' : 'is-locked');

  const account = token
    ? `<div class="trello-row">
         <span class="trello-me">
           <span class="material-icons" aria-hidden="true">check_circle</span>
           ${escapeHtml(me ? String(t('cloud.trelloConnectedAs')).replace('{name}', me.fullName || me.username) : t('cloud.loading'))}
         </span>
         <button type="button" class="btn trello-btn" data-trello="disconnect">${escapeHtml(t('cloud.trelloDisconnect'))}</button>
       </div>`
    : `<button type="button" class="btn btn-primary trello-btn" data-trello="connect" ${key ? '' : 'disabled'}>
         <span class="material-icons" aria-hidden="true">link</span>
         <span>${escapeHtml(t('cloud.trelloConnect'))}</span>
       </button>`;

  let target = '';
  if (token) {
    const boardOptions = boards
      ? [option('', t('cloud.choose'), !boardId)].concat(boards.map((b) => option(b.id, b.name, b.id === boardId))).join('')
      : option('', t('cloud.loading'), true);
    const listOptions = lists
      ? [option('', t('cloud.choose'), !settings.listId)]
          .concat(lists.map((l) => option(l.id, l.name, l.id === settings.listId && boardId === settings.boardId)))
          .join('')
      : option('', boardId ? t('cloud.loading') : t('cloud.choose'), true);
    target = `
      <div class="trello-row trello-row--wrap">
        <label class="cloud-field trello-select">
          <span>${escapeHtml(t('cloud.trelloBoard'))}</span>
          <select data-trello="board" ${boards ? '' : 'disabled'}>${boardOptions}</select>
        </label>
        <label class="cloud-field trello-select">
          <span>${escapeHtml(t('cloud.trelloList'))}</span>
          <select data-trello="list" ${lists ? '' : 'disabled'}>${listOptions}</select>
        </label>
        <button type="button" class="btn btn-primary trello-btn" data-trello="save-target">${escapeHtml(t('save'))}</button>
      </div>
      ${
        settings.listId
          ? `<p class="trello-target">
               <span class="material-icons" aria-hidden="true">arrow_back</span>
               ${escapeHtml(
                 String(t('cloud.trelloTarget'))
                   .replace('{board}', settings.boardName || '')
                   .replace('{list}', settings.listName || '')
               )}
             </p>`
          : ''
      }`;
  }

  host.innerHTML = `
    <ol class="trello-steps">
      <li class="trello-step ${stepState(Boolean(key), true)}">
        <div class="trello-step__head"><span class="trello-step__num">1</span>${escapeHtml(t('cloud.trelloStepKey'))}</div>
        <p class="trello-step__help">
          ${escapeHtml(t('cloud.trelloKeyHelp'))}
          <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer" dir="ltr">trello.com/power-ups/admin</a>
        </p>
        <p class="trello-step__help">${escapeHtml(t('cloud.trelloOriginHelp'))}</p>
        <div class="trello-origin">
          <code dir="ltr">${escapeHtml(origin)}</code>
          <button type="button" class="cloud-field__icon" data-trello="copy-origin"
                  title="${escapeHtml(t('cloud.copy'))}" aria-label="${escapeHtml(t('cloud.copy'))}">
            <span class="material-icons" aria-hidden="true">content_copy</span>
          </button>
        </div>
        <form class="trello-row" data-trello="key-form" novalidate>
          <input class="trello-input" type="text" dir="ltr" autocomplete="off" spellcheck="false"
                 value="${escapeHtml(key)}" placeholder="API key" aria-label="${escapeHtml(t('cloud.trelloStepKey'))}" />
          <button type="submit" class="btn btn-primary trello-btn">${escapeHtml(t('save'))}</button>
        </form>
      </li>
      <li class="trello-step ${stepState(Boolean(token), Boolean(key))}">
        <div class="trello-step__head"><span class="trello-step__num">2</span>${escapeHtml(t('cloud.trelloStepAccount'))}</div>
        ${account}
        <p class="trello-step__help">${escapeHtml(t('cloud.trelloAccountHelp'))}</p>
      </li>
      <li class="trello-step ${stepState(Boolean(settings.listId), Boolean(token))}">
        <div class="trello-step__head"><span class="trello-step__num">3</span>${escapeHtml(t('cloud.trelloStepTarget'))}</div>
        <p class="trello-step__help">${escapeHtml(t('cloud.trelloTargetHelp'))}</p>
        ${target}
      </li>
    </ol>
  `;
  wire();
  if (token && !me && !loading) loadAccount();
}

async function loadAccount() {
  const key = settings.apiKey;
  const token = getToken();
  if (!key || !token) return;
  loading = true;
  try {
    me = await getMe(key, token);
    boards = await listBoards(key, token);
    const boardId = pickedBoard || settings.boardId;
    if (boardId) lists = await listLists(key, token, boardId);
  } catch (err) {
    if (err && err.code === 401) {
      // Revoked in Trello, or the key changed: start the connection again.
      forgetToken();
      me = null;
      boards = null;
      lists = null;
      toast(t('cloud.trelloAuthExpired'));
    } else {
      toast((err && err.message) || String(err));
    }
  } finally {
    loading = false;
    render();
  }
}

function wire() {
  host.querySelector('[data-trello="key-form"]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = event.currentTarget.querySelector('input').value.trim();
    if (!/^[A-Za-z0-9]{20,64}$/.test(value)) {
      toast(t('cloud.trelloKeyInvalid'));
      return;
    }
    try {
      await saveTrelloSettings({ apiKey: value });
      toast(t('cloud.saved'));
    } catch (err) {
      toast((err && err.message) || String(err));
    }
  });

  const copy = host.querySelector('[data-trello="copy-origin"]');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast(t('cloud.copied'));
    } catch (_) {}
  });

  const connect = host.querySelector('[data-trello="connect"]');
  if (connect) {
    connect.addEventListener('click', async () => {
      try {
        await connectTrello(settings.apiKey, t('appTitle'));
        me = null;
        render();
      } catch (err) {
        const code = err && err.message;
        if (code === 'popup-blocked') toast(t('cloud.trelloPopupBlocked'));
        else if (code === 'trello-denied') toast(t('cloud.trelloDenied'));
        // Closing the window is a choice, not an error.
      }
    });
  }

  const disconnect = host.querySelector('[data-trello="disconnect"]');
  if (disconnect) {
    disconnect.addEventListener('click', async () => {
      await disconnectTrello(settings.apiKey);
      me = null;
      boards = null;
      lists = null;
      listCache.clear();
      pickedBoard = null;
      render();
    });
  }

  const boardSelect = host.querySelector('[data-trello="board"]');
  if (boardSelect) {
    boardSelect.addEventListener('change', async () => {
      pickedBoard = boardSelect.value || null;
      lists = null;
      render();
      if (!pickedBoard) return;
      try {
        lists = await listLists(settings.apiKey, getToken(), pickedBoard);
      } catch (err) {
        toast((err && err.message) || String(err));
      }
      render();
    });
  }

  const save = host.querySelector('[data-trello="save-target"]');
  if (save) {
    save.addEventListener('click', async () => {
      const board = host.querySelector('[data-trello="board"]');
      const list = host.querySelector('[data-trello="list"]');
      if (!board.value || !list.value) {
        toast(t('cloud.trelloChooseBoth'));
        return;
      }
      try {
        await saveTrelloSettings({
          boardId: board.value,
          boardName: board.options[board.selectedIndex].textContent,
          listId: list.value,
          listName: list.options[list.selectedIndex].textContent,
        });
        pickedBoard = null;
        toast(t('cloud.saved'));
      } catch (err) {
        toast((err && err.message) || String(err));
      }
    });
  }
}

/* ---------------- the card ---------------- */

function manholeRange(nodes) {
  const ids = (nodes || []).map((n) => Number(n && n.id)).filter((n) => Number.isFinite(n));
  if (!ids.length) return '';
  const min = Math.min(...ids);
  const max = Math.max(...ids);
  return min === max ? String(min) : `${min}–${max}`;
}

function describe(sketch, tags, when) {
  const nodes = Array.isArray(sketch.nodes) ? sketch.nodes : [];
  const nodeCount = Number(sketch.nodeCount) || nodes.length;
  const edgeCount = Number(sketch.edgeCount) || (Array.isArray(sketch.edges) ? sketch.edges.length : 0);
  const range = manholeRange(nodes);
  return [
    `**${t('cloud.trelloCardWorker')}:** ${sketch.ownerEmail || ''}`,
    `**${t('cloud.trelloCardSent')}:** ${when}`,
    `**${t('cloud.nodes')}:** ${nodeCount}${range ? ` (${range})` : ''}`,
    `**${t('cloud.lines')}:** ${edgeCount}`,
    tags.length ? `**${t('cloud.trelloCardTags')}:** ${tags.map((x) => x.name).join(', ')}` : null,
    '',
    t('cloud.trelloCardZip'),
    '',
    `— ${t('appTitle')} · ${sketch.id}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * Put one received sketch on the office's Trello list.
 *
 * onCardCreated runs the moment the card exists, before the ZIP upload: that is
 * when the office should see it, and when the app should record it. Waiting for
 * the upload — and for the database to confirm the record — is what left the
 * button spinning over a card that was already there.
 *
 * @param {{onCardCreated?: (card: {id: string, url: string}) => void}} [hooks]
 * @returns {Promise<{id: string, url: string, attachFailed: boolean}>}
 */
export async function sendSketchToTrello(sketch, tagCatalog, when, hooks = {}) {
  const key = settings.apiKey;
  const token = getToken();
  if (!isTrelloReady()) throw new Error('trello-not-ready');
  const destination = hooks.target || { boardId: settings.boardId, listId: settings.listId };
  if (!destination.boardId || !destination.listId) throw new Error('trello-no-destination');
  const byId = new Map((tagCatalog || []).map((tag) => [tag.id, tag]));
  const tags = (sketch.tags || []).map((id) => byId.get(id)).filter(Boolean);
  const adminConfig = typeof window.getAdminConfig === 'function' ? window.getAdminConfig() : null;
  const zip = await buildSketchZip(sketch, adminConfig, t);
  const owner = String(sketch.ownerEmail || '').split('@')[0];
  let card;
  try {
    card = await createCard({
      key,
      token,
      boardId: destination.boardId,
      listId: destination.listId,
      // Several sketches share a date; the worker's name tells their cards apart.
      name: owner ? `${sketchDisplayName(sketch)} · ${owner}` : sketchDisplayName(sketch),
      desc: describe(sketch, tags, when),
      labels: tags.map((tag) => ({ name: tag.name, color: tag.color })),
    });
  } catch (err) {
    if (err && err.code === 401) {
      forgetToken();
      me = null;
      render();
      throw new Error(t('cloud.trelloAuthExpired'));
    }
    throw err;
  }
  if (typeof hooks.onCardCreated === 'function') {
    try {
      hooks.onCardCreated(card);
    } catch (_) {}
  }
  const attached = zip && zip.blob
    ? await attachFile({ key, token, cardId: card.id, blob: zip.blob, filename: zip.filename })
    : true;
  return { ...card, attachFailed: !attached };
}

/* ---------------- choosing where each card goes ---------------- */

function readLastTarget() {
  try {
    return JSON.parse(localStorage.getItem(LAST_TARGET_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function rememberTarget(target) {
  try {
    localStorage.setItem(LAST_TARGET_KEY, JSON.stringify(target));
  } catch (_) {}
}

async function boardsForPicker() {
  if (!boards) boards = await listBoards(settings.apiKey, getToken());
  return boards;
}

async function listsForPicker(boardId) {
  if (!listCache.has(boardId)) listCache.set(boardId, await listLists(settings.apiKey, getToken(), boardId));
  return listCache.get(boardId);
}

/**
 * Ask which board and list this card goes to.
 *
 * Pre-selected with where this admin sent the last card — most cards go where
 * the last one went, so that is one click — or, the first time, the office
 * default from the Trello tab.
 *
 * @returns {Promise<{boardId: string, boardName: string, listId: string, listName: string} | null>}
 *   null when cancelled.
 */
export function chooseTrelloDestination(sketch) {
  return new Promise((resolve) => {
    const last = readLastTarget();
    const start = last && last.boardId
      ? last
      : { boardId: settings.boardId || '', listId: settings.listId || '' };
    const owner = String(sketch.ownerEmail || '').split('@')[0];
    const cardName = owner ? `${sketchDisplayName(sketch)} · ${owner}` : sketchDisplayName(sketch);

    const root = document.createElement('div');
    root.className = 'tag-picker trello-picker';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'trelloPickTitle');
    root.innerHTML = `
      <div class="tag-picker__card">
        <div class="tag-picker__head">
          <h3 id="trelloPickTitle">${escapeHtml(t('cloud.trelloChooseTitle'))}</h3>
          <button type="button" class="tag-picker__close" data-close aria-label="${escapeHtml(t('close'))}">
            <span class="material-icons" aria-hidden="true">close</span>
          </button>
        </div>
        <p class="trello-picker__card-name">
          <span class="material-icons" aria-hidden="true">view_week</span>
          <span dir="auto">${escapeHtml(cardName)}</span>
        </p>
        <div class="tag-picker__error" role="alert" hidden></div>
        <label class="cloud-field trello-select">
          <span>${escapeHtml(t('cloud.trelloBoard'))}</span>
          <select data-pick="board" disabled>${option('', t('cloud.loading'), true)}</select>
        </label>
        <label class="cloud-field trello-select">
          <span>${escapeHtml(t('cloud.trelloList'))}</span>
          <select data-pick="list" disabled>${option('', t('cloud.loading'), true)}</select>
        </label>
        <div class="trello-picker__actions">
          <button type="button" class="btn btn-primary trello-btn" data-go disabled>
            <span class="material-icons" aria-hidden="true">add</span>
            <span>${escapeHtml(t('cloud.trelloCreateCard'))}</span>
          </button>
          <button type="button" class="btn trello-btn" data-close>${escapeHtml(t('cancel'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const boardSel = root.querySelector('[data-pick="board"]');
    const listSel = root.querySelector('[data-pick="list"]');
    const go = root.querySelector('[data-go]');
    const errorBox = root.querySelector('.tag-picker__error');
    const showError = (err) => {
      if (err && err.code === 401) {
        forgetToken();
        me = null;
        render();
        errorBox.textContent = t('cloud.trelloAuthExpired');
      } else {
        errorBox.textContent = (err && err.message) || String(err);
      }
      errorBox.hidden = false;
    };

    function onKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish(null);
      }
    }
    function finish(value) {
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(value);
    }
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('click', (event) => {
      if (event.target === root || event.target.closest('[data-close]')) finish(null);
    });

    async function fillLists(boardId, preferListId) {
      listSel.disabled = true;
      go.disabled = true;
      listSel.innerHTML = option('', t('cloud.loading'), true);
      try {
        const found = await listsForPicker(boardId);
        if (!found.length) {
          listSel.innerHTML = option('', t('cloud.trelloNoLists'), true);
          return;
        }
        const pick = found.some((l) => l.id === preferListId) ? preferListId : found[0].id;
        listSel.innerHTML = found.map((l) => option(l.id, l.name, l.id === pick)).join('');
        listSel.disabled = false;
        go.disabled = false;
      } catch (err) {
        showError(err);
      }
    }

    (async () => {
      try {
        const found = await boardsForPicker();
        if (!found.length) {
          boardSel.innerHTML = option('', t('cloud.trelloNoBoards'), true);
          return;
        }
        const boardId = found.some((b) => b.id === start.boardId) ? start.boardId : found[0].id;
        boardSel.innerHTML = found.map((b) => option(b.id, b.name, b.id === boardId)).join('');
        boardSel.disabled = false;
        await fillLists(boardId, start.listId);
        go.focus();
      } catch (err) {
        showError(err);
      }
    })();

    boardSel.addEventListener('change', () => fillLists(boardSel.value, null));
    go.addEventListener('click', () => {
      if (!boardSel.value || !listSel.value) return;
      const target = {
        boardId: boardSel.value,
        boardName: boardSel.options[boardSel.selectedIndex].textContent,
        listId: listSel.value,
        listName: listSel.options[listSel.selectedIndex].textContent,
      };
      rememberTarget(target);
      finish(target);
    });
  });
}

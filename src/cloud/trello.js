// Talking to Trello, straight from the office's browser.
//
// Each admin connects their own Trello account once. Trello hands back a token,
// and it is kept only in that browser's local storage — never in the repo, the
// build, or the database. The code of this app is public and runs in every
// browser that opens it; a token baked into it would give anyone full access to
// every board. The API key, by contrast, only identifies the app and is safe to
// share, so it lives in the office's settings where every admin can use it.
//
// api.trello.com allows calls from browsers (CORS), so no server is involved.

const API = 'https://api.trello.com/1';
const AUTHORIZE = 'https://trello.com/1/authorize';
const TOKEN_KEY = 'trello.token';

/** The app's tag colours, as the nearest of Trello's fixed label colours. */
const LABEL_COLORS = {
  '#2563eb': 'blue',
  '#16a34a': 'green',
  '#d97706': 'orange',
  '#dc2626': 'red',
  '#7c3aed': 'purple',
  '#db2777': 'pink',
  '#0d9488': 'sky',
  '#475569': 'black',
};

export function trelloLabelColor(hex) {
  return LABEL_COLORS[String(hex || '').toLowerCase()] || null;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

function saveToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (_) {}
}

export function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
}

/**
 * Call the Trello API.
 *
 * Writes go as a form-encoded body rather than JSON: that keeps them "simple"
 * requests, with no CORS preflight, and keeps a long card description out of
 * the URL.
 */
async function api(method, path, { key, token, query = {}, form, body } = {}) {
  const url = new URL(API + path);
  Object.entries({ ...query, key, token }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  let payload = body;
  if (form) {
    payload = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') payload.set(k, String(v));
    });
  }
  const res = await fetch(url, { method, body: payload });
  if (res.status === 401) {
    const err = new Error('trello-unauthorized');
    err.code = 401;
    throw err;
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/**
 * Ask Trello for a token, in a popup, and keep it on this device.
 *
 * Trello posts the token back to this window. That only works for an origin
 * listed under "Allowed origins" on the Power-Up that owns the API key —
 * without it, Trello refuses the return address.
 */
export function connectTrello(apiKey, appName) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      expiration: 'never',
      name: appName,
      scope: 'read,write',
      response_type: 'token',
      key: apiKey,
      callback_method: 'postMessage',
      return_url: window.location.origin,
    });
    const popup = window.open(`${AUTHORIZE}?${params}`, 'trello-auth', 'width=560,height=720');
    if (!popup) {
      reject(new Error('popup-blocked'));
      return;
    }
    let timer = null;
    const finish = (fn) => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      fn();
    };
    function onMessage(event) {
      if (event.origin !== 'https://trello.com' || event.source !== popup) return;
      const token = typeof event.data === 'string' ? event.data.trim() : '';
      try {
        popup.close();
      } catch (_) {}
      if (/^[A-Za-z0-9]{32,256}$/.test(token)) {
        finish(() => {
          saveToken(token);
          resolve(token);
        });
      } else {
        finish(() => reject(new Error('trello-denied')));
      }
    }
    window.addEventListener('message', onMessage);
    timer = setInterval(() => {
      if (popup.closed) finish(() => reject(new Error('trello-cancelled')));
    }, 500);
  });
}

/**
 * Disconnect: revoke the token at Trello, then forget it here. Forgetting
 * alone would leave a working token behind in Trello's list of apps.
 */
export async function disconnectTrello(apiKey) {
  const token = getToken();
  forgetToken();
  if (!token || !apiKey) return;
  try {
    await api('DELETE', `/tokens/${encodeURIComponent(token)}`, { key: apiKey, token });
  } catch (_) {
    // Already revoked or expired; either way it no longer works.
  }
}

export function getMe(key, token) {
  return api('GET', '/members/me', { key, token, query: { fields: 'fullName,username' } });
}

export function listBoards(key, token) {
  return api('GET', '/members/me/boards', { key, token, query: { filter: 'open', fields: 'name' } });
}

export function listLists(key, token, boardId) {
  return api('GET', `/boards/${encodeURIComponent(boardId)}/lists`, {
    key,
    token,
    query: { filter: 'open', fields: 'name' },
  });
}

/**
 * Find the board's label with this name, or make it. A tag becomes the same
 * label every time, rather than a new "Asmaa" label per card.
 */
async function ensureLabels(key, token, boardId, labels) {
  if (!labels.length) return [];
  const existing = await api('GET', `/boards/${encodeURIComponent(boardId)}/labels`, {
    key,
    token,
    query: { fields: 'name,color', limit: 1000 },
  });
  const ids = [];
  for (const label of labels) {
    const name = String(label.name || '').trim();
    if (!name) continue;
    const hit = (existing || []).find((x) => String(x.name || '').trim() === name);
    if (hit) {
      ids.push(hit.id);
      continue;
    }
    const made = await api('POST', '/labels', {
      key,
      token,
      form: { idBoard: boardId, name, color: trelloLabelColor(label.color) || 'null' },
    });
    ids.push(made.id);
  }
  return ids;
}

/**
 * Create a card for a sketch: title, description, labels, and the ZIP.
 *
 * The card is created before the attachment is uploaded, so a failed upload
 * leaves a usable card rather than nothing; the caller is told, and the office
 * can drag the ZIP onto the card by hand.
 *
 * @returns {Promise<{id: string, url: string, attachFailed: boolean}>}
 */
export async function createSketchCard({ key, token, boardId, listId, name, desc, labels = [], zip }) {
  const idLabels = await ensureLabels(key, token, boardId, labels);
  const card = await api('POST', '/cards', {
    key,
    token,
    form: { idList: listId, name, desc, pos: 'top', idLabels: idLabels.join(',') },
  });
  let attachFailed = false;
  if (zip && zip.blob) {
    try {
      const data = new FormData();
      data.append('file', zip.blob, zip.filename);
      data.append('name', zip.filename);
      data.append('mimeType', 'application/zip');
      await api('POST', `/cards/${card.id}/attachments`, { key, token, body: data });
    } catch (_) {
      attachFailed = true;
    }
  }
  return { id: card.id, url: card.shortUrl || card.url, attachFailed };
}

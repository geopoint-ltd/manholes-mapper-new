// The sign-in gate.
//
// Shown only when Firebase is configured and nobody is signed in. It covers the
// app rather than replacing it, so the canvas underneath keeps its state and a
// dropped session does not cost a surveyor their work.
//
// Built for a phone held outdoors: 50px targets, 16px text so iOS does not zoom
// the page on focus, a password eye because typing blind with gloves fails, and
// the last email remembered so a surveyor usually types only the password.

import { escapeHtml } from '../dom/dom-utils.js';
import { signIn, describeAuthError } from '../firebase/auth.js';

// Each surveyor has their own phone, so remembering the address costs nothing
// and saves typing it on every sign-in. Never the password.
const LAST_EMAIL_KEY = 'cloud.lastEmail';

let el = null;

function t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

function readLastEmail() {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) || '';
  } catch (_) {
    return '';
  }
}

function rememberEmail(email) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, String(email).trim());
  } catch (_) {}
}

function build() {
  const root = document.createElement('div');
  root.className = 'cloud-login';
  root.id = 'cloudLogin';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'cloudLoginTitle');
  root.innerHTML = `
    <form class="cloud-login__card" id="cloudLoginForm" novalidate>
      <div class="cloud-login__brand">
        <img src="./geopoint_logo.png" alt="Geopoint" />
      </div>
      <div class="cloud-login__app">${escapeHtml(t('appTitle'))}</div>
      <h2 class="cloud-login__title" id="cloudLoginTitle">${escapeHtml(t('cloud.signInTitle'))}</h2>
      <p class="cloud-login__subtitle">${escapeHtml(t('cloud.signInSubtitle'))}</p>

      <div class="cloud-login__offline" id="cloudLoginOffline" hidden>
        <span class="material-icons" aria-hidden="true">wifi_off</span>
        <span>${escapeHtml(t('cloud.offlineHint'))}</span>
      </div>
      <div class="cloud-login__error" id="cloudLoginError" role="alert"></div>

      <div class="cloud-login__field">
        <label for="cloudEmail">${escapeHtml(t('cloud.email'))}</label>
        <div class="cloud-login__control">
          <span class="material-icons" aria-hidden="true">mail</span>
          <input id="cloudEmail" type="email" autocomplete="username" inputmode="email"
                 autocapitalize="none" spellcheck="false" dir="ltr"
                 placeholder="name@geopoint.me" required />
        </div>
      </div>

      <div class="cloud-login__field">
        <label for="cloudPassword">${escapeHtml(t('cloud.password'))}</label>
        <div class="cloud-login__control">
          <span class="material-icons" aria-hidden="true">lock</span>
          <input id="cloudPassword" type="password" autocomplete="current-password"
                 autocapitalize="none" spellcheck="false" dir="ltr" required />
          <button type="button" class="cloud-login__reveal" id="cloudReveal"
                  aria-pressed="false"
                  aria-label="${escapeHtml(t('cloud.showPassword'))}"
                  title="${escapeHtml(t('cloud.showPassword'))}">
            <span class="material-icons" aria-hidden="true">visibility</span>
          </button>
        </div>
      </div>

      <button type="submit" class="btn btn-primary cloud-login__submit" id="cloudLoginSubmit">
        <span class="material-icons" aria-hidden="true">login</span>
        <span class="cloud-login__submit-label">${escapeHtml(t('cloud.signIn'))}</span>
      </button>

      <p class="cloud-login__help">${escapeHtml(t('cloud.contactOffice'))}</p>
    </form>
    <p class="cloud-login__footer">Geopoint · ${escapeHtml(t('appTitle'))}</p>
  `;
  return root;
}

function showError(message) {
  const box = el && el.querySelector('#cloudLoginError');
  if (!box) return;
  box.textContent = message || '';
  box.classList.toggle('is-visible', Boolean(message));
}

function setBusy(busy) {
  const submit = el && el.querySelector('#cloudLoginSubmit');
  if (!submit) return;
  submit.disabled = Boolean(busy);
  submit.classList.toggle('is-busy', Boolean(busy));
  submit.setAttribute('aria-busy', busy ? 'true' : 'false');
  const icon = submit.querySelector('.material-icons');
  const label = submit.querySelector('.cloud-login__submit-label');
  if (icon) icon.textContent = busy ? 'autorenew' : 'login';
  if (label) label.textContent = busy ? t('cloud.signingIn') : t('cloud.signIn');
}

/** Sign-in needs the network; say so up front instead of after a failed try. */
function syncOnlineState() {
  const note = el && el.querySelector('#cloudLoginOffline');
  if (note) note.hidden = navigator.onLine !== false;
}

function wireReveal() {
  const btn = el.querySelector('#cloudReveal');
  const input = el.querySelector('#cloudPassword');
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    const label = show ? t('cloud.hidePassword') : t('cloud.showPassword');
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.querySelector('.material-icons').textContent = show ? 'visibility_off' : 'visibility';
    // Keep the caret where it was, so tapping the eye mid-word does not
    // throw the surveyor back to the start of the field.
    const at = input.selectionStart;
    input.focus();
    try {
      input.setSelectionRange(at, at);
    } catch (_) {}
  });
}

/** Show the sign-in gate. Idempotent. */
export function showLogin() {
  if (!el) {
    el = build();
    document.body.appendChild(el);
    wireReveal();
    window.addEventListener('online', syncOnlineState);
    window.addEventListener('offline', syncOnlineState);

    el.querySelector('#cloudLoginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      const emailInput = el.querySelector('#cloudEmail');
      const passwordInput = el.querySelector('#cloudPassword');
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        showError(t('cloud.errMissing'));
        (email ? passwordInput : emailInput).focus();
        return;
      }
      setBusy(true);
      try {
        await signIn(email, password);
        rememberEmail(email);
        // hideLogin() runs from the auth listener, so the gate only drops once
        // the profile and role are actually known.
      } catch (err) {
        showError(describeAuthError(err, t));
        // Almost always the password that was wrong — put the surveyor back
        // there with it selected, ready to retype.
        passwordInput.focus();
        passwordInput.select();
      } finally {
        setBusy(false);
      }
    });
  }

  el.style.display = 'flex';
  syncOnlineState();
  const emailInput = el.querySelector('#cloudEmail');
  const passwordInput = el.querySelector('#cloudPassword');
  if (emailInput && !emailInput.value) emailInput.value = readLastEmail();
  // Start where the typing actually is: the password, when the email is known.
  const target = emailInput && emailInput.value ? passwordInput : emailInput;
  if (target) setTimeout(() => target.focus(), 50);
}

/** Hide the gate. */
export function hideLogin() {
  if (el) el.style.display = 'none';
}

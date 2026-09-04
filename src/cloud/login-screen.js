// The sign-in gate.
//
// Shown only when Firebase is configured and nobody is signed in. It covers the
// app rather than replacing it, so the canvas underneath keeps its state and a
// dropped session does not cost a surveyor their work.

import { escapeHtml } from '../dom/dom-utils.js';
import { signIn, sendPasswordReset, describeAuthError } from '../firebase/auth.js';

let el = null;

function t(key) {
  return typeof window.t === 'function' ? window.t(key) : key;
}

function build() {
  const root = document.createElement('div');
  root.className = 'cloud-login';
  root.id = 'cloudLogin';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <form class="cloud-login__card" id="cloudLoginForm" novalidate>
      <div class="cloud-login__brand">
        <img src="./geopoint_logo.png" alt="Geopoint" />
      </div>
      <h2 class="cloud-login__title">${escapeHtml(t('cloud.signInTitle'))}</h2>
      <p class="cloud-login__subtitle">${escapeHtml(t('cloud.signInSubtitle'))}</p>
      <div class="cloud-login__error" id="cloudLoginError" role="alert"></div>
      <div class="field">
        <label for="cloudEmail">${escapeHtml(t('cloud.email'))}</label>
        <input id="cloudEmail" type="email" autocomplete="username" inputmode="email"
               dir="ltr" required />
      </div>
      <div class="field">
        <label for="cloudPassword">${escapeHtml(t('cloud.password'))}</label>
        <input id="cloudPassword" type="password" autocomplete="current-password"
               dir="ltr" required />
      </div>
      <button type="submit" class="btn btn-primary btn-full" id="cloudLoginSubmit">
        <span class="material-icons">login</span>
        <span>${escapeHtml(t('cloud.signIn'))}</span>
      </button>
      <button type="button" class="cloud-login__link" id="cloudForgot">${escapeHtml(t('cloud.forgot'))}</button>
    </form>
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
  if (submit) submit.disabled = Boolean(busy);
}

/** Show the sign-in gate. Idempotent. */
export function showLogin() {
  if (!el) {
    el = build();
    document.body.appendChild(el);

    el.querySelector('#cloudLoginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      showError('');
      const email = el.querySelector('#cloudEmail').value;
      const password = el.querySelector('#cloudPassword').value;
      if (!email || !password) {
        showError(t('cloud.errMissing'));
        return;
      }
      setBusy(true);
      try {
        await signIn(email, password);
        // hideLogin() runs from the auth listener, so the gate only drops once
        // the profile and role are actually known.
      } catch (err) {
        showError(describeAuthError(err, t));
      } finally {
        setBusy(false);
      }
    });

    el.querySelector('#cloudForgot').addEventListener('click', async () => {
      const email = el.querySelector('#cloudEmail').value;
      if (!email) {
        showError(t('cloud.errMissingEmail'));
        return;
      }
      try {
        await sendPasswordReset(email);
        showError('');
        if (typeof window.showToast === 'function') window.showToast(t('cloud.resetSent'));
      } catch (err) {
        showError(describeAuthError(err, t));
      }
    });
  }
  el.style.display = 'flex';
  const emailInput = el.querySelector('#cloudEmail');
  if (emailInput && !emailInput.value) setTimeout(() => emailInput.focus(), 50);
}

/** Hide the gate. */
export function hideLogin() {
  if (el) el.style.display = 'none';
}

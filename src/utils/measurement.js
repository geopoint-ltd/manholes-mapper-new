// Shared helpers for pipe depth measures (Tail = outgoing / קו יוצא, Head = incoming / קו נכנס).
// Consolidates the sanitize regex that was duplicated across the edge/node editors,
// and adds a plausibility check.

/**
 * Keep only digits and a single decimal point (allows partial input like "3." while typing).
 * @param {*} raw
 * @returns {string}
 */
export function sanitizeMeasurement(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[^0-9.]/g, '')
    .replace(/\.(?=.*\.)/g, '');
}

/**
 * A manhole is realistically < 10 m deep, so a measure > 10 is almost always a
 * dropped-decimal typo (2.40 typed as "240", 0.68 as "68"). Returns true for such
 * suspicious values so the UI can warn the surveyor. Partial input ("", "3.") is not
 * flagged.
 * @param {*} value
 * @param {number} maxDepth
 * @returns {boolean}
 */
export function isSuspiciousDepth(value, maxDepth = 10) {
  const n = Number(value);
  return Number.isFinite(n) && n > maxDepth;
}

const DEPTH_WARNING_TEXT = '⚠️ עומק גדול מ-10 מ׳ — אולי חסרה נקודה עשרונית?';

/**
 * Show/hide a PERSISTENT inline warning right after a depth input. Unlike a toast it
 * does NOT auto-dismiss: it stays as long as the value is suspicious, is removed the
 * moment the value becomes valid (the input handler calls this on every keystroke),
 * and disappears on its own when the details panel is re-rendered or closed (the
 * warning element lives inside that panel's DOM). Never blocks input — warning only.
 * @param {HTMLElement} inputEl
 * @param {boolean} suspicious
 */
export function setDepthWarning(inputEl, suspicious) {
  if (!inputEl || typeof document === 'undefined') return;
  const next = inputEl.nextElementSibling;
  const existing = next && next.classList && next.classList.contains('depth-warning') ? next : null;
  if (suspicious) {
    if (!existing) {
      const warn = document.createElement('div');
      warn.className = 'depth-warning';
      warn.setAttribute('role', 'alert');
      warn.textContent = DEPTH_WARNING_TEXT;
      inputEl.insertAdjacentElement('afterend', warn);
    }
  } else if (existing) {
    existing.remove();
  }
}

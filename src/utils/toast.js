// Toast utility module. Provides a global-compatible showToast used by legacy code.
// Usage: import './utils/toast.js' early to ensure window.showToast exists.

/**
 * Show a transient toast message at the bottom of the screen.
 * Falls back safely if #toast is missing.
 * @param {string} message
 * @param {number} durationMs
 */
export function showToast(message, durationMs = 1800) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.textContent = String(message);
  toastEl.classList.add('show');
  window.clearTimeout(showToast._timerId);
  showToast._timerId = window.setTimeout(() => {
    toastEl.classList.remove('show');
  }, durationMs);
}

// Provide a global for legacy script references
if (typeof window !== 'undefined') {
  // Only define if not already defined to avoid double-binding during migration
  if (typeof window.showToast !== 'function') {
    window.showToast = showToast;
  }
}

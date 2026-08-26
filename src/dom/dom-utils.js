/**
 * If the element #idInput is focused, commit its change and blur.
 * Safe no-op if element is missing.
 */
export function commitIdInputIfFocused() {
  try {
    const idEl = document.getElementById('idInput');
    if (!idEl) return;
    if (document.activeElement === idEl) {
      idEl.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof idEl.blur === 'function') idEl.blur();
    }
  } catch (_) {}
}


/**
 * Sync CSS variable --header-h with the actual header height, so overlays
 * such as the details drawer can be positioned beneath it.
 */
export function syncHeaderHeightVar() {
  try {
    const header = document.querySelector('header');
    if (!header) return;
    const setVar = () => {
      const h = Math.round(header.getBoundingClientRect().height);
      const newVal = h + 'px';
      // Only write when value actually changes to avoid unnecessary style mutations
      if (document.documentElement.style.getPropertyValue('--header-h') !== newVal) {
        document.documentElement.style.setProperty('--header-h', newVal);
      }
    };
    setVar();
    if (typeof ResizeObserver !== 'undefined') {
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) return;
        if (typeof requestAnimationFrame === 'function') {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            setVar();
          });
        } else {
          // Fallback in environments without rAF
          rafId = setTimeout(() => {
            rafId = 0;
            setVar();
          }, 0);
        }
      });
      ro.observe(header);
    } else {
      window.addEventListener('resize', setVar);
    }
  } catch (_) {}
}


/**
 * Escape a value for safe interpolation into HTML markup, both as element text
 * and inside a double-quoted attribute.
 *
 * Several option labels contain characters that are significant to the HTML
 * parser — most notably the Hebrew material label `פי. וי. סי. לפי ת"י 884`,
 * whose embedded double quote silently truncates any attribute it is dropped
 * into. Always run label/user text through this before building markup.
 *
 * @param {unknown} value
 * @returns {string} HTML-safe text
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

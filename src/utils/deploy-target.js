// Which deployment this build is being served from.
//
// GitHub Pages is the field app. Vercel serves throwaway preview builds, one
// per pull request, so a change can be looked at running before it is merged.
//
// The two must not be mistaken for one another. This is an offline-first PWA:
// left to itself a preview would register a service worker, cache itself on the
// surveyor's phone, and keep serving an unreviewed build from that cache with
// no network involved — while their sketches accumulated under an origin nobody
// is watching and which disappears when the pull request is deleted.

/** Preview deployments are served from *.vercel.app; the field app is not. */
export function isPreviewBuild() {
  try {
    return /(^|\.)vercel\.app$/i.test(window.location.hostname);
  } catch (_) {
    // If the location cannot be read, assume the field app and change nothing.
    return false;
  }
}

/**
 * Mark a preview build on screen, so nobody works a real shift on one by
 * following a link from a pull request.
 */
export function markPreviewBuild() {
  if (!isPreviewBuild()) return;
  try {
    const banner = document.createElement('div');
    banner.id = 'previewBuildBanner';
    banner.setAttribute('role', 'status');
    banner.textContent = 'גרסת בדיקה — לא לשימוש בשטח';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:#b45309', 'color:#fff', 'text-align:center',
      'font:600 13px/1.4 Inter,system-ui,sans-serif', 'padding:4px 8px',
      'letter-spacing:.2px', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(banner);
  } catch (_) {
    // A missing banner must never stop the app from starting.
  }
}

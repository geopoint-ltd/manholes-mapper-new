// Service worker registration and offline guards
// This module intentionally tolerates absence of i18n `t` and relies on window.showToast when available.

(function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Only register the service worker when served over HTTPS or from localhost.  Service
  // workers are not allowed on plain HTTP on most devices.  This check prevents
  // confusing errors during development.
  const isSecure = window.location.protocol === 'https:' || /^localhost$|^127\.0\.0\.1$/.test(window.location.hostname);
  if (!isSecure) return;
  navigator.serviceWorker
    .register('./service-worker.js')
    .then((reg) => {
      try { reg.update(); } catch (_) {}
      const intervalMs = 15 * 60 * 1000;
      setInterval(() => { try { reg.update(); } catch (_) {} }, intervalMs);

      function requestSkipWaiting(sw) {
        try { sw && sw.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
      }
      if (reg.waiting) requestSkipWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            requestSkipWaiting(sw);
          }
        });
      });
    })
    .catch((err) => {
      console.error('Service worker registration failed:', err);
    });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
})();

(function setupOfflineRefreshGuards() {
  function isOffline() { return !navigator.onLine; }

  window.addEventListener('online', () => {
    if (typeof window.showToast === 'function' && typeof window.t === 'function') {
      window.showToast(window.t('toasts.online'));
    } else if (typeof window.showToast === 'function') {
      window.showToast('Connection restored');
    }
  });
  window.addEventListener('offline', () => {
    if (typeof window.showToast === 'function' && typeof window.t === 'function') {
      window.showToast(window.t('toasts.offline'));
    } else if (typeof window.showToast === 'function') {
      window.showToast('You are offline');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (!isOffline()) return;
    const key = (e.key || '').toLowerCase();
    if (key === 'f5' || ((e.ctrlKey || e.metaKey) && key === 'r')) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.showToast === 'function' && typeof window.t === 'function') {
        window.showToast(window.t('toasts.refreshBlockedOffline'), 2200);
      }
    }
  }, { capture: true });

  window.addEventListener('beforeunload', (e) => {
    if (!isOffline()) return;
    e.preventDefault();
    e.returnValue = '';
    if (typeof window.showToast === 'function' && typeof window.t === 'function') {
      window.showToast(window.t('toasts.refreshBlockedOffline'), 2000);
    }
  });

  let touchStartY = 0;
  let touchStartScrollContainer = null;
  function findScrollableAncestor(el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const canScroll = (node.scrollHeight > node.clientHeight) && (style.overflowY === 'auto' || style.overflowY === 'scroll');
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  window.addEventListener('touchstart', (e) => {
    if (!isOffline()) return;
    if (e.touches && e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      const target = /** @type {Element} */ (e.target);
      touchStartScrollContainer = findScrollableAncestor(target);
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!isOffline()) return;
    if (!touchStartScrollContainer) return;
    const isPageScroll = touchStartScrollContainer === (document.scrollingElement || document.documentElement);
    if (!isPageScroll) return;
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    const scroller = document.scrollingElement || document.documentElement;
    const atTop = (scroller ? scroller.scrollTop : window.scrollY) <= 0;
    if (atTop && y > touchStartY + 10) {
      e.preventDefault();
    }
  }, { passive: false });
})();

// ES module entry for the Graph Sketcher app
// Load small utilities first so legacy code can rely on them during migration.
import './utils/toast.js';
import './serviceWorker/register-sw.js';
import { i18n as I18N_DICT, createTranslator, isRTL as i18nIsRTL } from './i18n.js';
import { syncHeaderHeightVar } from './dom/dom-utils.js';
import * as CONSTS from './state/constants.js';
import { attachFloatingKeyboard } from './utils/floating-keyboard.js';
import { initResizableDrawer } from './utils/resizable-drawer.js';

// Provide a translator globally for legacy code if not yet present
if (typeof window !== 'undefined') {
  if (typeof window.t !== 'function') {
    window.t = createTranslator(I18N_DICT, () => (window.currentLang === 'en' ? 'en' : 'he'));
  }
  if (typeof window.isRTL !== 'function') {
    window.isRTL = i18nIsRTL;
  }
  // Expose constants catalog for legacy code paths
  if (!window.CONSTS) {
    window.CONSTS = CONSTS;
  }
}

// This preserves current behavior by importing the legacy script as a side-effect.
// We will gradually move logic from main.js into organized modules under src/.
import './legacy/main.js';

// Initialize floating keyboard for mobile numeric inputs
// This will only activate on mobile/touch devices
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    attachFloatingKeyboard();
    initResizableDrawer();
  });
}

// After app scripts load, ensure header height variable is synced
try { syncHeaderHeightVar(); } catch (_) {}

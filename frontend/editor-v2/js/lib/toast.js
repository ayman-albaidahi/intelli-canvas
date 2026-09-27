import { qs } from './dom.js';
/**
 * The toast, split out of ui-manager.js.
 *
 * showToast was the module's most-imported function, injected into every
 * manager as a dependency — yet it lived inside the UI module it has
 * nothing else to do with. The plan's Phase 4 called it out ("toast.js
 * منفصل، موجود حالياً داخل ui-manager"); this is that split.
 *
 * The single #toast element and its visibility timer move with it.
 * ui-manager re-exports showToast so the injected-dependency call sites
 * (and main.js's named import) are untouched.
 */

let timer;

/**
 * Show `message` in the bottom toast for ~2.3s. Re-showing resets the
 * timer, so a burst of messages reads as the last one, as before.
 *
 * The element is looked up per call, not cached at import: unit tests
 * rebuild document.body between cases, and a module-time query would pin
 * a stale node.
 *
 * @param {string} message
 */
export function showToast(message) {
  const toast = qs('#toast');
  if (!toast) {
    // No toast surface (a page without the editor chrome, or a unit test
    // that forgot the fixture): logging keeps the message visible in devtools
    // rather than swallowing it silently.
    console.warn('[toast] #toast element missing:', message);
    return;
  }

  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

/**
 * DOM lookup helpers.
 *
 * The acceptance criteria for the editor split: no scattered
 * `document.querySelector` outside the ui/canvas layers — selectors go
 * through these two functions. The benefit is not keystrokes saved; it is
 * that every global DOM read in the editor now passes through one file,
 * so a future change (scoped roots, test instrumentation, a query cache)
 * has a single place to live.
 *
 * escapeHtml already lives beside these (escape-html.js) as the plan's
 * dom.js sketch intended.
 */

/** @param {string} selector @returns {Element|null} */
export function qs(selector) {
  return document.querySelector(selector);
}

/** @param {string} selector @returns {NodeListOf<Element>} */
export function qsa(selector) {
  return document.querySelectorAll(selector);
}

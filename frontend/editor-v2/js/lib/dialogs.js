import { qs } from './dom.js';
/**
 * Dialog lifecycle: open, close, Escape, focus trap, confirm.
 *
 * A dialog is only a dialog if the rest of the page cannot take focus while
 * it is open. This module owns that contract in one place: inert background,
 * focus moved in, focus restored to the opener on close, a single Escape
 * handler that closes the top-most dialog, and a Tab trap that keeps
 * keyboard users inside the open card.
 *
 * It came out of ui-manager.js (Phase 4 of the restructuring plan) with one
 * behavioural upgrade: open dialogs are tracked in an explicit stack instead
 * of `document.querySelector('.dialog-backdrop.is-open')` picking whichever
 * one comes first in the DOM. Two dialogs may legitimately be open at once —
 * a confirmation raised on top of the shortcuts help — and Escape must
 * dismiss the top one, not the first one.
 *
 * ui-manager.js re-exports every name here so existing import sites are
 * untouched.
 */

// A dialog is only a dialog if the rest of the page cannot take focus while it
// is open. Each dialog records the element that opened it so focus lands back
// there on close — otherwise it falls on the body, which screen readers report
// as landing nowhere.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The dialogs currently open, bottom-most first. */
const openDialogs = [];

function dialogAncestors(dialog) {
  // Everything outside the dialog is made inert, so the background cannot be
  // tabbed into or clicked through to while it is open.
  return Array.from(document.body.children).filter((node) => !node.contains(dialog));
}

export function openDialog(dialog, options = {}) {
  if (!dialog || !dialog.hidden) return;
  const { focus = null } = options;
  dialog._lastFocused = document.activeElement;
  dialog.hidden = false;
  dialog.classList.add('is-open');
  const heading = dialog.querySelector('h2');
  if (heading && !dialog.getAttribute('aria-labelledby')) {
    if (!heading.id) heading.id = `dialog-label-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  // Inert is a set-once property per element, but setting it again on a node
  // that is still inert is harmless.
  dialogAncestors(dialog).forEach((node) => { node.inert = true; });
  openDialogs.push(dialog);
  (dialog.querySelector(focus) || dialog.querySelector(FOCUSABLE))?.focus();
}

export function closeDialog(dialog) {
  if (!dialog || dialog.hidden) return;
  dialog.hidden = true;
  dialog.classList.remove('is-open');
  dialogAncestors(dialog).forEach((node) => { node.inert = false; });
  const index = openDialogs.indexOf(dialog);
  if (index !== -1) openDialogs.splice(index, 1);
  // Returning focus to the opener keeps keyboard users on the control they
  // came from instead of stranding them at the top of the page.
  const restore = dialog._lastFocused;
  if (restore && document.contains(restore)) restore.focus();
}

/** How many dialogs are currently open. Tests and the focus trap use this
 * instead of reaching for the module-private stack. */
export function openDialogCount() {
  return openDialogs.length;
}

// The one Escape handler for every dialog. The top-most open dialog always
// wins over the mobile drawer and the layer menu because it is the most
// restrictive state on the page, and a dialog raised on top of another must
// not close the one underneath.
//
// Returns an unsubscribe function so a test (or a teardown path) can remove
// exactly the handler it registered; without it, every call stacks another
// permanent document listener.
export function initDialogEscape(documentRef = document) {
  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    // Defensively drop entries a direct DOM mutation closed without
    // closeDialog() having run, so the stack can never grow stale handlers.
    while (openDialogs.length && openDialogs[openDialogs.length - 1].hidden) {
      openDialogs.pop();
    }
    const top = openDialogs[openDialogs.length - 1];
    if (!top) return;
    event.preventDefault();
    closeDialog(top);
  };
  documentRef.addEventListener('keydown', onKeyDown);
  return () => documentRef.removeEventListener('keydown', onKeyDown);
}

// A focus trap keeps Tab circulating inside the dialog. Without it, Tab at the
// last control jumps out to the (now inert) background anyway, but the
// sequence is unpredictable and Screen Reader users lose their place.
//
// Like initDialogEscape, returns an unsubscribe function.
export function initDialogFocusTrap(documentRef = document) {
  const onKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const dialog = openDialogs[openDialogs.length - 1];
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  documentRef.addEventListener('keydown', onKeyDown);
  return () => documentRef.removeEventListener('keydown', onKeyDown);
}

/**
 * Ask the user a yes/no question through the shared confirm dialog.
 * Resolves true on accept, false on any cancel route. If the dialog is not
 * in the document the answer is false — an unreachable confirmation must
 * not strand the caller's promise.
 */
export function confirmDialog({ title = 'Are you sure?', body = 'This cannot be undone.', confirmLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    const dialog = qs('#confirm-dialog');
    if (!dialog) { resolve(false); return; }
    const heading = dialog.querySelector('#confirm-dialog-heading');
    const bodyEl = dialog.querySelector('#confirm-dialog-body');
    const accept = dialog.querySelector('#confirm-accept');
    heading.textContent = title;
    bodyEl.textContent = body;
    accept.textContent = confirmLabel;

    // The handlers are removed on every resolution so a later confirm cannot
    // fire a stale callback from an earlier one.
    const done = (result) => {
      accept.removeEventListener('click', onAccept);
      qs('#confirm-cancel')?.removeEventListener('click', onCancel);
      qs('#confirm-cancel-secondary')?.removeEventListener('click', onCancel);
      closeDialog(dialog);
      resolve(result);
    };
    const onAccept = () => done(true);
    const onCancel = () => done(false);

    accept.addEventListener('click', onAccept);
    qs('#confirm-cancel')?.addEventListener('click', onCancel);
    qs('#confirm-cancel-secondary')?.addEventListener('click', onCancel);
    openDialog(dialog, { focus: '#confirm-accept' });
  });
}

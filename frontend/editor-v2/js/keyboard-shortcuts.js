/**
 * Keyboard shortcuts, split out of main.js.
 *
 * The rules here are the part worth testing, because they are the part that
 * was silently wrong before: tool shortcuts must not fire while typing in a
 * field or while a modifier is held, and undo/redo must. Those guards lived
 * inline in a 40-line keydown handler in main.js with no unit coverage, so a
 * regression was only discoverable by driving a real browser.
 *
 * Actions are DOM clicks on elements the HTML already declares
 * (data-action, data-tool), so this module stays free of manager wiring: it
 * needs the canvas for zoom and the file input for Ctrl+O, nothing else.
 */

export const TOOL_SHORTCUTS = {
  v: 'select',
  m: 'move',
  c: 'crop',
  b: 'brush',
  e: 'eraser',
  u: 'shape',
  t: 'text',
};

const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

/**
 * Whether the keydown originated inside something the user is typing into.
 * contentEditable covers the layer rename control, which is not a real
 * input element, so the tag check alone is not enough. The attribute
 * lookup is there because jsdom does not implement isContentEditable — the
 * live browser reads the IDL property, the test suite reads the attribute.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (TYPING_TAGS.includes(target.tagName)) return true;
  if (target.isContentEditable === true) return true;
  const attribute = target.getAttribute('contenteditable');
  // An empty or missing attribute is not editing; "false"/"inherit" are
  // explicitly not editable. Anything else (true, plaintext-only) is.
  return attribute !== null && !['', 'false', 'inherit'].includes(attribute.toLowerCase());
}

/**
 * Bind the editor shortcuts to `documentRef`. Returns nothing; the listener
 * is bound for the page lifetime.
 *
 * @param {object} deps
 * @param {object} deps.canvasManager `{ zoomStep, fit, setHundredPercent }`
 * @param {HTMLElement} deps.fileInput
 * @param {(message: string) => void} deps.showToast
 * @param {Document} [deps.documentRef]
 * @returns {() => void} unsubscribe, for teardown symmetry with the other
 *   `init*` helpers even though main.js binds once per page today
 */
export function initKeyboardShortcuts({ canvasManager, fileInput, showToast, documentRef = document }) {
  const onKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;

    // Undo/redo is the most expected editor shortcut and the plumbing
    // already exists in transform-tools; it just was not wired to the
    // keyboard.
    const isMod = event.metaKey || event.ctrlKey;
    if (isMod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      documentRef.querySelector(`[data-action="${event.shiftKey ? 'redo' : 'undo'}"]`)?.click();
      return;
    }
    if (isMod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      documentRef.querySelector('[data-action="redo"]')?.click();
      return;
    }
    if (isMod && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      fileInput.click();
      return;
    }
    // Anything past this point is a single-key shortcut and must not fire
    // while a modifier is held, so Ctrl+S and friends do not also switch
    // tools.
    if (isMod || event.altKey) return;

    if (event.key === '+' || event.key === '=') canvasManager.zoomStep(10);
    else if (event.key === '-' || event.key === '_') canvasManager.zoomStep(-10);
    else if (event.key === '0') {
      canvasManager.fit();
      showToast('Canvas fitted to workspace');
    } else if (event.key === '1') canvasManager.setHundredPercent();

    const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
    if (tool) documentRef.querySelector(`[data-tool="${tool}"]`)?.click();
  };
  documentRef.addEventListener('keydown', onKeyDown);
  return () => documentRef.removeEventListener('keydown', onKeyDown);
}

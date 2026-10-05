import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { TOOL_SHORTCUTS, initKeyboardShortcuts, isTypingTarget } from './keyboard-shortcuts.js';

// The shortcuts drive the HTML, not the managers: they click data-tool and
// data-action elements. A real document with those elements is the
// cheapest way to exercise the wiring without standing up a canvas.
function shortcutDom() {
  document.body.innerHTML = `
    <button data-tool="select"></button>
    <button data-tool="move"></button>
    <button data-tool="crop"></button>
    <button data-tool="brush"></button>
    <button data-tool="eraser"></button>
    <button data-tool="shape"></button>
    <button data-tool="text"></button>
    <button data-action="undo"></button>
    <button data-action="redo"></button>
    <input id="file-input" type="file">
    <input id="rename" type="text">
  `;
  const clicks = [];
  for (const button of document.querySelectorAll('button[data-tool], button[data-action]')) {
    button.addEventListener('click', () => clicks.push(button.dataset.tool || button.dataset.action));
  }
  const fileInput = document.querySelector('#file-input');
  const openPicker = vi.fn();
  fileInput.click = openPicker;
  return { clicks, fileInput: openPicker, rename: document.querySelector('#rename') };
}

function canvasSpy() {
  return {
    zoomStep: vi.fn(),
    fit: vi.fn(),
    setHundredPercent: vi.fn(),
  };
}

function key(keyName, { modifier = false, shift = false, target = document } = {}) {
  const event = new KeyboardEvent('keydown', {
    key: keyName,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifier,
    metaKey: false,
    shiftKey: shift,
  });
  target.dispatchEvent(event);
  return event;
}

describe('keyboard shortcuts', () => {
  let dom;
  let canvas;
  let showToast;
  let unsubscribe;

  beforeEach(() => {
    dom = shortcutDom();
    canvas = canvasSpy();
    showToast = vi.fn();
    unsubscribe = initKeyboardShortcuts({
      canvasManager: canvas,
      fileInput: document.querySelector('#file-input'),
      showToast,
    });
  });

  afterEach(() => {
    // The document persists across tests in this file; without unsubscribing
    // every test after the first would run with stacked handlers and each
    // keypress would click twice.
    unsubscribe();
    document.body.innerHTML = '';
  });

  describe('isTypingTarget', () => {
    it('treats form fields and contentEditable as typing targets', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      const editable = document.createElement('div');
      // setAttribute, not the IDL property: jsdom does not reflect
      // contentEditable assignments, and the helper's attribute fallback is
      // exactly the path that runs here. In the browser, the IDL check.
      editable.setAttribute('contenteditable', 'true');
      const plain = document.createElement('div');

      expect(isTypingTarget(input)).toBe(true);
      expect(isTypingTarget(textarea)).toBe(true);
      expect(isTypingTarget(select)).toBe(true);
      expect(isTypingTarget(editable)).toBe(true);
      expect(isTypingTarget(plain)).toBe(false);
    });

    it('does not treat null or a non-element as a typing target', () => {
      // A keydown can target document itself when nothing is focused.
      expect(isTypingTarget(null)).toBe(false);
      expect(isTypingTarget(document)).toBe(false);
    });

    it('reads contenteditable="false" as not editing', () => {
      const notEditable = document.createElement('div');
      notEditable.setAttribute('contenteditable', 'false');
      expect(isTypingTarget(notEditable)).toBe(false);
    });

    it('treats plaintext-only as editing', () => {
      const plainText = document.createElement('div');
      plainText.setAttribute('contenteditable', 'plaintext-only');
      expect(isTypingTarget(plainText)).toBe(true);
    });


  });

  describe('tool shortcuts', () => {
    it('maps each letter to its tool button', () => {
      for (const [letter, tool] of Object.entries(TOOL_SHORTCUTS)) {
        dom.clicks.length = 0;
        key(letter);
        expect(dom.clicks).toEqual([tool]);
      }
    });

    it('ignores case', () => {
      key('B');
      expect(dom.clicks).toEqual(['brush']);
    });

    it('does not switch tools while typing in a field', () => {
      // Renaming a layer with b in the name must not also arm the brush.
      key('b', { target: dom.rename });
      expect(dom.clicks).toEqual([]);
    });

    it('does not switch tools while a modifier is held', () => {
      // Ctrl+B is "bold" in a text tool context, not the brush.
      key('b', { modifier: true });
      expect(dom.clicks).toEqual([]);
    });

    it('ignores keys that are not shortcuts', () => {
      key('q');
      expect(dom.clicks).toEqual([]);
    });
  });

  describe('undo and redo', () => {
    it('Ctrl+Z clicks undo and prevents default', () => {
      const event = key('z', { modifier: true });
      expect(dom.clicks).toEqual(['undo']);
      expect(event.defaultPrevented).toBe(true);
    });

    it('Ctrl+Shift+Z clicks redo', () => {
      key('z', { modifier: true, shift: true });
      expect(dom.clicks).toEqual(['redo']);
    });

    it('Ctrl+Y clicks redo', () => {
      key('y', { modifier: true });
      expect(dom.clicks).toEqual(['redo']);
    });

    it('plain Z does not undo', () => {
      // Without the modifier, z must not trigger history navigation.
      key('z');
      expect(dom.clicks).toEqual([]);
    });
  });

  describe('file open', () => {
    it('Ctrl+O opens the file picker', () => {
      key('o', { modifier: true });
      expect(dom.fileInput).toHaveBeenCalledOnce();
    });
  });

  describe('zoom', () => {
    it('+ and = zoom in, - and _ zoom out', () => {
      key('+');
      key('=');
      key('-');
      key('_');
      expect(canvas.zoomStep).toHaveBeenNthCalledWith(1, 10);
      expect(canvas.zoomStep).toHaveBeenNthCalledWith(2, 10);
      expect(canvas.zoomStep).toHaveBeenNthCalledWith(3, -10);
      expect(canvas.zoomStep).toHaveBeenNthCalledWith(4, -10);
    });

    it('0 fits the canvas and announces it', () => {
      key('0');
      expect(canvas.fit).toHaveBeenCalledOnce();
      expect(showToast).toHaveBeenCalledWith('Canvas fitted to workspace');
    });

    it('1 sets 100%', () => {
      key('1');
      expect(canvas.setHundredPercent).toHaveBeenCalledOnce();
    });
  });
});

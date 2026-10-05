import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  closeDialog,
  confirmDialog,
  initDialogEscape,
  initDialogFocusTrap,
  openDialog,
  openDialogCount,
} from './dialogs.js';

function dialogHtml() {
  document.body.innerHTML = `
    <div id="app">
      <button id="opener">open</button>
      <div id="text-popover" class="dialog-backdrop" hidden>
        <div class="dialog-card"><h2 id="tp-h">Add text</h2><input id="tp-input"><button id="tp-cancel">cancel</button></div>
      </div>
      <div id="under-dialog" class="dialog-backdrop" hidden>
        <div class="dialog-card"><h2>Under</h2><button id="under-cancel">x</button></div>
      </div>
      <div id="over-dialog" class="dialog-backdrop" hidden>
        <div class="dialog-card"><h2>Over</h2><button id="over-cancel">x</button></div>
      </div>
      <div id="confirm-dialog" class="dialog-backdrop" hidden>
        <div class="dialog-card"><h2 id="confirm-dialog-heading"></h2><p id="confirm-dialog-body"></p>
        <button id="confirm-accept">ok</button><button id="confirm-cancel">no</button><button id="confirm-cancel-secondary">no2</button></div>
      </div>
    </div>
    <div id="outside"></div>
  `;
}

function pressKey(key, { shiftKey = false } = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, shiftKey });
  document.dispatchEvent(event);
  return event;
}

// The trap skips controls jsdom reports as having no layout (offsetParent
// null), which it is for every element unless told otherwise. Making the
// dialog's focusables "visible" is the minimum honest fake of a laid-out
// dialog.
function visibleWithin(dialog) {
  for (const el of dialog.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
  )) {
    Object.defineProperty(el, 'offsetParent', { value: dialog, configurable: true });
  }
}

describe('dialogs', () => {
  let stopEscape;
  let stopTrap;

  beforeEach(() => {
    dialogHtml();
    vi.restoreAllMocks();
    stopEscape = initDialogEscape();
    stopTrap = initDialogFocusTrap();
  });

  afterEach(() => {
    // The open-dialog stack is module state; leaving a dialog open in one
    // test would make the next test's Escape close the wrong window.
    for (const dialog of document.querySelectorAll('.dialog-backdrop.is-open')) {
      closeDialog(dialog);
    }
    stopEscape();
    stopTrap();
    document.body.innerHTML = '';
  });

  it('openDialog reveals the dialog and makes the outside inert', () => {
    const dialog = document.querySelector('#text-popover');
    const outside = document.querySelector('#outside');
    outside.inert = false;
    openDialog(dialog);
    expect(dialog.hidden).toBe(false);
    expect(outside.inert).toBe(true);
  });

  it('openDialog is idempotent on an already-open dialog', () => {
    const dialog = document.querySelector('#text-popover');
    openDialog(dialog);
    expect(() => openDialog(dialog)).not.toThrow();
  });

  it('closeDialog restores the opener focus when it is still in the document', () => {
    const opener = document.querySelector('#opener');
    opener.focus();
    const dialog = document.querySelector('#text-popover');
    openDialog(dialog);
    const input = document.querySelector('#tp-input');
    input.focus();
    closeDialog(dialog);
    expect(document.activeElement).toBe(opener);
  });

  it('an aria-labelledby is derived from the heading id', () => {
    const dialog = document.querySelector('#text-popover');
    openDialog(dialog);
    expect(dialog.getAttribute('aria-labelledby')).toBe('tp-h');
  });

  describe('initDialogEscape', () => {
    it('Escape closes the top-most dialog, not the bottom one', () => {
      const under = document.querySelector('#under-dialog');
      const over = document.querySelector('#over-dialog');
      openDialog(under);
      openDialog(over);

      pressKey('Escape');

      expect(over.hidden).toBe(true);
      expect(under.hidden).toBe(false);
      expect(openDialogCount()).toBe(1);

      pressKey('Escape');
      expect(under.hidden).toBe(true);
      expect(openDialogCount()).toBe(0);
    });

    it('Escape with no open dialog does nothing and does not consume the key', () => {
      const event = pressKey('Escape');
      expect(event.defaultPrevented).toBe(false);
    });

    it('a dialog closed by direct DOM mutation drops off the stack', () => {
      const under = document.querySelector('#under-dialog');
      const over = document.querySelector('#over-dialog');
      openDialog(under);
      openDialog(over);

      // Simulate something closing over's card without closeDialog().
      over.hidden = true;
      over.classList.remove('is-open');

      pressKey('Escape');
      // The stale 'over' was popped by the defensive cleanup, so 'under'
      // (the real top) closes; the count is 0.
      expect(under.hidden).toBe(true);
      expect(openDialogCount()).toBe(0);
    });
  });

  describe('initDialogFocusTrap', () => {
    it('Tab on the last focusable wraps to the first', () => {
      const dialog = document.querySelector('#text-popover');
      visibleWithin(dialog);
      openDialog(dialog);
      const all = Array.from(dialog.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ));
      const first = all[0];
      const last = all[all.length - 1];

      last.focus();
      const event = pressKey('Tab');

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it('Shift+Tab on the first focusable wraps to the last', () => {
      const dialog = document.querySelector('#text-popover');
      visibleWithin(dialog);
      openDialog(dialog);
      const all = Array.from(dialog.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ));
      const first = all[0];
      const last = all[all.length - 1];
      first.focus();

      pressKey('Tab', { shiftKey: true });
      expect(document.activeElement).toBe(last);
    });
  });

  describe('confirmDialog', () => {
    it('accept resolves true and closes the dialog', async () => {
      const promise = confirmDialog({ title: 'Delete?', body: 'gone', confirmLabel: 'Delete' });
      document.querySelector('#confirm-accept').click();
      await expect(promise).resolves.toBe(true);
      expect(document.querySelector('#confirm-dialog').hidden).toBe(true);
    });

    it('cancel resolves false and closes the dialog', async () => {
      const promise = confirmDialog();
      document.querySelector('#confirm-cancel').click();
      await expect(promise).resolves.toBe(false);
      expect(document.querySelector('#confirm-dialog').hidden).toBe(true);
    });

    it('the secondary cancel also resolves false', async () => {
      const promise = confirmDialog();
      document.querySelector('#confirm-cancel-secondary').click();
      await expect(promise).resolves.toBe(false);
    });

    it('a second confirm after the first completes does not fire stale handlers', async () => {
      const first = confirmDialog();
      document.querySelector('#confirm-accept').click();
      await expect(first).resolves.toBe(true);

      const second = confirmDialog({ title: 'Again?' });
      document.querySelector('#confirm-accept').click();
      await expect(second).resolves.toBe(true);
      // The first request settled once, not twice: the stale handler was
      // removed when the first confirm resolved.
      expect(openDialogCount()).toBe(0);
    });

    it('resolves false immediately when the dialog is absent', async () => {
      document.body.innerHTML = '<div id="app"></div>';
      await expect(confirmDialog()).resolves.toBe(false);
    });
  });
});

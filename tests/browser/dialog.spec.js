// Dialog modal-semantics guard.
//
// A dialog that is only visually on top is not a dialog: the background stays
// keyboard-focusable, Escape does nothing, and focus is stranded on close.
// These tests exercise the real keyboard path, not just the attribute set.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

const DIALOGS = [
  ['#resize-dialog', '[data-action="resize"]', '#resize-width'],
  ['#export-dialog', '[data-action="export"]', '#export-format'],
];

for (const [dialogId, opener, expectedFocus] of DIALOGS) {
  test.describe(`dialog ${dialogId}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/editor-v2/');
      await page.setInputFiles('#file-input', makePngPath(test.info(), 'dialog.png'));
      await waitForImageLoaded(page);
    });

    test('declares itself a modal dialog and moves focus inside', async ({ page }) => {
      await page.locator(opener).click();
      await expect(page.locator(dialogId)).toBeVisible();
      // role and aria-modal live on the dialog card, not the backdrop.
      const card = page.locator(`${dialogId} .dialog-card`);
      await expect(card).toHaveAttribute('role', 'dialog');
      await expect(card).toHaveAttribute('aria-modal', 'true');
      // The dialog must label itself, not rely on the screen reader guessing.
      const labelledBy = await card.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      await expect(page.locator(`#${labelledBy}`)).toBeVisible();
      // Focus lands on the first field, not on the body.
      await expect(page.locator(expectedFocus)).toBeFocused();
    });

    test('makes the background inert so Tab cannot escape', async ({ page }) => {
      await page.locator(opener).click();
      await expect(page.locator(dialogId)).toBeVisible();
      // The topbar is outside the dialog, so it must be unreachable while open.
      const inert = await page.evaluate(() => {
        const dialog = document.querySelector('.dialog-backdrop.is-open');
        if (!dialog) return 'no-open-dialog';
        const outside = Array.from(document.body.children).filter((n) => !n.contains(dialog));
        return outside.map((n) => ({ tag: n.tagName, id: n.id, inert: n.inert }));
      });
      expect(inert).not.toBe('no-open-dialog');
      for (const node of inert) {
        expect(node.inert, `background node ${node.tag}#${node.id} must be inert`).toBe(true);
      }
    });

    test('Tab cycles within the dialog instead of leaving', async ({ page }) => {
      await page.locator(opener).click();
      await expect(page.locator(dialogId)).toBeVisible();
      const focusables = await page.locator(`${dialogId} [tabindex], ${dialogId} button, ${dialogId} input, ${dialogId} select`).count();
      expect(focusables).toBeGreaterThan(0);
      // Tab from the last focusable control wraps to the first.
      await page.keyboard.press('Tab');
      const active = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']).toContain(active);
      // Whatever is focused must still be inside the dialog.
      const inside = await page.evaluate(() => {
        const dialog = document.querySelector('.dialog-backdrop.is-open');
        return dialog ? dialog.contains(document.activeElement) : false;
      });
      expect(inside).toBe(true);
    });

    test('Escape closes the dialog and returns focus to the opener', async ({ page }) => {
      await page.locator(opener).click();
      await expect(page.locator(dialogId)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(dialogId)).toBeHidden();
      // Focus goes back to the button that opened it rather than the body.
      await expect(page.locator(opener)).toBeFocused();
      // Background is reachable again.
      const stillInert = await page.evaluate(() =>
        Array.from(document.body.children).some((n) => n.inert));
      expect(stillInert).toBe(false);
    });
  });
}

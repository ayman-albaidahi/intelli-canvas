// Keyboard shortcuts and destructive-action confirmation guard.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

async function upload(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(testInfo, 'keys.png'));
  await waitForImageLoaded(page);
}

test.describe('tool shortcuts', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await upload(page, testInfo);
  });

  // Every shortcut the tool rail advertises in its title attributes must
  // actually switch tools — the titles were promising keys that did nothing.
  for (const [key, tool] of [
    ['v', 'select'], ['m', 'move'], ['c', 'crop'], ['b', 'brush'],
    ['e', 'eraser'], ['u', 'shape'], ['t', 'text'],
  ]) {
    test(`${key} activates the ${tool} tool`, async ({ page }) => {
      await page.keyboard.press(key);
      await expect(page.locator(`[data-tool="${tool}"]`)).toHaveClass(/is-active/);
      await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed', 'true');
    });
  }

  test('shortcuts do not fire while typing in a field', async ({ page }) => {
    await page.locator('[data-tool="text"]').click();
    const box = await page.locator('#object-canvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#text-popover')).toBeVisible();

    const before = await page.locator('[data-tool="brush"]').getAttribute('aria-pressed');
    // Typing "brush" into the text field must not switch tools.
    await page.locator('#text-popover-input').type('brush eraser shape');
    await expect(page.locator('[data-tool="brush"]')).toHaveAttribute('aria-pressed', before);
    await page.keyboard.press('Escape');
  });

  test('modifier keys do not accidentally switch tools', async ({ page }) => {
    // Ctrl+S and friends should never also activate a tool.
    await page.keyboard.press('Control+s');
    await expect(page.locator('[data-tool="select"]')).toHaveClass(/is-active/);
  });
});

test.describe('undo and redo', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await upload(page, testInfo);
  });

  test('Ctrl+Z steps back and Ctrl+Shift+Z steps forward', async ({ page }) => {
    // Undo is disabled until at least one Python step exists.
    const undo = page.locator('[data-action="history-undo"]');
    const redo = page.locator('[data-action="history-redo"]');
    await expect(undo).toBeDisabled();

    // Produce a real step so undo has something to undo.
    await page.locator('[data-adjustment="brightness"]').fill('130');
    await page.locator('[data-action="apply-adjustments"]').click();
    await expect(undo).toBeEnabled({ timeout: 15_000 });

    await page.keyboard.press('Control+z');
    await expect(undo).toBeDisabled({ timeout: 15_000 });
    await expect(redo).toBeEnabled();

    await page.keyboard.press('Control+Shift+z');
    await expect(undo).toBeEnabled({ timeout: 15_000 });
  });
});

test.describe('shortcuts help', () => {
  test('the Keys button opens a real dialog listing the shortcuts', async ({ page }) => {
    await page.goto('/editor-v2/');
    const button = page.locator('[data-panel="shortcuts"]');
    // It used to mark itself aria-disabled and only toast.
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');

    await button.click();
    const dialog = page.locator('#shortcuts-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.dialog-card')).toHaveAttribute('role', 'dialog');
    await expect(dialog.locator('#shortcuts-dialog-heading')).toHaveText('Shortcuts');
    // The list is the point: a help affordance with no content is not help.
    await expect(dialog.locator('.shortcuts-list li')).toHaveCount(13);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('destructive confirmation', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await upload(page, testInfo);
  });

  test('deleting a layer asks first and cancels cleanly', async ({ page }) => {
    // Draw a brush stroke so there is a layer to delete.
    await page.locator('[data-tool="brush"]').click();
    const box = await page.locator('#object-canvas').boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120);
    await page.mouse.up();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);

    // Open the layer menu and choose Delete.
    await page.locator('[data-inspector="layers"]').click();
    await page.locator('#layers-list .layer-row .layer-more').first().click();
    await page.locator('#layer-menu [data-menu="delete"]').click();

    const dialog = page.locator('#confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.dialog-card')).toHaveAttribute('role', 'alertdialog');

    // Cancelling must leave the layer exactly where it was.
    await page.locator('#confirm-cancel-secondary').click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);
  });

  test('confirming the dialog removes the layer', async ({ page }) => {
    await page.locator('[data-tool="brush"]').click();
    const box = await page.locator('#object-canvas').boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120);
    await page.mouse.up();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);

    await page.locator('[data-inspector="layers"]').click();
    await page.locator('#layers-list .layer-row .layer-more').first().click();
    await page.locator('#layer-menu [data-menu="delete"]').click();
    await page.locator('#confirm-accept').click();

    await expect(page.locator('#confirm-dialog')).toBeHidden();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(0);
  });
});

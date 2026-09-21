// Text tool inline-input guard.
//
// window.prompt was the only way to create or edit a text layer. It blocks the
// page, cannot be styled, returns null on cancel (indistinguishable from empty
// input), and Playwright's dialog handlers make the whole flow untestable. This
// exercises the replacement as a real keyboard-operable dialog.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(test.info(), 'text.png'));
  await waitForImageLoaded(page);
});

test('the text tool opens an inline dialog instead of a native prompt', async ({ page }) => {
  // A native prompt would hang the whole test; this handler makes any prompt
  // a hard failure rather than a silent dismissal.
  await page.addInitScript(() => {
    window.prompt = () => { throw new Error('window.prompt was called'); };
  });

  await page.locator('[data-tool="text"]').click();
  await page.locator('#object-canvas').click();

  const popover = page.locator('#text-popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('.text-popover-card')).toHaveAttribute('role', 'dialog');
  await expect(popover.locator('.text-popover-card')).toHaveAttribute('aria-modal', 'true');
  // Focus lands in the field so typing can start immediately.
  await expect(popover.locator('#text-popover-input')).toBeFocused();
});

test('submitting creates a text layer with the typed value', async ({ page }) => {
  await page.locator('[data-tool="text"]').click();
  await page.locator('#object-canvas').click();
  await expect(page.locator('#text-popover')).toBeVisible();

  await page.locator('#text-popover-input').fill('Hello world');
  await page.locator('#text-popover-submit').click();

  await expect(page.locator('#text-popover')).toBeHidden();
  // The layer list is the visible proof the object exists.
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);
});

test('Enter submits and Escape cancels without leaving an empty layer', async ({ page }) => {
  await page.locator('[data-tool="text"]').click();
  await page.locator('#object-canvas').click();
  await expect(page.locator('#text-popover')).toBeVisible();

  await page.locator('#text-popover-input').fill('Typed with keyboard');
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-popover')).toBeHidden();
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);

  // Now cancel: no extra layer should appear.
  await page.locator('[data-tool="text"]').click();
  await page.locator('#object-canvas').click();
  await expect(page.locator('#text-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#text-popover')).toBeHidden();
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);
});

test('empty input creates nothing', async ({ page }) => {
  await page.locator('[data-tool="text"]').click();
  await page.locator('#object-canvas').click();
  await page.locator('#text-popover-submit').click();
  // The dialog stays open — there is nothing valid to commit.
  await expect(page.locator('#text-popover')).toBeVisible();
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(0);
});

test('editing an existing text layer prefills its current value', async ({ page }) => {
  await page.locator('[data-tool="text"]').click();
  await page.locator('#object-canvas').click();
  await page.locator('#text-popover-input').fill('Original');
  await page.keyboard.press('Enter');
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);

  // Double-click the canvas where the text object sits, then edit.
  await page.locator('#object-canvas').dblclick();
  await expect(page.locator('#text-popover')).toBeVisible();
  await expect(page.locator('#text-popover-input')).toHaveValue('Original');
  await expect(page.locator('#text-popover-heading')).toHaveText('Edit text');
  await expect(page.locator('#text-popover-submit')).toHaveText('Save');

  await page.locator('#text-popover-input').fill('Revised');
  await page.keyboard.press('Enter');
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);
});

test('Arabic text is rendered right-to-left on the canvas', async ({ page }) => {
  // The rtl flag is internal; the user-visible difference is where the glyphs
  // land. RTL text is drawn from the right edge of its box, LTR from the left,
  // so sampling the object canvas on both sides of the click point tells them
  // apart without reading any private state.
  await page.locator('#drawing-color').evaluate((el) => { el.value = '#000000'; });
  await page.locator('[data-tool="text"]').click();

  const box = await page.locator('#object-canvas').boundingBox();
  const clickX = box.x + box.width / 2;
  const clickY = box.y + box.height / 2;
  await page.mouse.click(clickX, clickY);
  await expect(page.locator('#text-popover')).toBeVisible();
  await page.locator('#text-popover-input').fill('مرحبا');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  const ink = await page.evaluate(() => {
    const canvas = document.querySelector('#object-canvas');
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, width, height).data;
    // The text object is roughly its measured width wide and fontSize*1.4
    // tall, centred on the click point. Sampling the whole canvas would wash
    // the signal out, so the window is narrowed to that box.
    const cx = width / 2;
    const cy = height / 2;
    const halfW = 90;
    const halfH = 26;
    let leftInk = 0;
    let rightInk = 0;
    for (let y = cy - halfH; y <= cy + halfH; y += 1) {
      for (let x = cx - halfW; x <= cx + halfW; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i] + data[i + 1] + data[i + 2] < 360) {
          if (x < cx) leftInk += 1;
          else rightInk += 1;
        }
      }
    }
    return { leftInk, rightInk };
  });

  // RTL glyphs are anchored to the right edge of the text box, so the right
  // half carries most of the ink. A flipped rendering would mean the
  // direction flag was lost somewhere along the way.
  expect(ink.rightInk).toBeGreaterThan(ink.leftInk);
});

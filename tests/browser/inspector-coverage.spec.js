import { expect, test } from '@playwright/test';
import { expectNoControlOutsideViewport, makePngPath, waitForImageLoaded } from './fixtures.js';

const CONTEXTS = ['empty', 'image', 'layer', 'brush', 'eraser', 'crop', 'processing', 'error'];

async function upload(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(testInfo, 'coverage.png', [90, 140, 210], [32, 32]));
  await waitForImageLoaded(page);
}

async function createAndSelectLayer(page) {
  await page.locator('[data-tool="brush"]').click();
  const canvas = page.locator('#object-canvas');
  const box = await canvas.boundingBox();
  await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.mouse.down();
  await canvas.hover({ position: { x: box.width / 2 + 24, y: box.height / 2 + 18 } });
  await page.mouse.up();
  await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);
  await page.locator('[data-inspector="layers"]').click();
  await page.locator('#layers-list .layer-row .layer-thumb').click();
  await page.locator('[data-tool="select"]').click();
  await page.locator('[data-inspector="edit"]').click();
}

async function expectContext(page, expected) {
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', expected);
  await expect(page.locator('[data-edit-context]:not([hidden])')).toHaveCount(1);
  await expect(page.locator(`#edit-context-${expected}`)).toBeVisible();
  const violations = await page.evaluate((activeId) => [...document.querySelectorAll('[data-edit-context]')]
    .flatMap((section) => {
      const active = section.id === `edit-context-${activeId}`;
      const expectedHidden = !active;
      const expectedInert = !active;
      const errors = [];
      if (section.hidden !== expectedHidden) errors.push(`${section.id} hidden=${section.hidden}, expected ${expectedHidden}`);
      if (section.inert !== expectedInert) errors.push(`${section.id} inert=${section.inert}, expected ${expectedInert}`);
      return errors;
    }), expected);
  expect(violations).toEqual([]);
}

test.describe('Inspector context coverage', () => {
  test('covers Empty, Image, Brush, Eraser, Crop, and Layer transitions', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await expectContext(page, 'empty');

    await upload(page, testInfo);
    await expectContext(page, 'image');

    await page.locator('[data-tool="brush"]').click();
    await expectContext(page, 'brush');
    await page.locator('[data-tool="eraser"]').click();
    await expectContext(page, 'eraser');
    await page.locator('[data-tool="crop"]').click();
    await expectContext(page, 'crop');
    await page.locator('#crop-cancel').click();
    await page.locator('[data-tool="select"]').click();
    await expectContext(page, 'image');

    await createAndSelectLayer(page);
    await expectContext(page, 'layer');
  });

  test('exposes every official context with a unique accessible name', async ({ page }) => {
    await page.goto('/editor-v2/');
    const result = await page.evaluate((contexts) => contexts.map((context) => {
      const section = document.querySelector(`#edit-context-${context}`);
      const labelId = section?.getAttribute('aria-labelledby');
      return {
        context,
        exists: Boolean(section),
        role: section?.getAttribute('role'),
        labelCount: labelId ? document.querySelectorAll(`#${CSS.escape(labelId)}`).length : 0,
      };
    }), CONTEXTS);
    expect(result.every((item) => item.exists && item.role === 'region' && item.labelCount === 1)).toBe(true);
  });
});

test.describe('Inspector accessibility contract', () => {
  test('links tabs to real panels and keeps exactly one tab selected', async ({ page }) => {
    await page.goto('/editor-v2/');
    const tabs = page.locator('[data-inspector]');
    const selected = page.locator('[data-inspector][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    for (let i = 0; i < await tabs.count(); i += 1) {
      const tab = tabs.nth(i);
      const panelId = await tab.getAttribute('aria-controls');
      await expect(page.locator(`#${panelId}`)).toHaveAttribute('role', 'tabpanel');
      const labelId = await page.locator(`#${panelId}`).getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      await expect(page.locator(`#${labelId}`)).toHaveCount(1);
    }
  });

  test('announces Processing and Error through live regions and restores focusability', async ({ page }, testInfo) => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    await page.route('**/api/transform/crop', async (route) => {
      await pending;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TRANSFORM_FAILED', message: 'Crop failed safely' } }) });
    });
    await upload(page, testInfo);
    await page.locator('[data-tool="crop"]').click();
    await page.locator('#crop-apply').click();
    await expectContext(page, 'processing');
    await expect(page.locator('#processing-context-summary')).toHaveAttribute('role', 'status');
    await expect(page.locator('#processing-context-summary')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-tool="brush"]')).toBeDisabled();
    release();
    await expectContext(page, 'error');
    await expect(page.locator('#error-context-summary')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#error-context-summary')).toHaveAttribute('aria-live', 'assertive');
    await page.locator('#error-dismiss').click();
    await expect(page.locator('[data-edit-context][hidden] button:focus')).toHaveCount(0);
    await expectContext(page, 'crop');
  });

  test('keeps controls reachable at phone width and respects reduced motion', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await upload(page, testInfo);
    await expectNoControlOutsideViewport(page);
    await page.locator('[data-action="inspector-toggle"]').click();
    await page.locator('[data-inspector="layers"]').click();
    await expect(page.locator('[data-inspector="layers"]')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expectNoControlOutsideViewport(page);
  });
});

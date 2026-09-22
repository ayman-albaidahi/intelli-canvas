import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

async function upload(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(testInfo, 'context.png', [90, 140, 210], [32, 32]));
  await waitForImageLoaded(page);
}

async function createAndSelectBrushLayer(page) {
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
  // Brush has higher resolver priority than Layer; Select exposes the selected layer context.
  await page.locator('[data-tool="select"]').click();
  await page.locator('[data-inspector="edit"]').click();
}

test('Image Context shows image metadata and image-only controls', async ({ page }, testInfo) => {
  await upload(page, testInfo);

  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'image');
  await expect(page.locator('#edit-context-image')).toBeVisible();
  await expect(page.locator('#edit-context-layer')).toBeHidden();
  await expect(page.locator('#image-context-name')).toHaveText('context.png');
  await expect(page.locator('#image-context-dimensions')).toHaveText('32 × 32');
  await expect(page.locator('#image-context-status')).toHaveText('Ready to edit');
  await expect(page.locator('#adjustments-accordion')).toBeVisible();
});

test('selecting a layer switches to Layer Context without Image content', async ({ page }, testInfo) => {
  await upload(page, testInfo);
  await createAndSelectBrushLayer(page);

  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'layer');
  await expect(page.locator('#edit-context-layer')).toBeVisible();
  await expect(page.locator('#edit-context-image')).toBeHidden();
  await expect(page.locator('#layer-context-type')).toHaveText('Brush');
  await expect(page.locator('#layer-context-visibility')).toHaveText('Visible');
  await expect(page.locator('#obj-name')).toHaveValue('Brush 1');
  await expect(page.locator('#image-context-name')).toHaveText('context.png');
});

test('clearing the selected layer returns to Image Context', async ({ page }, testInfo) => {
  await upload(page, testInfo);
  await createAndSelectBrushLayer(page);

  await page.locator('#layer-context-toggle-visibility').click();
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'image');
  await expect(page.locator('#edit-context-layer')).toBeHidden();
  await expect(page.locator('#edit-context-image')).toBeVisible();
});

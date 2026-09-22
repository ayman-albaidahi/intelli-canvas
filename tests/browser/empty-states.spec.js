// Empty-state and honest-first-paint guard.
//
// A blank panel reads as broken; a panel that reports values for an image
// that does not exist yet reads as a lie. These tests cover both: the
// placeholders exist before the user has done anything, and the chrome
// reports "nothing here" rather than fabricated data.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

test.describe('first paint before any image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor-v2/');
  });

  test('reports no state instead of values for an image that is not there', async ({ page }) => {
    // The status bar used to claim "Saved locally" and "1920 × 1080" for a
    // canvas that did not exist.
    await expect(page.locator('#save-state')).toHaveText('Not saved yet');
    await expect(page.locator('#canvas-size')).toHaveText('No image');
    // The zoom display used to read 75% with nothing on screen to zoom.
    await expect(page.locator('#zoom-value')).toHaveText('—');
  });

  test('the empty state still offers a way to start', async ({ page }) => {
    await expect(page.locator('#empty-canvas')).toBeVisible();
    await expect(page.locator('#empty-canvas .button-primary')).toBeVisible();
  });

  test('the empty placeholders are replaced once an image loads', async ({ page }, testInfo) => {
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'empty.png'));
    await waitForImageLoaded(page);
    await expect(page.locator('#save-state')).toHaveText('Saved in API session');
    await expect(page.locator('#canvas-size')).not.toHaveText('No image');
    await expect(page.locator('#zoom-value')).not.toHaveText('—');
  });
});

test.describe('panels with nothing to show yet', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(test.info(), 'panel-empty.png'));
    await waitForImageLoaded(page);
    await page.locator('[data-inspector="analysis"]').click();
  });

  test('the suggestion list explains how to fill it', async ({ page }) => {
    const list = page.locator('#suggestion-list');
    await expect(list).toBeVisible();
    await expect(list).toContainText('Run the analysis to see suggested improvements.');
  });

  test('the histogram output says it is empty rather than rendering nothing', async ({ page }) => {
    await expect(page.locator('#histogram-output')).toContainText('No color analysis yet.');
  });
});

test.describe('surfacing failed loads', () => {
  test('a failed background library load says so instead of staying blank', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'bg.png'));
    await waitForImageLoaded(page);

    // The library fetch is the only call this test blocks; everything else
    // still works.
    await page.route('**/background/backgrounds/catalog', (route) => route.fulfill({ status: 503 }));
    await page.reload();
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'bg2.png'));
    await waitForImageLoaded(page);

    await page.locator('[data-inspector="properties"]').click();
    await expect(page.locator('#bg-library-grid')).toContainText(/could not be loaded/i);
  });
});

test.describe('previously dead controls', () => {
  test('the avatar opens the shortcuts dialog', async ({ page }) => {
    await page.goto('/editor-v2/');
    await page.locator('.avatar').click();
    await expect(page.locator('#shortcuts-dialog')).toBeVisible();
  });

  test('the properties more button duplicates the selected layer', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'more.png'));
    await waitForImageLoaded(page);

    // Draw a brush stroke so a layer exists.
    await page.locator('[data-tool="brush"]').click();
    const box = await page.locator('#object-canvas').boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120);
    await page.mouse.up();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);

    await page.locator('.more-button').click();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(2);
  });
});

import { expect, test } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

async function setupCrop(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(testInfo, 'processing.png', [120, 160, 90], [320, 200]));
  await waitForImageLoaded(page);
  await page.locator('[data-tool="crop"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'crop');
}

test('Crop enters Processing before a request resolves', async ({ page }, testInfo) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/transform/crop', async (route) => {
    await pending;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TRANSFORM_FAILED', message: 'Crop failed safely' } }) });
  });
  await setupCrop(page, testInfo);
  await page.locator('#crop-apply').click();
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'processing');
  await expect(page.locator('#processing-operation')).toContainText('Applying crop');
  await expect(page.locator('[data-tool="brush"]')).toBeDisabled();
  release();
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'error');
});

test('Error Context supports Retry and Dismiss', async ({ page }, testInfo) => {
  let calls = 0;
  await page.route('**/api/transform/crop', async (route) => {
    calls += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TRANSFORM_FAILED', message: 'Crop failed safely' } }) });
  });
  await setupCrop(page, testInfo);
  await page.locator('#crop-apply').click();
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'error');
  await expect(page.locator('#error-message')).toContainText('Crop failed safely');
  await expect(page.locator('#error-retry')).toBeVisible();
  await page.locator('#error-retry').click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'error');
  await page.locator('#error-dismiss').click();
  await expect(page.locator('body')).toHaveAttribute('data-inspector-context', 'crop');
});

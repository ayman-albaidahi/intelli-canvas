import { test, expect } from '@playwright/test';

test.describe('Help', () => {
  test('opens the guide dialog and exposes the downloadable PDF', async ({ page }) => {
    await page.goto('/editor-v2/');
    await expect(page.locator('.app-shell')).toBeVisible();

    await page.locator('[data-action="help"]').click();
    await expect(page.locator('#help-dialog')).toBeVisible();
    await expect(page.locator('#help-dialog a[download]')).toHaveAttribute(
      'href',
      'assets/intellicanvas-user-guide-ar.pdf',
    );

    const response = await page.request.get('/editor-v2/assets/intellicanvas-user-guide-ar.pdf');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
  });
});

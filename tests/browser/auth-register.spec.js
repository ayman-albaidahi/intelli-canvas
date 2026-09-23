import { test, expect } from '@playwright/test';

test('new users can create an account from the auth gate', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/editor-v2/');

  await expect(page.locator('#auth-gate')).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await expect(page.locator('#register-form')).toBeVisible();
  await expect(page.locator('#login-form')).toBeHidden();

  const email = `browser-signup-${Date.now()}@example.com`;
  await page.locator('#register-name').fill('Browser Signup');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill('correct horse battery staple');
  await page.locator('#register-confirm-password').fill('correct horse battery staple');
  await page.locator('#register-submit').click();

  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#account-label')).toHaveText('Browser Signup');
});

test('create account shows a client-side password mismatch error', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/editor-v2/');
  await page.getByRole('button', { name: 'Create account' }).first().click();
  await page.locator('#register-email').fill('mismatch@example.com');
  await page.locator('#register-password').fill('correct horse battery staple');
  await page.locator('#register-confirm-password').fill('different password');
  await page.locator('#register-submit').click();

  await expect(page.locator('#register-error')).toContainText('do not match');
  await expect(page.locator('.app-shell')).toBeHidden();
});

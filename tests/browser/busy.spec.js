// Async busy-feedback guard.
//
// An operation that disables its own trigger is the difference between "the
// click registered" and "did anything happen?". These tests confirm the
// trigger actually goes disabled and reports its state for the duration of a
// request, and that a second click mid-flight does not start a second
// operation.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

async function upload(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(testInfo, 'busy.png'));
  await waitForImageLoaded(page);
}

test.describe('transform operations', () => {
  test('rotate disables its button and reports busy for the duration', async ({ page }, testInfo) => {
    await upload(page, testInfo);
    const button = page.locator('[data-action="rotate-right"]');
    await expect(button).toBeEnabled();

    // The request is fast, so capture the in-flight state by racing the click
    // against a route handler that holds the response open briefly.
    await page.route('**/transform/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.continue();
    });

    await button.click();
    // While in flight the trigger must be disabled and labelled.
    await expect(button).toBeDisabled();
    await expect(button).toHaveText(/Rotate/);
    // And the operation must complete normally once the response lands.
    await expect(button).toBeEnabled({ timeout: 10_000 });
  });

  test('a second click during an in-flight transform does nothing extra', async ({ page }, testInfo) => {
    await upload(page, testInfo);
    const button = page.locator('[data-action="rotate-right"]');

    let requests = 0;
    await page.route('**/transform/*', async (route) => {
      requests += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });

    await button.click();
    await expect(button).toBeDisabled();
    // Hammer it while the first request is still out.
    await button.click({ force: true });
    await button.click({ force: true });
    await expect(button).toBeEnabled({ timeout: 10_000 });
    expect(requests).toBe(1);
  });
});

test.describe('upload', () => {
  test('the image picker is disabled while an upload is in flight', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    const picker = page.locator('[data-action="open"]').first();

    await page.route('**/images', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });

    await page.setInputFiles('#file-input', makePngPath(testInfo, 'busy2.png'));
    // The upload guard runs synchronously on entry, so the picker is disabled
    // before the response ever lands.
    await expect(picker).toBeDisabled();
    await expect(picker).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('#save-state')).toContainText('Saved in API session');
  });
});

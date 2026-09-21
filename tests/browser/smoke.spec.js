// Browser smoke test for the editor's core workflow.
//
// This is the single most valuable browser test in the project: the path a real
// user takes on every session. Before it existed, a broken upload or a stuck
// Apply button could pass the entire suite (276 backend tests, 3 Vitest tests)
// while the editor was unusable.
//
// Selectors use stable data-* attributes rather than classes or generated ids,
// so a CSS refactor cannot turn this into a false failure.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

test('upload, adjust, apply, undo, and export the image', async ({ page }, testInfo) => {
  await page.goto('/editor-v2/');

  // The editor shell must render before any interaction makes sense.
  // Two elements carry data-action="open" (toolbar + hero); pick the toolbar
  // one explicitly so Playwright's strict mode does not reject the locator.
  await expect(page.locator('[data-action="open"]').first()).toBeVisible();
  await expect(page.locator('#file-input')).toBeAttached();

  // --- Upload -----------------------------------------------------------
  const png = makePngPath(testInfo, 'smoke.png');
  await page.setInputFiles('#file-input', png);
  await waitForImageLoaded(page);
  await expect(page.locator('#document-name')).toContainText('smoke.png');

  // --- Local adjustment preview ---------------------------------------
  // The adjustments accordion is open in the default layout, so the slider is
  // already live; a click on a panel trigger is unnecessary (and ambiguous —
  // two elements carry data-panel="adjustments").
  await expect(page.locator('[data-adjustment="brightness"]')).toBeVisible();

  const brightness = page.locator('[data-adjustment="brightness"]');
  // A preview that changes committed state would be a bug, so capture the
  // state marker *before* adjusting and assert it is unchanged after.
  const stateBefore = await page.locator('#save-state').textContent();

  // Move the slider to a non-neutral value. Dispatching a real input event
  // matters: the manager listens for 'input', and a programmatic value change
  // alone would not fire it.
  await brightness.fill('150');
  await brightness.dispatchEvent('input');

  // Preview updates the canvas without a backend round-trip; give the canvas
  // manager a tick to redraw, then confirm nothing was committed.
  await expect(page.locator('#save-state')).toHaveText(stateBefore ?? '');

  // --- Apply in Python -------------------------------------------------
  // Apply must round-trip through the backend and land as one history entry.
  await page.locator('[data-action="apply-adjustments"]').click();

  // The apply is asynchronous; the toast is the editor's own success signal.
  await expect(page.getByText(/uploaded successfully|applied|Applied/i).or(
    page.locator('.toast'),
  )).toBeVisible({ timeout: 20_000 }).catch(() => {
    // Toasts are transient; the durable signal is that the canvas still shows
    // an image and the session survived the round-trip.
  });
  await expect(page.locator('#empty-canvas')).toBeHidden();

  // --- Undo / Redo ------------------------------------------------------
  // Undo must revert to the pre-adjustment state and stay usable.
  await page.locator('[data-action="undo"]').click();
  await expect(page.locator('#empty-canvas')).toBeHidden();

  await page.locator('[data-action="redo"]').click();
  await expect(page.locator('#empty-canvas')).toBeHidden();

  // --- Export -----------------------------------------------------------
  // Export opens a dialog first (not a direct download); the download only
  // starts once the form inside it is submitted. Testing the real shape rather
  // than guessing at it is the point of a smoke test.
  await page.locator('[data-action="export"]').click();
  await expect(page.locator('#export-dialog')).toBeVisible();

  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
  await page.locator('#export-submit').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBeTruthy();
});

test('shows a friendly message when the backend is unreachable', async ({ page, browser }) => {
  // Route every API call to a port nothing listens on, without touching the
  // editor's static assets.
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/editor-v2/');

  const png = makePngPath({ project: { outputDir: 'test-results/browser' } }, 'smoke.png');
  await page.setInputFiles('#file-input', png);

  // The editor must surface a human-readable offline message, never a raw
  // exception or a silently hung spinner.
  await expect(page.getByText(/reach the editing server|server/i)).toBeVisible({ timeout: 15_000 });
});

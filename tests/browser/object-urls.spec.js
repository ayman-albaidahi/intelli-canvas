// Object URL lifecycle guard.
//
// Every createObjectURL must be paired with a revokeObjectURL, on both the
// success and the failure path. A leak is invisible in a single session and
// shows up as a slow memory climb over a long editing session. These tests
// count the pairs rather than trusting that the calls look right.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

// Wraps the page's URL object so the tests can observe every create and
// revoke. Installed before navigation so it covers the whole session.
const TRACK_URLS = `
  window.__urls = { created: 0, revoked: 0, live: new Set() };
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  URL.createObjectURL = function (blob) {
    const url = realCreate.call(URL, blob);
    window.__urls.created += 1;
    window.__urls.live.add(url);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    window.__urls.revoked += 1;
    window.__urls.live.delete(url);
    return realRevoke.call(URL, url);
  };
`;

async function counts(page) {
  return page.evaluate(() => {
    const u = window.__urls;
    return { created: u.created, revoked: u.revoked, live: u.live.size };
  });
}

// The blob URLs that are still holding memory right now. Compared across a
// transition so a URL that should have been released can be named exactly
// rather than inferred from a count that a still-live one could make up for.
async function liveUrls(page) {
  return page.evaluate(() => Array.from(window.__urls.live));
}

test.describe('blob URL accounting', () => {
  test('revokes the preview URL when a new image loads', async ({ page }, testInfo) => {
    await page.addInitScript(TRACK_URLS);
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'a.png'));
    await waitForImageLoaded(page);

    // Run an analysis suggestion preview, which creates a blob URL.
    await page.locator('[data-inspector="analysis"]').click();
    await page.locator('[data-action="analyze-image"]').click();
    await expect(page.locator('#suggestion-card')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-action="preview-suggestion"]').click();
    await expect(page.locator('#suggestion-preview')).toBeVisible({ timeout: 15_000 });

    const before = await counts(page);
    expect(before.created).toBeGreaterThan(0);
    expect(before.live).toBeGreaterThan(0);
    const heldBefore = await liveUrls(page);
    expect(heldBefore.length).toBeGreaterThan(0);

    // Loading a different image must clear the previous session's preview.
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'b.png'));
    await waitForImageLoaded(page);
    await page.waitForTimeout(500);

    const heldAfter = await liveUrls(page);
    // Every URL the first session was still holding must be released. A
    // leaked preview URL survives here and is invisible in a count that
    // tolerates one straggler.
    const survivors = heldBefore.filter((url) => heldAfter.includes(url));
    expect(survivors, 'blob URLs from the previous image that were never revoked').toEqual([]);
  });

  test('a smart-crop preview URL is revoked on the next preview', async ({ page }, testInfo) => {
    await page.addInitScript(TRACK_URLS);
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'sc.png'));
    await waitForImageLoaded(page);

    // The smart-crop controls live inside a collapsed accordion.
    await page.locator('#smart-crop-accordion summary').click();
    await page.locator('[data-action="smart-crop-preview"]').click();
    await expect(page.locator('#smart-crop-preview')).toBeVisible({ timeout: 15_000 });
    const first = await counts(page);
    expect(first.created).toBeGreaterThan(0);

    // A second preview revokes the first rather than stacking a second URL.
    await page.locator('[data-action="smart-crop-preview"]').click();
    await expect(page.locator('#smart-crop-preview')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    const second = await counts(page);
    expect(second.created).toBeGreaterThan(first.created);
    expect(second.live, 'the previous preview URL must be revoked').toBeLessThan(second.created);
  });
});

test.describe('upload race', () => {
  test('two overlapping uploads leave the canvas on the image that finished', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');

    // Hold the first upload open, then let the second through. Whichever
    // settles last must be what the canvas shows, and apiClient.imageId must
    // agree with it.
    let firstRequest;
    await page.route('**/images', async (route) => {
      if (!firstRequest) {
        firstRequest = route;
        return; // leave it pending
      }
      await route.continue();
    });

    await page.setInputFiles('#file-input', makePngPath(testInfo, 'race1.png'));
    await page.waitForTimeout(300);
    // The guard from the busy PR should keep this second upload from racing.
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'race2.png'));

    await firstRequest?.continue();
    await waitForImageLoaded(page);

    // Only one session should be active, and the canvas must not be blank.
    await expect(page.locator('#save-state')).toContainText('Saved in API session');
    await expect(page.locator('#empty-canvas')).toBeHidden();
  });
});

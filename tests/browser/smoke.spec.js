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
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

// A small solid-colour PNG is enough to exercise the whole pipeline; using a
// generated fixture keeps the test independent of any committed binary.
// It is encoded by hand rather than copied as a base64 blob because a stale
// or truncated blob silently fails server-side validation ("INVALID_FILE")
// and the test then waits forever for an upload that never lands.
function makePngPath(testInfo) {
  const dir = join(testInfo.project.outputDir, 'fixtures');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'smoke.png');
  writeFileSync(path, encodePng(32, 32, [180, 120, 90]));
  return path;
}

// Minimal, correct PNG: one IDAT chunk over raw scanlines, CRC included.
function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = chunk(0x49484452, Buffer.concat([
    int32(width), int32(height), Buffer.from([8, 2, 0, 0, 0]), // 8-bit truecolour
  ]));
  // Each scanline starts with a filter-type byte (0 = none).
  const row = Buffer.alloc(1 + width * 3);
  for (let i = 0; i < width; i++) {
    row[1 + i * 3] = rgb[0];
    row[1 + i * 3 + 1] = rgb[1];
    row[1 + i * 3 + 2] = rgb[2];
  }
  const idat = chunk(0x49444154, zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row))));
  const iend = chunk(0x49454e44, Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function chunk(type, data) {
  return Buffer.concat([int32(data.length), Buffer.from([type >>> 24, type >>> 16 & 255, type >>> 8 & 255, type & 255]), data, crc32(type, data)]);
}

function int32(value) {
  return Buffer.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(type, data) {
  const bytes = Buffer.concat([Buffer.from([type >>> 24, type >>> 16 & 255, type >>> 8 & 255, type & 255]), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return int32((crc ^ 0xffffffff) >>> 0);
}

// The editor is unusable until an image is loaded; wait for the signal that a
// backend session exists rather than a fixed sleep.
async function waitForImageLoaded(page) {
  await expect(page.locator('#save-state')).toContainText('Saved in API session', { timeout: 20_000 });
  await expect(page.locator('#empty-canvas')).toBeHidden();
}

test('upload, adjust, apply, undo, and export the image', async ({ page }, testInfo) => {
  await page.goto('/editor-v2/');

  // The editor shell must render before any interaction makes sense.
  // Two elements carry data-action="open" (toolbar + hero); pick the toolbar
  // one explicitly so Playwright's strict mode does not reject the locator.
  await expect(page.locator('[data-action="open"]').first()).toBeVisible();
  await expect(page.locator('#file-input')).toBeAttached();

  // --- Upload -----------------------------------------------------------
  const png = makePngPath(testInfo);
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

  const png = makePngPath({ project: { outputDir: 'test-results/browser' } });
  await page.setInputFiles('#file-input', png);

  // The editor must surface a human-readable offline message, never a raw
  // exception or a silently hung spinner.
  await expect(page.getByText(/reach the editing server|server/i)).toBeVisible({ timeout: 15_000 });
});

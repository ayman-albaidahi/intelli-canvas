import { expect, test } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

// Crop geometry in the browser. The fixture is a real 320x200 opaque image so
// the handles have room to drag. The crop selection lives in stage CSS pixels
// — the same space the image is painted in — and #crop-size reports source
// pixels, so both are independent of zoom.

const SOURCE = { width: 320, height: 200 };
const FIXTURE_RGB = [120, 160, 90];

// Ground truth for where the image is actually painted, by scanning the canvas
// for opaque pixels: the canvas is transparent outside the image, so alpha is
// the reliable edge. This catches a selection that has drifted from the image
// — an analytic fit() formula would not, because it knows nothing about the
// live pan offset.
async function paintedRect(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('#image-canvas');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const w = cv.width, h = cv.height;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const ratio = window.devicePixelRatio || 1;
    const vb = cv.getBoundingClientRect();
    const card = document.querySelector('#canvas-card').getBoundingClientRect();
    // Backing-store pixels -> CSS pixels, then viewport -> stage coordinates.
    return {
      x: minX / ratio + (vb.x - card.x),
      y: minY / ratio + (vb.y - card.y),
      width: (maxX - minX + 1) / ratio,
      height: (maxY - minY + 1) / ratio,
    };
  });
}

async function selection(page) {
  return page.evaluate(() => {
    const card = document.querySelector('#canvas-card').getBoundingClientRect();
    const r = document.querySelector('#crop-overlay').getBoundingClientRect();
    return { x: r.x - card.x, y: r.y - card.y, width: r.width, height: r.height };
  });
}

// Drag a named handle to an offset. Handles are 44px hit areas centred on the
// corners and edge midpoints, so aiming at the corner itself always lands.
async function dragHandle(page, handle, dx, dy, { shift = false } = {}) {
  const sel = await selection(page);
  const cb = await page.locator('#canvas-card').boundingBox();
  const target = {
    nw: [sel.x, sel.y], n: [sel.x + sel.width / 2, sel.y], ne: [sel.x + sel.width, sel.y],
    e: [sel.x + sel.width, sel.y + sel.height / 2], se: [sel.x + sel.width, sel.y + sel.height],
    s: [sel.x + sel.width / 2, sel.y + sel.height], sw: [sel.x, sel.y + sel.height],
    w: [sel.x, sel.y + sel.height / 2],
  }[handle];
  const x = cb.x + target[0], y = cb.y + target[1];
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  if (shift) await page.keyboard.up('Shift');
  await page.mouse.up();
}

function expectInside(sel, rect, label) {
  expect(sel.x, `${label}: left inside image`).toBeGreaterThanOrEqual(rect.x - 1);
  expect(sel.y, `${label}: top inside image`).toBeGreaterThanOrEqual(rect.y - 1);
  expect(sel.x + sel.width, `${label}: right inside image`).toBeLessThanOrEqual(rect.x + rect.width + 1);
  expect(sel.y + sel.height, `${label}: bottom inside image`).toBeLessThanOrEqual(rect.y + rect.height + 1);
}

async function setup(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(testInfo, 'crop.png', FIXTURE_RGB, [SOURCE.width, SOURCE.height]));
  await waitForImageLoaded(page);
  await page.locator('[data-tool="crop"]').click();
  await expect(page.locator('#crop-controls')).toBeVisible();
}

test('activating crop creates a selection inside the image', async ({ page }, testInfo) => {
  await setup(page, testInfo);
  expectInside(await selection(page), await paintedRect(page), 'initial');
  // The readout reports source pixels: 80% of a 320x200 image.
  expect(page.locator('#crop-size')).toContainText('256 × 160 px');
});

test('each corner handle resizes without leaving the image', async ({ page }, testInfo) => {
  await setup(page, testInfo);
  for (const [handle, dx, dy] of [['se', 200, 120], ['nw', -200, -120], ['ne', 200, -120], ['sw', -200, 120]]) {
    await dragHandle(page, handle, dx, dy);
    expectInside(await selection(page), await paintedRect(page), `corner ${handle}`);
  }
});

test('each edge handle resizes one dimension only', async ({ page }, testInfo) => {
  await setup(page, testInfo);
  const before = await selection(page);
  await dragHandle(page, 'e', 150, 300);
  const afterE = await selection(page);
  expect(afterE.width).toBeGreaterThan(before.width);
  expect(afterE.height).toBe(before.height);

  await dragHandle(page, 's', 300, 100);
  const afterS = await selection(page);
  expect(afterS.height).toBeGreaterThan(afterE.height);
  expect(afterS.width).toBe(afterE.width);
});

test('dragging the middle moves the box without resizing it', async ({ page }, testInfo) => {
  await setup(page, testInfo);
  const before = await selection(page);
  const cb = await page.locator('#canvas-card').boundingBox();
  // The middle of the selection, away from any 44px handle hit area.
  await page.mouse.move(cb.x + before.x + before.width / 2, cb.y + before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + before.x + 90, cb.y + before.y + 40, { steps: 5 });
  await page.mouse.up();

  const after = await selection(page);
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  expect(after.x).not.toBe(before.x);
  expect(after.y).not.toBe(before.y);
  expectInside(after, await paintedRect(page), 'moved');
});

test('Shift on a corner keeps the aspect ratio', async ({ page }, testInfo) => {
  await setup(page, testInfo);
  const before = await selection(page);
  const ratio = before.height / before.width;
  await dragHandle(page, 'se', 300, 20, { shift: true });
  const after = await selection(page);
  expect(after.height / after.width).toBeCloseTo(ratio, 5);
});

test('pan is disabled while cropping, so apply still sends a valid payload', async ({ page }, testInfo) => {
  // The regression: wheel-panning during crop moved the image while the
  // selection stayed behind, and apply mapped a stale box to source
  // coordinates the API rejects with 400 CROP_FAILED.
  const cropCalls = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/transform/crop')) cropCalls.push(req.postData());
  });

  await setup(page, testInfo);
  const rectBefore = await paintedRect(page);
  const selBefore = await selection(page);

  const cb = await page.locator('#canvas-card').boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(150);
  // The image is locked in place for the duration of the crop, so neither the
  // image nor the selection can drift away from the other.
  expect(await paintedRect(page), 'image moved under the crop overlay').toEqual(rectBefore);
  expect(await selection(page)).toEqual(selBefore);

  await expect(page.locator('#crop-apply')).toBeEnabled();
  await page.locator('#crop-apply').click();
  await expect(page.locator('#crop-overlay')).toBeHidden();
  expect(cropCalls).toHaveLength(1);
  const payload = JSON.parse(cropCalls[0]);
  expect(payload.x).toBeGreaterThanOrEqual(0);
  expect(payload.y).toBeGreaterThanOrEqual(0);
  expect(payload.width).toBeGreaterThanOrEqual(1);
  expect(payload.height).toBeGreaterThanOrEqual(1);
  expect(payload.x + payload.width).toBeLessThanOrEqual(SOURCE.width);
  expect(payload.y + payload.height).toBeLessThanOrEqual(SOURCE.height);
});

test('cancel and reset clean up without touching the image', async ({ page }, testInfo) => {
  const transforms = [];
  page.on('request', (req) => { if (req.url().includes('/transform/')) transforms.push(req.url()); });

  await setup(page, testInfo);
  const initial = await selection(page);
  await dragHandle(page, 'se', 60, 30);
  expect((await selection(page)).width).toBeGreaterThan(initial.width);

  await page.locator('#crop-reset').click();
  // Reset restores the default selection, still inside the image.
  expectInside(await selection(page), await paintedRect(page), 'reset');

  await page.locator('#crop-cancel').click();
  await expect(page.locator('#crop-overlay')).toBeHidden();
  await expect(page.locator('#crop-controls')).toBeHidden();
  expect(transforms.filter((u) => u.endsWith('/crop'))).toHaveLength(0);
});

test('pointercancel does not leave the crop mid-drag', async ({ page }, testInfo) => {
  await setup(page, testInfo);
  const sel = await selection(page);
  const cb = await page.locator('#canvas-card').boundingBox();
  await page.mouse.move(cb.x + sel.x + sel.width, cb.y + sel.y + sel.height);
  await page.mouse.down();
  await page.mouse.move(cb.x + sel.x + sel.width + 40, cb.y + sel.y + sel.height + 30, { steps: 3 });
  // A cancelled gesture must clear the drag, not freeze it mid-resize.
  await page.evaluate(() => document.querySelector('#crop-overlay').dispatchEvent(
    new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })
  ));
  await page.mouse.up();

  // A subsequent drag works from a clean slate and stays in bounds.
  await dragHandle(page, 'nw', -30, -20);
  expectInside(await selection(page), await paintedRect(page), 'after cancel');
});

test('apply after moving and resizing produces the requested crop', async ({ page }, testInfo) => {
  const cropCalls = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/transform/crop')) cropCalls.push(req.postData());
  });

  await setup(page, testInfo);
  await dragHandle(page, 'se', 40, 25);
  const cb = await page.locator('#canvas-card').boundingBox();
  const sel = await selection(page);
  await page.mouse.move(cb.x + sel.x + sel.width / 2, cb.y + sel.y + sel.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + sel.x + sel.width / 2 + 35, cb.y + sel.y + sel.height / 2 + 20, { steps: 5 });
  await page.mouse.up();

  await page.locator('#crop-apply').click();
  await expect(page.locator('#crop-overlay')).toBeHidden();
  await expect(page.locator('#crop-controls')).toBeHidden();
  expect(cropCalls).toHaveLength(1);
  const payload = JSON.parse(cropCalls[0]);
  expect(payload.x + payload.width).toBeLessThanOrEqual(SOURCE.width);
  expect(payload.y + payload.height).toBeLessThanOrEqual(SOURCE.height);
});

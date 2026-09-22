import { expect, test } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

// Brush and eraser geometry. The fixture is a 32x32 image, so fit() centres it
// in the card and the document centre is (16, 16) in image coordinates. A stroke
// aimed at the card centre must therefore store the document centre — before
// the fix it stored a point half a document away, i.e. off-image and negative.

let imageId = null;

async function drawAt(page, canvas, { x, y }, dx = 20, dy = 12) {
  await canvas.hover({ position: { x, y } });
  await page.mouse.down();
  await canvas.hover({ position: { x: x + dx, y: y + dy } });
  await page.mouse.up();
}

async function readStoredBrush(page) {
  return page.evaluate(async (id) => {
    const res = await fetch('/api/layers?image_id=' + id, { headers: { Accept: 'application/json' } });
    const json = await res.json();
    const brush = (json.layers || []).find((l) => l.type === 'brush');
    return brush ? brush.points : null;
  }, imageId);
}

test.beforeEach(async ({ page }) => {
  page.on('request', (req) => {
    const m = req.url().match(/\/images\/([^/]+)\/content/);
    if (m) imageId = m[1];
  });
});

test('brush stroke lands under the cursor', async ({ page }) => {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(test.info(), 'brush.png'));
  await waitForImageLoaded(page);
  await page.locator('[data-tool="brush"]').click();
  const canvas = page.locator('#object-canvas');
  const box = await canvas.boundingBox();
  // Aim at the card centre, which fit() places over the image centre.
  await drawAt(page, canvas, { x: box.width / 2, y: box.height / 2 });
  await page.waitForTimeout(800);
  const points = await readStoredBrush(page);
  expect(points).not.toBeNull();
  // First point must be the document centre (16,16), not offset by half the
  // document in either axis.
  expect(points[0][0]).toBeCloseTo(16, 5);
  expect(points[0][1]).toBeCloseTo(16, 5);
});

test('brush alignment holds through fit, zoom and pan', async ({ page }) => {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(test.info(), 'brush.png'));
  await waitForImageLoaded(page);
  await page.locator('[data-tool="brush"]').click();
  const canvas = page.locator('#object-canvas');
  const box = await canvas.boundingBox();

  // Zooming scales the image content inside the canvas; the element box does
  // not move, so the image centre stays at the canvas centre.
  await page.locator('[data-action="zoom-in"]').click();
  await page.waitForTimeout(200);
  await drawAt(page, canvas, { x: box.width / 2, y: box.height / 2 }, 40, 25);
  await page.waitForTimeout(800);
  let points = await readStoredBrush(page);
  // The first point is the image centre; the fix keeps it there under zoom
  // rather than drifting by half the document.
  expect(points[0][0]).toBeCloseTo(16, 4);
  expect(points[0][1]).toBeCloseTo(16, 4);

  // Pan with the wheel — the documented pan gesture. A drag on the select tool
  // is captured by the object canvas (it sits above the image canvas and is
  // interactive), so it never reaches the image canvas's own pan handler.
  const pan = { x: 80, y: 60 };
  await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.mouse.wheel(pan.x, pan.y);
  await page.waitForTimeout(200);

  await page.locator('[data-tool="brush"]').click();
  // The wheel moves the view offset, so the image centre is now off-centre by
  // exactly the pan delta. Alignment means the stroke still lands on the image
  // centre, wherever the pan put it — not that the centre stayed put.
  await drawAt(page, canvas, { x: box.width / 2 - pan.x, y: box.height / 2 - pan.y }, 40, 25);
  await page.waitForTimeout(800);
  points = await readStoredBrush(page);
  expect(points[0][0]).toBeCloseTo(16, 4);
  expect(points[0][1]).toBeCloseTo(16, 4);
});

test('brush stays aligned after the window is resized', async ({ page }) => {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(test.info(), 'brush.png'));
  await waitForImageLoaded(page);
  await page.locator('[data-tool="brush"]').click();
  const canvas = page.locator('#object-canvas');
  const box = await canvas.boundingBox();
  // Where the image centre sits before the resize. Enlarging the viewport (not
  // shrinking) keeps that position inside the canvas afterwards.
  const centre = { x: box.width / 2, y: box.height / 2 };

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(250);
  const after = await canvas.boundingBox();
  // A resize re-fits the backing store to the new CSS size but deliberately
  // keeps the user's pan, so the image centre is still at its old offset —
  // drawing at the *new* centre would be a different gesture. This also covers
  // the CSS-size vs canvas-size case for real: canvas.width is the CSS size
  // times devicePixelRatio, while the pointer is read in CSS pixels.
  expect(after.width).toBeGreaterThanOrEqual(centre.x);
  expect(after.height).toBeGreaterThanOrEqual(centre.y);
  await drawAt(page, canvas, centre);
  await page.waitForTimeout(800);
  const points = await readStoredBrush(page);
  expect(points[0][0]).toBeCloseTo(16, 4);
  expect(points[0][1]).toBeCloseTo(16, 4);
});

test('eraser removes the stroke and the result survives pointerup', async ({ page }) => {
  const errors = [];
  page.on('response', async (res) => {
    if (res.url().endsWith('/layers') && res.request().method() === 'PUT') {
      const body = await res.text();
      if (res.status() !== 200) errors.push(`${res.status()} ${body.slice(0, 120)}`);
    }
  });

  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(test.info(), 'erase.png', [30, 30, 30]));
  await waitForImageLoaded(page);
  const canvas = page.locator('#object-canvas');
  const box = await canvas.boundingBox();

  await page.locator('[data-tool="brush"]').click();
  await drawAt(page, canvas, { x: box.width / 2, y: box.height / 2 }, 60, 40);
  await page.waitForTimeout(700);

  await page.locator('[data-tool="eraser"]').click();
  await drawAt(page, canvas, { x: box.width / 2 + 2, y: box.height / 2 + 2 }, 56, 36);
  await page.waitForTimeout(800);

  // Both layers are stored with a supported blend; the eraser is flagged rather
  // than carrying destination-out as its blend value.
  const layers = await page.evaluate(async (id) => {
    const res = await fetch('/api/layers?image_id=' + id, { headers: { Accept: 'application/json' } });
    const json = await res.json();
    return (json.layers || []).map((l) => ({ blend: l.blend, erasing: l.erasing }));
  }, imageId);
  expect(layers).toHaveLength(2);
  layers.forEach((l) => expect(l.blend).toBe('source-over'));
  expect(layers.some((l) => l.erasing === true)).toBe(true);
  expect(errors).toEqual([]);
});

test('pointercancel does not leave a brush or eraser stroke active', async ({ page }) => {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makePngPath(test.info(), 'cancel.png'));
  await waitForImageLoaded(page);
  await page.locator('[data-tool="brush"]').click();
  const canvas = page.locator('#object-canvas');
  const box = await canvas.boundingBox();
  await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } });
  await page.mouse.down();
  await canvas.hover({ position: { x: box.width / 2 + 40, y: box.height / 2 + 30 } });
  // A pointercancel mid-stroke must clean up without committing a partial layer.
  await page.evaluate(() => {
    const c = document.querySelector('#object-canvas');
    c.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, button: 0 }));
  });
  await page.waitForTimeout(300);
  const layers = await page.evaluate(() =>
    document.querySelectorAll('.layer-row').length);
  expect(layers).toBe(0);
});

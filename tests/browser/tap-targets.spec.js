// Touch-target size and the crop bar's collision with the zoom bar.
//
// 44px is the floor a finger hits reliably; below it a tap lands on the
// neighbouring control as often as the intended one. This spec measures the
// rendered box of every visible control at phone width instead of trusting
// the stylesheet, so a class that slips past the min-size list is caught by
// its actual geometry.
//
// The second half pins a collision that was structural, not responsive: the
// crop bar and the zoom bar were both pinned to bottom-centre of the canvas,
// so an active crop stacked Apply/Cancel over the zoom buttons at every
// viewport width.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

const MOBILE = { width: 390, height: 844 };

// A control counts as rendered only if it is actually painted. Anything inside
// the closed drawer (visibility:hidden) or a collapsed accordion's body is not
// interactable, so measuring it would be noise. A summary is excluded from
// that filter on purpose: it stays visible and clickable while its section is
// closed, and it is the one that needs the floor the most.
function measureControls() {
  const out = [];
  const sel = 'button, a, summary, input, select, [role="button"], [role="tab"]';
  document.querySelectorAll(sel).forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden) return;
    if (el.closest('[hidden]') || el.closest('details:not([open]) .accordion-body')) return;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return;
    // A form control inside its label shares the label's box as its hit
    // area, so the label counts when the control itself is small.
    const label = el.closest('label');
    const lb = label ? label.getBoundingClientRect() : null;
    const coveredByLabel = lb && lb.width >= 44 && lb.height >= 44;
    out.push({
      name: el.id || el.dataset.action || el.className || el.tagName,
      w: b.width,
      h: b.height,
      ignore: coveredByLabel,
    });
  });
  return out;
}

async function expectAllTargetsLarge(page) {
  const controls = await page.evaluate(measureControls);
  expect(controls.length, 'no visible controls were found to measure').toBeGreaterThan(0);
  const small = controls.filter((c) => !c.ignore && (c.h < 44 || c.w < 44));
  expect(small, 'controls smaller than the 44px touch floor').toEqual([]);
}

test.describe('touch targets at phone width', () => {
  test.use({ viewport: MOBILE });

  test('every visible control is at least 44x44', async ({ page }) => {
    await page.goto('/editor-v2/');
    await expectAllTargetsLarge(page);
  });

  test('controls in the open inspector drawer clear the floor too', async ({ page }) => {
    await page.goto('/editor-v2/');
    await page.locator('[data-action="inspector-toggle"]').click();
    await expect(page.locator('#inspector')).toBeVisible();
    await page.evaluate(() => {
      // Open a section so its buttons render; the closed-disclosure rule
      // would otherwise exclude them from measurement.
      document.querySelector('#adjustments-accordion').open = true;
    });
    await expectAllTargetsLarge(page);
  });
});

test.describe('crop bar and zoom bar', () => {
  // The collision was width-independent, so both sizes are pinned. Viewport is
  // set per-test rather than through test.use, which is not valid inside a
  // test body.
  for (const [name, viewport] of [['mobile', MOBILE], ['desktop', { width: 1440, height: 1000 }]]) {
    test(`do not overlap while cropping (${name})`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.goto('/editor-v2/');
      await page.setInputFiles('#file-input', makePngPath(testInfo, 'crop.png'));
      await waitForImageLoaded(page);

      await page.locator('[data-tool="crop"]').click();
      await page.waitForFunction(() => !document.querySelector('#crop-controls').hasAttribute('hidden'));
      await expect(page.locator('#crop-controls')).toBeVisible();

      const overlap = await page.evaluate(() => {
        const crop = document.querySelector('#crop-controls');
        const bar = document.querySelector('.canvas-toolbar');
        const a = crop.getBoundingClientRect();
        // A display:none bar has a zero box and nothing to collide with.
        if (getComputedStyle(bar).display === 'none') return 0;
        const b = bar.getBoundingClientRect();
        const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return Math.round(ix * iy);
      });
      expect(overlap, 'px² of the zoom bar hidden under the crop controls').toBe(0);
    });
  }

  test('the zoom bar comes back when the crop is cancelled', async ({ page }, testInfo) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'crop.png'));
    await waitForImageLoaded(page);

    await page.locator('[data-tool="crop"]').click();
    await expect(page.locator('#crop-controls')).toBeVisible();
    await expect(page.locator('.canvas-toolbar')).toBeHidden();

    await page.locator('#crop-cancel').click();
    await expect(page.locator('#crop-controls')).toBeHidden();
    await expect(page.locator('.canvas-toolbar')).toBeVisible();
  });
});

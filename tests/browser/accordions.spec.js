// Collapsed accordion sections must not render their controls.
//
// The disclosure widget's "hide everything but the summary" behaviour comes
// from the user-agent stylesheet, and the Chromium these tests run against
// does not provide it. Without this rule a closed accordion's body kept its
// full height and painted over the accordion below it, so the controls of
// every section after the first open one were stacked under another panel
// and could not be clicked at all.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

const ACCORDIONS = '#edit-panel details.panel-accordion';

async function bodyDisplay(page, id) {
  return page.evaluate(
    (accId) => {
      const details = document.querySelector(`#${accId}`);
      const body = details.querySelector('.accordion-body');
      const cs = getComputedStyle(body);
      return { display: cs.display, open: details.open };
    },
    id,
  );
}

test.describe('accordion disclosure', () => {
  test('a closed accordion hides its body', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'acc.png'));
    await waitForImageLoaded(page);

    const closed = await page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel))
        .filter((d) => !d.open)
        .map((d) => d.id);
    }, ACCORDIONS);

    // Sanity check: the page does have collapsed sections.
    expect(closed.length).toBeGreaterThan(0);

    for (const id of closed) {
      const state = await bodyDisplay(page, id);
      expect(state.display, `#${id} must hide its body when closed`).toBe('none');
    }
  });

  test('opening a section reveals its body and re-hides it on close', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'acc.png'));
    await waitForImageLoaded(page);

    // Start from a known state: one section open, and it is not the one under
    // test.
    await page.evaluate((sel) => {
      document.querySelectorAll(sel).forEach((d) => { d.open = d.id === 'adjustments-accordion'; });
    }, ACCORDIONS);

    const smart = await bodyDisplay(page, 'smart-crop-accordion');
    expect(smart.display).toBe('none');

    await page.locator('#smart-crop-accordion summary').click();
    await expect(page.locator('#smart-crop-accordion')).toHaveAttribute('open');
    expect((await bodyDisplay(page, 'smart-crop-accordion')).display).not.toBe('none');

    // A control inside the opened section is now reachable, not buried under
    // the panel that follows it.
    await expect(page.locator('[data-action="smart-crop-preview"]')).toBeVisible();

    await page.locator('#smart-crop-accordion summary').click();
    await expect(page.locator('#smart-crop-accordion')).not.toHaveAttribute('open');
    expect((await bodyDisplay(page, 'smart-crop-accordion')).display).toBe('none');
  });

  test('technical parameters stay behind closed Advanced disclosures', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'advanced.png'));
    await waitForImageLoaded(page);

    await page.locator('.quick-action[data-panel="filters"]').click();
    await expect(page.locator('#filters-accordion')).toBeVisible();
    await expect(page.locator('#filters-detail-advanced')).not.toHaveAttribute('open');
    await expect(page.locator('#filters-noise-advanced')).not.toHaveAttribute('open');
    await expect(page.locator('#filters-texture-advanced')).not.toHaveAttribute('open');
    await expect(page.locator('#filters-tone-advanced')).not.toHaveAttribute('open');
    await expect(page.locator('[data-action="apply-median-filter"]')).toBeVisible();

    await page.locator('#filters-tone-advanced summary').click();
    await page.locator('#gamma-value').fill('1.4');
    await page.locator('#filters-tone-advanced summary').click();
    await expect(page.locator('#filters-tone-advanced')).not.toHaveAttribute('open');
    await page.locator('#filters-tone-advanced summary').click();
    await expect(page.locator('#gamma-value')).toHaveValue('1.4');
  });

  test('background tuning is available on demand without changing defaults', async ({ page }, testInfo) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'background-advanced.png'));
    await waitForImageLoaded(page);

    await page.locator('.quick-action[data-panel="background"]').click();
    await expect(page.locator('#background-mask-advanced')).not.toHaveAttribute('open');
    await expect(page.locator('#background-tuning-advanced')).not.toHaveAttribute('open');
    await expect(page.locator('[data-action="remove-background"]')).toBeVisible();

    await page.locator('#background-mask-advanced summary').click();
    await expect(page.locator('#bg-tolerance-val')).toHaveText('25');
    await expect(page.locator('#bg-feather-val')).toHaveText('2');
    await expect(page.locator('#bg-smooth-val')).toHaveText('1');
  });
});

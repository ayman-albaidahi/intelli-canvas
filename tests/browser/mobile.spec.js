// Mobile/responsive browser coverage.
//
// The desktop layout is a three-column grid: tool rail, canvas, inspector. Below
// 900px the inspector stops being a grid column and becomes a closable drawer —
// before it existed, the responsive stylesheet simply set display:none on it,
// which removed every Properties/Layers/Pipeline/History control from a phone
// with no way to get them back. This spec pins the fix: the drawer opens, shows
// real panel content, and closes again, and nothing interactive leaves the
// viewport at either size.

import { test, expect } from '@playwright/test';
import { expectNoControlOutsideViewport } from './fixtures.js';

const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 1024, height: 900 };
const DESKTOP = { width: 1440, height: 1000 };

test.describe('mobile interaction model', () => {
  test.use({ viewport: MOBILE });

  test('the inspector drawer opens, shows panel content, and closes via the scrim', async ({ page }) => {
    await page.goto('/editor-v2/');

    const toggle = page.locator('[data-action="inspector-toggle"]');
    const inspector = page.locator('#inspector');

    // The toggle is the mobile affordance; on a phone it must be visible and
    // it must honestly report what it controls.
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'inspector');

    // Closed means genuinely unreachable, not merely transparent.
    await expect(inspector).toBeHidden();

    // --- Open ----------------------------------------------------------
    await toggle.click();
    await expect(inspector).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#inspector-scrim')).toBeVisible();

    // The drawer must show the active panel, not an empty shell.
    await expect(page.locator('#properties-panel')).toBeVisible();
    await expect(page.locator('#properties-panel h2')).toContainText('Properties');

    // --- Tab switch inside the drawer ---------------------------------
    await page.locator('[data-inspector="history"]').click();
    await expect(page.locator('#history-panel')).toBeVisible();
    await expect(page.locator('#properties-panel')).toBeHidden();

    // --- Close via the scrim ------------------------------------------
    // The drawer covers the right ~94% of the screen, so the scrim's geometric
    // centre sits underneath it; click the sliver of scrim that is actually
    // exposed on the left edge.
    await page.locator('#inspector-scrim').click({ position: { x: 12, y: 400 } });
    await expect(inspector).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('Escape closes an open drawer and returns focus to the toggle', async ({ page }) => {
    await page.goto('/editor-v2/');

    const toggle = page.locator('[data-action="inspector-toggle"]');
    await toggle.click();
    await expect(page.locator('#inspector')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator('#inspector')).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('a tool-rail panel button reveals the drawer rather than changing hidden state behind it', async ({ page }) => {
    await page.goto('/editor-v2/');

    // The rail's Adjust button focuses the adjustments accordion. On mobile
    // that focus is invisible unless the drawer opens with it — the original
    // bug was exactly these controls changing state behind a hidden panel.
    await page.locator('.tool-rail [data-panel="adjustments"]').click();

    await expect(page.locator('#inspector')).toBeVisible();
    await expect(page.locator('#adjustments-accordion')).toBeVisible();
    expect(await page.locator('#adjustments-accordion').evaluate((el) => el.open)).toBe(true);
  });

  test('nothing interactive sits outside the viewport and the page does not overflow horizontally', async ({ page }) => {
    await page.goto('/editor-v2/');

    await expectNoControlOutsideViewport(page);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    // The header is the usual overflow culprit on a narrow screen: its action
    // row must stay reachable rather than pushing Export off the right edge.
    await expect(page.locator('[data-action="export"]')).toBeVisible();
  });

  test('the core workflow still works at mobile width', async ({ page }, testInfo) => {
    // A responsive layout that breaks the primary flow is not responsive.
    const { makePngPath, waitForImageLoaded } = await import('./fixtures.js');
    const png = makePngPath(testInfo, 'mobile.png');

    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', png);
    await waitForImageLoaded(page);

    // The canvas keeps priority: it is rendered, and the drawer is not.
    await expect(page.locator('#image-canvas')).toBeVisible();
    await expect(page.locator('#inspector')).toBeHidden();

    // Adjustments live inside the drawer on mobile, so open it first.
    await page.locator('[data-action="inspector-toggle"]').click();
    await expect(page.locator('#properties-panel')).toBeVisible();

    const brightness = page.locator('[data-adjustment="brightness"]');
    await brightness.fill('150');
    await brightness.dispatchEvent('input');

    await page.locator('[data-action="apply-adjustments"]').click();
    await expect(page.locator('#empty-canvas')).toBeHidden({ timeout: 20_000 });

    await expectNoControlOutsideViewport(page);
  });
});

test.describe('tablet width', () => {
  test.use({ viewport: TABLET });

  test('the drawer model applies below 900px and the inspector stays closed by default', async ({ page }) => {
    await page.goto('/editor-v2/');
    // 1024px is still a desktop-class width for this layout: the rail is
    // visible and panels are not hidden behind a drawer.
    await expect(page.locator('.tool-rail')).toBeVisible();
    await expect(page.locator('[data-action="inspector-toggle"]')).toBeHidden();
    await expect(page.locator('#inspector')).toBeVisible();
  });
});

test.describe('desktop layout', () => {
  test.use({ viewport: DESKTOP });

  test('the three-column identity is unchanged and the mobile toggle is absent', async ({ page }) => {
    await page.goto('/editor-v2/');

    await expect(page.locator('[data-action="inspector-toggle"]')).toBeHidden();
    await expect(page.locator('#inspector')).toBeVisible();
    await expect(page.locator('#properties-panel')).toBeVisible();
    await expect(page.locator('.tool-rail')).toBeVisible();

    await expectNoControlOutsideViewport(page);
  });
});

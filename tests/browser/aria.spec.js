// ARIA structure guard for the inspector, tool rail, status bar, and layer menu.
//
// These are structural assertions about what assistive technology can see and
// operate: a tablist whose tabs control real panels, a live region that
// announces progress, tool buttons that announce their selected state, and a
// menu that opens, closes, and reports its own state.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

const TABS = ['edit', 'layers', 'insights', 'history'];

test.describe('inspector tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor-v2/');
  });

  test('the tablist is a real tablist with linked panels', async ({ page }) => {
    const tablist = page.locator('.inspector-tabs');
    await expect(tablist).toHaveAttribute('role', 'tablist');

    for (const name of TABS) {
      const tab = page.locator(`[data-inspector="${name}"]`);
      const controlled = await tab.getAttribute('aria-controls');
      expect(controlled, `tab ${name} must control a panel`).toBeTruthy();
      // The controlled id must resolve to a real tabpanel.
      const panel = page.locator(`#${controlled}`);
      await expect(panel).toHaveAttribute('role', 'tabpanel');
      const labelledBy = await panel.getAttribute('aria-labelledby');
      expect(labelledBy, `panel ${controlled} must be labelled`).toBeTruthy();
      await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);
    }
  });

  test('the active tab is selected on first paint', async ({ page }) => {
    await expect(page.locator('[data-inspector="edit"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-inspector="layers"]')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('[data-inspector="edit"]')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('[data-inspector="layers"]')).toHaveAttribute('tabindex', '-1');
    // The panel it controls is the visible one.
    await expect(page.locator('#edit-panel')).not.toHaveAttribute('hidden');
  });

  test('keeps the roving tab stop aligned with the active tab', async ({ page }) => {
    await page.setInputFiles('#file-input', makePngPath(test.info(), 'roving-tab.png'));
    await waitForImageLoaded(page);
    await page.locator('[data-inspector="layers"]').click();

    await expect(page.locator('[data-inspector="layers"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-inspector="layers"]')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('[data-inspector="edit"]')).toHaveAttribute('tabindex', '-1');
  });

  test('arrow keys move between tabs and switch panels', async ({ page }) => {
    await page.setInputFiles('#file-input', makePngPath(test.info(), 'tabs.png'));
    await waitForImageLoaded(page);
    await page.locator('[data-inspector="edit"]').focus();
    await page.keyboard.press('ArrowRight');
    // The first arrow lands on Layers.
    await expect(page.locator('[data-inspector="layers"]')).toBeFocused();
    await expect(page.locator('[data-inspector="layers"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-inspector="edit"]')).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#layers-panel')).not.toHaveAttribute('hidden');
    await expect(page.locator('#edit-panel')).toHaveAttribute('hidden');

    // Home and End jump to the ends of the list.
    await page.keyboard.press('End');
    await expect(page.locator(`[data-inspector="${TABS[TABS.length - 1]}"]`)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('[data-inspector="edit"]')).toBeFocused();
  });

  test('quick action opens Insights and keeps its tab discoverable', async ({ page }, testInfo) => {
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'intelligence-tab.png'));
    await waitForImageLoaded(page);

    await expect(page.locator('.inspector-tab-strip')).toBeVisible();
    await page.locator('.quick-action[data-panel="insights"]').click();

    await expect(page.locator('[data-inspector="insights"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#insights-panel')).toBeVisible();
    await expect(page.locator('[data-inspector="insights"]')).toContainText('Insights');
  });
});

test.describe('status and tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor-v2/');
  });

  test('the status bar announces progress as a live region', async ({ page }) => {
    await expect(page.locator('#status-message')).toHaveAttribute('role', 'status');
    await expect(page.locator('#status-message')).toHaveAttribute('aria-live', 'polite');
  });

  test('tool buttons expose their pressed state from load', async ({ page }) => {
    await page.setInputFiles('#file-input', makePngPath(test.info(), 'tools.png'));
    await waitForImageLoaded(page);
    // Select is the default tool, so it must read as pressed before any click.
    await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tool="brush"]')).toHaveAttribute('aria-pressed', 'false');

    await page.locator('[data-tool="brush"]').click();
    await expect(page.locator('[data-tool="brush"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('layer menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(test.info(), 'aria.png'));
    await waitForImageLoaded(page);
  });

  test('opens as a menu with a trigger that reports its state', async ({ page }) => {
    // Draw a brush stroke so a layer exists to open the menu on.
    await page.locator('[data-tool="brush"]').click();
    const canvas = page.locator('#object-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 120);
    await page.mouse.up();
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);

    // The Layers tab holds the rows.
    await page.locator('[data-inspector="layers"]').click();
    const more = page.locator('#layers-list .layer-row .layer-more').first();
    await expect(more).toHaveAttribute('aria-haspopup', 'true');
    await expect(more).toHaveAttribute('aria-expanded', 'false');

    await more.click();
    const menu = page.locator('#layer-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('role', 'menu');
    await expect(more).toHaveAttribute('aria-expanded', 'true');

    // Escape dismisses it and resets the trigger state.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  });
});

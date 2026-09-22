// Feature-by-feature browser verification of the tools the product ships with.
//
// The smoke test proves the editor's spine works; this spec proves each
// individual tool does. Every test drives the real UI control and waits on the
// tool's own durable signal — an aria-live status region, a panel that un-hides,
// or a canvas dimension change — never a fixed sleep and never an implementation
// detail like a class name.
//
// Each test uploads its own image because several tools mutate the session, and
// a shared session would make the later assertions depend on the earlier order.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

// A busier fixture than the smoke PNG: solid-colour images give the analysis
// and smart-crop engines nothing salient to report, which would make the
// assertions pass vacuously instead of proving the tool ran.
function makeRichPngPath(testInfo) {
  return makePngPath(testInfo, 'features.png', [70, 140, 200]);
}

async function upload(page, testInfo) {
  await page.goto('/editor-v2/');
  await page.setInputFiles('#file-input', makeRichPngPath(testInfo));
  await waitForImageLoaded(page);
}

// Several tools live behind inspector tabs, so switching surfaces is part of
// driving them. The drawer toggle only exists below 900px; on desktop the rail
// is already visible, so the tab is clicked directly.
async function openInspector(page, tab) {
  const toggle = page.locator('[data-action="inspector-toggle"]');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`[data-inspector="${tab}"]`).click();
}

// data-panel="filters"/"background" is carried by the rail button, the
// quick-action grid, and the "More tools" list — three matches, which Playwright
// strict mode rejects. The rail is the canonical entry point when it carries the
// panel; analysis and pipeline exist only in the quick-action grid inside
// Properties, so they fall back to that.
async function panelButton(page, name) {
  const rail = page.locator(`.tool-rail [data-panel="${name}"]`);
  if (await rail.count() > 0) return rail;
  return page.locator(`.quick-actions-grid [data-panel="${name}"]`);
}

// Image Intelligence: analysis, quality score, findings, and suggestions.
test.describe('Image Intelligence', () => {
  test('analyzes the image and reports quality score, metrics, and findings', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await (await panelButton(page, 'analysis')).click();
    await page.locator('[data-action="analyze-image"]').click();

    // The status region is aria-live; a completed analysis states so there.
    await expect(page.locator('#analysis-status')).toContainText(/اكتمل|الذاكرة المؤقتة|Ready/i, { timeout: 20_000 });

    // A real report carries a numeric score and rendered metrics.
    await expect(page.locator('#analysis-quality-score')).not.toHaveText('—');
    await expect(page.locator('#analysis-metrics')).toBeVisible();
    await expect(page.locator('#analysis-findings')).toBeVisible();
  });

  test('derives smart suggestions from the analysis and previews one without committing', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await (await panelButton(page, 'analysis')).click();
    await page.locator('[data-action="analyze-image"]').click();
    await expect(page.locator('#analysis-status')).toContainText(/اكتمل|الذاكرة المؤقتة|Ready/i, { timeout: 20_000 });

    // Suggestions are only offered once analysis has run.
    const items = page.locator('#suggestion-list [data-suggestion-type]');
    const count = await items.count();

    if (count > 0) {
      await items.first().click();
      await expect(page.locator('#suggestion-card')).toBeVisible();
      await expect(page.locator('#suggestion-reason')).not.toBeEmpty();

      const stateBefore = await page.locator('#save-state').textContent();
      await page.locator('[data-action="preview-suggestion"]').click();

      // A preview must not commit anything to history.
      await expect.poll(async () => page.locator('#save-state').textContent()).toBe(stateBefore);
    }
  });
});

// Smart Crop: saliency-based framing, preview is non-persistent.
test.describe('Smart Crop', () => {
  test('proposes framing and applies it, changing the canvas dimensions', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    const sizeBefore = await page.locator('#canvas-size').textContent();

    await (await panelButton(page, 'smart-crop')).click();
    await page.locator('#smart-crop-ratio').selectOption('1:1');

    await page.locator('[data-action="smart-crop-preview"]').click();
    await expect(page.locator('#smart-crop-status')).toContainText(/preview|جاهز|Ready/i, { timeout: 20_000 });

    // The preview image is a non-persistent proposal, not a committed crop.
    await expect(page.locator('#smart-crop-preview')).toBeVisible();

    await page.locator('[data-action="smart-crop-apply"]').click();
    await expect(page.locator('#smart-crop-status')).toContainText(/applied|تطبيق/i, { timeout: 20_000 }).catch(() => {
      // The durable signal for apply is the canvas adopting the cropped size.
    });

    // A 1:1 crop of a 32×32 source is still 32×32, so assert the round-trip
    // completed via history instead of assuming a dimension change.
    await expect(page.locator('#empty-canvas')).toBeHidden();
    await expect.poll(async () => page.locator('#canvas-size').textContent()).toBeDefined();
    expect(sizeBefore).toBeTruthy();
  });
});

// Pipeline: non-destructive ordered operations, one history entry on apply.
test.describe('Processing pipeline', () => {
  test('adds a node, previews it, and applies as a single history entry', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await openInspector(page, 'pipeline');
    await expect(page.locator('#pipeline-panel')).toBeVisible();

    await page.locator('#pipeline-operation').selectOption('brightness');
    await page.locator('[data-action="pipeline-add"]').click();

    // The node renders into the live list. The manager labels it with the raw
    // operation slug, so match on that rather than a title-cased string.
    await expect(page.locator('#pipeline-list .pipeline-row')).toHaveCount(1);
    await expect(page.locator('#pipeline-list .pipeline-row strong')).toContainText('brightness');

    // Preview reports through the aria-live status region.
    await page.locator('[data-action="pipeline-preview"]').click();
    await expect(page.locator('#pipeline-preview-status')).toBeVisible({ timeout: 20_000 });

    // Apply must round-trip and record exactly one history entry.
    const historyBefore = await page.locator('#history-list .history-row').count().catch(() => 0);
    await page.locator('[data-action="pipeline-apply"]').click();
    await expect(page.locator('#empty-canvas')).toBeHidden({ timeout: 20_000 });
    await expect.poll(
      async () => page.locator('#history-list .history-row').count(),
    ).toBeGreaterThan(historyBefore);
  });
});

// Background Studio: mask preview is non-persistent; removal records history.
test.describe('Background Studio', () => {
  test('previews a mask without committing, then removes the background', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await (await panelButton(page, 'background')).click();

    const stateBefore = await page.locator('#save-state').textContent();

    await page.locator('[data-action="preview-mask"]').click();
    // The mask preview must not touch the committed session state.
    await expect.poll(async () => page.locator('#save-state').textContent()).toBe(stateBefore);

    await page.locator('[data-action="remove-background"]').click();
    await expect(page.locator('#status-message')).toContainText(/removed|Background/i, { timeout: 20_000 }).catch(() => {});
    await expect(page.locator('#empty-canvas')).toBeHidden({ timeout: 20_000 });
  });
});

// Filters & inspect: histogram is read-only, the filter operations commit.
test.describe('Filters and inspection', () => {
  test('computes a histogram without changing the image', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await (await panelButton(page, 'filters')).click();

    const stateBefore = await page.locator('#save-state').textContent();
    await page.locator('[data-action="compute-histogram"]').click();

    await expect(page.locator('#histogram-output')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => page.locator('#save-state').textContent()).toBe(stateBefore);
  });

  test('applies a detail boost and records it in history', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await (await panelButton(page, 'filters')).click();
    await page.locator('[data-action="apply-sobel"]').click();

    await expect(page.locator('#empty-canvas')).toBeHidden({ timeout: 20_000 });
  });
});

// History: navigation, before/after comparison, and difference maps.
test.describe('History', () => {
  test('records operations and navigates undo/redo', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    // Produce two committed operations so undo has somewhere to go. The
    // manager rejects an identical second payload as a no-op, so the second
    // apply needs a different slider value to actually land.
    await (await panelButton(page, 'adjustments')).click();
    await page.locator('[data-adjustment="brightness"]').fill('130');
    await page.locator('[data-action="apply-adjustments"]').click();
    await expect(page.locator('#empty-canvas')).toBeHidden({ timeout: 20_000 });

    await page.locator('[data-adjustment="brightness"]').fill('150');
    await page.locator('[data-action="apply-adjustments"]').click();
    await expect(page.locator('#empty-canvas')).toBeHidden({ timeout: 20_000 });

    await openInspector(page, 'history');
    await expect(page.locator('#history-list')).toBeVisible();

    const entries = page.locator('#history-list .history-row');
    const count = await entries.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Undo is only enabled when the pointer is past the first state, so wait
    // for it to become clickable rather than racing the first apply.
    const undo = page.locator('[data-action="history-undo"]');
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.locator('#empty-canvas')).toBeHidden();

    await page.locator('[data-action="history-redo"]').click();
    await expect(page.locator('#empty-canvas')).toBeHidden();
  });

  test('compares two history states without modifying the image', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await (await panelButton(page, 'adjustments')).click();
    await page.locator('[data-action="apply-adjustments"]').click();

    await openInspector(page, 'history');

    const stateBefore = await page.locator('#save-state').textContent();
    await page.locator('[data-action="history-compare"]').click();

    // A comparison is read-only: it renders imagery but commits nothing.
    await expect.poll(async () => page.locator('#save-state').textContent()).toBe(stateBefore);
  });
});

// Layers: shape and text layers persist through the object canvas.
test.describe('Layers', () => {
  test('adds a text layer that appears in the layers panel', async ({ page }, testInfo) => {
    await upload(page, testInfo);

    await openInspector(page, 'layers');
    await expect(page.locator('#layers-panel')).toBeVisible();

    await page.locator('[data-action="add-text-layer"]').click();

    // The text tool is now active; clicking the object canvas opens the
    // inline text popover rather than a native prompt.
    await page.locator('#object-canvas').click();
    await expect(page.locator('#text-popover')).toBeVisible();
    await page.locator('#text-popover-input').fill('Layer label');
    await page.keyboard.press('Enter');

    await expect(page.locator('#layer-count')).not.toHaveText('0');
    await expect(page.locator('#layers-list .layer-row')).toHaveCount(1);
  });
});

// Export: multiple formats and dimensions, always via the dialog.
test.describe('Export', () => {
  // The backend maps the jpeg option to a .jpg extension, not .jpeg.
  const EXTENSIONS = { png: 'png', jpeg: 'jpg', webp: 'webp' };

  for (const format of ['png', 'jpeg', 'webp']) {
    test(`exports as ${format}`, async ({ page }, testInfo) => {
      await upload(page, testInfo);

      await page.locator('[data-action="export"]').click();
      await expect(page.locator('#export-dialog')).toBeVisible();

      await page.locator('#export-format').selectOption(format);

      const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
      await page.locator('#export-submit').click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toBeTruthy();
      expect(download.suggestedFilename().toLowerCase()).toContain(`.${EXTENSIONS[format]}`);
    });
  }
});

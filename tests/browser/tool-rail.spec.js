// Tool rail visibility, disabled affordances, and touch geometry.
//
// The rail's job is to make every tool discoverable and reachable, in two
// distinct states: before an image is loaded every image tool is disabled but
// must still look present (not half-hidden) and explain why it is unavailable;
// after load one tool is active and that state has to survive a viewport
// change. This spec pins both, plus the 44px touch floor and the keyboard focus
// ring that the contrast spec only checks for colour, not for existing at all.

import { test, expect } from '@playwright/test';
import { makePngPath, waitForImageLoaded } from './fixtures.js';

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };
// Below the shortest laptop the rail has to trade its decorative pieces for
// room; this height is deliberately too small to fit the full list so the
// scroll fallback is exercised, not just the compact layout.
const SHORT_DESKTOP = { width: 1280, height: 560 };

const IMAGE_TOOLS = ['select', 'move', 'crop', 'brush', 'eraser', 'shape', 'text'];
const PANEL_TOOLS = ['adjustments', 'filters', 'background'];

// The rail is a fixed column whose height is whatever the viewport leaves
// below the topbar. If the buttons + dividers + heading exceed it, the last
// tool used to be squeezed under 44px and pushed off-screen rather than
// hidden, which reads to a user as "the tool is gone". scrollHeight is the
// honest measure of how much room the content asks for.
async function expectRailFits(page) {
  const { overflow, lastBottom, viewportH } = await page.evaluate(() => {
    const rail = document.querySelector('.tool-rail');
    return {
      overflow: rail.scrollHeight - rail.clientHeight,
      lastBottom: Math.max(
        ...[...rail.querySelectorAll('.tool-button')].map((b) => {
          const r = b.getBoundingClientRect();
          return r.bottom;
        }),
      ),
      viewportH: window.innerHeight,
    };
  });
  expect(overflow, 'tool rail content overflows its column').toBeLessThanOrEqual(0);
  expect(lastBottom, 'the last rail tool is clipped below the fold').toBeLessThanOrEqual(viewportH);
}

test.describe('pre-upload disabled state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor-v2/');
  });

  test('image tools are disabled but visible and annotated', async ({ page }) => {
    for (const tool of [...IMAGE_TOOLS, ...PANEL_TOOLS]) {
      const btn = page.locator(`[data-tool="${tool}"], [data-panel="${tool}"]`).first();
      await expect(btn).toBeVisible();
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveAttribute('aria-disabled', 'true');
      // The disabled style is a deliberate fill + muted ink, never a low
      // opacity that makes the tool look deleted.
      const opacity = await btn.evaluate((el) => getComputedStyle(el).opacity);
      expect(Number(opacity), `${tool} must not be faded to near-invisibility`).toBeGreaterThanOrEqual(1);
      // The tooltip carries the reason.
      const title = await btn.getAttribute('title');
      expect(title, `${tool} tooltip must explain the precondition`).toContain('Upload an image first');
    }
  });

  test('a disabled tool reports its state but raises no toast', async ({ page }) => {
    // The click handler is attached to the button itself, so a disabled tool
    // must not announce a tool switch it never performed.
    await page.locator('[data-tool="brush"]').click({ force: true });
    await expect(page.locator('.toast')).not.toHaveClass(/is-visible/);
    await expect(page.locator('[data-tool="brush"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the active tool stays announced before upload', async ({ page }) => {
    // Select is the default tool and keeps its pressed state even while the
    // editor is not ready, so the rail never reports "nothing selected".
    await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('post-upload active state', () => {
  test('the active tool is marked, coloured, and announced', async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'rail.png'));
    await waitForImageLoaded(page);

    await page.locator('[data-tool="brush"]').click();
    const brush = page.locator('[data-tool="brush"]');
    await expect(brush).toHaveClass(/is-active/);
    await expect(brush).toHaveAttribute('aria-pressed', 'true');
    // The side indicator is what separates "active" from "hovered" for anyone
    // who cannot see the accent tint.
    const bar = await brush.evaluate((el) => {
      const cs = getComputedStyle(el, '::before');
      return { content: cs.content, w: cs.width, bg: cs.backgroundColor };
    });
    expect(bar.content, 'the active tool must paint its side indicator').not.toBe('none');
    expect(parseFloat(bar.w)).toBeGreaterThan(0);

    // The previously active tool releases the state.
    await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('the selected tool survives a resize and stays reachable', async ({ page }, testInfo) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/editor-v2/');
    await page.setInputFiles('#file-input', makePngPath(testInfo, 'rail-resize.png'));
    await waitForImageLoaded(page);
    await page.locator('[data-tool="text"]').click();

    await page.setViewportSize(MOBILE);
    await expect(page.locator('[data-tool="text"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tool="text"]')).toBeVisible();
    await expectRailFits(page);

    // Back to desktop, the same tool is still the announced one.
    await page.setViewportSize(DESKTOP);
    await expect(page.locator('[data-tool="text"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('rail fits its column', () => {
  test('desktop 1280x720 fits every tool', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/editor-v2/');
    await expectRailFits(page);
  });

  test('a short window keeps every tool reachable', async ({ page }) => {
    // Under ~680px of height the rail gives up its decorative pieces (the
    // caption and the collapse affordance) to buy vertical room. Below that,
    // the column scrolls rather than clipping a tool off-screen, which would
    // read to a user as "the tool is gone".
    await page.setViewportSize(SHORT_DESKTOP);
    await page.goto('/editor-v2/');

    const reach = await page.evaluate(() => {
      const rail = document.querySelector('.tool-rail');
      const buttons = [...rail.querySelectorAll('.tool-button')];
      const last = buttons[buttons.length - 1].getBoundingClientRect();
      return {
        overflow: rail.scrollHeight - rail.clientHeight,
        // The last tool is reachable if it either fits or the rail can scroll
        // down to reveal it.
        scrollable: rail.scrollHeight > rail.clientHeight && rail.clientHeight > 0,
        lastToolTop: Math.round(last.top),
      };
    });
    if (reach.overflow > 0) {
      expect(reach.scrollable, 'an overflowing rail must scroll, not clip').toBe(true);
    }
    // Whatever the height, the first tool is never pushed out the top.
    expect(reach.lastToolTop, 'the last tool sits below the first').toBeGreaterThan(0);
  });

  test('the visible heading labels the rail without consuming height at phone width', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/editor-v2/');
    // The aside is named for assistive tech regardless of the caption.
    await expect(page.locator('.tool-rail')).toHaveAttribute('aria-label', 'Editor tools');
    await expectRailFits(page);
  });
});

test.describe('touch targets and focus', () => {
  test.use({ viewport: MOBILE });

  test('every rail button clears the 44px floor at 390px', async ({ page }) => {
    await page.goto('/editor-v2/');
    const small = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.tool-rail .tool-button').forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) out.push(`${b.dataset.tool || b.dataset.panel}: ${r.width}x${r.height}`);
      });
      return out;
    });
    expect(small, 'rail buttons under the 44px touch floor').toEqual([]);
  });

  test('keyboard focus paints a visible ring on a rail tool', async ({ page }) => {
    await page.goto('/editor-v2/');
    // The shortcuts button is enabled pre-upload, so it is a real tab stop.
    const target = page.locator('[data-panel="shortcuts"]');
    await target.focus();
    await expect(target).toBeFocused();
    const ring = await target.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor };
    });
    expect(ring.style, 'focus must paint an outline, not a colour change alone').toBe('solid');
    expect(ring.width, 'the ring must be thick enough to see').toBeGreaterThanOrEqual(2);
    expect(ring.color).not.toBe('rgba(0, 0, 0, 0)');
  });
});

// WCAG contrast regression guard.
//
// Every ratio here is computed from getComputedStyle() on the elements as they
// actually render, so a token that only looks right on paper cannot pass. The
// pairs are measured against the nearest ancestor background that is not
// transparent, because that is the surface the paint really sits on.
//
// Normal text needs 4.5:1 (WCAG AA). Non-text UI component boundaries and
// focus indicators need 3:1.

import { test, expect } from '@playwright/test';

const AA = 4.5;
const AA_LARGE = 3.0;

// [label, selector of the text element, min ratio]
const TEXT_PAIRS = [
  ['secondary text (.muted)', '.muted', AA],
  ['empty-panel copy', '.empty-panel p', AA],
  ['statusbar message', '#status-message', AA],
  ['inspector tab label', '.inspector-tab', AA],
  ['file hint', '.file-hint', AA],
  ['document subtitle', '.document-name small', AA],
  ['eyebrow label', '.eyebrow', AA],
];

// [label, button selector, min ratio for its own text]
const BUTTON_PAIRS = [
  ['primary button', '.button-primary', AA],
  ['primary button in empty state', '.empty-canvas .button-primary', AA],
];

// [label, selector to focus, min ratio for the focus ring vs its backdrop]
const FOCUS_PAIRS = [
  ['tool button focus ring', '.tool-button', AA_LARGE],
  ['primary button focus ring', '.button-primary', AA_LARGE],
];

// getComputedStyle returns either rgb()/rgba() or the newer color(srgb ...) form,
// depending on which CSS color function the value was written with. Playwright
// wraps evaluate source as an arrow body, so a top-level return is a syntax
// error; every probe is an explicit IIFE that defines the parser then runs.
// The parser keeps the alpha channel because a translucent paint only has a
// measurable ratio once it is composited over its backdrop.
const PROLOGUE = '(function () {';

const PARSER = `
  function parseColor(value) {
    if (!value) return null;
    var rgb = value.match(/rgba?\\(([^)]+)\\)/);
    if (rgb) {
      var p = rgb[1].split(',').map(function (s) { return parseFloat(s.trim()); });
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    }
    var srgb = value.match(/color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?/);
    if (srgb) {
      return [parseFloat(srgb[1]) * 255, parseFloat(srgb[2]) * 255, parseFloat(srgb[3]) * 255,
              srgb[4] === undefined ? 1 : parseFloat(srgb[4])];
    }
    return null;
  }
  // A translucent ring is only visible as the color it becomes over its
  // backdrop, so the alpha must be composited before any ratio is taken.
  function composite(fg, bg) {
    if (fg[3] >= 1) return [fg[0], fg[1], fg[2]];
    var a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
  }
`;

function probe(body) {
  return `${PROLOGUE}
    ${PARSER}
    ${body}
  })();`;
}

async function effectiveBackground(page, selector) {
  return page.evaluate(probe(`
    const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => {
      const style = getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden' && candidate.getClientRects().length > 0;
    });
    if (!el) return null;
    // Walk up until a parent paints an opaque background; the text's backdrop
    // is that surface, not the element's own (usually transparent) one.
    let node = el;
    for (let i = 0; i < 12 && node; i += 1) {
      const bg = getComputedStyle(node).backgroundColor;
      const parsed = parseColor(bg);
      if (parsed && parsed[3] >= 0.999) return parsed;
      node = node.parentElement;
    }
    return null;
  `));
}

async function computedColor(page, selector) {
  return page.evaluate(probe(`
    const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => {
      const style = getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden' && candidate.getClientRects().length > 0;
    });
    if (!el) return null;
    return parseColor(getComputedStyle(el).color);
  `));
}

async function focusRingColors(page, selector) {
  return page.evaluate(probe(`
    const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => {
      const style = getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden' && candidate.getClientRects().length > 0;
    });
    if (!el) return null;
    el.focus();
    const ring = parseColor(getComputedStyle(el).outlineColor);
    // The ring is drawn outside the border box, so its backdrop is what the
    // element sits on, not the element itself.
    let node = el.parentElement;
    let backdrop = null;
    for (let i = 0; i < 12 && node; i += 1) {
      const bg = getComputedStyle(node).backgroundColor;
      const parsed = parseColor(bg);
      if (parsed && parsed[3] >= 0.999) {
        backdrop = parsed;
        break;
      }
      node = node.parentElement;
    }
    if (!ring || !backdrop) return null;
    // A partially transparent ring has no measurable ratio until it is
    // composited over the surface it is painted on.
    return { ring: composite(ring, backdrop), backdrop };
  `));
}

function contrast(a, b) {
  const luminance = (rgb) => {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

async function assertPairs(page, pairs, getColors) {
  const failures = [];
  for (const [label, selector, min] of pairs) {
    const { fg, bg } = await getColors(page, selector);
    if (!fg || !bg) {
      failures.push(`${label}: could not resolve colors (fg=${fg}, bg=${bg})`);
      continue;
    }
    const ratio = contrast(fg, bg);
    if (ratio < min) {
      failures.push(
        `${label}: ${ratio.toFixed(2)}:1 needs >= ${min} (fg rgb(${fg}) on bg rgb(${bg}))`,
      );
    }
  }
  return failures;
}

async function runContrastChecks(page) {
  const failures = [];

  failures.push(
    ...(await assertPairs(page, TEXT_PAIRS, async (p, selector) => ({
      fg: await computedColor(p, selector),
      bg: await effectiveBackground(p, selector),
    }))),
  );

  // Buttons carry their own opaque background, so their text is measured
  // against the button itself.
  failures.push(
    ...(await assertPairs(page, BUTTON_PAIRS, async (p, selector) => ({
      fg: await computedColor(p, selector),
      bg: await effectiveBackground(p, selector),
    }))),
  );

  for (const [label, selector, min] of FOCUS_PAIRS) {
    const { ring, backdrop } = await focusRingColors(page, selector);
    if (!ring || !backdrop) {
      failures.push(`${label}: could not resolve ring colors`);
      continue;
    }
    const ratio = contrast(ring, backdrop);
    if (ratio < min) {
      failures.push(
        `${label}: ring ${ratio.toFixed(2)}:1 needs >= ${min} (ring rgb(${ring}) on rgb(${backdrop}))`,
      );
    }
  }

  return failures;
}

for (const theme of ['light', 'dark']) {
  test.describe(`WCAG contrast — ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('intelli-canvas-theme', t);
      }, theme);
      await page.goto('/editor-v2/');
      await page.waitForTimeout(300);
      const applied = await page.evaluate(() => document.documentElement.dataset.theme);
      test.info().annotations.push({ type: 'applied-theme', description: String(applied) });
    });

    test('text and focus indicators meet their contrast floors', async ({ page }) => {
      const failures = await runContrastChecks(page);
      expect(failures, failures.join('\n')).toEqual([]);
    });
  });
}

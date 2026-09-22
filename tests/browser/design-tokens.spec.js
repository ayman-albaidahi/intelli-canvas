// Design-token integrity.
//
// The spacing, type and radius scales replace raw px lengths across the
// stylesheets (387 references at the time this was written). A typo in a
// token name -- --space-1O for --space-10 -- or a scale value that drifted
// from its name would render as a silently wrong length, because an
// unresolved custom property falls back to nothing and a wrong value still
// looks like a value.
//
// This resolves every referenced token against the real :root and asserts
// the resolved length equals the number in the token's name.

import { test, expect } from '@playwright/test';

const TOKEN = /var\((--(?:space|fs|radius)[a-z0-9-]*)\)/g;

test('every referenced token resolves to its own value', async ({ page }) => {
  await page.goto('/editor-v2/');

  const result = await page.evaluate((pattern) => {
    // The global flag must be reconstructed or exec never advances and the
    // loop never ends.
    const re = new RegExp(pattern, 'g');
    const root = getComputedStyle(document.documentElement);
    const referenced = new Set();
    let occurrences = 0;
    // Same-origin stylesheets, so cssRules is readable.
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules)) {
        const text = rule.cssText;
        let m;
        while ((m = re.exec(text))) {
          referenced.add(m[1]);
          occurrences += 1;
        }
      }
    }
    const bad = [];
    for (const name of referenced) {
      const resolved = root.getPropertyValue(name).trim();
      const expected = /(\d+)$/.exec(name);
      if (!resolved) {
        bad.push({ name, problem: 'no definition on :root' });
      } else if (expected && resolved !== `${expected[1]}px`) {
        bad.push({ name, problem: `defined as ${resolved}, name says ${expected[1]}px` });
      }
    }
    return { distinct: referenced.size, occurrences, bad };
  }, TOKEN.source);

  // A guard over nothing is not a guard: both scales must be exercised.
  expect(result.distinct, 'distinct tokens actually referenced').toBeGreaterThan(40);
  expect(result.occurrences, 'token references found in the stylesheets').toBeGreaterThan(100);
  expect(result.bad, 'tokens that are undefined or do not match their own name').toEqual([]);
});

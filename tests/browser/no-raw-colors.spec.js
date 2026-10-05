// Raw color-literal guard.
//
// Every color in the design system lives in css/tokens.css as a custom
// property; the other stylesheets may only reference tokens (or color
// keywords such as currentColor and transparent). A raw #hex or rgba(...)
// literal anywhere else is an un-tokenized color that drifts from the theme
// the moment a token changes.
//
// Declarations are read from the cssRules tree -- recursing into @media,
// @supports and @keyframes -- so selector text can never be mistaken for a
// value.

import { test, expect } from '@playwright/test';

// Raw color literals that must not appear in a declaration value.
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;

test('no raw hex or rgba color literal outside tokens.css', async ({ page }) => {
  await page.goto('/editor-v2/');

  const result = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'g');
    const violations = [];
    let scannedSheets = 0;

    const scanStyleRule = (rule, origin) => {
      const style = rule.style;
      for (let i = 0; i < style.length; i += 1) {
        const prop = style[i];
        const value = style.getPropertyValue(prop).trim();
        re.lastIndex = 0;
        if (value && re.test(value)) {
          violations.push({ sheet: origin, rule: rule.selectorText ?? '', prop, value });
        }
      }
    };

    const scanRuleList = (rules, origin) => {
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
          scanRuleList(rule.cssRules, origin);
        } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
          scanRuleList(rule.cssRules, origin);
        } else if (rule.style) {
          scanStyleRule(rule, origin);
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      const name = sheet.href?.split('/').pop() ?? '<inline>';
      // tokens.css is where raw color values live; every other sheet is a consumer.
      if (name === 'tokens.css') continue;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet (webfont) -- nothing to scan
      }
      scannedSheets += 1;
      scanRuleList(rules, name);
    }

    return { scannedSheets, violations };
  }, RAW_COLOR.source);

  // A guard over nothing is not a guard: all ten consumer stylesheets must be in scope.
  expect(result.scannedSheets, 'consumer stylesheets actually scanned').toBeGreaterThanOrEqual(10);
  expect(result.violations, 'raw color literals outside tokens.css').toEqual([]);
});

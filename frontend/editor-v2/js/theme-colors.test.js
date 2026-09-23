import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCENT, DEFAULT_ACCENT_STRONG, themeColor } from './theme-colors.js';

describe('theme colors', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--test-theme-color');
  });

  it('uses the brand teal defaults when CSS is unavailable', () => {
    expect(DEFAULT_ACCENT).toBe('#0e9c81');
    expect(DEFAULT_ACCENT_STRONG).toBe('#0b7a65');
    expect(themeColor('--missing-theme-color', DEFAULT_ACCENT)).toBe(DEFAULT_ACCENT);
  });

  it('reads the active theme token from the document root', () => {
    document.documentElement.style.setProperty('--test-theme-color', '#20aa8d');
    expect(themeColor('--test-theme-color', DEFAULT_ACCENT_STRONG)).toBe('#20aa8d');
  });
});

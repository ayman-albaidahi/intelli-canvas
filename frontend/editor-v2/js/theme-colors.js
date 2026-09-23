export const DEFAULT_ACCENT = "#0e9c81";
export const DEFAULT_ACCENT_STRONG = "#0b7a65";

export function themeColor(variable, fallback) {
  if (typeof document === "undefined" || !document.documentElement) return fallback;
  const getter = typeof getComputedStyle === "function"
    ? getComputedStyle
    : document.defaultView?.getComputedStyle?.bind(document.defaultView);
  if (!getter) return fallback;
  const value = getter(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

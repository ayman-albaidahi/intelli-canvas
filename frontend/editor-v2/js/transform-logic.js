export function clampCropSelection(selection, bounds) {
  const left = Math.max(0, Math.min(1, (selection.x - bounds.x) / bounds.width));
  const top = Math.max(0, Math.min(1, (selection.y - bounds.y) / bounds.height));
  const width = Math.max(0.05, Math.min(1 - left, selection.width / bounds.width));
  const height = Math.max(0.05, Math.min(1 - top, selection.height / bounds.height));
  return { left, top, width, height };
}

export function aspectRatioDimensions(width, height, nextWidth, nextHeight, lockAspectRatio = true) {
  if (!lockAspectRatio) return { width: nextWidth ?? width, height: nextHeight ?? height };
  if (nextWidth != null) return { width: nextWidth, height: Math.max(1, Math.round(height * nextWidth / width)) };
  if (nextHeight != null) return { width: Math.max(1, Math.round(width * nextHeight / height)), height: nextHeight };
  return { width, height };
}

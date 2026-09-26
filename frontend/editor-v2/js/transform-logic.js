export function clampCropSelection(selection, bounds) {
  const left = Math.max(0, Math.min(1, (selection.x - bounds.x) / bounds.width));
  const top = Math.max(0, Math.min(1, (selection.y - bounds.y) / bounds.height));
  const width = Math.max(0.05, Math.min(1 - left, selection.width / bounds.width));
  const height = Math.max(0.05, Math.min(1 - top, selection.height / bounds.height));
  return { left, top, width, height };
}

export function aspectRatioDimensions(width, height, nextWidth, nextHeight, lockAspectRatio = true) {
  if (!lockAspectRatio) return { width: nextWidth ?? width, height: nextHeight ?? height };
  if (nextWidth !== undefined && nextWidth !== null) return { width: nextWidth, height: Math.max(1, Math.round(height * nextWidth / width)) };
  if (nextHeight !== undefined && nextHeight !== null) return { width: Math.max(1, Math.round(width * nextHeight / height)), height: nextHeight };
  return { width, height };
}

/* ---------- crop selection geometry ---------- */
//
// A crop selection lives in view space: stage-relative CSS pixels, the same
// coordinate system as canvasManager.getImageRect(). It is only converted to
// source pixels at apply time, so zoom and pan need no correction here — the
// selection and the image rect move together.

export const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// Keeps a selection inside the image bounds and never smaller than minSize.
// The floor is itself clamped to the bounds, otherwise a genuinely tiny image
// (a 32px icon at fit zoom) would let the floor push the selection outside.
export function clampCropRect(selection, bounds, minSize = 0) {
  const floorX = Math.min(minSize, bounds.width);
  const floorY = Math.min(minSize, bounds.height);
  const width = Math.max(floorX, Math.min(selection.width, bounds.width));
  const height = Math.max(floorY, Math.min(selection.height, bounds.height));
  const x = Math.max(bounds.x, Math.min(selection.x, bounds.x + bounds.width - width));
  const y = Math.max(bounds.y, Math.min(selection.y, bounds.y + bounds.height - height));
  return { x, y, width, height };
}

// Dragging the body moves the whole selection without resizing it.
export function moveCropRect(origin, start, current, bounds, minSize = 0) {
  return clampCropRect({
    x: origin.x + current.x - start.x,
    y: origin.y + current.y - start.y,
    width: origin.width,
    height: origin.height,
  }, bounds, minSize);
}

// Dragging a handle moves only the edges the handle names. A corner with
// Shift held keeps the original aspect ratio; an edge changes one dimension
// by design and never locks.
export function resizeCropRect(origin, start, current, handle, bounds, { minSize = 0, lockAspectRatio = false } = {}) {
  if (!CROP_HANDLES.includes(handle)) return clampCropRect(origin, bounds, minSize);

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const touchesLeft = handle.includes('w');
  const touchesRight = handle.includes('e');
  const touchesTop = handle.includes('n');
  const touchesBottom = handle.includes('s');

  let { x, y, width, height } = origin;
  if (touchesLeft) { x = origin.x + dx; width = origin.width - dx; }
  if (touchesRight) { width = origin.width + dx; }
  if (touchesTop) { y = origin.y + dy; height = origin.height - dy; }
  if (touchesBottom) { height = origin.height + dy; }

  if (lockAspectRatio && handle.length === 2 && origin.width > 0 && origin.height > 0) {
    const ratio = origin.height / origin.width;
    // Follow whichever axis the user dragged further, so the box tracks the
    // cursor instead of the weaker axis.
    if (Math.abs(dy) > Math.abs(dx)) width = height / ratio;
    else height = width * ratio;
    // The opposite corner stays put.
    if (touchesLeft) x = origin.x + origin.width - width;
    if (touchesTop) y = origin.y + origin.height - height;
  }

  return clampCropRect({ x, y, width, height }, bounds, minSize);
}

// View pixels -> source pixels. Returns null for anything the API would have
// to reject: non-positive size, negative origin, or a box that runs past the
// source edge after rounding. Callers must not send a null result.
export function cropSelectionToSource(selection, imageRect, sourceDimensions) {
  if (!imageRect || !sourceDimensions) return null;
  if (!(imageRect.width > 0) || !(imageRect.height > 0)) return null;
  if (!(selection.width > 0) || !(selection.height > 0)) return null;

  const px = (viewX) => ((viewX - imageRect.x) / imageRect.width) * sourceDimensions.width;
  const py = (viewY) => ((viewY - imageRect.y) / imageRect.height) * sourceDimensions.height;

  const x = Math.round(px(selection.x));
  const y = Math.round(py(selection.y));
  // Width is derived from both edges rather than from the selection width
  // alone, so rounding each edge independently cannot shrink the box to zero.
  const width = Math.round(px(selection.x + selection.width) - x);
  const height = Math.round(py(selection.y + selection.height) - y);

  if (x < 0 || y < 0 || width < 1 || height < 1) return null;
  if (x + width > sourceDimensions.width || y + height > sourceDimensions.height) return null;
  return { x, y, width, height };
}

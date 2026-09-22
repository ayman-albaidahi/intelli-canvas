import { describe, expect, it } from 'vitest';
import {
  CROP_HANDLES, clampCropRect, cropSelectionToSource, moveCropRect, resizeCropRect,
} from './transform-logic.js';

// The image rect and source size the crop tool maps against: a 400x300 image
// drawn at 200x150 in stage coordinates.
const BOUNDS = { x: 100, y: 50, width: 200, height: 150 };
const SOURCE = { width: 400, height: 300 };
const FULL = { x: 100, y: 50, width: 200, height: 150 };
const INNER = { x: 150, y: 75, width: 100, height: 100 };

describe('clampCropRect', () => {
  it('pulls an oversized selection inside the image bounds', () => {
    expect(clampCropRect({ x: 80, y: 30, width: 400, height: 400 }, BOUNDS, 0)).toEqual(BOUNDS);
  });

  it('refuses to shrink below the minimum, even when that exceeds the bounds', () => {
    // A floor larger than the image is capped by the bounds, so a tiny image
    // cannot produce a selection wider than itself.
    const tiny = { x: 0, y: 0, width: 10, height: 10 };
    expect(clampCropRect({ x: 0, y: 0, width: 2, height: 2 }, tiny, 44)).toEqual(tiny);
  });

  it('clamps without changing a selection already in bounds', () => {
    expect(clampCropRect(INNER, BOUNDS, 0)).toEqual(INNER);
  });
});

describe('moveCropRect', () => {
  it('translates the selection by the pointer delta', () => {
    const next = moveCropRect(INNER, { x: 200, y: 200 }, { x: 240, y: 190 }, BOUNDS, 0);
    expect(next).toEqual({ x: 190, y: 65, width: 100, height: 100 });
  });

  it('stops at the image edge instead of leaving it', () => {
    const next = moveCropRect(INNER, { x: 200, y: 200 }, { x: 1000, y: 1000 }, BOUNDS, 0);
    expect(next.x + next.width).toBe(BOUNDS.x + BOUNDS.width);
    expect(next.y + next.height).toBe(BOUNDS.y + BOUNDS.height);
  });

  it('never changes the size', () => {
    for (const dx of [-500, -10, 0, 10, 500]) {
      const next = moveCropRect(INNER, { x: 0, y: 0 }, { x: dx, y: dx / 2 }, BOUNDS, 0);
      expect(next.width).toBe(INNER.width);
      expect(next.height).toBe(INNER.height);
    }
  });
});

describe('resizeCropRect', () => {
  it('grows the box from the south-east corner', () => {
    // The box grows by the drag; the top-left corner stays put. y drops to 70
    // because a 130px box from y=75 would leave the image.
    expect(resizeCropRect(INNER, { x: 0, y: 0 }, { x: 40, y: 30 }, 'se', BOUNDS, {}))
      .toEqual({ x: 150, y: 70, width: 140, height: 130 });
  });

  it('grows from the north-west corner', () => {
    // y clamps to the image top at 50 rather than 45.
    expect(resizeCropRect(INNER, { x: 0, y: 0 }, { x: -40, y: -30 }, 'nw', BOUNDS, {}))
      .toEqual({ x: 110, y: 50, width: 140, height: 130 });
  });

  it('each edge handle moves only the one edge it names', () => {
    const right = resizeCropRect(INNER, { x: 0, y: 0 }, { x: 40, y: 99 }, 'e', BOUNDS, {});
    expect(right).toEqual({ x: 150, y: 75, width: 140, height: 100 });
    const top = resizeCropRect(INNER, { x: 0, y: 0 }, { x: 99, y: -30 }, 'n', BOUNDS, {});
    expect(top).toEqual({ x: 150, y: 50, width: 100, height: 130 });
  });

  it('clamps every handle so no edge can leave the image', () => {
    for (const handle of CROP_HANDLES) {
      const next = resizeCropRect(INNER, { x: 0, y: 0 }, { x: 900, y: -900 }, handle, BOUNDS, {});
      expect(next.x).toBeGreaterThanOrEqual(BOUNDS.x);
      expect(next.y).toBeGreaterThanOrEqual(BOUNDS.y);
      expect(next.x + next.width).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width);
      expect(next.y + next.height).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height);
    }
  });

  it('never lets width or height reach zero', () => {
    for (const handle of CROP_HANDLES) {
      const next = resizeCropRect(INNER, { x: 0, y: 0 }, { x: 500, y: 500 }, handle, BOUNDS, { minSize: 20 });
      expect(next.width).toBeGreaterThanOrEqual(20);
      expect(next.height).toBeGreaterThanOrEqual(20);
    }
  });

  it('keeps the original aspect ratio when Shift is held on a corner', () => {
    // Roomier bounds than INNER's, so the locked box still fits and the clamp
    // does not have to choose bounds over ratio.
    const roomy = { x: 0, y: 0, width: 600, height: 600 };
    const box = { x: 100, y: 100, width: 200, height: 120 };
    const ratio = box.height / box.width;
    for (const handle of ['nw', 'ne', 'se', 'sw']) {
      const next = resizeCropRect(box, { x: 0, y: 0 }, { x: 60, y: 10 }, handle, roomy, { lockAspectRatio: true });
      expect(next.height / next.width).toBeCloseTo(ratio, 6);
    }
  });

  it('does not lock the aspect ratio for edge handles', () => {
    const roomy = { x: 0, y: 0, width: 600, height: 600 };
    const box = { x: 100, y: 100, width: 200, height: 120 };
    const next = resizeCropRect(box, { x: 0, y: 0 }, { x: 60, y: 10 }, 'e', roomy, { lockAspectRatio: true });
    expect(next.width).toBe(260);
    expect(next.height).toBe(120);
  });

  it('treats an unknown handle as a no-op clamp', () => {
    expect(resizeCropRect(INNER, { x: 0, y: 0 }, { x: 60, y: 60 }, 'nope', BOUNDS, {})).toEqual(INNER);
  });
});

describe('cropSelectionToSource', () => {
  it('scales a view selection up to source pixels', () => {
    expect(cropSelectionToSource(FULL, BOUNDS, SOURCE)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(cropSelectionToSource(INNER, BOUNDS, SOURCE)).toEqual({ x: 100, y: 50, width: 200, height: 200 });
  });

  it('is independent of zoom because the selection and rect share a space', () => {
    // Half the zoom: the image rect and the selection both halve together.
    const half = { x: 50, y: 25, width: 100, height: 75 };
    const sel = { x: 75, y: 37.5, width: 50, height: 50 };
    expect(cropSelectionToSource(sel, half, SOURCE)).toEqual({ x: 100, y: 50, width: 200, height: 200 });
  });

  it('keeps a sub-half-pixel box as exactly one source pixel', () => {
    expect(cropSelectionToSource({ x: 100, y: 50, width: 0.5, height: 0.5 }, BOUNDS, SOURCE))
      .toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('rejects a box too small to round up to a source pixel', () => {
    // 0.2 view px maps to 0.4 source px, which rounds to 0 — not a crop the
    // API can accept, so it is refused rather than sent.
    expect(cropSelectionToSource({ x: 100, y: 50, width: 0.2, height: 0.2 }, BOUNDS, SOURCE)).toBeNull();
  });

  it('rejects anything the API would have to reject', () => {
    expect(cropSelectionToSource({ x: 50, y: 25, width: 100, height: 75 }, BOUNDS, SOURCE)).toBeNull(); // negative origin
    expect(cropSelectionToSource({ x: 400, y: 300, width: 10, height: 10 }, BOUNDS, SOURCE)).toBeNull(); // past the edge
    expect(cropSelectionToSource({ x: 100, y: 50, width: 0, height: 10 }, BOUNDS, SOURCE)).toBeNull(); // zero size
    expect(cropSelectionToSource(FULL, null, SOURCE)).toBeNull();
    expect(cropSelectionToSource(FULL, { x: 0, y: 0, width: 0, height: 0 }, SOURCE)).toBeNull();
  });
});

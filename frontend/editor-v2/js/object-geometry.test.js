import { describe, expect, it } from 'vitest';
import {
  centerOf,
  handles,
  hitObject,
  normalizeStrokeBox,
  resizeObjectFromDrag,
  rotateHandle,
  rotateOffset,
  toLocal,
} from './object-geometry.js';

// Coordinates arrive as floats once rotation is involved, so comparisons are
// done on rounded values rather than by equality.
function rounded(point) {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function object(overrides = {}) {
  return {
    id: 'o1',
    x: 100,
    y: 200,
    w: 40,
    h: 60,
    rotation: 0,
    visible: true,
    locked: false,
    ...overrides,
  };
}

describe('object-geometry — centerOf', () => {
  it('returns the midpoint of the bounding box', () => {
    expect(centerOf(object())).toEqual({ x: 120, y: 230 });
  });
});

describe('object-geometry — local rotation round trip', () => {
  it('inverts rotateOffset for an unrotated object', () => {
    const o = object();
    const local = toLocal(o, 130, 240);
    expect(rounded(rotateOffset(o, local.x, local.y))).toEqual({ x: 10, y: 10 });
  });

  it('inverts rotateOffset for a rotated object', () => {
    const o = object({ rotation: 45 });
    const local = toLocal(o, 120, 230);
    expect(rounded(rotateOffset(o, local.x, local.y))).toEqual({ x: 0, y: 0 });
  });
});

describe('object-geometry — hitObject', () => {
  it('hits a visible unlocked object inside its bounds', () => {
    const o = object();
    expect(hitObject([o], 120, 230)).toBe(o);
  });

  it('tolerates a small margin outside the box', () => {
    expect(hitObject([object()], 122, 232)).not.toBeNull();
  });

  it('misses a point far outside the box', () => {
    expect(hitObject([object()], 500, 500)).toBeNull();
  });

  it('skips hidden objects', () => {
    expect(hitObject([object({ visible: false })], 120, 230)).toBeNull();
  });

  it('skips locked objects', () => {
    expect(hitObject([object({ locked: true })], 120, 230)).toBeNull();
  });

  it('picks the topmost of two overlapping objects', () => {
    const bottom = object({ id: 'bottom' });
    const top = object({ id: 'top' });
    expect(hitObject([bottom, top], 120, 230).id).toBe('top');
  });
});

describe('object-geometry — handles', () => {
  it('returns nothing for a missing object', () => {
    expect(handles(null)).toEqual([]);
  });

  it('places the eight resize handles around the box', () => {
    const result = handles(object());
    expect(result.map((h) => h.key)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
    ]);

    const byKey = Object.fromEntries(result.map((h) => [h.key, rounded(h)]));
    expect(byKey.nw).toEqual({ x: 100, y: 200 });
    expect(byKey.se).toEqual({ x: 140, y: 260 });
  });

  it('keeps handles attached when the object rotates', () => {
    const byKey = Object.fromEntries(
      handles(object({ rotation: 90 })).map((h) => [h.key, rounded(h)])
    );
    // A quarter turn maps the north edge onto the east edge of the box.
    expect(byKey.n).toEqual({ x: 150, y: 230 });
  });
});

describe('object-geometry — rotateHandle', () => {
  it('sits 24px above the top edge of an unrotated object', () => {
    // centre.y - h/2 - 24 = 230 - 30 - 24
    expect(rounded(rotateHandle(object()))).toEqual({ x: 120, y: 176 });
  });
});

describe('object-geometry — normalizeStrokeBox', () => {
  function stroke(points, strokeWidth = 8) {
    return { points, strokeWidth };
  }

  it('fits the box to the points padded by half the width', () => {
    const s = stroke([[10, 20], [50, 60]]);
    normalizeStrokeBox(s);
    // pad = 8/2 + 2 = 6 → minX = 10-6 = 4, maxX = 50+6 = 56 → w = 52
    expect(s.x).toBe(4);
    expect(s.y).toBe(14);
    expect(s.w).toBe(52);
    expect(s.h).toBe(52);
  });

  it('never returns a box smaller than the minimum', () => {
    const s = stroke([[0, 0], [0, 0]], 0);
    normalizeStrokeBox(s, 8);
    expect(s.w).toBe(8);
    expect(s.h).toBe(8);
  });

  it('rewrites pointsRel relative to the new centre', () => {
    const s = stroke([[10, 20], [50, 60]]);
    normalizeStrokeBox(s);
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    expect(s.pointsRel).toEqual([
      [10 - cx, 20 - cy],
      [50 - cx, 60 - cy],
    ]);
  });
});

describe('object-geometry — resizeObjectFromDrag', () => {
  function dragFixture(overrides = {}) {
    const o = object({ x: 100, y: 200, w: 40, h: 60 });
    const handle = { key: 'e', sx: 1, sy: 0 };
    const anchor = { sx: -1, sy: 0 }; // west edge stays fixed
    const drag = {
      handle,
      anchor,
      startX: o.x,
      startY: o.y,
      startW: o.w,
      startH: o.h,
      startStrokeWidth: undefined,
      // The anchor is the west-mid corner: centre.x - w/2 = 120-20 = 100.
      anchorScreen: { x: 100, y: 230 },
    };
    return { o, drag, ...overrides };
  }

  it('grows the width from the dragged handle while the anchor holds', () => {
    const { o, drag } = dragFixture();
    // Drag the east handle to x=170: dx = 50 from the start centre,
    // anchorStart.x = -20 → newW = |50 - (-20)| = 70.
    resizeObjectFromDrag(o, drag, { x: 170, y: 230 }, false);
    expect(o.w).toBe(70);
    expect(o.h).toBe(60);
    // anchorScreen.x - anchorRotated.x - w/2 = 100 - (-35) - 35 = 100
    expect(o.x).toBe(100);
  });

  it('shrinking clamps at the minimum size', () => {
    const { o, drag } = dragFixture();
    // Drag the east handle onto the anchor: |local.x - anchorStart.x| = 0
    // → clamps to the minimum rather than inverting the box.
    resizeObjectFromDrag(o, drag, { x: 100, y: 230 }, false, 8);
    expect(o.w).toBe(8);
  });

  it('keeps the aspect ratio on a corner drag when asked', () => {
    const o = object({ x: 100, y: 200, w: 40, h: 60 });
    const drag = {
      handle: { key: 'se', sx: 1, sy: 1 },
      anchor: { sx: -1, sy: -1 },
      startX: 100, startY: 200, startW: 40, startH: 60,
      startStrokeWidth: undefined,
      anchorScreen: { x: 100, y: 200 },
    };
    // Far drag: unconstrained w/h growth would differ; ratio locks them.
    resizeObjectFromDrag(o, drag, { x: 200, y: 300 }, true);
    // startH/startW = 1.5; newW=100 dominates → newH = 150
    expect(o.w).toBe(100);
    expect(o.h).toBe(150);
  });

  it('resizes a rotated object in its own frame', () => {
    const o = object({ x: 100, y: 200, w: 40, h: 60, rotation: 90 });
    const drag = {
      handle: { key: 'e', sx: 1, sy: 0 },
      anchor: { sx: -1, sy: 0 },
      startX: 100, startY: 200, startW: 40, startH: 60,
      startStrokeWidth: undefined,
      // For rotation 90 the west-mid corner is centre + (0, -20) rotated
      // 90° → 20px above the centre.
      anchorScreen: { x: 120, y: 210 },
    };
    // A pure +y screen drag is the +x axis in the 90°-rotated frame:
    // un-rotating dy=70 gives local.x = +70, so newW = |70 - (-20)| = 90.
    resizeObjectFromDrag(o, drag, { x: 120, y: 300 }, false);
    expect(o.w).toBe(90);
    expect(o.h).toBe(60);
  });

  it('scales brush points and stroke width with the box', () => {
    const o = object({ x: 0, y: 0, w: 20, h: 20, type: 'brush', pointsRel: [[-10, 0], [10, 0]], strokeWidth: 4 });
    const drag = {
      handle: { key: 'e', sx: 1, sy: 0 },
      anchor: { sx: -1, sy: 0 },
      startX: 0, startY: 0, startW: 20, startH: 20,
      startStrokeWidth: 4,
      anchorScreen: { x: 0, y: 10 },
    };
    // Triple the width (kx=3, ky=1): points scale on x, stroke width
    // scales by the average (3+1)/2 = 2 → 4*2 = 8.
    resizeObjectFromDrag(o, drag, { x: 60, y: 10 }, false);
    expect(o.w).toBe(60);
    expect(o.pointsRel).toEqual([[-30, 0], [30, 0]]);
    expect(o.strokeWidth).toBe(8);
  });

  it('an edge drag on one axis leaves the other axis alone', () => {
    const { o, drag } = dragFixture();
    resizeObjectFromDrag(o, drag, { x: 170, y: 400 }, false);
    // sy === 0 on the 'e' handle: height must not follow the y overshoot.
    expect(o.h).toBe(60);
  });
});

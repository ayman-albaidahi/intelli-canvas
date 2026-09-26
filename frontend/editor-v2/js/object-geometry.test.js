import { describe, expect, it } from 'vitest';
import {
  centerOf,
  handles,
  hitObject,
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

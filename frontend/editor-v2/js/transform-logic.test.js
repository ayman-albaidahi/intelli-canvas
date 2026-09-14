import { describe, expect, it } from 'vitest';
import { aspectRatioDimensions, clampCropSelection } from './transform-logic.js';

describe('clampCropSelection', () => {
  it('clamps a selection to normalized canvas bounds', () => {
    expect(clampCropSelection({ x: -20, y: 10, width: 180, height: 120 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({
      left: 0,
      top: 0.1,
      width: 1,
      height: 0.9,
    });
  });
});

describe('aspectRatioDimensions', () => {
  it('derives height when width changes', () => {
    expect(aspectRatioDimensions(1600, 1200, 800, null)).toEqual({ width: 800, height: 600 });
  });

  it('keeps both explicit dimensions when unlocked', () => {
    expect(aspectRatioDimensions(1600, 1200, 800, 800, false)).toEqual({ width: 800, height: 800 });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { CanvasManager } from './canvas-manager.js';
import { appState } from './app-state.js';

// jsdom has no canvas 2D context, so the stage/canvas are stand-ins that
// supply only what the manager actually touches: a fixed bounding rect, an
// event surface, and a no-op context. Everything under test here is the view
// maths (zoom anchoring, clamping, fit, crop composition, pinch, the
// out-of-order load guard) — none of it needs real pixels.
//
// createPattern is NOT a no-op: checkerboard() caches its result, and an
// undefined pattern would send every render back into the tile-building
// branch, which builds a real <canvas> whose jsdom context is null.
const NOOP_CTX = new Proxy(
  { createPattern: () => ({ pattern: true }) },
  { get: (t, p) => (p in t ? t[p] : () => {}), set: () => true },
);

function fakeStage({ width = 800, height = 600 } = {}) {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener: () => {},
    closest: () => null,
  };
}

function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    getContext: () => NOOP_CTX,
    addEventListener: () => {},
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
}

// An image stand-in: CanvasManager.loadFromUrl only needs the event surface,
// crossOrigin/src, and natural dimensions. Instances are recorded so a test
// can fire load/error on the exact request it wants.
class FakeImage {
  static created = [];
  constructor() {
    FakeImage.created.push(this);
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.complete = false;
    this._listeners = {};
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  set src(value) { this._src = value; }
  get src() { return this._src; }
  fire(type) {
    this.complete = true;
    for (const fn of this._listeners[type] || []) fn();
  }
}

function makeManager({ width = 800, height = 600 } = {}) {
  const cm = new CanvasManager(fakeCanvas(), fakeStage({ width, height }));
  // Seed the cached pattern so render() never enters checkerboard()'s
  // tile-building branch: its first call always constructs a real <canvas>
  // whose jsdom context is null, regardless of createPattern. The pattern
  // itself is not under test here.
  cm.checkerPattern = { pattern: true };
  return cm;
}


// Give a manager a loaded image + document without going through loadFromUrl.
function withImage(cm, { docW = 400, docH = 300, revision = 1 } = {}) {
  cm.image = { naturalWidth: docW, naturalHeight: docH, complete: true };
  cm.documentSize = { width: docW, height: docH };
  cm.revision = revision;
}

describe('canvas manager — fit', () => {
  it('a smaller image fits at scale 1 and centres the document', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    cm.fit();
    // min((800-100)/400, (600-100)/300, 1) = min(1.75, 1.667, 1) = 1
    expect(cm.scale).toBe(1);
    expect(cm.offset).toEqual({ x: 400, y: 300 });
    expect(appState.zoom).toBe(100);
  });

  it('a larger image shrinks to the height-limited fit', () => {
    const cm = makeManager();
    withImage(cm, { docW: 4000, docH: 3000 });
    cm.fit();
    // min((800-100)/4000, (600-100)/3000) = min(0.175, 0.1667)
    expect(cm.scale).toBeCloseTo((600 - 100) / 3000, 10);
    expect(appState.zoom).toBe(17);
  });

  it('fitWidth ignores the viewport height', () => {
    const cm = makeManager();
    withImage(cm, { docW: 4000, docH: 3000 });
    cm.fitWidth();
    expect(cm.scale).toBeCloseTo((800 - 100) / 4000, 10);
    expect(cm.offset).toEqual({ x: 400, y: 300 });
  });

  it('is a no-op before any image loads', () => {
    const cm = makeManager();
    expect(() => cm.fit()).not.toThrow();
    expect(cm.scale).toBe(1);
  });
});

describe('canvas manager — zoom anchoring', () => {
  it('scaling pins the anchor: content under the cursor stays put', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    cm.scale = 1;
    cm.offset = { x: 200, y: 150 };
    const anchor = { x: 100, y: 100 };
    // A point p (stage space) maps to image space as (p - offset)/scale.
    // Anchoring means p stays fixed when scale changes: offset' =
    // anchor + (offset - anchor) * ratio.
    cm.applyScale(2, anchor);
    expect(cm.scale).toBe(2);
    expect(cm.offset).toEqual({ x: 300, y: 200 });
    expect(appState.zoom).toBe(200);
  });

  it('clamps the requested scale to the 5%..800% window', () => {
    const cm = makeManager();
    withImage(cm);
    cm.applyScale(100, { x: 400, y: 300 });
    expect(cm.scale).toBe(8);
    cm.applyScale(0.001, { x: 400, y: 300 });
    expect(cm.scale).toBe(0.05);
  });

  it('zoomStep moves by percentage points at the viewport centre', () => {
    const cm = makeManager();
    withImage(cm);
    cm.scale = 1;
    cm.zoomStep(10);
    expect(cm.scale).toBeCloseTo(1.1, 10);
    cm.zoomStep(-50);
    expect(cm.scale).toBeCloseTo(0.6, 10);
  });

  it('does nothing before an image exists', () => {
    const cm = makeManager();
    const before = { ...cm.offset, scale: cm.scale };
    cm.applyScale(4, { x: 0, y: 0 });
    expect(cm.scale).toBe(before.scale);
    expect(cm.offset).toEqual({ x: before.offset?.x ?? 0, y: before.offset?.y ?? 0 });
  });
});

describe('canvas manager — clamping', () => {
  it('keeps at least VIEW_MARGIN of the document inside the viewport', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    cm.scale = 1;
    cm.offset = { x: 10_000, y: 10_000 };
    cm.clampOffset();
    // drawn 400x300 in an 800x600 view: slackX = 200+400-60 = 540,
    // high = 400+540 = 940; slackY = 150+300-60 = 390, high = 300+390 = 690.
    expect(cm.offset).toEqual({ x: 940, y: 690 });
    cm.offset = { x: -10_000, y: -10_000 };
    cm.clampOffset();
    expect(cm.offset).toEqual({ x: -140, y: -90 });
  });

  it('leaves a small image pannable anywhere', () => {
    const cm = makeManager();
    withImage(cm, { docW: 80, docH: 60 });
    cm.scale = 0.5; // drawn 40x30: slack = 20+400-60 = 360 -> low -320, high 760
    cm.offset = { x: 700, y: 300 };
    cm.clampOffset();
    expect(cm.offset.x).toBe(700);
  });
});

describe('canvas manager — rotation and geometry', () => {
  it('a quarter turn swaps the rotated document box', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    cm.rotation = 90;
    expect(cm.rotatedDocumentSize()).toEqual({ width: 300, height: 400 });
    expect(cm.drawnSize()).toEqual({ width: 300, height: 400 });
    cm.rotation = 45;
    expect(cm.rotatedDocumentSize()).toEqual({ width: 400, height: 300 });
  });

  it('rotate keeps the angle in [0, 360)', () => {
    const cm = makeManager();
    withImage(cm);
    cm.rotate(-90);
    expect(cm.rotation).toBe(270);
    cm.rotate(180);
    expect(cm.rotation).toBe(90);
  });

  it('flip mirrors the requested axis only', () => {
    const cm = makeManager();
    withImage(cm);
    cm.flip('horizontal');
    expect([cm.flipX, cm.flipY]).toEqual([-1, 1]);
    cm.flip('horizontal');
    expect(cm.flipX).toBe(1);
  });

  it('getImageRect centres the drawn box on the offset', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    cm.scale = 2;
    cm.offset = { x: 400, y: 300 };
    expect(cm.getImageRect()).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe('canvas manager — crop composition', () => {
  it('a second crop maps against the first (no crop drift)', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    // Default view: scale 1, offset {0,0} => drawn rect is (-200,-150,400,300).
    // Selecting the box (0,0,400,600) is the right-bottom half of it.
    cm.applyCropSelection({ x: 0, y: 0, width: 400, height: 600 });
    expect(cm.crop).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
    // fit() has re-centred the now-200x150 document; crop its top-left
    // quarter. Composition must nest: quarter of the half, offset by the
    // first crop — never a second independent 0..1 mapping.
    const rect = cm.getImageRect();
    cm.applyCropSelection({ x: rect.x, y: rect.y, width: rect.width / 2, height: rect.height / 2 });
    expect(cm.crop.x).toBeCloseTo(0.5, 10);
    expect(cm.crop.y).toBeCloseTo(0.5, 10);
    expect(cm.crop.width).toBeCloseTo(0.25, 10);
    expect(cm.crop.height).toBeCloseTo(0.25, 10);
  });

  it('applyCropSelection is a no-op before an image exists', () => {
    const cm = makeManager();
    expect(() => cm.applyCropSelection({ x: 0, y: 0, width: 10, height: 10 })).not.toThrow();
    expect(cm.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('canvas manager — wheel', () => {
  it('plain wheel pans without zooming', () => {
    const cm = makeManager();
    withImage(cm);
    cm.offset = { x: 400, y: 300 };
    const prevent = vi.fn();
    cm.onWheel({ deltaX: 50, deltaY: 30, shiftKey: false, ctrlKey: false, metaKey: false, deltaMode: 0, preventDefault: prevent });
    expect(cm.offset).toEqual({ x: 350, y: 270 });
    expect(prevent).toHaveBeenCalledOnce();
  });

  it('shift+wheel pans horizontally from deltaY', () => {
    const cm = makeManager();
    withImage(cm);
    cm.offset = { x: 400, y: 300 };
    cm.onWheel({ deltaX: 0, deltaY: 100, shiftKey: true, ctrlKey: false, metaKey: false, deltaMode: 0, preventDefault: () => {} });
    expect(cm.offset.x).toBe(300);
    expect(cm.offset.y).toBe(300);
  });

  it('ctrl+wheel zooms towards the cursor', () => {
    const cm = makeManager();
    withImage(cm);
    cm.scale = 1;
    cm.offset = { x: 400, y: 300 };
    cm.onWheel({
      clientX: 400, clientY: 300,
      deltaY: -100, deltaMode: 0,
      shiftKey: false, ctrlKey: true, metaKey: false,
      preventDefault: () => {},
    });
    // exp(100 * 0.0022) ≈ 1.2461; offset must follow the anchor rule.
    expect(cm.scale).toBeCloseTo(Math.exp(0.22), 6);
    expect(cm.offset.x).toBeCloseTo(400 + (400 - 400) * cm.scale, 6);
  });

  it('panLocked (crop tool) blocks the wheel entirely', () => {
    const cm = makeManager();
    withImage(cm);
    cm.panLocked = true;
    const prevent = vi.fn();
    cm.onWheel({ deltaX: 10, deltaY: 10, shiftKey: false, ctrlKey: false, metaKey: false, deltaMode: 0, preventDefault: prevent });
    expect(prevent).not.toHaveBeenCalled();
    expect(cm.offset).toEqual({ x: 0, y: 0 });
  });

  it('no image, no event consumption', () => {
    const cm = makeManager();
    const prevent = vi.fn();
    cm.onWheel({ deltaX: 10, deltaY: 10, shiftKey: false, ctrlKey: true, metaKey: false, deltaMode: 0, preventDefault: prevent });
    expect(prevent).not.toHaveBeenCalled();
  });
});

describe('canvas manager — pointer pan and pinch', () => {
  it('a single-pointer drag pans by the pointer delta', () => {
    const cm = makeManager();
    withImage(cm);
    cm.offset = { x: 400, y: 300 };
    cm.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100 });
    cm.onPointerMove({ pointerId: 1, clientX: 130, clientY: 90 });
    expect(cm.offset).toEqual({ x: 430, y: 290 });
    cm.onPointerEnd({ pointerId: 1 });
    expect(cm.drag).toBe(null);
    expect(cm.pointers.size).toBe(0);
  });

  it('a second pointer switches to pinch: distance drives scale', () => {
    const cm = makeManager();
    withImage(cm, { docW: 400, docH: 300 });
    cm.scale = 1;
    cm.offset = { x: 0, y: 0 };
    cm.onPointerDown({ pointerId: 1, clientX: 100, clientY: 200 });
    cm.onPointerDown({ pointerId: 2, clientX: 300, clientY: 200 });
    expect(cm.drag).toBe(null);
    expect(cm.pinch).not.toBe(null);
    // Move the second finger apart: 200 -> 400 distance = 2x.
    cm.onPointerMove({ pointerId: 2, clientX: 500, clientY: 200 });
    expect(cm.scale).toBe(2);
    cm.onPointerEnd({ pointerId: 2 });
    expect(cm.pinch).toBe(null);
    // One pointer left: a new drag is armed from the survivor so the pan
    // does not jump to the ending finger's position.
    expect(cm.drag).toEqual({ x: 100, y: 200, originX: cm.offset.x, originY: cm.offset.y });
  });

  it('lifting the last pointer ends the gesture', () => {
    const cm = makeManager();
    withImage(cm);
    cm.onPointerDown({ pointerId: 1, clientX: 50, clientY: 50 });
    cm.onPointerEnd({ pointerId: 1 });
    expect(cm.drag).toBe(null);
  });
});

describe('canvas manager — loadFromUrl ordering', () => {
  let realImage;
  beforeEach(() => {
    FakeImage.created = [];
    realImage = globalThis.Image;
    globalThis.Image = FakeImage;
  });
  afterEach(() => {
    globalThis.Image = realImage;
  });

  function loadedImage(img, w, h) {
    img.naturalWidth = w;
    img.naturalHeight = h;
    img.fire('load');
  }

  it('commits document size, resets view state, and reports zoom', async () => {
    const cm = makeManager();
    const pending = cm.loadFromUrl('http://x/a.png', { revision: 7 });
    loadedImage(FakeImage.created[0], 800, 600);
    const image = await pending;
    expect(image.naturalWidth).toBe(800);
    expect(cm.documentSize).toEqual({ width: 800, height: 600 });
    expect(cm.revision).toBe(7);
    expect(cm.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(cm.rotation).toBe(0);
  });

  it('a stale older response cannot overwrite the newer one', async () => {
    const cm = makeManager();
    const first = cm.loadFromUrl('http://x/a.png', { revision: 3 });
    const second = cm.loadFromUrl('http://x/b.png', { revision: 5 });
    loadedImage(FakeImage.created[1], 100, 100);
    loadedImage(FakeImage.created[0], 200, 200);
    await second;
    // The stale promise deliberately never settles — the manager ignores its
    // own load callback — so do not await it; assert the committed state.
    void first;
    expect(cm.documentSize).toEqual({ width: 100, height: 100 });
    expect(cm.revision).toBe(5);
  });

  it('rejects when the image cannot load', async () => {
    const cm = makeManager();
    const pending = cm.loadFromUrl('http://x/missing.png');
    FakeImage.created[0].fire('error');
    await expect(pending).rejects.toThrow('Could not load the image');
  });
});

describe('canvas manager — adjustments and sampling', () => {
  it('adjustmentFilter composes the CSS filter string', () => {
    const cm = makeManager();
    cm.setAdjustments({ brightness: 120, grayscale: true });
    expect(cm.adjustmentFilter()).toBe(
      'brightness(120%) contrast(100%) saturate(100%) blur(0px) grayscale(1) invert(0)',
    );
  });

  it('adjustmentSummary counts active edits', () => {
    const cm = makeManager();
    expect(cm.adjustmentSummary()).toBe('Neutral');
    cm.setAdjustments({ brightness: 120, negative: true });
    expect(cm.adjustmentSummary()).toBe('2 active');
  });

  it('sampleImagePixel maps a stage point to the pixel beneath it', () => {
    const cm = makeManager();
    withImage(cm, { docW: 4, docH: 2 });
    cm.scale = 1;
    cm.offset = { x: 400, y: 300 }; // document centred; image is 4x2 => drawn 4x2
    // Pre-seed the decoded buffer the sampler reads: pixels in row-major
    // order with distinct blues so the returned hex identifies the index.
    const data = new Uint8ClampedArray(4 * 2 * 4);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const i = (y * 4 + x) * 4;
        data[i] = 10; data[i + 1] = 20; data[i + 2] = 30 + y * 4 + x; data[i + 3] = 255;
      }
    }
    cm._imageData = { data };
    // The image centre is the stage centre; the top-left pixel's centre is
    // at (-1.5, -0.5) image units from the document centre.
    const hex = cm.sampleImagePixel(400 - 1.5, 300 - 0.5);
    expect(hex).toBe('#0a141e'); // index 0 -> 10,20,30
    const far = cm.sampleImagePixel(400 + 1.5, 300 + 0.5);
    expect(far).toBe('#0a1425'); // index (1*4+3)=7 -> 10,20,37
    // Off the image entirely -> null.
    expect(cm.sampleImagePixel(700, 700)).toBe(null);
  });
});

describe('canvas manager — transforms', () => {
  it('applyTransformResult rejects an unsupported type', async () => {
    const cm = makeManager();
    await expect(cm.applyTransformResult('sharpen', {}, 'http://x/1.png'))
      .rejects.toThrow('Unsupported transform result');
  });

  it('applyTransformResult requires a source URL', async () => {
    const cm = makeManager();
    await expect(cm.applyTransformResult('crop', { width: 1, height: 1 }))
      .rejects.toThrow('transform result URL is required');
  });

  it('applyTransformResult reloads the baked image and stamps the size readout', async () => {
    FakeImage.created = [];
    const realImage = globalThis.Image;
    globalThis.Image = FakeImage;
    document.body.innerHTML = '<span id="canvas-size"></span>';
    try {
      const cm = makeManager();
      const pending = cm.applyTransformResult('crop', { width: 200, height: 120 }, 'http://x/cropped.png');
      const img = FakeImage.created[0];
      img.naturalWidth = 200;
      img.naturalHeight = 120;
      img.fire('load');
      await pending;
      expect(cm.documentSize).toEqual({ width: 200, height: 120 });
      expect(document.querySelector('#canvas-size').textContent).toBe('200 × 120');
    } finally {
      globalThis.Image = realImage;
      document.body.innerHTML = '';
    }
  });
});

describe('canvas manager — overlays', () => {
  it('a mask overlay re-renders when its image finishes loading', () => {
    const cm = makeManager();
    const listeners = [];
    cm.render = vi.fn();
    cm.setMaskOverlay({ addEventListener: (t, fn) => listeners.push([t, fn]), complete: false, naturalWidth: 0 });
    expect(cm.maskImage).not.toBe(null);
    expect(cm.render).toHaveBeenCalledTimes(1);
    for (const [type, fn] of listeners) {
      if (type === 'load') fn();
    }
    expect(cm.render).toHaveBeenCalledTimes(2);
    cm.setMaskOverlay(null);
    expect(cm.maskImage).toBe(null);
  });

  it('a preview overlay re-renders on load', () => {
    const cm = makeManager();
    const listeners = [];
    cm.render = vi.fn();
    cm.setPreviewOverlay({ addEventListener: (t, fn) => listeners.push([t, fn]) });
    for (const [type, fn] of listeners) {
      if (type === 'load') fn();
    }
    expect(cm.render).toHaveBeenCalledTimes(2);
    cm.setPreviewOverlay(null);
    expect(cm.previewOverlay).toBe(null);
  });
});

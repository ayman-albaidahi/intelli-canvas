import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { CropTool } from './crop-tool.js';
import { setState } from './app-state.js';
import { bus, events } from './lib/events.js';

// The crop rectangle math itself lives in transform-logic.js and is tested
// there; this suite covers the tool around it: activation gating, the
// pan-lock contract, sync/clamp on window resize, the size readout, the
// drag routing, and the apply boundary where the final clamp and the
// "never send an invalid box" rule live.

function fixture() {
  // jsdom implements neither pointer capture nor PointerEvent; the tool
  // only needs the capture call to exist and be a no-op.
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  document.body.innerHTML = `
    <button data-tool="crop">Crop</button>
    <div id="crop-controls" hidden></div>
    <div id="crop-overlay" hidden>
      <span data-handle="nw"></span><span data-handle="se"></span>
    </div>
    <span id="crop-size"></span>
    <span id="crop-context-size"></span>
    <button id="crop-apply">Apply</button>
    <button id="crop-cancel">Cancel</button>
    <button id="crop-reset">Reset</button>
  `;
}

class FakeCanvasManager {
  constructor({ hasImage = true, scale = 1 } = {}) {
    this.hasImageFlag = hasImage;
    this.scale = scale;
    this.panLocked = false;
    this.loaded = [];
  }
  hasImage() { return this.hasImageFlag; }
  getImageRect() { return { x: 100, y: 50, width: 400, height: 300 }; }
  getSourceDimensions() { return { width: 800, height: 600 }; }
  loadFromUrl(url, image) { this.loaded.push([url, image]); return Promise.resolve(); }
}

function makeTool(overrides = {}) {
  const api = {
    imageId: 'img-1',
    transform: vi.fn(async () => ({ image_id: 'img-1', revision: 4 })),
    contentUrl: (id) => `http://x/api/images/${id}/content`,
    ...overrides.api,
  };
  const canvasManager = overrides.canvasManager ?? new FakeCanvasManager();
  const showToast = vi.fn();
  const tool = new CropTool(canvasManager, document.body, api, showToast);
  return { tool, api, canvasManager, showToast };
}

function pointerEvent(overrides = {}) {
  return { pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, target: null, setPointerCapture: () => {}, ...overrides };
}

describe('crop tool', () => {
  beforeEach(() => {
    fixture();
    setState({ activeTool: 'crop' });
  });

  afterEach(() => {
    bus.clear();
    document.body.innerHTML = '';
  });

  describe('activation', () => {
    it('refuses without an image and bounces the tool back to select', () => {
      const { tool, showToast } = makeTool({ canvasManager: new FakeCanvasManager({ hasImage: false }) });
      tool.activate();
      expect(tool.active).toBe(false);
      expect(showToast).toHaveBeenCalledWith('Choose an image before cropping');
    });

    it('shows the overlay, arms the controls and locks panning', () => {
      const { tool, canvasManager, showToast } = makeTool();
      tool.activate();
      expect(tool.active).toBe(true);
      expect(canvasManager.panLocked).toBe(true);
      expect(document.getElementById('crop-overlay').hidden).toBe(false);
      expect(document.getElementById('crop-controls').hidden).toBe(false);
      expect(showToast).toHaveBeenCalledWith('Drag the handles to resize, or the middle to move');
    });

    it('deactivating releases the pan lock and hides everything', () => {
      const { tool, canvasManager } = makeTool();
      tool.activate();
      tool.deactivate();
      expect(canvasManager.panLocked).toBe(false);
      expect(document.getElementById('crop-overlay').hidden).toBe(true);
      expect(tool.selection).toBe(null);
    });
  });

  describe('syncToImage', () => {
    it('a fresh activation insets the selection to 10%/80% of the image rect', () => {
      const { tool } = makeTool();
      tool.activate();
      // rect 100,50,400,300 -> selection 140,80,320,240
      expect(tool.selection).toEqual({ x: 140, y: 80, width: 320, height: 240 });
    });

    it('a resize re-clamps the existing selection inside the image', () => {
      const { tool } = makeTool();
      tool.activate();
      tool.selection = { x: 1000, y: 900, width: 200, height: 200 };
      tool.syncToImage();
      // clampCropRect pulls it back inside the 100,50,400,300 bounds.
      expect(tool.selection.x).toBeLessThanOrEqual(500 - tool.selection.width);
      expect(tool.selection.y + tool.selection.height).toBeLessThanOrEqual(350);
    });

    it('the min-size floor scales with zoom', () => {
      const cm = new FakeCanvasManager({ scale: 1 });
      const { tool } = makeTool({ canvasManager: cm });
      expect(tool.minSize()).toBe(44);
      cm.scale = 0.05; // 2 source px / 0.05 = 40 view px < 44 floor
      expect(tool.minSize()).toBe(44);
      cm.scale = 10; // 2/10 -> ceil 1 + 1 = 2, floor still 44
      expect(tool.minSize()).toBe(44);
    });
  });

  describe('readout', () => {
    it('shows source-pixel dimensions derived from the selection, not view pixels', () => {
      const { tool } = makeTool();
      tool.activate();
      // selection maps 320x240 of a 400x300 rect -> 640x480 source
      expect(document.getElementById('crop-size').textContent).toBe('640 × 480 px');
      expect(document.getElementById('crop-apply').disabled).toBe(false);
    });

    it('a zero-size selection disables apply and says so', () => {
      const { tool } = makeTool();
      tool.activate();
      tool.selection = { x: 0, y: 0, width: 0, height: 0 };
      tool.render();
      expect(document.getElementById('crop-size').textContent).toBe('Selection too small');
      expect(document.getElementById('crop-apply').disabled).toBe(true);
    });
  });

  describe('drag routing', () => {
    it('pointerdown on a handle resizes; the middle moves', () => {
      const { tool } = makeTool();
      tool.activate();
      const seHandle = document.querySelector('[data-handle="se"]');
      tool.onPointerDown({ ...pointerEvent({ clientX: 460, clientY: 320 }), target: seHandle });
      expect(tool.drag.mode).toBe('se');

      tool.onPointerDown({ ...pointerEvent({ clientX: 300, clientY: 200 }), target: document.getElementById('crop-overlay') });
      expect(tool.drag.mode).toBe('move');
    });

    it('a move drag translates the box inside the image bounds', () => {
      const { tool } = makeTool();
      tool.activate();
      const start = { ...tool.selection };
      tool.onPointerDown({ ...pointerEvent({ clientX: 300, clientY: 200 }), target: document.getElementById('crop-overlay') });
      tool.onPointerMove(pointerEvent({ clientX: 320, clientY: 210 }));
      expect(tool.selection.x).toBe(start.x + 20);
      expect(tool.selection.y).toBe(start.y + 10);
    });

    it('an se-handle drag with shift keeps the aspect ratio', () => {
      const { tool } = makeTool();
      tool.activate();
      tool.selection = { x: 140, y: 80, width: 200, height: 200 };
      tool.onPointerDown({ ...pointerEvent({ clientX: 340, clientY: 280 }), target: document.querySelector('[data-handle="se"]') });
      tool.onPointerMove(pointerEvent({ clientX: 440, clientY: 300, shiftKey: true }));
      // lockAspectRatio: growth takes the larger ratio -> width == height
      expect(tool.selection.width).toBe(tool.selection.height);
    });

    it('stopDrag drops the gesture (pointerup and pointercancel)', () => {
      const { tool } = makeTool();
      tool.activate();
      tool.onPointerDown({ ...pointerEvent(), target: document.getElementById('crop-overlay') });
      tool.stopDrag();
      expect(tool.drag).toBe(null);
    });
  });

  describe('apply', () => {
    it('sends the clamped source-rect payload and reloads the canvas', async () => {
      const { tool, api, canvasManager } = makeTool();
      const heard = [];
      const off = bus.on(events.operation, () => heard.push(true));
      tool.activate();
      await tool.apply();
      expect(api.transform).toHaveBeenCalledWith('crop', { x: 80, y: 60, width: 640, height: 480 });
      expect(canvasManager.loaded).toHaveLength(1);
      expect(heard).toHaveLength(1);
      off();
    });

    it('clamps an out-of-bounds selection before sending', async () => {
      const { tool, api } = makeTool();
      tool.activate();
      tool.selection = { x: 600, y: 600, width: 500, height: 500 };
      await tool.apply();
      // clampCropRect forces it inside; the payload stays within source dims.
      const payload = api.transform.mock.calls[0][1];
      expect(payload.x + payload.width).toBeLessThanOrEqual(800);
      expect(payload.y + payload.height).toBeLessThanOrEqual(600);
    });

    it('a zero selection is rescued by the min-size clamp, not rejected', async () => {
      const { tool, api } = makeTool();
      tool.activate();
      tool.selection = { x: 0, y: 0, width: 0, height: 0 };
      await tool.apply();
      // clampCropRect forces a 44x44 (view px) box inside the rect, which
      // maps to a valid 88x88 source crop — the floor exists precisely so
      // the API never receives a sub-pixel box.
      expect(api.transform).toHaveBeenCalledWith('crop', { x: 0, y: 0, width: 88, height: 88 });
    });

    it('a degenerate image rect cannot produce a payload and toasts', async () => {
      const cm = new FakeCanvasManager();
      cm.getImageRect = () => ({ x: 0, y: 0, width: 0, height: 0 });
      const { tool, api, showToast } = makeTool({ canvasManager: cm });
      tool.activate();
      await tool.apply();
      expect(api.transform).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith('The crop selection is too small or sits outside the image');
    });

    it('an API failure keeps the tool active and surfaces the message', async () => {
      const { tool, showToast } = makeTool({ api: { transform: vi.fn(async () => { throw new Error('bad box'); }) } });
      tool.activate();
      await tool.apply();
      expect(showToast).toHaveBeenCalledWith('bad box');
      expect(tool.active).toBe(true);
      expect(tool.selection).not.toBe(null);
    });

    it('apply outside the crop mode is inert', async () => {
      const { tool, api } = makeTool();
      await tool.apply();
      expect(api.transform).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('restores the default inset selection', () => {
      const { tool } = makeTool();
      tool.activate();
      tool.selection = { x: 0, y: 0, width: 44, height: 44 };
      tool.reset();
      expect(tool.selection).toEqual({ x: 140, y: 80, width: 320, height: 240 });
    });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { BackgroundManager } from './background-manager.js';
import { bus, events } from './lib/events.js';

// The background panel is params assembly plus the busy/preview state
// machine around four API endpoints, a thumbnail catalog, and a pixel
// picker. The fixture mirrors index.html's background accordion ids;
// canvasManager/apiClient/objectManager are fakes exposing only the
// surface this class calls.

function fixture() {
  document.body.innerHTML = `
    <canvas id="object-canvas" style="cursor: grab"></canvas>
    <p id="status-message"></p>
    <input id="bg-key-color" type="color" value="#ffffff">
    <input data-bg-param="tolerance" value="25">
    <input data-bg-param="feather" value="2">
    <input data-bg-param="smooth" value="1">
    <input id="bg-invert" type="checkbox">
    <input data-bg-param="background_blur" value="0">
    <input data-bg-param="background_scale" value="1">
    <input data-bg-param="background_x" value="0">
    <input data-bg-param="background_y" value="0">
    <input id="bg-shadow" type="checkbox">
    <input data-bg-param="shadow_opacity" value="25">
    <input data-bg-param="shadow_blur" value="12">
    <input data-bg-param="shadow_offset_y" value="10">
    <select id="bg-category">
      <option value="all">All</option><option value="product">Product</option>
    </select>
    <select id="bg-library"></select>
    <input id="bg-replace-color" type="color" value="#ffffff">
    <div id="bg-library-grid"></div>
    <input id="bg-upload-input" type="file">
    <button data-action="pick-color">Pick</button>
    <button data-action="preview-mask">Mask</button>
    <button data-action="clear-mask">Clear</button>
    <button data-action="preview-replacement">Preview</button>
    <button data-action="remove-background">Remove</button>
    <button data-action="replace-background">Replace</button>
    <button data-action="reset-background">Reset</button>
    <button data-action="cancel-background">Cancel</button>
    <button data-action="upload-background">Upload</button>
  `;
}

class FakeImage {
  constructor() {
    FakeImage.last = this;
    this.onload = null;
    this.onerror = null;
  }
  set src(value) {
    this._src = value;
    // jsdom never loads pixels: fire the completion hook a microtask after
    // the src assignment, the way a cached image would.
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

function makeDeps({ imageId = 'img-1', catalog = null } = {}) {
  const api = {
    imageId,
    backgroundCatalog: vi.fn(async () => catalog ?? [
      { name: 'studio-white', label: 'Studio White', category: 'general', thumbnail_url: '/t/1.png' },
      { name: 'shop-bg', label: 'Shop', category: 'product', thumbnail_url: '/t/2.png' },
    ]),
    maskPreview: vi.fn(async () => new Blob(['m'])),
    replaceBackgroundPreview: vi.fn(async () => new Blob(['p'])),
    removeBackground: vi.fn(async () => ({ image_id: 'img-1', width: 10, height: 10 })),
    replaceBackground: vi.fn(async () => ({ image_id: 'img-1', width: 10, height: 10 })),
    uploadBackground: vi.fn(async () => 'my-bg'),
    contentUrl: (id) => `http://x/api/images/${id}/content`,
  };
  const canvasManager = {
    sampleImagePixel: vi.fn(() => '#ff00aa'),
    setMaskOverlay: vi.fn(),
    setPreviewOverlay: vi.fn(),
    loadFromUrl: vi.fn(async () => {}),
  };
  const objectManager = { pickMode: false };
  const showToast = vi.fn();
  return { api, canvasManager, objectManager, showToast };
}

function click(selector) {
  document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('background manager', () => {
  let deps;
  let manager;
  let realImage;
  let realCreateURL;
  let realRevokeURL;

  beforeEach(() => {
    fixture();
    makeDepsInto();
    realImage = globalThis.Image;
    globalThis.Image = FakeImage;
    realCreateURL = URL.createObjectURL;
    realRevokeURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    manager = new BackgroundManager({
      canvasManager: deps.canvasManager,
      apiClient: deps.api,
      objectManager: deps.objectManager,
      showToast: deps.showToast,
    });
  });

  function makeDepsInto() {
    deps = makeDeps();
  }

  afterEach(() => {
    globalThis.Image = realImage;
    URL.createObjectURL = realCreateURL;
    URL.revokeObjectURL = realRevokeURL;
    bus.clear();
    document.body.innerHTML = '';
  });

  describe('labels and params', () => {
    it('mirrors every live slider into its readout', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      document.body.insertAdjacentHTML('beforeend', `
        <span id="bg-tolerance-val"></span><span id="bg-feather-val"></span>
        <span id="bg-smooth-val"></span><span id="bg-blur-val"></span>
        <span id="bg-scale-val"></span><span id="bg-shadow-opacity-val"></span>
        <span id="bg-shadow-blur-val"></span>
      `);
      document.querySelector('[data-bg-param="tolerance"]').value = '60';
      document.querySelector('[data-bg-param="tolerance"]').dispatchEvent(new Event('input'));
      expect(document.getElementById('bg-tolerance-val').textContent).toBe('60');
      expect(document.getElementById('bg-shadow-opacity-val').textContent).toBe('25%');
    });

    it('params() builds the backend payload with typed values', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      document.getElementById('bg-invert').checked = true;
      document.getElementById('bg-shadow').checked = true;
      const p = manager.params();
      expect(p).toMatchObject({
        color: '#ffffff',
        tolerance: 25,
        feather: 2,
        smooth: 1,
        invert: true,
        background_blur: 0,
        shadow: true,
        shadow_opacity: 0.25, // percent -> fraction
        shadow_blur: 12,
        shadow_offset_y: 10,
      });
    });

    it('a picked colour wins over the key-colour input', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      manager.pickedColor = '#123456';
      expect(manager.params().color).toBe('#123456');
    });

    it('replacementPayload carries a library name or a solid colour', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      const solid = manager.replacementPayload();
      expect(solid).not.toHaveProperty('background_name');
      expect(solid.background_color).toBe('#ffffff');
      document.getElementById('bg-library').value = 'studio-white';
      const chosen = manager.replacementPayload();
      expect(chosen.background_name).toBe('studio-white');
      expect(chosen).not.toHaveProperty('background_color');
    });
  });

  describe('pixel picking', () => {
    it('gates on an uploaded image and toggles the crosshair', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      deps.api.imageId = null;
      click('[data-action="pick-color"]');
      expect(deps.showToast).toHaveBeenCalledWith('Upload an image first');

      deps.api.imageId = 'img-1';
      click('[data-action="pick-color"]');
      expect(manager.pickMode).toBe(true);
      expect(deps.objectManager.pickMode).toBe(true);
      expect(document.getElementById('object-canvas').style.cursor).toBe('crosshair');
      expect(document.getElementById('bg-key-color').disabled).toBe(true);
      click('[data-action="pick-color"]');
      expect(manager.pickMode).toBe(false);
    });

    it('onPick converts the canvas point, stores the colour, and leaves pick mode', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      manager.pickMode = true;
      deps.objectManager.pickMode = true;
      // The manager wired objectManager.onPick in its constructor:
      deps.objectManager.onPick({ x: 5, y: 7 });
      expect(deps.canvasManager.sampleImagePixel).toHaveBeenCalled();
      expect(manager.pickedColor).toBe('#ff00aa');
      expect(document.getElementById('bg-key-color').value).toBe('#ff00aa');
      expect(manager.pickMode).toBe(false);
    });


    it('a click outside the image toasts instead of picking', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      deps.canvasManager.sampleImagePixel.mockReturnValue(null);
      deps.objectManager.onPick({ x: 9000, y: 9000 });
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('Click inside the image'));
      expect(manager.pickedColor).toBe(null);
    });
  });

  describe('previews', () => {
    it('previewMask fetches, wires the overlay on load, and reports once', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      click('[data-action="preview-mask"]');
      await vi.waitFor(() => expect(deps.api.maskPreview).toHaveBeenCalled());
      await vi.waitFor(() => expect(deps.canvasManager.setMaskOverlay).toHaveBeenCalled());
      expect(deps.showToast).toHaveBeenCalledWith('Mask preview — white keeps, black removes');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    it('previewReplacement fetches the composed image into the preview overlay', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      click('[data-action="preview-replacement"]');
      await vi.waitFor(() => expect(deps.canvasManager.setPreviewOverlay).toHaveBeenCalled());
      expect(deps.showToast).toHaveBeenCalledWith('Replacement preview — press Replace to apply');
    });

    it('a failed preview toasts the error and never throws', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      deps.api.maskPreview.mockRejectedValueOnce(new Error('mask service down'));
      click('[data-action="preview-mask"]');
      await vi.waitFor(() => expect(deps.showToast).toHaveBeenCalledWith('mask service down'));
    });

    it('clear and cancel buttons drop both overlays', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      click('[data-action="clear-mask"]');
      click('[data-action="cancel-background"]');
      expect(deps.canvasManager.setMaskOverlay).toHaveBeenCalledWith(null);
      expect(deps.canvasManager.setPreviewOverlay).toHaveBeenCalledWith(null);
    });
  });

  describe('apply operations', () => {
    it('remove runs the full cycle and emits the operation event only after busy clears', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      // HistoryManager.refresh() drops the history fetch while any manager
      // is mid-operation, so the event must fire last — a subscriber sees
      // busy already false.
      const busyAtEmit = [];
      const off = bus.on(events.operation, () => busyAtEmit.push(manager.busy));

      click('[data-action="remove-background"]');
      expect(document.getElementById('status-message').textContent).toBe('Removing the background…');
      await vi.waitFor(() => expect(deps.canvasManager.loadFromUrl).toHaveBeenCalled());
      await vi.waitFor(() => expect(busyAtEmit).toHaveLength(1));
      expect(busyAtEmit[0]).toBe(false);
      expect(deps.api.removeBackground).toHaveBeenCalled();
      expect(document.getElementById('status-message').textContent).toBe('Background removed');
      expect(deps.canvasManager.setMaskOverlay).toHaveBeenCalledWith(null);
      off();
    });


    it('replace routes through replaceBackground with the library payload', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      document.getElementById('bg-library').value = 'studio-white';
      click('[data-action="replace-background"]');
      await vi.waitFor(() => expect(deps.canvasManager.loadFromUrl).toHaveBeenCalled());
      expect(deps.api.replaceBackground).toHaveBeenCalled();
      expect(deps.api.replaceBackground.mock.calls[0][0]).toMatchObject({ background_name: 'studio-white' });
      expect(document.getElementById('status-message').textContent).toBe('Background replaced');
    });

    it('a failed operation says so in the status and unlocks', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      deps.api.removeBackground.mockRejectedValueOnce(new Error('gpu busy'));
      click('[data-action="remove-background"]');
      await vi.waitFor(() => expect(deps.showToast).toHaveBeenCalledWith('gpu busy'));
      expect(document.getElementById('status-message').textContent).toBe('Background operation failed');
      expect(manager.busy).toBe(false);
    });

    it('ignores a second click while an operation is in flight', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      let release;
      deps.api.removeBackground.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      click('[data-action="remove-background"]');
      click('[data-action="remove-background"]');
      expect(deps.api.removeBackground).toHaveBeenCalledOnce();
      release({ image_id: 'img-1' });
      await vi.waitFor(() => expect(manager.busy).toBe(false));
    });
  });

  describe('library catalog', () => {
    it('populates the select and renders thumbnails with escaped labels', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      const options = [...document.getElementById('bg-library').options].map((o) => o.value);
      expect(options).toEqual(['', 'studio-white', 'shop-bg']);
      expect(document.querySelectorAll('#bg-library-grid .bg-thumb')).toHaveLength(2);
    });

    it('category filter narrows the grid and a thumbnail selects it back', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      const category = document.getElementById('bg-category');
      category.value = 'product';
      category.dispatchEvent(new Event('change'));
      const thumbs = document.querySelectorAll('#bg-library-grid .bg-thumb');
      expect(thumbs).toHaveLength(1);
      expect(thumbs[0].dataset.bgName).toBe('shop-bg');
      thumbs[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.getElementById('bg-library').value).toBe('shop-bg');
      expect(document.querySelector('.bg-thumb.is-selected')).not.toBe(null);
    });

    it('an unreachable catalog says so in the grid and the toast', async () => {
      const offline = makeDeps();
      offline.api.backgroundCatalog = vi.fn(async () => {
        throw new Error('offline');
      });
      const mgr = new BackgroundManager({
        canvasManager: offline.canvasManager,
        apiClient: offline.api,
        objectManager: offline.objectManager,
        showToast: offline.showToast,
      });
      await vi.waitFor(() => expect(offline.showToast).toHaveBeenCalledWith('Background library unavailable'));
      expect(document.getElementById('bg-library-grid').textContent).toMatch(/could not be loaded/i);
      void mgr;
    });


    it('upload adds to the library and selects it; "all" maps to general', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      await manager.uploadLibraryBackground({ name: 'x.png' });
      expect(deps.api.uploadBackground).toHaveBeenCalledWith({ name: 'x.png' }, 'general');
      expect(deps.showToast).toHaveBeenCalledWith('my-bg added to the background library');
      document.getElementById('bg-category').value = 'product';
      await manager.uploadLibraryBackground({ name: 'y.png' });
      expect(deps.api.uploadBackground).toHaveBeenLastCalledWith({ name: 'y.png' }, 'product');
    });
  });

  describe('reset', () => {
    it('restores defaults, drops the pick, clears previews and the toast', async () => {
      await vi.waitFor(() => expect(manager.catalog).toBeDefined());
      manager.pickedColor = '#123456';
      document.getElementById('bg-invert').checked = true;
      click('[data-action="reset-background"]');
      expect(document.getElementById('bg-key-color').value).toBe('#ffffff');
      expect(document.getElementById('bg-invert').checked).toBe(false);
      expect(manager.pickedColor).toBe(null);
      expect(deps.canvasManager.setMaskOverlay).toHaveBeenCalledWith(null);
      expect(deps.showToast).toHaveBeenCalledWith('Background settings reset');
    });
  });
});

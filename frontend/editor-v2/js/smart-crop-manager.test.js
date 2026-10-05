import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { SmartCropManager } from './smart-crop-manager.js';
import { bus, events } from './lib/events.js';

// The smart-crop panel is a preview/apply cycle over two API endpoints,
// with an object-URL the panel must always revoke. The fixture mirrors
// the #smart-crop-* ids and the three data-smart-crop-action buttons.

function fixture() {
  document.body.innerHTML = `
    <select id="smart-crop-ratio">
      <option value="original" selected>Original</option>
      <option value="1:1">1:1 Square</option>
    </select>
    <span id="smart-crop-status">Ready</span>
    <img id="smart-crop-preview" hidden>
    <button data-action="smart-crop-preview" data-smart-crop-action>Preview</button>
    <button data-action="smart-crop-apply" data-smart-crop-action>Apply</button>
    <button data-action="smart-crop-cancel" data-smart-crop-action>Clear</button>
    <span id="canvas-size"></span>
  `;
}

function makeDeps({ imageId = 'img-1' } = {}) {
  const api = {
    imageId,
    smartCropPreview: vi.fn(async () => ({ blob: new Blob(['p']), metadata: '' })),
    smartCropApply: vi.fn(async () => ({ image_id: 'img-1', width: 300, height: 300 })),
    contentUrl: (id) => `http://x/api/images/${id}/content`,
  };
  const canvasManager = { loadFromUrl: vi.fn(async () => {}) };
  const showToast = vi.fn();
  return { api, canvasManager, showToast };
}

function click(selector) {
  document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('smart crop manager', () => {
  let deps;
  let mgr;
  let created;
  let revoked;

  beforeEach(() => {
    fixture();
    created = [];
    revoked = [];
    URL.createObjectURL = vi.fn((_blob) => {
      const url = `blob:fake-${created.length}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url) => revoked.push(url));
    deps = makeDeps();
    mgr = new SmartCropManager({
      canvasManager: deps.canvasManager,
      apiClient: deps.api,
      showToast: deps.showToast,
    });
  });

  afterEach(() => {
    bus.clear();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('gates the controls on a session image', () => {
    deps.api.imageId = null;
    bus.emit(events.appStateChange, {});
    for (const button of document.querySelectorAll('[data-smart-crop-action]')) {
      expect(button.disabled).toBe(true);
    }
  });

  it('preview fetches the selected ratio and reveals the object URL', async () => {
    document.getElementById('smart-crop-ratio').value = '1:1';
    click('[data-action="smart-crop-preview"]');
    await vi.waitFor(() => expect(deps.showToast).toHaveBeenCalledWith('Smart Crop preview ready'));
    expect(deps.api.smartCropPreview).toHaveBeenCalledWith('1:1');
    const img = document.getElementById('smart-crop-preview');
    expect(img.hidden).toBe(false);
    expect(img.src).toBe(created[0]);
    expect(document.getElementById('smart-crop-status').textContent).toBe('Preview ready — apply to commit in Python');
  });

  it('a second preview revokes the first object URL', async () => {
    await mgr.preview();
    await mgr.preview();
    expect(revoked).toEqual([created[0]]);
    expect(document.getElementById('smart-crop-preview').src).toBe(created[1]);
  });

  it('a failed preview reports its own status and toasts', async () => {
    deps.api.smartCropPreview.mockRejectedValueOnce(new Error('no saliency'));
    await mgr.preview();
    expect(document.getElementById('smart-crop-status').textContent).toBe('Smart Crop preview failed');
    expect(deps.showToast).toHaveBeenCalledWith('no saliency');
    expect(mgr.busy).toBe(false);
  });

  it('apply reloads the baked crop, stamps the size, resets the preview, and emits operation after busy clears', async () => {
    await mgr.preview();
    const busyAtEmit = [];
    const off = bus.on(events.operation, () => busyAtEmit.push(mgr.busy));

    click('[data-action="smart-crop-apply"]');
    await vi.waitFor(() => expect(deps.canvasManager.loadFromUrl).toHaveBeenCalled());
    expect(deps.canvasManager.loadFromUrl).toHaveBeenCalledWith('http://x/api/images/img-1/content', expect.objectContaining({ width: 300 }));
    expect(document.getElementById('canvas-size').textContent).toBe('300 × 300');
    expect(document.getElementById('smart-crop-status').textContent).toBe('Smart Crop applied and added to History');
    // the preview object URL is released as part of the apply reset
    expect(revoked).toEqual([created[0]]);
    expect(document.getElementById('smart-crop-preview').hidden).toBe(true);
    expect(busyAtEmit).toHaveLength(1);
    expect(busyAtEmit[0]).toBe(false);
    off();
  });

  it('a failed apply reports, toasts, and still emits the refresh event', async () => {
    const busyAtEmit = [];
    const off = bus.on(events.operation, () => busyAtEmit.push(mgr.busy));
    deps.api.smartCropApply.mockRejectedValueOnce(new Error('crop rejected'));
    await mgr.apply();
    expect(document.getElementById('smart-crop-status').textContent).toBe('Smart Crop failed');
    expect(deps.showToast).toHaveBeenCalledWith('crop rejected');
    expect(busyAtEmit).toHaveLength(1);
    off();
  });

  it('concurrent preview/apply calls are dropped by the busy flag', async () => {
    let release;
    deps.api.smartCropApply.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const first = mgr.apply();
    await mgr.apply();
    await mgr.preview();
    expect(deps.api.smartCropApply).toHaveBeenCalledOnce();
    expect(deps.api.smartCropPreview).not.toHaveBeenCalled();
    release({ image_id: 'img-1', width: 1, height: 1 });
    await first;
  });

  it('gates on an uploaded image before either action', async () => {
    deps.api.imageId = null;
    await mgr.preview();
    await mgr.apply();
    expect(deps.api.smartCropPreview).not.toHaveBeenCalled();
    expect(deps.api.smartCropApply).not.toHaveBeenCalled();
    expect(deps.showToast).toHaveBeenCalledTimes(2);
    expect(deps.showToast).toHaveBeenCalledWith('Upload an image before using Smart Crop');
  });

  it('clear resets to Ready and revokes the dangling URL', async () => {
    await mgr.preview();
    click('[data-action="smart-crop-cancel"]');
    expect(revoked).toEqual([created[0]]);
    expect(mgr.previewUrl).toBe(null);
    expect(document.getElementById('smart-crop-status').textContent).toBe('Ready');
    expect(document.getElementById('smart-crop-preview').hidden).toBe(true);
  });

  it('reset with no preview is safe', () => {
    expect(() => mgr.reset()).not.toThrow();
    expect(revoked).toEqual([]);
  });
});

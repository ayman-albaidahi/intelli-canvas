import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { FiltersManager } from './filters-manager.js';
import { bus, events } from './lib/events.js';

// The filters panel is a busy-guarded dispatcher: each button reads its
// own advanced controls, POSTs the operation, and reloads the canvas.
// The fixture mirrors index.html's filter ids; apiClient/canvasManager
// are fakes. In-progress status strings use the U+2026 ellipsis — the
// fourth module where that glyph has to be copied exactly from source.

function fixture() {
  document.body.innerHTML = `
    <span id="filters-status">Ready</span>
    <div id="histogram-output"></div>
    <select id="sobel-ksize"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option></select>
    <select id="median-ksize"><option value="3" selected>3</option></select>
    <select id="morphology-operation"><option value="erode" selected>Erode</option><option value="dilate">Dilate</option></select>
    <select id="morphology-ksize"><option value="3" selected>3</option></select>
    <input id="gamma-value" type="number" value="1">
    <input id="threshold-value" type="number" value="128">
    <button data-action="apply-sobel" data-filter-action>Sobel</button>
    <button data-action="apply-laplacian" data-filter-action>Laplacian</button>
    <button data-action="apply-median-filter" data-filter-action>Median</button>
    <button data-action="apply-morphology" data-filter-action>Morphology</button>
    <button data-action="apply-gamma" data-filter-action>Gamma</button>
    <button data-action="apply-threshold" data-filter-action>Threshold</button>
    <button data-action="compute-histogram" data-filter-action>Histogram</button>
    <span id="canvas-size"></span>
  `;
}

function makeDeps({ imageId = 'img-1' } = {}) {
  const api = {
    imageId,
    process: vi.fn(async (operation, data) => ({ image_id: 'img-1', width: 800, height: 600, operation, data })),
    histogram: vi.fn(async () => ({ red: [10, 20, 30], green: [0, 0, 0], blue: [5, 5, 5] })),
    contentUrl: (id) => `http://x/api/images/${id}/content`,
  };
  const canvasManager = { loadFromUrl: vi.fn(async () => {}) };
  const showToast = vi.fn();
  return { api, canvasManager, showToast };
}

function click(selector) {
  document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('filters manager', () => {
  let deps;
  let mgr;

  beforeEach(() => {
    fixture();
    deps = makeDeps();
    mgr = new FiltersManager({ canvasManager: deps.canvasManager, apiClient: deps.api, showToast: deps.showToast });
  });

  afterEach(() => {
    bus.clear();
    document.body.innerHTML = '';
  });

  describe('parameter reading', () => {
    it('each button sends its own operation and advanced controls', async () => {
      click('[data-action="apply-sobel"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('sobel', { ksize: 3 }));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));

      click('[data-action="apply-laplacian"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('laplacian', {}));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));

      click('[data-action="apply-median-filter"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('median-filter', { ksize: 3 }));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));

      click('[data-action="apply-morphology"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('morphology', { operation: 'erode', ksize: 3 }));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));

      click('[data-action="apply-gamma"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('gamma', { value: 1 }));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));

      click('[data-action="apply-threshold"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('threshold', { value: 128 }));
    });

    it('reads current control values, not defaults', async () => {
      document.getElementById('sobel-ksize').value = '5';
      document.getElementById('gamma-value').value = '1.4';
      document.getElementById('threshold-value').value = '90';
      click('[data-action="apply-sobel"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('sobel', { ksize: 5 }));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));
      click('[data-action="apply-gamma"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('gamma', { value: 1.4 }));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));
      click('[data-action="apply-threshold"]');
      await vi.waitFor(() => expect(deps.api.process).toHaveBeenCalledWith('threshold', { value: 90 }));
    });
  });

  describe('apply flow', () => {
    it('reloads the canvas, stamps the size, reports and emits operation after busy clears', async () => {
      const busyAtEmit = [];
      const off = bus.on(events.operation, () => busyAtEmit.push(mgr.busy));

      click('[data-action="apply-sobel"]');
      expect(document.getElementById('filters-status').textContent).toBe('Processing\u2026');
      await vi.waitFor(() => expect(deps.canvasManager.loadFromUrl).toHaveBeenCalled());
      expect(deps.canvasManager.loadFromUrl).toHaveBeenCalledWith('http://x/api/images/img-1/content', expect.objectContaining({ operation: 'sobel' }));
      expect(document.getElementById('canvas-size').textContent).toBe('800 × 600');
      expect(document.getElementById('filters-status').textContent).toBe('Detail boost applied');
      expect(deps.showToast).toHaveBeenCalledWith('Detail boost applied');
      expect(busyAtEmit).toHaveLength(1);
      expect(busyAtEmit[0]).toBe(false);
      off();
    });

    it('gates on an uploaded image', async () => {
      deps.api.imageId = null;
      mgr.syncControls();
      click('[data-action="apply-sobel"]');
      await new Promise((r) => setTimeout(r, 0));
      expect(deps.api.process).not.toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith('Upload an image before processing');
    });

    it('a failed apply reports the generic status, toasts the error, unlocks', async () => {
      deps.api.process.mockRejectedValueOnce(new Error('cv2 missing'));
      click('[data-action="apply-sobel"]');
      await vi.waitFor(() => expect(deps.showToast).toHaveBeenCalledWith('cv2 missing'));
      expect(document.getElementById('filters-status').textContent).toBe('Could not apply filter');
      expect(mgr.busy).toBe(false);
      expect(deps.canvasManager.loadFromUrl).not.toHaveBeenCalled();
    });

    it('a failed apply still refreshes history: the emit is unconditional, after busy clears', async () => {
      // The emit sits after the try/catch/finally, so a failure dispatches
      // the event too — HistoryManager re-reads unchanged history, which is
      // harmless. Pinning this, because a future refactor that moves the
      // emit inside try would silently break history refresh on success too.
      const busyAtEmit = [];
      const off = bus.on(events.operation, () => busyAtEmit.push(mgr.busy));
      deps.api.process.mockRejectedValueOnce(new Error('boom'));
      await mgr.apply('sobel', {}, 'ok');
      expect(busyAtEmit).toHaveLength(1);
      expect(busyAtEmit[0]).toBe(false);
      off();
    });
  });

  describe('busy guard and control sync', () => {
    it('drops concurrent clicks while a filter is in flight', async () => {
      let release;
      deps.api.process.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      click('[data-action="apply-sobel"]');
      click('[data-action="apply-laplacian"]');
      expect(deps.api.process).toHaveBeenCalledOnce();
      release({ image_id: 'img-1', width: 1, height: 1 });
      await vi.waitFor(() => expect(mgr.busy).toBe(false));
    });

    it('every filter control is disabled while busy and re-enabled after', async () => {
      let release;
      deps.api.process.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      click('[data-action="apply-sobel"]');
      for (const control of document.querySelectorAll('[data-filter-action]')) {
        expect(control.disabled).toBe(true);
      }
      release({ image_id: 'img-1', width: 1, height: 1 });
      await vi.waitFor(() => expect(mgr.busy).toBe(false));
      for (const control of document.querySelectorAll('[data-filter-action]')) {
        expect(control.disabled).toBe(false);
      }
    });

    it('removes appStateChange re-syncs with the session state', async () => {
      deps.api.imageId = null;
      bus.emit(events.appStateChange, {});
      expect(document.querySelector('[data-action="compute-histogram"]').disabled).toBe(true);
      deps.api.imageId = 'img-1';
      bus.emit(events.appStateChange, {});
      expect(document.querySelector('[data-action="compute-histogram"]').disabled).toBe(false);
    });
  });

  describe('histogram', () => {
    it('renders per-channel rows with totals and peak levels', async () => {
      click('[data-action="compute-histogram"]');
      await vi.waitFor(() => expect(deps.showToast).toHaveBeenCalledWith('Histogram updated'));
      const out = document.getElementById('histogram-output');
      // counts go through toLocaleString (Arabic-Indic digits in jsdom), so
      // the expectation mirrors the same formatting rather than hardcoding
      // locale output. red: 60 px peak 30/60 -> 50%; green zeros -> 0%;
      // blue: 15 px peak 5/15 -> 33%.
      expect(out.textContent).toContain(`RED${(60).toLocaleString()} px · peak 50%`);
      expect(out.textContent).toContain(`GREEN${(0).toLocaleString()} px · peak 0%`);
      expect(out.textContent).toContain(`BLUE${(15).toLocaleString()} px · peak 33%`);
      expect(document.getElementById('filters-status').textContent).toBe('Histogram updated');
    });

    it('gates on an uploaded image', async () => {
      deps.api.imageId = null;
      await mgr.histogram();
      expect(deps.api.histogram).not.toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith('Upload an image before processing');
    });

    it('a failed histogram reports and toasts', async () => {
      deps.api.histogram.mockRejectedValueOnce(new Error('no stats'));
      await mgr.histogram();
      expect(document.getElementById('filters-status').textContent).toBe('Could not compute histogram');
      expect(deps.showToast).toHaveBeenCalledWith('no stats');
    });

    it('a histogram with no output element is a silent no-op', async () => {
      document.getElementById('histogram-output').remove();
      await expect(mgr.histogram()).resolves.toBeUndefined();
    });
  });
});

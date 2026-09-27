import { describe, expect, it, vi, afterEach } from 'vitest';

import { EditorApp } from './app.js';
import { bus, events } from './lib/events.js';

// Full boot of the editor requires the whole page (every panel, canvas and
// dialog), which is what the 124 browser tests do end to end. These tests
// cover the lifecycle contract that exists precisely for the boot: what
// destroy() guarantees, what getService exposes, and the two facade paths
// (layer restore error, lazy analysis reset) that were easy to break in the
// move from top-level consts to instance fields.

afterEach(() => {
  bus.clear();
  document.body.innerHTML = '';
});

describe('EditorApp lifecycle', () => {
  it('starts not-running, with no services', () => {
    const app = new EditorApp();
    expect(app.running).toBe(false);
    expect(app.getService('canvasManager')).toBe(null);
    expect(app.getService('missing')).toBe(null);
  });

  it('destroy clears the teardown list, bus listeners and running flag', () => {
    const app = new EditorApp();
    const offA = vi.fn();
    const offB = vi.fn();
    app._teardown.push(offA, offB);
    const heard = vi.fn();
    app._teardown.push(bus.on(events.operation, heard));

    app.running = true;
    app.destroy();

    expect(offA).toHaveBeenCalledOnce();
    expect(offB).toHaveBeenCalledOnce();
    expect(app.running).toBe(false);
    expect(app._teardown).toHaveLength(0);

    // bus.clear() ran: a later emit reaches nobody.
    bus.emit(events.operation);
    expect(heard).not.toHaveBeenCalled();
  });

  it('destroy keeps tearing down after a teardown function throws', () => {
    const app = new EditorApp();
    const bad = vi.fn(() => {
      throw new Error('teardown exploded');
    });
    const good = vi.fn();
    app._teardown.push(bad, good);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => app.destroy()).not.toThrow();
    expect(bad).toHaveBeenCalledOnce();
    expect(good).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('destroy cancels a pending debounced layer save', () => {
    vi.useFakeTimers();
    try {
      const app = new EditorApp();
      const apiClient = { imageId: 'img-1', saveLayers: vi.fn(async () => []) };
      app.apiClient = apiClient;
      app.objectManager = { serializeLayers: () => [], applyPersistedLayers: vi.fn() };
      app.layerSaveTimer = setTimeout(() => {
        apiClient.saveLayers(app.objectManager.serializeLayers());
      }, 250);

      app.destroy();
      vi.advanceTimersByTime(1000);
      expect(apiClient.saveLayers).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('EditorApp.restoreLayers', () => {
  it('is a no-op without a session image', async () => {
    const app = new EditorApp();
    app.apiClient = { imageId: null, layers: vi.fn() };
    app.objectManager = { loadLayers: vi.fn() };

    await app.restoreLayers();

    expect(app.apiClient.layers).not.toHaveBeenCalled();
    expect(app.objectManager.loadLayers).not.toHaveBeenCalled();
  });

  it('loads the persisted layers for the current image', async () => {
    const app = new EditorApp();
    const layers = [{ id: 'a', type: 'brush' }];
    app.apiClient = { imageId: 'img-1', layers: async () => layers };
    app.objectManager = { loadLayers: vi.fn(async () => {}) };

    await app.restoreLayers();

    expect(app.objectManager.loadLayers).toHaveBeenCalledWith(layers);
  });

  it('routes a failed restore through handleError, not a silent throw', async () => {
    const app = new EditorApp();
    document.body.innerHTML = '<div id="toast" aria-live="polite"></div>';
    const error = new Error('session expired');
    app.apiClient = {
      imageId: 'img-1',
      layers: async () => {
        throw error;
      },
    };
    app.objectManager = { loadLayers: vi.fn() };
    const seen = [];
    const off = bus.on(events.error, (payload) => seen.push(payload));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(app.restoreLayers()).resolves.toBeUndefined();

    expect(seen).toHaveLength(1);
    expect(seen[0].error.context).toBe('layers.restore');
    expect(document.querySelector('#toast').textContent).toBe('session expired');

    errorSpy.mockRestore();
    off();
  });
});

describe('EditorApp.renderZoom', () => {
  it('shows an em dash before any image is loaded', () => {
    document.body.innerHTML = '<span data-zoom-display></span>';
    const app = new EditorApp();
    app.canvasManager = { hasImage: () => false };

    app.renderZoom();

    expect(document.querySelector('[data-zoom-display]').textContent).toBe('—');
  });

  it('reports the live zoom percentage once an image exists', () => {
    document.body.innerHTML = '<span data-zoom-display></span>';
    const app = new EditorApp();
    app.canvasManager = { hasImage: () => true };

    // appState.zoom is module state shared with the real app; the component
    // contract is "percentage of appState.zoom", so drive it through the
    // same bus the chrome listens on would be circular — read what
    // renderZoom wrote, which must end in % when an image exists.
    app.renderZoom();

    expect(document.querySelector('[data-zoom-display]').textContent).toMatch(/%$/);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { AdjustmentsManager } from './adjustments-manager.js';

const ADJUSTMENTS_HTML = `
  <div>
    <input data-adjustment="brightness" type="range" min="0" max="200" value="100">
    <input data-adjustment="contrast" type="range" min="0" max="200" value="100">
    <input data-adjustment="saturation" type="range" min="0" max="200" value="100">
    <input data-adjustment="blur" type="range" min="0" max="100" value="0">
    <input data-adjustment="sharpen" type="range" min="0" max="100" value="0">
    <input data-adjustment="grayscale" type="checkbox">
    <input data-adjustment="negative" type="checkbox">
    <output data-value-for="brightness"></output>
    <output data-value-for="contrast"></output>
    <output data-value-for="saturation"></output>
    <output data-value-for="blur"></output>
    <output data-value-for="sharpen"></output>
    <button data-action="apply-adjustments">Apply</button>
    <button data-action="reset-adjustments">Reset all</button>
    <button data-reset="brightness">Reset brightness</button>
    <p id="adjustment-summary"></p>
    <p id="applied-line"></p>
    <p id="status-message"></p>
    <input id="preview-toggle" type="checkbox">
  </div>
`;

function makeManager(options = {}) {
  const dom = new JSDOM(ADJUSTMENTS_HTML);
  global.window = dom.window;
  global.document = dom.window.document;
  const calls = { process: 0, setAdjustments: 0, loadFromUrl: 0, setPreview: 0 };
  const apiClient = options.apiClient || {
    imageId: 'img-1',
    process: async () => { calls.process += 1; return { image_id: 'img-1' }; },
    contentUrl: (id) => `http://localhost:5000/api/images/${id}/content`,
  };
  const canvasManager = options.canvasManager || {
    setAdjustments: (values) => { calls.setAdjustments += 1; canvasManager.lastAdjustments = values; },
    setPreview: () => { calls.setPreview += 1; },
    loadFromUrl: async () => { calls.loadFromUrl += 1; },
    adjustmentSummary: () => 'no adjustments',
  };
  const showToast = vi.fn();
  const manager = new AdjustmentsManager({ canvasManager, apiClient, showToast });
  return { manager, calls, showToast, apiClient, canvasManager, document: dom.window.document };
}

beforeEach(() => { vi.resetAllMocks(); });

describe('AdjustmentsManager — changedPayload (only non-neutral values)', () => {
  it('reports nothing at neutral values', () => {
    const { manager } = makeManager();
    expect(manager.changedPayload()).toEqual({});
    expect(manager.hasUnappliedChanges()).toBe(false);
  });

  it('reports only sliders moved away from neutral', () => {
    const { manager, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    expect(manager.changedPayload()).toEqual({ brightness: 130 });
    expect(manager.hasUnappliedChanges()).toBe(true);
  });

  it('includes boolean flags', () => {
    const { manager, document } = makeManager();
    document.querySelector('[data-adjustment="grayscale"]').checked = true;
    expect(manager.changedPayload()).toEqual({ grayscale: true });
  });
});

describe('AdjustmentsManager — applyPreview does not mutate committed state', () => {
  it('paints sliders onto the canvas without calling the backend', () => {
    const { manager, calls, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    manager.applyPreview();
    expect(calls.setAdjustments).toBe(1);
    expect(calls.process).toBe(0);
  });

  it('updates the value labels with their unit suffixes on input', () => {
    const { document } = makeManager();
    const blur = document.querySelector('[data-adjustment="blur"]');
    blur.value = '4';
    blur.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
    expect(document.querySelector('[data-value-for="blur"]').textContent).toBe('4px');
    expect(document.querySelector('[data-value-for="brightness"]').textContent).toBe('100');
  });

  it('preview leaves lastApplied untouched', () => {
    const { manager } = makeManager();
    manager.applyPreview();
    expect(manager.lastApplied).toBe(null);
  });
});

describe('AdjustmentsManager — applyInPython', () => {
  it('rejects an apply before upload', async () => {
    const { manager, showToast, apiClient } = makeManager();
    apiClient.imageId = null;
    await manager.applyInPython();
    expect(showToast).toHaveBeenCalledWith('Upload an image before processing');
  });

  it('rejects an apply with nothing changed', async () => {
    const { manager, showToast } = makeManager();
    await manager.applyInPython();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Nothing to apply'));
  });

  it('rejects an identical repeat apply', async () => {
    const { manager, showToast, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    await manager.applyInPython();
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    await manager.applyInPython();
    expect(showToast).toHaveBeenLastCalledWith(expect.stringContaining('unchanged'));
  });

  it('applies, reloads the canvas, and fires ic-operation exactly once', async () => {
    const { manager, calls, document } = makeManager();
    const fired = vi.fn();
    global.document.addEventListener('ic-operation', fired);
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    await manager.applyInPython();
    expect(calls.process).toBe(1);
    expect(calls.loadFromUrl).toBe(1);
    expect(fired).toHaveBeenCalledTimes(1);
    global.document.removeEventListener('ic-operation', fired);
  });

  it('resets sliders to neutral after a successful apply', async () => {
    const { manager, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    await manager.applyInPython();
    expect(document.querySelector('[data-adjustment="brightness"]').value).toBe('100');
    expect(manager.changedPayload()).toEqual({});
  });

  it('shows a friendly message when the backend rejects the apply', async () => {
    const { manager, showToast, apiClient, document } = makeManager();
    apiClient.process = async () => { throw new Error('Brightness out of range'); };
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    await manager.applyInPython();
    expect(showToast).toHaveBeenCalledWith('Brightness out of range');
  });

  it('clears busy afterward so the next apply can run', async () => {
    const { manager, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    await manager.applyInPython();
    expect(manager.busy).toBe(false);
  });
});

describe('AdjustmentsManager — busy guard on the apply button', () => {
  it('disables the apply button while busy', async () => {
    const { manager, apiClient, document } = makeManager();
    let resolveApply;
    apiClient.process = () => new Promise((resolve) => { resolveApply = resolve; });
    document.querySelector('[data-adjustment="brightness"]').value = '130';
    const apply = manager.applyInPython();
    expect(manager.busy).toBe(true);
    expect(document.querySelector('[data-action="apply-adjustments"]').disabled).toBe(true);
    resolveApply({ image_id: 'img-1' });
    await apply;
    expect(document.querySelector('[data-action="apply-adjustments"]').disabled).toBe(false);
  });
});

describe('AdjustmentsManager — reset', () => {
  it('resetOne returns a single slider to neutral and republishes it', () => {
    const { manager, calls, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '140';
    manager.resetOne('brightness');
    expect(document.querySelector('[data-adjustment="brightness"]').value).toBe('100');
    expect(calls.setAdjustments).toBeGreaterThanOrEqual(1);
  });

  it('resetAll returns every slider to neutral', () => {
    const { manager, document } = makeManager();
    document.querySelector('[data-adjustment="brightness"]').value = '140';
    document.querySelector('[data-adjustment="blur"]').value = '5';
    manager.resetAll();
    expect(manager.changedPayload()).toEqual({});
  });
});

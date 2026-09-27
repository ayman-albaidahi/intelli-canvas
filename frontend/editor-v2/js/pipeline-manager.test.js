import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { PipelineManager } from './pipeline-manager.js';
import { bus, events } from './lib/events.js';

// The pipeline panel is a thin UI over a server-owned node list: every
// mutation round-trips through the API and re-renders from the response.
// The fixture mirrors the #pipeline-* ids from index.html; the api client
// is a fake returning versioned envelopes like the backend does.

function fixture() {
  document.body.innerHTML = `
    <section id="pipeline-panel">
      <select id="pipeline-operation">
        <option value="brightness">Brightness</option>
        <option value="blur">Blur</option>
      </select>
      <span id="pipeline-version">v1</span>
      <button data-action="pipeline-add">Add</button>
      <button data-action="pipeline-preview">Preview</button>
      <button data-action="pipeline-apply">Apply</button>
      <p id="pipeline-preview-status" hidden></p>
      <button class="pipeline-retry" data-action="pipeline-retry" hidden>Retry</button>
      <div id="pipeline-list"></div>
    </section>`;
}

class FakeImage {
  // A microtask after src assignment resolves onload; errorNext makes the
  // *next* constructed image fire onerror instead (a blob the browser
  // cannot decode).
  static errorNext = false;
  set src(value) {
    this._src = value;
    const fireError = FakeImage.errorNext;
    FakeImage.errorNext = false;
    queueMicrotask(() => (fireError ? this.onerror?.() : this.onload?.()));
  }
  get src() {
    return this._src;
  }
}

function pipeline(nodes = []) {
  return { version: 1, nodes };
}

function node(id, operation = 'brightness', overrides = {}) {
  return { id, operation, enabled: true, parameters: { value: 100 }, ...overrides };
}

function makeDeps(initial = pipeline([])) {
  const api = {
    imageId: 'img-1',
    pipeline: vi.fn(async () => initial),
    addPipelineNode: vi.fn(async (body) => pipeline([...initial.nodes, node('n9', body.operation, { parameters: body.parameters })])),
    updatePipelineNode: vi.fn(async (id, changes) => pipeline(initial.nodes.map((n) => (n.id === id ? { ...n, ...changes } : n)))),
    togglePipelineNode: vi.fn(async (id) => pipeline(initial.nodes.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)))),
    deletePipelineNode: vi.fn(async (id) => pipeline(initial.nodes.filter((n) => n.id !== id))),
    reorderPipelineNode: vi.fn(async (id, target) => {
      const nodes = [...initial.nodes];
      const from = nodes.findIndex((n) => n.id === id);
      const [moved] = nodes.splice(from, 1);
      nodes.splice(target, 0, moved);
      return pipeline(nodes);
    }),
    previewPipeline: vi.fn(async () => new Blob(['p'])),
    applyPipeline: vi.fn(async () => ({ image_id: 'img-1', cache_hit: false })),
    contentUrl: (id) => `http://x/api/images/${id}/content`,
  };
  const canvasManager = { setPreviewOverlay: vi.fn(), loadFromUrl: vi.fn(async () => {}) };
  const showToast = vi.fn();
  return { api, canvasManager, showToast };
}

function click(selector) {
  document.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('pipeline manager', () => {
  let deps;
  let mgr;
  let realImage;
  let realCreate;

  beforeEach(() => {
    fixture();
    deps = makeDeps(pipeline([node('n1'), node('n2', 'blur', { parameters: { value: 2 } })]));
    realImage = globalThis.Image;
    globalThis.Image = FakeImage;
    realCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    mgr = new PipelineManager({ apiClient: deps.api, canvasManager: deps.canvasManager, showToast: deps.showToast });
  });

  afterEach(() => {
    globalThis.Image = realImage;
    URL.createObjectURL = realCreate;
    bus.clear();
    document.body.innerHTML = '';
  });

  describe('refresh', () => {
    it('loads the server pipeline on construction and renders it', async () => {
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(2));
      expect(deps.api.pipeline).toHaveBeenCalled();
      expect(document.getElementById('pipeline-version').textContent).toBe('v1');
      expect(document.getElementById('pipeline-preview-status').textContent).toBe('Pipeline loaded.');
    });

    it('skips without a session image and while busy', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      deps.api.pipeline.mockClear();
      deps.api.imageId = null;
      bus.emit(events.appStateChange, {});
      await vi.waitFor(() => expect(mgr.busy).toBe(false));
      expect(deps.api.pipeline).not.toHaveBeenCalled();
    });

    it('a failed load shows an error status and reveals the retry button', async () => {
      deps.api.pipeline.mockRejectedValueOnce(new Error('session gone'));
      await mgr.refresh();
      const status = document.getElementById('pipeline-preview-status');
      expect(status.textContent).toBe('session gone');
      expect(status.classList.contains('is-error')).toBe(true);
      expect(document.querySelector('[data-action="pipeline-retry"]').hidden).toBe(false);
      click('[data-action="pipeline-retry"]');
      await vi.waitFor(() => expect(document.getElementById('pipeline-preview-status').textContent).toBe('Pipeline loaded.'));
    });
  });

  describe('rendering', () => {
    it('an empty pipeline shows the empty-state panel', async () => {
      deps.api.pipeline.mockResolvedValueOnce(pipeline([]));
      await mgr.refresh();
      expect(document.querySelector('#pipeline-list .empty-panel strong').textContent).toBe('No pipeline operations');
    });

    it('rows carry label, order, enabled state and numeric parameter inputs', async () => {
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(2));
      const [first] = document.querySelectorAll('.pipeline-row');
      expect(first.querySelector('strong').textContent).toBe('brightness');
      expect(first.querySelector('.pipeline-order').textContent).toBe('1');
      expect(first.getAttribute('aria-label')).toContain('enabled');
      const blur = document.querySelectorAll('.pipeline-row')[1];
      expect(blur.querySelector('strong').textContent).toBe('Soft focus');
      const input = blur.querySelector('[data-node-parameter="value"]');
      expect(input.value).toBe('2');
    });

    it('boolean and object parameters are not rendered as inputs', async () => {
      deps.api.pipeline.mockResolvedValueOnce(pipeline([node('n3', 'morphology', { parameters: { operation: 'open', ksize: 3, nested: {}, flag: true } })]));
      await mgr.refresh();
      const keys = [...document.querySelectorAll('#pipeline-list [data-node-parameter]')].map((i) => i.dataset.nodeParameter);
      // strings and numbers get inputs; booleans and objects are skipped.
      expect(keys).toEqual(['operation', 'ksize']);
    });

    it('disabled rows get the is-disabled class and an Off toggle', async () => {
      deps.api.pipeline.mockResolvedValueOnce(pipeline([node('n4', 'brightness', { enabled: false })]));
      await mgr.refresh();
      const row = document.querySelector('.pipeline-row');
      expect(row.classList.contains('is-disabled')).toBe(true);
      expect(row.querySelector('[data-pipeline-action="toggle"]').textContent).toBe('Off');
    });
  });

  describe('mutations through the list delegation', () => {
    beforeEach(async () => {
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(2));
    });

    it('toggle, delete, up and down buttons hit the right endpoint', async () => {
      const rows = document.querySelectorAll('.pipeline-row');
      rows[0].querySelector('[data-pipeline-action="toggle"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.waitFor(() => expect(deps.api.togglePipelineNode).toHaveBeenCalledWith('n1'));

      document.querySelectorAll('.pipeline-row')[1].querySelector('[data-pipeline-action="up"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.waitFor(() => expect(deps.api.reorderPipelineNode).toHaveBeenCalledWith('n2', 0));

      document.querySelectorAll('.pipeline-row')[0].querySelector('[data-pipeline-action="down"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.waitFor(() => expect(deps.api.reorderPipelineNode).toHaveBeenLastCalledWith('n2', 1));

      // Rows are back to [n1, n2] after the down move: delete the second.
      document.querySelectorAll('.pipeline-row')[1].querySelector('[data-pipeline-action="delete"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.waitFor(() => expect(deps.api.deletePipelineNode).toHaveBeenCalledWith('n2'));
    });

    it('edge moves are refused client-side', async () => {
      // n1 is index 0: up is out of range.
      const first = document.querySelector('.pipeline-row');
      first.querySelector('[data-pipeline-action="up"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(deps.api.reorderPipelineNode).not.toHaveBeenCalled();
    });

    it('parameter inputs merge into the node on change', async () => {
      const input = document.querySelector('#pipeline-list [data-node-parameter="value"]');
      input.value = '140';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(() => expect(deps.api.updatePipelineNode).toHaveBeenCalledWith('n1', { parameters: { value: 140 } }));
    });

    it('keyboard: Alt+arrows reorder, Enter on a row toggles', async () => {
      const row = document.querySelector('.pipeline-row');
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      await vi.waitFor(() => expect(deps.api.reorderPipelineNode).toHaveBeenCalledWith('n1', 1));
      deps.api.reorderPipelineNode.mockClear();
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(2));

      document.querySelector('.pipeline-row').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.waitFor(() => expect(deps.api.togglePipelineNode).toHaveBeenCalled());
    });

    it('arrow keys without Alt do not reorder (input focus must survive)', async () => {
      document.querySelector('.pipeline-row').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(deps.api.reorderPipelineNode).not.toHaveBeenCalled();
    });
  });

  describe('add / preview / apply', () => {
    it('add sends the selected operation with its default parameters', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      document.getElementById('pipeline-operation').value = 'blur';
      click('[data-action="pipeline-add"]');
      await vi.waitFor(() => expect(deps.api.addPipelineNode).toHaveBeenCalledWith({ operation: 'blur', parameters: { value: 2 } }));
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(3));
    });

    it('add refuses before an image is uploaded', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      deps.api.imageId = null;
      click('[data-action="pipeline-add"]');
      expect(deps.showToast).toHaveBeenCalledWith('Upload an image first');
      expect(deps.api.addPipelineNode).not.toHaveBeenCalled();
    });

    it('preview fetches a blob and arms the overlay with it', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      click('[data-action="pipeline-preview"]');
      await vi.waitFor(() => expect(deps.canvasManager.setPreviewOverlay).toHaveBeenCalled());
      expect(deps.showToast).not.toHaveBeenCalled();
      expect(document.getElementById('pipeline-preview-status').textContent)
        .toBe('Preview ready — apply to commit one History entry.');
    });

    it('a preview image the browser cannot decode reports and releases the URL', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      FakeImage.errorNext = true;
      click('[data-action="pipeline-preview"]');
      await vi.waitFor(() =>
        expect(document.getElementById('pipeline-preview-status').textContent)
          .toBe('Preview image could not be displayed. Try again.'));
      expect(document.getElementById('pipeline-preview-status').classList.contains('is-error')).toBe(true);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    it('apply loads the baked image, clears the overlay, and emits the operation event only after busy clears', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      const busyAtEmit = [];
      const off = bus.on(events.operation, () => busyAtEmit.push(mgr.busy));

      click('[data-action="pipeline-apply"]');
      await vi.waitFor(() => expect(deps.canvasManager.loadFromUrl).toHaveBeenCalled());
      await vi.waitFor(() => expect(busyAtEmit).toHaveLength(1));
      expect(busyAtEmit[0]).toBe(false);
      expect(deps.canvasManager.setPreviewOverlay).toHaveBeenCalledWith(null);
      expect(document.getElementById('pipeline-preview-status').textContent).toBe('Applied pipeline · cache generated');
      expect(deps.showToast).toHaveBeenCalledWith('Pipeline applied as one History entry');
      off();
    });

    it('apply reports a cache hit when the backend answers with one', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      deps.api.applyPipeline.mockResolvedValueOnce({ image_id: 'img-1', cache_hit: true });
      click('[data-action="pipeline-apply"]');
      await vi.waitFor(() => expect(document.getElementById('pipeline-preview-status').textContent).toBe('Applied pipeline · cache hit'));
    });
  });

  describe('run guard and failure paths', () => {
    it('a failed mutation keeps the last good pipeline, reports status and toast, and unlocks', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      const before = mgr.pipeline;
      deps.api.togglePipelineNode.mockRejectedValueOnce(new Error('node vanished'));
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(2));

      await mgr.toggle('n1');

      expect(mgr.pipeline).toBe(before);
      expect(document.getElementById('pipeline-preview-status').textContent).toBe('node vanished');
      expect(deps.showToast).toHaveBeenCalledWith('Pipeline error: node vanished');
      expect(mgr.busy).toBe(false);
    });

    it('a concurrent second click is ignored while a run is in flight', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      await vi.waitFor(() => expect(document.querySelectorAll('.pipeline-row')).toHaveLength(2));
      let release;
      deps.api.togglePipelineNode.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));

      const row = document.querySelector('.pipeline-row');
      row.querySelector('[data-pipeline-action="toggle"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.querySelector('.pipeline-row').querySelector('[data-pipeline-action="toggle"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(deps.api.togglePipelineNode).toHaveBeenCalledOnce();
      release(pipeline([]));
      await vi.waitFor(() => expect(mgr.busy).toBe(false));
    });

    it('the panel reports aria-busy during a run', async () => {
      await vi.waitFor(() => expect(deps.api.pipeline).toHaveBeenCalled());
      let release;
      deps.api.addPipelineNode.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
      const pending = mgr.add();
      expect(document.getElementById('pipeline-panel').getAttribute('aria-busy')).toBe('true');
      release(pipeline([]));
      await pending;
      expect(document.getElementById('pipeline-panel').getAttribute('aria-busy')).toBe('false');
    });
  });
});

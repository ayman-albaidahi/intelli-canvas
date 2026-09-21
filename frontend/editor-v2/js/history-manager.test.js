import { describe, expect, it, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { HistoryManager } from './history-manager.js';

const HISTORY_HTML = `
  <button data-action="history-undo">Undo</button>
  <button data-action="history-redo">Redo</button>
  <button data-action="history-clear">Clear</button>
  <button data-action="history-compare">Compare</button>
  <button data-action="history-diff">Diff</button>
  <ul id="history-list"></ul>
  <p id="history-hint"></p>
  <select id="history-before"></select>
  <select id="history-after"></select>
  <div id="history-comparison" hidden>
    <img id="history-before-image"><img id="history-after-image"><img id="history-diff-image">
  </div>
`;

function threeEntries() {
  return {
    total: 3,
    index: 1,
    entries: [
      { index: 0, operation: 'upload', time: 1700000000, parameters: {} },
      { index: 1, operation: 'brightness', time: 1700000010, parameters: { value: 120 }, current: true },
      { index: 2, operation: 'contrast', time: 1700000020, parameters: { value: 90 } },
    ],
  };
}

function makeClient(state = threeEntries()) {
  const calls = { undo: 0, redo: 0, goto: 0, clear: 0, history: 0 };
  // ApiClient unwraps the response envelope itself, so these return the history
  // state directly — mirroring the real contract the manager must handle.
  return {
    calls,
    imageId: 'img-1',
    contentUrl: (id) => `http://localhost:5000/api/images/${id}/content`,
    async history() { calls.history += 1; return state; },
    async undoHistory() { calls.undo += 1; return state; },
    async redoHistory() { calls.redo += 1; return state; },
    async gotoHistory(id, index) { calls.goto += 1; return state; },
    async clearHistory() { calls.clear += 1; return { ...state, total: 1, index: 0, entries: [state.entries[1]] }; },
    async compareHistory() { return { from: { url: 'http://from' }, to: { url: 'http://to' } }; },
    async diffHistory() { return new Blob(['x'], { type: 'image/png' }); },
  };
}

// The constructor kicks off an async refresh() that renders the panel, so the
// helper must let that settle before tests can assert on the DOM.
async function makeManager(client, canvasManager) {
  const dom = new JSDOM(HISTORY_HTML);
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL.createObjectURL = vi.fn(() => 'blob:fake');
  global.URL.revokeObjectURL = vi.fn();
  const showToast = vi.fn();
  const manager = new HistoryManager({ canvasManager, apiClient: client, showToast });
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  client.calls.history = 0;
  client.__manager = manager;
  return { manager, showToast, document: dom.window.document };
}

function canvasThatRecords(events) {
  return { loadFromUrl: vi.fn(async () => { events.push('canvas-load'); }) };
}

beforeEach(() => { vi.resetAllMocks(); });

describe('HistoryManager — refresh and render', () => {
  it('renders entries newest-first and marks the current one', async () => {
    const events = [];
    const { document } = await makeManager(makeClient(), canvasThatRecords(events));
    const rows = [...document.querySelectorAll('#history-list .history-row')];
    expect(rows).toHaveLength(3);
    expect(rows[0].dataset.index).toBe('2');
    expect(rows[2].dataset.index).toBe('0');
    // The current entry (index 1) keeps its marker wherever it lands after reversal.
    const currentRow = rows.find((row) => row.className.includes('is-current'));
    expect(currentRow.dataset.index).toBe('1');
  });

  it('hides the hint once there is more than one entry', async () => {
    const events = [];
    const { document } = await makeManager(makeClient(), canvasThatRecords(events));
    expect(document.querySelector('#history-hint').hidden).toBe(true);
  });

  it('escapes operation names and parameters (no raw HTML injection)', async () => {
    const state = {
      total: 1, index: 0,
      entries: [{ index: 0, operation: '<img src=x onerror=alert(1)>', time: 1700000000, parameters: { a: '<b>' } }],
    };
    const events = [];
    const { document } = await makeManager(makeClient(state), canvasThatRecords(events));
    const html = document.querySelector('#history-list').innerHTML;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('populates the compare selects around the current index', async () => {
    const events = [];
    const { document } = await makeManager(makeClient(), canvasThatRecords(events));
    expect(document.querySelector('#history-before').value).toBe('0');
    expect(document.querySelector('#history-after').value).toBe('1');
  });
});

describe('HistoryManager — step (undo/redo)', () => {
  it('undo calls undoHistory, reloads canvas, and toasts once', async () => {
    const events = [];
    const client = makeClient();
    const { showToast } = await makeManager(client, canvasThatRecords(events));
    await client.__manager.step('undo');
    expect(client.calls.undo).toBe(1);
    expect(events).toContain('canvas-load');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Stepped back in history');
  });

  it('redo calls redoHistory and steps forward', async () => {
    const events = [];
    const client = makeClient();
    const { showToast } = await makeManager(client, canvasThatRecords(events));
    await client.__manager.step('redo');
    expect(client.calls.redo).toBe(1);
    expect(showToast).toHaveBeenCalledWith('Stepped forward in history');
  });

  it('reloads the canvas exactly once per step', async () => {
    const events = [];
    const client = makeClient();
    const canvasManager = { loadFromUrl: vi.fn(async () => {}) };
    await makeManager(client, canvasManager);
    await client.__manager.step('undo');
    expect(canvasManager.loadFromUrl).toHaveBeenCalledTimes(1);
  });

  it('does nothing without an image session', async () => {
    const events = [];
    const client = makeClient();
    client.imageId = null;
    const { showToast } = await makeManager(client, canvasThatRecords(events));
    await client.__manager.step('undo');
    expect(client.calls.undo).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows the error message when the backend fails', async () => {
    const events = [];
    const client = makeClient();
    client.undoHistory = async () => { throw new Error('session expired'); };
    const { showToast } = await makeManager(client, canvasThatRecords(events));
    await client.__manager.step('undo');
    expect(showToast).toHaveBeenCalledWith('session expired');
  });
});

describe('HistoryManager — busy guard', () => {
  it('ignores a second concurrent step while one is in flight', async () => {
    const events = [];
    const client = makeClient();
    let resolveFirst;
    client.undoHistory = () => { client.calls.undo += 1; return new Promise((resolve) => { resolveFirst = resolve; }); };
    const { manager } = await makeManager(client, canvasThatRecords(events));
    const first = manager.step('undo');
    expect(manager.busy).toBe(true);
    // A second call while the first is still pending must be a no-op.
    manager.step('undo');
    resolveFirst(threeEntries());
    await first;
    expect(client.calls.undo).toBe(1);
  });

  it('ignores goto clicks while busy', async () => {
    const events = [];
    const client = makeClient();
    let resolveFirst;
    client.gotoHistory = () => { client.calls.goto += 1; return new Promise((resolve) => { resolveFirst = resolve; }); };
    const { manager } = await makeManager(client, canvasThatRecords(events));
    const first = manager.goto(2);
    manager.goto(0);
    resolveFirst(threeEntries());
    await first;
    expect(client.calls.goto).toBe(1);
  });
});

describe('HistoryManager — goto and clear', () => {
  it('jumps to the chosen index and labels it', async () => {
    const events = [];
    const client = makeClient();
    const { showToast } = await makeManager(client, canvasThatRecords(events));
    await client.__manager.goto(2);
    expect(client.calls.goto).toBe(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('contrast'));
  });

  it('clears history and keeps the current state', async () => {
    const events = [];
    const client = makeClient();
    const { showToast } = await makeManager(client, canvasThatRecords(events));
    await client.__manager.clear();
    expect(client.calls.clear).toBe(1);
    expect(showToast).toHaveBeenCalledWith('History cleared — current state kept');
  });

  it('revokes the diff object URL when comparison is cleared', async () => {
    const events = [];
    const client = makeClient();
    const { manager } = await makeManager(client, canvasThatRecords(events));
    manager.setDiffSrc('blob:existing');
    manager.clearComparison();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:existing');
    expect(manager._diffObjectUrl).toBe(null);
  });
});

describe('HistoryManager — event wiring', () => {
  it('refreshes when an ic-operation event fires', async () => {
    const events = [];
    const client = makeClient();
    const { document } = await makeManager(client, canvasThatRecords(events));
    document.dispatchEvent(new document.defaultView.CustomEvent('ic-operation'));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(client.calls.history).toBe(1);
  });

  it('paints rows after a refresh driven by a real client envelope', async () => {
    // The real ApiClient unwraps the response envelope itself and returns the
    // history state directly. A manager that reaches for .image again receives
    // undefined, render() throws before painting anything, and refresh()
    // swallows the exception — the panel silently stays empty forever.
    const events = [];
    const client = makeClient();
    client.history = async () => threeEntries();
    const { manager, document } = await makeManager(client, canvasThatRecords(events));

    await manager.refresh();

    expect(document.querySelectorAll('#history-list .history-row')).toHaveLength(3);
  });

  it('paints rows after undo when the client returns the bare state', async () => {
    const events = [];
    const client = makeClient();
    client.undoHistory = async () => threeEntries();
    const { manager, document } = await makeManager(client, canvasThatRecords(events));

    await manager.step('undo');

    expect(document.querySelectorAll('#history-list .history-row')).toHaveLength(3);
  });
});

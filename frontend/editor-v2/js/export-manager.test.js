import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ExportManager } from './export-manager.js';
import { bus } from './lib/events.js';

// The export dialog is all DOM: ten elements bound by id at construction,
// so the fixture mirrors index.html's #export-dialog subtree. The manager's
// job is the submit path (params, filename, busy lock, blob download) and
// the input wiring; both run fine in jsdom with URL.createObjectURL stubbed
// and anchor clicks intercepted.

function fixtureHtml() {
  document.body.innerHTML = `
    <span id="document-name">photo.png</span>
    <button data-action="export">Export</button>
    <div id="export-dialog" class="dialog-backdrop" hidden>
      <h2>Export</h2>
      <form id="export-form">
        <select id="export-format">
          <option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WEBP</option>
        </select>
        <label id="export-quality-field">Quality<input id="export-quality" type="range" value="85"><output id="export-quality-val">85</output></label>
        <input id="export-width" type="number"><input id="export-height" type="number">
        <input id="export-ratio" type="checkbox" checked>
        <input id="export-name" type="text">
        <button type="submit" id="export-submit">Export</button>
      </form>
      <button id="export-cancel">x</button><button id="export-cancel-secondary">x</button>
    </div>`;
}

const $ = (id) => document.getElementById(id);

function makeManager({ imageId = 'img-1', objects = [] } = {}) {
  const apiClient = {
    imageId,
    saveLayers: vi.fn(async (layers) => layers),
    export: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
  };
  const canvasManager = { getSourceDimensions: () => ({ width: 400, height: 300 }) };
  const objectManager = { objects, serializeLayers: () => objects, applyPersistedLayers: vi.fn() };
  const showToast = vi.fn();
  const mgr = new ExportManager({ canvasManager, apiClient, objectManager, showToast });
  return { mgr, apiClient, showToast, objectManager };
}

function submitEvent() {
  return { preventDefault: vi.fn() };
}

describe('export manager', () => {
  let realCreate, realRevoke, downloaded;

  beforeEach(() => {
    fixtureHtml();
    realCreate = URL.createObjectURL;
    realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    downloaded = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloaded.push(this.download);
    });
  });

  afterEach(() => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    vi.restoreAllMocks();
    bus.clear();
    document.body.innerHTML = '';
  });

  describe('open()', () => {
    it('refuses and toasts before an image is loaded', () => {
      const { mgr, showToast } = makeManager({ imageId: null });
      mgr.open();
      expect(showToast).toHaveBeenCalledWith('Upload an image before exporting');
      expect($('export-dialog').hidden).toBe(true);
    });

    it('seeds dimensions and the stripped document name, then opens the dialog', () => {
      const { mgr } = makeManager();
      mgr.open();
      expect($('export-width').value).toBe('400');
      expect($('export-height').value).toBe('300');
      expect($('export-name').value).toBe('photo'); // .png extension stripped
      expect($('export-dialog').hidden).toBe(false);
    });

    it('falls back to "intellicanvas" when the name is only an extension', () => {
      $('document-name').textContent = '.png';
      const { mgr } = makeManager();
      mgr.open();
      expect($('export-name').value).toBe('intellicanvas');
    });
  });

  describe('input wiring', () => {
    it('the quality field hides for png and shows for lossy formats', () => {
      const { mgr } = makeManager();
      mgr.open();
      $('export-format').value = 'png';
      $('export-format').dispatchEvent(new Event('change'));
      expect($('export-quality-field').hidden).toBe(true);
      $('export-format').value = 'jpeg';
      $('export-format').dispatchEvent(new Event('change'));
      expect($('export-quality-field').hidden).toBe(false);
    });

    it('dragging quality mirrors the readout', () => {
      const { mgr } = makeManager();
      mgr.open();
      $('export-quality').value = '60';
      $('export-quality').dispatchEvent(new Event('input'));
      expect($('export-quality-val').textContent).toBe('60');
    });

    it('with ratio locked, width drives height from the source aspect', () => {
      const { mgr } = makeManager();
      mgr.open();
      $('export-width').value = '200';
      $('export-width').dispatchEvent(new Event('input'));
      expect($('export-height').value).toBe('150');
    });

    it('height drives width, and neither clamps below 1', () => {
      const { mgr } = makeManager();
      mgr.open();
      $('export-height').value = '30';
      $('export-height').dispatchEvent(new Event('input'));
      expect($('export-width').value).toBe('40');
      $('export-width').value = '0';
      $('export-width').dispatchEvent(new Event('input'));
      // '0' is a truthy string, so the handler runs: Math.max(1, 0)
      // clamps the derived height to 1 rather than sending width 0.
      expect($('export-height').value).toBe('1');
      $('export-height').value = '1';
      $('export-height').dispatchEvent(new Event('input'));
      $('export-width').value = '1';
      $('export-width').dispatchEvent(new Event('input'));
      expect(Number($('export-height').value)).toBeGreaterThanOrEqual(1);
    });

    it('ratio unchecked leaves the other axis alone', () => {
      const { mgr } = makeManager();
      mgr.open();
      $('export-ratio').checked = false;
      $('export-width').value = '100';
      $('export-width').dispatchEvent(new Event('input'));
      expect($('export-height').value).toBe('300');
    });
  });

  describe('export()', () => {
    it('sends png without quality and downloads the sanitised filename', async () => {
      const { mgr, apiClient } = makeManager();
      mgr.open();
      $('export-format').value = 'png';
      $('export-name').value = 'my/photo:final';

      await mgr.export(submitEvent());

      expect(apiClient.export).toHaveBeenCalledWith('png', null, 400, 300, false);
      // ':' and '/' are illegal filename characters; the extension follows
      // the format. The deferred revoke must not have run yet.
      expect(downloaded).toEqual(['myphotofinal.png']);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('maps jpeg to a .jpg extension and passes quality', async () => {
      const { mgr, apiClient } = makeManager();
      mgr.open();
      $('export-format').value = 'jpeg';

      await mgr.export(submitEvent());

      expect(apiClient.export).toHaveBeenCalledWith('jpeg', 85, 400, 300, false);
      expect(downloaded).toEqual(['photo.jpg']);
    });

    it('persists layers first when the document has objects', async () => {
      const objects = [{ id: 'a', type: 'brush' }];
      const { mgr, apiClient, objectManager } = makeManager({ objects });
      mgr.open();
      $('export-format').value = 'png';

      await mgr.export(submitEvent());

      expect(apiClient.saveLayers).toHaveBeenCalledWith(objects);
      expect(objectManager.applyPersistedLayers).toHaveBeenCalledWith(objects);
      expect(apiClient.export).toHaveBeenCalledWith('png', null, 400, 300, true);
    });

    it('locks itself while a download is in flight', async () => {
      const { mgr, apiClient } = makeManager();
      mgr.open();
      $('export-format').value = 'png';
      let release;
      apiClient.export.mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(new Blob(['x']));
      }));

      const first = mgr.export(submitEvent());
      expect(mgr.submit.disabled).toBe(true);
      expect(mgr.submit.textContent).toBe('Exporting…');

      const secondEvent = submitEvent();
      await mgr.export(secondEvent); // busy no-op
      expect(apiClient.export).toHaveBeenCalledOnce();

      release();
      await first;
      expect(mgr.submit.disabled).toBe(false);
      expect(mgr.submit.textContent).toBe('Export');
    });

    it('a failed export toasts and unlocks', async () => {
      const { mgr, apiClient, showToast } = makeManager();
      mgr.open();
      apiClient.export.mockRejectedValueOnce(new Error('disk full'));

      await mgr.export(submitEvent());

      expect(showToast).toHaveBeenCalledWith('disk full');
      expect(mgr.submit.disabled).toBe(false);
      expect(mgr.busy).toBe(false);
    });

    it('refuses without a session image even if the dialog is open', async () => {
      const { mgr, showToast } = makeManager({ imageId: null });
      const event = submitEvent();
      await mgr.export(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(showToast).toHaveBeenCalledWith('Upload an image first');
    });

    it('revokes the blob URL after a grace period so the download can start', async () => {
      vi.useFakeTimers();
      try {
        const { mgr } = makeManager();
        mgr.open();
        $('export-format').value = 'png';
        const promise = mgr.export(submitEvent());
        await vi.waitFor(() => expect(mgr.busy).toBe(false));
        await promise;
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('close()', () => {
    it('hides the dialog', () => {
      const { mgr } = makeManager();
      mgr.open();
      mgr.close();
      expect($('export-dialog').hidden).toBe(true);
    });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createUploadManager } from './upload-manager.js';

// The upload flow is all side effects on DOM nodes and injected managers,
// so the test wires a fake DOM (status bar, drop-zone opener) and spies on
// every collaborator. The point of the module is the race guard and the
// success/failure state machine; those are exactly what is asserted here.

function fakeDom() {
  document.body.innerHTML = `
    <input id="file-input" type="file">
    <button data-action="open"></button>
    <div id="status-message"></div>
    <div id="empty-canvas" hidden></div>
    <h1 id="document-name"></h1>
    <span id="canvas-size"></span>
    <span id="save-state"></span>
    <div id="canvas-zone"></div>
  `;
}

function makeDeps() {
  fakeDom();
  const upload = vi.fn(async () => ({ image_id: 'img-1', original_filename: 'cat.png', width: 200, height: 100 }));
  const deps = {
    apiClient: { upload, contentUrl: (id) => `http://x/api/images/${id}/content` },
    canvasManager: {
      loadFromUrl: vi.fn(async () => {}),
      getSourceDimensions: vi.fn(() => ({ width: 200, height: 100 })),
    },
    restoreLayers: vi.fn(async () => {}),
    analysisManager: { reset: vi.fn() },
    smartCropManager: { resetPreviewOnly: vi.fn() },
    setState: vi.fn(),
    setEditorReady: vi.fn(),
    renderImageContextSummary: vi.fn(),
    showToast: vi.fn(),
    fileInput: document.querySelector('#file-input'),
    statusMessage: document.querySelector('#status-message'),
    emptyCanvas: document.querySelector('#empty-canvas'),
    documentName: document.querySelector('#document-name'),
    canvasSize: document.querySelector('#canvas-size'),
    saveState: document.querySelector('#save-state'),
  };
  return deps;
}

function file(name = 'cat.png', type = 'image/png') {
  return { name, type, size: 1000 };
}

describe('upload manager', () => {
  let deps;
  let manager;

  beforeEach(() => {
    deps = makeDeps();
    manager = createUploadManager(deps);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('runs the full success sequence and updates every surface', async () => {
    await manager.uploadImageFile(file());

    expect(deps.apiClient.upload).toHaveBeenCalledOnce();
    expect(deps.canvasManager.loadFromUrl).toHaveBeenCalledWith(
      'http://x/api/images/img-1/content',
      expect.objectContaining({ image_id: 'img-1' }),
    );
    expect(deps.restoreLayers).toHaveBeenCalledOnce();
    expect(deps.analysisManager.reset).toHaveBeenCalledOnce();
    expect(deps.setState).toHaveBeenLastCalledWith({ hasImage: true, selectedObjectId: null });
    expect(deps.setEditorReady).toHaveBeenCalledWith(true);
    expect(deps.emptyCanvas.hidden).toBe(true);
    expect(deps.documentName.textContent).toBe('cat.png');
    expect(deps.canvasSize.textContent).toBe('200 × 100');
    expect(deps.renderImageContextSummary).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Ready to edit' }),
    );
    expect(deps.saveState.textContent).toBe('Saved in API session');
    expect(deps.showToast).toHaveBeenLastCalledWith('cat.png uploaded successfully');
  });

  it('ignores a second upload while one is in flight', async () => {
    // Resolve manually so we can observe the guard mid-flight: the second
    // call must be a no-op, not a second POST.
    let resolveUpload;
    deps.apiClient.upload = vi.fn(() => new Promise((resolve) => { resolveUpload = resolve; }));

    const first = manager.uploadImageFile(file('a.png'));
    await manager.uploadImageFile(file('b.png'));

    expect(deps.apiClient.upload).toHaveBeenCalledTimes(1);
    expect(deps.apiClient.upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.png' }));

    resolveUpload({ image_id: 'img-1', original_filename: 'a.png', width: 10, height: 10 });
    await first;
  });

  it('disables both open triggers for the duration and re-enables them', async () => {
    const openButton = document.querySelector('[data-action="open"]');
    const input = deps.fileInput;

    const inFlight = manager.uploadImageFile(file());
    expect(openButton.disabled).toBe(true);
    expect(input.disabled).toBe(true);

    await inFlight;
    expect(openButton.disabled).toBe(false);
    expect(input.disabled).toBe(false);
  });

  it('re-enables the triggers even when the upload fails', async () => {
    deps.apiClient.upload = vi.fn(async () => {
      throw new Error('Could not reach the editing server.');
    });
    const openButton = document.querySelector('[data-action="open"]');

    await manager.uploadImageFile(file());

    expect(openButton.disabled).toBe(false);
    expect(deps.statusMessage.textContent).toBe('Backend offline');
    expect(deps.setState).toHaveBeenLastCalledWith({ hasImage: false, selectedObjectId: null });
    expect(deps.setEditorReady).toHaveBeenCalledWith(false);
    expect(deps.renderImageContextSummary).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Waiting for an image' }),
    );
    expect(deps.showToast).toHaveBeenLastCalledWith('Could not reach the editing server.');
  });

  it('reports a generic failure for non-offline errors', async () => {
    deps.apiClient.upload = vi.fn(async () => {
      throw new Error('BMP conversion failed');
    });

    await manager.uploadImageFile(file());

    expect(deps.statusMessage.textContent).toBe('Upload failed');
  });

  it('the file input change path uploads the picked file and clears it', async () => {
    const input = deps.fileInput;
    // jsdom only accepts a real FileList for input.files, and there is no
    // FileList constructor to reach for. The handler only reads
    // target.files?.[0], so shadowing the property is the honest stand-in.
    Object.defineProperty(input, 'files', { value: [file('picked.png')], configurable: true });

    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deps.apiClient.upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'picked.png' }));
  });

  describe('drop zone', () => {
    function dropWith(data) {
      const zone = document.querySelector('#canvas-zone');
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: data });
      zone.dispatchEvent(event);
      return event;
    }

    it('uploads an image file and clears the highlight', async () => {
      const zone = document.querySelector('#canvas-zone');
      manager.bindDropZone(zone);

      dropWith({ files: [file('dropped.png')] });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(deps.apiClient.upload).toHaveBeenCalledWith(expect.objectContaining({ name: 'dropped.png' }));
      expect(zone.classList.contains('is-drop-target')).toBe(false);
    });

    it('rejects a non-image with a toast instead of an upload', async () => {
      manager.bindDropZone(document.querySelector('#canvas-zone'));

      dropWith({ files: [{ name: 'virus.exe', type: 'application/x-msdownload' }] });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(deps.apiClient.upload).not.toHaveBeenCalled();
      expect(deps.showToast).toHaveBeenCalledWith(expect.stringContaining('image file'));
    });

    it('ignores a drop with no files', async () => {
      manager.bindDropZone(document.querySelector('#canvas-zone'));

      const event = dropWith({});

      expect(event.defaultPrevented).toBe(true);
      expect(deps.apiClient.upload).not.toHaveBeenCalled();
    });
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ApiClient } from './api-client.js';

const SAMPLE_BASE = 'http://localhost:5000/api';
const OFFLINE_MESSAGE = 'Could not reach the editing server. Start it with: python backend/run.py';

// The existing suite covers the core seams (friendlyMessage, upload,
// revision tracking, auth, process/timeout/offline). This file covers
// every remaining endpoint: URL, method, body shape, the envelope field
// each returns, and the gate/blob/failure paths that only exist in the
// per-endpoint code. It is deliberately table-shaped: endpoints are the
// same pattern repeated, and a missed URL or body key is the realistic
// regression here.

function clientWithImage() {
  const c = new ApiClient(SAMPLE_BASE);
  c.imageId = 'img-1';
  return c;
}

function jsonBody(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(queue) {
  let i = 0;
  const calls = [];
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = queue[Math.min(i, queue.length - 1)];
    i += 1;
    if (typeof next === 'function') return next();
    return next;
  });
  return calls;
}

function blobResponse(headers = {}) {
  // A plain byte body, not a Blob: the jsdom test env replaces the global Blob
  // with jsdom's, whose instances lack .stream(). Node 20's undici Response()
  // rejects such bodies (TypeError), while Node 24 silently stringifies them —
  // an ArrayBuffer keeps the mock honest on every runtime.
  return new Response(new TextEncoder().encode('bytes'), {
    status: 200,
    headers: { 'Content-Type': 'image/png', ...headers },
  });
}

async function expectMockBlob(value) {
  // blobResponse hands out the 5 bytes of 'bytes'; checking size and content
  // keeps the mock honest so a corrupting runtime fails here instead of
  // passing silently on an instanceof-only check.
  expect(value).toBeInstanceOf(Blob);
  expect(value.size).toBe(5);
  expect(await value.text()).toBe('bytes');
}

function lastCall(calls) {
  return calls[calls.length - 1];
}

function bodyOf(call) {
  return call.options.body ? JSON.parse(call.options.body) : null;
}

describe('ApiClient — endpoints', () => {
  let calls;

  beforeEach(() => { delete window.INTELLICANVAS_API_BASE; });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('history', () => {
    it('GETs the history and unwraps payload.image', async () => {
      calls = jsonResponse([jsonBody({ success: true, image: { entries: [] } })]);
      const c = clientWithImage();
      await expect(c.history()).resolves.toEqual({ entries: [] });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/history?image_id=img-1`);
      expect(lastCall(calls).options.method).toBeUndefined(); // GET
    });

    it('encodes a foreign imageId', async () => {
      calls = jsonResponse([jsonBody({ success: true, image: {} })]);
      const c = new ApiClient(SAMPLE_BASE);
      await c.history('a/b c');
      expect(lastCall(calls).url).toContain('image_id=a%2Fb%20c');
    });

    it('goto/undo/redo/clear POST their bodies and unwrap payload.image', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, image: { op: 'goto' } }),
        jsonBody({ success: true, image: { op: 'undo' } }),
        jsonBody({ success: true, image: { op: 'redo' } }),
        jsonBody({ success: true, image: { op: 'clear' } }),
      ]);
      const c = clientWithImage();
      expect(await c.gotoHistory('img-1', 2)).toEqual({ op: 'goto' });
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', index: 2 });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/history/goto`);

      expect(await c.undoHistory()).toEqual({ op: 'undo' });
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1' });
      expect(await c.redoHistory()).toEqual({ op: 'redo' });
      expect(await c.clearHistory()).toEqual({ op: 'clear' });
      expect(calls.map((x) => x.url)).toEqual([
        `${SAMPLE_BASE}/history/goto`,
        `${SAMPLE_BASE}/history/undo`,
        `${SAMPLE_BASE}/history/redo`,
        `${SAMPLE_BASE}/history/clear`,
      ]);
    });

    it('compare sends from/to and unwraps payload.comparison', async () => {
      calls = jsonResponse([jsonBody({ success: true, comparison: { a: 1 } })]);
      const c = clientWithImage();
      await expect(c.compareHistory(0, 3)).resolves.toEqual({ a: 1 });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/history/compare?image_id=img-1&from=0&to=3`);
    });

    it('historyContentUrl encodes the imageId and interpolates the index raw', () => {
      const c = clientWithImage();
      expect(c.historyContentUrl(2)).toBe(`${SAMPLE_BASE}/history/content/img-1/2`);
      // The index is a server-supplied history position, not user text: the
      // client encodes only the id half of the path.
      expect(c.historyContentUrl(7, 'x y')).toBe(`${SAMPLE_BASE}/history/content/x%20y/7`);
    });

    it('diff POSTs the mode/threshold and returns the blob', async () => {
      calls = jsonResponse([blobResponse()]);
      const c = clientWithImage();
      const blob = await c.diffHistory(0, 1, 'absolute', 5);
      await expectMockBlob(blob);
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/history/diff`);
      expect(bodyOf(lastCall(calls))).toEqual({
        image_id: 'img-1', from_index: 0, to_index: 1, mode: 'absolute', threshold: 5,
      });
    });

    it('a failed diff maps the server error code', async () => {
      calls = jsonResponse([new Response(JSON.stringify({ success: false, error: { code: 'IMAGE_NOT_AVAILABLE' } }), { status: 409 })]);
      const c = clientWithImage();
      await expect(c.diffHistory(0, 1)).rejects.toThrow('no longer available');
    });

    it('an unreachable diff reports offline', async () => {
      global.fetch = vi.fn(async () => { throw new TypeError('failed to fetch'); });
      const c = clientWithImage();
      await expect(c.diffHistory(0, 1)).rejects.toThrow(OFFLINE_MESSAGE);
    });
  });

  describe('pipeline endpoints', () => {
    it('GET/PUT/POST/PATCH/DELETE hit the right URLs and unwrap payload.pipeline', async () => {
      const pipe = { success: true, pipeline: { version: 4, nodes: [] } };
      calls = jsonResponse([
        jsonBody(pipe), jsonBody(pipe), jsonBody(pipe),
        jsonBody(pipe), jsonBody(pipe), jsonBody(pipe), jsonBody(pipe),
      ]);
      const c = clientWithImage();

      expect(await c.pipeline()).toEqual({ version: 4, nodes: [] });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/pipeline?image_id=img-1`);

      await c.savePipeline([{ id: 'n1' }], 2);
      expect(lastCall(calls).options.method).toBe('PUT');
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', version: 2, nodes: [{ id: 'n1' }] });

      await c.addPipelineNode({ operation: 'blur', parameters: { value: 2 } });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/pipeline/nodes`);
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', operation: 'blur', parameters: { value: 2 } });

      await c.updatePipelineNode('n/1', { enabled: false });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/pipeline/nodes/n%2F1`);
      expect(lastCall(calls).options.method).toBe('PATCH');
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', enabled: false });

      await c.deletePipelineNode('n1');
      expect(lastCall(calls).options.method).toBe('DELETE');
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1' });

      await c.togglePipelineNode('n1');
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/pipeline/nodes/n1/toggle`);

      await c.reorderPipelineNode('n1', 0);
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/pipeline/reorder`);
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', node_id: 'n1', order: 0 });
    });

    it('previewPipeline sends nodes only when given, and returns the blob', async () => {
      calls = jsonResponse([blobResponse(), blobResponse()]);
      const c = clientWithImage();
      await c.previewPipeline([{ operation: 'blur' }]);
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', nodes: [{ operation: 'blur' }] });
      const result = await c.previewPipeline();
      await expectMockBlob(result);
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1' });
    });

    it('applyPipeline unwraps payload.image and omits empty nodes', async () => {
      calls = jsonResponse([jsonBody({ success: true, image: { image_id: 'img-1' } })]);
      const c = clientWithImage();
      await expect(c.applyPipeline(null)).resolves.toEqual({ image_id: 'img-1' });
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1' });
    });
  });

  describe('layers endpoints', () => {
    it('GET, PUT compose with [] fallbacks', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, layers: [{ id: 'a' }] }),
        jsonBody({ success: true }),
        jsonBody({ success: true, image: { image_id: 'img-1' } }),
      ]);
      const c = clientWithImage();
      expect(await c.layers()).toEqual([{ id: 'a' }]);
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/layers?image_id=img-1`);
      await c.saveLayers([{ id: 'a' }]);
      expect(lastCall(calls).options.method).toBe('PUT');
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', layers: [{ id: 'a' }] });
      expect(await c.composeLayers()).toEqual({ image_id: 'img-1' });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/layers/compose`);
    });
  });

  describe('background endpoints', () => {
    it('mask preview returns the blob and says so on HTTP failure', async () => {
      calls = jsonResponse([blobResponse()]);
      const c = clientWithImage();
      await expectMockBlob(await c.maskPreview({ tolerance: 25 }));
      expect(bodyOf(lastCall(calls))).toMatchObject({ image_id: 'img-1', tolerance: 25 });

      global.fetch = vi.fn(async () => new Response('{}', { status: 500 }));
      await expect(c.maskPreview({})).rejects.toThrow('The mask could not be generated.');
    });

    it('remove/replace POST and unwrap payload.image', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, image: { removed: true } }),
        jsonBody({ success: true, image: { replaced: true } }),
      ]);
      const c = clientWithImage();
      expect(await c.removeBackground({ color: '#fff' })).toEqual({ removed: true });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/background/remove`);
      expect(await c.replaceBackground({ background_color: '#000' })).toEqual({ replaced: true });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/background/replace`);
    });

    it('replace preview maps the friendly error and returns the blob', async () => {
      calls = jsonResponse([blobResponse()]);
      const c = clientWithImage();
      await expectMockBlob(await c.replaceBackgroundPreview({ background_name: 'studio' }));
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'IMAGE_SESSION_NOT_FOUND' } }), { status: 404 }));
      await expect(c.replaceBackgroundPreview({})).rejects.toThrow('session expired');
    });

    it('listBackgrounds unwraps payload.backgrounds and honours success:false', async () => {
      calls = jsonResponse([jsonBody({ success: true, backgrounds: [{ name: 'a' }] })]);
      const c = clientWithImage();
      expect(await c.listBackgrounds()).toEqual([{ name: 'a' }]);
      global.fetch = vi.fn(async () => jsonBody({ success: false, error: { message: 'no route' } }));
      await expect(c.listBackgrounds()).rejects.toThrow('no route');
    });

    it('backgroundCatalog falls back to [] and uploadBackground posts FormData', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, backgrounds: [{ name: 'x' }] }),
        jsonBody({ success: true, backgrounds: [] }),
        jsonBody({ success: true, background: { name: 'new' } }),
      ]);
      const c = clientWithImage();
      expect(await c.backgroundCatalog()).toEqual([{ name: 'x' }]);
      expect(await c.backgroundCatalog()).toEqual([]);
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/background/backgrounds/catalog`);

      await c.uploadBackground({ name: 'p.png' }, 'product');
      const sent = lastCall(calls).options.body;
      expect(sent).toBeInstanceOf(FormData);
      expect(sent.get('category')).toBe('product');
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/background/backgrounds`);
    });
  });

  describe('analysis endpoints', () => {
    it('analyze/suggestions return the whole payload; explain unwraps explanation', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, metrics: {} }),
        jsonBody({ success: true, suggestions: [{ type: 'SHARPEN' }] }),
        jsonBody({ success: true, explanation: 'because' }),
      ]);
      const c = clientWithImage();
      expect(await c.analyze()).toMatchObject({ metrics: {} });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/analysis`);
      expect(await c.suggestions()).toMatchObject({ suggestions: [{ type: 'SHARPEN' }] });
      await c.explainOperation('sobel', { ksize: 3 }, 'LOW_SHARPNESS', 'rule');
      expect(bodyOf(lastCall(calls))).toEqual({ operation: 'sobel', parameters: { ksize: 3 }, finding: 'LOW_SHARPNESS', source: 'rule' });
    });

    it('previewSuggestion returns the blob; its HTTP failure has its own message', async () => {
      calls = jsonResponse([blobResponse()]);
      const c = clientWithImage();
      await expectMockBlob(await c.previewSuggestion('img-1', 'SHARPEN'));
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', type: 'SHARPEN' });
      global.fetch = vi.fn(async () => new Response('{}', { status: 500 }));
      await expect(c.previewSuggestion('img-1', 'SHARPEN')).rejects.toThrow('suggestion preview could not be generated');
    });

    it('applySuggestion unwraps the payload; dismiss resolves true', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, applied: true }),
        jsonBody({ success: true }),
      ]);
      const c = clientWithImage();
      expect(await c.applySuggestion('img-1', 'SHARPEN')).toMatchObject({ applied: true });
      expect(await c.dismissSuggestion('SHARPEN')).toBe(true);
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', type: 'SHARPEN' });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/suggestions/dismiss`);
    });
  });

  describe('image endpoints', () => {
    it('contentUrl busts the cache with a fresh timestamp per call', () => {
      const c = clientWithImage();
      const first = c.contentUrl();
      const second = c.contentUrl('other');
      expect(first).toMatch(/^http:\/\/localhost:5000\/api\/images\/img-1\/content\?t=\d+$/);
      expect(second).toContain('/images/other/content?t=');
    });

    it('transform posts the path and unwraps image', async () => {
      calls = jsonResponse([jsonBody({ success: true, image: { resized: true } })]);
      const c = clientWithImage();
      expect(await c.transform('resize', { width: 10 })).toEqual({ resized: true });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/transform/resize`);
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', width: 10 });
    });

    it('smart-crop preview returns blob + metadata header', async () => {
      calls = jsonResponse([blobResponse({ 'X-Smart-Crop': '0.1,0.2,0.8,0.7' })]);
      const c = clientWithImage();
      const { blob, metadata } = await c.smartCropPreview('1:1');
      await expectMockBlob(blob);
      expect(metadata).toBe('0.1,0.2,0.8,0.7');
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', aspect_ratio: '1:1' });
    });

    it('a failed smart-crop preview maps the friendly error', async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'RATE_LIMITED' } }), { status: 429 }));
      const c = clientWithImage();
      await expect(c.smartCropPreview()).rejects.toThrow('Too many requests');
    });

    it('smart-crop apply unwraps image; histogram unwraps histogram', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, image: { cropped: true } }),
        jsonBody({ success: true, histogram: { red: [] } }),
      ]);
      const c = clientWithImage();
      expect(await c.smartCropApply('original')).toEqual({ cropped: true });
      expect(bodyOf(lastCall(calls))).toEqual({ image_id: 'img-1', aspect_ratio: 'original' });
      expect(await c.histogram()).toEqual({ red: [] });
      expect(lastCall(calls).url).toBe(`${SAMPLE_BASE}/process/histogram`);
    });

    it('export posts format/quality/dimensions/composite and returns the blob', async () => {
      calls = jsonResponse([blobResponse()]);
      const c = clientWithImage();
      await expectMockBlob(await c.export('jpeg', 85, 800, 600, true));
      expect(bodyOf(lastCall(calls))).toEqual({
        image_id: 'img-1', format: 'jpeg', quality: 85, width: 800, height: 600, composite_layers: true,
      });
      global.fetch = vi.fn(async () => new Response('{}', { status: 500 }));
      await expect(c.export('png')).rejects.toThrow('The image could not be exported.');
    });
  });

  describe('upload gates', () => {
    it('every mutating endpoint that needs a session refuses before upload', async () => {
      const c = new ApiClient(SAMPLE_BASE);
      const gated = [
        ['transform', () => c.transform('resize', {}), 'before transforming'],
        ['smartCropPreview', () => c.smartCropPreview(), 'Smart Crop'],
        ['smartCropApply', () => c.smartCropApply(), 'Smart Crop'],
        ['process', () => c.process('grayscale', {}), 'before processing'],
        ['histogram', () => c.histogram(), 'before processing'],
        ['export', () => c.export('png'), 'before exporting'],
        ['maskPreview', () => c.maskPreview({}), 'Upload an image first'],
        ['removeBackground', () => c.removeBackground({}), 'Upload an image first'],
        ['replaceBackground', () => c.replaceBackground({}), 'Upload an image first'],
        ['replaceBackgroundPreview', () => c.replaceBackgroundPreview({}), 'Upload an image first'],
        ['applySuggestion', () => c.applySuggestion('img', 'T'), 'Upload an image first'],
      ];
      for (const [name, fn, fragment] of gated) {
        await expect(fn(), name).rejects.toThrow(fragment);
      }
    });
  });

  describe('session reset', () => {
    it('resetSession clears image and revision together', async () => {
      calls = jsonResponse([
        jsonBody({ success: true, image: { image_id: 'abc', revision: 3 } }),
        jsonBody({ success: true, image: { image_id: 'abc', revision: 3 } }),
      ]);
      const c = new ApiClient(SAMPLE_BASE);
      await c.upload(new File(['x'], 'a.png'));
      expect(c.imageId).toBe('abc');
      // upload resets the revision to 0 (the server's new image starts at
      // history index 0); it only advances through syncRevision on
      // mutating responses.
      expect(c.revision).toBe(0);
      await c.process('grayscale', {});
      expect(c.revision).toBe(3);
      c.resetSession();
      expect(c.imageId).toBe(null);
      expect(c.revision).toBe(null);
    });
  });
});

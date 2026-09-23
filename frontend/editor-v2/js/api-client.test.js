import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './api-client.js';

const SAMPLE_BASE = 'http://localhost:5000/api';

function client() {
  return new ApiClient(SAMPLE_BASE);
}

function jsonOnce(body, init = {}) {
  vi.fn();
  global.fetch = vi.fn(async () => new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('friendlyMessage — error code to friendly text mapping', () => {
  beforeEach(() => { delete window.INTELLICANVAS_API_BASE; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('translates IMAGE_SESSION_NOT_FOUND to a re-upload hint', async () => {
    jsonOnce({ success: false, error: { code: 'IMAGE_SESSION_NOT_FOUND', message: 'raw' } }, { status: 404 });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow('Your editing session expired — upload the image again.');
  });

  it('translates IMAGE_NOT_AVAILABLE', async () => {
    jsonOnce({ success: false, error: { code: 'IMAGE_NOT_AVAILABLE', message: 'raw' } }, { status: 409 });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow('The processed image is no longer available — try the operation again.');
  });

  it('translates PIPELINE_EXECUTION_FAILED', async () => {
    jsonOnce({ success: false, error: { code: 'PIPELINE_EXECUTION_FAILED', message: 'raw' } }, { status: 500 });
    const c = client();
    await expect(c.savePipeline([])).rejects.toThrow('The pipeline could not be executed. Check its parameters and try again.');
  });

  it('translates INVALID_PIPELINE', async () => {
    jsonOnce({ success: false, error: { code: 'INVALID_PIPELINE', message: 'raw' } }, { status: 422 });
    const c = client();
    await expect(c.savePipeline([])).rejects.toThrow('The pipeline contains an unsupported operation or invalid parameter.');
  });

  it('translates STALE_IMAGE_REVISION to a reload hint', async () => {
    jsonOnce({ success: false, error: { code: 'STALE_IMAGE_REVISION', message: 'raw' } }, { status: 409 });
    const c = client();
    c.imageId = 'img-1';
    await expect(c.process('brightness', { value: 130 })).rejects.toThrow('The image changed while you were editing');
  });

  it('falls back to the server message for unknown codes', async () => {
    jsonOnce({ success: false, error: { code: 'SOMETHING_ELSE', message: 'Brightness out of range' } }, { status: 422 });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow('Brightness out of range');
  });

  it('falls back to a generic status message when the payload has no error', async () => {
    jsonOnce({ success: false }, { status: 500 });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow(/Request failed \(500\)/);
  });

  it('reports the offline message when the server is unreachable', async () => {
    global.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow('Could not reach the editing server');
  });

  it('reports a timeout when the request is aborted', async () => {
    global.fetch = vi.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow('took too long to respond');
  });

  it('treats an HTTP error with success:true as a failure too', async () => {
    jsonOnce({ success: true }, { status: 404 });
    const c = client();
    await expect(c.history('img-1')).rejects.toThrow();
  });
});

describe('guard methods', () => {
  beforeEach(() => { delete window.INTELLICANVAS_API_BASE; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('process() refuses before upload', async () => {
    const c = client();
    await expect(c.process('adjustments', { brightness: 120 })).rejects.toThrow('Upload an image before processing it.');
  });

  it('upload() sets imageId and returns the image object', async () => {
    jsonOnce({ success: true, image: { image_id: 'abc-123' } });
    const c = client();
    const image = await c.upload(new File(['x'], 'a.png'));
    expect(image.image_id).toBe('abc-123');
    expect(c.imageId).toBe('abc-123');
  });

  it('capabilities() works before upload (static capability of the backend)', async () => {
    jsonOnce({ success: true, version: 'v0.9.1', operations: { brightness: { label: 'Brightness' } } });
    const caps = await ApiClient.capabilities(SAMPLE_BASE);
    expect(caps.operations.brightness.label).toBe('Brightness');
  });
});

describe('ApiClient — revision tracking', () => {
  beforeEach(() => { delete window.INTELLICANVAS_API_BASE; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('starts with no revision', () => {
    expect(client().revision).toBe(null);
  });

  it('resets to zero on upload', async () => {
    jsonOnce({ success: true, image: { image_id: 'abc-123' } });
    const c = client();
    c.revision = 5;
    await c.upload(new File(['x'], 'a.png'));
    expect(c.revision).toBe(0);
  });

  it('quotes the last revision in process() requests', async () => {
    jsonOnce({ success: true, image: { image_id: 'abc-123', revision: 2 } });
    const c = client();
    c.imageId = 'abc-123';
    c.revision = 1;
    await c.process('brightness', { value: 130 });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.source_revision).toBe(1);
  });

  it('records the new revision from the response', async () => {
    jsonOnce({ success: true, image: { image_id: 'abc-123', revision: 3 } });
    const c = client();
    c.imageId = 'abc-123';
    await c.process('brightness', { value: 130 });
    expect(c.revision).toBe(3);
  });

  it('keeps the old revision when the payload has none', async () => {
    jsonOnce({ success: true, image: { image_id: 'abc-123' } });
    const c = client();
    c.imageId = 'abc-123';
    c.revision = 4;
    await c.process('brightness', { value: 130 });
    expect(c.revision).toBe(4);
  });

  it('ignores a response carrying an older revision', async () => {
    // The network-reordering case: the response to the first mutating call
    // lands after the second one already advanced the client. Adopting the
    // stale number would make the very next request quote a stale revision.
    jsonOnce({ success: true, image: { image_id: 'abc-123', revision: 1 } });
    const c = client();
    c.imageId = 'abc-123';
    c.revision = 3;
    await c.process('brightness', { value: 130 });
    expect(c.revision).toBe(3);
  });

  it('accepts the first revision when none is tracked yet', () => {
    const c = client();
    c.syncRevision({ image_id: 'abc-123', revision: 2 });
    expect(c.revision).toBe(2);
  });
});

describe('ApiClient — authentication and request security', () => {
  beforeEach(() => {
    document.cookie = 'ic_csrf=test-csrf-token; path=/';
    delete window.INTELLICANVAS_API_BASE;
  });

  afterEach(() => {
    document.cookie = 'ic_csrf=; Max-Age=0; path=/';
    vi.restoreAllMocks();
  });

  it('sends credentials and the CSRF header on logout', async () => {
    jsonOnce({ success: true });
    await client().logout();
    const [, options] = global.fetch.mock.calls[0];
    expect(options.credentials).toBe('include');
    expect(options.headers.get('X-CSRF-Token')).toBe('test-csrf-token');
  });

  it('provides the current authenticated user from /auth/me', async () => {
    jsonOnce({ success: true, authenticated: true, user: { email: 'user@example.com' } });
    const result = await client().me();
    expect(result.authenticated).toBe(true);
    expect(result.user.email).toBe('user@example.com');
  });

  it('registers a user with the display name and CSRF protection', async () => {
    jsonOnce({ success: true, user: { email: 'new@example.com' } }, { status: 201 });
    await client().register('new@example.com', 'password123', 'New User');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(`${SAMPLE_BASE}/auth/register`);
    expect(options.credentials).toBe('include');
    expect(options.headers.get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(JSON.parse(options.body)).toEqual({ email: 'new@example.com', password: 'password123', display_name: 'New User' });
  });

  it('dispatches an auth-required event for expired sessions', async () => {
    jsonOnce({ success: false, error: { code: 'AUTH_REQUIRED', message: 'required' } }, { status: 401 });
    const listener = vi.fn();
    window.addEventListener('ic-auth-required', listener);
    await expect(client().me()).rejects.toThrow('Your session has expired');
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('ic-auth-required', listener);
  });
});

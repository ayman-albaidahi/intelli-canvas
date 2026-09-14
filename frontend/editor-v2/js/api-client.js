const detectedApiHost = window.location.hostname || 'localhost';
const detectedApiBase = window.location.port === '5000' ? `${window.location.origin}/api` : `http://${detectedApiHost}:5000/api`;
const API_BASE = window.INTELLICANVAS_API_BASE || detectedApiBase;

const OFFLINE_MESSAGE = 'Could not reach the editing server. Start it with: python backend/run.py';

function friendlyMessage(payload, status) {
  const code = payload.error?.code;
  if (code === 'IMAGE_SESSION_NOT_FOUND') return 'Your editing session expired — upload the image again.';
  if (code === 'IMAGE_NOT_AVAILABLE') return 'The processed image is no longer available — try the operation again.';
  return payload.error?.message || `Request failed (${status}). Make sure the app is running.`;
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(friendlyMessage(payload, response.status));
  }
  return payload;
}

export class ApiClient {
  constructor(baseUrl = API_BASE) { this.baseUrl = baseUrl.replace(/\/$/, ''); this.imageId = null; }

  async upload(file) {
    const body = new FormData(); body.append('file', file);
    const payload = await request(`${this.baseUrl}/images`, { method: 'POST', body });
    this.imageId = payload.image.image_id;
    return payload.image;
  }

  contentUrl(imageId = this.imageId) {
    // The content endpoint URL is stable across operations while the bytes
    // change after every Python bake — bust the cache on every load.
    return `${this.baseUrl}/images/${encodeURIComponent(imageId)}/content?t=${Date.now()}`;
  }

  async transform(path, data = {}) {
    if (!this.imageId) throw new Error('Upload an image before transforming it.');
    const payload = await request(`${this.baseUrl}/transform/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...data }) });
    return payload.image;
  }

  async process(operation, data = {}) {
    if (!this.imageId) throw new Error('Upload an image before processing it.');
    const payload = await request(`${this.baseUrl}/process/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...data }) });
    return payload.image;
  }

  async export(format, quality = null, width = null, height = null) {
    if (!this.imageId) throw new Error('Upload an image before exporting it.');
    let response;
    try {
      response = await fetch(`${this.baseUrl}/images/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, format, quality, width, height }) });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    if (!response.ok) throw new Error('The image could not be exported.');
    return response.blob();
  }

  async history(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/history?image_id=${encodeURIComponent(imageId)}`);
    return payload.image;
  }

  async gotoHistory(imageId, index) {
    const payload = await request(`${this.baseUrl}/history/goto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, index }) });
    return payload.image;
  }

  async undoHistory(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/history/undo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload.image;
  }

  async redoHistory(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/history/redo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload.image;
  }

  async clearHistory(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/history/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload.image;
  }

  async layers(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/layers?image_id=${encodeURIComponent(imageId)}`);
    return payload.layers || [];
  }

  async saveLayers(layers, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/layers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: imageId, layers }),
    });
    return payload.layers || [];
  }

  async maskPreview(params) {
    if (!this.imageId) throw new Error('Upload an image first.');
    let response;
    try {
      response = await fetch(`${this.baseUrl}/background/mask-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...params }) });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    if (!response.ok) throw new Error('The mask could not be generated.');
    return response.blob();
  }

  async removeBackground(params) {
    if (!this.imageId) throw new Error('Upload an image first.');
    const payload = await request(`${this.baseUrl}/background/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...params }) });
    return payload.image;
  }

  async replaceBackground(params) {
    if (!this.imageId) throw new Error('Upload an image first.');
    const payload = await request(`${this.baseUrl}/background/replace`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...params }) });
    return payload.image;
  }

  async listBackgrounds() {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/background/backgrounds`);
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(friendlyMessage(payload, response.status));
    return payload.backgrounds;
  }

  async uploadBackground(file) {
    const body = new FormData(); body.append('file', file);
    const payload = await request(`${this.baseUrl}/background/backgrounds`, { method: 'POST', body });
    return payload.background;
  }

  async analyze(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return { metrics: payload.metrics, findings: payload.findings };
  }

  async suggestions(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return { metrics: payload.metrics, findings: payload.findings, suggestions: payload.suggestions };
  }

  async previewSuggestion(imageId = this.imageId, type) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/suggestions/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, type }) });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    if (!response.ok) throw new Error('The suggestion preview could not be generated.');
    return response.blob();
  }

  async applySuggestion(imageId = this.imageId, type) {
    if (!this.imageId) throw new Error('Upload an image first.');
    const payload = await request(`${this.baseUrl}/suggestions/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, type }) });
    return payload.node;
  }

  async dismissSuggestion(type, imageId = this.imageId) {
    await request(`${this.baseUrl}/suggestions/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, type }) });
    return true;
  }
}

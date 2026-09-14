const detectedApiHost = window.location.hostname || 'localhost';
const detectedApiBase = window.location.port === '5000' ? `${window.location.origin}/api` : `http://${detectedApiHost}:5000/api`;
const API_BASE = window.INTELLICANVAS_API_BASE || detectedApiBase;

const OFFLINE_MESSAGE = 'Could not reach the editing server. Start it with: python backend/run.py';

function friendlyMessage(payload, status) {
  const code = payload.error?.code;
  if (code === 'IMAGE_SESSION_NOT_FOUND') return 'Your editing session expired — upload the image again.';
  if (code === 'IMAGE_NOT_AVAILABLE') return 'The processed image is no longer available — try the operation again.';
  if (code === 'PIPELINE_EXECUTION_FAILED') return 'The pipeline could not be executed. Check its parameters and try again.';
  if (code === 'INVALID_PIPELINE') return 'The pipeline contains an unsupported operation or invalid parameter.';
  return payload.error?.message || `Request failed (${status}). Make sure the app is running.`;
}

async function request(url, options = {}) {
  let response;
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    response = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The editing server took too long to respond. Try again.');
    throw new Error(OFFLINE_MESSAGE);
  } finally {
    if (timeout) clearTimeout(timeout);
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

  async smartCropPreview(aspectRatio = 'original') {
    if (!this.imageId) throw new Error('Upload an image before using Smart Crop.');
    let response;
    try {
      response = await fetch(`${this.baseUrl}/transform/smart-crop/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_id: this.imageId, aspect_ratio: aspectRatio }),
      });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(friendlyMessage(payload, response.status));
    }
    return { blob: await response.blob(), metadata: response.headers.get('X-Smart-Crop') || '' };
  }

  async smartCropApply(aspectRatio = 'original') {
    if (!this.imageId) throw new Error('Upload an image before using Smart Crop.');
    const payload = await request(`${this.baseUrl}/transform/smart-crop/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: this.imageId, aspect_ratio: aspectRatio }),
    });
    return payload.image;
  }

  async process(operation, data = {}) {
    if (!this.imageId) throw new Error('Upload an image before processing it.');
    const payload = await request(`${this.baseUrl}/process/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...data }) });
    return payload.image;
  }

  async histogram() {
    if (!this.imageId) throw new Error('Upload an image before processing it.');
    const payload = await request(`${this.baseUrl}/process/histogram`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId }) });
    return payload.histogram;
  }

  async export(format, quality = null, width = null, height = null, compositeLayers = false) {
    if (!this.imageId) throw new Error('Upload an image before exporting it.');
    let response;
    try {
      response = await fetch(`${this.baseUrl}/images/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, format, quality, width, height, composite_layers: compositeLayers }) });
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
  async compareHistory(fromIndex, toIndex, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/history/compare?image_id=${encodeURIComponent(imageId)}&from=${fromIndex}&to=${toIndex}`);
    return payload.comparison;
  }
  historyContentUrl(index, imageId = this.imageId) {
    return `${this.baseUrl}/history/content/${encodeURIComponent(imageId)}/${index}`;
  }
  async diffHistory(fromIndex, toIndex, mode = 'absolute', threshold = 0, imageId = this.imageId) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/history/diff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, from_index: fromIndex, to_index: toIndex, mode, threshold }) });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(friendlyMessage(payload, response.status));
    }
    return response.blob();
  }
  async pipeline(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline?image_id=${encodeURIComponent(imageId)}`);
    return payload.pipeline;
  }
  async savePipeline(nodes, version = 1, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, version, nodes }) });
    return payload.pipeline;
  }
  async addPipelineNode(node, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline/nodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, ...node }) });
    return payload.pipeline;
  }
  async updatePipelineNode(nodeId, changes, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline/nodes/${encodeURIComponent(nodeId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, ...changes }) });
    return payload.pipeline;
  }
  async deletePipelineNode(nodeId, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline/nodes/${encodeURIComponent(nodeId)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload.pipeline;
  }
  async togglePipelineNode(nodeId, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline/nodes/${encodeURIComponent(nodeId)}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload.pipeline;
  }
  async reorderPipelineNode(nodeId, order, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, node_id: nodeId, order }) });
    return payload.pipeline;
  }
  async previewPipeline(nodes = null, imageId = this.imageId) {
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      response = await fetch(`${this.baseUrl}/pipeline/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, ...(nodes ? { nodes } : {}) }), signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Pipeline preview timed out. Try a smaller image or fewer operations.');
      throw new Error(OFFLINE_MESSAGE);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(friendlyMessage(payload, response.status));
    }
    return response.blob();
  }
  async applyPipeline(nodes = null, imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/pipeline/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, ...(nodes ? { nodes } : {}) }) });
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

  async composeLayers(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/layers/compose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: imageId }),
    });
    return payload.image;
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

  async replaceBackgroundPreview(params) {
    if (!this.imageId) throw new Error('Upload an image first.');
    let response;
    try {
      response = await fetch(`${this.baseUrl}/background/replace-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...params }) });
    } catch {
      throw new Error(OFFLINE_MESSAGE);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(friendlyMessage(payload, response.status));
    }
    return response.blob();
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

  async backgroundCatalog() {
    const payload = await request(`${this.baseUrl}/background/backgrounds/catalog`);
    return payload.backgrounds || [];
  }

  async uploadBackground(file, category = 'general') {
    const body = new FormData(); body.append('file', file); body.append('category', category);
    const payload = await request(`${this.baseUrl}/background/backgrounds`, { method: 'POST', body });
    return payload.background;
  }

  async analyze(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload;
  }

  async suggestions(imageId = this.imageId) {
    const payload = await request(`${this.baseUrl}/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId }) });
    return payload;
  }

  async explainOperation(operation, parameters = {}, finding = null, source = null) {
    const payload = await request(`${this.baseUrl}/explain-operation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, parameters, finding, source }) });
    return payload.explanation;
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
    return payload;
  }

  async dismissSuggestion(type, imageId = this.imageId) {
    await request(`${this.baseUrl}/suggestions/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: imageId, type }) });
    return true;
  }
}

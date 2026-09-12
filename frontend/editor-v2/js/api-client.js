const API_BASE = window.INTELLICANVAS_API_BASE || 'http://localhost:5000/api';

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message || `Request failed (${response.status})`);
  }
  return payload;
}

export class ApiClient {
  constructor(baseUrl = API_BASE) { this.baseUrl = baseUrl.replace(/\/$/, ''); this.imageId = null; }

  async upload(file) {
    const body = new FormData(); body.append('file', file);
    const payload = await parseResponse(await fetch(`${this.baseUrl}/images`, { method: 'POST', body }));
    this.imageId = payload.image.image_id;
    return payload.image;
  }

  contentUrl(imageId = this.imageId) { return `${this.baseUrl}/images/${encodeURIComponent(imageId)}/content`; }

  async transform(path, data = {}) {
    if (!this.imageId) throw new Error('Upload an image before transforming it.');
    const payload = await parseResponse(await fetch(`${this.baseUrl}/transform/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, ...data }) }));
    return payload.image;
  }

  async export(format = 'png') {
    if (!this.imageId) throw new Error('Upload an image before exporting it.');
    const response = await fetch(`${this.baseUrl}/images/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_id: this.imageId, format }) });
    if (!response.ok) throw new Error('The image could not be exported.');
    return response.blob();
  }
}

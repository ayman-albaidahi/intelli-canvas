import { bus, events } from './lib/events.js';
import { qs, qsa } from './lib/dom.js';
export class SmartCropManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.previewImage = qs('#smart-crop-preview');
    this.status = qs('#smart-crop-status');
    this.previewUrl = null;
    this.busy = false;
    this.bind();
  }

  bind() {
    qs('[data-action="smart-crop-preview"]')?.addEventListener('click', () => this.preview());
    qs('[data-action="smart-crop-apply"]')?.addEventListener('click', () => this.apply());
    qs('[data-action="smart-crop-cancel"]')?.addEventListener('click', () => this.reset());
    bus.on(events.appStateChange, () => this.syncControls());
    this.syncControls();
  }

  ratio() {
    return qs('#smart-crop-ratio')?.value || 'original';
  }

  syncControls() {
    const disabled = this.busy || !this.apiClient.imageId;
    qsa('[data-smart-crop-action]').forEach((control) => { control.disabled = disabled; });
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }

  async preview() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image before using Smart Crop');
    if (this.busy) return;
    this.busy = true;
    this.syncControls();
    this.setStatus('Finding salient content…');
    try {
      const result = await this.apiClient.smartCropPreview(this.ratio());
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = URL.createObjectURL(result.blob);
      if (this.previewImage) {
        this.previewImage.src = this.previewUrl;
        this.previewImage.hidden = false;
      }
      this.setStatus('Preview ready — apply to commit in Python');
      this.showToast('Smart Crop preview ready');
    } catch (error) {
      this.setStatus('Smart Crop preview failed');
      this.showToast(error.message);
    } finally {
      this.busy = false;
      this.syncControls();
    }
  }

  async apply() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image before using Smart Crop');
    if (this.busy) return;
    this.busy = true;
    this.syncControls();
    this.setStatus('Applying Smart Crop in Python…');
    try {
      const image = await this.apiClient.smartCropApply(this.ratio());
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(image.image_id), image);
      qs('#canvas-size').textContent = `${image.width} × ${image.height}`;
      this.setStatus('Smart Crop applied and added to History');
      this.showToast('Smart Crop applied');
      this.resetPreviewOnly();
    } catch (error) {
      this.setStatus('Smart Crop failed');
      this.showToast(error.message);
    } finally {
      this.busy = false;
      this.syncControls();
    }
    // After the busy flag clears: HistoryManager.refresh() bails out while any
    // manager is mid-operation, so an earlier dispatch is silently dropped and
    // the history list never reflects the crop.
    bus.emit(events.operation);
  }

  resetPreviewOnly() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    if (this.previewImage) {
      this.previewImage.removeAttribute('src');
      this.previewImage.hidden = true;
    }
  }

  reset() {
    this.resetPreviewOnly();
    this.setStatus('Ready');
  }
}

import { withBusy } from './ui-manager.js';
export class CropTool {
  constructor(canvasManager, card, apiClient, showToast) {
    this.canvasManager = canvasManager;
    this.card = card;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.overlay = document.querySelector('#crop-overlay');
    this.selection = null;
    this.drag = null;
    this.active = false;
    this.bindEvents();
  }

  bindEvents() {
    document.querySelector('[data-tool="crop"]')?.addEventListener('click', () => this.activate());
    document.querySelector('#crop-apply')?.addEventListener('click', () => this.apply());
    document.querySelector('#crop-cancel')?.addEventListener('click', () => this.deactivate());
    document.querySelector('#crop-reset')?.addEventListener('click', () => this.reset());
    window.addEventListener('resize', () => { if (this.active) this.syncToImage(); });
  }

  activate() {
    if (!this.canvasManager.hasImage()) return this.showToast('Choose an image before cropping');
    this.active = true;
    this.overlay.hidden = false;
    document.querySelector('#crop-controls').hidden = false;
    this.syncToImage();
    this.showToast('Drag the crop area, then apply');
  }

  syncToImage() {
    const rect = this.canvasManager.getImageRect();
    if (!rect) return;
    if (!this.selection) this.selection = { x: rect.x + rect.width * .1, y: rect.y + rect.height * .1, width: rect.width * .8, height: rect.height * .8 };
    this.render();
  }

  render() {
    if (!this.selection) return;
    const { x, y, width, height } = this.selection;
    this.overlay.style.left = `${x}px`; this.overlay.style.top = `${y}px`; this.overlay.style.width = `${width}px`; this.overlay.style.height = `${height}px`;
    const size = document.querySelector('#crop-size');
    if (size) size.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
  }

  onPointerDown(event) {
    if (!this.active) return;
    this.drag = { x: event.clientX, y: event.clientY, origin: { ...this.selection } };
    this.overlay.setPointerCapture(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.drag) return;
    const bounds = this.canvasManager.getImageRect();
    const next = { ...this.drag.origin, x: this.drag.origin.x + event.clientX - this.drag.x, y: this.drag.origin.y + event.clientY - this.drag.y };
    next.x = Math.max(bounds.x, Math.min(next.x, bounds.x + bounds.width - next.width));
    next.y = Math.max(bounds.y, Math.min(next.y, bounds.y + bounds.height - next.height));
    this.selection = next;
    this.render();
  }

  stopDrag() { this.drag = null; }

  async apply() {
    if (!this.selection) return;
    const button = document.querySelector('#crop-apply');
    await withBusy(button, 'Applying crop', async () => {
    const imageRect = this.canvasManager.getImageRect();
    const dimensions = this.canvasManager.getSourceDimensions();
    const payload = {
      x: Math.round(((this.selection.x - imageRect.x) / imageRect.width) * dimensions.width),
      y: Math.round(((this.selection.y - imageRect.y) / imageRect.height) * dimensions.height),
      width: Math.round((this.selection.width / imageRect.width) * dimensions.width),
      height: Math.round((this.selection.height / imageRect.height) * dimensions.height),
    };
    try {
      const image = await this.apiClient.transform('crop', payload);
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(image.image_id), image);
      document.dispatchEvent(new CustomEvent('ic-operation'));
        this.deactivate();
        this.showToast('Crop applied');
      } catch (error) { this.showToast(error.message); }
    });
  }

  reset() { this.selection = null; this.syncToImage(); }

  deactivate() {
    this.active = false; this.drag = null; this.selection = null; this.overlay.hidden = true; document.querySelector('#crop-controls').hidden = true;
  }
}

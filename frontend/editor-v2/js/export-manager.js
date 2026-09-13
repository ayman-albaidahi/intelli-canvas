export class ExportManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.dialog = document.querySelector('#export-dialog');
    this.format = document.querySelector('#export-format');
    this.qualityField = document.querySelector('#export-quality-field');
    this.quality = document.querySelector('#export-quality');
    this.qualityVal = document.querySelector('#export-quality-val');
    this.width = document.querySelector('#export-width');
    this.height = document.querySelector('#export-height');
    this.ratio = document.querySelector('#export-ratio');
    this.name = document.querySelector('#export-name');
    this.submit = document.querySelector('#export-submit');
    this.busy = false;
    this.bind();
  }

  bind() {
    document.querySelector('[data-action="export"]')?.addEventListener('click', () => this.open());
    document.querySelector('#export-cancel')?.addEventListener('click', () => this.close());
    document.querySelector('#export-cancel-secondary')?.addEventListener('click', () => this.close());
    this.format?.addEventListener('change', () => {
      this.qualityField.hidden = !['jpeg', 'webp'].includes(this.format.value);
    });
    this.quality?.addEventListener('input', () => {
      this.qualityVal.textContent = this.quality.value;
    });
    this.width?.addEventListener('input', () => {
      if (!this.ratio.checked || !this.width.value) return;
      const dims = this.canvasManager.getSourceDimensions();
      this.height.value = Math.max(1, Math.round((Number(this.width.value) * dims.height) / dims.width));
    });
    this.height?.addEventListener('input', () => {
      if (!this.ratio.checked || !this.height.value) return;
      const dims = this.canvasManager.getSourceDimensions();
      this.width.value = Math.max(1, Math.round((Number(this.height.value) * dims.width) / dims.height));
    });
    this.dialog?.querySelector('#export-form')?.addEventListener('submit', (event) => this.export(event));
  }

  open() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image before exporting');
    const dims = this.canvasManager.getSourceDimensions();
    this.width.value = dims.width;
    this.height.value = dims.height;
    this.name.value = (document.querySelector('#document-name')?.textContent || 'intellicanvas').replace(/\.[^.]+$/, '') || 'intellicanvas';
    this.dialog.hidden = false;
  }

  close() { this.dialog.hidden = true; }

  async export(event) {
    event.preventDefault();
    if (this.busy) return;
    if (!this.apiClient.imageId) return this.showToast('Upload an image first');
    const width = this.width.value ? Number(this.width.value) : null;
    const height = this.height.value ? Number(this.height.value) : null;
    const params = {
      format: this.format.value,
      quality: ['jpeg', 'webp'].includes(this.format.value) ? Number(this.quality.value) : null,
      width,
      height,
    };
    const extension = this.format.value === 'jpeg' ? 'jpg' : this.format.value;
    const filename = `${(this.name.value || 'intellicanvas').replace(/[\\/:*?"<>|]/g, '')}.${extension}`;
    this.busy = true;
    this.submit.disabled = true;
    this.submit.textContent = 'Exporting…';
    try {
      const blob = await this.apiClient.export(params.format, params.quality, width, height);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      this.showToast(`Exported ${filename}`);
      this.close();
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
      this.submit.disabled = false;
      this.submit.textContent = 'Export';
    }
  }
}

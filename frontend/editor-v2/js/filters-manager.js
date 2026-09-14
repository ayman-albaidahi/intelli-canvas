export class FiltersManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.status = document.querySelector('#filters-status');
    this.histogramOutput = document.querySelector('#histogram-output');
    this.busy = false;
    this.bind();
  }

  bind() {
    document.querySelector('[data-action="apply-sobel"]')?.addEventListener('click', () => {
      this.apply('sobel', { ksize: this.integerValue('#sobel-ksize', 3) }, 'Sobel edges applied');
    });
    document.querySelector('[data-action="apply-laplacian"]')?.addEventListener('click', () => {
      this.apply('laplacian', {}, 'Laplacian edges applied');
    });
    document.querySelector('[data-action="apply-median-filter"]')?.addEventListener('click', () => {
      this.apply('median-filter', { ksize: this.integerValue('#median-ksize', 3) }, 'Median filter applied');
    });
    document.querySelector('[data-action="apply-morphology"]')?.addEventListener('click', () => {
      this.apply('morphology', {
        operation: document.querySelector('#morphology-operation')?.value || 'erode',
        ksize: this.integerValue('#morphology-ksize', 3),
      }, 'Morphology operation applied');
    });
    document.querySelector('[data-action="apply-gamma"]')?.addEventListener('click', () => {
      this.apply('gamma', { value: this.numberValue('#gamma-value', 1) }, 'Gamma correction applied');
    });
    document.querySelector('[data-action="apply-threshold"]')?.addEventListener('click', () => {
      this.apply('threshold', { value: this.integerValue('#threshold-value', 128) }, 'Threshold applied');
    });
    document.querySelector('[data-action="compute-histogram"]')?.addEventListener('click', () => this.histogram());
    document.addEventListener('appstatechange', () => this.syncControls());
    this.syncControls();
  }

  integerValue(selector, fallback) {
    return Number.parseInt(document.querySelector(selector)?.value ?? fallback, 10);
  }

  numberValue(selector, fallback) {
    return Number.parseFloat(document.querySelector(selector)?.value ?? fallback);
  }

  syncControls() {
    const disabled = this.busy || !this.apiClient.imageId;
    document.querySelectorAll('[data-filter-action]').forEach((control) => { control.disabled = disabled; });
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }

  async apply(operation, data, successMessage) {
    if (!this.apiClient.imageId) return this.showToast('Upload an image before processing');
    if (this.busy) return;
    this.busy = true;
    this.syncControls();
    this.setStatus('Processing…');
    try {
      const result = await this.apiClient.process(operation, data);
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(result.image_id), result);
      document.querySelector('#canvas-size').textContent = `${result.width} × ${result.height}`;
      document.dispatchEvent(new CustomEvent('ic-operation'));
      this.setStatus(successMessage);
      this.showToast(successMessage);
    } catch (error) {
      this.setStatus('Could not apply filter');
      this.showToast(error.message);
    } finally {
      this.busy = false;
      this.syncControls();
    }
  }

  async histogram() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image before processing');
    if (this.busy) return;
    this.busy = true;
    this.syncControls();
    this.setStatus('Computing histogram…');
    try {
      const histogram = await this.apiClient.histogram();
      this.renderHistogram(histogram);
      this.setStatus('Histogram updated');
      this.showToast('Histogram updated');
    } catch (error) {
      this.setStatus('Could not compute histogram');
      this.showToast(error.message);
    } finally {
      this.busy = false;
      this.syncControls();
    }
  }

  renderHistogram(histogram) {
    if (!this.histogramOutput) return;
    const rows = Object.entries(histogram).map(([channel, bins]) => {
      const peak = Math.max(...bins);
      const count = bins.reduce((total, value) => total + value, 0);
      const peakLevel = peak ? Math.round((peak / count) * 100) : 0;
      return `<div><strong>${channel.toUpperCase()}</strong><span>${count.toLocaleString()} px · peak ${peakLevel}%</span></div>`;
    });
    this.histogramOutput.replaceChildren();
    for (const row of rows) {
      const template = document.createElement('template');
      template.innerHTML = row;
      this.histogramOutput.append(template.content);
    }
  }
}

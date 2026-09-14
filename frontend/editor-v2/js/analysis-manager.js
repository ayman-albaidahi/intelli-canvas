import { escapeHtml } from './escape-html.js';

const FINDING_LABELS = {
  LOW_BRIGHTNESS: 'سطوع منخفض',
  HIGH_BRIGHTNESS: 'سطوع مرتفع',
  LOW_CONTRAST: 'تباين منخفض',
};

export class AnalysisManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.status = document.querySelector('#analysis-status');
    this.metricsBox = document.querySelector('#analysis-metrics');
    this.findingsBox = document.querySelector('#analysis-findings');
    this.suggestionCard = document.querySelector('#suggestion-card');
    this.previewImg = document.querySelector('#suggestion-preview');
    this.activeSuggestion = null;
    this.busy = false;
    this.bind();
  }

  bind() {
    document.querySelector('[data-action="analyze-image"]')?.addEventListener('click', () => this.run());
    document.querySelector('[data-action="preview-suggestion"]')?.addEventListener('click', () => this.preview());
    document.querySelector('[data-action="dismiss-suggestion"]')?.addEventListener('click', () => this.dismiss());
    document.querySelector('[data-action="apply-suggestion"]')?.addEventListener('click', () => this.apply());
  }

  setBusy(value) {
    this.busy = value;
    if (this.status) this.status.textContent = value ? 'جارٍ التحليل…' : this.status.textContent;
  }

  async run() {
    if (!this.apiClient.imageId) return this.showToast('ارفع صورة أولاً');
    if (this.busy) return;
    this.setBusy(true);
    if (this.metricsBox) this.metricsBox.hidden = true;
    if (this.findingsBox) this.findingsBox.innerHTML = '<p class="applied-line">جارٍ تحليل الصورة…</p>';
    if (this.findingsBox) this.findingsBox.hidden = false;
    try {
      const report = await this.apiClient.analyze();
      this.render(report);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  render(report) {
    if (this.metricsBox) {
      const m = report.metrics;
      this.metricsBox.innerHTML =
        `<div>الأبعاد: ${m.width}×${m.height}</div>` +
        `<div>متوسط السطوع: ${m.brightness_mean}</div>` +
        `<div>التباين: ${m.contrast_stddev}</div>`;
      this.metricsBox.hidden = false;
    }
    if (this.findingsBox) {
      this.findingsBox.innerHTML = report.findings.length
        ? report.findings.map((f) => `<div class="finding-row">${escapeHtml(FINDING_LABELS[f.code] || f.code)} — ${f.severity}</div>`).join('')
        : '<p class="applied-line">لا مشكلات مرصودة.</p>';
      this.findingsBox.hidden = false;
    }
    this.suggestionCard && (this.suggestionCard.hidden = true);
  }

  showSuggestion(suggestion) {
    this.activeSuggestion = suggestion;
    if (this.suggestionCard) {
      this.suggestionCard.hidden = false;
      const type = document.querySelector('#suggestion-type');
      const reason = document.querySelector('#suggestion-reason');
      const confidence = document.querySelector('#suggestion-confidence');
      if (type) type.textContent = suggestion.type;
      if (reason) reason.textContent = suggestion.reason;
      if (confidence) confidence.textContent = `الثقة: ${Math.round(suggestion.confidence * 100)}%`;
    }
  }

  async preview() {
    if (!this.activeSuggestion) return this.showToast('شغّل التحليل أولاً');
    try {
      const blob = await this.apiClient.previewSuggestion(this.apiClient.imageId, this.activeSuggestion.type);
      if (this.previewImg) {
        this.previewImg.src = URL.createObjectURL(blob);
        this.previewImg.hidden = false;
      }
      this.showToast('معاينة الاقتراح جاهزة');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async dismiss() {
    if (!this.activeSuggestion) return;
    try {
      await this.apiClient.dismissSuggestion(this.activeSuggestion.type);
      this.activeSuggestion = null;
      this.showToast('تم تجاهل الاقتراح');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async apply() {
    if (!this.activeSuggestion || this.busy) return;
    this.busy = true;
    try {
      await this.apiClient.applySuggestion(this.apiClient.imageId, this.activeSuggestion.type);
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(this.apiClient.imageId), {});
      document.dispatchEvent(new CustomEvent('ic-operation'));
      this.showToast('تم تطبيق الاقتراح');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
  }
}

const FINDING_LABELS = {
  LOW_BRIGHTNESS: 'سطوع منخفض',
  HIGH_BRIGHTNESS: 'سطوع مرتفع',
  LOW_CONTRAST: 'تباين منخفض',
};

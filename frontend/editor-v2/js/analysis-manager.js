import { escapeHtml } from './escape-html.js';

const FINDING_LABELS = {
  LOW_BRIGHTNESS: 'سطوع منخفض',
  HIGH_BRIGHTNESS: 'سطوع مرتفع',
  LOW_CONTRAST: 'تباين منخفض',
  LOW_SHARPNESS: 'حدة منخفضة',
  HIGH_NOISE: 'ضوضاء مرتفعة',
  SHADOW_CLIPPING: 'قص في الظلال',
  HIGHLIGHT_CLIPPING: 'قص في الإضاءات',
};

export class AnalysisManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.status = document.querySelector('#analysis-status');
    this.metricsBox = document.querySelector('#analysis-metrics');
    this.findingsBox = document.querySelector('#analysis-findings');
    this.suggestionList = document.querySelector('#suggestion-list');
    this.qualityBox = document.querySelector('#analysis-quality');
    this.qualityScore = document.querySelector('#analysis-quality-score');
    this.suggestionCard = document.querySelector('#suggestion-card');
    this.previewImg = document.querySelector('#suggestion-preview');
    this.activeSuggestion = null;
    this.suggestions = [];
    this.busy = false;
    this.bind();
  }

  bind() {
    document.querySelector('[data-action="analyze-image"]')?.addEventListener('click', () => this.run());
    document.querySelector('[data-action="preview-suggestion"]')?.addEventListener('click', () => this.preview());
    document.querySelector('[data-action="dismiss-suggestion"]')?.addEventListener('click', () => this.dismiss());
    document.querySelector('[data-action="apply-suggestion"]')?.addEventListener('click', () => this.apply());
    this.suggestionList?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-suggestion-type]');
      if (card) this.showSuggestion(this.suggestions.find((item) => item.type === card.dataset.suggestionType));
    });
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
      const report = await this.apiClient.suggestions();
      this.render(report);
      this.suggestions = report.suggestions || [];
      this.renderSuggestions(this.suggestions);
      if (this.status) this.status.textContent = report.cache_hit ? 'جاهز — من الذاكرة المؤقتة' : 'اكتمل التحليل';
      if (report.suggestions?.length) this.showSuggestion(report.suggestions[0]);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  render(report) {
    if (this.metricsBox) {
      const m = report.metrics;
      if (this.qualityBox) this.qualityBox.hidden = false;
      if (this.qualityScore) this.qualityScore.textContent = `${report.quality_score ?? m.quality_score ?? '—'} / 100`;
      this.metricsBox.innerHTML =
        `<div>الأبعاد: ${m.width}×${m.height}</div>` +
        `<div>متوسط السطوع: ${m.brightness_mean}</div>` +
        `<div>الوسيط: ${m.brightness_median}</div>` +
        `<div>التباين: ${m.contrast_stddev}</div>` +
        `<div>الحدة: ${m.sharpness_score}</div>` +
        `<div>الضوضاء: ${m.noise_score}</div>` +
        `<div>قص الظلال: ${Math.round(m.clipped_shadow_ratio * 10000) / 100}%</div>` +
        `<div>قص الإضاءات: ${Math.round(m.clipped_highlight_ratio * 10000) / 100}%</div>`;
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

  renderSuggestions(suggestions) {
    if (!this.suggestionList) return;
    this.suggestionList.innerHTML = suggestions.map((suggestion) => `<button class="suggestion-list-item" data-suggestion-type="${escapeHtml(suggestion.type)}" role="listitem"><strong>${escapeHtml(suggestion.title || suggestion.type)}</strong><span>${Math.round((suggestion.confidence || 0) * 100)}% confidence · ${suggestion.pipeline?.nodes?.length || 1} step${(suggestion.pipeline?.nodes?.length || 1) === 1 ? '' : 's'}</span></button>`).join('');
  }

  showSuggestion(suggestion) {
    if (!suggestion) return;
    this.activeSuggestion = suggestion;
    if (this.suggestionCard) {
      this.suggestionCard.hidden = false;
      const type = document.querySelector('#suggestion-type');
      const reason = document.querySelector('#suggestion-reason');
      const confidence = document.querySelector('#suggestion-confidence');
      if (type) type.textContent = suggestion.type;
      if (reason) reason.textContent = suggestion.reason;
      if (confidence) confidence.textContent = `الثقة: ${Math.round(suggestion.confidence * 100)}%`;
      this.suggestionList?.querySelectorAll('[data-suggestion-type]').forEach((item) => item.classList.toggle('is-selected', item.dataset.suggestionType === suggestion.type));
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
      this.suggestions = this.suggestions.filter((item) => item.type !== this.activeSuggestion.type);
      this.renderSuggestions(this.suggestions);
      this.activeSuggestion = null;
      if (this.suggestionCard) this.suggestionCard.hidden = true;
      this.showToast('تم تجاهل الاقتراح');
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async apply() {
    if (!this.activeSuggestion || this.busy) return;
    this.busy = true;
    try {
      const applied = await this.apiClient.applySuggestion(this.apiClient.imageId, this.activeSuggestion.type);
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(this.apiClient.imageId), {});
      document.dispatchEvent(new CustomEvent('ic-operation'));
      this.showToast(`تم تطبيق الـ Pipeline كسجل واحد${applied?.image?.cache_hit ? ' من الذاكرة المؤقتة' : ''}`);
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.busy = false;
    }
  }
}

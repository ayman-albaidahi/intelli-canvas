const NEUTRAL_SLIDERS = { brightness: 100, contrast: 100, saturation: 100, blur: 0, sharpen: 0 };
const VALUE_SUFFIXES = { brightness: '', contrast: '', saturation: '', blur: 'px', sharpen: '' };

export class AdjustmentsManager {
  constructor({ canvasManager, apiClient, showToast }) {
    this.canvasManager = canvasManager;
    this.apiClient = apiClient;
    this.showToast = showToast;
    this.lastApplied = null;
    this.lastSubmitted = null;
    this.busy = false;
    this.applyButton = document.querySelector('[data-action="apply-adjustments"]');
    this.appliedLine = document.querySelector('#applied-line');
    this.statusMessage = document.querySelector('#status-message');
    this.bind();
  }

  bind() {
    document.querySelectorAll('[data-adjustment]').forEach((input) => {
      input.addEventListener('input', () => { this.updateValueLabels(); this.applyPreview(); });
      input.addEventListener('change', () => this.applyPreview());
    });
    document.querySelectorAll('[data-reset]').forEach((button) => {
      button.addEventListener('click', () => this.resetOne(button.dataset.reset));
    });
    document.querySelector('[data-action="reset-adjustments"]')?.addEventListener('click', () => {
      this.resetAll();
      this.applyPreview();
      this.showToast('All adjustments reset');
    });
    document.querySelector('#preview-toggle')?.addEventListener('change', (event) => {
      this.canvasManager.setPreview(event.target.checked);
      this.showToast(event.target.checked
        ? 'Live preview on — sliders show a local estimate'
        : 'Live preview off — showing the saved result');
    });
    document.querySelector('[data-action="toggle-before-after"]')?.addEventListener('click', () => {
      document.querySelector('[data-action="compare"]')?.click();
    });
    this.applyButton?.addEventListener('click', () => this.applyInPython());
    document.addEventListener('appstatechange', () => this.syncApplyButton());
    this.syncApplyButton();
  }

  syncApplyButton() {
    if (this.applyButton) this.applyButton.disabled = this.busy || !this.apiClient.imageId;
  }

  values() {
    return {
      brightness: Number(document.querySelector('[data-adjustment="brightness"]')?.value || 100),
      contrast: Number(document.querySelector('[data-adjustment="contrast"]')?.value || 100),
      saturation: Number(document.querySelector('[data-adjustment="saturation"]')?.value || 100),
      blur: Number(document.querySelector('[data-adjustment="blur"]')?.value || 0),
      sharpen: Number(document.querySelector('[data-adjustment="sharpen"]')?.value || 0),
      grayscale: document.querySelector('[data-adjustment="grayscale"]')?.checked || false,
      negative: document.querySelector('[data-adjustment="negative"]')?.checked || false,
    };
  }

  sliderValues() {
    const { brightness, contrast, saturation, blur, sharpen } = this.values();
    return { brightness, contrast, saturation, blur, sharpen };
  }

  updateValueLabels() {
    const values = this.sliderValues();
    document.querySelectorAll('[data-value-for]').forEach((output) => {
      const name = output.dataset.valueFor;
      output.textContent = `${values[name]}${VALUE_SUFFIXES[name] ?? ''}`;
    });
  }

  applyPreview() {
    this.canvasManager.setAdjustments(this.values());
    this.updateSummary();
    this.updateAppliedLine();
  }

  updateSummary() {
    const summary = document.querySelector('#adjustment-summary');
    if (!summary) return;
    if (this.busy) { summary.textContent = 'Processing…'; return; }
    summary.textContent = this.hasUnappliedChanges() ? 'Unapplied changes' : this.canvasManager.adjustmentSummary();
  }

  updateAppliedLine() {
    if (!this.appliedLine) return;
    if (this.busy) return;
    if (!this.lastApplied) {
      this.appliedLine.textContent = 'Nothing applied yet — press Apply to save your changes.';
      return;
    }
    const parts = [];
    for (const [name, suffix] of Object.entries(VALUE_SUFFIXES)) {
      const value = this.lastApplied[name];
      const neutral = NEUTRAL_SLIDERS[name];
      if (value !== neutral) parts.push(`${name} ${value}${suffix}`);
    }
    for (const flag of ['grayscale', 'negative']) {
      if (this.lastApplied[flag]) parts.push(flag);
    }
    const applied = parts.length ? `Applied: ${parts.join(' · ')}` : 'Applied: nothing yet';
    this.appliedLine.textContent = this.hasUnappliedChanges()
      ? `${applied} — preview differs, press Apply to bake.`
      : `${applied} — preview is up to date.`;
  }

  hasUnappliedChanges() {
    return Object.keys(this.changedPayload()).length > 0;
  }

  resetOne(name) {
    const input = document.querySelector(`[data-adjustment="${name}"]`);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = false;
    else input.value = NEUTRAL_SLIDERS[name] ?? 100;
    input.dispatchEvent(new Event('input'));
  }

  resetAll() {
    document.querySelectorAll('[data-adjustment]').forEach((input) => {
      if (input.type === 'checkbox') input.checked = false;
      else input.value = NEUTRAL_SLIDERS[input.dataset.adjustment] ?? 100;
      input.dispatchEvent(new Event('input'));
    });
  }

  changedPayload() {
    const values = this.values();
    const payload = {};
    for (const [name, neutral] of Object.entries(NEUTRAL_SLIDERS)) {
      if (values[name] !== neutral) payload[name] = values[name];
    }
    for (const flag of ['grayscale', 'negative']) {
      if (values[flag]) payload[flag] = true;
    }
    return payload;
  }

  async applyInPython() {
    if (!this.apiClient.imageId) return this.showToast('Upload an image before processing');
    if (this.busy) return;
    const payload = this.changedPayload();
    if (Object.keys(payload).length === 0) {
      return this.showToast('Nothing to apply — move a slider away from its neutral value first');
    }
    if (this.lastSubmitted && JSON.stringify(payload) === JSON.stringify(this.lastSubmitted)) {
      return this.showToast('Values unchanged since the last apply — adjust a slider first');
    }

    this.busy = true;
    this.applyButton.disabled = true;
    this.applyButton.classList.add('is-busy');
    const applyLabel = this.applyButton.textContent;
    this.applyButton.textContent = 'Applying…';
    this.statusMessage.textContent = 'Applying your adjustments…';
    this.updateSummary();
    try {
      const result = await this.apiClient.process('adjustments', payload);
      await this.canvasManager.loadFromUrl(this.apiClient.contentUrl(result.image_id), result);
      this.lastApplied = { ...NEUTRAL_SLIDERS, grayscale: false, negative: false, ...payload };
      this.lastSubmitted = payload;
      this.resetAll();
      document.dispatchEvent(new CustomEvent('ic-operation'));
      this.statusMessage.textContent = 'Adjustments applied';
      this.showToast('Adjustments applied');
    } catch (error) {
      this.statusMessage.textContent = 'Could not apply the adjustments';
      this.showToast(error.message);
    } finally {
      this.busy = false;
      this.applyButton.classList.remove('is-busy');
      this.applyButton.textContent = applyLabel;
      this.syncApplyButton();
      this.updateSummary();
      this.updateAppliedLine();
    }
  }
}

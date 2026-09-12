export class AdjustmentsManager {
  constructor(canvasManager, showToast) {
    this.canvasManager = canvasManager;
    this.showToast = showToast;
    this.bind();
  }

  bind() {
    document.querySelectorAll('[data-adjustment]').forEach((input) => {
      input.addEventListener('input', () => this.apply());
      input.addEventListener('change', () => this.apply());
    });
    document.querySelector('[data-action="reset-adjustments"]')?.addEventListener('click', () => {
      this.reset();
      this.showToast('Adjustments reset');
    });
  }

  values() {
    return {
      brightness: Number(document.querySelector('[data-adjustment="brightness"]')?.value || 100),
      contrast: Number(document.querySelector('[data-adjustment="contrast"]')?.value || 100),
      saturation: Number(document.querySelector('[data-adjustment="saturation"]')?.value || 100),
      blur: Number(document.querySelector('[data-adjustment="blur"]')?.value || 0),
      grayscale: document.querySelector('[data-adjustment="grayscale"]')?.checked || false,
      negative: document.querySelector('[data-adjustment="negative"]')?.checked || false,
    };
  }

  apply() {
    this.canvasManager.setAdjustments(this.values());
    document.querySelector('#adjustment-summary').textContent = this.canvasManager.adjustmentSummary();
  }

  reset() {
    const defaults = { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, negative: false };
    Object.entries(defaults).forEach(([key, value]) => {
      const input = document.querySelector(`[data-adjustment="${key}"]`);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
    });
    this.apply();
  }
}

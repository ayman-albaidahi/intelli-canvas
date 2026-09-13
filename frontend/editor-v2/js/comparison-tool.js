export class ComparisonTool {
  constructor(canvasManager, showToast) {
    this.canvasManager = canvasManager;
    this.showToast = showToast;
    this.view = document.querySelector('#comparison-view');
    this.original = document.querySelector('#comparison-original');
    this.edited = document.querySelector('#comparison-edited');
    this.handle = document.querySelector('#comparison-handle');
    this.slider = document.querySelector('#comparison-slider');
    document.querySelector('[data-action="compare"]')?.addEventListener('click', () => this.toggle());
    this.slider.addEventListener('input', () => this.render());
    window.addEventListener('resize', () => { if (!this.view.hidden) this.render(); });
  }

  toggle() {
    if (!this.canvasManager.hasImage()) return this.showToast('Choose an image before comparing');
    this.view.hidden = !this.view.hidden;
    if (!this.view.hidden) { this.render(); this.showToast('Drag the divider to compare original and edited'); }
  }

  render() {
    const image = this.canvasManager.getImage();
    if (!image) return;
    const bounds = this.view.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const split = Number(this.slider.value) / 100;
    [this.original, this.edited].forEach((canvas) => {
      canvas.width = Math.floor(bounds.width * ratio);
      canvas.height = Math.floor(bounds.height * ratio);
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
    });
    this.draw(this.original, image, '', bounds.width, bounds.height, ratio);
    this.draw(this.edited, image, 'edited', bounds.width, bounds.height, ratio);
    this.edited.parentElement.style.clipPath = `inset(0 0 0 ${split * 100}%)`;
    this.handle.style.left = `${split * 100}%`;
  }

  draw(canvas, image, mode, width, height, ratio) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min((width - 80) / image.naturalWidth, (height - 80) / image.naturalHeight, 1);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    if (mode === 'edited') ctx.filter = this.canvasManager.previewEnabled ? this.canvasManager.adjustmentFilter() : 'none';
    ctx.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    ctx.restore();
  }
}

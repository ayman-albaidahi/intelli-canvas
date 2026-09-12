import { appState, setState } from './app-state.js';

export class CanvasManager {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.image = null;
    this.scale = 1;
    this.fitScale = 1;
    this.offset = { x: 0, y: 0 };
    this.drag = null;
    this.bindEvents();
    this.resize();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    this.stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.setZoom(event.deltaY < 0 ? 10 : -10);
    }, { passive: false });
    this.canvas.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY, originX: this.offset.x, originY: this.offset.y };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('is-panning');
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      this.offset.x = this.drag.originX + event.clientX - this.drag.x;
      this.offset.y = this.drag.originY + event.clientY - this.drag.y;
      this.render();
    });
    this.canvas.addEventListener('pointerup', () => this.stopDragging());
    this.canvas.addEventListener('pointercancel', () => this.stopDragging());
  }

  stopDragging() {
    this.drag = null;
    this.canvas.classList.remove('is-panning');
  }

  resize() {
    const bounds = this.stage.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    this.canvas.style.width = `${bounds.width}px`;
    this.canvas.style.height = `${bounds.height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.image) this.fit(); else this.render();
  }

  load(file) {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('load', () => {
        this.image = image;
        setState({ hasImage: true });
        this.fit();
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  }

  fit() {
    if (!this.image) return;
    const bounds = this.stage.getBoundingClientRect();
    this.fitScale = Math.min((bounds.width - 100) / this.image.naturalWidth, (bounds.height - 100) / this.image.naturalHeight, 1);
    this.scale = this.fitScale;
    this.offset = { x: bounds.width / 2, y: bounds.height / 2 };
    setState({ zoom: Math.round(this.scale * 100) });
    this.render();
  }

  setZoom(delta) {
    if (!this.image) return;
    const next = Math.max(0.1, Math.min(4, this.scale + delta / 100));
    this.scale = next;
    setState({ zoom: Math.round(this.scale * 100) });
    this.render();
  }

  render() {
    const bounds = this.stage.getBoundingClientRect();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    if (!this.image) return;
    const width = this.image.naturalWidth * this.scale;
    const height = this.image.naturalHeight * this.scale;
    this.ctx.drawImage(this.image, this.offset.x - width / 2, this.offset.y - height / 2, width, height);
  }
}

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
    this.rotation = 0;
    this.flipX = 1;
    this.flipY = 1;
    this.crop = { x: 0, y: 0, width: 1, height: 1 };
    this.documentSize = { width: 0, height: 0 };
    this.history = [];
    this.future = [];
    this.adjustments = { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, negative: false };
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
        this.rotation = 0;
        this.flipX = 1;
        this.flipY = 1;
        this.crop = { x: 0, y: 0, width: 1, height: 1 };
        this.documentSize = { width: image.naturalWidth, height: image.naturalHeight };
        this.history = [];
        this.future = [];
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
    const sourceWidth = this.documentSize.width * this.crop.width;
    const sourceHeight = this.documentSize.height * this.crop.height;
    const rotatedWidth = Math.abs(this.rotation % 180) === 90 ? sourceHeight : sourceWidth;
    const rotatedHeight = Math.abs(this.rotation % 180) === 90 ? sourceWidth : sourceHeight;
    this.fitScale = Math.min((bounds.width - 100) / rotatedWidth, (bounds.height - 100) / rotatedHeight, 1);
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

  hasImage() { return Boolean(this.image); }

  getImage() { return this.image; }

  setAdjustments(next) { this.adjustments = { ...this.adjustments, ...next }; this.render(); }

  adjustmentSummary() { const active = Object.entries(this.adjustments).filter(([key, value]) => (typeof value === 'boolean' && value) || (typeof value === 'number' && ((key === 'blur' && value > 0) || (key !== 'blur' && value !== 100)))); return active.length ? `${active.length} active` : 'Neutral'; }

  getSourceDimensions() { return { ...this.documentSize }; }

  resizeImage(width, height) { this.commit(); this.documentSize = { width, height }; this.crop = { x: 0, y: 0, width: 1, height: 1 }; this.fit(); document.querySelector('#canvas-size').textContent = `${width} × ${height}`; }

  getImageRect() {
    if (!this.image) return null;
    const width = this.documentSize.width * this.crop.width * this.scale;
    const height = this.documentSize.height * this.crop.height * this.scale;
    return { x: this.offset.x - width / 2, y: this.offset.y - height / 2, width, height };
  }

  applyCropSelection(selection) {
    const imageRect = this.getImageRect();
    if (!imageRect) return;
    this.commit();
    const left = Math.max(0, Math.min(1, (selection.x - imageRect.x) / imageRect.width));
    const top = Math.max(0, Math.min(1, (selection.y - imageRect.y) / imageRect.height));
    const width = Math.max(0.05, Math.min(1 - left, selection.width / imageRect.width));
    const height = Math.max(0.05, Math.min(1 - top, selection.height / imageRect.height));
    this.crop = { x: this.crop.x + this.crop.width * left, y: this.crop.y + this.crop.height * top, width: this.crop.width * width, height: this.crop.height * height };
    this.fit();
  }

  snapshot() { return { rotation: this.rotation, flipX: this.flipX, flipY: this.flipY, crop: { ...this.crop }, documentSize: { ...this.documentSize }, adjustments: { ...this.adjustments } }; }

  commit() { this.history.push(this.snapshot()); if (this.history.length > 30) this.history.shift(); this.future = []; }

  restore(snapshot) { this.rotation = snapshot.rotation; this.flipX = snapshot.flipX; this.flipY = snapshot.flipY; this.crop = { ...snapshot.crop }; this.documentSize = { ...snapshot.documentSize }; this.adjustments = { ...this.adjustments, ...(snapshot.adjustments || {}) }; this.fit(); }

  rotate(degrees) { this.commit(); this.rotation = (this.rotation + degrees + 360) % 360; this.fit(); }

  flip(axis) { this.commit(); if (axis === 'horizontal') this.flipX *= -1; if (axis === 'vertical') this.flipY *= -1; this.render(); }

  cropCenter() {
    this.commit();
    const marginX = this.crop.width * 0.1;
    const marginY = this.crop.height * 0.1;
    this.crop = { x: this.crop.x + marginX, y: this.crop.y + marginY, width: this.crop.width * 0.8, height: this.crop.height * 0.8 };
    this.fit();
  }

  undo() { const previous = this.history.pop(); if (!previous) return false; this.future.push(this.snapshot()); this.restore(previous); return true; }

  redo() { const next = this.future.pop(); if (!next) return false; this.history.push(this.snapshot()); this.restore(next); return true; }

  render() {
    const bounds = this.stage.getBoundingClientRect();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    if (!this.image) return;
    const sourceX = this.image.naturalWidth * this.crop.x;
    const sourceY = this.image.naturalHeight * this.crop.y;
    const sourceWidth = this.image.naturalWidth * this.crop.width;
    const sourceHeight = this.image.naturalHeight * this.crop.height;
    const width = this.documentSize.width * this.crop.width * this.scale;
    const height = this.documentSize.height * this.crop.height * this.scale;
    this.ctx.save();
    this.ctx.translate(this.offset.x, this.offset.y);
    this.ctx.rotate(this.rotation * Math.PI / 180);
    this.ctx.scale(this.flipX, this.flipY);
    const a = this.adjustments;
    this.ctx.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) blur(${a.blur}px) grayscale(${a.grayscale ? 1 : 0}) invert(${a.negative ? 1 : 0})`;
    this.ctx.drawImage(this.image, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height);
    this.ctx.restore();
  }
}

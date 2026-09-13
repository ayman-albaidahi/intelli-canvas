import { appState, setState } from './app-state.js';

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const VIEW_MARGIN = 60;

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
    this.pointers = new Map();
    this.pinch = null;
    this.checkerPattern = null;
    this.bindEvents();
    this.resize();
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => this.resize()).observe(this.stage);
    }
    this.stage.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.onPointerEnd(event));
    this.canvas.addEventListener('pointercancel', (event) => this.onPointerEnd(event));
    document.addEventListener('fullscreenchange', () => {
      if (this.stage.closest('.canvas-zone')) this.resize();
    });
  }

  onWheel(event) {
    if (!this.image) return;
    event.preventDefault();
    const point = this.stagePoint(event);
    if (event.ctrlKey || event.metaKey) {
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-pixels * 0.0022);
      this.applyScale(this.scale * factor, point);
    } else {
      const pixels = event.deltaMode === 1 ? 16 : 1;
      const horizontal = event.shiftKey ? event.deltaY : event.deltaX;
      const vertical = event.shiftKey ? 0 : event.deltaY;
      this.offset.x -= horizontal * pixels;
      this.offset.y -= vertical * pixels;
      this.clampOffset();
      this.render();
    }
  }

  stagePoint(event) {
    const bounds = this.stage.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  center() {
    const bounds = this.stage.getBoundingClientRect();
    return { x: bounds.width / 2, y: bounds.height / 2 };
  }

  onPointerDown(event) {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale: this.scale,
        offset: { ...this.offset },
      };
      this.drag = null;
      return;
    }
    this.drag = { x: event.clientX, y: event.clientY, originX: this.offset.x, originY: this.offset.y };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-panning');
  }

  onPointerMove(event) {
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const stageMid = this.stagePoint({ clientX: mid.x, clientY: mid.y });
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.pinch.scale * (distance / this.pinch.distance || 1)));
      const ratio = nextScale / this.pinch.scale;
      this.scale = nextScale;
      this.offset = {
        x: stageMid.x + (this.pinch.offset.x - this.stagePoint({ clientX: this.pinch.mid.x, clientY: this.pinch.mid.y }).x) * ratio,
        y: stageMid.y + (this.pinch.offset.y - this.stagePoint({ clientX: this.pinch.mid.x, clientY: this.pinch.mid.y }).y) * ratio,
      };
      this.clampOffset();
      this.render();
      return;
    }
    if (!this.drag) return;
    this.offset.x = this.drag.originX + event.clientX - this.drag.x;
    this.offset.y = this.drag.originY + event.clientY - this.drag.y;
    this.clampOffset();
    this.render();
  }

  onPointerEnd(event) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 1) {
      const [remaining] = [...this.pointers.values()];
      this.drag = { x: remaining.x, y: remaining.y, originX: this.offset.x, originY: this.offset.y };
      return;
    }
    this.drag = null;
    this.canvas.classList.remove('is-panning');
  }

  resize() {
    const bounds = this.stage.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
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

  loadFromUrl(url, metadata = {}) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.addEventListener('load', () => {
        this.image = image;
        this.rotation = 0;
        this.flipX = 1;
        this.flipY = 1;
        this.crop = { x: 0, y: 0, width: 1, height: 1 };
        this.documentSize = { width: image.naturalWidth || metadata.width, height: image.naturalHeight || metadata.height };
        this.history = [];
        this.future = [];
        setState({ hasImage: true });
        this.fit();
        resolve(image);
      });
      image.addEventListener('error', () => reject(new Error('The uploaded image could not be displayed.')));
      image.src = url;
    });
  }

  fit() {
    if (!this.image) return;
    const bounds = this.stage.getBoundingClientRect();
    const { width, height } = this.rotatedDocumentSize();
    this.fitScale = Math.min((bounds.width - 100) / width, (bounds.height - 100) / height, 1);
    this.scale = Math.max(MIN_SCALE, this.fitScale);
    this.offset = { x: bounds.width / 2, y: bounds.height / 2 };
    setState({ zoom: Math.round(this.scale * 100) });
    this.render();
  }

  fitWidth() {
    if (!this.image) return;
    const bounds = this.stage.getBoundingClientRect();
    const { width } = this.rotatedDocumentSize();
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (bounds.width - 100) / width));
    this.offset = { x: bounds.width / 2, y: bounds.height / 2 };
    setState({ zoom: Math.round(this.scale * 100) });
    this.render();
  }

  setHundredPercent() { this.zoomToScale(1); }

  setActualPixels() { this.zoomToScale(window.devicePixelRatio || 1); }

  zoomStep(deltaPercent) { this.applyScale(this.scale + deltaPercent / 100, this.center()); }

  zoomToScale(scale, anchor = this.center()) { this.applyScale(scale, anchor); }

  applyScale(nextScale, anchor) {
    if (!this.image) return;
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const ratio = clamped / this.scale;
    this.offset = { x: anchor.x + (this.offset.x - anchor.x) * ratio, y: anchor.y + (this.offset.y - anchor.y) * ratio };
    this.scale = clamped;
    this.clampOffset();
    setState({ zoom: Math.round(this.scale * 100) });
    this.render();
  }

  setZoom(delta) { this.zoomStep(delta); }

  clampOffset() {
    if (!this.image) return;
    const bounds = this.stage.getBoundingClientRect();
    const { width, height } = this.drawnSize();
    const clampAxis = (center, halfExtent, viewHalf) => {
      const slack = halfExtent + viewHalf - VIEW_MARGIN;
      if (slack <= 0) return center;
      const low = viewHalf - slack;
      const high = viewHalf + slack;
      return Math.min(high, Math.max(low, center));
    };
    this.offset.x = clampAxis(this.offset.x, width / 2, bounds.width / 2);
    this.offset.y = clampAxis(this.offset.y, height / 2, bounds.height / 2);
  }

  rotatedDocumentSize() {
    const width = this.documentSize.width * this.crop.width;
    const height = this.documentSize.height * this.crop.height;
    return Math.abs(this.rotation % 180) === 90 ? { width: height, height: width } : { width, height };
  }

  drawnSize() {
    const { width, height } = this.rotatedDocumentSize();
    return { width: width * this.scale, height: height * this.scale };
  }

  hasImage() { return Boolean(this.image); }

  getImage() { return this.image; }

  setAdjustments(next) { this.adjustments = { ...this.adjustments, ...next }; this.render(); }

  adjustmentSummary() { const active = Object.entries(this.adjustments).filter(([key, value]) => (typeof value === 'boolean' && value) || (typeof value === 'number' && ((key === 'blur' || key === 'sharpen') ? value > 0 : value !== 100))); return active.length ? `${active.length} active` : 'Neutral'; }

  getSourceDimensions() { return { ...this.documentSize }; }

  resizeImage(width, height) { this.commit(); this.documentSize = { width, height }; this.crop = { x: 0, y: 0, width: 1, height: 1 }; this.fit(); document.querySelector('#canvas-size').textContent = `${width} × ${height}`; }

  getImageRect() {
    if (!this.image) return null;
    const { width, height } = this.drawnSize();
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

  toggleFullscreen() {
    const zone = this.stage.closest('.canvas-zone') || this.stage;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (zone.requestFullscreen) zone.requestFullscreen();
  }

  checkerboard(ctx) {
    if (!this.checkerPattern) {
      const tile = document.createElement('canvas');
      tile.width = 16;
      tile.height = 16;
      const tileCtx = tile.getContext('2d');
      tileCtx.fillStyle = '#ffffff';
      tileCtx.fillRect(0, 0, 16, 16);
      tileCtx.fillStyle = '#d9d4dc';
      tileCtx.fillRect(0, 0, 8, 8);
      tileCtx.fillRect(8, 8, 8, 8);
      this.checkerPattern = ctx.createPattern(tile, 'repeat');
    }
    return this.checkerPattern;
  }

  render() {
    const bounds = this.stage.getBoundingClientRect();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    if (!this.image) return;
    const sourceX = this.image.naturalWidth * this.crop.x;
    const sourceY = this.image.naturalHeight * this.crop.y;
    const sourceWidth = this.image.naturalWidth * this.crop.width;
    const sourceHeight = this.image.naturalHeight * this.crop.height;
    const { width, height } = this.drawnSize();
    this.ctx.save();
    this.ctx.translate(this.offset.x, this.offset.y);
    this.ctx.rotate(this.rotation * Math.PI / 180);
    this.ctx.scale(this.flipX, this.flipY);
    const a = this.adjustments;
    this.ctx.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) blur(${a.blur}px) grayscale(${a.grayscale ? 1 : 0}) invert(${a.negative ? 1 : 0})`;
    this.ctx.fillStyle = this.checkerboard(this.ctx);
    this.ctx.fillRect(-width / 2, -height / 2, width, height);
    this.ctx.drawImage(this.image, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height);
    this.ctx.filter = 'none';
    this.ctx.strokeStyle = 'rgba(217, 86, 135, 0.65)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1);
    this.ctx.restore();
  }
}

import { appState } from './app-state.js';

const HANDLE_SIZE = 9;
const MIN_SIZE = 8;
const BLEND_MODES = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiply'],
  ['screen', 'Screen'],
  ['overlay', 'Overlay'],
  ['darken', 'Darken'],
  ['lighten', 'Lighten'],
];

const TYPE_GLYPH = { brush: '✎', shape: '▭', text: 'T', image: '🖼' };
const TYPE_LABEL = { brush: 'Brush', shape: 'Shape', text: 'Text', image: 'Image' };

export { BLEND_MODES, TYPE_GLYPH, TYPE_LABEL };

export class ObjectManager {
  constructor(canvas, showToast) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showToast = showToast;
    this.objects = [];
    this.selectedId = null;
    this.mode = null;          // 'move' | 'resize' | 'rotate' | 'draw'
    this.drag = null;
    this.hoverHandle = null;
    this.angleReadout = null;
    this.onChange = null;
    this.onSelectionChange = null;
    this.counters = { brush: 0, shape: 0, text: 0, image: 0 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerEnd(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerEnd(e));
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    document.addEventListener('keydown', (e) => {
      if (!this.selected) return;
      const target = e.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); }
      if (e.key === 'ArrowLeft') { this.selected.x -= e.shiftKey ? 10 : 1; this.changed(); }
      if (e.key === 'ArrowRight') { this.selected.x += e.shiftKey ? 10 : 1; this.changed(); }
      if (e.key === 'ArrowUp') { this.selected.y -= e.shiftKey ? 10 : 1; this.changed(); }
      if (e.key === 'ArrowDown') { this.selected.y += e.shiftKey ? 10 : 1; this.changed(); }
    });
  }

  /* ---------- model ---------- */

  get selected() { return this.objects.find((o) => o.id === this.selectedId) || null; }

  nextName(type) { this.counters[type] += 1; return `${TYPE_LABEL[type]} ${this.counters[type]}`; }

  addObject(object) {
    this.objects.push(object);
    this.select(object.id);
    this.changed();
    return object;
  }

  select(id) {
    this.selectedId = id;
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(id);
  }

  changed() { this.render(); if (this.onChange) this.onChange(); }

  serializeLayers() {
    return this.objects.map((object) => {
      const copy = { ...object };
      delete copy.img;
      return copy;
    });
  }

  async loadLayers(layers = []) {
    const hydrated = await Promise.all(layers.map(async (layer) => {
      const copy = { ...layer };
      if (copy.type === 'image' && copy.src) {
        copy.img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Could not load layer ${copy.name || copy.id}`));
          image.src = copy.src;
        });
      }
      return copy;
    }));
    this.objects = hydrated;
    this.selectedId = null;
    this.counters = { brush: 0, shape: 0, text: 0, image: 0 };
    hydrated.forEach((layer) => {
      if (this.counters[layer.type] !== undefined) this.counters[layer.type] += 1;
    });
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(null);
  }

  getObject(id) { return this.objects.find((o) => o.id === id) || null; }

  reorder(id, targetId, below) {
    const from = this.objects.findIndex((o) => o.id === id);
    if (from < 0) return;
    const [item] = this.objects.splice(from, 1);
    let to = this.objects.findIndex((o) => o.id === targetId);
    if (to < 0) { this.objects.splice(from, 0, item); return; }
    this.objects.splice(below ? to : to + 1, 0, item);
    this.changed();
  }

  bringToFront(id) { this.moveToEdge(id, this.objects.length - 1); }
  sendToBack(id) { this.moveToEdge(id, 0); }

  moveToEdge(id, index) {
    const from = this.objects.findIndex((o) => o.id === id);
    if (from < 0 || from === index) return;
    const [item] = this.objects.splice(from, 1);
    this.objects.splice(index, 0, item);
    this.changed();
  }

  duplicate(id) {
    const source = this.getObject(id);
    if (!source || source.locked) return;
    const clone = { ...source, id: 'o' + Math.random().toString(36).slice(2, 9), name: source.name + ' copy', x: source.x + 16, y: source.y + 16 };
    if (source.points) clone.points = source.points.map((p) => [...p]);
    this.addObject(clone);
    this.showToast(`${source.name} duplicated`);
  }

  deleteSelected() {
    const selected = this.selected;
    if (!selected || selected.locked) return;
    this.objects = this.objects.filter((o) => o.id !== selected.id);
    this.selectedId = null;
    this.changed();
    if (this.onSelectionChange) this.onSelectionChange(null);
    this.showToast(`${selected.name} deleted`);
  }

  rename(id, name) {
    const object = this.getObject(id);
    if (!object || !name.trim()) return;
    object.name = name.trim();
    this.changed();
  }

  toggleVisibility(id) {
    const object = this.getObject(id);
    if (!object) return;
    object.visible = !object.visible;
    if (!object.visible && this.selectedId === id) this.select(null);
    this.changed();
  }

  toggleLock(id) {
    const object = this.getObject(id);
    if (!object) return;
    object.locked = !object.locked;
    this.changed();
  }

  /* ---------- creation ---------- */

  addShape(type, start, end) {
    const color = document.querySelector('#drawing-color')?.value || '#d95687';
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.max(MIN_SIZE, Math.abs(end.x - start.x));
    const h = Math.max(MIN_SIZE, Math.abs(end.y - start.y));
    return this.addObject({
      id: 'o' + Math.random().toString(36).slice(2, 9), type: 'shape', name: this.nextName('shape'),
      shape: type, x, y, w, h, rotation: 0, opacity: 1, blend: 'source-over',
      visible: true, locked: false, fillOn: true, fill: color + '33', stroke: color, strokeWidth: 3,
    });
  }

  addText(point) {
    const text = window.prompt('Text to add');
    if (!text || !text.trim()) return;
    const color = document.querySelector('#drawing-color')?.value || '#d95687';
    const size = 26;
    const rtl = /[\u0590-\u05FF\u0600-\u06FF]/.test(text);
    const width = this.measureText(text, size) + 12;
    return this.addObject({
      id: 'o' + Math.random().toString(36).slice(2, 9), type: 'text', name: this.nextName('text'),
      text: text.trim(), fontSize: size, color, rtl,
      x: point.x, y: point.y - size / 2, w: width, h: size * 1.4, rotation: 0, opacity: 1,
      blend: 'source-over', visible: true, locked: false,
    });
  }

  editText(id) {
    const object = this.getObject(id);
    if (!object || object.type !== 'text') return;
    const text = window.prompt('Edit text', object.text);
    if (text === null || !text.trim()) return;
    object.text = text.trim();
    object.rtl = /[\u0590-\u05FF\u0600-\u06FF]/.test(object.text);
    object.w = this.measureText(object.text, object.fontSize) + 12;
    this.changed();
  }

  measureText(text, size) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `600 ${size}px Inter, "Segoe UI", Tahoma, sans-serif`;
    return ctx.measureText(text).width;
  }

  startBrush(point) {
    const color = document.querySelector('#drawing-color')?.value || '#d95687';
    const width = Number(document.querySelector('#brush-size')?.value || 8);
    this.drawing = {
      id: 'o' + Math.random().toString(36).slice(2, 9), type: 'brush', name: this.nextName('brush'),
      color, strokeWidth: width, points: [[point.x, point.y]],
      rotation: 0, opacity: 1, blend: appState.activeTool === 'eraser' ? 'destination-out' : 'source-over',
      visible: true, locked: false,
    };
  }

  extendBrush(point) {
    if (!this.drawing) return;
    const last = this.drawing.points[this.drawing.points.length - 1];
    if (Math.hypot(point.x - last[0], point.y - last[1]) < 1.5) return;
    this.drawing.points.push([point.x, point.y]);
    this.normalizeBrush(this.drawing);
    this.render();
  }

  endBrush() {
    if (!this.drawing) return;
    if (this.drawing.points.length < 2) this.drawing.points.push([this.drawing.points[0][0] + 1, this.drawing.points[0][1] + 1]);
    const stroke = this.drawing;
    this.drawing = null;
    this.normalizeBrush(stroke);
    this.objects.push(stroke);
    this.select(stroke.id);
    this.changed();
  }

  normalizeBrush(stroke) {
    const xs = stroke.points.map((p) => p[0]);
    const ys = stroke.points.map((p) => p[1]);
    const pad = stroke.strokeWidth / 2 + 2;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    stroke.x = minX;
    stroke.y = minY;
    stroke.w = Math.max(MIN_SIZE, maxX - minX);
    stroke.h = Math.max(MIN_SIZE, maxY - minY);
    const cx = stroke.x + stroke.w / 2;
    const cy = stroke.y + stroke.h / 2;
    stroke.pointsRel = stroke.points.map(([px, py]) => [px - cx, py - cy]);
  }

  addImageLayer(img, name) {
    const zone = this.canvas.getBoundingClientRect();
    const scale = Math.min((zone.width * 0.6) / img.naturalWidth, (zone.height * 0.6) / img.naturalHeight, 1);
    const w = Math.max(MIN_SIZE, Math.round(img.naturalWidth * scale));
    const h = Math.max(MIN_SIZE, Math.round(img.naturalHeight * scale));
    const x = (zone.width - w) / 2 + (this.objects.length % 5) * 14;
    const y = (zone.height - h) / 2 + (this.objects.length % 5) * 14;
    this.addObject({
      id: 'o' + Math.random().toString(36).slice(2, 9), type: 'image', name: this.nextName('image'),
      img, src: img.src, x, y, w, h, rotation: 0, opacity: 1, blend: 'source-over',
      visible: true, locked: false,
    });
    this.showToast(`${name} added as a layer`);
  }

  /* ---------- geometry ---------- */

  centerOf(o) { return { x: o.x + o.w / 2, y: o.y + o.h / 2 }; }

  toLocal(o, px, py) {
    const c = this.centerOf(o);
    const rad = -o.rotation * Math.PI / 180;
    const dx = px - c.x;
    const dy = py - c.y;
    return { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
  }

  rotateOffset(o, lx, ly) {
    const rad = o.rotation * Math.PI / 180;
    return { x: lx * Math.cos(rad) - ly * Math.sin(rad), y: lx * Math.sin(rad) + ly * Math.cos(rad) };
  }

  hitObject(px, py) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (!o.visible || o.locked) continue;
      const local = this.toLocal(o, px, py);
      if (Math.abs(local.x) <= o.w / 2 + 2 && Math.abs(local.y) <= o.h / 2 + 2) return o;
    }
    return null;
  }

  handles(o) {
    if (!o) return [];
    const signs = [[-1, -1, 'nw'], [0, -1, 'n'], [1, -1, 'ne'], [1, 0, 'e'], [1, 1, 'se'], [0, 1, 's'], [-1, 1, 'sw'], [-1, 0, 'w']];
    return signs.map(([sx, sy, key]) => {
      const local = { x: (sx * o.w) / 2, y: (sy * o.h) / 2 };
      const screen = this.rotateOffset(o, local.x, local.y);
      const c = this.centerOf(o);
      return { key, sx, sy, x: c.x + screen.x, y: c.y + screen.y };
    });
  }

  rotateHandle(o) {
    const c = this.centerOf(o);
    const top = this.rotateOffset(o, 0, -o.h / 2 - 24);
    return { x: c.x + top.x, y: c.y + top.y };
  }

  hitHandle(px, py) {
    const o = this.selected;
    if (!o || o.locked) return null;
    const rot = this.rotateHandle(o);
    if (Math.hypot(px - rot.x, py - rot.y) <= HANDLE_SIZE) return { key: 'rotate' };
    for (const h of this.handles(o)) {
      if (Math.abs(px - h.x) <= HANDLE_SIZE && Math.abs(py - h.y) <= HANDLE_SIZE) return h;
    }
    return null;
  }

  /* ---------- interaction ---------- */

  setInteractive(active) { this.canvas.style.pointerEvents = active ? 'auto' : 'none'; }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    const point = this.point(event);
    if (this.pickMode) {
      if (this.onPick) this.onPick(point);
      return;
    }
    const tool = appState.activeTool;

    if (tool === 'brush' || tool === 'eraser') {
      this.startBrush(point);
      this.mode = 'draw';
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'shape') {
      this.shapeStart = point;
      this.mode = 'shape-draw';
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'text') {
      this.addText(point);
      return;
    }
    if (tool !== 'select' && tool !== 'move') return;

    const handle = this.hitHandle(point.x, point.y);
    if (handle) {
      const o = this.selected;
      this.mode = handle.key === 'rotate' ? 'rotate' : 'resize';
      const c = this.centerOf(o);
      const anchor = handle.key === 'rotate' ? null : { sx: -handle.sx, sy: -handle.sy };
      this.drag = {
        id: o.id,
        start: point,
        startAngle: Math.atan2(point.y - c.y, point.x - c.x) * 180 / Math.PI + 90,
        startRotation: o.rotation,
        startW: o.w, startH: o.h, startX: o.x, startY: o.y, startStrokeWidth: o.strokeWidth,
        handle,
        anchor,
        anchorScreen: anchor ? (() => {
          const a = { x: (anchor.sx * o.w) / 2, y: (anchor.sy * o.h) / 2 };
          const r = this.rotateOffset(o, a.x, a.y);
          return { x: c.x + r.x, y: c.y + r.y };
        })() : null,
      };
      this.canvas.setPointerCapture(event.pointerId);
      return;
    }

    const hit = this.hitObject(point.x, point.y);
    if (hit) {
      this.mode = 'move';
      this.select(hit.id);
      this.drag = { id: hit.id, start: point, startX: hit.x, startY: hit.y };
      this.canvas.setPointerCapture(event.pointerId);
    } else if (this.selectedId) {
      this.select(null);
    }
  }

  onPointerMove(event) {
    const point = this.point(event);

    if (this.mode === 'draw') { this.extendBrush(point); return; }
    if (this.mode === 'shape-draw') { this.shapeCurrent = point; this.render(); return; }

    if (!this.drag) {
      this.updateCursor(point);
      return;
    }
    const o = this.getObject(this.drag.id);
    if (!o) return;

    if (this.mode === 'move') {
      o.x = this.drag.startX + point.x - this.drag.start.x;
      o.y = this.drag.startY + point.y - this.drag.start.y;
    } else if (this.mode === 'rotate') {
      const c = this.centerOf(o);
      const angle = Math.atan2(point.y - c.y, point.x - c.x) * 180 / Math.PI + 90;
      let rotation = this.drag.startRotation + (angle - this.drag.startAngle);
      rotation = ((rotation % 360) + 360) % 360;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      o.rotation = Math.round(rotation * 10) / 10;
      this.angleReadout = `${o.rotation}°`;
    } else if (this.mode === 'resize') {
      this.applyResize(o, point, event.shiftKey);
    }
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(this.selectedId);
  }

  applyResize(o, point, keepRatio) {
    const { handle, anchor } = this.drag;
    const startCenter = { x: this.drag.startX + this.drag.startW / 2, y: this.drag.startY + this.drag.startH / 2 };
    const rad = -o.rotation * Math.PI / 180;
    const dx = point.x - startCenter.x;
    const dy = point.y - startCenter.y;
    const local = { x: dx * Math.cos(rad) - dy * Math.sin(rad), y: dx * Math.sin(rad) + dy * Math.cos(rad) };
    const anchorStart = { x: (anchor.sx * this.drag.startW) / 2, y: (anchor.sy * this.drag.startH) / 2 };
    let newW = this.drag.startW;
    let newH = this.drag.startH;
    if (handle.sx !== 0) newW = Math.max(MIN_SIZE, Math.abs(local.x - anchorStart.x));
    if (handle.sy !== 0) newH = Math.max(MIN_SIZE, Math.abs(local.y - anchorStart.y));
    if (keepRatio && handle.sx !== 0 && handle.sy !== 0) {
      const ratio = this.drag.startH / this.drag.startW;
      if (newW / this.drag.startW > newH / this.drag.startH) newH = Math.max(MIN_SIZE, newW * ratio);
      else newW = Math.max(MIN_SIZE, newH / ratio);
    }
    o.w = Math.round(newW);
    o.h = Math.round(newH);
    const anchorNew = { x: (anchor.sx * o.w) / 2, y: (anchor.sy * o.h) / 2 };
    const anchorRotated = this.rotateOffset(o, anchorNew.x, anchorNew.y);
    o.x = Math.round(this.drag.anchorScreen.x - anchorRotated.x - o.w / 2);
    o.y = Math.round(this.drag.anchorScreen.y - anchorRotated.y - o.h / 2);
    if (o.type === 'brush' && o.pointsRel && this.drag.startW && this.drag.startH) {
      const kx = o.w / this.drag.startW;
      const ky = o.h / this.drag.startH;
      o.pointsRel = o.pointsRel.map(([px, py]) => [px * kx, py * ky]);
      o.strokeWidth = Math.max(1, Math.round((this.drag.startStrokeWidth || o.strokeWidth) * ((kx + ky) / 2)));
    }
  }

  onPointerEnd(event) {
    if (this.mode === 'draw') { this.endBrush(); }
    else if (this.mode === 'shape-draw' && this.shapeStart && this.shapeCurrent) {
      const shapeType = document.querySelector('#shape-type')?.value || 'rect';
      this.addShape(shapeType, this.shapeStart, this.shapeCurrent);
    }
    else if (this.drag) { this.drag = null; }
    this.mode = null;
    this.shapeStart = null;
    this.shapeCurrent = null;
    this.angleReadout = null;
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(this.selectedId);
  }

  updateCursor(point) {
    const tool = appState.activeTool;
    if (tool === 'brush' || tool === 'eraser' || tool === 'shape' || tool === 'text') { this.canvas.style.cursor = 'crosshair'; return; }
    const handle = this.hitHandle(point.x, point.y);
    if (handle) {
      const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rotate: 'grab' };
      this.canvas.style.cursor = cursors[handle.key] || 'default';
      return;
    }
    this.canvas.style.cursor = this.hitObject(point.x, point.y) ? 'move' : 'default';
  }

  onDoubleClick(event) {
    const point = this.point(event);
    const hit = this.hitObject(point.x, point.y);
    if (hit && hit.type === 'text') this.editText(hit.id);
  }

  /* ---------- rendering ---------- */

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, rect.width * ratio);
    this.canvas.height = Math.max(1, rect.height * ratio);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.render();
  }

  activeShapeType(type) { const select = document.querySelector('#shape-type'); if (select) select.value = type; }

  render() {
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    for (const o of this.objects) {
      if (!o.visible) continue;
      this.drawObject(o);
    }
    if (this.drawing) this.drawBrushStroke(this.drawing);
    if (this.shapeStart && this.shapeCurrent) this.drawShapePreview();
    const selected = this.selected;
    if (selected && ['select', 'move'].includes(appState.activeTool) && !this.drawing) this.drawSelection(selected);
  }

  drawObject(o) {
    const ctx = this.ctx;
    const c = this.centerOf(o);
    ctx.save();
    ctx.globalAlpha = o.opacity;
    ctx.globalCompositeOperation = o.blend || 'source-over';
    ctx.translate(c.x, c.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    if (o.type === 'brush') this.drawBrushStroke({ ...o, points: o.pointsRel });
    else if (o.type === 'image') ctx.drawImage(o.img, -o.w / 2, -o.h / 2, o.w, o.h);
    else if (o.type === 'text') {
      ctx.font = `600 ${o.fontSize}px Inter, "Segoe UI", Tahoma, sans-serif`;
      ctx.fillStyle = o.color;
      ctx.textBaseline = 'middle';
      if (o.rtl) { ctx.direction = 'rtl'; ctx.fillText(o.text, o.w / 2 - 6, 0); }
      else ctx.fillText(o.text, -o.w / 2 + 6, 0);
    } else if (o.type === 'shape') this.drawShape(ctx, o);
    ctx.restore();
  }

  renderExport(ctx, imageRect, outputWidth, outputHeight) {
    const scaleX = outputWidth / imageRect.width;
    const scaleY = outputHeight / imageRect.height;
    for (const object of this.objects) {
      if (!object.visible) continue;
      const center = this.centerOf(object);
      ctx.save();
      ctx.globalAlpha = object.opacity;
      ctx.globalCompositeOperation = object.blend || 'source-over';
      ctx.translate((center.x - imageRect.x) * scaleX, (center.y - imageRect.y) * scaleY);
      ctx.rotate((object.rotation * Math.PI) / 180);
      ctx.scale(scaleX, scaleY);
      if (object.type === 'image') {
        ctx.drawImage(object.img, -object.w / 2, -object.h / 2, object.w, object.h);
      } else if (object.type === 'text') {
        ctx.font = `600 ${object.fontSize}px Inter, "Segoe UI", Tahoma, sans-serif`;
        ctx.fillStyle = object.color;
        ctx.textBaseline = 'middle';
        if (object.rtl) { ctx.direction = 'rtl'; ctx.fillText(object.text, object.w / 2 - 6, 0); }
        else ctx.fillText(object.text, -object.w / 2 + 6, 0);
      } else if (object.type === 'shape') {
        this.drawShape(ctx, object);
      } else if (object.type === 'brush') {
        ctx.strokeStyle = object.color;
        ctx.lineWidth = object.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        (object.pointsRel || []).forEach(([x, y], index) => {
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawBrushStroke(stroke) {
    const ctx = this.ctx;
    const c = stroke.x !== undefined ? this.centerOf(stroke) : { x: 0, y: 0 };
    const points = stroke.pointsRel || stroke.points;
    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.globalCompositeOperation = stroke.blend || 'source-over';
    ctx.translate(c.x, c.y);
    ctx.rotate(((stroke.rotation || 0) * Math.PI) / 180);
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();
    ctx.restore();
  }

  drawShape(ctx, o) {
    const half = { x: o.w / 2, y: o.h / 2 };
    ctx.lineWidth = o.strokeWidth;
    ctx.strokeStyle = o.stroke;
    ctx.fillStyle = o.fill;
    ctx.beginPath();
    if (o.shape === 'ellipse') ctx.ellipse(0, 0, half.x, half.y, 0, 0, Math.PI * 2);
    else if (o.shape === 'line') { ctx.moveTo(-half.x, half.y); ctx.lineTo(half.x, -half.y); }
    else if (o.shape === 'arrow') {
      ctx.moveTo(-half.x, half.y);
      ctx.lineTo(half.x, -half.y);
      const head = Math.min(18, o.w / 4);
      const angle = Math.atan2(-o.h, o.w);
      ctx.moveTo(half.x, -half.y);
      ctx.lineTo(half.x - head * Math.cos(angle - 0.5), -half.y - head * Math.sin(angle - 0.5));
      ctx.moveTo(half.x, -half.y);
      ctx.lineTo(half.x - head * Math.cos(angle + 0.5), -half.y - head * Math.sin(angle + 0.5));
    } else ctx.rect(-half.x, -half.y, o.w, o.h);
    if (o.fillOn && o.shape !== 'line' && o.shape !== 'arrow') ctx.fill();
    ctx.stroke();
  }

  drawShapePreview() {
    const ctx = this.ctx;
    const a = this.shapeStart;
    const b = this.shapeCurrent;
    const color = document.querySelector('#drawing-color')?.value || '#d95687';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.restore();
  }

  drawSelection(o) {
    const ctx = this.ctx;
    const c = this.centerOf(o);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    ctx.strokeStyle = '#d95687';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-o.w / 2 - 2, -o.h / 2 - 2, o.w + 4, o.h + 4);
    ctx.setLineDash([]);
    if (!o.locked) {
      ctx.fillStyle = '#ffffff';
      for (const h of this.handles(o)) {
        const lx = h.sx * (o.w / 2 + 2);
        const ly = h.sy * (o.h / 2 + 2);
        ctx.fillRect(lx - 4.5, ly - 4.5, 9, 9);
        ctx.strokeRect(lx - 4.5, ly - 4.5, 9, 9);
      }
      const rot = { x: 0, y: -o.h / 2 - 24 };
      ctx.beginPath();
      ctx.moveTo(0, -o.h / 2 - 2);
      ctx.lineTo(rot.x, rot.y + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rot.x, rot.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    if (this.angleReadout) {
      const rot = this.rotateHandle(o);
      ctx.save();
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = '#d95687';
      ctx.fillText(this.angleReadout, rot.x + 12, rot.y);
      ctx.restore();
    }
  }
}

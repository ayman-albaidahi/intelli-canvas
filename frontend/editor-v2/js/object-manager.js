import { appState } from './app-state.js';
import {
  centerOf,
  handles,
  hitObject,
  normalizeStrokeBox,
  resizeObjectFromDrag,
  rotateHandle,
  rotateOffset,
  toLocal,
} from './object-geometry.js';
import { DEFAULT_ACCENT, themeColor } from './theme-colors.js';
import {
  drawBrushStroke,
  drawObject,
  drawSelection,
  drawShapePreview,
  renderExport as renderExportDrawing,
} from './object-drawing.js';
import { openDialog, closeDialog, confirmDialog } from './ui-manager.js';

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

function drawingControl(tool, name) {
  const prefix = tool === 'eraser' ? 'eraser' : 'brush';
  return document.querySelector(`#${prefix}-${name}`);
}

export { BLEND_MODES, TYPE_GLYPH, TYPE_LABEL };

export class ObjectManager {
  constructor(canvas, showToast, canvasManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showToast = showToast;
    this.canvasManager = canvasManager || null;
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
    this.canvas.addEventListener('pointercancel', (e) => this.onPointerCancel(e));
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    // The text popover's own cancel buttons close it through the shared
    // closer so focus still returns to whatever opened it.
    document.querySelector('#text-popover-cancel')?.addEventListener('click', () => {
      closeDialog(document.querySelector('#text-popover'));
    });
    document.querySelector('#text-popover-cancel-secondary')?.addEventListener('click', () => {
      closeDialog(document.querySelector('#text-popover'));
    });
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

  applyPersistedLayers(layers = []) {
    const persisted = new Map(layers.map((layer) => [layer.id, layer]));
    this.objects.forEach((object) => {
      const saved = persisted.get(object.id);
      if (saved?.src && object.type === 'image') {
        object.src = saved.src;
        object.asset_id = saved.asset_id;
      }
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
      // Brush points are already stored in image coordinates — converting them
      // again here would shift every saved stroke on reload. Only the bounding
      // box needs recomputing, since the stored box was normalised at save time
      // and the points are the source of truth.
      if (layer.type === 'brush' && layer.points && layer.points.length) {
        normalizeStrokeBox(layer);
      }
    });
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(null);
  }

  getObject(id) { return this.objects.find((o) => o.id === id) || null; }

  reorder(id, targetId, below) {
    const from = this.objects.findIndex((o) => o.id === id);
    if (from < 0) return;
    const [item] = this.objects.splice(from, 1);
    const to = this.objects.findIndex((o) => o.id === targetId);
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

  async deleteSelected() {
    const selected = this.selected;
    if (!selected || selected.locked) return;
    // Deleting a layer is not undoable — history only tracks Python
    // operations — so the user gets a confirm dialog instead of an instant,
    // silent removal.
    const confirmed = await confirmDialog({
      title: `Delete ${selected.name}?`,
      body: 'This layer cannot be recovered. Undo does not cover canvas objects.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
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
    const color = document.querySelector('#drawing-color')?.value || themeColor('--accent', DEFAULT_ACCENT);
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

  // The text tool used to use window.prompt: it is unstyleable, blocks the
  // whole page, cannot be dismissed cleanly by automation, and returns null
  // for a cancelled dialog, which is indistinguishable from empty input. The
  // inline popover is a real focus-managed dialog instead.
  openTextPopover({ title = 'Add text', value = '', submitLabel = 'Add text', onSubmit } = {}) {
    const popover = document.querySelector('#text-popover');
    const heading = popover?.querySelector('#text-popover-heading');
    const input = popover?.querySelector('#text-popover-input');
    const submit = popover?.querySelector('#text-popover-submit');
    if (!popover || !input) return;
    heading.textContent = title;
    submit.textContent = submitLabel;
    input.value = value;
    // The handler is rebound on every open so an edit after an add cannot
    // carry the previous callback forward.
    popover.onsubmit = (event) => {
      event.preventDefault();
      const text = input.value;
      if (!text.trim()) return;
      onSubmit?.(text.trim());
      closeDialog(popover);
    };
    // The popover opens from a pointerdown handler on the canvas, and the
    // browser's focus settlement for that click lands on the canvas element
    // after the dialog is already open — stealing focus from the input.
    // Deferring to the next macrotask lets the click finish first, so the
    // focus move into the dialog is the last one that happens.
    const popoverRef = popover;
    setTimeout(() => openDialog(popoverRef, { focus: '#text-popover-input' }), 0);
  }

  addText(point) {
    const color = document.querySelector('#drawing-color')?.value || themeColor('--accent', DEFAULT_ACCENT);
    const size = 26;
    this.openTextPopover({
      onSubmit: (text) => {
        const rtl = /[\u0590-\u05FF\u0600-\u06FF]/.test(text);
        const width = this.measureText(text, size) + 12;
        this.addObject({
          id: 'o' + Math.random().toString(36).slice(2, 9), type: 'text', name: this.nextName('text'),
          text, fontSize: size, color, rtl,
          x: point.x, y: point.y - size / 2, w: width, h: size * 1.4, rotation: 0, opacity: 1,
          blend: 'source-over', visible: true, locked: false,
        });
      },
    });
  }

  editText(id) {
    const object = this.getObject(id);
    if (!object || object.type !== 'text') return;
    this.openTextPopover({
      title: 'Edit text',
      value: object.text,
      submitLabel: 'Save',
      onSubmit: (text) => {
        object.text = text;
        object.rtl = /[\u0590-\u05FF\u0600-\u06FF]/.test(object.text);
        object.w = this.measureText(object.text, object.fontSize) + 12;
        this.changed();
      },
    });
  }

  measureText(text, size) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `600 ${size}px Inter, "Segoe UI", Tahoma, sans-serif`;
    return ctx.measureText(text).width;
  }

  startBrush(point) {
    const tool = appState.activeTool === 'eraser' ? 'eraser' : 'brush';
    const color = document.querySelector('#drawing-color')?.value || themeColor('--accent', DEFAULT_ACCENT);
    const width = Number(drawingControl(tool, 'size')?.value || 8);
    const opacity = Number(drawingControl(tool, 'opacity')?.value ?? 100) / 100;
    const ip = this._screenToImage(point.x, point.y);
    this.drawing = {
      id: 'o' + Math.random().toString(36).slice(2, 9), type: 'brush', name: this.nextName('brush'),
      color, strokeWidth: width, points: [[ip.x, ip.y]],
      rotation: 0, opacity,
      // The eraser is an erasing brush, not a new blend mode: it is stored with
      // a supported blend so the backend accepts the layer, and flagged so the
      // renderer punches a hole through the layers below it instead of painting
      // over them. Sending "destination-out" as the stored blend is rejected by
      // the API with "Layer blend mode is not supported".
      blend: 'source-over',
      erasing: appState.activeTool === 'eraser',
      visible: true, locked: false,
    };
  }

  extendBrush(point) {
    if (!this.drawing) return;
    const last = this.drawing.points[this.drawing.points.length - 1];
    const ip = this._screenToImage(point.x, point.y);
    if (Math.hypot(ip.x - last[0], ip.y - last[1]) < 1.5) return;
    this.drawing.points.push([ip.x, ip.y]);
    normalizeStrokeBox(this.drawing);
    this.render();
  }

  endBrush() {
    if (!this.drawing) return;
    if (this.drawing.points.length < 2) this.drawing.points.push([this.drawing.points[0][0] + 1, this.drawing.points[0][1] + 1]);
    const stroke = this.drawing;
    this.drawing = null;
    normalizeStrokeBox(stroke);
    this.objects.push(stroke);
    this.select(stroke.id);
    this.changed();
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

  // The pure coordinate math lives in object-geometry.js so it can be tested
  // without a canvas; these forward to it to keep the existing call sites.

  centerOf(o) { return centerOf(o); }

  // Screen pixels -> image pixels. The image coordinate origin is the centre
  // of the document, so after undoing the pan, rotation and scale the result
  // is re-centred by half the document size — this is the same convention
  // canvas-manager.sampleImagePixel() uses, and the two must agree or a brush
  // stroke lands half a document away from the cursor.
  _screenToImage(px, py) {
    if (!this.canvasManager || !this.canvasManager.hasImage()) return { x: px, y: py };
    const cm = this.canvasManager;
    const dx = px - cm.offset.x;
    const dy = py - cm.offset.y;
    const rad = -cm.rotation * Math.PI / 180;
    return {
      x: (dx * Math.cos(rad) - dy * Math.sin(rad)) / cm.scale / (cm.flipX || 1)
        + cm.documentSize.width / 2,
      y: (dx * Math.sin(rad) + dy * Math.cos(rad)) / cm.scale / (cm.flipY || 1)
        + cm.documentSize.height / 2,
    };
  }

  // Exact inverse of _screenToImage, used to place stored strokes back on
  // screen at render time.
  _imageToScreen(ix, iy) {
    if (!this.canvasManager || !this.canvasManager.hasImage()) return { x: ix, y: iy };
    const cm = this.canvasManager;
    const rot = cm.rotation * Math.PI / 180;
    const sx = (ix - cm.documentSize.width / 2) * cm.scale * (cm.flipX || 1);
    const sy = (iy - cm.documentSize.height / 2) * cm.scale * (cm.flipY || 1);
    return {
      x: sx * Math.cos(rot) - sy * Math.sin(rot) + cm.offset.x,
      y: sx * Math.sin(rot) + sy * Math.cos(rot) + cm.offset.y,
    };
  }

  toLocal(o, px, py) { return toLocal(o, px, py); }

  rotateOffset(o, lx, ly) { return rotateOffset(o, lx, ly); }

  hitObject(px, py) { return hitObject(this.objects, px, py); }

  handles(o) { return handles(o); }

  rotateHandle(o) { return rotateHandle(o); }

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
      resizeObjectFromDrag(o, this.drag, point, event.shiftKey, MIN_SIZE);
    }
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(this.selectedId);
  }

  // A pointercancel is the browser saying the gesture was interrupted (a
  // system gesture, a window blur, a tablet lift). It is not a completed
  // stroke, so the in-flight brush is dropped instead of being committed as a
  // partial layer — otherwise a cancelled drag leaves a fragment behind.
  onPointerCancel(_event) {
    if (this.mode === 'draw') {
      this.drawing = null;
      this.render();
    } else if (this.drag) {
      this.drag = null;
    }
    this.mode = null;
    this.shapeStart = null;
    this.shapeCurrent = null;
    this.angleReadout = null;
    this.render();
    if (this.onSelectionChange) this.onSelectionChange(this.selectedId);
  }

  onPointerEnd(_event) {
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

  // The geometry helpers the drawing module needs: the object-space helpers
  // from object-geometry plus this canvas's image-to-screen projection.
  drawingGeometry() {
    return {
      centerOf: (o) => this.centerOf(o),
      imageToScreen: (ix, iy) => this._imageToScreen(ix, iy),
      handles: (o) => this.handles(o),
      rotateHandle: (o) => this.rotateHandle(o),
    };
  }

  render() {
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    this.ctx.clearRect(0, 0, bounds.width, bounds.height);
    const geo = this.drawingGeometry();
    for (const o of this.objects) {
      if (!o.visible) continue;
      drawObject(this.ctx, o, geo);
    }
    if (this.drawing) drawBrushStroke(this.ctx, this.drawing, geo);
    if (this.shapeStart && this.shapeCurrent) {
      const color = document.querySelector('#drawing-color')?.value || themeColor('--accent', DEFAULT_ACCENT);
      drawShapePreview(this.ctx, this.shapeStart, this.shapeCurrent, color);
    }
    const selected = this.selected;
    if (selected && ['select', 'move'].includes(appState.activeTool) && !this.drawing) {
      drawSelection(this.ctx, selected, geo, this.angleReadout);
    }
  }

  renderExport(ctx, imageRect, outputWidth, outputHeight) {
    renderExportDrawing(ctx, this.objects, imageRect, outputWidth, outputHeight, this.drawingGeometry());
  }
}

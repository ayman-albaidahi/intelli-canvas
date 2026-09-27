/**
 * Pointer interaction — the tool/drag/rotate/resize brush state machine.
 *
 * ObjectManager owned selection CRUD, creation, drawing and this pointer
 * machine together. The machine is its own concern: it translates raw
 * pointer events into mutations of the object list, and it keeps all of its
 * transient state (mode, drag, drawing, shape preview, angle readout) on the
 * manager so the renderer and serialisation can read it directly.
 *
 * The seam is `host` — the ObjectManager instance. The handlers call the
 * manager's own operations (select, addShape, addText, editText, hitObject,
 * render) rather than duplicating them, so behaviour is identical to when
 * this code lived inline; what moved is the location, and with it the
 * ability to unit-test the state machine in jsdom without a browser.
 *
 * Modes: 'draw' (brush/eraser stroke in flight), 'shape-draw' (rubber-banding
 * a new shape), 'move', 'resize', 'rotate'. Only one at a time; pointerend
 * and pointercancel both reset to null, but they differ on one point that
 * used to be a real bug: a cancelled gesture drops the in-flight stroke
 * instead of committing a fragment (see onPointerCancel).
 */

import { appState } from './app-state.js';
import { normalizeStrokeBox, resizeObjectFromDrag } from './object-geometry.js';
import { DEFAULT_ACCENT, themeColor } from './theme-colors.js';

const MIN_SIZE = 8;

function drawingControl(tool, name) {
  const prefix = tool === 'eraser' ? 'eraser' : 'brush';
  return document.querySelector(`#${prefix}-${name}`);
}

export class ObjectInteraction {
  /** @param {object} host the ObjectManager whose state and operations drive */
  constructor(host) {
    this.host = host;
  }

  point(event) {
    const rect = this.host.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onPointerDown(event) {
    const host = this.host;
    if (event.button !== 0) return;
    const point = this.point(event);
    if (host.pickMode) {
      if (host.onPick) host.onPick(point);
      return;
    }
    const tool = appState.activeTool;

    if (tool === 'brush' || tool === 'eraser') {
      this.startBrush(point);
      host.mode = 'draw';
      host.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'shape') {
      host.shapeStart = point;
      host.mode = 'shape-draw';
      host.canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === 'text') {
      host.addText(point);
      return;
    }
    if (tool !== 'select' && tool !== 'move') return;

    const handle = host.hitHandle(point.x, point.y);
    if (handle) {
      const o = host.selected;
      host.mode = handle.key === 'rotate' ? 'rotate' : 'resize';
      const c = host.centerOf(o);
      const anchor = handle.key === 'rotate' ? null : { sx: -handle.sx, sy: -handle.sy };
      host.drag = {
        id: o.id,
        start: point,
        startAngle: Math.atan2(point.y - c.y, point.x - c.x) * 180 / Math.PI + 90,
        startRotation: o.rotation,
        startW: o.w, startH: o.h, startX: o.x, startY: o.y, startStrokeWidth: o.strokeWidth,
        handle,
        anchor,
        anchorScreen: anchor ? (() => {
          const a = { x: (anchor.sx * o.w) / 2, y: (anchor.sy * o.h) / 2 };
          const r = host.rotateOffset(o, a.x, a.y);
          return { x: c.x + r.x, y: c.y + r.y };
        })() : null,
      };
      host.canvas.setPointerCapture(event.pointerId);
      return;
    }

    const hit = host.hitObject(point.x, point.y);
    if (hit) {
      host.mode = 'move';
      host.select(hit.id);
      host.drag = { id: hit.id, start: point, startX: hit.x, startY: hit.y };
      host.canvas.setPointerCapture(event.pointerId);
    } else if (host.selectedId) {
      host.select(null);
    }
  }

  onPointerMove(event) {
    const host = this.host;
    const point = this.point(event);

    if (host.mode === 'draw') { this.extendBrush(point); return; }
    if (host.mode === 'shape-draw') { host.shapeCurrent = point; host.render(); return; }

    if (!host.drag) {
      this.updateCursor(point);
      return;
    }
    const o = host.getObject(host.drag.id);
    if (!o) return;

    if (host.mode === 'move') {
      o.x = host.drag.startX + point.x - host.drag.start.x;
      o.y = host.drag.startY + point.y - host.drag.start.y;
    } else if (host.mode === 'rotate') {
      const c = host.centerOf(o);
      const angle = Math.atan2(point.y - c.y, point.x - c.x) * 180 / Math.PI + 90;
      let rotation = host.drag.startRotation + (angle - host.drag.startAngle);
      rotation = ((rotation % 360) + 360) % 360;
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      o.rotation = Math.round(rotation * 10) / 10;
      host.angleReadout = `${o.rotation}°`;
    } else if (host.mode === 'resize') {
      resizeObjectFromDrag(o, host.drag, point, event.shiftKey, MIN_SIZE);
    }
    host.render();
    if (host.onSelectionChange) host.onSelectionChange(host.selectedId);
  }

  // A pointercancel is the browser saying the gesture was interrupted (a
  // system gesture, a window blur, a tablet lift). It is not a completed
  // stroke, so the in-flight brush is dropped instead of being committed as a
  // partial layer — otherwise a cancelled drag leaves a fragment behind.
  onPointerCancel(_event) {
    const host = this.host;
    if (host.mode === 'draw') {
      host.drawing = null;
      host.render();
    } else if (host.drag) {
      host.drag = null;
    }
    host.mode = null;
    host.shapeStart = null;
    host.shapeCurrent = null;
    host.angleReadout = null;
    host.render();
    if (host.onSelectionChange) host.onSelectionChange(host.selectedId);
  }

  onPointerEnd(_event) {
    const host = this.host;
    if (host.mode === 'draw') { this.endBrush(); }
    else if (host.mode === 'shape-draw' && host.shapeStart && host.shapeCurrent) {
      const shapeType = document.querySelector('#shape-type')?.value || 'rect';
      host.addShape(shapeType, host.shapeStart, host.shapeCurrent);
    }
    else if (host.drag) { host.drag = null; }
    host.mode = null;
    host.shapeStart = null;
    host.shapeCurrent = null;
    host.angleReadout = null;
    host.render();
    if (host.onSelectionChange) host.onSelectionChange(host.selectedId);
  }

  updateCursor(point) {
    const host = this.host;
    const tool = appState.activeTool;
    if (tool === 'brush' || tool === 'eraser' || tool === 'shape' || tool === 'text') { host.canvas.style.cursor = 'crosshair'; return; }
    const handle = host.hitHandle(point.x, point.y);
    if (handle) {
      const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rotate: 'grab' };
      host.canvas.style.cursor = cursors[handle.key] || 'default';
      return;
    }
    host.canvas.style.cursor = host.hitObject(point.x, point.y) ? 'move' : 'default';
  }

  onDoubleClick(event) {
    const host = this.host;
    const point = this.point(event);
    const hit = host.hitObject(point.x, point.y);
    if (hit && hit.type === 'text') host.editText(hit.id);
  }

  /* ---------- brush stroke state machine ---------- */

  startBrush(point) {
    const host = this.host;
    const tool = appState.activeTool === 'eraser' ? 'eraser' : 'brush';
    const color = document.querySelector('#drawing-color')?.value || themeColor('--accent', DEFAULT_ACCENT);
    const width = Number(drawingControl(tool, 'size')?.value || 8);
    const opacity = Number(drawingControl(tool, 'opacity')?.value ?? 100) / 100;
    const ip = host._screenToImage(point.x, point.y);
    host.drawing = {
      id: 'o' + Math.random().toString(36).slice(2, 9), type: 'brush', name: host.nextName('brush'),
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
    const host = this.host;
    if (!host.drawing) return;
    const last = host.drawing.points[host.drawing.points.length - 1];
    const ip = host._screenToImage(point.x, point.y);
    if (Math.hypot(ip.x - last[0], ip.y - last[1]) < 1.5) return;
    host.drawing.points.push([ip.x, ip.y]);
    normalizeStrokeBox(host.drawing);
    host.render();
  }

  endBrush() {
    const host = this.host;
    if (!host.drawing) return;
    if (host.drawing.points.length < 2) host.drawing.points.push([host.drawing.points[0][0] + 1, host.drawing.points[0][1] + 1]);
    const stroke = host.drawing;
    host.drawing = null;
    normalizeStrokeBox(stroke);
    host.objects.push(stroke);
    host.select(stroke.id);
    host.changed();
  }
}

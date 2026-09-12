import { appState } from './app-state.js';

export class ObjectManager {
  constructor(canvas, layerManager, showToast) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.layerManager = layerManager; this.showToast = showToast; this.drawing = false; this.start = null; this.bind();
    window.addEventListener('resize', () => this.resize()); this.resize();
  }

  bind() {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!['brush', 'eraser', 'shape', 'text'].includes(appState.activeTool)) return;
      const point = this.point(event); this.configure(); this.drawing = true; this.start = point; this.ctx.beginPath(); this.ctx.moveTo(point.x, point.y); this.canvas.setPointerCapture(event.pointerId);
      if (appState.activeTool === 'text') { this.addText(point); this.drawing = false; }
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drawing || !['brush', 'eraser'].includes(appState.activeTool)) return;
      const point = this.point(event); this.ctx.lineTo(point.x, point.y); this.ctx.stroke();
    });
    this.canvas.addEventListener('pointerup', (event) => { if (!this.drawing) return; this.drawing = false; this.canvas.releasePointerCapture(event.pointerId); if (appState.activeTool === 'shape') this.addShape(this.start, this.point(event)); });
  }

  setInteractive(active) { this.canvas.style.pointerEvents = active ? 'auto' : 'none'; }

  resize() { const rect = this.canvas.parentElement.getBoundingClientRect(); const ratio = devicePixelRatio || 1; this.canvas.width = rect.width * ratio; this.canvas.height = rect.height * ratio; this.canvas.style.width = `${rect.width}px`; this.canvas.style.height = `${rect.height}px`; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round'; }
  point(event) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }

  configure() { this.ctx.strokeStyle = document.querySelector('#drawing-color')?.value || '#d95687'; this.ctx.lineWidth = Number(document.querySelector('#brush-size')?.value || 8); this.ctx.globalCompositeOperation = appState.activeTool === 'eraser' ? 'destination-out' : 'source-over'; }
  addShape(start, end) { this.configure(); this.ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y); this.layerManager.add('shape', 'Rectangle'); }
  addText(point) { const text = window.prompt('Text to add'); if (!text?.trim()) return; this.configure(); this.ctx.font = '600 22px Inter, sans-serif'; this.ctx.fillStyle = document.querySelector('#drawing-color')?.value || '#d95687'; this.ctx.fillText(text.trim(), point.x, point.y); this.layerManager.add('text', text.trim()); }
  pointerDownConfigure() { this.configure(); }
}

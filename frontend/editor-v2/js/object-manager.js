import { appState } from './app-state.js';

export class ObjectManager {
  constructor(canvas, layerManager, showToast) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.layerManager = layerManager; this.showToast = showToast; this.drawing = false; this.start = null; this.objects = []; this.selected = null; this.drag = null; this.bind();
    window.addEventListener('resize', () => this.resize()); this.resize();
  }

  bind() {
    this.canvas.addEventListener('pointerdown', (event) => {
      const point = this.point(event);
      if (appState.activeTool === 'select') { const hit = [...this.objects].reverse().find((item) => this.hit(item, point)); if (hit) { this.selected = hit; this.drag = { point, origin: { x: hit.x, y: hit.y } }; this.render(); } return; }
      if (!['brush', 'eraser', 'shape', 'text'].includes(appState.activeTool)) return;
      this.configure(); this.drawing = true; this.start = point; this.ctx.beginPath(); this.ctx.moveTo(point.x, point.y); this.canvas.setPointerCapture(event.pointerId);
      if (appState.activeTool === 'text') { this.addText(point); this.drawing = false; }
    });
    this.canvas.addEventListener('pointermove', (event) => {
      const point = this.point(event);
      if (this.drag && this.selected) { this.selected.x = this.drag.origin.x + point.x - this.drag.point.x; this.selected.y = this.drag.origin.y + point.y - this.drag.point.y; this.render(); return; }
      if (!this.drawing || !['brush', 'eraser'].includes(appState.activeTool)) return;
      this.ctx.lineTo(point.x, point.y); this.ctx.stroke();
    });
    this.canvas.addEventListener('pointerup', (event) => { if (this.drag) { this.drag = null; return; } if (!this.drawing) return; this.drawing = false; this.canvas.releasePointerCapture(event.pointerId); if (appState.activeTool === 'shape') this.addShape(this.start, this.point(event)); });
    document.addEventListener('keydown', (event) => { if ((event.key === 'Delete' || event.key === 'Backspace') && this.selected) { this.objects = this.objects.filter((item) => item !== this.selected); this.selected = null; this.render(); this.showToast('Object deleted'); } });
  }

  setInteractive(active) { this.canvas.style.pointerEvents = active ? 'auto' : 'none'; }
  resize() { const rect = this.canvas.parentElement.getBoundingClientRect(); const ratio = devicePixelRatio || 1; this.canvas.width = rect.width * ratio; this.canvas.height = rect.height * ratio; this.canvas.style.width = `${rect.width}px`; this.canvas.style.height = `${rect.height}px`; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round'; this.render(); }
  point(event) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  configure() { this.ctx.strokeStyle = document.querySelector('#drawing-color')?.value || '#d95687'; this.ctx.lineWidth = Number(document.querySelector('#brush-size')?.value || 8); this.ctx.globalCompositeOperation = appState.activeTool === 'eraser' ? 'destination-out' : 'source-over'; }
  hit(item, point) { return point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height; }
  addShape(start, end) { const item = { type: 'shape', x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y), color: document.querySelector('#drawing-color')?.value || '#d95687' }; this.objects.push(item); this.layerManager.add('shape', 'Rectangle'); this.render(); }
  addText(point) { const text = window.prompt('Text to add'); if (!text?.trim()) return; const item = { type: 'text', text: text.trim(), x: point.x, y: point.y, width: Math.max(80, text.length * 13), height: 28, color: document.querySelector('#drawing-color')?.value || '#d95687' }; this.objects.push(item); this.layerManager.add('text', text.trim()); this.render(); }
  render() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.ctx.globalCompositeOperation = 'source-over'; this.objects.forEach((item) => { this.ctx.strokeStyle = item.color; this.ctx.fillStyle = item.color; if (item.type === 'shape') this.ctx.strokeRect(item.x, item.y, item.width, item.height); else { this.ctx.font = '600 22px Inter, sans-serif'; this.ctx.fillText(item.text, item.x, item.y + 22); } if (item === this.selected) { this.ctx.setLineDash([5, 4]); this.ctx.strokeStyle = '#d95687'; this.ctx.strokeRect(item.x - 5, item.y - 5, item.width + 10, item.height + 10); this.ctx.setLineDash([]); } }); }
}

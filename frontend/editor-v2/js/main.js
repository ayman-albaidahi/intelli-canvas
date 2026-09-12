import { appState, setState } from './app-state.js';
import { initThemeManager } from './theme-manager.js';
import { initUI, showToast } from './ui-manager.js';
import { CanvasManager } from './canvas-manager.js';
import { bindTransformTools } from './transform-tools.js';
import { CropTool } from './crop-tool.js';
import { initResizeTool } from './resize-tool.js';

initThemeManager();
initUI();

const zoomValue = document.querySelector('#zoom-value');
const fileInput = document.querySelector('#file-input');
const emptyCanvas = document.querySelector('#empty-canvas');
const mockArtboard = document.querySelector('#mock-artboard');
const statusMessage = document.querySelector('#status-message');
const canvasManager = new CanvasManager(document.querySelector('#image-canvas'), document.querySelector('#canvas-card'));
bindTransformTools(canvasManager, showToast);
const cropTool = new CropTool(canvasManager, document.querySelector('#canvas-card'), showToast);
initResizeTool(canvasManager, showToast);
document.querySelector('#crop-overlay').addEventListener('pointerdown', (event) => cropTool.onPointerDown(event));
document.querySelector('#crop-overlay').addEventListener('pointermove', (event) => cropTool.onPointerMove(event));
document.querySelector('#crop-overlay').addEventListener('pointerup', () => cropTool.stopDrag());

for (const button of document.querySelectorAll('[data-action]')) {
  if (button.dataset.action === 'zoom-in') button.addEventListener('click', () => canvasManager.setZoom(10));
  if (button.dataset.action === 'zoom-out') button.addEventListener('click', () => canvasManager.setZoom(-10));
  if (button.dataset.action === 'fit') button.addEventListener('click', () => { canvasManager.fit(); showToast('Canvas fitted to workspace'); });
  if (button.dataset.action === 'open') button.addEventListener('click', () => fileInput.click());
}

fileInput.addEventListener('change', ({ target }) => {
  const file = target.files?.[0];
  if (!file) return;
  canvasManager.load(file);
  emptyCanvas.hidden = true;
  mockArtboard.hidden = true;
  document.querySelector('#document-name').textContent = file.name;
  document.querySelector('#save-state').textContent = 'Local preview';
  statusMessage.textContent = 'Image loaded — preview mode';
  showToast(`${file.name} added to the canvas`);
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); fileInput.click(); }
  if (event.key.toLowerCase() === 'b') document.querySelector('[data-tool="brush"]')?.click();
  if (event.key.toLowerCase() === 'v') document.querySelector('[data-tool="select"]')?.click();
  if (event.key.toLowerCase() === 'c') document.querySelector('[data-tool="crop"]')?.click();
});

function updateZoom(delta) {
  canvasManager.setZoom(delta);
}

function renderZoom() { zoomValue.textContent = `${appState.zoom}%`; }
document.addEventListener('appstatechange', renderZoom);
renderZoom();

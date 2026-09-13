import { appState, setState } from './app-state.js';
import { initThemeManager } from './theme-manager.js';
import { initUI, showToast } from './ui-manager.js';
import { CanvasManager } from './canvas-manager.js';
import { bindTransformTools } from './transform-tools.js';
import { CropTool } from './crop-tool.js';
import { initResizeTool } from './resize-tool.js';
import { LayerManager } from './layer-manager.js';
import { ObjectManager } from './object-manager.js';
import { ComparisonTool } from './comparison-tool.js';
import { AdjustmentsManager } from './adjustments-manager.js';
import { ApiClient } from './api-client.js';

initThemeManager();
initUI();

const fileInput = document.querySelector('#file-input');
const emptyCanvas = document.querySelector('#empty-canvas');
const mockArtboard = document.querySelector('#mock-artboard');
const statusMessage = document.querySelector('#status-message');
const canvasManager = new CanvasManager(document.querySelector('#image-canvas'), document.querySelector('#canvas-card'));
const apiClient = new ApiClient();
bindTransformTools(canvasManager, showToast);
const cropTool = new CropTool(canvasManager, document.querySelector('#canvas-card'), showToast);
initResizeTool(canvasManager, showToast);
const layerManager = new LayerManager({ list: document.querySelector('#layers-list'), empty: document.querySelector('#layers-empty'), count: document.querySelector('#layer-count'), showToast });
const objectManager = new ObjectManager(document.querySelector('#object-canvas'), layerManager, showToast);
new ComparisonTool(canvasManager, showToast);
new AdjustmentsManager({ canvasManager, apiClient, showToast });
document.querySelectorAll('[data-tool="brush"], [data-tool="eraser"], [data-tool="shape"], [data-tool="text"]').forEach((button) => button.addEventListener('click', () => objectManager.pointerDownConfigure()));
objectManager.setInteractive(true);
document.addEventListener('appstatechange', ({ detail }) => objectManager.setInteractive(['select', 'brush', 'eraser', 'shape', 'text'].includes(detail.activeTool)));
document.querySelectorAll('[data-action="add-layer"]').forEach((button) => button.addEventListener('click', () => { layerManager.add('shape'); showToast('Empty layer added'); }));
document.querySelector('#crop-overlay').addEventListener('pointerdown', (event) => cropTool.onPointerDown(event));
document.querySelector('#crop-overlay').addEventListener('pointermove', (event) => cropTool.onPointerMove(event));
document.querySelector('#crop-overlay').addEventListener('pointerup', () => cropTool.stopDrag());

const canvasViewActions = {
  'zoom-in': () => canvasManager.zoomStep(10),
  'zoom-out': () => canvasManager.zoomStep(-10),
  'zoom-reset': () => canvasManager.setHundredPercent(),
  'zoom-100': () => canvasManager.setHundredPercent(),
  'zoom-actual': () => canvasManager.setActualPixels(),
  'fit': () => { canvasManager.fit(); showToast('Canvas fitted to workspace'); },
  'fit-width': () => { canvasManager.fitWidth(); showToast('Canvas fitted to width'); },
  'fullscreen': () => canvasManager.toggleFullscreen(),
  'open': () => fileInput.click(),
};
for (const button of document.querySelectorAll('[data-action]')) {
  const action = canvasViewActions[button.dataset.action];
  if (action) button.addEventListener('click', action);
}

fileInput.addEventListener('change', async ({ target }) => {
  const file = target.files?.[0];
  if (!file) return;
  statusMessage.textContent = 'Uploading image…';
  showToast('Uploading image to IntelliCanvas API…');
  try {
    const image = await apiClient.upload(file);
    await canvasManager.loadFromUrl(apiClient.contentUrl(image.image_id), image);
    layerManager.addImage(image.original_filename);
    emptyCanvas.hidden = true;
    mockArtboard.hidden = true;
    document.querySelector('#document-name').textContent = image.original_filename;
    document.querySelector('#canvas-size').textContent = `${image.width ?? canvasManager.getSourceDimensions().width} × ${image.height ?? canvasManager.getSourceDimensions().height}`;
    document.querySelector('#save-state').textContent = 'Saved in API session';
    statusMessage.textContent = 'Image loaded — backend session ready';
    showToast(`${image.original_filename} uploaded successfully`);
  } catch (error) {
    statusMessage.textContent = 'Upload failed';
    showToast(error.message);
  } finally {
    target.value = '';
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); fileInput.click(); }
  if (event.key === '+' || event.key === '=') canvasManager.zoomStep(10);
  if (event.key === '-' || event.key === '_') canvasManager.zoomStep(-10);
  if (event.key === '0') { canvasManager.fit(); showToast('Canvas fitted to workspace'); }
  if (event.key === '1') canvasManager.setHundredPercent();
  if (event.key.toLowerCase() === 'b') document.querySelector('[data-tool="brush"]')?.click();
  if (event.key.toLowerCase() === 'v') document.querySelector('[data-tool="select"]')?.click();
  if (event.key.toLowerCase() === 'c') document.querySelector('[data-tool="crop"]')?.click();
});

function updateZoom(delta) {
  canvasManager.setZoom(delta);
}

function renderZoom() {
  document.querySelectorAll('[data-zoom-display]').forEach((element) => { element.textContent = `${appState.zoom}%`; });
}
document.addEventListener('appstatechange', ({ detail }) => {
  document.body.dataset.activeTool = detail.activeTool || 'select';
  renderZoom();
});
document.body.dataset.activeTool = appState.activeTool;
renderZoom();

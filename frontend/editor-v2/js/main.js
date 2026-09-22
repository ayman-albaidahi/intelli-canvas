import { appState, setState } from './app-state.js';
import { initThemeManager } from './theme-manager.js';
import { initUI, initDialogEscape, initDialogFocusTrap, setEditorReady, showToast } from './ui-manager.js';
import { CanvasManager } from './canvas-manager.js';
import { bindTransformTools } from './transform-tools.js';
import { CropTool } from './crop-tool.js';
import { initResizeTool } from './resize-tool.js';
import { LayerManager } from './layer-manager.js';
import { ObjectManager } from './object-manager.js';
import { ComparisonTool } from './comparison-tool.js';
import { AdjustmentsManager } from './adjustments-manager.js';
import { FiltersManager } from './filters-manager.js';
import { HistoryManager } from './history-manager.js';
import { ExportManager } from './export-manager.js';
import { BackgroundManager } from './background-manager.js';
import { AnalysisManager } from './analysis-manager.js';
import { PipelineManager } from './pipeline-manager.js';
import { SmartCropManager } from './smart-crop-manager.js';
import { ApiClient } from './api-client.js';

initThemeManager();
initUI();
// Dialogs must trap focus and close on Escape before any other Escape handler
// claims the key, so they are initialised alongside the rest of the chrome.
initDialogEscape();
initDialogFocusTrap();

const fileInput = document.querySelector('#file-input');
const emptyCanvas = document.querySelector('#empty-canvas');
const statusMessage = document.querySelector('#status-message');
const canvasManager = new CanvasManager(document.querySelector('#image-canvas'), document.querySelector('#canvas-card'));
const apiClient = new ApiClient();
bindTransformTools(canvasManager, apiClient, showToast);
const cropTool = new CropTool(canvasManager, document.querySelector('#canvas-card'), apiClient, showToast);
initResizeTool(canvasManager, apiClient, showToast);
const objectManager = new ObjectManager(document.querySelector('#object-canvas'), showToast, canvasManager);
objectManager.onSelectionChange = (id) => { setState({ selectedObjectId: id }); };
const layerManager = new LayerManager(objectManager, { list: document.querySelector('#layers-list'), empty: document.querySelector('#layers-empty'), count: document.querySelector('#layer-count'), showToast });
const refreshLayerPanel = objectManager.onChange;
let layerSaveTimer = null;
objectManager.onChange = () => {
  refreshLayerPanel?.();
  clearTimeout(layerSaveTimer);
  layerSaveTimer = setTimeout(() => {
    if (!apiClient.imageId) return;
    apiClient.saveLayers(objectManager.serializeLayers())
      .then((saved) => objectManager.applyPersistedLayers(saved))
      .catch((error) => showToast(error.message));
  }, 250);
};
async function restoreLayers() {
  if (!apiClient.imageId) return;
  try {
    await objectManager.loadLayers(await apiClient.layers());
  } catch (error) { showToast(error.message); }
}
new ComparisonTool(canvasManager, showToast);
new AdjustmentsManager({ canvasManager, apiClient, showToast });
new FiltersManager({ canvasManager, apiClient, showToast });
const backgroundManager = new BackgroundManager({ canvasManager, apiClient, objectManager, showToast });
const historyManager = new HistoryManager({ canvasManager, apiClient, showToast });
new ExportManager({ canvasManager, apiClient, objectManager, showToast });
const analysisManager = new AnalysisManager({ canvasManager, apiClient, showToast });
new PipelineManager({ apiClient, canvasManager, showToast });
const smartCropManager = new SmartCropManager({ canvasManager, apiClient, showToast });
objectManager.setInteractive(true);
document.addEventListener('appstatechange', ({ detail }) => objectManager.setInteractive(['select', 'brush', 'eraser', 'shape', 'text'].includes(detail.activeTool)));
document.querySelectorAll('[data-action="add-layer"]').forEach((button) => button.remove());
document.querySelector('[data-action="add-image-layer"]')?.addEventListener('click', () => document.querySelector('#layer-image-input').click());
document.querySelector('[data-action="add-shape-layer"]')?.addEventListener('click', () => { document.querySelector('[data-tool="shape"]').click(); showToast('Drag on the canvas to draw the shape'); });
document.querySelector('[data-action="add-text-layer"]')?.addEventListener('click', () => { document.querySelector('[data-tool="text"]').click(); showToast('Click on the canvas to place the text'); });
document.querySelector('#layer-image-input')?.addEventListener('change', ({ target }) => {
  const file = target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const img = new Image();
    img.addEventListener('load', () => objectManager.addImageLayer(img, file.name));
    img.src = reader.result;
  });
  reader.readAsDataURL(file);
  target.value = '';
});
const cropOverlay = document.querySelector('#crop-overlay');
cropOverlay.addEventListener('pointerdown', (event) => cropTool.onPointerDown(event));
cropOverlay.addEventListener('pointermove', (event) => cropTool.onPointerMove(event));
cropOverlay.addEventListener('pointerup', () => cropTool.stopDrag());
// A cancelled drag (system gesture, window blur) must not leave the crop tool
// mid-resize, or the next pointerdown would resume a drag that never ended.
cropOverlay.addEventListener('pointercancel', () => cropTool.stopDrag());

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

// A second upload started before the first finished would race: whichever
// response lands last wins apiClient.imageId, and the canvas load guard can
// disagree about which image is actually displayed. The flag makes a
// mid-flight upload a no-op instead.
let uploading = false;

async function uploadImageFile(file) {
  if (uploading) return;
  uploading = true;
  // The dropzone and the file input share this path, so both triggers are
  // disabled for the duration — the user cannot start a second upload while
  // the first is still in flight.
  const openers = document.querySelectorAll('[data-action="open"], #file-input');
  openers.forEach((el) => { el.disabled = true; });
  statusMessage.textContent = 'Uploading image…';
  showToast('Uploading image to IntelliCanvas API…');
  try {
    const image = await apiClient.upload(file);
    await canvasManager.loadFromUrl(apiClient.contentUrl(image.image_id), image);
    await restoreLayers();
    analysisManager.reset();
    smartCropManager.resetPreviewOnly();
    setState({ hasImage: true, selectedObjectId: null });
    setEditorReady(true);
    emptyCanvas.hidden = true;
    document.querySelector('#document-name').textContent = image.original_filename;
    document.querySelector('#canvas-size').textContent = `${image.width ?? canvasManager.getSourceDimensions().width} × ${image.height ?? canvasManager.getSourceDimensions().height}`;
    document.querySelector('#save-state').textContent = 'Saved in API session';
    statusMessage.textContent = 'Image loaded — backend session ready';
    showToast(`${image.original_filename} uploaded successfully`);
  } catch (error) {
    setState({ hasImage: false, selectedObjectId: null });
    setEditorReady(false);
    statusMessage.textContent = error.message.startsWith('Could not reach') ? 'Backend offline' : 'Upload failed';
    showToast(error.message);
  } finally {
    uploading = false;
    openers.forEach((el) => { el.disabled = false; });
  }
}

fileInput.addEventListener('change', ({ target }) => {
  const file = target.files?.[0];
  if (!file) return;
  uploadImageFile(file);
  target.value = '';
});
document.addEventListener('ic-operation', restoreLayers);

const canvasZone = document.querySelector('#canvas-zone');
['dragenter', 'dragover'].forEach((type) => canvasZone.addEventListener(type, (event) => {
  event.preventDefault();
  canvasZone.classList.add('is-drop-target');
}));
canvasZone.addEventListener('dragleave', (event) => {
  if (event.target === canvasZone) canvasZone.classList.remove('is-drop-target');
});
canvasZone.addEventListener('drop', (event) => {
  event.preventDefault();
  canvasZone.classList.remove('is-drop-target');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return showToast('Drop an image file (PNG, JPG, WEBP or BMP)');
  uploadImageFile(file);
});

const TOOL_SHORTCUTS = {
  v: 'select', m: 'move', c: 'crop', b: 'brush',
  e: 'eraser', u: 'shape', t: 'text',
};

document.addEventListener('keydown', (event) => {
  const target = event.target;
  // Typing into a field must not trigger tool shortcuts. contentEditable
  // covers the rename input, which is not a real input element.
  if (target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;

  // Undo/redo is the most expected editor shortcut and the plumbing already
  // exists in transform-tools; it just was not wired to the keyboard.
  const isMod = event.metaKey || event.ctrlKey;
  if (isMod && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    const action = event.shiftKey ? 'redo' : 'undo';
    document.querySelector(`[data-action="${action}"]`)?.click();
    return;
  }
  if (isMod && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    document.querySelector('[data-action="redo"]')?.click();
    return;
  }
  if (isMod && event.key.toLowerCase() === 'o') { event.preventDefault(); fileInput.click(); return; }
  // Anything past this point is a single-key shortcut and must not fire while
  // a modifier is held, so Ctrl+S and friends do not also switch tools.
  if (isMod || event.altKey) return;

  if (event.key === '+' || event.key === '=') canvasManager.zoomStep(10);
  if (event.key === '-' || event.key === '_') canvasManager.zoomStep(-10);
  if (event.key === '0') { canvasManager.fit(); showToast('Canvas fitted to workspace'); }
  if (event.key === '1') canvasManager.setHundredPercent();
  const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
  if (tool) document.querySelector(`[data-tool="${tool}"]`)?.click();
});

function renderZoom() {
  // Before any image is loaded there is nothing to zoom, so reporting a
  // percentage would describe a canvas that does not exist.
  const value = canvasManager.hasImage() ? `${appState.zoom}%` : '—';
  document.querySelectorAll('[data-zoom-display]').forEach((element) => { element.textContent = value; });
}
document.addEventListener('appstatechange', ({ detail }) => {
  document.body.dataset.activeTool = detail.activeTool || 'select';
  renderZoom();
});
document.body.dataset.activeTool = appState.activeTool;
renderZoom();

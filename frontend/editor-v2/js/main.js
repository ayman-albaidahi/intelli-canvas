import { appState, setState } from './app-state.js';
import { initKeyboardShortcuts } from './keyboard-shortcuts.js';
import { createUploadManager } from './upload-manager.js';
import { initThemeManager } from './theme-manager.js';
import { initUI, initDialogEscape, initDialogFocusTrap, onPanelOpened, setEditorReady, showToast } from './ui-manager.js';
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
import { SmartCropManager } from './smart-crop-manager.js';
import { ApiClient } from './api-client.js';
import { renderImageContextSummary } from './inspector-context-view.js';
import { AuthManager } from './auth-manager.js';
import { bus, events } from './lib/events.js';

const apiClient = new ApiClient();
const authManager = new AuthManager({ apiClient });
const authenticatedUser = await authManager.start();

if (authenticatedUser) {
initThemeManager();
initUI();
// Dialogs must trap focus and close on Escape before any other Escape handler
// claims the key, so they are initialised alongside the rest of the chrome.
initDialogEscape();
initDialogFocusTrap();
renderImageContextSummary();

function bindDrawingControls() {
  const controls = [
    ['brush-size', 'brush-size-value', (value) => value],
    ['brush-opacity', 'brush-opacity-value', (value) => `${value}%`],
    ['eraser-size', 'eraser-size-value', (value) => value],
    ['eraser-opacity', 'eraser-opacity-value', (value) => `${value}%`],
  ];
  controls.forEach(([inputId, outputId, format]) => {
    const input = document.querySelector(`#${inputId}`);
    const output = document.querySelector(`#${outputId}`);
    if (!input || !output) return;
    const render = () => { output.value = input.value; output.textContent = format(input.value); };
    input.addEventListener('input', render);
    render();
  });
  document.querySelector('#brush-reset')?.addEventListener('click', () => {
    const size = document.querySelector('#brush-size');
    const opacity = document.querySelector('#brush-opacity');
    size.value = '8';
    opacity.value = '100';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    opacity.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.querySelector('#eraser-reset')?.addEventListener('click', () => {
    const size = document.querySelector('#eraser-size');
    const opacity = document.querySelector('#eraser-opacity');
    size.value = '8';
    opacity.value = '100';
    size.dispatchEvent(new Event('input', { bubbles: true }));
    opacity.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
bindDrawingControls();

const fileInput = document.querySelector('#file-input');
const emptyCanvas = document.querySelector('#empty-canvas');
const statusMessage = document.querySelector('#status-message');
const canvasManager = new CanvasManager(document.querySelector('#image-canvas'), document.querySelector('#canvas-card'));
bindTransformTools(canvasManager, apiClient, showToast);
const cropTool = new CropTool(canvasManager, document.querySelector('#canvas-card'), apiClient, showToast);
initResizeTool(canvasManager, apiClient, showToast);
const objectManager = new ObjectManager(document.querySelector('#object-canvas'), showToast, canvasManager);
new LayerManager(objectManager, { list: document.querySelector('#layers-list'), empty: document.querySelector('#layers-empty'), count: document.querySelector('#layer-count'), showToast });
const refreshSelectionState = objectManager.onSelectionChange;
objectManager.onSelectionChange = (id) => {
  refreshSelectionState?.(id);
  setState({ selectedObjectId: id });
};
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
new HistoryManager({ canvasManager, apiClient, showToast });
new ExportManager({ canvasManager, apiClient, objectManager, showToast });

// The three heaviest panels mount on first open rather than at boot: before
// an image is uploaded, nobody needs the background library fetch, the
// pipeline state refresh, or the analysis bindings, and shipping their
// modules eagerly paid for them on every page load. The activators run
// once, driven by ui-manager's onPanelOpened hook; the module loads and the
// manager constructs itself with the same constructor it used before.
let analysisManager = null;
onPanelOpened('insights', async () => {
  const { AnalysisManager } = await import('./analysis-manager.js');
  analysisManager = new AnalysisManager({ canvasManager, apiClient, showToast });
});
onPanelOpened('pipeline', async () => {
  const { PipelineManager } = await import('./pipeline-manager.js');
  new PipelineManager({ apiClient, canvasManager, showToast });
});
onPanelOpened('background', async () => {
  const { BackgroundManager } = await import('./background-manager.js');
  new BackgroundManager({ canvasManager, apiClient, objectManager, showToast });
});
const smartCropManager = new SmartCropManager({ canvasManager, apiClient, showToast });
objectManager.setInteractive(true);
bus.on(events.appStateChange, (state) => objectManager.setInteractive(['select', 'brush', 'eraser', 'shape', 'text'].includes(state.activeTool)));
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

const uploadManager = createUploadManager({
  apiClient,
  canvasManager,
  restoreLayers,
  // analysisManager may still be the pending lazy mount when an upload
  // lands first; resetting a panel that was never opened is vacuous, so a
  // null-safe facade is the honest wiring.
  analysisManager: { reset: () => analysisManager?.reset() },
  smartCropManager,
  setState,
  setEditorReady,
  renderImageContextSummary,
  showToast,
  fileInput,
  statusMessage,
  emptyCanvas,
  documentName: document.querySelector('#document-name'),
  canvasSize: document.querySelector('#canvas-size'),
  saveState: document.querySelector('#save-state'),
});
uploadManager.bindDropZone(document.querySelector('#canvas-zone'));

initKeyboardShortcuts({ canvasManager, fileInput, showToast });

function renderZoom() {
  // Before any image is loaded there is nothing to zoom, so reporting a
  // percentage would describe a canvas that does not exist.
  const value = canvasManager.hasImage() ? `${appState.zoom}%` : '—';
  document.querySelectorAll('[data-zoom-display]').forEach((element) => { element.textContent = value; });
}
bus.on(events.appStateChange, (state) => {
  document.body.dataset.activeTool = state.activeTool || 'select';
  renderZoom();
});
document.body.dataset.activeTool = appState.activeTool;
renderZoom();
}

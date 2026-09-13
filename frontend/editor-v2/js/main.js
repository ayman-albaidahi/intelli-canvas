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

const zoomValue = document.querySelector('#zoom-value');
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
new AdjustmentsManager(canvasManager, showToast);
document.querySelectorAll('[data-tool="brush"], [data-tool="eraser"], [data-tool="shape"], [data-tool="text"]').forEach((button) => button.addEventListener('click', () => objectManager.pointerDownConfigure()));
objectManager.setInteractive(true);
document.addEventListener('appstatechange', ({ detail }) => objectManager.setInteractive(['select', 'brush', 'eraser', 'shape', 'text'].includes(detail.activeTool)));
document.querySelectorAll('[data-action="add-layer"]').forEach((button) => button.addEventListener('click', () => { layerManager.add('shape'); showToast('Empty layer added'); }));
document.querySelector('#crop-overlay').addEventListener('pointerdown', (event) => cropTool.onPointerDown(event));
document.querySelector('#crop-overlay').addEventListener('pointermove', (event) => cropTool.onPointerMove(event));
document.querySelector('#crop-overlay').addEventListener('pointerup', () => cropTool.stopDrag());

for (const button of document.querySelectorAll('[data-action]')) {
  if (button.dataset.action === 'zoom-in') button.addEventListener('click', () => canvasManager.setZoom(10));
  if (button.dataset.action === 'zoom-out') button.addEventListener('click', () => canvasManager.setZoom(-10));
  if (button.dataset.action === 'fit') button.addEventListener('click', () => { canvasManager.fit(); showToast('Canvas fitted to workspace'); });
  if (button.dataset.action === 'open') button.addEventListener('click', () => fileInput.click());
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

document.querySelector('[data-action="process-grayscale"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  button.disabled = true;
  statusMessage.textContent = 'Python is processing grayscale…';
  showToast('Sending grayscale operation to Python…');
  try {
    const result = await apiClient.process('grayscale');
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = 'Grayscale processed by Python';
    showToast('Grayscale completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('[data-action="process-brightness"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  const value = Number(document.querySelector('[data-adjustment="brightness"]')?.value || 100);
  button.disabled = true;
  statusMessage.textContent = 'Python is processing brightness…';
  showToast(`Sending brightness ${value}% to Python…`);
  try {
    const result = await apiClient.process('brightness', { value });
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = `Brightness ${value}% processed by Python`;
    showToast('Brightness completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python brightness processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('[data-action="process-contrast"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  const value = Number(document.querySelector('[data-adjustment="contrast"]')?.value || 100);
  button.disabled = true;
  statusMessage.textContent = 'Python is processing contrast…';
  showToast(`Sending contrast ${value}% to Python…`);
  try {
    const result = await apiClient.process('contrast', { value });
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = `Contrast ${value}% processed by Python`;
    showToast('Contrast completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python contrast processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('[data-action="process-blur"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  const value = Number(document.querySelector('[data-adjustment="blur"]')?.value || 0);
  button.disabled = true;
  statusMessage.textContent = 'Python is processing blur…';
  showToast(`Sending blur ${value}px to Python…`);
  try {
    const result = await apiClient.process('blur', { value });
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = `Blur ${value}px processed by Python`;
    showToast('Blur completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python blur processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('[data-action="process-sharpen"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  const value = Number(document.querySelector('[data-adjustment="sharpen"]')?.value || 0);
  button.disabled = true;
  statusMessage.textContent = 'Python is processing sharpen…';
  showToast(`Sending sharpen ${value}/5 to Python…`);
  try {
    const result = await apiClient.process('sharpen', { value });
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = `Sharpen ${value}/5 processed by Python`;
    showToast('Sharpen completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python sharpen processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('[data-action="process-saturation"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  const value = Number(document.querySelector('[data-adjustment="saturation"]')?.value || 100);
  button.disabled = true;
  statusMessage.textContent = 'Python is processing color saturation…';
  showToast(`Sending saturation ${value}% to Python…`);
  try {
    const result = await apiClient.process('saturation', { value });
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = `Saturation ${value}% processed by Python`;
    showToast('Color saturation completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python saturation processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('[data-action="process-negative"]')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!apiClient.imageId) return showToast('Upload an image before processing it');
  button.disabled = true;
  statusMessage.textContent = 'Python is processing negative…';
  showToast('Sending negative operation to Python…');
  try {
    const result = await apiClient.process('negative');
    await canvasManager.loadFromUrl(apiClient.contentUrl(result.image_id), result);
    const checkbox = document.querySelector('[data-adjustment="negative"]');
    if (checkbox) { checkbox.checked = false; checkbox.dispatchEvent(new Event('input')); }
    document.querySelector('#save-state').textContent = 'Processed by Python';
    statusMessage.textContent = 'Negative processed by Python';
    showToast('Negative completed by Python');
  } catch (error) {
    statusMessage.textContent = 'Python negative processing failed';
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
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
